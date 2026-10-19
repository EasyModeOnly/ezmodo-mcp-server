/**
 * Active Session File Management
 *
 * Records the active task so the plugin's commit hook can suggest which task a
 * commit belongs to, and so the EzModo desktop app can show it. Two copies:
 *
 * - `<git-dir>/ezmodo-active-session.json` — PER WORKTREE (#3195). Every
 *   linked worktree has its own git dir (`.git/worktrees/<name>/`), so
 *   parallel worktrees cannot overwrite each other here. Nothing in it is ever
 *   tracked, and `git worktree remove` takes it away.
 * - `<repo-config-dir>/active-session.json` — the legacy, per-REPO file. The
 *   desktop app watches it, and plugins older than #3195 read only it.
 *
 * Why the per-repo file is not enough on its own: `.ezmodo/` is usually
 * untracked, so a worktree checked out under the repo (`.claude/worktrees/x`)
 * has no `.ezmodo/config.json` of its own and the walk up finds the MAIN
 * checkout's. Five agents in five worktrees then shared one file, and each
 * commit hook suggested whichever task was claimed last. The legacy file now
 * also records the worktree it was written for, so a reader can tell when it
 * describes somebody else's checkout.
 *
 * Both are written from the MCP server's own cwd. Subagents in one Claude Code
 * session share one server, whose cwd is the session's checkout — the server
 * cannot see which worktree a subagent is in. The recorded `worktree` and
 * `branch` are therefore the SERVER's. The plugin hooks take the taskId only
 * from the per-worktree file (E-297 #3348): the legacy one is in the working
 * tree, where a repo can commit it, so the commit hook shows it as an
 * unverified pointer when it matches the checkout the commit ran in.
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { getLogger } from './logger.js';
import { findRepoConfigDir } from './repo-config-dir.js';

/** The legacy per-repo file, inside `.ezmodo/`. */
export const SESSION_FILENAME = 'active-session.json';

/**
 * The per-worktree file, inside the worktree's git dir. Mirrored in
 * plugins/ezmodo/hooks/lib.js, which cannot import from this package.
 */
export const WORKTREE_SESSION_FILENAME = 'ezmodo-active-session.json';

/**
 * Where the server is, in git terms: the worktree's top level, its own git dir
 * and the branch checked out there. Each is null when git cannot say (not a
 * repo, git missing). One rev-parse prints all three, one per line, in the
 * order asked.
 */
function getGitLocation() {
  try {
    const [worktree, gitDir, branch] = execSync(
      'git rev-parse --show-toplevel --absolute-git-dir --abbrev-ref HEAD',
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
      .trim()
      .split('\n')
      .map((line) => line.trim() || null);
    return { worktree: worktree ?? null, gitDir: gitDir ?? null, branch: branch ?? null };
  } catch {
    return { worktree: null, gitDir: null, branch: null };
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

async function unlinkIfPresent(file) {
  try {
    await fs.unlink(file);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Write the active session for the task now in progress.
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

    const { worktree, gitDir, branch } = getGitLocation();
    const session = {
      taskId: taskData.taskId,
      taskNumber: taskData.taskNumber,
      title: taskData.title,
      ...(taskData.epicId && { epicId: taskData.epicId }),
      ...(taskData.epicNumber && { epicNumber: taskData.epicNumber }),
      branch,
      worktree,
      startedAt: new Date().toISOString(),
      agentName: 'claude',
    };
    const body = JSON.stringify(session, null, 2);

    await fs.writeFile(path.join(configDir, SESSION_FILENAME), body, 'utf-8');
    if (gitDir) {
      await fs.writeFile(path.join(gitDir, WORKTREE_SESSION_FILENAME), body, 'utf-8');
    }
    getLogger().info('Wrote active session file', { taskId: taskData.taskId, worktree });
  } catch (err) {
    getLogger().warn('Failed to write active session file', { error: err.message });
  }
}

/**
 * Clear the active session when task work ends. The per-worktree file is
 * always ours to delete. The legacy file is shared by every worktree that
 * resolves to the same `.ezmodo/`, so it is deleted only when it was written
 * for this worktree (or predates the `worktree` field) — ending work in one
 * worktree must not wipe another's session.
 */
export async function clearActiveSession() {
  try {
    const configDir = await findRepoConfigDir(process.cwd());
    if (!configDir) return;

    const { worktree, gitDir } = getGitLocation();
    if (gitDir) await unlinkIfPresent(path.join(gitDir, WORKTREE_SESSION_FILENAME));

    const legacyPath = path.join(configDir, SESSION_FILENAME);
    const legacy = await readJson(legacyPath);
    if (legacy?.worktree && worktree && path.resolve(legacy.worktree) !== path.resolve(worktree)) {
      getLogger().info('Left another worktree\'s active session in place', { worktree: legacy.worktree });
      return;
    }
    await unlinkIfPresent(legacyPath);
    getLogger().info('Cleared active session file');
  } catch (err) {
    getLogger().warn('Failed to clear active session file', { error: err.message });
  }
}
