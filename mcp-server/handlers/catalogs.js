/**
 * Catalog Handlers (E-215)
 * Handler functions for the catalog MCP tools. These are thin wrappers over
 * /api/mcp/v1/catalogs; validation, checksum-gating, and version bumping all
 * happen server-side in core/catalogs.Service.
 *
 * A Catalog is a generalized, code-derived catalog; its versions are immutable
 * { columns, items } snapshots. Agents read the current snapshot (get_catalog)
 * to understand a catalog and push new snapshots after changing its source of
 * truth in code (capture-at-build).
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_catalog actions.
 */
export async function manageCatalog(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createCatalog(params);
  case 'update': return updateCatalog(params);
  case 'delete': return deleteCatalog(params);
  case 'link': return params.itemKey ? linkCatalogItem(params) : linkCatalogArtifact(params);
  case 'unlink': return params.itemKey ? unlinkCatalogItem(params) : unlinkCatalogArtifact(params);
  case 'snapshot': return snapshotCatalog(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, link, unlink, or snapshot.`);
  }
}

/**
 * Retrieve a single catalog and, by default, its current snapshot.
 * - version → that specific version's full snapshot (result.version)
 * - else (unless metadataOnly) → the current version's full snapshot (result.currentVersion)
 * - includeVersions → version metadata history (result.versions)
 *
 * The current-version fetch is best-effort: a freshly created catalog has no
 * snapshot yet, so a 404 there leaves currentVersion null instead of failing.
 */
export async function getCatalog(args) {
  const { catalogId, version, includeVersions, versionsLimit, metadataOnly } = args;
  if (!catalogId) {
    throw new Error('catalogId is required');
  }

  const result = await callZephlyAPI('mcpGetCatalog', { catalogId });

  if (version != null) {
    result.version = await callZephlyAPI('mcpGetCatalogVersion', { catalogId, version });
  } else if (!metadataOnly) {
    try {
      result.currentVersion = await callZephlyAPI('mcpGetCurrentCatalog', { catalogId });
    } catch {
      // No snapshot taken yet — leave the live catalog empty rather than erroring.
      result.currentVersion = null;
    }
  }

  if (includeVersions) {
    const params = { catalogId };
    if (versionsLimit != null) params.limit = versionsLimit;
    const versions = await callZephlyAPI('mcpListCatalogVersions', params);
    result.versions = versions?.versions ?? versions;
  }

  return result;
}

/**
 * List catalogs for an organization, optionally filtered by project/kind, or the
 * catalogs linked to a given entity (linkedType + linkedId).
 */
export async function listCatalogs(args) {
  const params = {};
  if (args.organizationId) params.organizationId = args.organizationId;
  if (args.projectId) params.projectId = args.projectId;
  if (args.kind) params.kind = args.kind;
  if (args.linkedType) params.linkedType = args.linkedType;
  if (args.linkedId) params.linkedId = args.linkedId;
  if (args.limit != null) params.limit = args.limit;
  return callZephlyAPI('mcpListCatalogs', params);
}

/**
 * Diff two versions of a catalog (added/removed items + per-item changes).
 */
export async function getCatalogDiff(args) {
  const { catalogId, from, to } = args;
  return callZephlyAPI('mcpDiffCatalog', { catalogId, from, to });
}

/**
 * List a catalog's entries that carry item-level links (E-218), each with its
 * work links and external URLs attached (compact).
 */
export async function listCatalogItems(args) {
  const { catalogId } = args;
  if (!catalogId) {
    throw new Error('catalogId is required');
  }
  return callZephlyAPI('mcpListCatalogItems', { catalogId });
}

// --- Private helpers ---

async function createCatalog(args) {
  return callZephlyAPI('mcpCreateCatalog', args);
}

async function updateCatalog(args) {
  return callZephlyAPI('mcpUpdateCatalog', args);
}

async function deleteCatalog({ catalogId }) {
  return callZephlyAPI('mcpDeleteCatalog', { catalogId });
}

async function linkCatalogArtifact({ catalogId, targetType, targetId }) {
  return callZephlyAPI('mcpLinkCatalog', { catalogId, targetType, targetId });
}

async function unlinkCatalogArtifact({ catalogId, targetType, targetId }) {
  return callZephlyAPI('mcpUnlinkCatalog', { catalogId, targetType, targetId });
}

// Item-level links (E-218): itemKey targets a single entry. With a url it's an
// external-URL link; otherwise it's an internal work link (targetType/targetId).
async function linkCatalogItem({ catalogId, itemKey, targetType, targetId, url, label }) {
  const params = { catalogId, itemKey };
  if (url) {
    params.url = url;
    if (label) params.label = label;
  } else {
    params.targetType = targetType;
    params.targetId = targetId;
  }
  return callZephlyAPI('mcpLinkCatalogItem', params);
}

async function unlinkCatalogItem({ catalogId, itemKey, targetType, targetId, url }) {
  const params = { catalogId, itemKey };
  if (url) {
    params.url = url;
  } else {
    params.targetType = targetType;
    params.targetId = targetId;
  }
  return callZephlyAPI('mcpUnlinkCatalogItem', params);
}

/**
 * Push a new version of a catalog's contents.
 *
 * Two modes (E-226). Replace (the default) sends the whole { columns, items }.
 * Patch sends only upsertItems/removeKeys and the server merges them onto the
 * current version — the cheap path for incremental capture, since a full
 * snapshot has to be generated token by token. `snapshot` is still forwarded in
 * patch mode because its columns/meta are honoured there.
 */
async function snapshotCatalog({ catalogId, mode, snapshot, upsertItems, removeKeys, source }) {
  const params = { catalogId };
  if (mode) params.mode = mode;
  if (snapshot) params.snapshot = snapshot;
  if (upsertItems) params.upsertItems = upsertItems;
  if (removeKeys) params.removeKeys = removeKeys;
  if (source) params.source = source;
  return callZephlyAPI('mcpSnapshotCatalog', params);
}
