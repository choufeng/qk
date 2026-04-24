#!/usr/bin/env bun

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  readPackageVersion,
  generateAlphaVersion,
  updatePackageVersion,
  cleanTgzFiles,
  findTgzFile,
  getActualPackageName,
} from '../pack/functions.mjs';
import { processManager } from '../../lib/process-manager.mjs';

/**
 * @description Build current package as alpha version and produce a .tgz tarball
 */
export async function run(args) {
  // placeholder - will be implemented in next task
  console.log('alpha command - not yet implemented');
}

export default run;
