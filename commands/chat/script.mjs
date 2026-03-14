#!/usr/bin/env bun

import chalk from 'chalk';
import { $ } from 'zx';
import { launch } from '../../lib/ai/index.mjs';

function startSpinner(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  process.stdout.write(`${frames[i]} ${message}`)
  return setInterval(() => {
    i = (i + 1) % frames.length
    process.stdout.write(`\r${frames[i]} ${message}`)
  }, 80)
}

function stopSpinner(handle) {
  clearInterval(handle)
  process.stdout.write('\r\x1b[K')
}

/**
 * @description Test AI integration with LangChain
 */
export async function run(args) {
  // Flatten nested arrays and filter out Commander objects
  const flatArgs = args.flat();
  const promptArgs = flatArgs.filter(arg => 
    typeof arg === 'string' && 
    !arg.includes('Command') &&
    !arg.startsWith('{')
  );

  const prompt = promptArgs.join(' ');

  if (!prompt || prompt.trim() === '') {
    console.error('Please provide a prompt');
    console.log('Usage: qk chat "Your prompt here"');
    process.exit(1);
  }

  const spinner = startSpinner('AI is thinking...')
  
  try {
    const response = await launch(prompt, {
      temperature: 0.7,
      maxTokens: 100,
    });

    stopSpinner(spinner)

    console.log(`\n${chalk.bold.cyan('🤖 AI Response:')}`);
    console.log(chalk.bold.green(response.content));
    console.log(`\n${chalk.dim.gray('─── Usage ───')}`);
    console.log(chalk.dim.gray(`  Total tokens: ${response.usage.totalTokens}`));
    console.log(chalk.dim.gray(`  Model: ${response.model}`));
  } catch (error) {
    stopSpinner(spinner)
    console.error('Error:', error.message);
    process.exit(1);
  }
}

export default run;
