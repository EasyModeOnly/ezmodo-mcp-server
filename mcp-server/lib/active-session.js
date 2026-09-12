/**
 * Active Session File Management
 *
 * Writes/clears <repo-config-dir>/active-session.json to communicate the
 * active task between Claude Code (via MCP server) and the EzModo desktop
 * app. The session file lives inside whichever config directory the repo
 * already uses — `.ezmodo/` for current repos, `.zephly/` for legacy.
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getLogger } from './logger.js';
import { findRepoConfigDir } from './repo-config-dir.js';

/**
 * Get the current git branch name, or null if not in a git repo.
 */
function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Write the active-session.json file inside the project's config directory
 * (`.ezmodo/active-session.json`, or legacy `.zephly/active-session.json` if
 * that's what the repo already uses).
 *
 * @param {object} taskData
 * @param {string} taskData.taskId
 * @param {number} taskData.taskNumber
 * @param {string} taskData.title
 * @param {string} [taskData.epicId]
 * @param {number} [taskData.epicNumber]
 */
export async function writeActiveSession(taskData) {
  try {
    const configDir = await findRepoConfigDir(process.cwd());
    if (!configDir) {
      getLogger().debug('No project config directory found, skipping session file write');
      return;
    }

    const session = {
      taskId: taskData.taskId,
      taskNumber: taskData.taskNumber,
      title: taskData.title,
      ...(taskData.epicId && { epicId: taskData.epicId }),
      ...(taskData.epicNumber && { epicNumber: taskData.epicNumber }),
      branch: getCurrentBranch(),
      startedAt: new Date().toISOString(),
      agentName: 'claude',
    };

    const sessionPath = path.join(configDir, 'active-session.json');
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
    getLogger().info('Wrote active session file', { taskId: taskData.taskId });
  } catch (err) {
    getLogger().warn('Failed to write active session file', { error: err.message });
  }
}

/**
 * Clear (delete) the active-session.json file inside the project's config
 * directory when task work ends. Operates on whichever directory the repo
 * uses (`.ezmodo/` or legacy `.zephly/`).
 */
export async function clearActiveSession() {
  try {
    const configDir = await findRepoConfigDir(process.cwd());
    if (!configDir) return;

    const sessionPath = path.join(configDir, 'active-session.json');
    await fs.unlink(sessionPath);
    getLogger().info('Cleared active session file');
  } catch (err) {
    if (err.code === 'ENOENT') return; // Already gone, that's fine
    getLogger().warn('Failed to clear active session file', { error: err.message });
  }
}
