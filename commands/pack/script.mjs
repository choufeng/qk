#!/usr/bin/env bun

import { loadConfig, executeChain } from './functions.mjs';
import { processManager } from '../../lib/process-manager.mjs';

/**
 * @description Chain-build packages and apps based on dependency order
 */
export async function run(args) {
  // 注册进程管理器的清理处理器
  processManager.registerCleanupHandlers();

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
    console.log('  qk pack example    # Use ~/.config/qk/pack-example.json');
    console.log('  qk pack my-config  # Use ~/.config/qk/pack-my-config.json');
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

    // 启动会话（创建持久化文件）
    processManager.startSession(configName);

    // 执行链式打包
    await executeChain(items);

    // 正常完成时也清理一下
    if (processManager.getActiveProcessCount() > 0) {
      console.log('🧹 Final cleanup of remaining processes...');
      processManager.cleanup();
    }
  } catch (error) {
    console.error('');
    console.error(`❌ Error: ${error.message}`);

    // 错误时清理进程
    if (processManager.getActiveProcessCount() > 0) {
      console.log('🧹 Cleaning up processes due to error...');
      processManager.cleanup();
    }

    // 结束会话（标记结束时间）
    processManager.endSession();

    process.exit(1);
  }

  // 结束会话（标记结束时间）
  processManager.endSession();
}

export default run;
