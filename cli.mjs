#!/usr/bin/env bun

import { Command } from 'commander';
import { $ } from 'zx';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));

const program = new Command();
program.version(packageJson.version);
program.description(packageJson.description);

const commandsDir = join(__dirname, 'commands');

try {
  const commandDirs = readdirSync(commandsDir).filter(dir => {
    const dirPath = join(commandsDir, dir);
    return statSync(dirPath).isDirectory();
  });

  for (const dir of commandDirs) {
    const scriptPath = join(commandsDir, dir, 'script.mjs');
    const scriptContent = readFileSync(scriptPath, 'utf-8');
    
    // Extract @description from JSDoc comments
    const descriptionMatch = scriptContent.match(/@description\s+(.+)/);
    const description = descriptionMatch 
      ? descriptionMatch[1].trim()
      : `Execute ${dir} command`;

    program
      .command(dir)
      .argument('[args...]', 'Optional arguments for the command')
      .description(description)
      .allowUnknownOption()
      .action(async (...args) => {
        const { default: run } = await import(`./commands/${dir}/script.mjs`);
        // Pass all arguments to the command
        await run(args);
      });
  }
} catch (error) {
  console.error('Failed to load commands:', error.message);
  process.exit(1);
}

program.parse();
