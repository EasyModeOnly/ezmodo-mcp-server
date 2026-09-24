/**
 * Keep the project's context manifest current from a commit.
 *
 * Called by `manage_task action:"link_commit"` after the commit is linked. The
 * API holds the only copy of the manifest, so the commit's effect on it —
 * files added, modified, deleted, renamed — is sent as one apply-changes call,
 * and the agent is told which paths still need a summary written.
 *
 * Best-effort by contract: this never throws. A manifest problem is reported
 * in the returned object and must never fail the commit link it rides on.
 */

import { callEzmodoAPI } from './http-client.js';
import { getCommitNameStatus, getRepositoryRoot } from './git-helpers.js';
import { readConfig } from './local-cache.js';
import {
  buildManifestDelta,
  createScopeMatcher,
  isEmptyDelta,
  loadManifestScope,
  summarizeManifestResult,
} from './manifest-delta.js';

/**
 * @param {object} params
 * @param {string} params.sha - The commit just linked
 * @param {string} [params.projectId] - Explicit project; falls back to the repo config
 * @param {string} [params.workingDirectory] - Where the repo is; defaults to cwd
 * @returns {Promise<object>} The `manifest` field for the link_commit response
 */
export async function applyCommitToManifest({ sha, projectId, workingDirectory }) {
  try {
    const resolvedProjectId = projectId || (await readConfig())?.projectId;
    if (!resolvedProjectId) {
      return { skipped: 'no project configured — pass projectId to update the manifest' };
    }

    const repoRoot = getRepositoryRoot(workingDirectory || process.cwd());
    if (!repoRoot) {
      return { skipped: 'not inside a git repository, so the commit\'s files could not be read' };
    }

    const changes = getCommitNameStatus(repoRoot, sha);
    const delta = buildManifestDelta(changes, createScopeMatcher(loadManifestScope(repoRoot)));
    if (isEmptyDelta(delta)) {
      return { skipped: 'commit changed no files the manifest tracks' };
    }

    const result = await callEzmodoAPI('mcpApplyManifestChanges', {
      projectId: resolvedProjectId,
      commitSha: sha,
      ...delta,
    });
    return summarizeManifestResult(result);
  } catch (error) {
    return { error: error?.message || String(error) };
  }
}
