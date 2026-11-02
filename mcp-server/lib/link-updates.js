/**
 * Links on update (#3414).
 *
 * manage_task and manage_epic advertise `addLinks` / `removeLinks` on update,
 * but the Go update endpoints have no such fields: encoding/json drops unknown
 * keys, so for as long as the params existed an update carrying them answered
 * success and changed nothing. The polymorphic links endpoint already does the
 * work (it is what `manage_link` and create-time `links` use), so the update
 * handlers strip these fields and apply them here, one request per link.
 *
 * Like create-time links this NEVER THROWS: a failed link is reported in
 * `failed` (with `op: "add" | "remove"`) next to whatever the update did.
 */

import { callEzmodoAPI } from './http-client.js';
import { getLogger } from './logger.js';
import { applyLinks, normalize } from './links-at-create.js';

/** True when the update carries at least one well-formed link change. */
export function hasLinkUpdates({ addLinks, removeLinks } = {}) {
  return normalize(addLinks).length > 0 || normalize(removeLinks).length > 0;
}

async function removeLinks({ sourceType, sourceId, links }) {
  const removed = [];
  const failed = [];
  for (const item of normalize(links)) {
    try {
      await callEzmodoAPI('mcpRemoveLink', { sourceType, sourceId, ...item });
      removed.push(item);
    } catch (err) {
      getLogger().warn('Link removal failed', {
        sourceType, sourceId, targetType: item.targetType, targetId: item.targetId, error: err.message,
      });
      failed.push({ ...item, op: 'remove', error: err.message });
    }
  }
  return { removed, failed };
}

/**
 * Apply `addLinks` then `removeLinks` to an existing entity.
 *
 * @returns {Promise<{added: Array, removed: Array, failed: Array}>} never rejects
 */
export async function applyLinkUpdates({ sourceType, sourceId, addLinks, removeLinks: toRemove }) {
  const add = await applyLinks({ sourceType, sourceId, links: addLinks });
  const rem = await removeLinks({ sourceType, sourceId, links: toRemove });
  return {
    added: add.applied,
    removed: rem.removed,
    failed: [...add.failed.map((f) => ({ ...f, op: 'add' })), ...rem.failed],
  };
}

/**
 * Stamp the outcome onto an update result as `result.links`, with a `warning`
 * when any link failed so a partial success never reads as a clean one.
 */
export async function attachLinkUpdates(result, { sourceType, sourceId, addLinks, removeLinks: toRemove }) {
  if (!hasLinkUpdates({ addLinks, removeLinks: toRemove }) || !sourceId) return result;
  const links = await applyLinkUpdates({ sourceType, sourceId, addLinks, removeLinks: toRemove });
  const out = result && typeof result === 'object' ? result : {};
  out.links = links;
  if (links.failed.length > 0) {
    out.warning = `${links.failed.length} link change(s) failed; see links.failed. The rest of the update applied.`;
  }
  return out;
}
