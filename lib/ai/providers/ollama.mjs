#!/usr/bin/env bun

import { ChatOllama } from '@langchain/ollama'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

/**
 * Launch AI completion using Ollama
 * @param {string} prompt - User prompt
 * @param {Object} options - Launch options
 * @param {Object} aiConfig - AI config block from ConfigManager
 * @returns {Promise<import('../types.mjs').AIResponse>}
 */
export async function launch(prompt, options = {}, aiConfig = {}) {
  const { endpoint, model } = aiConfig.ollama || {}
  const {
    temperature = 0.7,
    maxTokens = 2048,
    systemPrompt = 'You are a helpful AI assistant.',
  } = options

  const llm = new ChatOllama({
    baseUrl: endpoint || 'http://localhost:11434',
    model: model || 'qwen3-coder-next:cloud',
    temperature,
    numPredict: maxTokens,
  })

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(prompt),
  ]

  const response = await llm.invoke(messages)

  return {
    content: response.content,
    usage: {
      promptTokens: response.usage_metadata?.input_tokens || 0,
      completionTokens: response.usage_metadata?.output_tokens || 0,
      totalTokens: response.usage_metadata?.total_tokens || 0,
    },
    model: model || 'qwen3-coder-next:cloud',
  }
}

export default { launch }
