#!/usr/bin/env bun

import { spawn } from 'child_process';
import {
  ensureStateDir,
  createSession,
  addProcess,
  endSession,
  updateSession
} from './state-store.mjs';

/**
 * 进程管理器 - 跟踪和清理子进程
 */
export class ProcessManager {
  constructor() {
    this.childProcesses = new Set();
    this.cleanupRegistered = false;
    this.currentConfigName = null;
    this.sessionStarted = false;
  }

  /**
   * 启动会话（创建持久化文件）
   * @param {string} configName - 配置名称
   */
  startSession(configName) {
    // 确保状态目录存在
    ensureStateDir();

    this.currentConfigName = configName;
    this.sessionStarted = true;

    // 创建会话文件
    createSession(configName);

    console.log(`📝 Session started: ${configName}`);
  }

  /**
   * 结束会话（标记结束时间）
   */
  endSession() {
    if (this.currentConfigName && this.sessionStarted) {
      endSession(this.currentConfigName);
      console.log(`📝 Session ended: ${this.currentConfigName}`);
    }
    this.currentConfigName = null;
    this.sessionStarted = false;
  }

  /**
   * 注册清理处理器
   */
  registerCleanupHandlers() {
    if (this.cleanupRegistered) return;

    const cleanup = (signal) => {
      console.log(`\n🛑 Received ${signal}, cleaning up...`);
      this.cleanup();
      this.endSession();
      process.exit(1);
    };

    // 注册信号处理器
    process.on('SIGINT', () => cleanup('SIGINT')); // Ctrl+C
    process.on('SIGTERM', () => cleanup('SIGTERM')); // 终止信号
    process.on('uncaughtException', (error) => {
      console.error('\n💥 Uncaught exception, cleaning up...');
      console.error(error);
      this.cleanup();
      this.endSession();
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('\n💥 Unhandled rejection, cleaning up...');
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.cleanup();
      this.endSession();
      process.exit(1);
    });

    this.cleanupRegistered = true;
  }

  /**
   * 执行命令并跟踪进程
   * @param {string} command - 命令
   * @param {string[]} args - 参数
   * @param {Object} options - spawn 选项
   * @returns {Promise<number>} 进程退出码
   */
  async executeCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: 'inherit',
        ...options
      });

      // 跟踪子进程
      this.childProcesses.add(proc);

      // 记录进程信息
      const procInfo = {
        pid: proc.pid,
        command: `${command} ${args.join(' ')}`,
        cwd: options.cwd || process.cwd(),
        startTime: new Date().toISOString(),
        endTime: null,
        exitCode: null,
        status: 'running'
      };

      // 打印到控制台
      console.log(`🔧 Started process: PID ${proc.pid} - ${procInfo.command}`);

      // 保存进程信息到会话文件
      if (this.currentConfigName && this.sessionStarted) {
        addProcess(this.currentConfigName, procInfo);
      }

      proc.on('close', (code) => {
        // 从跟踪列表中移除
        this.childProcesses.delete(proc);

        // 更新进程信息
        procInfo.status = 'stopped';
        procInfo.endTime = new Date().toISOString();
        procInfo.exitCode = code;

        console.log(`✅ Process ${proc.pid} finished with code ${code}`);

        // 更新会话文件
        if (this.currentConfigName && this.sessionStarted) {
          updateSession(this.currentConfigName, { processes: [procInfo] });
        }

        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`Process ${proc.pid} exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        // 从跟踪列表中移除
        this.childProcesses.delete(proc);

        // 更新进程信息
        procInfo.status = 'stopped';
        procInfo.endTime = new Date().toISOString();

        console.error(`❌ Process ${proc.pid} failed: ${error.message}`);

        // 更新会话文件
        if (this.currentConfigName && this.sessionStarted) {
          updateSession(this.currentConfigName, { processes: [procInfo] });
        }

        reject(error);
      });
    });
  }

  /**
   * 清理所有子进程
   */
  cleanup() {
    if (this.childProcesses.size === 0) {
      console.log('🧹 No child processes to clean up');
      return;
    }

    console.log(`🧹 Cleaning up ${this.childProcesses.size} child processes...`);

    const processesToClean = Array.from(this.childProcesses);

    processesToClean.forEach(proc => {
      try {
        if (proc.pid && !proc.killed) {
          console.log(`🔫 Terminating process ${proc.pid}...`);

          // 首先尝试优雅终止
          proc.kill('SIGTERM');

          // 如果进程在 3 秒内没有退出，强制杀死
          setTimeout(() => {
            if (!proc.killed) {
              console.log(`💀 Force killing process ${proc.pid}...`);
              proc.kill('SIGKILL');
            }
          }, 3000);
        }
      } catch (error) {
        console.error(`⚠️  Failed to clean up process ${proc.pid}: ${error.message}`);
      }
    });

    // 等待一段时间让进程清理
    setTimeout(() => {
      const remainingProcesses = Array.from(this.childProcesses).filter(proc => !proc.killed);
      if (remainingProcesses.length > 0) {
        console.warn(`⚠️  ${remainingProcesses.length} processes may still be running`);
      } else {
        console.log('✅ All child processes cleaned up');
      }
    }, 5000);
  }

  /**
   * 获取当前跟踪的进程数量
   * @returns {number}
   */
  getActiveProcessCount() {
    return this.childProcesses.size;
  }

  /**
   * 获取所有活跃进程的信息
   * @returns {Array}
   */
  getActiveProcesses() {
    return Array.from(this.childProcesses).map(proc => ({
      pid: proc.pid,
      killed: proc.killed,
      signalCode: proc.signalCode
    }));
  }

  /**
   * 终止指定进程
   * @param {number} pid - 进程 ID
   * @returns {boolean} 是否成功终止
   */
  terminateProcess(pid) {
    try {
      // 发送 SIGTERM
      process.kill(pid, 'SIGTERM');
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') {
        // 进程不存在
        return false;
      }
      throw error;
    }
  }

  /**
   * 强制终止指定进程
   * @param {number} pid - 进程 ID
   * @returns {boolean} 是否成功终止
   */
  forceTerminateProcess(pid) {
    try {
      // 发送 SIGKILL
      process.kill(pid, 'SIGKILL');
      return true;
    } catch (error) {
      if (error.code === 'ESRCH') {
        // 进程不存在
        return false;
      }
      throw error;
    }
  }
}

// 创建全局进程管理器实例
export const processManager = new ProcessManager();

export default processManager;
