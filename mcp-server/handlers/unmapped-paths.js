/**
 * Unmapped code path handlers (E-258 #2756)
 *
 * Thin wrappers over /api/mcp/v1/unmapped-paths. Dispatch and validation live
 * server-side in core/unmappedpaths.Service; these only shape the arguments.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/**
 * List a project's unmapped paths, pending by default.
 */
export async function listUnmappedPaths({ projectId, status }) {
  if (!projectId) {
    throw new Error('projectId is required');
  }
  const params = { projectId };
  if (status) params.status = status;
  return callEzmodoAPI('mcpListUnmappedPaths', params);
}

/**
 * Dispatch resolve_unmapped actions.
 */
export async function resolveUnmapped(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'reconcile': return reconcileUnmappedPaths(params);
  case 'assign': return assignUnmappedPath(params);
  case 'dismiss': return dismissUnmappedPath(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected reconcile, assign, or dismiss.`);
  }
}

// Close every pending row an existing feature path already covers. Rows several
// features could claim are left pending on purpose.
async function reconcileUnmappedPaths({ projectId }) {
  requireProject(projectId, 'reconcile');
  return callEzmodoAPI('mcpReconcileUnmappedPaths', { projectId });
}

async function assignUnmappedPath({ projectId, pathId, featureId }) {
  requireProject(projectId, 'assign');
  if (!pathId) throw new Error('pathId is required for assign');
  if (!featureId) throw new Error('featureId is required for assign');
  return callEzmodoAPI('mcpAssignUnmappedPath', { projectId, pathId, featureId });
}

async function dismissUnmappedPath({ projectId, pathId }) {
  requireProject(projectId, 'dismiss');
  if (!pathId) throw new Error('pathId is required for dismiss');
  return callEzmodoAPI('mcpDismissUnmappedPath', { projectId, pathId });
}

function requireProject(projectId, action) {
  if (!projectId) {
    throw new Error(`projectId is required for ${action}`);
  }
}
