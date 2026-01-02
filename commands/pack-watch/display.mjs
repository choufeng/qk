#!/usr/bin/env bun

import { formatTime, getDuration, truncate } from '../../lib/utils.mjs';

/**
 * 显示进程列表
 * @param {Object} session - 会话数据对象
 * @param {boolean} jsonOutput - 是否 JSON 格式输出
 */
export function displayProcesses(session, jsonOutput = false) {
  if (jsonOutput) {
    displayProcessesJson(session);
    return;
  }

  const { configName, startedAt, endedAt, processes } = session;

  // 计算统计
  const total = processes.length;
  const running = processes.filter(p => p.actualStatus === 'running').length;
  const stopped = total - running;

  // 显示头部
  console.log(`📋 Pack Session: ${configName}`);
  console.log(`🕐 Started: ${formatTime(startedAt)}`);
  console.log(`🏁 Ended: ${endedAt ? formatTime(endedAt) : 'N/A'}`);
  console.log(`📊 Processes: ${total} total, ${stopped} stopped, ${running} running`);
  console.log('');

  // 如果没有进程
  if (total === 0) {
    console.log('📭 No processes recorded');
    return;
  }

  // 显示进程列表
  console.log('Processes:');
  console.log('');

  // 表头
  console.log(
    '  ' +
    'Status  '.padEnd(8) +
    'PID     '.padEnd(8) +
    'Command'.padEnd(30) +
    'Status'.padEnd(12) +
    'Directory'
  );
  console.log(
    '  ' +
    '-'.repeat(7) + ' ' +
    '-'.repeat(6) + ' ' +
    '-'.repeat(29) + ' ' +
    '-'.repeat(11) + ' ' +
    '-'.repeat(20)
  );

  // 进程行
  for (const proc of processes) {
    const statusIcon = proc.actualStatus === 'running' ? '❌' : '✅';
    const statusText = proc.actualStatus === 'running' ? '[running]' : '[stopped]';

    const line =
      '  ' +
      `${statusIcon} `.padEnd(8) +
      `${proc.pid}`.padEnd(8) +
      truncate(proc.command, 28).padEnd(30) +
      statusText.padEnd(12) +
      truncate(proc.cwd, 20);

    console.log(line);

    // 如果进程正在运行，显示警告
    if (proc.actualStatus === 'running') {
      console.log(`     ⚠️  Orphan process detected!`);
    }
  }

  console.log('');

  // 如果有残留进程，显示提示
  const orphanProcesses = processes.filter(p => p.actualStatus === 'running');
  if (orphanProcesses.length > 0) {
    console.log(`⚠️  Found ${orphanProcesses.length} orphan process(es)!`);
    console.log('');
    console.log('💡 To terminate:');
    console.log(`   qk pack-watch ${configName} --kill           # Terminate all`);
    console.log(`   qk pack-watch ${configName} --kill <pid>     # Terminate specific`);
    console.log('');
  } else {
    console.log('✅ All processes have stopped correctly!');
    console.log('');
    console.log('💡 Clean up the session file with:');
    console.log(`   qk pack-watch ${configName} --clean`);
  }
}

/**
 * JSON 格式输出
 * @param {Object} session - 会话数据对象
 */
function displayProcessesJson(session) {
  const output = {
    configName: session.configName,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    processes: session.processes.map(p => ({
      pid: p.pid,
      command: p.command,
      cwd: p.cwd,
      status: p.actualStatus,
      startTime: p.startTime,
      endTime: p.endTime
    })),
    statistics: {
      total: session.processes.length,
      running: session.processes.filter(p => p.actualStatus === 'running').length,
      stopped: session.processes.filter(p => p.actualStatus === 'stopped').length
    }
  };

  console.log(JSON.stringify(output, null, 2));
}

export default displayProcesses;
