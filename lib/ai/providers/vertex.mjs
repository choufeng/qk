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
  const resolvedModel = aiConfig.vertex?.model || 'gemini-3-flash-preview'
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

  const location = process.env.GOOGLE_CLOUD_LOCATION
    || process.env.CLOUD_ML_REGION
    || 'us-central1'

  if (family === 'claude') {
    // Claude via Vertex AI — use @anthropic-ai/vertex-sdk with ADC auth
    const { AnthropicVertex } = await import('@anthropic-ai/vertex-sdk')
    const client = new AnthropicVertex({
      region: location,
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.ANTHROPIC_VERTEX_PROJECT_ID,
    })

    const response = await client.messages.create({
      model: resolvedModel,
      max_tokens: maxTokens,
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

  // Gemini via Vertex AI — use LangChain ChatVertexAI
  const { ChatVertexAI } = await import('@langchain/google-vertexai')
  const llm = new ChatVertexAI({
    model: resolvedModel,
    location,
    temperature,
    maxOutputTokens: maxTokens,
  })

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
