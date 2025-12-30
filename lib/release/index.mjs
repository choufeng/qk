#!/usr/bin/env bun

import { $ } from 'zx';
import { 
  validateVersion, 
  normalizeVersion, 
  parseVersion,
  createGitTag,
  pushTag,
  getGitRemoteInfo,
  makeGitHubRequest,
  checkTagExists
} from './utils.mjs';

/**
 * Create a new Git tag
 * @param {string} version - Version number (e.g., v1.2.3)
 * @param {object} options - Additional options
 * @returns {Promise<boolean>} - Success status
 */
export async function createTag(version, options = {}) {
  const normalizedVersion = normalizeVersion(version);
  
  if (!validateVersion(normalizedVersion)) {
    throw new Error(`Invalid version format: ${version}`);
  }

  // Check if tag already exists
  if (await checkTagExists(normalizedVersion)) {
    throw new Error(`Tag ${normalizedVersion} already exists`);
  }

  try {
    // Create local tag
    await createGitTag(normalizedVersion, options.message);
    console.log(`✅ Created local tag: ${normalizedVersion}`);

    // Push to remote
    await pushTag(normalizedVersion);
    console.log(`✅ Pushed tag to remote: ${normalizedVersion}`);
    
    return true;
  } catch (error) {
    throw new Error(`Failed to create tag ${normalizedVersion}: ${error.message}`);
  }
}

/**
 * Create a GitHub release
 * @param {string} version - Version number
 * @param {string} notes - Release notes (optional)
 * @returns {Promise<object>} - Release information
 */
export async function createRelease(version, notes = '') {
  const normalizedVersion = normalizeVersion(version);
  
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN environment variable is required for creating releases');
  }

  const { owner, repo } = await getGitRemoteInfo();
  
  const releaseData = {
    tag_name: normalizedVersion,
    name: normalizedVersion,
    body: notes || `Release ${normalizedVersion}`,
    draft: false,
    prerelease: normalizedVersion.includes('-') // Pre-release if version contains hyphen
  };

  try {
    const response = await makeGitHubRequest(
      `POST /repos/${owner}/${repo}/releases`,
      releaseData
    );
    
    console.log(`✅ Created GitHub release: ${normalizedVersion}`);
    return response.data;
  } catch (error) {
    throw new Error(`Failed to create GitHub release: ${error.message}`);
  }
}

/**
 * List all version tags
 * @returns {Promise<Array>} - Array of tag objects
 */
export async function listTags() {
  try {
    const result = await $`git tag -l "v*" --sort=-version:refname`.quiet();
    const tags = result.stdout.trim().split('\n').filter(tag => tag);
    
    const tagDetails = [];
    for (const tag of tags) {
      try {
        const commitResult = await $`git show -s --format=%cI ${tag}`.quiet();
        const commitDate = commitResult.stdout.trim();
        tagDetails.push({
          name: tag,
          date: commitDate,
          commit: { committer: { date: commitDate } }
        });
      } catch (error) {
        // Skip tags that can't be processed
        tagDetails.push({
          name: tag,
          date: null,
          commit: { committer: { date: null } }
        });
      }
    }
    
    return tagDetails;
  } catch (error) {
    throw new Error(`Failed to list tags: ${error.message}`);
  }
}

/**
 * Validate version format
 * @param {string} version - Version string to validate
 * @returns {boolean} - Whether version is valid
 */
export { validateVersion };

/**
 * Sync package.json version with latest Git tag
 * @returns {Promise<object>} - Sync result
 */
export async function syncVersion() {
  try {
    // Get current package.json version
    const packageJson = JSON.parse(await $`cat package.json`.quiet());
    const currentVersion = packageJson.version;
    
    // Get latest tag
    const tags = await listTags();
    if (tags.length === 0) {
      return { version: currentVersion, synced: false, message: 'No tags found' };
    }
    
    const latestTag = tags[0];
    const tagVersion = normalizeVersion(latestTag.name).replace(/^v/, '');
    
    if (currentVersion !== tagVersion) {
      // Update package.json
      packageJson.version = tagVersion;
      await $`echo '${JSON.stringify(packageJson, null, 2)}' > package.json`.quiet();
      
      console.log(`✅ Updated package.json version: ${currentVersion} → ${tagVersion}`);
      return { version: tagVersion, synced: true };
    }
    
    return { version: currentVersion, synced: false };
  } catch (error) {
    throw new Error(`Failed to sync version: ${error.message}`);
  }
}

/**
 * Get archive URLs for a version
 * @param {string} version - Version number
 * @returns {Promise<object>} - Archive URLs
 */
export async function getArchiveUrls(version) {
  try {
    const { owner, repo } = await getGitRemoteInfo();
    const normalizedVersion = normalizeVersion(version);
    
    return {
      tarball: `https://github.com/${owner}/${repo}/archive/refs/tags/${normalizedVersion}.tar.gz`,
      zipball: `https://github.com/${owner}/${repo}/archive/refs/tags/${normalizedVersion}.zip`
    };
  } catch (error) {
    // Fallback to generic URLs
    const normalizedVersion = normalizeVersion(version);
    return {
      tarball: `https://github.com/owner/repo/archive/refs/tags/${normalizedVersion}.tar.gz`,
      zipball: `https://github.com/owner/repo/archive/refs/tags/${normalizedVersion}.zip`
    };
  }
}

// Re-export utility functions
export {
  normalizeVersion,
  parseVersion
};