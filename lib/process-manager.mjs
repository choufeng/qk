#!/usr/bin/env bun

import { spawn } from 'child_process';

/**
 * 进程管理器 - 跟踪和清理子进程
 */
export class ProcessManager {
  constructor() {
    this.childProcesses = new Set();
    this.cleanupRegistered = false;
  }

  /**
   * 注册清理处理器
   */
  registerCleanupHandlers() {
    if (this.cleanupRegistered) return;
    
    const cleanup = (signal) => {
      console.log(`\n🛑 Received ${signal}, cleaning up child processes...`);
      this.cleanup();
      process.exit(1);
    };

    // 注册信号处理器
    process.on('SIGINT', () => cleanup('SIGINT'));  // Ctrl+C
    process.on('SIGTERM', () => cleanup('SIGTERM')); // 终止信号
    process.on('uncaughtException', (error) => {
      console.error('\n💥 Uncaught exception, cleaning up...');
      console.error(error);
      this.cleanup();
      process.exit(1);
    });
    process.on('unhandledRejection', (reason, promise) => {
      console.error('\n💥 Unhandled rejection, cleaning up...');
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.cleanup();
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
        cwd: options.cwd || process.cwd()
      };
      console.log(`🔧 Started process: PID ${proc.pid} - ${procInfo.command}`);

      proc.on('close', (code) => {
        // 从跟踪列表中移除
        this.childProcesses.delete(proc);
        console.log(`✅ Process ${proc.pid} finished with code ${code}`);
        
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`Process ${proc.pid} exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        // 从跟踪列表中移除
        this.childProcesses.delete(proc);
        console.error(`❌ Process ${proc.pid} failed: ${error.message}`);
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
}

// 创建全局进程管理器实例
export const processManager = new ProcessManager();

export default processManager;