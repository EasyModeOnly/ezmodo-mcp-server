/**
 * Links at create time (E-225).
 *
 * Creation tools accept a `links: [{targetType, targetId, linkType?}]` param so
 * an entity is born connected to the feature/goal/flag/document it belongs to.
 * This is the shared apply step every create handler calls after the entity
 * exists and its id is known.
 *
 * The invariant: NEVER THROWS. A link failure must not fail the entity create —
 * the entity is the user's work, the link is metadata. Failures come back in
 * `failed` so the agent (and the response) can see them. This mirrors
 * `applyAutoTags` in handlers/tasks.js.
 *
 * Links are applied ONE PER REQUEST, deliberately. This shipped anticipating a
 * `POST mcp/v1/links/batch` that was never implemented on the Go API, so every
 * create-with-links paid a 404 before falling back to exactly this loop — an
 * optimization that only ever cost a round trip. Real callers pass a handful of
 * links (the desktop LinkGate and the MCP create tools: typically one to five),
 * which is not enough to earn a second write surface. If some caller ever
 * arrives with dozens, batching is worth revisiting; until then this is the
 * whole story.
 */

import { callZephlyAPI } from './http-client.js';
import { getLogger } from './logger.js';

const DEFAULT_LINK_TYPE = 'relates_to';

/** Normalize + drop malformed entries. Returns [] when there is nothing to do. */
function normalize(links) {
  if (!Array.isArray(links)) return [];
  return links
    .filter((l) => l && l.targetType && l.targetId)
    .map((l) => ({
      targetType: l.targetType,
      targetId: l.targetId,
      linkType: l.linkType || DEFAULT_LINK_TYPE,
    }));
}

/**
 * Attach `links` to a just-created entity.
 *
 * @param {object} params
 * @param {string} params.sourceType - Linkable type of the created entity.
 * @param {string} params.sourceId   - ID of the created entity.
 * @param {Array}  params.links      - [{targetType, targetId, linkType?}]
 * @returns {Promise<{applied: Array, failed: Array}>} never rejects
 */
export async function applyLinks({ sourceType, sourceId, links }) {
  const items = normalize(links);
  if (!sourceType || !sourceId || items.length === 0) {
    return { applied: [], failed: [] };
  }

  const applied = [];
  const failed = [];
  for (const item of items) {
    try {
      await callZephlyAPI('mcpAddLink', {
        sourceType,
        sourceId,
        targetType: item.targetType,
        targetId: item.targetId,
        linkType: item.linkType,
      });
      applied.push(item);
    } catch (err) {
      getLogger().warn('Link failed', {
        sourceType,
        sourceId,
        targetType: item.targetType,
        targetId: item.targetId,
        error: err.message,
      });
      failed.push({ ...item, error: err.message });
    }
  }
  return { applied, failed };
}

/**
 * Convenience wrapper for create handlers: applies the links and stamps the
 * outcome onto the create result as `result.links`. No-op (and no property
 * added) when there is nothing to link or the id could not be resolved.
 */
export async function attachLinks(result, { sourceType, sourceId, links }) {
  const items = normalize(links);
  if (items.length === 0 || !sourceId || !result || typeof result !== 'object') {
    return result;
  }
  result.links = await applyLinks({ sourceType, sourceId, links: items });
  return result;
}
