#!/usr/bin/env bun

/**
 * QK AI Library
 * 
 * A modular AI integration library built with LangChain.
 * Provides functions for launching AI completions and handling responses.
 * 
 * @module lib/ai
 */

export { default as types } from './types.mjs';
export { default as utils } from './utils.mjs';
export * from './launch.mjs';

/**
 * Re-export types for convenience
 */
export { LaunchOptions, StreamChunk, AIResponse } from './types.mjs';

/**
 * Re-export utils for convenience
 */
export { parseResponse, extractUsage, formatError, validateOptions } from './utils.mjs';
