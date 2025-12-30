#!/usr/bin/env bun

import { $ } from 'zx';
import { validateOptions, formatError } from './utils.mjs';

// Check if LangChain is available
let langchain;
try {
  // Try to import LangChain
  langchain = await import('langchain');
} catch {
  // LangChain not installed, provide fallback
  console.warn('LangChain not found, using fallback implementation');
}

/**
 * Launch AI completion with LangChain
 * @param {string} prompt - User prompt
 * @param {import('./types.mjs').LaunchOptions} options - Launch options
 * @returns {Promise<import('./types.mjs').AIResponse>} AI response
 */
export async function launch(prompt, options = {}) {
  validateOptions(prompt, options);

  const {
    model = 'gpt-3.5-turbo',
    temperature = 0.7,
    maxTokens = 2048,
    stream = false,
    systemPrompt = 'You are a helpful AI assistant.',
  } = options;

  try {
    if (langchain) {
      // Use LangChain if available
      return await launchWithLangChain(prompt, {
        model,
        temperature,
        maxTokens,
        stream,
        systemPrompt,
      });
    } else {
      // Fallback to simple implementation
      return await launchFallback(prompt, {
        model,
        temperature,
        maxTokens,
      });
    }
  } catch (error) {
    throw new Error(formatError(error));
  }
}

/**
 * Launch with LangChain integration
 * @param {string} prompt - User prompt
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} Response
 */
async function launchWithLangChain(prompt, config) {
  console.log(`Using LangChain with model: ${config.model}`);
  
  // Placeholder for LangChain implementation
  // This will be replaced with actual LangChain code
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    content: `LangChain response for: ${prompt}`,
    usage: {
      promptTokens: 50,
      completionTokens: 100,
      totalTokens: 150,
    },
    model: config.model,
  };
}

/**
 * Fallback implementation without LangChain
 * @param {string} prompt - User prompt
 * @param {Object} config - Configuration
 * @returns {Promise<Object>} Response
 */
async function launchFallback(prompt, config) {
  console.log(`Using fallback implementation with model: ${config.model}`);
  
  // Simple mock implementation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    content: `Fallback response for: ${prompt}`,
    usage: {
      promptTokens: 30,
      completionTokens: 60,
      totalTokens: 90,
    },
    model: config.model,
  };
}

/**
 * Launch with streaming support
 * @param {string} prompt - User prompt
 * @param {import('./types.mjs').LaunchOptions} options - Launch options
 * @returns {AsyncGenerator<import('./types.mjs').StreamChunk>} Stream chunks
 */
export async function* launchStream(prompt, options = {}) {
  validateOptions(prompt, options);

  const {
    model = 'gpt-3.5-turbo',
    temperature = 0.7,
    systemPrompt = 'You are a helpful AI assistant.',
  } = options;

  try {
    console.log(`Streaming with model: ${model}`);
    
    // Mock streaming implementation
    const chunks = [`This`, ` is`, ` a`, ` streaming`, ` response.`];
    
    for (const chunk of chunks) {
      yield {
        content: chunk,
        done: false,
      };
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    yield {
      content: '',
      done: true,
    };
  } catch (error) {
    throw new Error(formatError(error));
  }
}

export default {
  launch,
  launchStream,
};
