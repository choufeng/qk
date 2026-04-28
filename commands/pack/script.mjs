#!/usr/bin/env bun

import { loadConfig, executeChain, getAvailableConfigs } from './functions.mjs';
import { processManager } from '../../lib/process-manager.mjs';
import { select } from '@inquirer/prompts';
import { $ } from 'zx';

async function promptBranchSwitch(item) {
  try {
    const branchOutput = await $`git for-each-ref refs/heads/ --sort=-committerdate --format=%(refname:short)|%(subject)`.text();
    const currentBranch = (await $`git branch --show-current`.text()).trim();

    const branches = branchOutput
      .split('\n')
      .map(line => {
        const [name, ...subjectParts] = line.split('|');
        return { name: name.trim(), subject: subjectParts.join('|').trim() };
      })
      .filter(b => b.name && b.name !== currentBranch);

    const choices = [
      { name: '(skip - stay on current branch)', value: null },
      ...branches.map(b => ({
        name: `${b.name}  ${b.subject ? `— ${b.subject}` : ''}`,
        value: b.name
      }))
    ];

    const selected = await select({
      message: `[${item.name}] Switch branch before next step?`,
      choices
    });

    if (!selected) return;

    const statusOutput = await $`git status --porcelain`.text();
    if (statusOutput.trim()) {
      throw new Error(
        'Working tree is dirty. Please commit or stash your changes before switching branches.'
      );
    }

    await $`git checkout ${selected}`;
    console.log(`🌿 Switched to branch: ${selected}`);
  } catch (error) {
    if (error.name === 'ExitPromptError' || error.message?.includes('User force closed')) {
      console.log('\nPrompt cancelled.');
      process.exit(0);
    }
    throw error;
  }
}

/**
 * @description Chain-build packages and apps based on dependency order
 */
export async function run(args) {
  // 注册进程管理器的清理处理器
  processManager.registerCleanupHandlers();

  const checkBranch = process.argv.includes('--c');

  // 扁平化参数并过滤有效参数
  const flatArgs = args.flat();
  const validArgs = flatArgs.filter(arg =>
    typeof arg === 'string' &&
    !arg.includes('Command') &&
    !arg.startsWith('{')
  );

  // 检查参数
  let configName;

  if (validArgs.length === 0) {
    const availableConfigs = await getAvailableConfigs();
    
    if (availableConfigs.length === 0) {
      console.error('❌ Please provide a configuration name or ensure ~/.config/qk/ has valid configurations');
      console.log('');
      console.log('Usage: qk pack <config-name>');
      console.log('');
      console.log('Examples:');
      console.log('  qk pack example    # Use ~/.config/qk/pack-example.json');
      console.log('  qk pack my-config  # Use ~/.config/qk/pack-my-config.json');
      process.exit(1);
    }

    try {
      configName = await select({
        message: 'Select a configuration to pack:',
        choices: availableConfigs.map(name => ({ name, value: name }))
      });
    } catch (error) {
      // User cancelled the prompt (e.g., via Ctrl+C)
      if (error.name === 'ExitPromptError' || error.message.includes('User force closed')) {
        console.log('\nPrompt cancelled.');
        process.exit(0);
      }
      throw error;
    }
  } else {
    configName = validArgs[0];
  }

  console.log('🚀 Starting pack chain execution');
  console.log(`📄 Configuration: pack-${configName}.json`);
  console.log('');

  try {
    // 加载配置
    const items = await loadConfig(configName);
    console.log(`📦 Loaded ${items.length} items`);
    console.log('');

    // 启动会话（创建持久化文件）
    processManager.startSession(configName);

    // 执行链式打包
    await executeChain(items, {
      onPackageComplete: checkBranch ? promptBranchSwitch : undefined
    });

    // 正常完成时也清理一下
    if (processManager.getActiveProcessCount() > 0) {
      console.log('🧹 Final cleanup of remaining processes...');
      processManager.cleanup();
    }
  } catch (error) {
    console.error('');
    console.error(`❌ Error: ${error.message}`);

    // 错误时清理进程
    if (processManager.getActiveProcessCount() > 0) {
      console.log('🧹 Cleaning up processes due to error...');
      processManager.cleanup();
    }

    // 结束会话（标记结束时间）
    processManager.endSession();

    process.exit(1);
  }

  // 结束会话（标记结束时间）
  processManager.endSession();
}

export default run;
