/**
 * Links Handlers
 *
 * Thin wrappers over /api/mcp/v1/links — the polymorphic entity_links
 * surface added in Phase 3. Dispatch happens server-side in
 * core/links.Service; the MCP layer just forwards the request.
 */

import {
  resolvePathsToComponents,
  previewEntityLinks,
  partitionProposals,
  attachSuggestionIds,
} from '../lib/autolink.js';
import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_link to add or remove a link.
 */
export async function manageLink(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'add':
    return addLink(params);
  case 'remove':
    return removeLink(params);
  case 'verify':
    return verifyLink(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected "add", "remove", or "verify".`);
  }
}

async function addLink({ sourceType, sourceId, targetType, targetId, linkType }) {
  return callZephlyAPI('mcpAddLink', {
    sourceType,
    sourceId,
    targetType,
    targetId,
    linkType,
  });
}

async function removeLink({ sourceType, sourceId, targetType, targetId, linkType }) {
  return callZephlyAPI('mcpRemoveLink', {
    sourceType,
    sourceId,
    targetType,
    targetId,
    linkType,
  });
}

/**
 * Stamp a link's freshness (E-166/E-154): record that you confirmed the link
 * is still correct, optionally against the commit you verified it at. Call this
 * after touching code that a linked document describes so the freshness signal
 * stays accurate. commitSha is optional.
 */
async function verifyLink({ sourceType, sourceId, targetType, targetId, linkType, commitSha }) {
  const params = { sourceType, sourceId, targetType, targetId, linkType };
  if (commitSha) params.commitSha = commitSha;
  return callZephlyAPI('mcpVerifyLink', params);
}

/**
 * The tool speaks the agent's vocabulary (outgoing/incoming/both) because
 * "outgoing" is unambiguous about whose perspective it is; the API's
 * ?direction= speaks in anchor terms (source/target/both). Translate here —
 * one mapping in one place — rather than leaking the API's wording into every
 * agent's mental model.
 */
const DIRECTION_TO_API = {
  outgoing: 'source',
  incoming: 'target',
  both: 'both',
};

/**
 * List a given entity's links. Filters on linkType and targetType are
 * optional — omit them for "all outgoing links".
 *
 * `direction` selects outgoing (default), incoming, or both — relates_to is
 * not always stored bidirectionally, so "both" is what you want for an
 * entity's full neighbourhood.
 *
 * `hydrate` resolves each target to its title/status so the caller can read the
 * graph without a follow-up get_* per link. Opt-in because it costs a lookup
 * per row.
 */
export async function listLinks({
  sourceType,
  sourceId,
  linkType,
  targetType,
  hydrate,
  direction,
  includeSuggested,
}) {
  const params = { sourceType, sourceId };
  if (linkType) params.linkType = linkType;
  if (targetType) params.targetType = targetType;
  if (hydrate) params.hydrate = 'true';
  if (direction) params.direction = DIRECTION_TO_API[direction] || direction;
  if (includeSuggested) params.includeSuggested = 'true';
  return callZephlyAPI('mcpListLinks', params);
}

/**
 * resolve_links — which components and features own these files?
 *
 * The read that makes linking cheap: an agent asks once, before creating work,
 * and gets back the entities it should attach rather than having to know the
 * component inventory. Returns `unresolved` too, because a path nothing covers
 * is itself information — it usually means the inventory has a gap.
 *
 * Features (E-258) are split by what the engine would do with them: a feature
 * that solely owns the path links on its own; a path several features share is
 * a choice for the caller to make.
 */
export async function resolveLinks({ projectId, paths }) {
  const { matches, features, unresolved } = await resolvePathsToComponents({ projectId, paths });
  const featureMatches = features || [];
  return {
    deterministic: matches.filter((m) => m.score >= 1),
    probable: matches.filter((m) => m.score < 1),
    features: {
      owned: featureMatches.filter((f) => !f.ambiguous),
      shared: featureMatches.filter((f) => f.ambiguous),
    },
    unmatchedPaths: unresolved,
    count: matches.length + featureMatches.length,
  };
}

/**
 * preview_links — what would be linked, without writing.
 *
 * Split into the two groups a caller acts on differently: what EzModo records
 * on its own, and what it wants confirmed.
 */
export async function previewLinks({
  projectId,
  subjectType,
  subjectId,
  paths,
  componentId,
  epicId,
  trigger,
}) {
  const { proposals } = await previewEntityLinks({
    projectId, subjectType, subjectId, paths, componentId, epicId, trigger,
  });
  const { autoLinked, linkSuggestions } = partitionProposals(proposals);

  // Preview writes nothing, but the engine may already have queued rows for this
  // entity from an earlier trigger. Attaching their ids lets a caller act on what
  // it sees instead of taking a second lookup to find out how (#2297).
  const resolved = await attachSuggestionIds({ subjectType, subjectId, linkSuggestions });
  return {
    autoLinked,
    linkSuggestions: resolved.linkSuggestions,
    count: autoLinked.length + resolved.linkSuggestions.length,
  };
}
