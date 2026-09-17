/**
 * Component Handlers
 * Handler functions for component-related MCP tools
 *
 * Components are project-scoped entries in the unified UI inventory (E-168).
 * A single Component concept spans four kinds:
 * - area      — coarse codebase module (api, web, mobile); the legacy meaning
 * - screen    — a mobile / Flutter screen
 * - page      — a web route / page
 * - component — a reusable UI component
 * Components self-nest via parentComponentId (e.g. web → Sprint Board → TaskCard)
 * and carry sourcePath / route / framework. The task component-picker uses
 * kind=area. This is ONE concept — there is no separate "UI surface" entity.
 *
 * list_components uses local cache for simple requests, falling back to API.
 * Write operations (create, update, delete) invalidate the cache.
 */

import { callZephlyAPI } from '../lib/http-client.js';
import { getCachedComponents, updateCacheSections, invalidateCacheSection } from '../lib/local-cache.js';
import { attachLinks, applyLinks } from '../lib/links-at-create.js';

/**
 * Dispatch manage_component actions to the appropriate handler
 */
export async function manageComponent(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createComponent(params);
  case 'update': return updateComponent(params);
  case 'delete': return deleteComponent(params);
  case 'add_dependency': return addComponentDependency(params);
  case 'remove_dependency': return removeComponentDependency(params);
  case 'add_navigation': return addComponentNavigation(params);
  case 'remove_navigation': return removeComponentNavigation(params);
  case 'derive_navigation': return deriveComponentNavigation(params);
  case 'discover': return discoverComponents(params);
  case 'import': return importComponents(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * List components with optional enrichment data.
 * Uses local cache when available and fresh for basic list, falls back to API.
 */
export async function listComponents(args) {
  const { componentId, componentSlug, include, ...rest } = args;
  const isSingleLookup = componentId || componentSlug;
  const includes = include || [];

  // Timeline is NOT a supported include. It is rejected here — loudly, and on
  // every path — rather than dropped, because the API never had the data:
  // nothing populates Component.CachedTimeline (there is no cached_timeline
  // column, and repository_postgres.go neither reads nor writes the field), so
  // Service.GetComponentTimeline always returns a zeroed struct. The single
  // lookup therefore did not "work" while lists silently degraded; it answered
  // all-zeros, which reads as a real empty result and is the worse failure of
  // the two. Removing it from the schema enum is not enough on its own — a
  // client that ignores the enum must still get an error, not a plain list.
  if (includes.includes('timeline')) {
    throw new Error(
      'include:["timeline"] is not supported: component timeline data is not computed by the ' +
      'API, so it would return all zeros rather than real data. Use include:["stats"] for task ' +
      'counts (per component with componentId/componentSlug, or project-wide without one).'
    );
  }

  // Stats. With an identifier: that component. Without one: every component in
  // the project (the endpoint takes the identifier as optional). This branch
  // used to require isSingleLookup, so `include:["stats"]` on a list fell
  // through to the plain list and the stats request vanished without an error.
  if (includes.includes('stats')) {
    return getComponentStats({ projectId: rest.projectId, componentId, componentSlug });
  }

  // Navigation graph (project-wide screen→screen edges, E-223).
  if (includes.includes('navigation')) {
    return getComponentNavigation({ projectId: rest.projectId });
  }

  // Dependency graph (project-wide). The kind filter must be forwarded: this
  // branch bypasses the plain list entirely, so dropping `kind` here silently
  // returned the WHOLE inventory to a caller who asked for one kind.
  if (includes.includes('dependency_graph')) {
    const graphArgs = { projectId: rest.projectId };
    if (rest.kind) graphArgs.kind = rest.kind;
    return getComponentDependencyGraph(graphArgs);
  }

  // Basic list — use cache if available. Skip the cache when a kind filter is
  // set (E-168): the cache holds the full inventory, not kind-filtered subsets.
  if (rest.projectId && !isSingleLookup && !rest.kind) {
    const cached = await getCachedComponents(rest.projectId);
    if (cached !== null) {
      return { components: cached, cached: true };
    }
  }

  // The identifier must be forwarded: it is destructured out of `rest` above,
  // so without this a single lookup fell through to a plain list and returned
  // the WHOLE inventory to a caller who asked for one component — the same
  // dropped-filter shape as the `kind` bug, and just as silent.
  const listArgs = { ...rest };
  if (componentId) listArgs.componentId = componentId;
  if (componentSlug) listArgs.componentSlug = componentSlug;

  const result = await callZephlyAPI('mcpListComponents', listArgs);

  // Cache the results for future use. Only cache the FULL inventory — neither a
  // kind-filtered result (e.g. kind='area' from the project-context path) nor a
  // single lookup may overwrite the cache, or an unfiltered list_components
  // would then read back a subset (mirrors the cache-read skip above). The
  // single-lookup guard matters as of the fix above: while the identifier was
  // being dropped this call returned the full list, so caching it was harmless.
  if (rest.projectId && !isSingleLookup && !rest.kind && result?.components) {
    const summaries = result.components.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
    }));
    await updateCacheSections({ components: summaries });
  }

  return result;
}

