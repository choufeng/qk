#!/usr/bin/env bun

import { kill } from 'process';

/**
 * 通用工具函数集合
 */

// ============================================================================
// Process Utilities
// ============================================================================

/**
 * 检查进程是否存在
 * @param {number} pid - 进程 ID
 * @returns {boolean} 是否存在
 */
export function isProcessAlive(pid) {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH = No such process
    // EPERM = Operation not permitted (process exists but we can't signal it)
    if (error.code === 'ESRCH') {
      return false;
    }
    // 如果是 EPERM，进程存在但我们没有权限
    return true;
  }
}

// ============================================================================
// Time Utilities
// ============================================================================

/**
 * 格式化时间显示
 * @param {string} isoString - ISO 8601 时间戳
 * @returns {string} 格式化的时间字符串
 */
export function formatTime(isoString) {
  if (!isoString) {
    return 'N/A';
  }

  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * 获取进程运行时长
 * @param {string} startTime - 开始时间
 * @param {string} endTime - 结束时间（可选，默认当前时间）
 * @returns {string} 时长字符串
 */
export function getDuration(startTime, endTime = null) {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  const durationMs = end - start;

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * 获取相对时间描述
 * @param {string} isoString - ISO 8601 时间戳
 * @returns {string} 相对时间描述
 */
export function getRelativeTime(isoString) {
  if (!isoString) {
    return 'unknown';
  }

  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) {
    return 'just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * 截断文本
 * @param {string} text - 文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
export function truncate(text, maxLength) {
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * 截断文本（从右侧）
 * @param {string} text - 文本
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的文本
 */
export function truncateEnd(text, maxLength) {
  if (!text) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  return '...' + text.slice(-(maxLength - 3));
}

/**
 * 清理命令行参数
 * @param {Array} args - 原始参数数组
 * @returns {Object} 清理后的参数
 */
export function cleanArgs(args) {
  const flatArgs = args.flat();
  return flatArgs.filter(arg =>
    typeof arg === 'string' &&
    !arg.includes('Command') &&
    !arg.startsWith('{')
  );
}

/**
 * 解析命令行选项
 * @param {string[]} args - 清理后的参数数组
 * @param {Object} optionDefs - 选项定义
 * @returns {Object} 解析结果
 */
export function parseOptions(args, optionDefs = {}) {
  const options = {};
  const positional = [];

  for (const arg of args) {
    let matched = false;

    // 检查短选项
    if (arg.startsWith('-') && !arg.startsWith('--')) {
      const shortName = arg.slice(1);
      for (const [key, def] of Object.entries(optionDefs)) {
        if (def.short === shortName) {
          options[key] = def.hasValue ? arg.slice(2) || true : true;
          matched = true;
          break;
        }
      }
    }

    // 检查长选项
    if (arg.startsWith('--')) {
      const longName = arg.slice(2).split('=')[0];
      const value = arg.includes('=') ? arg.split('=')[1] : null;

      for (const [key, def] of Object.entries(optionDefs)) {
        if (def.long === longName) {
          options[key] = def.hasValue ? (value || true) : true;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      positional.push(arg);
    }
  }

  return { options, positional };
}

// ============================================================================
// File Utilities
// ============================================================================

/**
 * 安全读取 JSON 文件
 * @param {string} path - 文件路径
 * @returns {Object|null} JSON 对象，失败返回 null
 */
export function safeReadJson(path) {
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ============================================================================
// Output Utilities
// ============================================================================

/**
 * 打印分隔线
 * @param {number} width - 宽度
 * @param {string} char - 字符
 */
export function printLine(width = 60, char = '-') {
  console.log(char.repeat(width));
}

/**
 * 打印标题
 * @param {string} text - 标题文本
 * @param {string} prefix - 前缀图标
 */
export function printTitle(text, prefix = '📋') {
  console.log('');
  console.log(`${prefix} ${text}`);
  console.log('');
}

/**
 * 打印状态行
 * @param {string} label - 标签
 * @param {string} value - 值
 * @param {string} icon - 图标
 */
export function printStatus(label, value, icon = '•') {
  const labelPad = label.padEnd(15);
  const valueStr = String(value).padStart(30);
  console.log(`  ${icon} ${labelPad} ${valueStr}`);
}

// ============================================================================
// Color Utilities (使用 ANSI 转义序列)
// ============================================================================

/**
 * 绿色文本
 * @param {string} text - 文本
 * @returns {string} 带颜色的文本
 */
export function green(text) {
  return `\x1b[32m${text}\x1b[0m`;
}

/**
 * 红色文本
 * @param {string} text - 文本
 * @returns {string} 带颜色的文本
 */
export function red(text) {
  return `\x1b[31m${text}\x1b[0m`;
}

/**
 * 黄色文本
 * @param {string} text - 文本
 * @returns {string} 带颜色的文本
 */
export function yellow(text) {
  return `\x1b[33m${text}\x1b[0m`;
}

/**
 * 蓝色文本
 * @param {string} text - 文本
 * @returns {string} 带颜色的文本
 */
export function blue(text) {
  return `\x1b[34m${text}\x1b[0m`;
}

/**
 * 灰色文本
 * @param {string} text - 文本
 * @returns {string} 带颜色的文本
 */
export function gray(text) {
  return `\x1b[90m${text}\x1b[0m`;
}

export default {
  isProcessAlive,
  formatTime,
  getDuration,
  getRelativeTime,
  truncate,
  truncateEnd,
  cleanArgs,
  parseOptions,
  safeReadJson,
  printLine,
  printTitle,
  printStatus,
  green,
  red,
  yellow,
  blue,
  gray
};
