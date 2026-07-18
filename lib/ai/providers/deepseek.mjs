#!/usr/bin/env bun

/**
 * Launch AI completion using DeepSeek direct API (OpenAI-compatible)
 *
 * Config example (~/.config/qk/config.yaml):
 *   ai:
 *     provider: deepseek
 *     deepseek:
 *       apiKey: sk-xxx
 *       model: deepseek-chat
 *       endpoint: https://api.deepseek.com  # optional, default official
 *
 * @param {string} prompt - User prompt
 * @param {Object} options - Launch options
 * @param {Object} aiConfig - AI config block from ConfigManager
 * @returns {Promise<import('../types.mjs').AIResponse>}
 */
export async function launch(prompt, options = {}, aiConfig = {}) {
  const { apiKey, model, endpoint } = aiConfig.deepseek || {}
  const resolvedModel = model || 'deepseek-chat'
  const resolvedEndpoint = endpoint || 'https://api.deepseek.com'
  const {
    temperature = 0.7,
    maxTokens = 2048,
    systemPrompt = 'You are a helpful AI assistant.',
  } = options

  if (!apiKey) {
    throw new Error('DeepSeek API key not configured. Run `qk set` to set it.')
  }

  const url = `${resolvedEndpoint.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`DeepSeek API error ${response.status}: ${errText}`)
  }

  const data = await response.json()
  const usage = data.usage || {}

  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
    model: resolvedModel,
  }
}

export default { launch }
