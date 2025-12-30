#!/usr/bin/env bun

/**
 * @typedef {Object} LaunchOptions
 * @property {string} [model] - AI model to use (default: gpt-3.5-turbo)
 * @property {number} [temperature] - Temperature for AI (0.0-2.0, default: 0.7)
 * @property {number} [maxTokens] - Maximum tokens to generate (default: 2048)
 * @property {boolean} [stream] - Enable streaming response
 * @property {string} [systemPrompt] - System prompt for AI
 */

/**
 * @typedef {Object} StreamChunk
 * @property {string} content - Chunk content
 * @property {boolean} done - Whether streaming is complete
 */

/**
 * @typedef {Object} AIResponse
 * @property {string} content - AI response content
 * @property {Object} usage - Token usage
 * @property {string} model - Model used
 */

// Type exports for JSDoc
export const LaunchOptions = {};
export const StreamChunk = {};
export const AIResponse = {};

export default {
  LaunchOptions,
  StreamChunk,
  AIResponse,
};
