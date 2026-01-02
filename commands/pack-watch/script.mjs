#!/usr/bin/env bun

import { readSession, listSessions } from '../../lib/state-store.mjs';
import { isProcessAlive } from '../../lib/utils.mjs';
import { displayProcesses } from './display.mjs';
import { terminateProcess, terminateProcesses } from './killer.mjs';
import { cleanSession, forceCleanSession } from './cleaner.mjs';

/**
 * @description 检查并清理 pack 启动的残留进程
 */
export async function run(args) {
  // 扁平化参数
  const flatArgs = args.flat();

  // 解析选项
  const options = {
    kill: null,
    clean: false,
    forceClean: false,
    all: false,
    json: false,
    interval: 1000, // 默认 1 秒刷新
    once: false     // 仅显示一次，不刷新
  };

  // 提取位置参数和选项
  const positionalArgs = [];

  for (const arg of flatArgs) {
    // 跳过 Commander.js 对象
    if (typeof arg !== 'string') {
      continue;
    }

    // 跳过 Commander.js 内部参数
    if (arg.includes('Command') || arg.startsWith('{')) {
      continue;
    }

    if (arg === '--kill' || arg === '-k') {
      options.kill = true;
    } else if (arg === '--clean' || arg === '-c') {
      options.clean = true;
    } else if (arg === '--force-clean' || arg === '-f') {
      options.forceClean = true;
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--json' || arg === '-j') {
      options.json = true;
    } else if (arg === '--once' || arg === '-o') {
      options.once = true;
    } else if (arg.startsWith('--interval=')) {
      options.interval = parseInt(arg.split('=')[1], 10) * 1000;
    } else if (arg.startsWith('-')) {
      // 忽略其他短选项
    } else {
      positionalArgs.push(arg);
    }
  }

  // 验证参数
  if (positionalArgs.length === 0 && !options.all) {
    console.error('❌ Please provide a configuration name or use --all');
    console.log('');
    console.log('Usage: qk pack-watch <config-name> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --once             Show status once (no auto-refresh)');
    console.log('  --interval <sec>   Set refresh interval (default: 1s)');
    console.log('  --kill [pid]       Terminate running processes');
    console.log('  --clean            Remove session file (only if all stopped)');
    console.log('  --force-clean      Force remove session file');
    console.log('  --all              Show all sessions');
    console.log('  --json             Output in JSON format');
    console.log('');
    console.log('Examples:');
    console.log('  qk pack-watch modal-lab              # Auto-refresh every 1s');
    console.log('  qk pack-watch modal-lab --once       # Show once');
    console.log('  qk pack-watch modal-lab --interval 5 # Refresh every 5s');
    console.log('  qk pack-watch modal-lab --kill       # Terminate all');
    console.log('  qk pack-watch modal-lab --clean      # Clean session file');
    console.log('  qk pack-watch --all');
    process.exit(1);
  }

  // 处理 --kill 的参数值
  if (options.kill === true && positionalArgs.length > 1) {
    const lastArg = positionalArgs[positionalArgs.length - 1];
    if (/^\d+$/.test(lastArg)) {
      options.kill = lastArg;
      positionalArgs.pop();
    }
  }

  // 执行命令逻辑
  try {
    if (options.all) {
      // 显示所有会话（仅显示一次）
      await showAllSessions(options);
    } else {
      const configName = positionalArgs[0];

      if (options.once) {
        // 仅显示一次
        await showSession(configName, options);
      } else {
        // 持续刷新
        await watchSession(configName, options);
      }
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

async function watchSession(configName, options) {
  let iteration = 0;
  const readline = await import('readline');

  // 设置 Ctrl+C 处理
  let isRunning = true;
  const cleanup = () => {
    isRunning = false;
    console.log('\n👋 Stopped watching');
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  while (isRunning) {
    // 清屏
    console.clear();

    // 显示迭代次数
    if (iteration > 0) {
      console.log(`🔄 Refresh: ${iteration} | Press Ctrl+C to stop`);
    }

    // 读取会话文件
    const session = readSession(configName);
    if (!session) {
      console.log(`📭 No session found for: ${configName}`);
      console.log('');
      console.log('💡 This means either:');
      console.log('   • You have not run "qk pack" with this configuration');
      console.log('   • The session file has been cleaned up');
      break;
    }

    // 检查进程状态
    const processesWithStatus = await Promise.all(
      session.processes.map(async (proc) => {
        const isAlive = await isProcessAlive(proc.pid);
        return {
          ...proc,
          actualStatus: isAlive ? 'running' : 'stopped'
        };
      })
    );

    // 更新本地状态
    session.processes = processesWithStatus;

    // 显示进程列表
    displayProcesses(session, options.json);

    // 检查是否所有进程都已停止
    const runningCount = processesWithStatus.filter(p => p.actualStatus === 'running').length;
    if (runningCount === 0) {
      console.log('');
      console.log('✅ All processes have stopped. Use --once to exit immediately.');
    }

    iteration++;

    // 等待下次刷新
    if (isRunning) {
      await new Promise(resolve => setTimeout(resolve, options.interval));
    }
  }
}

async function showSession(configName, options) {
  // 读取会话文件
  const session = readSession(configName);
  if (!session) {
    console.log(`📭 No session found for: ${configName}`);
    console.log('');
    console.log('💡 This means either:');
    console.log('   • You have not run "qk pack" with this configuration');
    console.log('   • The session file has been cleaned up');
    return;
  }

  // 检查进程状态
  const processesWithStatus = await Promise.all(
    session.processes.map(async (proc) => {
      const isAlive = await isProcessAlive(proc.pid);
      return {
        ...proc,
        actualStatus: isAlive ? 'running' : 'stopped'
      };
    })
  );

  // 更新本地状态
  session.processes = processesWithStatus;

  // 处理选项
  if (options.kill !== null && options.kill !== true) {
    // 终止指定进程
    const pid = parseInt(options.kill, 10);
    if (isNaN(pid)) {
      console.error('❌ Invalid PID');
      process.exit(1);
    }
    await terminateProcess(configName, pid);

    // 重新检查状态
    const updatedSession = readSession(configName);
    if (updatedSession) {
      const updatedProcesses = await Promise.all(
        updatedSession.processes.map(async (proc) => {
          const isAlive = await isProcessAlive(proc.pid);
          return { ...proc, actualStatus: isAlive ? 'running' : 'stopped' };
        })
      );
      updatedSession.processes = updatedProcesses;
      displayProcesses(updatedSession, options.json);
    }
  } else if (options.kill === true) {
    // 终止所有运行中的进程
    await terminateProcesses(configName);

    // 重新检查状态
    const updatedSession = readSession(configName);
    if (updatedSession) {
      const updatedProcesses = await Promise.all(
        updatedSession.processes.map(async (proc) => {
          const isAlive = await isProcessAlive(proc.pid);
          return { ...proc, actualStatus: isAlive ? 'running' : 'stopped' };
        })
      );
      updatedSession.processes = updatedProcesses;
      displayProcesses(updatedSession, options.json);
    }
  } else if (options.forceClean) {
    await forceCleanSession(configName);
  } else if (options.clean) {
    await cleanSession(configName);
  } else {
    // 显示进程列表
    displayProcesses(session, options.json);
  }
}

async function showAllSessions(options) {
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log('📭 No active sessions found');
    return;
  }

  console.log(`📋 All Pack Sessions (${sessions.length})`);
  console.log('');

  for (const session of sessions) {
    const runningCount = session.processes.filter(
      p => p.status === 'running'
    ).length;

    const status = runningCount > 0 ? '🔴' : '🟢';
    console.log(
      `${status} ${session.configName} - ${session.processes.length} processes`
    );
  }

  console.log('');
  console.log('💡 To view a specific session:');
  console.log('   qk pack-watch <config-name>');
}

export default run;
