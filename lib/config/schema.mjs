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
  litellm: {
    endpoint: 'http://localhost:4000',
    apiKey: '',
    model: 'claude-haiku-4-5',
  },
}

/**
 * Default configuration schema for qk
 */
export const DEFAULT_CONFIG = {
  ai: {
    provider: 'ollama',       // 'ollama' | 'vertex' | 'litellm'
    language: 'en',           // 'en' | 'zh-CN' | 'zh-TW'
    ...PROVIDER_DEFAULTS,
  },
  git: {
    useLazygit: true,
    autoCommit: false,
    autoPR: false,
    e2eTags: [],
    prLabels: [],
  },
}

export default DEFAULT_CONFIG
