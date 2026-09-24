import { callEzmodoAPI } from './http-client.js';

/**
 * Auto-linking helpers (E-225).
 *
 * The API resolves file paths to the features that own them and previews what
 * the autolink engine would propose. Both are read-only, so an agent can ask
 * "what does this touch?" before it creates or commits anything.
 *
 * Everything here is best-effort: a resolver that is unavailable, or an API
 * older than E-225, must degrade to "no information" rather than failing the
 * surrounding create/update. A missing link is recoverable; a failed task
 * create loses the agent's work.
 */

/**
 * Resolve repo-relative file paths to the features that own them through their
 * code paths (E-258).
 *
 * The API's response may still carry a component `matches` array (components
 * were retired after this server shipped); it is ignored.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string[]} params.paths - repo-relative paths
 * @returns {Promise<{features: object[], unresolved: string[]}>}
 */
export async function resolvePathsToFeatures({ projectId, paths }) {
  if (!projectId || !Array.isArray(paths) || paths.length === 0) {
    return { features: [], unresolved: [] };
  }
  try {
    const result = await callEzmodoAPI('mcpResolvePaths', { projectId, paths });
    return {
      features: result?.features || [],
      unresolved: result?.unresolved || [],
    };
  } catch {
    // An API predating E-225 has no such route. Report nothing rather than
    // surfacing a 404 the agent can do nothing about.
    return { features: [], unresolved: paths };
  }
}

/**
 * Preview what the autolink engine would propose for an entity, writing
 * nothing. This is the explicit-gate mechanism: show the proposals, let the
 * caller confirm the ones it wants via manage_link (which records them as
 * human-asserted).
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} params.subjectType - e.g. 'task'
 * @param {string} params.subjectId
 * @param {string[]} [params.paths]
 * @param {string} [params.trigger]
 * @param {string} [params.epicId]
 * @returns {Promise<{proposals: object[]}>}
 */
export async function previewEntityLinks({
  projectId,
  subjectType,
  subjectId,
  paths,
  trigger,
  epicId,
}) {
  if (!subjectType || !subjectId) return { proposals: [] };
  try {
    const result = await callEzmodoAPI('mcpPreviewLinks', {
      projectId,
      subjectType,
      subjectId,
      paths,
      trigger,
      epicId,
    });
    return { proposals: result?.proposals || [] };
  } catch {
    return { proposals: [] };
  }
}

/**
 * Split preview proposals into the two groups a caller cares about: what the
 * engine would write on its own, and what it wants a human to confirm.
 *
 * Callers surface these differently — "already handled" vs "please look" — so
 * doing the split once here keeps every handler from re-deriving it.
 */
export function partitionProposals(proposals = []) {
  const autoLinked = [];
  const linkSuggestions = [];
  for (const p of proposals) {
    (p?.autoApplies ? autoLinked : linkSuggestions).push({
      targetType: p.targetType,
      targetId: p.targetId,
      linkType: p.linkType,
      rule: p.rule,
      confidence: p.confidence,
      evidence: p.evidence,
    });
  }
  return { autoLinked, linkSuggestions };
}

/** Key a suggestion by what it points at — the only thing a preview proposal
 *  and its persisted row are guaranteed to agree on. */
function targetKey(targetType, targetId) {
  return `${targetType || ''}:${targetId || ''}`;
}

/**
 * Read the pending link suggestions the engine actually persisted for an entity.
 *
 * The API returns Go-shaped rows (`ID`, `TargetEntityType`, …); normalise here so
 * no caller has to know that. Best-effort like everything else in this module:
 * an unavailable queue costs the ids, not the surrounding create.
 */
export async function fetchPendingLinkSuggestions({ subjectType, subjectId }) {
  if (!subjectType || !subjectId) return [];
  try {
    const result = await callEzmodoAPI('mcpListAgentSuggestions', {
      entityType: subjectType,
      entityId: subjectId,
      action: 'link',
    });
    const rows = result?.suggestions || [];
    return rows.map((row) => ({
      suggestionId: row.ID ?? row.id ?? row.suggestionId,
      targetType: row.TargetEntityType ?? row.targetEntityType ?? row.targetType,
      targetId: row.TargetEntityID ?? row.targetEntityId ?? row.targetId,
      linkType: row.Payload?.link_type ?? row.payload?.link_type ?? 'relates_to',
      rule: row.Payload?.rule ?? row.payload?.rule,
      confidence: row.Confidence ?? row.confidence,
      evidence: row.Payload ?? row.payload,
    })).filter((s) => s.suggestionId);
  } catch {
    return [];
  }
}

/**
 * Give each suggestion the `suggestionId` that `resolve_link_suggestions` needs.
 *
 * Without this an agent is told to clear its suggestions and handed nothing to
 * clear them WITH — the preview that produces them is read-only, so its
 * proposals carry no id (#2297).
 *
 * The persisted queue is also the authoritative set, not the preview: the
 * engine's semantic rules land a beat after the deterministic ones, so a
 * preview taken at create time can legitimately show fewer. Rows the preview
 * missed are appended rather than dropped, and `partial` warns when some
 * proposal has no row yet — resolvable only on a later read.
 */
export async function attachSuggestionIds({ subjectType, subjectId, linkSuggestions = [] }) {
  const persisted = await fetchPendingLinkSuggestions({ subjectType, subjectId });
  if (persisted.length === 0) {
    return { linkSuggestions, partial: linkSuggestions.length > 0 };
  }

  const byTarget = new Map(persisted.map((s) => [targetKey(s.targetType, s.targetId), s]));
  const seen = new Set();
  const merged = linkSuggestions.map((s) => {
    const key = targetKey(s.targetType, s.targetId);
    const match = byTarget.get(key);
    if (!match) return s;
    seen.add(key);
    return { suggestionId: match.suggestionId, ...s };
  });

  for (const s of persisted) {
    if (!seen.has(targetKey(s.targetType, s.targetId))) merged.push(s);
  }

  return { linkSuggestions: merged, partial: merged.some((s) => !s.suggestionId) };
}
