#!/usr/bin/env bun

import { $ } from 'zx';
import { createTag, createRelease, listTags, validateVersion, syncVersion } from '../../lib/release/index.mjs';

/**
 * @description Manage GitHub releases and version tags
 */
export async function run(args) {
  // Flatten nested arrays and filter out Commander objects
  const flatArgs = args.flat();
  const validArgs = flatArgs.filter(arg => 
    typeof arg === 'string' && 
    !arg.includes('Command') &&
    !arg.startsWith('{')
  );

  if (validArgs.length === 0) {
    showUsage();
    process.exit(1);
  }

  const subcommand = validArgs[0];
  const subcommandArgs = validArgs.slice(1);

  try {
    switch (subcommand) {
      case 'create':
        await handleCreate(subcommandArgs);
        break;
      case 'list':
        await handleList();
        break;
      case 'sync':
        await handleSync();
        break;
      case 'validate':
        await handleValidate(subcommandArgs);
        break;
      case 'help':
      case '--help':
      case '-h':
        showUsage();
        break;
      default:
        console.error(`Unknown subcommand: ${subcommand}`);
        showUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function handleCreate(args) {
  if (args.length === 0) {
    console.error('Error: Version number is required');
    console.log('Usage: qk release create <version> [--notes "release notes"]');
    process.exit(1);
  }

  const version = args[0];
  const notesIndex = args.indexOf('--notes');
  const notes = notesIndex !== -1 ? args.slice(notesIndex + 1).join(' ') : '';

  console.log(`Creating release for version ${version}...`);

  // Validate version format
  if (!validateVersion(version)) {
    console.error('Error: Invalid version format. Use semantic versioning (e.g., v1.2.3, 1.2.3)');
    process.exit(1);
  }

  // Create tag
  console.log('Creating Git tag...');
  await createTag(version);

  // Create GitHub release if notes provided or if we want to auto-create
  if (notes || process.env.GITHUB_TOKEN) {
    console.log('Creating GitHub release...');
    const release = await createRelease(version, notes);
    console.log(`✅ Release created successfully!`);
    console.log(`📋 Release URL: ${release.html_url}`);
    console.log(`📦 Archive URL: ${getArchiveUrl(version)}`);
  } else {
    console.log(`✅ Tag created successfully!`);
    console.log(`📦 Archive URL: ${getArchiveUrl(version)}`);
    console.log('💡 Use --notes to create a GitHub release with release notes');
  }
}

async function handleList() {
  console.log('Listing version tags...');
  const tags = await listTags();
  
  if (tags.length === 0) {
    console.log('No version tags found.');
    return;
  }

  console.log('\n📋 Available versions:');
  tags.forEach(tag => {
    console.log(`  ${tag.name} (${new Date(tag.commit.committer.date).toLocaleDateString()})`);
  });
}

async function handleSync() {
  console.log('Syncing package.json version with Git tags...');
  const result = await syncVersion();
  
  if (result.synced) {
    console.log(`✅ Version synced: ${result.version}`);
  } else {
    console.log(`ℹ️  Version already in sync: ${result.version}`);
  }
}

async function handleValidate(args) {
  if (args.length === 0) {
    console.error('Error: Version number is required');
    console.log('Usage: qk release validate <version>');
    process.exit(1);
  }

  const version = args[0];
  const isValid = validateVersion(version);
  
  if (isValid) {
    console.log(`✅ Version ${version} is valid`);
  } else {
    console.log(`❌ Version ${version} is invalid`);
    console.log('💡 Use semantic versioning format: v1.2.3 or 1.2.3');
    process.exit(1);
  }
}

function showUsage() {
  console.log(`
QK CLI Release Manager

Manage GitHub releases and version tags. GitHub will automatically generate 
tar.gz and zip archives for each tagged release.

USAGE:
  qk release <command> [options]

COMMANDS:
  create <version>     Create a new version tag and optional GitHub release
  list                 List all version tags
  sync                 Sync package.json version with latest Git tag
  validate <version>   Validate a version number format
  help                 Show this help message

EXAMPLES:
  qk release create v1.2.3
  qk release create v1.2.3 --notes "Added new features and bug fixes"
  qk release list
  qk release sync
  qk release validate v1.2.3

ARCHIVE URLS:
  After creating a tag, GitHub automatically generates:
  • https://github.com/owner/repo/archive/refs/tags/v1.2.3.tar.gz
  • https://github.com/owner/repo/archive/refs/tags/v1.2.3.zip

REQUIREMENTS:
  • Git repository initialized
  • GitHub repository configured (for GitHub releases)
  • GITHUB_TOKEN environment variable (for automated releases)
`);
}

function getArchiveUrl(version) {
  // Try to get repo info from git remote
  try {
    const remoteUrl = $`git remote get-url origin`.quiet().toString().trim();
    const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/);
    if (match) {
      const [, owner, repo] = match;
      return `https://github.com/${owner}/${repo}/archive/refs/tags/${version}.tar.gz`;
    }
  } catch (error) {
    // Fallback to generic format
  }
  
  return `https://github.com/owner/repo/archive/refs/tags/${version}.tar.gz`;
}

export default run;