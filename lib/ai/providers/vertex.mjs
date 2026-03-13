#!/usr/bin/env bun

import { HumanMessage, SystemMessage } from '@langchain/core/messages'

/**
 * Determine if model is Claude (Anthropic via Vertex) or Gemini (Google)
 * @param {string} model - Model name
 * @returns {'claude' | 'gemini'}
 */
function detectModelFamily(model) {
  if (model.startsWith('claude-')) return 'claude'
  return 'gemini'
}

/**
 * Launch AI completion using Vertex AI (Gemini or Claude)
 * Auth via environment variables:
 *   - GOOGLE_CLOUD_PROJECT
 *   - GOOGLE_CLOUD_LOCATION (or CLOUD_ML_REGION)
 * @param {string} prompt - User prompt
 * @param {Object} options - Launch options
 * @param {Object} aiConfig - AI config block from ConfigManager
 * @returns {Promise<import('../types.mjs').AIResponse>}
 */
export async function launch(prompt, options = {}, aiConfig = {}) {
  const resolvedModel = aiConfig.vertex?.model || 'gemini-3.1-flash-lite-preview'
  const {
    temperature = 0.7,
    maxTokens = 2048,
    systemPrompt = 'You are a helpful AI assistant.',
  } = options

  const family = detectModelFamily(resolvedModel)
  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(prompt),
  ]

  let llm
  if (family === 'claude') {
    const { ChatAnthropicVertex } = await import('@langchain/google-vertexai')
    llm = new ChatAnthropicVertex({
      model: resolvedModel,
      temperature,
      maxTokens,
    })
  } else {
    const { ChatVertexAI } = await import('@langchain/google-vertexai')
    llm = new ChatVertexAI({
      model: resolvedModel,
      temperature,
      maxOutputTokens: maxTokens,
    })
  }

  const response = await llm.invoke(messages)

  return {
    content: typeof response.content === 'string'
      ? response.content
      : response.content?.[0]?.text || '',
    usage: {
      promptTokens: response.usage_metadata?.input_tokens || 0,
      completionTokens: response.usage_metadata?.output_tokens || 0,
      totalTokens: response.usage_metadata?.total_tokens || 0,
    },
    model: resolvedModel,
  }
}

export default { launch }
