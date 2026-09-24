/**
 * Context Manifest Loader
 * Loads and caches the project manifest/manifest.json file for MCP tools.
 * Reads from `.ezmodo/manifest/`.
 * Provides a singleton cache with reload mechanism for rebuild_manifest.
 */

import fs from 'fs/promises';
import path from 'path';
import { findConfigPath, readConfig } from './local-cache.js';
import { getLogger } from './logger.js';
import { CURRENT_REPO_CONFIG_DIR } from './repo-config-dir.js';

// Singleton cache
let _manifest = null;
let _manifestPath = null;
let _loadedAt = null;

/**
 * Find the project root by walking up from the resolved config.json path.
 * Falls back to process.cwd() if config not found.
 * @returns {Promise<string>} Absolute path to project root
 */
async function findProjectRoot() {
  const configPath = await findConfigPath();
  if (configPath) {
    // <root>/<config-dir>/config.json → project root
    return path.dirname(path.dirname(configPath));
  }
  return process.cwd();
}

/**
 * Find the `.ezmodo/manifest/manifest.json` file path.
 * @returns {Promise<string|null>} Absolute path to manifest.json, or null
 */
async function findManifestPath() {
  if (_manifestPath) {
    try {
      await fs.access(_manifestPath);
      return _manifestPath;
    } catch {
      _manifestPath = null;
    }
  }

  const projectRoot = await findProjectRoot();
  const manifestPath = path.join(projectRoot, CURRENT_REPO_CONFIG_DIR, 'manifest', 'manifest.json');
  try {
    await fs.access(manifestPath);
    _manifestPath = manifestPath;
    return manifestPath;
  } catch {
    return null;
  }
}

/**
 * Load and parse the context manifest.
 * Uses singleton cache — subsequent calls return cached version.
 * Call reloadManifest() to force a refresh.
 *
 * @returns {Promise<object|null>} Parsed manifest object, or null if not found/invalid
 */
export async function loadManifest() {
  if (_manifest) return _manifest;

  const manifestPath = await findManifestPath();
  if (!manifestPath) return null;

  try {
    const content = await fs.readFile(manifestPath, 'utf-8');
    _manifest = JSON.parse(content);
    _loadedAt = new Date().toISOString();
    return _manifest;
  } catch (err) {
    getLogger().warn('Failed to load context manifest', { error: err.message });
    return null;
  }
}

/**
 * Force reload the manifest from disk.
 * Clears the singleton cache and reloads.
 *
 * @returns {Promise<object|null>} Freshly loaded manifest, or null
 */
export async function reloadManifest() {
  _manifest = null;
  _manifestPath = null;
  _loadedAt = null;
  return loadManifest();
}

/**
 * Save the in-memory manifest back to disk.
 * Updates metadata.entryCount and writes to the same path it was loaded from.
 *
 * @returns {Promise<boolean>} true if saved successfully
 */
export async function saveManifest() {
  if (!_manifest || !_manifestPath) return false;

  try {
    _manifest.metadata.entryCount = _manifest.entries.length;
    await fs.writeFile(_manifestPath, JSON.stringify(_manifest, null, 2) + '\n', 'utf-8');
    return true;
  } catch (err) {
    getLogger().warn('Failed to save context manifest', { error: err.message });
    return false;
  }
}

/**
 * Get metadata about the current manifest cache state.
 * @returns {object} Cache info including loadedAt timestamp and entry count
 */
export function getManifestCacheInfo() {
  return {
    loaded: _manifest !== null,
    loadedAt: _loadedAt,
    entryCount: _manifest?.metadata?.entryCount || 0,
    version: _manifest?.metadata?.version || null,
    generatedAt: _manifest?.metadata?.generatedAt || null,
    manifestPath: _manifestPath,
  };
}

/**
 * Check if a local manifest file is available on the filesystem.
 * @returns {Promise<boolean>}
 */
export async function isLocalManifestAvailable() {
  if (_manifest) return true;
  const manifestPath = await findManifestPath();
  return manifestPath !== null;
}

/**
 * The project whose manifest a write should go to: the caller's explicit id,
 * else the one in this repo's config.json. null when neither exists.
 *
 * Writes resolve the project independently of getManifestSource because the
 * API is the manifest's source of truth: a local manifest file existing must
 * not divert a write away from it.
 *
 * @param {string} [projectIdOverride]
 * @returns {Promise<string|null>}
 */
export async function resolveManifestProjectId(projectIdOverride) {
  if (projectIdOverride) return projectIdOverride;
  return (await readConfig())?.projectId || null;
}

/**
 * Determine the manifest data source: local filesystem or remote API.
 * Returns { source: 'local', manifest } or { source: 'remote', projectId }.
 *
 * The local manifest describes the working tree it sits in, and therefore
 * answers for exactly ONE project: the one in this repo's config.json. When a
 * caller names a DIFFERENT project it must go remote — an agent working in repo
 * A can legitimately ask for context in project B, and serving A's files as B's
 * context is worse than serving none: the answer looks authoritative and is
 * entirely about the wrong codebase.
 *
 * @param {string} [projectIdOverride] - Optional explicit projectId (from tool args)
 * @returns {Promise<{source: 'local', manifest: object} | {source: 'remote', projectId: string}>}
 */
export async function getManifestSource(projectIdOverride) {
  const localProjectId = (await readConfig())?.projectId;
  const localAnswersForRequest = !projectIdOverride || projectIdOverride === localProjectId;

  if (localAnswersForRequest) {
    const localManifest = await loadManifest();
    if (localManifest) {
      return { source: 'local', manifest: localManifest };
    }
  }

  // No usable local manifest — need a projectId for remote.
  const projectId = projectIdOverride || localProjectId;
  if (projectId) {
    return { source: 'remote', projectId };
  }

  throw new Error(
    'No local manifest found and no project configured for remote access. ' +
    'Run initialize_project_context to configure this repo\'s project, or pass a projectId. ' +
    'The manifest itself lives in the API: the desktop app generates it, and link_commit ' +
    'keeps it current.'
  );
}
