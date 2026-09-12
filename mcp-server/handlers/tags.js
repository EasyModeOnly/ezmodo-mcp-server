/**
 * Tag Handlers
 * Handler functions for tag operations
 *
 * Consolidated: manageTag dispatches create/update/delete/merge/bulk_tag.
 * listTags unifies get/list/findEntities/suggest.
 *
 * list_tags uses local cache for unfiltered requests, falling back to API.
 * Write operations (create, update, delete, merge) invalidate the cache.
 */

import { callZephlyAPI } from '../lib/http-client.js';
import { getCachedTags, updateCacheSections, invalidateCacheSection } from '../lib/local-cache.js';

/**
 * Dispatch manage_tag actions to the appropriate handler
 */
export async function manageTag(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createTag(params);
  case 'update': return updateTag(params);
  case 'delete': return deleteTag(params);
  case 'merge': return mergeTags(params);
  case 'bulk_tag': return bulkTagEntities(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified list/get/find/suggest handler for tags
 */
export async function listTags(args) {
  // Strip routing flags before passing to helpers
  const { suggest, findEntities, ...params } = args;

  // Mode 1: suggest tags
  if (suggest) {
    return suggestTags(params);
  }

  // Mode 2: find entities by tags
  if (findEntities) {
    return findEntitiesByTags(params);
  }

  // Mode 3: single tag lookup by ID or name
  if (params.tagId || params.name) {
    return getTag(params);
  }

  // Mode 4: list tags with optional filters
  return listTagsFiltered(params);
}

// --- Private helpers ---

async function createTag(args) {
  const result = await callZephlyAPI('mcpCreateTag', args);
  await invalidateCacheSection('tags');
  return result;
}

async function updateTag(args) {
  const result = await callZephlyAPI('mcpUpdateTag', args);
  await invalidateCacheSection('tags');
  return result;
}

async function deleteTag(args) {
  const result = await callZephlyAPI('mcpDeleteTag', args);
  await invalidateCacheSection('tags');
  return result;
}

async function mergeTags(args) {
  const result = await callZephlyAPI('mcpMergeTags', args);
  await invalidateCacheSection('tags');
  return result;
}

async function bulkTagEntities(args) {
  return callZephlyAPI('mcpBulkTagEntities', args);
}

async function getTag(args) {
  return callZephlyAPI('mcpGetTag', args);
}

async function listTagsFiltered(args) {
  const hasFilters = args.category || args.searchQuery || args.pinnedOnly || args.includeHidden || args.projectId;

  if (!hasFilters) {
    const cached = await getCachedTags();
    if (cached !== null) {
      return { tags: cached, cached: true };
    }
  }

  // Call API
  const result = await callZephlyAPI('mcpListTags', args);

  // Cache unfiltered results for future use
  if (!hasFilters && result?.tags) {
    const summaries = result.tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color || '',
      category: t.category || 'custom',
      description: t.description || '',
    }));
    await updateCacheSections({ tags: summaries });
  }

  return result;
}

async function findEntitiesByTags(args) {
  return callZephlyAPI('mcpFindEntitiesByTags', args);
}

async function suggestTags(args) {
  return callZephlyAPI('mcpSuggestTags', args);
}
