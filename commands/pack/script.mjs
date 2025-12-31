#!/usr/bin/env bun

import { loadConfig, executeChain } from './functions.mjs';

/**
 * @description Chain-build packages and apps based on dependency order
 */
export async function run(args) {
  // 扁平化参数并过滤有效参数
  const flatArgs = args.flat();
  const validArgs = flatArgs.filter(arg =>
    typeof arg === 'string' &&
    !arg.includes('Command') &&
    !arg.startsWith('{')
  );

  // 检查参数
  if (validArgs.length === 0) {
    console.error('❌ Please provide a configuration name');
    console.log('');
    console.log('Usage: qk pack <config-name>');
    console.log('');
    console.log('Examples:');
    console.log('  qk pack example    # Use configs/pack-example.json');
    console.log('  qk pack my-config  # Use configs/pack-my-config.json');
    process.exit(1);
  }

  const configName = validArgs[0];

  console.log('🚀 Starting pack chain execution');
  console.log(`📄 Configuration: pack-${configName}.json`);
  console.log('');

  try {
    // 加载配置
    const items = await loadConfig(configName);
    console.log(`📦 Loaded ${items.length} items`);
    console.log('');

    // 执行链式打包
    await executeChain(items);
  } catch (error) {
    console.error('');
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

export default run;
