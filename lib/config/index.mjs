#!/usr/bin/env bun

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import yaml from 'js-yaml'
import { DEFAULT_CONFIG } from './schema.mjs'

const CONFIG_DIR = join(homedir(), '.config', 'qk')
const CONFIG_FILE = join(CONFIG_DIR, 'config.yaml')

/**
 * Global configuration manager for qk
 * Reads and writes ~/.config/qk/config.yaml
 */
export class ConfigManager {
  #config

  constructor() {
    this.#config = this.#load()
  }

  /**
   * Load config from disk, merging with defaults
   * @returns {Object} Merged config
   */
  #load() {
    if (!existsSync(CONFIG_FILE)) {
      return structuredClone(DEFAULT_CONFIG)
    }
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf8')
      const parsed = yaml.load(raw) || {}
      return this.#merge(DEFAULT_CONFIG, parsed)
    } catch (err) {
      console.warn(`Warning: Failed to parse config file, using defaults. (${err.message})`)
      return structuredClone(DEFAULT_CONFIG)
    }
  }

  /**
   * Deep merge two objects (target wins)
   */
  #merge(base, target) {
    const result = structuredClone(base)
    for (const key of Object.keys(target)) {
      if (
        target[key] !== null &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key]) &&
        typeof result[key] === 'object'
      ) {
        result[key] = this.#merge(result[key], target[key])
      } else {
        result[key] = target[key]
      }
    }
    return result
  }

  /**
   * Get config value by dot-path or full config
   * @param {string} [path] - Dot-separated path e.g. 'ai.provider'
   * @returns {*} Config value
   */
  get(path) {
    if (!path) return this.#config
    return path.split('.').reduce((obj, key) => obj?.[key], this.#config)
  }

  /**
   * Set config value by dot-path
   * @param {string} path - Dot-separated path e.g. 'ai.provider'
   * @param {*} value - Value to set
   */
  set(path, value) {
    const keys = path.split('.')
    let obj = this.#config
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] === null || typeof obj[keys[i]] !== 'object') obj[keys[i]] = {}
      obj = obj[keys[i]]
    }
    obj[keys[keys.length - 1]] = value
  }

  /**
   * Save current config to disk
   */
  save() {
    mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(CONFIG_FILE, yaml.dump(this.#config), 'utf8')
  }
}

export default ConfigManager
