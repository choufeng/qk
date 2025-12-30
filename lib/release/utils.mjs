#!/usr/bin/env bun

import { $ } from 'zx';

/**
 * Custom error class for release operations
 */
export class ReleaseError extends Error {
  constructor(message, type, code) {
    super(message);
    this.name = 'ReleaseError';
    this.type = type;
    this.code = code;
  }
}

/**
 * Error mapping for user-friendly messages
 */
export const ERROR_MAP = {
  'VERSION_INVALID': '版本号格式无效，请使用语义化版本号 (如 v1.2.3 或 1.2.3)',
  'TAG_EXISTS': '标签已存在，请使用不同的版本号',
  'GIT_ERROR': 'Git 操作失败，请检查仓库状态',
  'GITHUB_ERROR': 'GitHub API 请求失败，请检查网络连接和权限',
  'REMOTE_NOT_FOUND': '未找到 Git 远程仓库，请确保已配置 GitHub 仓库'
};

/**
 * Validate semantic version format
 * @param {string} version - Version string to validate
 * @returns {boolean} - Whether version is valid
 */
export function validateVersion(version) {
  // Accept formats: v1.2.3, 1.2.3, 1.2.3-alpha, 1.2.3-beta.1, etc.
  const semverRegex = /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?$/;
  return semverRegex.test(version);
}

/**
 * Normalize version string (ensure it starts with 'v')
 * @param {string} version - Version string to normalize
 * @returns {string} - Normalized version string
 */
export function normalizeVersion(version) {
  if (!version) return version;
  return version.startsWith('v') ? version : `v${version}`;
}

/**
 * Parse version string into components
 * @param {string} version - Version string to parse
 * @returns {object} - Parsed version components
 */
export function parseVersion(version) {
  const normalized = normalizeVersion(version);
  const versionPart = normalized.replace(/^v/, '');
  const [main, prerelease] = versionPart.split('-');
  const [major, minor, patch] = main.split('.').map(Number);
  
  return {
    full: normalized,
    version: versionPart,
    major,
    minor,
    patch,
    prerelease: prerelease || null,
    isPrerelease: !!prerelease
  };
}

/**
 * Create a Git tag locally
 * @param {string} version - Tag name
 * @param {string} message - Tag message (optional)
 * @returns {Promise<void>}
 */
export async function createGitTag(version, message = '') {
  const tagMessage = message || `Release ${version}`;
  
  try {
    await $`git tag -a ${version} -m "${tagMessage}"`;
  } catch (error) {
    throw new ReleaseError(
      `Failed to create Git tag: ${error.message}`,
      'GIT_ERROR',
      'TAG_CREATE_FAILED'
    );
  }
}

/**
 * Push a Git tag to remote repository
 * @param {string} version - Tag name to push
 * @returns {Promise<void>}
 */
export async function pushTag(version) {
  try {
    await $`git push origin ${version}`;
  } catch (error) {
    throw new ReleaseError(
      `Failed to push Git tag to remote: ${error.message}`,
      'GIT_ERROR',
      'TAG_PUSH_FAILED'
    );
  }
}

/**
 * Check if a tag already exists
 * @param {string} version - Tag name to check
 * @returns {Promise<boolean>} - Whether tag exists
 */
export async function checkTagExists(version) {
  try {
    const result = await $`git tag -l ${version}`.quiet();
    return result.stdout.trim() === version;
  } catch (error) {
    return false;
  }
}

/**
 * Get Git remote repository information
 * @returns {Promise<object>} - Repository info {owner, repo}
 */
export async function getGitRemoteInfo() {
  try {
    const result = await $`git remote get-url origin`.quiet();
    const remoteUrl = result.stdout.trim();
    
    // Parse GitHub URL (both HTTPS and SSH)
    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)(\.git)?$/);
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)(\.git)?$/);
    
    const match = httpsMatch || sshMatch;
    
    if (!match) {
      throw new ReleaseError(
        'Could not parse GitHub repository URL',
        'REMOTE_NOT_FOUND',
        'INVALID_REMOTE_URL'
      );
    }
    
    const [, owner, repo] = match;
    return { owner, repo };
  } catch (error) {
    if (error instanceof ReleaseError) {
      throw error;
    }
    throw new ReleaseError(
      'Failed to get Git remote information',
      'REMOTE_NOT_FOUND',
      'GET_REMOTE_FAILED'
    );
  }
}

/**
 * Make a GitHub API request
 * @param {string} endpoint - API endpoint (e.g., 'POST /repos/owner/repo/releases')
 * @param {object} data - Request body data
 * @returns {Promise<object>} - API response
 */
export async function makeGitHubRequest(endpoint, data = null) {
  const [method, ...pathParts] = endpoint.split(' ');
  const path = pathParts.join(' ');
  
  if (!process.env.GITHUB_TOKEN) {
    throw new ReleaseError(
      'GITHUB_TOKEN environment variable is required for GitHub API requests',
      'GITHUB_ERROR',
      'NO_TOKEN'
    );
  }

  try {
    const command = data 
      ? `curl -X ${method} \
         -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
         -H "Accept: application/vnd.github.v3+json" \
         -d '${JSON.stringify(data)}' \
         https://api.github.com${path}`
      : `curl -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
         -H "Accept: application/vnd.github.v3+json" \
         https://api.github.com${path}`;

    const result = await $`bash -c "${command}"`.quiet();
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new ReleaseError(
      `GitHub API request failed: ${error.message}`,
      'GITHUB_ERROR',
      'API_REQUEST_FAILED'
    );
  }
}

/**
 * Get the current Git commit hash
 * @returns {Promise<string>} - Commit hash
 */
export async function getCurrentCommit() {
  try {
    const result = await $`git rev-parse HEAD`.quiet();
    return result.stdout.trim();
  } catch (error) {
    throw new ReleaseError(
      'Failed to get current commit hash',
      'GIT_ERROR',
      'GET_COMMIT_FAILED'
    );
  }
}

/**
 * Check if working directory is clean
 * @returns {Promise<boolean>} - Whether working directory is clean
 */
export async function isWorkingDirectoryClean() {
  try {
    const result = await $`git status --porcelain`.quiet();
    return result.stdout.trim() === '';
  } catch (error) {
    return false;
  }
}

/**
 * Get commit history between two tags
 * @param {string} fromTag - Starting tag (optional)
 * @param {string} toTag - Ending tag (optional, defaults to HEAD)
 * @returns {Promise<string>} - Commit history
 */
export async function getCommitHistory(fromTag = null, toTag = 'HEAD') {
  try {
    const range = fromTag ? `${fromTag}..${toTag}` : toTag;
    const result = await $`git log --oneline --pretty=format:"- %s (%h)" ${range}`.quiet();
    return result.stdout.trim();
  } catch (error) {
    throw new ReleaseError(
      'Failed to get commit history',
      'GIT_ERROR',
      'GET_HISTORY_FAILED'
    );
  }
}

/**
 * Generate release notes from commit history
 * @param {string} fromTag - Starting tag
 * @param {string} toTag - Ending tag
 * @returns {Promise<string>} - Generated release notes
 */
export async function generateReleaseNotes(fromTag = null, toTag = 'HEAD') {
  try {
    const commits = await getCommitHistory(fromTag, toTag);
    
    if (!commits) {
      return 'No changes since last release.';
    }
    
    return `## Changes\n\n${commits}\n\n---\n\n*Generated automatically from Git history*`;
  } catch (error) {
    return 'Release notes generation failed. Please provide manual notes.';
  }
}