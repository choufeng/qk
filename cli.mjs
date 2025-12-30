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
    
    // 提取 JSDoc 中的 @description
    const descriptionMatch = scriptContent.match(/@description\s+(.+)/);
    const description = descriptionMatch 
      ? descriptionMatch[1].trim()
      : `执行 ${dir} 命令`;

    program
      .command(dir)
      .description(description)
      .action(async () => {
        const { default: run } = await import(`./commands/${dir}/script.mjs`);
        await run();
      });
  }
} catch (error) {
  console.error('加载命令失败:', error.message);
  process.exit(1);
}

program.parse();
