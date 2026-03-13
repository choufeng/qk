#!/usr/bin/env bun

/**
 * Default configuration schema for qk
 */
export const DEFAULT_CONFIG = {
  ai: {
    provider: 'ollama',       // 'ollama' | 'vertex'
    ollama: {
      endpoint: 'http://localhost:11434',
      model: 'qwen3-coder-next:cloud',
    },
    vertex: {
      model: 'gemini-3.1-flash-lite-preview',
      // Auth via env vars: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION
    },
  },
}

/**
 * Provider default values for interactive set command
 */
export const PROVIDER_DEFAULTS = {
  ollama: {
    endpoint: 'http://localhost:11434',
    model: 'qwen3-coder-next:cloud',
  },
  vertex: {
    model: 'gemini-3.1-flash-lite-preview',
  },
}

export default DEFAULT_CONFIG
