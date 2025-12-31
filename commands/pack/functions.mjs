#!/usr/bin/env bun

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';

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

      if (!['package', 'app'].includes(item.type)) {
        throw new Error(`Item "${item.name}" has invalid type: "${item.type}" (must be "package" or "app")`);
      }

      if (item.type === 'package' && item.auto_pack === undefined) {
        item.auto_pack = true; // 默认对 package 启用 auto_pack
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
  return `${baseVersion}-alpha.${timestamp}`;
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
 * 查找生成的 .tgz 文件
 * @param {string} dir - 目录路径
 * @param {string} packageName - 包名
 * @param {string} version - 版本号
 * @returns {string} .tgz 文件完整路径
 */
export function findTgzFile(dir, packageName, version) {
  if (!existsSync(dir)) {
    throw new Error(`Directory not found: ${dir}`);
  }

  // 尝试精确匹配
  const expectedName = `${packageName}-${version}.tgz`;
  const exactPath = join(dir, expectedName);

  if (existsSync(exactPath)) {
    return exactPath;
  }

  // 查找最新的 .tgz 文件
  const files = readdirSync(dir).filter(file => file.endsWith('.tgz') && file.startsWith(`${packageName}-`));

  if (files.length === 0) {
    throw new Error(`No .tgz file found for ${packageName} in ${dir}`);
  }

  // 按修改时间排序，返回最新的
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
 * @param {Object} dependencyOutputs - 依赖项输出映射
 * @returns {string} 替换后的命令
 */
export function replacePlaceholders(command, dependencyOutputs) {
  return command.replace(/\{\{([\w-]+)\}\}/g, (match, name) => {
    if (dependencyOutputs[name]) {
      return dependencyOutputs[name];
    }
    throw new Error(`Unknown dependency: "${name}" in command "${command}"`);
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

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: dir,
      stdio: 'inherit',
      shell: false
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${resolvedCommand}" exited with code ${code}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to execute "${resolvedCommand}": ${error.message}`));
    });
  });
}

/**
 * 执行 package 项
 * @param {Object} item - 配置项
 * @param {Object} dependencyOutputs - 依赖项输出映射
 * @returns {Promise<string>} 生成的 .tgz 文件路径
 */
export async function executePackageItem(item, dependencyOutputs) {
  const dir = resolvePath(item.dir);
  const packageJsonPath = join(dir, 'package.json');
  const originalVersion = readPackageVersion(dir);
  const alphaVersion = generateAlphaVersion(originalVersion);

  // 备份原始 package.json 内容，确保执行后恢复
  const originalPackageJsonContent = readFileSync(packageJsonPath, 'utf-8');

  console.log(`  📦 Package: ${item.name}`);
  console.log(`     Version: ${originalVersion} → ${alphaVersion}`);

  // 1. 修改 version
  updatePackageVersion(dir, alphaVersion);

  try {
    // 2. 清理旧的 .tgz 文件
    cleanTgzFiles(dir);
    console.log('     🧹 Cleaned old .tgz files');

    // 3. 如果有依赖项，清除 node_modules 并更新 package.json 依赖路径
    if (item.depends_on && dependencyOutputs[item.depends_on]) {
      console.log('     🗑️  Clear node_modules');
      await executeCommand('rm -rf node_modules', dir, {});
      
      // 更新 package.json 中的依赖路径为新的 tarball 路径
      const depTgzPath = dependencyOutputs[item.depends_on];
      const depName = item.depends_on.split('/').pop();
      console.log(`     📝 Update ${depName} dependency to ${depTgzPath.split('/').pop()}`);
      updatePackageDependency(dir, depName, `file:${depTgzPath}`);
    }

    // 4. 执行命令序列（替换 {{package-name}} 占位符）
    if (item.commands && item.commands.length > 0) {
      for (const command of item.commands) {
        let modifiedCommand = command;
        
        // 如果命令是 pnpm install
        if (command.startsWith('pnpm install')) {
          // 如果包含 tarball 路径，添加 --force
          if (command.includes('.tgz')) {
            modifiedCommand = modifiedCommand.replace(/^(pnpm install)/, '$1 --force');
          }
          // 添加 --ignore-workspace 以避免 workspace 依赖解析错误
          modifiedCommand += ' --ignore-workspace';
        }
        
        console.log(`     ⚡ Execute: ${modifiedCommand}`);
        await executeCommand(modifiedCommand, dir, dependencyOutputs);
      }
    }

    // 5. 执行 pnpm pack
    if (item.auto_pack) {
      console.log(`     📦 Execute: pnpm pack`);
      await executeCommand('pnpm pack', dir, dependencyOutputs);
    }

    // 6. 查找生成的 .tgz 文件
    const tgzPath = findTgzFile(dir, item.name, alphaVersion);
    console.log(`     ✅ Generated: ${tgzPath}`);

    return tgzPath;
  } finally {
    // 7. 恢复原始 package.json（包括 version 和 dependencies）
    writeFileSync(packageJsonPath, originalPackageJsonContent);
    console.log(`     🔄 package.json restored for ${item.name}`);
  }
}

/**
 * 执行 app 项
 * @param {Object} item - 配置项
 * @param {Object} dependencyOutputs - 依赖项输出映射
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
    // 1. 如果有依赖项，清除 node_modules 并更新 package.json 依赖路径
    if (item.depends_on && dependencyOutputs[item.depends_on]) {
      console.log('     🗑️  Clear node_modules');
      await executeCommand('rm -rf node_modules', dir, {});

      // 更新 package.json 中的依赖路径为新的 tarball 路径
      const depTgzPath = dependencyOutputs[item.depends_on];
      const depName = item.depends_on.split('/').pop();
      console.log(`     📝 Update ${depName} dependency to ${depTgzPath.split('/').pop()}`);
      updatePackageDependency(dir, depName, `file:${depTgzPath}`);
    }

    // 2. 执行命令序列
    if (item.commands && item.commands.length > 0) {
      for (const command of item.commands) {
        let modifiedCommand = command;

        // 如果命令是 pnpm install
        if (command.startsWith('pnpm install')) {
          // 如果包含 tarball 路径，添加 --force
          if (command.includes('.tgz')) {
            modifiedCommand = modifiedCommand.replace(/^(pnpm install)/, '$1 --force');
          }
          // 添加 --ignore-workspace 以避免 workspace 依赖解析错误
          modifiedCommand += ' --ignore-workspace';
        }

        console.log(`     ⚡ Execute: ${modifiedCommand}`);
        await executeCommand(modifiedCommand, dir, dependencyOutputs);
      }
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
  const dependencyOutputs = {};

  for (const item of sortedItems) {
    console.log(`\n▶️  Executing: ${item.name}`);

    try {
      let tgzPath;
      if (item.type === 'package') {
        tgzPath = await executePackageItem(item, dependencyOutputs);
        dependencyOutputs[item.name] = tgzPath;
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
  findTgzFile,
  replacePlaceholders,
  executeCommand,
  executePackageItem,
  executeAppItem,
  executeChain
};
