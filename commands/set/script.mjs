#!/usr/bin/env bun

import { select, input, confirm } from '@inquirer/prompts'
import { ConfigManager } from '../../lib/config/index.mjs'
import { PROVIDER_DEFAULTS } from '../../lib/config/schema.mjs'

/**
 * @description Interactive global configuration for qk
 */
export async function run(args) {
  try {
    const config = new ConfigManager()

    console.log('\nqk Configuration\n')

    // Step 1: Choose AI provider
    const provider = await select({
      message: 'AI Provider',
      choices: [
        { name: 'Ollama (local)', value: 'ollama' },
        { name: 'Vertex AI (Google Cloud)', value: 'vertex' },
      ],
      default: config.get('ai.provider'),
    })

    config.set('ai.provider', provider)

    // Step 2: Provider-specific config
    if (provider === 'ollama') {
      const endpoint = await input({
        message: 'Ollama endpoint',
        default: config.get('ai.ollama.endpoint') || PROVIDER_DEFAULTS.ollama.endpoint,
      })
      const model = await input({
        message: 'Ollama model',
        default: config.get('ai.ollama.model') || PROVIDER_DEFAULTS.ollama.model,
      })
      config.set('ai.ollama.endpoint', endpoint)
      config.set('ai.ollama.model', model)
    } else {
      const model = await input({
        message: 'Vertex AI model',
        default: config.get('ai.vertex.model') || PROVIDER_DEFAULTS.vertex.model,
      })
      config.set('ai.vertex.model', model)
      console.log('\n  Auth: using environment variables')
      console.log('  (GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION)\n')
    }

    // Step 3: Summary and confirm
    const ai = config.get('ai')
    console.log('\nConfiguration summary:')
    console.log(`  provider: ${ai.provider}`)
    if (ai.provider === 'ollama') {
      console.log(`  endpoint: ${ai.ollama.endpoint}`)
      console.log(`  model:    ${ai.ollama.model}`)
    } else {
      console.log(`  model:    ${ai.vertex.model}`)
    }

    const ok = await confirm({ message: 'Save configuration?', default: true })

    if (ok) {
      config.save()
      console.log('\nConfiguration saved to ~/.config/qk/config.yaml')
    } else {
      console.log('\nCancelled, no changes saved.')
    }
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log('\nCancelled.')
      process.exit(0)
    }
    console.error(`\nError: ${error.message}`)
    process.exit(1)
  }
}

export default run
