#!/usr/bin/env bun

import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

/**
 * 并发执行器
 * 用于并行执行多个命令，支持失败快跑和统一清理
 */
export class ParallelExecutor {
  constructor() {
    this.processes = new Map(); // pid -> { proc, command, groupId }
    this.groupCount = 0;
  }

  /**
   * 并发执行多个命令
   * @param {string[]} commands - 命令数组 ["cmd1 arg", "cmd2 arg"]
   * @param {Object} options - 执行选项
   * @param {string} options.cwd - 工作目录
   * @param {boolean} options.killOnFail - 失败时杀死其他
   * @param {Function} options.onSpawn - 子进程启动回调 (groupId, index, pid, command) => void
   * @param {string} options.groupId - 并发组 ID（可选）
   * @returns {Promise<{success: boolean, groupId: string, results: Array}>}
   */
  async execute(commands, options = {}) {
    const {
      cwd = process.cwd(),
      killOnFail = true,
      onSpawn = () => {},
      groupId = `parallel-${++this.groupCount}-${Date.now()}`
    } = options;

    if (!Array.isArray(commands) || commands.length === 0) {
      return {
        success: true,
        groupId,
        results: [],
        message: 'No commands to execute'
      };
    }

    console.log(`🚀 Starting ${commands.length} commands in parallel (group: ${groupId})`);

    // 解析命令
    const parsedCommands = commands.map((cmd, index) => this.parseCommand(cmd));

    // 并发启动所有命令
    const results = await Promise.allSettled(
      parsedCommands.map((parsed, index) =>
        this.executeSingle(parsed.command, parsed.args, {
          cwd,
          groupId,
          index,
          onSpawn,
          killOnFail: killOnFail && index > 0 // 第一个失败时才触发快跑
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
          error: result.reason.message,
          pid: result.value?.pid
        };
      }
    });

    // 检查是否有失败
    const hasFailure = processedResults.some(r => !r.success);
    const failedCommands = processedResults.filter(r => !r.success);

    if (hasFailure) {
      console.error(`\n❌ Parallel execution failed: ${failedCommands.length} commands failed`);

      if (killOnFail) {
        console.log('🧹 Killing all processes in the group...');
        this.killGroup(groupId);
      }

      return {
        success: false,
        groupId,
        results: processedResults,
        failedCount: failedCommands.length,
        failedCommands: failedCommands.map(r => r.command)
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
   * 失败快跑模式：一个失败立即停止其他
   * @param {string[]} commands - 命令数组
   * @param {Object} options - 执行选项
   */
  async executeWithFailFast(commands, options = {}) {
    const { cwd = process.cwd(), onSpawn = () => {} } = options;

    if (!Array.isArray(commands) || commands.length === 0) {
      return { success: true, results: [] };
    }

    const groupId = `failfast-${Date.now()}`;
    const results = [];
    let firstFailureIndex = null;

    // 逐个启动，但使用 Promise.race 检测失败
    for (let i = 0; i < commands.length; i++) {
      if (firstFailureIndex !== null) {
        // 已经有一个失败了，跳过剩余命令
        console.log(`⏭️  Skipping command ${i + 1}: ${commands[i]}`);
        results.push({
          index: i,
          command: commands[i],
          success: false,
          skipped: true
        });
        continue;
      }

      const { command, args } = this.parseCommand(commands[i]);

      try {
        const result = await this.executeSingle(command, args, {
          cwd,
          groupId,
          index: i,
          onSpawn,
          killOnFail: true
        });

        results.push({
          index: i,
          command: commands[i],
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          pid: result.pid
        });

        if (result.exitCode !== 0) {
          firstFailureIndex = i;
          console.log(`\n⚠️  Command failed at index ${i}, stopping other commands...`);
          this.killGroup(groupId);
        }

      } catch (error) {
        results.push({
          index: i,
          command: commands[i],
          success: false,
          error: error.message
        });
        firstFailureIndex = i;
        this.killGroup(groupId);
      }
    }

    return {
      success: firstFailureIndex === null,
      groupId,
      results,
      firstFailureIndex
    };
  }

  /**
   * 执行单个命令
   */
  async executeSingle(command, args, options = {}) {
    const {
      cwd,
      groupId,
      index,
      onSpawn,
      killOnFail = false
    } = options;

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: 'inherit',
        detached: false,
        cwd
      });

      // 生成索引前缀
      const indexPrefix = `[${index + 1}]`;

      // 注册到进程管理器
      const procInfo = {
        proc,
        command: `${command} ${args.join(' ')}`,
        groupId,
        startTime: new Date().toISOString()
      };

      this.processes.set(proc.pid, procInfo);

      // 触发回调
      onSpawn(groupId, index, proc.pid, procInfo.command);

      // 输出启动信息
      console.log(`${indexPrefix}🔧 Started process: PID ${proc.pid} - ${procInfo.command}`);

      proc.on('close', (code) => {
        this.processes.delete(proc.pid);

        console.log(`${indexPrefix}✅ Process ${proc.pid} finished with code ${code}`);

        if (code === 0) {
          resolve({ exitCode: code, pid: proc.pid });
        } else {
          const error = new Error(`Process ${proc.pid} exited with code ${code}`);
          error.exitCode = code;
          error.pid = proc.pid;

          if (killOnFail) {
            reject(error);
          } else {
            resolve({ exitCode: code, pid: proc.pid });
          }
        }
      });

      proc.on('error', (error) => {
        this.processes.delete(proc.pid);
        console.error(`${indexPrefix}❌ Process ${proc.pid} failed: ${error.message}`);
        reject(error);
      });
    });
  }

  /**
   * 解析命令字符串
   * @param {string} commandStr - 命令字符串 "cmd arg1 arg2"
   * @returns {Object} { command, args }
   */
  parseCommand(commandStr) {
    const trimmed = commandStr.trim();

    if (!trimmed) {
      return { command: '', args: [] };
    }

    // 简单的空格分割，不处理引号内的空格
    const parts = trimmed.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    return { command, args };
  }

  /**
   * 杀死整个并发组的所有进程
   * @param {string} groupId - 并发组 ID
   */
  killGroup(groupId) {
    let killedCount = 0;

    for (const [pid, procInfo] of this.processes) {
      if (procInfo.groupId === groupId) {
        try {
          console.log(`🔫 Terminating process ${pid} (group: ${groupId})...`);
          procInfo.proc.kill('SIGTERM');
          killedCount++;

          // 3秒后强制杀死
          setTimeout(() => {
            try {
              if (procInfo.proc && !procInfo.proc.killed) {
                console.log(`💀 Force killing process ${pid}...`);
                procInfo.proc.kill('SIGKILL');
              }
            } catch (e) {
              // 进程可能已经退出
            }
          }, 3000);

        } catch (error) {
          console.warn(`⚠️  Failed to kill process ${pid}: ${error.message}`);
        }
      }
    }

    // 清理已完成的进程记录
    this.cleanupGroup(groupId);

    console.log(`✅ Killed ${killedCount} processes in group ${groupId}`);
  }

  /**
   * 清理进程记录
   * @param {string} groupId - 并发组 ID
   */
  cleanupGroup(groupId) {
    for (const [pid, procInfo] of this.processes) {
      if (procInfo.groupId === groupId) {
        this.processes.delete(pid);
      }
    }
  }

  /**
   * 清理所有进程
   */
  cleanupAll() {
    const allPids = Array.from(this.processes.keys());

    if (allPids.length === 0) {
      console.log('🧹 No processes to clean up');
      return;
    }

    console.log(`🧹 Cleaning up ${allPids.length} processes...`);

    for (const pid of allPids) {
      try {
        const procInfo = this.processes.get(pid);
        if (procInfo && !procInfo.proc.killed) {
          procInfo.proc.kill('SIGTERM');
        }
      } catch (error) {
        console.warn(`⚠️  Failed to clean up process ${pid}: ${error.message}`);
      }
    }

    // 延迟清理
    setTimeout(() => {
      for (const pid of allPids) {
        try {
          const procInfo = this.processes.get(pid);
          if (procInfo && !procInfo.proc.killed) {
            procInfo.proc.kill('SIGKILL');
          }
        } catch (e) {
          // 进程可能已经退出
        }
      }
    }, 3000);

    this.processes.clear();
    console.log('✅ All processes cleaned up');
  }

  /**
   * 获取活跃进程数量
   */
  getActiveProcessCount() {
    return this.processes.size;
  }

  /**
   * 获取所有活跃进程的 PID
   */
  getActivePids() {
    return Array.from(this.processes.keys());
  }
}

// 创建全局实例
export const parallelExecutor = new ParallelExecutor();
export default parallelExecutor;
