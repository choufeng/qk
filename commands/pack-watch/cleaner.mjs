#!/usr/bin/env bun

import { readSession, deleteSession, getSessionPath } from '../../lib/state-store.mjs';

/**
 * 清理会话文件（仅当所有进程已停止时）
 * @param {string} configName - 配置名称
 */
export async function cleanSession(configName) {
  const session = readSession(configName);
  if (!session) {
    console.log(`📭 Session ${configName} does not exist`);
    return;
  }

  // 检查是否所有进程都已停止
  const runningProcesses = session.processes.filter(p => p.status === 'running');

  if (runningProcesses.length > 0) {
    console.log(`⚠️  Cannot clean session ${configName}`);
    console.log(`   ${runningProcesses.length} process(es) are still running`);
    console.log('');
    console.log('💡 Terminate them first:');
    console.log(`   qk pack-watch ${configName} --kill`);
    return;
  }

  // 确认清理
  console.log(`🗑️  Removing session file: ${getSessionPath(configName)}`);

  const confirm = await askConfirmation('Are you sure you want to remove this session?');
  if (!confirm) {
    console.log('Cancelled');
    return;
  }

  deleteSession(configName);
  console.log(`✅ Session ${configName} cleaned up!`);
}

/**
 * 强制清理会话文件（不管进程状态）
 * @param {string} configName - 配置名称
 */
export async function forceCleanSession(configName) {
  const session = readSession(configName);
  if (!session) {
    console.log(`📭 Session ${configName} does not exist`);
    return;
  }

  const runningProcesses = session.processes.filter(p => p.status === 'running');

  if (runningProcesses.length > 0) {
    console.log(`⚠️  Force cleaning session ${configName}`);
    console.log(`   ${runningProcesses.length} process(es) will become untracked!`);
  }

  const confirm = await askConfirmation('Are you sure you want to force remove this session?');
  if (!confirm) {
    console.log('Cancelled');
    return;
  }

  deleteSession(configName);
  console.log(`✅ Session ${configName} force cleaned!`);
}

/**
 * 询问用户确认
 * @param {string} message - 提示消息
 * @returns {Promise<boolean>} 用户确认结果
 */
async function askConfirmation(message) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export default {
  cleanSession,
  forceCleanSession
};
