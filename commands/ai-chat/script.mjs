#!/usr/bin/env bun

import { $ } from 'zx';
import { launch } from '../../lib/ai/index.mjs';

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
    console.log('Usage: qk ai-chat "Your prompt here"');
    process.exit(1);
  }

  try {
    const response = await launch(prompt, {
      temperature: 0.7,
      maxTokens: 100,
    });

    console.log('\nAI Response:');
    console.log(response.content);
    console.log('\nUsage:');
    console.log(`  Total tokens: ${response.usage.totalTokens}`);
    console.log(`  Model: ${response.model}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

export default run;
