/**
 * Feature Handlers
 * Handler functions for the Feature Compendium MCP tools (E-162).
 *
 * Features are org-level, durable product capabilities. These handlers are thin
 * wrappers over /api/mcp/v1/features; dispatch and validation happen server-side
 * in core/features.Service.
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_feature actions.
 */
export async function manageFeature(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createFeature(params);
  case 'update': return updateFeature(params);
  case 'delete': return deleteFeature(params);
  case 'link': return linkFeatureArtifact(params);
  case 'unlink': return unlinkFeatureArtifact(params);
  case 'paths': return setFeaturePaths(params);
  case 'promote_epic': return promoteEpic(params);
  case 'generate_how_it_works': return generateHowItWorks(params);
  case 'apply_how_it_works': return applyHowItWorks(params);
  case 'apply_init': return applyInit(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, link, unlink, paths, promote_epic, generate_how_it_works, apply_how_it_works, or apply_init.`);
  }
}

/**
 * Unified get/list/tree handler for features.
 * - featureId, or organizationId + featureSlug → single lookup (optionally + links).
 * - organizationId only → list (or tree when tree=true).
 */
export async function getFeature(args) {
  const { tree, includeLinks, includeDetail, includePaths, featureId, featureSlug, organizationId, ...filters } = args;
  const isSingleLookup = featureId || (featureSlug && organizationId);

  if (isSingleLookup) {
    const params = featureId ? { featureId } : { organizationId, featureSlug };
    const result = await callZephlyAPI('mcpGetFeature', params);
    const lookupId = featureId || result?.feature?.id;
    if (includeDetail && lookupId) {
      // Aggregated view: linked artifacts grouped by type + rollup.
      const detail = await callZephlyAPI('mcpGetFeatureDetail', { featureId: lookupId });
      result.detail = detail?.detail ?? detail;
    } else if (includeLinks && lookupId) {
      const links = await callZephlyAPI('mcpListFeatureLinks', { featureId: lookupId });
      result.links = links?.links ?? links;
    }
    if (includePaths && lookupId) {
      const paths = await callZephlyAPI('mcpListFeaturePaths', { featureId: lookupId });
      result.paths = paths?.paths ?? paths;
    }
    return result;
  }

  // List / tree mode
  const params = { organizationId };
  // projectIds is the multi-project scope (E-242); the API takes it
  // comma-separated and treats it as satisfying the mandatory project scope.
  if (Array.isArray(filters.projectIds) && filters.projectIds.length > 0) {
    params.projectIds = filters.projectIds.join(',');
  } else if (filters.projectId) {
    params.projectId = filters.projectId;
  }
  if (filters.status) params.status = filters.status;
  if (tree) {
    // A forest is a whole structure; the API ignores paging for it.
    params.tree = 'true';
    return callZephlyAPI('mcpListFeatures', params);
  }
  if (filters.search) params.search = filters.search;
  if (filters.sortBy) params.sortBy = filters.sortBy;
  if (filters.sortDir) params.sortDir = filters.sortDir;
  if (filters.limit != null) params.limit = filters.limit;
  if (filters.offset != null) params.offset = filters.offset;
  return callZephlyAPI('mcpListFeatures', params);
}

/**
 * Semantic search over an organization's features (capture-at-build gate, E-164).
 * Returns existing features ranked by similarity so callers add to an existing
 * capability instead of creating a duplicate.
 */
export async function searchFeatures(args) {
  const { organizationId, query, limit } = args;
  const params = { organizationId, query };
  if (limit != null) params.limit = limit;
  return callZephlyAPI('mcpSearchFeatures', params);
}

// --- Private helpers ---

async function createFeature(args) {
  return callZephlyAPI('mcpCreateFeature', args);
}

async function updateFeature(args) {
  return callZephlyAPI('mcpUpdateFeature', args);
}

async function deleteFeature({ featureId }) {
  return callZephlyAPI('mcpDeleteFeature', { featureId });
}

async function linkFeatureArtifact({ featureId, targetType, targetId }) {
  return callZephlyAPI('mcpLinkFeatureArtifact', { featureId, targetType, targetId });
}

async function unlinkFeatureArtifact({ featureId, targetType, targetId }) {
  return callZephlyAPI('mcpUnlinkFeatureArtifact', { featureId, targetType, targetId });
}

// Add, remove or replace the code paths a feature owns (E-258). Paths are what
// auto-link work to the feature when it touches those files.
async function setFeaturePaths({ featureId, pathsMode, paths }) {
  return callZephlyAPI('mcpSetFeaturePaths', { featureId, mode: pathsMode || 'add', paths });
}

async function promoteEpic({ epicId }) {
  return callZephlyAPI('mcpPromoteEpicToFeature', { epicId });
}

// Generate (and persist) the feature's grounded "how it works" living
// description via the model (E-165). AI-quota gated server-side.
async function generateHowItWorks({ featureId }) {
  return callZephlyAPI('mcpGenerateHowItWorks', { featureId });
}

// Apply (persist) a LOCAL-agent-authored "how it works" for a feature (BYO-AI,
// E-190). The agent writes { markdown, sources }; the server validates the cited
// sources against the real grounded context before saving. No server model call.
async function applyHowItWorks({ featureId, markdown, sources }) {
  return callZephlyAPI('mcpApplyHowItWorks', { featureId, markdown, sources });
}

// Apply an approved init/backfill proposal tree (E-167): create features
// (parents→children), backfill links, and persist any agent-authored "how it
// works". The clustering/inference runs locally in the desktop with the user's
// own AI; this only commits the human-approved result. Server-side ApplyInit
// resolves tempId→featureId ordering and validates sources.
async function applyInit({ organizationId, projectId, nodes }) {
  return callZephlyAPI('mcpApplyFeatureInit', { organizationId, projectId, nodes });
}
