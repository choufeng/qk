#!/usr/bin/env bun

/**
 * Provider default values for interactive set command
 */
export const PROVIDER_DEFAULTS = {
  ollama: {
    endpoint: 'http://localhost:11434',
    model: 'qwen3-coder-next:cloud',
  },
  vertex: {
    model: 'gemini-3-flash-preview',
    // Auth via env vars: GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION
  },
}

/**
 * Default configuration schema for qk
 */
export const DEFAULT_CONFIG = {
  ai: {
    provider: 'ollama',       // 'ollama' | 'vertex'
    ...PROVIDER_DEFAULTS,
  },
}

export default DEFAULT_CONFIG
