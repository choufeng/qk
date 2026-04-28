#!/usr/bin/env bun

import * as p from '@clack/prompts'
import chalk from 'chalk'
import { ConfigManager } from '../../lib/config/index.mjs'
import { PROVIDER_DEFAULTS } from '../../lib/config/schema.mjs'

/**
 * @description Interactive global configuration for qk
 */
export async function run(args) {
  p.intro(chalk.bgCyan.black(' QK · SET '))

  try {
    const config = new ConfigManager()

    // Step 1: Choose AI provider
    const provider = await p.select({
      message: 'AI Provider',
      options: [
        { value: 'ollama',  label: 'Ollama',      hint: 'local' },
        { value: 'vertex',  label: 'Vertex AI',   hint: 'Google Cloud' },
      ],
      initialValue: config.get('ai.provider'),
    })
    if (p.isCancel(provider)) { p.cancel('Cancelled.'); process.exit(0) }
    config.set('ai.provider', provider)

    // Step 2: Choose response language
    const language = await p.select({
      message: 'Response language',
      options: [
        { value: 'en',    label: 'English' },
        { value: 'zh-CN', label: '简体中文' },
        { value: 'zh-TW', label: '繁體中文' },
      ],
      initialValue: config.get('ai.language') || 'en',
    })
    if (p.isCancel(language)) { p.cancel('Cancelled.'); process.exit(0) }
    config.set('ai.language', language)

    // Step 3: Provider-specific config
    if (provider === 'ollama') {
      const endpoint = await p.text({
        message: 'Ollama endpoint',
        placeholder: PROVIDER_DEFAULTS.ollama.endpoint,
        initialValue: config.get('ai.ollama.endpoint') || PROVIDER_DEFAULTS.ollama.endpoint,
      })
      if (p.isCancel(endpoint)) { p.cancel('Cancelled.'); process.exit(0) }

      const model = await p.text({
        message: 'Ollama model',
        placeholder: PROVIDER_DEFAULTS.ollama.model,
        initialValue: config.get('ai.ollama.model') || PROVIDER_DEFAULTS.ollama.model,
      })
      if (p.isCancel(model)) { p.cancel('Cancelled.'); process.exit(0) }

      config.set('ai.ollama.endpoint', endpoint)
      config.set('ai.ollama.model', model)
    } else {
      const model = await p.text({
        message: 'Vertex AI model',
        placeholder: PROVIDER_DEFAULTS.vertex.model,
        initialValue: config.get('ai.vertex.model') || PROVIDER_DEFAULTS.vertex.model,
      })
      if (p.isCancel(model)) { p.cancel('Cancelled.'); process.exit(0) }

      config.set('ai.vertex.model', model)
      p.log.info('Auth: using env vars GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION')
    }

    // Step 4: Summary and confirm
    const ai = config.get('ai')
    const summary = provider === 'ollama'
      ? `provider: ${ai.provider}\nlanguage: ${ai.language}\nendpoint: ${ai.ollama.endpoint}\nmodel:    ${ai.ollama.model}`
      : `provider: ${ai.provider}\nlanguage: ${ai.language}\nmodel:    ${ai.vertex.model}`
    p.note(summary, 'Configuration summary')

    const ok = await p.confirm({ message: 'Save configuration?', initialValue: true })
    if (p.isCancel(ok) || !ok) {
      p.cancel('No changes saved.')
      process.exit(0)
    }

    config.save()
    p.outro('Configuration saved to ~/.config/qk/config.yaml')

  } catch (error) {
    p.cancel(`Error: ${error.message}`)
    process.exit(1)
  }
}

export default run
