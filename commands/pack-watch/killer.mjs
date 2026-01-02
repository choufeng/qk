#!/usr/bin/env bun

import { readSession, updateSession } from '../../lib/state-store.mjs';
import { isProcessAlive } from '../../lib/utils.mjs';

/**
 * 终止指定进程
 * @param {string} configName - 配置名称
 * @param {number} pid - 进程 ID
 */
export async function terminateProcess(configName, pid) {
  const session = readSession(configName);
  if (!session) {
    throw new Error(`Session not found: ${configName}`);
  }

  const process = session.processes.find(p => p.pid === pid);
  if (!process) {
    throw new Error(`Process ${pid} not found in session ${configName}`);
  }

  // 检查进程是否还在运行
  if (!isProcessAlive(pid)) {
    console.log(`✅ Process ${pid} has already stopped`);
    return;
  }

  // 终止进程
  console.log(`🔫 Terminating process ${pid}...`);
  console.log(`   Command: ${process.command}`);
  console.log(`   PID: ${pid}`);

  try {
    // 发送 SIGTERM
    process.kill(pid, 'SIGTERM');
    console.log(`   Sent SIGTERM to process ${pid}`);

    // 等待进程退出
    let attempts = 0;
    const maxAttempts = 10; // 最多等待 5 秒

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!isProcessAlive(pid)) {
        break;
      }
      attempts++;
    }

    // 如果进程还在，发送 SIGKILL
    if (isProcessAlive(pid)) {
      console.log(`   Process ${pid} did not respond to SIGTERM, sending SIGKILL...`);
      process.kill(pid, 'SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 验证进程已退出
    if (!isProcessAlive(pid)) {
      console.log(`✅ Process ${pid} terminated successfully`);

      // 更新会话状态
      const now = new Date().toISOString();
      process.status = 'stopped';
      process.endTime = now;
      updateSession(configName, { processes: session.processes });
    } else {
      throw new Error(`Failed to terminate process ${pid}`);
    }

  } catch (error) {
    if (error.code === 'ESRCH') {
      // 进程不存在
      console.log(`✅ Process ${pid} has already stopped`);
    } else if (error.code === 'EPERM') {
      // 无权限
      throw new Error(`Permission denied to terminate process ${pid}`);
    } else {
      throw new Error(`Failed to terminate process ${pid}: ${error.message}`);
    }
  }
}

/**
 * 终止所有运行中的进程
 * @param {string} configName - 配置名称
 */
export async function terminateProcesses(configName) {
  const session = readSession(configName);
  if (!session) {
    throw new Error(`Session not found: ${configName}`);
  }

  const runningProcesses = session.processes.filter(p => p.status === 'running');

  if (runningProcesses.length === 0) {
    console.log('✅ No running processes to terminate');
    return;
  }

  console.log(`🔫 Terminating ${runningProcesses.length} process(es)...`);
  console.log('');

  for (const proc of runningProcesses) {
    await terminateProcess(configName, proc.pid);
    console.log('');
  }

  console.log('✅ All processes terminated');
}

export default {
  terminateProcess,
  terminateProcesses
};
