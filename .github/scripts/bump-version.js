#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';

/**
 * 根据指定的升级级别计算新版本号并更新 package.json
 * Usage: node bump-version.js <level>
 * Level: major, minor, patch
 */

const level = process.argv[2] || 'patch';

if (!['major', 'minor', 'patch'].includes(level)) {
  console.error('Invalid level. Use: major, minor, or patch');
  process.exit(1);
}

const pkgPath = 'package.json';

// 读取当前版本
let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
} catch (e) {
  console.error('Failed to read package.json:', e.message);
  process.exit(1);
}

if (!pkg.version) {
  console.error('package.json missing version field');
  process.exit(1);
}

// 解析版本号
const versionParts = pkg.version.split('.').map(Number);

if (versionParts.length !== 3 || versionParts.some(isNaN)) {
  console.error('Invalid version format. Expected: x.y.z');
  process.exit(1);
}

let [major, minor, patch] = versionParts;
let newVersion;

// 计算新版本号
switch (level) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
}

// 更新 package.json
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(newVersion);
