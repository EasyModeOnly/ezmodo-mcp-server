/**
 * Local Cache Utility
 * Reads and writes the project config.json cache for tags.
 * Lives in the repo's `.ezmodo/` directory.
 * Used by MCP handlers to avoid unnecessary API calls for frequently-read data.
 */

import fs from 'fs/promises';
import { findRepoConfigPath } from './repo-config-dir.js';

// In-memory cache of the config file path (avoids walking directories repeatedly)
let _cachedConfigPath = null;

/**
 * Check if cached data is still fresh.
 * Returns true if lastUpdatedAt is within ttlDays (default 1).
 * Returns false for missing/malformed timestamps.
 */
export function isCacheFresh(lastUpdatedAt, ttlDays = 1) {
  if (!lastUpdatedAt) return false;
  try {
    const updated = new Date(lastUpdatedAt);
    if (isNaN(updated.getTime())) return false;
    const ageMs = Date.now() - updated.getTime();
    return ageMs < ttlDays * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Walk up the directory tree to find the project `.ezmodo/config.json`.
 * Caches the result in memory for subsequent calls.
 * @returns {Promise<string|null>} Absolute path to config.json, or null if not found
 */
export async function findConfigPath(startDir = process.cwd()) {
  // Try in-memory cached path first
  if (_cachedConfigPath) {
    try {
      await fs.access(_cachedConfigPath);
      return _cachedConfigPath;
    } catch {
      _cachedConfigPath = null;
    }
  }

  const configPath = await findRepoConfigPath(startDir);
  if (configPath) _cachedConfigPath = configPath;
  return configPath;
}

/**
 * Read and parse the project `.ezmodo/config.json` file.
 * @returns {Promise<object|null>} Parsed config, or null if not found/invalid
 */
export async function readConfig() {
  const configPath = await findConfigPath();
  if (!configPath) return null;
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write the config object back to the resolved `.ezmodo/config.json`.
 * @returns {Promise<boolean>} true if written successfully
 */
export async function writeConfig(config) {
  const configPath = await findConfigPath();
  if (!configPath) return false;
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cached tags if the cache is fresh.
 * @returns {Promise<Array|null>} Cached tags array, or null if stale/missing
 */
export async function getCachedTags() {
  const config = await readConfig();
  if (!config) return null;
  if (!isCacheFresh(config.lastUpdatedAt)) return null;
  return config.tags || null;
}

/**
 * Update specific sections in the config cache. Non-fatal on failure.
 * @param {object} updates - Key-value pairs to merge into config (e.g., { tags: [...] })
 */
export async function updateCacheSections(updates) {
  try {
    const config = await readConfig();
    if (!config) return;
    Object.assign(config, updates);
    await writeConfig(config);
  } catch {
    // Non-fatal — cache update failed, will refresh next time
  }
}

/**
 * Invalidate a specific cache section by removing it from config.
 * The next read will return null, triggering a fresh API call.
 * @param {string} section - e.g. 'tags'
 */
export async function invalidateCacheSection(section) {
  try {
    const config = await readConfig();
    if (!config) return;
    delete config[section];
    await writeConfig(config);
  } catch {
    // Non-fatal
  }
}