/**
 * Create a new component
 */
async function createComponent(args) {
  // `links` is applied by the MCP layer after the component exists (E-225).
  const { links, ...createArgs } = args;
  const result = await callZephlyAPI('mcpCreateComponent', createArgs);
  await invalidateCacheSection('components');

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, {
    sourceType: 'component',
    sourceId: result?.componentId,
    links,
  });

  return result;
}

/**
 * Update an existing component
 */
async function updateComponent(args) {
  const result = await callZephlyAPI('mcpUpdateComponent', args);
  await invalidateCacheSection('components');
  return result;
}

/**
 * Delete a component
 */
async function deleteComponent(args) {
  const result = await callZephlyAPI('mcpDeleteComponent', args);
  await invalidateCacheSection('components');
  return result;
}

/**
 * Get stats for a component
 */
async function getComponentStats(args) {
  return callZephlyAPI('mcpGetComponentStats', args);
}

/**
 * Add a dependency between two components
 */
async function addComponentDependency(args) {
  return callZephlyAPI('mcpAddComponentDependency', args);
}

/**
 * Remove a dependency between two components
 */
async function removeComponentDependency(args) {
  return callZephlyAPI('mcpRemoveComponentDependency', args);
}

/**
 * Get the full dependency graph for a project's components
 */
async function getComponentDependencyGraph(args) {
  return callZephlyAPI('mcpGetComponentDependencyGraph', args);
}

/**
 * Add a screen→screen navigation edge (E-223). Endpoints may be given as IDs or
 * slugs. Idempotent — re-adding an existing edge is a no-op.
 */
async function addComponentNavigation(args) {
  return callZephlyAPI('mcpAddComponentNavigation', args);
}

/**
 * Remove a screen→screen navigation edge (E-223). Idempotent.
 */
async function removeComponentNavigation(args) {
  return callZephlyAPI('mcpRemoveComponentNavigation', args);
}

/**
 * Re-derive the screen-flow map from the synced Context Manifest (E-239 #2409).
 *
 * Idempotent, and it cannot destroy hand-drawn work: it reconciles only edges
 * still at origin auto/inferred under its own rules, so a human's edge — or one
 * they promoted — is left alone and reported as `spared`.
 *
 * Returns { result: { derived, byRule, retracted, spared, unresolved }, projectId }.
 * `unresolved` names navigation references no component matched, which is how a
 * stale inventory shows itself instead of the map silently shrinking.
 */
async function deriveComponentNavigation({ projectId }) {
  // E-258: the flow map now lives on the project's screens catalog. The sync
  // route reconciles the catalog with the manifest, re-derives its navigation,
  // and still re-derives the component flow map until components are retired.
  return callZephlyAPI('mcpSyncScreens', { projectId });
}

/**
 * Read the project's navigation edges (E-223) so an agent can see the existing
 * flow before writing to it. Returns { edges, projectId }.
 */
async function getComponentNavigation(args) {
  return callZephlyAPI('mcpGetComponentNavigation', args);
}

/**
 * Discover candidate UI surfaces (page / component kinds) for a project from the
 * Context Manifest that are not yet in the inventory (E-168). Manifest-assisted;
 * returns { surfaces: [{kind,name,sourcePath,route,framework,summary}], projectId, count }.
 */
async function discoverComponents({ projectId }) {
  return callZephlyAPI('mcpDiscoverComponents', { projectId });
}

/**
 * Bulk-import UI surfaces as components (E-168). Each surface becomes a component,
 * optionally nested under parentComponentId and/or linked to featureId.
 * Returns { imported: [{componentId,slug,name,kind,sourcePath,linked}], count }.
 */
async function importComponents({ projectId, parentComponentId, featureId, surfaces }) {
  // Per-surface `links` are applied by the MCP layer after import, so a 90-screen
  // import can carry its links in one call (E-225) instead of 90 manage_link
  // round trips.
  const list = Array.isArray(surfaces) ? surfaces : [];
  const body = {
    projectId,
    surfaces: list.map(({ links, ...surface }) => surface),  
  };
  if (parentComponentId) body.parentComponentId = parentComponentId;
  if (featureId) body.featureId = featureId;
  const result = await callZephlyAPI('mcpImportComponents', body);
  await invalidateCacheSection('components');

  // Match each imported component back to the surface that asked for links.
  // Matching on name + sourcePath rather than index because the API is free to
  // skip surfaces that already exist.
  const imported = Array.isArray(result?.imported) ? result.imported : [];
  const linkResults = [];
  for (const surface of list) {
    if (!Array.isArray(surface?.links) || surface.links.length === 0) continue;
    const match = imported.find(
      (c) => c?.name === surface.name && (!surface.sourcePath || c?.sourcePath === surface.sourcePath),
    );
    if (!match?.componentId) continue;
    const outcome = await applyLinks({
      sourceType: 'component',
      sourceId: match.componentId,
      links: surface.links,
    });
    linkResults.push({ componentId: match.componentId, ...outcome });
  }
  if (linkResults.length > 0 && result && typeof result === 'object') {
    result.links = linkResults;
  }

  return result;
}
