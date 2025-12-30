#!/usr/bin/env bun

/**
 * Parse AI response from different formats
 * @param {string} response - Raw response from AI
 * @returns {string} Parsed content
 */
export function parseResponse(response) {
  try {
    const parsed = JSON.parse(response);
    return parsed.content || parsed.text || parsed;
  } catch {
    return response;
  }
}

/**
 * Extract usage information from response
 * @param {string} response - Raw response from AI
 * @returns {Object|null} Usage info
 */
export function extractUsage(response) {
  try {
    const parsed = JSON.parse(response);
    return {
      promptTokens: parsed.usage?.prompt_tokens || 0,
      completionTokens: parsed.usage?.completion_tokens || 0,
      totalTokens: parsed.usage?.total_tokens || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Format error message for AI failures
 * @param {Error} error - Error object
 * @returns {string} Formatted error message
 */
export function formatError(error) {
  if (error.cause) {
    return `AI Error: ${error.message}\nCaused by: ${error.cause.message}`;
  }
  return `AI Error: ${error.message}`;
}

/**
 * Validate launch options
 * @param {string} prompt - User prompt
 * @param {import('./types.mjs').LaunchOptions} options - Launch options
 * @throws {Error} If validation fails
 */
export function validateOptions(prompt, options) {
  if (!prompt || prompt.trim() === '') {
    throw new Error('Prompt cannot be empty');
  }

  if (options.temperature !== undefined && 
      (options.temperature < 0 || options.temperature > 2)) {
    throw new Error('Temperature must be between 0 and 2');
  }

  if (options.maxTokens !== undefined && options.maxTokens <= 0) {
    throw new Error('maxTokens must be greater than 0');
  }
}

export default {
  parseResponse,
  extractUsage,
  formatError,
  validateOptions,
};
