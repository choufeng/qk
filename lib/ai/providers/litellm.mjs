#!/usr/bin/env bun

import Anthropic from '@anthropic-ai/sdk'

/**
 * Launch AI completion using LiteLLM Proxy (Anthropic API style)
 * 
 * Connects to a self-hosted LiteLLM proxy that exposes the Anthropic Messages API.
 * Auth via apiKey in config (optional, depends on proxy setup).
 * 
 * Config example (~/.config/qk/config.yaml):
 *   ai:
 *     provider: litellm
 *     litellm:
 *       endpoint: http://localhost:4000
 *       apiKey: sk-xxx
 *       model: claude-sonnet-4-20250514
 * 
 * @param {string} prompt - User prompt
 * @param {Object} options - Launch options
 * @param {Object} aiConfig - AI config block from ConfigManager
 * @returns {Promise<import('../types.mjs').AIResponse>}
 */
export async function launch(prompt, options = {}, aiConfig = {}) {
  const { endpoint, apiKey, model } = aiConfig.litellm || {}
  const resolvedModel = model || 'claude-haiku-4-5'
  const {
    temperature = 0.7,
    maxTokens = 2048,
    systemPrompt = 'You are a helpful AI assistant.',
  } = options

  const client = new Anthropic({
    baseURL: endpoint || 'http://localhost:4000',
    apiKey: apiKey || '',
  })

  const response = await client.messages.create({
    model: resolvedModel,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  })

  return {
    content: response.content?.[0]?.text || '',
    usage: {
      promptTokens: response.usage?.input_tokens || 0,
      completionTokens: response.usage?.output_tokens || 0,
      totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    },
    model: resolvedModel,
  }
}

export default { launch }
