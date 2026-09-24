/**
 * Helpers for locating an EzModo project's per-repo config directory,
 * `.ezmodo/`.
 *
 * The pre-rebrand config directory is no longer read (#2843). Run
 * `ezmodo migrate-config` in a repo that still has one to move it.
 */

import { existsSync } from 'fs';
import fsp from 'fs/promises';
import { dirname, join } from 'path';

export const CURRENT_REPO_CONFIG_DIR = '.ezmodo';
export const REPO_CONFIG_FILENAME = 'config.json';

/**
 * Synchronously locate `.ezmodo/config.json` walking up from `startDir`.
 * Returns null if none is found.
 */
export function findRepoConfigPathSync(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, CURRENT_REPO_CONFIG_DIR, REPO_CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Async variant of findRepoConfigPathSync — preferred for MCP handlers
 * that already operate on promises.
 */
export async function findRepoConfigPath(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, CURRENT_REPO_CONFIG_DIR, REPO_CONFIG_FILENAME);
    if (await fileExists(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Returns the existing config directory path (e.g. `/repo/.ezmodo`) walking
 * up from `startDir`, or null if none exists.
 */
export async function findRepoConfigDir(startDir) {
  const cfg = await findRepoConfigPath(startDir);
  return cfg ? dirname(cfg) : null;
}

/**
 * Returns the directory name new writes should target (`.ezmodo`).
 */
export function getWriteRepoConfigDirName() {
  return CURRENT_REPO_CONFIG_DIR;
}

async function fileExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}
