#!/usr/bin/env bun

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { processManager } from '../../lib/process-manager.mjs';

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * 加载 pack 配置文件
 * @param {string} configName - 配置名称
 * @returns {Promise<Object[]>} 配置数组
 */
export async function loadConfig(configName) {
  const configDir = join(homedir(), '.config', 'qk');
  const configPath = join(configDir, `pack-${configName}.json`);

  // 自动创建配置目录（如果不存在）
  if (!existsSync(configDir)) {
    try {
      mkdirSync(configDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create config directory: ${configDir}`);
    }
  }

  if (!existsSync(configPath)) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (!Array.isArray(config)) {
      throw new Error('Configuration must be an array');
    }

    // 验证 commands 格式
    if (!Array.isArray(config)) {
      throw new Error('Configuration must be an array');
    }

    // 验证必需字段
    for (let i = 0; i < config.length; i++) {
      const item = config[i];
      const errors = [];

      if (!item.name) errors.push('name');
      if (!item.type) errors.push('type');
      if (!item.dir) errors.push('dir');
      if (!item.commands) errors.push('commands');

      if (errors.length > 0) {
        throw new Error(`Item ${i + 1} is missing required fields: ${errors.join(', ')}`);
      }

      // 验证 commands 数组格式
      if (!Array.isArray(item.commands)) {
        throw new Error(`Item "${item.name}": commands must be an array`);
      }

      // 验证每个命令项
      item.commands.forEach((cmd, cmdIndex) => {
        if (typeof cmd === 'string') {
          // 字符串命令：验证非空
          if (!cmd || typeof cmd !== 'string' || !cmd.trim()) {
            throw new Error(
              `Item "${item.name}" command ${cmdIndex + 1}: cannot be empty`
            );
          }
        } else if (Array.isArray(cmd)) {
          // 数组命令：验证非空数组
          if (cmd.length === 0) {
            throw new Error(
              `Item "${item.name}" command ${cmdIndex + 1}: parallel array cannot be empty`
            );
          }
          // 验证每个子命令
          cmd.forEach((subCmd, subIndex) => {
            if (!subCmd || typeof subCmd !== 'string' || !subCmd.trim()) {
              throw new Error(
                `Item "${item.name}" command ${cmdIndex + 1}[${subIndex}]: ` +
                `must be a non-empty string`
              );
            }
          });
        } else {
          throw new Error(
            `Item "${item.name}" command ${cmdIndex + 1}: ` +
            `must be string or array of strings`
          );
        }
      });

      if (!['package', 'app'].includes(item.type)) {
        throw new Error(`Item "${item.name}" has invalid type: "${item.type}" (must be "package" or "app")`);
      }
    }

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 展开路径中的环境变量
 * @param {string} path - 路径
 * @returns {string} 展开后的路径
 */
export function resolvePath(path) {
  if (!path) return path;

  let resolved = path;

  // 展开 $HOME
  if (process.env.HOME) {
    resolved = resolved.replace(/\$HOME/g, process.env.HOME);
  }

  // 展开 ~
  const homeDir = homedir();
  resolved = resolved.replace(/~/g, homeDir);

  return resolved;
}

// ============================================================================
// Dependency Graph
// ============================================================================

/**
 * 验证依赖关系
 * @param {Object[]} items - 配置项数组
 * @throws {Error} 当存在循环依赖或缺失依赖时
 */
export function validateDependencies(items) {
  const nameToIndex = new Map();
  items.forEach((item, index) => {
    nameToIndex.set(item.name, index);
  });

  // 检查依赖是否存在
  for (const item of items) {
    if (item.depends_on) {
      if (!nameToIndex.has(item.depends_on)) {
        throw new Error(`Dependency "${item.depends_on}" not found for item "${item.name}"`);
      }
    }
  }

  // 检测循环依赖
  const visited = new Set();
  const recursionStack = new Set();

  function detectCycle(itemName) {
    if (recursionStack.has(itemName)) {
      throw new Error(`Circular dependency detected involving "${itemName}"`);
    }

    if (visited.has(itemName)) {
      return;
    }

    visited.add(itemName);
    recursionStack.add(itemName);

    const item = items.find(i => i.name === itemName);
    if (item && item.depends_on) {
      detectCycle(item.depends_on);
    }

    recursionStack.delete(itemName);
  }

  for (const item of items) {
    detectCycle(item.name);
  }
}

/**
 * 构建依赖图
 * @param {Object[]} items - 配置项数组
 * @returns {Map<string, string[]>} 依赖图（item -> dependencies）
 */
export function buildDependencyGraph(items) {
  const graph = new Map();

  for (const item of items) {
    graph.set(item.name, item.depends_on ? [item.depends_on] : []);
  }

  return graph;
}

/**
 * 拓扑排序
 * @param {Map<string, string[]>} graph - 依赖图
 * @param {Object[]} items - 配置项数组
 * @returns {Object[]} 排序后的配置项数组
 */
export function topologicalSort(graph, items) {
  const nameToItem = new Map(items.map(item => [item.name, item]));
  const inDegree = new Map();
  const nameSet = new Set(graph.keys());

  // 初始化入度
  for (const name of nameSet) {
    inDegree.set(name, 0);
  }

  // 计算入度
  for (const [name, deps] of graph) {
    for (const dep of deps) {
      if (inDegree.has(dep)) {
        inDegree.set(name, inDegree.get(name) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue = [];
  for (const [name, degree] of inDegree) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  const sorted = [];
  while (queue.length > 0) {
    const name = queue.shift();
    sorted.push(nameToItem.get(name));

    // 找到所有依赖当前项的项
    for (const [otherName, deps] of graph) {
      if (deps.includes(name)) {
        const newDegree = inDegree.get(otherName) - 1;
        inDegree.set(otherName, newDegree);
        if (newDegree === 0) {
          queue.push(otherName);
        }
      }
    }
  }

  if (sorted.length !== items.length) {
    throw new Error('Topological sort failed (cycle detected)');
  }

  return sorted;
}

// ============================================================================
// Version Management
// ============================================================================

/**
 * 读取 package.json 中的 version
 * @param {string} dir - package 目录
 * @returns {string} version
 */
export function readPackageVersion(dir) {
  const packageJsonPath = join(dir, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${dir}`);
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);

    if (!packageJson.version) {
      throw new Error('package.json is missing "version" field');
    }

    return packageJson.version;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid package.json in ${dir}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 更新 package.json 中的 version
 * @param {string} dir - package 目录
 * @param {string} newVersion - 新的 version
 */
export function updatePackageVersion(dir, newVersion) {
  const packageJsonPath = join(dir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  packageJson.version = newVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

/**
 * 更新 package.json 中的依赖路径
 * @param {string} dir - package 目录
 * @param {string} depName - 依赖名称
 * @param {string} depPath - 新的依赖路径
 */
export function updatePackageDependency(dir, depName, depPath) {
  const packageJsonPath = join(dir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

  // 支持 dependencies、devDependencies 和 peerDependencies
  const depTypes = ['dependencies', 'devDependencies', 'peerDependencies'];
  let modified = false;

  for (const depType of depTypes) {
    if (packageJson[depType] && packageJson[depType][depName]) {
      packageJson[depType][depName] = depPath;
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }
}

/**
 * 生成时间戳
 * @returns {string} 格式：YYYYMMDDHHmmss
 */
export function generateTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * 生成 alpha 版本号
 * @param {string} baseVersion - 基础版本号
 * @returns {string} 新的 alpha 版本号
 */
export function generateAlphaVersion(baseVersion) {
  const timestamp = generateTimestamp();
  
  // 检查版本号是否已经包含 alpha 标签
  const alphaRegex = /-alpha\.\d+$/;
  
  if (alphaRegex.test(baseVersion)) {
    // 如果已经包含 alpha 标签，替换时间戳
    return baseVersion.replace(alphaRegex, `-alpha.${timestamp}`);
  } else {
    // 如果不包含 alpha 标签，添加新的 alpha 标签
    return `${baseVersion}-alpha.${timestamp}`;
  }
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * 清除目录下的所有 .tgz 文件
 * @param {string} dir - 目录路径
 */
export function cleanTgzFiles(dir) {
  if (!existsSync(dir)) {
    return;
  }

  const files = readdirSync(dir);
  const tgzFiles = files.filter(file => file.endsWith('.tgz'));

  for (const file of tgzFiles) {
    const filePath = join(dir, file);
    try {
      unlinkSync(filePath);
    } catch (error) {
      // 忽略删除失败
    }
  }
}

/**
 * 获取 package.json 中的实际包名
 * @param {string} dir - 目录路径
 * @returns {string} 实际包名
 */
export function getActualPackageName(dir) {
  const packageJsonPath = join(dir, 'package.json');
  
  if (!existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${dir}`);
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(content);
    
    if (!packageJson.name) {
      throw new Error('package.json is missing "name" field');
    }

    return packageJson.name;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid package.json in ${dir}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 将包名转换为 npm pack 使用的文件名前缀
 * @param {string} packageName - 包名
 * @returns {string} 文件名前缀
 */
export function packageNameToFilenamePrefix(packageName) {
  // 处理作用域包，如 @uc/modal-agent-orders → uc-modal--agent-orders.react
  if (packageName.startsWith('@')) {
    const parts = packageName.slice(1).split('/');
    if (parts.length === 2) {
      // 作用域包：@scope/name → scope--name
      // 注意：实际文件名可能包含 .react 后缀，这由 npm pack 决定
      return `${parts[0]}--${parts[1]}`;
    }
  }
  
  return packageName;
}

/**
 * 查找生成的 .tgz 文件
 * @param {string} dir - 目录路径
 * @param {string} packageName - 包名（配置中的名称）
 * @param {string} version - 版本号
 * @returns {string} .tgz 文件完整路径
 */
export function findTgzFile(dir, packageName, version) {
  if (!existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  // 获取 package.json 中的实际包名
  const actualPackageName = getActualPackageName(dir);
  const filenamePrefix = packageNameToFilenamePrefix(actualPackageName);

  // 尝试精确匹配（使用实际包名和版本）
  const expectedName = `${filenamePrefix}-${version}.tgz`;
  const exactPath = join(dir, expectedName);

  if (existsSync(exactPath)) {
    return exactPath;
  }

  // 查找所有 .tgz 文件
  const allTgzFiles = readdirSync(dir).filter(file => file.endsWith('.tgz'));
  
  if (allTgzFiles.length === 0) {
    throw new Error(`No .tgz files found in ${dir}`);
  }

  // 优先匹配包含版本号的文件
  const versionMatches = allTgzFiles.filter(file => file.includes(version));
  
  if (versionMatches.length > 0) {
    // 在包含版本号的文件中，优先匹配前缀
    const prefixMatches = versionMatches.filter(file => 
      file.startsWith(`${filenamePrefix}-`)
    );
    
    if (prefixMatches.length > 0) {
      // 返回最新的匹配文件
      return getNewestFile(dir, prefixMatches);
    }
    
    // 如果前缀不匹配，返回包含版本号的最新文件
    return getNewestFile(dir, versionMatches);
  }

  // 如果没有版本匹配，尝试前缀匹配
  const prefixMatches = allTgzFiles.filter(file => 
    file.startsWith(`${filenamePrefix}-`)
  );
  
  if (prefixMatches.length > 0) {
    return getNewestFile(dir, prefixMatches);
  }

  // 最后尝试配置中的包名匹配（向后兼容）
  const configMatches = allTgzFiles.filter(file => 
    file.startsWith(`${packageName}-`)
  );
  
  if (configMatches.length > 0) {
    return getNewestFile(dir, configMatches);
  }

  // 如果都没有匹配，返回最新的 .tgz 文件
  console.warn(`⚠️  No exact match found for ${packageName}, returning newest .tgz file`);
  return getNewestFile(dir, allTgzFiles);
}

/**
 * 获取最新的文件
 * @param {string} dir - 目录路径
 * @param {string[]} files - 文件列表
 * @returns {string} 最新文件的完整路径
 */
export function getNewestFile(dir, files) {
  const sortedFiles = files.map(file => ({
    name: file,
    path: join(dir, file)
  })).sort((a, b) => {
    try {
      const statA = statSync(a.path).mtimeMs;
      const statB = statSync(b.path).mtimeMs;
      return statB - statA; // 降序，最新的在前
    } catch {
      return 0;
    }
  });

  return sortedFiles[0].path;
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * 替换占位符
 * @param {string} command - 命令
 * @param {Object} dependencyOutputs - 依赖项输出映射 { name: { tarballPath, packageName } }
 * @returns {string} 替换后的命令
 */
export function replacePlaceholders(command, dependencyOutputs) {
  // 检测是否是 pnpm add 命令
  const isPnpmAdd = /\.?\/?(pnpm)\s+add\s+/.test(command);
  
  return command.replace(/\{\{([\w-]+)\}\}/g, (match, name) => {
    const dep = dependencyOutputs[name];
    if (!dep) {
      throw new Error(`Unknown dependency: "${name}" in command "${command}"`);
    }
    
    // 如果是 pnpm add 命令且有包名信息，使用 package@file:path 格式
    // 这样可以避免 pnpm 检查 lockfile 中的旧路径
    if (isPnpmAdd && dep.packageName) {
      return `${dep.packageName}@file:${dep.tarballPath}`;
    }
    
    // 向后兼容：支持旧格式（直接是路径字符串）
    return dep.tarballPath || dep;
  });
}

/**
 * 执行单个命令
 * @param {string} command - 命令（格式: "cmd arg1 arg2"）
 * @param {string} dir - 执行目录
 * @param {Object} dependencyOutputs - 依赖项输出映射
 * @returns {Promise<void>}
 */
export async function executeCommand(command, dir, dependencyOutputs) {
  const resolvedCommand = replacePlaceholders(command, dependencyOutputs);

  // 拆分命令和参数
  const parts = resolvedCommand.split(/\s+/).filter(part => part.length > 0);
  const cmd = parts[0];
  const args = parts.slice(1);

  try {
    await processManager.executeCommand(cmd, args, {
      cwd: dir,
      shell: false
    });
  } catch (error) {
    throw new Error(`Failed to execute "${resolvedCommand}": ${error.message}`);
  }
}

/**
 * 执行命令序列（支持串行和并行）
 * @param {Array} commands - 命令数组（字符串或字符串数组）
 * @param {string} dir - 执行目录
 * @param {Object} dependencyOutputs - 依赖项输出映射
 */
export async function executeCommands(commands, dir, dependencyOutputs) {
  const resolvedDir = resolvePath(dir);

  for (let i = 0; i < commands.length; i++) {
    const commandItem = commands[i];

    // === 并发执行（数组） ===
    if (Array.isArray(commandItem)) {
      console.log(`\n🚀 Parallel execution (${commandItem.length} commands)`);

      const parallelCommands = commandItem.map(cmd => {
        // 替换占位符
        let resolvedCmd = replacePlaceholders(cmd, dependencyOutputs);

        // pnpm install 特殊处理
        if (resolvedCmd.startsWith('pnpm install')) {
          if (resolvedCmd.includes('.tgz')) {
            resolvedCmd = resolvedCmd.replace(/^(pnpm install)/, '$1 --force');
          }
          resolvedCmd += ' --ignore-workspace';
        }

        return resolvedCmd;
      });

      try {
        const result = await processManager.executeCommandsParallel(parallelCommands, {
          cwd: resolvedDir,
          killOnFail: true
        });

        if (!result.success) {
          throw new Error(
            `${result.failedCount} parallel commands failed: ${result.failedCommands?.join(', ')}`
          );
        }

      } catch (error) {
        console.error(`\n❌ Parallel execution failed: ${error.message}`);
        throw error;
      }

    // === 串行执行（字符串） ===
    } else if (typeof commandItem === 'string') {
      let modifiedCommand = commandItem;

      // 替换占位符
      modifiedCommand = replacePlaceholders(modifiedCommand, dependencyOutputs);

      // pnpm install 特殊处理
      if (modifiedCommand.startsWith('pnpm install')) {
        if (modifiedCommand.includes('.tgz')) {
          modifiedCommand = modifiedCommand.replace(/^(pnpm install)/, '$1 --force');
        }
        modifiedCommand += ' --ignore-workspace';
      }

      console.log(`     ⚡ Execute: ${modifiedCommand}`);
      await executeCommand(modifiedCommand, dir, dependencyOutputs);

    // === 错误处理 ===
    } else {
      throw new Error(`Invalid command type at index ${i}: ${typeof commandItem}`);
    }
  }
}

/**
 * 执行 package 项
 * @param {Object} item - 配置项
 * @param {Object} dependencyOutputs - 依赖项输出映射
 * @returns {Promise<{tarballPath: string, packageName: string}>} 生成的 .tgz 文件路径和包名
 */
export async function executePackageItem(item, dependencyOutputs) {
  const dir = resolvePath(item.dir);
  const packageJsonPath = join(dir, 'package.json');
  const originalVersion = readPackageVersion(dir);
  const alphaVersion = generateAlphaVersion(originalVersion);

  // 获取实际包名（从 package.json 中读取）
  const actualPackageName = getActualPackageName(dir);

  // 备份原始 package.json 内容，确保执行后恢复
  const originalPackageJsonContent = readFileSync(packageJsonPath, 'utf-8');

  console.log(`  📦 Package: ${item.name}`);
  console.log(`     Package Name: ${actualPackageName}`);
  console.log(`     Version: ${originalVersion} → ${alphaVersion}`);

  // 1. 修改 version
  updatePackageVersion(dir, alphaVersion);

  try {
    // 2. 清理旧的 .tgz 文件
    cleanTgzFiles(dir);
    console.log('     🧹 Cleaned old .tgz files');

    // 3. 如果有依赖项，更新 package.json 依赖路径
    if (item.depends_on && dependencyOutputs[item.depends_on]) {
      // 更新 package.json 中的依赖路径为新的 tarball 路径
      const dep = dependencyOutputs[item.depends_on];
      const depTgzPath = dep.tarballPath || dep;
      const depPackageName = dep.packageName || item.depends_on;
      console.log(`     📝 Update ${depPackageName} dependency to ${depTgzPath.split('/').pop()}`);
      updatePackageDependency(dir, depPackageName, `file:${depTgzPath}`);
    }

    // 4. 执行命令序列（支持串行和并行）
    if (item.commands && item.commands.length > 0) {
      await executeCommands(item.commands, dir, dependencyOutputs);
    }

    // 5. 查找生成的 .tgz 文件
    const tgzPath = findTgzFile(dir, item.name, alphaVersion);
    console.log(`     ✅ Generated: ${tgzPath.split('/').pop()}`);

    // 返回包含 tarballPath 和 packageName 的对象
    return {
      tarballPath: tgzPath,
      packageName: actualPackageName
    };
  } finally {
    // 7. 恢复原始 package.json（包括 version 和 dependencies）
    writeFileSync(packageJsonPath, originalPackageJsonContent);
    console.log(`     🔄 package.json restored for ${item.name}`);
  }
}

/**
 * 执行 app 项
 * @param {Object} item - 配置项
 * @param {Object} dependencyOutputs - 依赖项输出映射 { name: { tarballPath, packageName } }
 * @returns {Promise<void>}
 */
export async function executeAppItem(item, dependencyOutputs) {
  const dir = resolvePath(item.dir);
  const packageJsonPath = join(dir, 'package.json');

  // 备份原始 package.json 内容，确保执行后恢复
  const originalPackageJsonContent = existsSync(packageJsonPath)
    ? readFileSync(packageJsonPath, 'utf-8')
    : null;

  console.log(`  🚀 App: ${item.name}`);

  try {
    // 1. 如果有依赖项，更新 package.json 依赖路径
    if (item.depends_on && dependencyOutputs[item.depends_on]) {
      // 更新 package.json 中的依赖路径为新的 tarball 路径
      const dep = dependencyOutputs[item.depends_on];
      const depTgzPath = dep.tarballPath || dep;
      const depPackageName = dep.packageName || item.depends_on;
      console.log(`     📝 Update ${depPackageName} dependency to ${depTgzPath.split('/').pop()}`);
      updatePackageDependency(dir, depPackageName, `file:${depTgzPath}`);
    }

    // 2. 执行命令序列（支持串行和并行）
    if (item.commands && item.commands.length > 0) {
      await executeCommands(item.commands, dir, dependencyOutputs);
    }
  } finally {
    // 3. 恢复原始 package.json
    if (originalPackageJsonContent) {
      writeFileSync(packageJsonPath, originalPackageJsonContent);
      console.log(`     🔄 package.json restored for ${item.name}`);
    }
  }
}

// ============================================================================
// Chain Execution
// ============================================================================

/**
 * 执行链式打包
 * @param {Object[]} items - 配置项数组
 * @returns {Promise<void>}
 */
export async function executeChain(items) {
  // 验证依赖
  validateDependencies(items);

  // 构建依赖图
  const graph = buildDependencyGraph(items);

  // 拓扑排序
  const sortedItems = topologicalSort(graph, items);

  console.log('📋 Execution order:');
  sortedItems.forEach((item, index) => {
    const dep = item.depends_on ? ` (depends on: ${item.depends_on})` : '';
    console.log(`  ${index + 1}. [${item.type}] ${item.name}${dep}`);
  });
  console.log('');

  // 依次执行
  // dependencyOutputs 存储格式: { name: { tarballPath, packageName } }
  const dependencyOutputs = {};

  for (const item of sortedItems) {
    console.log(`\n▶️  Executing: ${item.name}`);

    try {
      if (item.type === 'package') {
        // executePackageItem 返回 { tarballPath, packageName }
        const result = await executePackageItem(item, dependencyOutputs);
        dependencyOutputs[item.name] = result;
      } else {
        await executeAppItem(item, dependencyOutputs);
      }
    } catch (error) {
      console.error(`\n❌ Failed to execute "${item.name}": ${error.message}`);
      throw error;
    }
  }

  console.log('\n✅ Chain execution completed successfully!');
}

export default {
  loadConfig,
  resolvePath,
  validateDependencies,
  buildDependencyGraph,
  topologicalSort,
  readPackageVersion,
  updatePackageVersion,
  generateTimestamp,
  generateAlphaVersion,
  cleanTgzFiles,
  getActualPackageName,
  packageNameToFilenamePrefix,
  findTgzFile,
  getNewestFile,
  replacePlaceholders,
  executeCommand,
  executeCommands,
  executePackageItem,
  executeAppItem,
  executeChain
};
