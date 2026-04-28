#!/usr/bin/env bun

/**
 * 解析 PR 信息，确定版本升级级别
 * 优先级: major > minor > patch
 */

// 从环境变量读取 PR 信息
const prTitle = process.env.PR_TITLE || '';
const prBody = process.env.PR_BODY || '';
const commitMessages = process.env.COMMIT_MESSAGES || '';

// 合并所有文本用于分析
const allTexts = [
  prTitle,
  prBody,
  commitMessages
].join('\n').toLowerCase();

// 默认版本级别
let level = 'patch';

// 优先级: major > minor > patch
// Major: break, !:, BREAKING CHANGE
if (
  allTexts.match(/\bbreak\b/) ||
  allTexts.includes('!:') ||
  allTexts.includes('breaking change')
) {
  level = 'major';
} 
// Minor: feat, feature
else if (
  allTexts.match(/\bfeat\b/) ||
  allTexts.match(/\bfeature\b/) ||
  allTexts.match(/\bfeatures\b/)
) {
  level = 'minor';
}
// Patch: fix, bugfix, bug fix - 显式检测以符合规范
else if (
  allTexts.match(/\bfix\b/) ||
  allTexts.match(/\bbugfix\b/) ||
  allTexts.includes('bug fix')
) {
  level = 'patch';
}
console.log(level);
