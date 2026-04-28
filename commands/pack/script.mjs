#!/usr/bin/env bun

import { loadConfig, executeChain, getAvailableConfigs, resolvePath } from './functions.mjs';
import { processManager } from '../../lib/process-manager.mjs';
import * as p from '@clack/prompts';
import { $ } from 'zx';

async function promptBranchSwitch(item) {
  const dir = resolvePath(item.dir);
  const git = $({ cwd: dir });

  const fmt = '%(refname:short)|%(subject)';
  const branchOutput = await git`git for-each-ref refs/heads/ --sort=-committerdate ${'--format=' + fmt}`.text();
  const currentBranch = (await git`git branch --show-current`.text()).trim();

  const branches = branchOutput
    .split('\n')
    .map(line => {
      const [name, ...subjectParts] = line.split('|');
      return { name: name.trim(), subject: subjectParts.join('|').trim() };
    })
    .filter(b => b.name && b.name !== currentBranch);

  const options = [
    { label: '(skip - stay on current branch)', value: null },
    ...branches.map(b => ({
      label: b.name,
      hint: b.subject || undefined,
      value: b.name,
    }))
  ];

  const selected = await p.select({
    message: `[${item.name}] Switch branch before next step?`,
    options,
  });
  if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0); }
  if (!selected) return;

  try {
    await git`git checkout ${selected}`;
    p.log.success(`Switched to branch: ${selected}`);
  } catch (checkoutError) {
    const isDirtyConflict = checkoutError.message?.includes('local changes') ||
      checkoutError.message?.includes('overwritten by checkout') ||
      checkoutError.message?.includes('Please commit');

    if (!isDirtyConflict) throw checkoutError;

    p.log.warn('Branch switch failed due to local changes.');
    const recovery = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'stash', label: 'Stash changes and switch' },
        { value: 'skip',  label: 'Skip (stay on current branch)' },
      ],
    });
    if (p.isCancel(recovery) || recovery === 'skip') return;

    await git`git stash --include-untracked`;
    await git`git checkout ${selected}`;
    p.log.success(`Switched to branch: ${selected}`);
    try {
      await git`git stash pop`;
    } catch {
      throw new Error(
        `Stash pop has conflicts on branch "${selected}". ` +
        `Resolve conflicts manually (git stash pop), then re-run qk pack.`
      );
    }
  }
}

/**
 * @description Chain-build packages and apps based on dependency order
 */
export async function run(args) {
  p.intro('QK · PACK');

  processManager.registerCleanupHandlers();

  const checkBranch = process.argv.includes('--c');

  const flatArgs = args.flat();
  const validArgs = flatArgs.filter(arg =>
    typeof arg === 'string' &&
    !arg.includes('Command') &&
    !arg.startsWith('{')
  );

  let configName;

  if (validArgs.length === 0) {
    const availableConfigs = await getAvailableConfigs();

    if (availableConfigs.length === 0) {
      p.cancel(
        'No configurations found.\n' +
        'Usage: qk pack <config-name>\n' +
        'Example: qk pack example  →  ~/.config/qk/pack-example.json'
      );
      process.exit(1);
    }

    configName = await p.select({
      message: 'Select a configuration to pack:',
      options: availableConfigs.map(name => ({ label: name, value: name })),
    });
    if (p.isCancel(configName)) { p.cancel('Cancelled.'); process.exit(0); }
  } else {
    configName = validArgs[0];
  }

  try {
    const items = await loadConfig(configName);
    p.log.info(`Configuration: pack-${configName}.json  (${items.length} items)`);

    processManager.startSession(configName);

    await executeChain(items, {
      onPackageComplete: checkBranch ? promptBranchSwitch : undefined
    });

    if (processManager.getActiveProcessCount() > 0) {
      p.log.step('Final cleanup of remaining processes...');
      processManager.cleanup();
    }
  } catch (error) {
    p.cancel(`Error: ${error.message}`);

    if (processManager.getActiveProcessCount() > 0) {
      p.log.step('Cleaning up processes...');
      processManager.cleanup();
    }

    processManager.endSession();
    process.exit(1);
  }

  processManager.endSession();
  p.outro('Pack chain complete.');
}

export default run;
