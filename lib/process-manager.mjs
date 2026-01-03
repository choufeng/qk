#!/usr/bin/env bun

import { spawn } from 'child_process';
import {
  ensureStateDir,
  createSession,
  addProcess,
  endSession,
  updateSession,
  addParallelGroup,
  updateParallelGroup
} from './state-store.mjs';

/**
 * 进程管理器 - 跟踪和清理子进程（增强版）
 */
export class ProcessManager {
  constructor() {
    this.childProcesses = new Set();
    this.cleanupRegistered = false;
    this.currentConfigName = null;
    this.sessionStarted = false;
    this.parallelGroups = new Map(); // groupId -> { commands, pids }
  }

  /**
   * 并发执行多个命令
   * @param {string[]} commands - 命令数组 ["cmd1", "cmd2"]
   * @param {Object} options - 执行选项
   * @param {string} options.cwd - 工作目录
   * @param {boolean} options.killOnFail - 失败时杀死其他
   * @returns {Promise<{success: boolean, groupId: string, results: Array}>}
   */
  async executeCommandsParallel(commands, options = {}) {
    const {
      cwd = process.cwd(),
      killOnFail = true,
      groupId = `parallel-${Date.now()}`
    } = options;

    console.log(`🚀 Starting ${commands.length} commands in parallel (group: ${groupId})`);

    // 创建并行组记录
    this.parallelGroups.set(groupId, {
      commands,
      pids: [],
      startTime: new Date().toISOString(),
      status: 'running'
    });

    // 保存到状态存储
    if (this.currentConfigName && this.sessionStarted) {
      addParallelGroup(this.currentConfigName, {
        id: groupId,
        commands,
        cwd,
        killOnFail,
        startTime: new Date().toISOString(),
        status: 'running',
        pids: []
      });
    }

    // 解析命令
    const parsedCommands = commands.map(cmd => this.parseCommand(cmd));

    // 并发执行
    const results = await Promise.allSettled(
      parsedCommands.map((parsed, index) =>
        this.executeCommand(parsed.command, parsed.args, {
          cwd,
          groupId,
          index
        })
      )
    );

    // 处理结果
    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          index,
          command: commands[index],
          success: result.value.exitCode === 0,
          exitCode: result.value.exitCode,
          pid: result.value.pid
        };
      } else {
        return {
          index,
          command: commands[index],
          success: false,
          error: result.reason.message
        };
      }
    });

    // 更新并行组状态
    const hasFailure = processedResults.some(r => !r.success);
    const groupInfo = this.parallelGroups.get(groupId);
    if (groupInfo) {
      groupInfo.status = hasFailure ? 'failed' : 'completed';
      groupInfo.endTime = new Date().toISOString();
      groupInfo.results = processedResults;
    }

    // 更新状态存储
    if (this.currentConfigName && this.sessionStarted) {
      updateParallelGroup(this.currentConfigName, groupId, {
        status: groupInfo.status,
        endTime: groupInfo.endTime,
        results: processedResults
      });
    }

    if (hasFailure) {
      const failedCommands = processedResults.filter(r => !r.success);
      console.error(`\n❌ Parallel execution failed: ${failedCommands.length} commands failed`);

      if (killOnFail) {
        console.log('🧹 Killing all processes in the group...');
        this.killGroup(groupId);
      }

      return {
        success: false,
        groupId,
        results: processedResults,
        failedCount: failedCommands.length
      };
    }

    console.log(`✅ All ${commands.length} commands completed successfully`);
    return {
      success: true,
      groupId,
      results: processedResults
    };
  }

  /**
   * 解析命令字符串
   * @param {string} commandStr - 命令字符串
   * @returns {Object} { command, args }
   */
  parseCommand(commandStr) {
    const trimmed = commandStr.trim();

    if (!trimmed) {
      return { command: '', args: [] };
    }

    const parts = trimmed.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    return { command, args };
  }

  /**
   * 执行命令
   * @param {string} command - 命令
   * @param {string[]} args - 参数
   * @param {Object} options - spawn 选项
   * @returns {Promise<{exitCode: number, pid: number}>}
   */
  async executeCommand(command, args, options = {}) {
    const {
      cwd = process.cwd(),
      groupId = null,
      index = null
    } = options;

    const indexPrefix = index !== null ? `[${index + 1}] ` : '';

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: 'inherit',
        detached: false,
        ...options
      });

      // 跟踪进程
      this.childProcesses.add(proc);

      const procInfo = {
        pid: proc.pid,
        command: `${command} ${args.join(' ')}`,
        cwd,
        startTime: new Date().toISOString(),
        endTime: null,
        exitCode: null,
        status: 'running',
        type: groupId ? 'parallel' : 'single',
        groupId
      };

      console.log(`${indexPrefix}🔧 Started process: PID ${proc.pid} - ${procInfo.command}`);

      // 添加到并行组
      if (groupId) {
        const group = this.parallelGroups.get(groupId);
        if (group) {
          group.pids.push(proc.pid);
        }
      }

      // 保存进程信息
      if (this.currentConfigName && this.sessionStarted) {
        addProcess(this.currentConfigName, procInfo);
      }

      proc.on('close', (code) => {
        this.childProcesses.delete(proc);

        procInfo.status = 'stopped';
        procInfo.endTime = new Date().toISOString();
        procInfo.exitCode = code;

        console.log(`${indexPrefix}✅ Process ${proc.pid} finished with code ${code}`);

        if (this.currentConfigName && this.sessionStarted) {
          updateSession(this.currentConfigName, { processes: [procInfo] });
        }

        if (code === 0) {
          resolve({ exitCode: code, pid: proc.pid });
        } else {
          reject(new Error(`Process ${proc.pid} exited with code ${code}`));
        }
      });

      proc.on('error', (error) => {
        this.childProcesses.delete(proc);

        procInfo.status = 'stopped';
        procInfo.endTime = new Date().toISOString();

        console.error(`${indexPrefix}❌ Process ${proc.pid} failed: ${error.message}`);

        if (this.currentConfigName && this.sessionStarted) {
          updateSession(this.currentConfigName, { processes: [procInfo] });
        }

        reject(error);
      });
    });
  }

  /**
   * 杀死整个并行组的所有进程
   * @param {string} groupId - 并发组 ID
   */
  killGroup(groupId) {
    const group = this.parallelGroups.get(groupId);
    if (!group) return;

    for (const pid of group.pids) {
      this.terminateProcess(pid);
    }

    console.log(`✅ Killed all processes in group ${groupId}`);
  }

  /**
   * 终止指定进程
   * @param {number} pid - 进程 ID
   * @returns {boolean} 是否成功终止
   */
  terminateProcess(pid) {
    try {
      console.log(`🔫 Terminating process ${pid}...`);
      process.kill(pid, 'SIGTERM');

      // 3秒后强制杀死
      setTimeout(() => {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (e) {
          // 进程可能已经退出
        }
      }, 3000);

      // 从跟踪列表中移除
      this.childProcesses.forEach((proc, p) => {
        if (proc.pid === pid) {
          this.childProcesses.delete(proc);
        }
      });

      return true;
    } catch (error) {
      if (error.code === 'ESRCH') {
        return false;
      }
      console.warn(`⚠️  Failed to terminate process ${pid}: ${error.message}`);
      return false;
    }
  }

  /**
   * 清理所有进程
   */
  cleanup() {
    // 清理并行组
    for (const [groupId, group] of this.parallelGroups) {
      if (group.status === 'running') {
        console.log(`🧹 Cleaning up parallel group ${groupId}...`);
        this.killGroup(groupId);
      }
    }

    // 清理所有子进程
    const processesToClean = Array.from(this.childProcesses);

    if (processesToClean.length === 0) {
      console.log('🧹 No child processes to clean up');
      return;
    }

    console.log(`🧹 Cleaning up ${processesToClean.length} child processes...`);

    processesToClean.forEach(proc => {
      try {
        if (proc.pid && !proc.killed) {
          console.log(`🔫 Terminating process ${proc.pid}...`);
          proc.kill('SIGTERM');
        }
      } catch (error) {
        console.warn(`⚠️  Failed to clean up process ${proc.pid}: ${error.message}`);
      }
    });

    // 延迟清理
    setTimeout(() => {
      const remainingProcesses = Array.from(this.childProcesses).filter(proc => !proc.killed);
      if (remainingProcesses.length > 0) {
        console.warn(`⚠️  ${remainingProcesses.length} processes may still be running`);
      } else {
        console.log('✅ All child processes cleaned up');
      }
    }, 5000);

    this.parallelGroups.clear();
  }

  /**
   * 获取当前跟踪的进程数量
   */
  getActiveProcessCount() {
    return this.childProcesses.size;
  }

  /**
   * 获取所有活跃进程的信息
   */
  getActiveProcesses() {
    return Array.from(this.childProcesses).map(proc => ({
      pid: proc.pid,
      killed: proc.killed,
      signalCode: proc.signalCode
    }));
  }

  /**
   * 获取并行组信息
   */
  getParallelGroups() {
    return Array.from(this.parallelGroups).map(([id, group]) => ({
      id,
      ...group
    }));
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

    process.on('SIGINT', () => cleanup('SIGINT'));
    process.on('SIGTERM', () => cleanup('SIGTERM'));
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
   * 启动会话
   */
  startSession(configName) {
    ensureStateDir();
    this.currentConfigName = configName;
    this.sessionStarted = true;
    createSession(configName);
    console.log(`📝 Session started: ${configName}`);
  }

  /**
   * 结束会话
   */
  endSession() {
    if (this.currentConfigName && this.sessionStarted) {
      endSession(this.currentConfigName);
      console.log(`📝 Session ended: ${this.currentConfigName}`);
    }
    this.currentConfigName = null;
    this.sessionStarted = false;
  }
}

// 创建全局进程管理器实例
export const processManager = new ProcessManager();

export default processManager;
