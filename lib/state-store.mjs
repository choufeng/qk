#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * 状态存储管理器 - 管理 pack 会话文件的读写操作
 */

// ============================================================================
// Directory Management
// ============================================================================

/**
 * 获取状态目录路径
 * @returns {string} 状态目录完整路径
 */
export function getStateDir() {
  return join(homedir(), '.local', 'state', 'qk', 'pack-processes');
}

/**
 * 确保状态目录存在
 * @returns {string} 状态目录路径
 */
export function ensureStateDir() {
  const stateDir = getStateDir();
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  return stateDir;
}

/**
 * 获取会话文件路径
 * @param {string} configName - 配置名称
 * @returns {string} 会话文件完整路径
 */
export function getSessionPath(configName) {
  const stateDir = getStateDir();
  return join(stateDir, `${configName}.json`);
}

// ============================================================================
// Session CRUD
// ============================================================================

/**
 * 创建会话文件
 * @param {string} configName - 配置名称
 * @returns {Object} 会话数据对象
 */
export function createSession(configName) {
  const sessionPath = getSessionPath(configName);
  const now = new Date().toISOString();

  const session = {
    configName,
    sessionId: generateSessionId(),
    startedAt: now,
    endedAt: null,
    processes: [],
    lastUpdated: now
  };

  writeFileSync(sessionPath, JSON.stringify(session, null, 2) + '\n');
  return session;
}

/**
 * 读取会话文件
 * @param {string} configName - 配置名称
 * @returns {Object|null} 会话数据对象，不存在返回 null
 */
export function readSession(configName) {
  const sessionPath = getSessionPath(configName);

  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = readFileSync(sessionPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in session file: ${sessionPath}`);
    }
    throw error;
  }
}

/**
 * 更新会话文件
 * @param {string} configName - 配置名称
 * @param {Object} data - 要合并的数据
 * @returns {Object} 更新后的会话对象
 */
export function updateSession(configName, data) {
  const sessionPath = getSessionPath(configName);
  const session = readSession(configName);

  if (!session) {
    throw new Error(`Session not found: ${configName}`);
  }

  // 合并数据
  const updatedSession = {
    ...session,
    ...data,
    lastUpdated: new Date().toISOString()
  };

  writeFileSync(sessionPath, JSON.stringify(updatedSession, null, 2) + '\n');
  return updatedSession;
}

/**
 * 添加进程到会话
 * @param {string} configName - 配置名称
 * @param {Object} processInfo - 进程信息
 * @returns {Object} 更新后的会话对象
 */
export function addProcess(configName, processInfo) {
  const sessionPath = getSessionPath(configName);
  const session = readSession(configName);

  if (!session) {
    throw new Error(`Session not found: ${configName}`);
  }

  // 添加进程信息
  session.processes.push(processInfo);
  session.lastUpdated = new Date().toISOString();

  writeFileSync(sessionPath, JSON.stringify(session, null, 2) + '\n');
  return session;
}

/**
 * 标记会话结束
 * @param {string} configName - 配置名称
 * @returns {Object} 更新后的会话对象
 */
export function endSession(configName) {
  return updateSession(configName, {
    endedAt: new Date().toISOString()
  });
}

/**
 * 删除会话文件
 * @param {string} configName - 配置名称
 * @returns {boolean} 是否成功删除
 */
export function deleteSession(configName) {
  const sessionPath = getSessionPath(configName);

  if (!existsSync(sessionPath)) {
    return false;
  }

  unlinkSync(sessionPath);
  return true;
}

// ============================================================================
// Session Listing
// ============================================================================

/**
 * 获取所有会话
 * @returns {Object[]} 会话列表
 */
export function listSessions() {
  const stateDir = getStateDir();

  if (!existsSync(stateDir)) {
    return [];
  }

  const files = readdirSync(stateDir).filter(
    file => file.endsWith('.json')
  );

  const sessions = [];
  for (const file of files) {
    try {
      const configName = file.replace('.json', '');
      const session = readSession(configName);
      if (session) {
        sessions.push(session);
      }
    } catch {
      // 忽略读取失败的文件
    }
  }

  return sessions;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 生成会话 ID
 * @returns {string} 会话 ID (格式: YYYYMMDD-HHmmss)
 */
function generateSessionId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

export default {
  getStateDir,
  ensureStateDir,
  getSessionPath,
  createSession,
  readSession,
  updateSession,
  addProcess,
  endSession,
  deleteSession,
  listSessions
};
