#!/usr/bin/env bun

import { ConfigManager } from '../config/index.mjs'
import { validateOptions, formatError } from './utils.mjs'

/**
 * Launch AI completion using the configured provider
 * Provider is read from ~/.config/qk/config.yaml (ai.provider)
 * @param {string} prompt - User prompt
 * @param {import('./types.mjs').LaunchOptions} options - Launch options
 * @returns {Promise<import('./types.mjs').AIResponse>} AI response
 */
export async function launch(prompt, options = {}) {
  validateOptions(prompt, options)

  const config = new ConfigManager()
  const provider = config.get('ai.provider') // 'ollama' | 'vertex'
  const aiConfig = config.get('ai')

  try {
    const { launch: providerLaunch } = await import(`./providers/${provider}.mjs`)
    return await providerLaunch(prompt, options, aiConfig)
  } catch (error) {
    throw new Error(formatError(error))
  }
}

/**
 * Launch with streaming support
 * @param {string} prompt - User prompt
 * @param {import('./types.mjs').LaunchOptions} options - Launch options
 * @returns {AsyncGenerator<import('./types.mjs').StreamChunk>} Stream chunks
 */
export async function* launchStream(prompt, options = {}) {
  validateOptions(prompt, options)

  const config = new ConfigManager()
  const provider = config.get('ai.provider')
  const aiConfig = config.get('ai')

  try {
    const providerModule = await import(`./providers/${provider}.mjs`)
    if (providerModule.launchStream) {
      yield* providerModule.launchStream(prompt, options, aiConfig)
    } else {
      // Fallback: wrap non-streaming response as single chunk
      const response = await providerModule.launch(prompt, options, aiConfig)
      yield { content: response.content, done: false }
      yield { content: '', done: true }
    }
  } catch (error) {
    throw new Error(formatError(error))
  }
}

export default { launch, launchStream }
