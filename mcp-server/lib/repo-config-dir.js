/**
 * Helpers for locating an EzModo project's per-repo config directory.
 *
 * After the EzModo rebrand the directory is `.ezmodo/` (was `.zephly/`).
 * Existing checkouts still have `.zephly/` so all readers must dual-check:
 * the new directory wins; the legacy directory is the fallback.
 *
 * New writes always go to `.ezmodo/`. Use `ezmodo migrate-config` to
 * move an existing `.zephly/` directory in place.
 */

import { existsSync, statSync } from 'fs';
import fsp from 'fs/promises';
import { dirname, join } from 'path';

export const CURRENT_REPO_CONFIG_DIR = '.ezmodo';
export const LEGACY_REPO_CONFIG_DIR = '.zephly';
export const REPO_CONFIG_FILENAME = 'config.json';

const PROBE_ORDER = [CURRENT_REPO_CONFIG_DIR, LEGACY_REPO_CONFIG_DIR];

let warned = false;

/**
 * Synchronously locate the first existing project config file walking up
 * from `startDir`. Tries `.ezmodo/config.json` first, then `.zephly/`.
 * Returns null if neither is found.
 */
export function findRepoConfigPathSync(startDir) {
  let dir = startDir;
  while (true) {
    for (const name of PROBE_ORDER) {
      const candidate = join(dir, name, REPO_CONFIG_FILENAME);
      if (existsSync(candidate)) {
        if (name === LEGACY_REPO_CONFIG_DIR) maybeWarnLegacy(candidate);
        return candidate;
      }
    }
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
    for (const name of PROBE_ORDER) {
      const candidate = join(dir, name, REPO_CONFIG_FILENAME);
      if (await fileExists(candidate)) {
        if (name === LEGACY_REPO_CONFIG_DIR) maybeWarnLegacy(candidate);
        return candidate;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Returns the existing config directory path (e.g. `/repo/.ezmodo` or
 * `/repo/.zephly`) walking up from `startDir`, or null if neither exists.
 */
export async function findRepoConfigDir(startDir) {
  const cfg = await findRepoConfigPath(startDir);
  return cfg ? dirname(cfg) : null;
}

/**
 * Returns the directory name new writes should target. Always the current
 * name (`.ezmodo`) — even if a legacy directory still exists in the same
 * repo. Migration to a single directory is handled by `ezmodo migrate-config`.
 */
export function getWriteRepoConfigDirName() {
  return CURRENT_REPO_CONFIG_DIR;
}

/**
 * Returns true if the given directory holds either a current or legacy
 * config dir. Sync because callers commonly need it during sync init.
 */
export function hasAnyRepoConfigDirSync(repoRoot) {
  for (const name of PROBE_ORDER) {
    try {
      if (statSync(join(repoRoot, name)).isDirectory()) return true;
    } catch {
      // not a directory — try next
    }
  }
  return false;
}

async function fileExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

function maybeWarnLegacy(path) {
  if (warned) return;
  warned = true;
  process.stderr.write(
    `⚠️  Using legacy ${LEGACY_REPO_CONFIG_DIR}/ directory at ${path}. ` +
      `Run \`ezmodo migrate-config\` to move it to ${CURRENT_REPO_CONFIG_DIR}/.\n`
  );
}

export function _resetLegacyWarningForTests() {
  warned = false;
}
