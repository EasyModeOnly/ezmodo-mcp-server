/**
 * Suggested tags (#2830).
 *
 * Keyword matches from lib/auto-assign.js are returned to the agent as
 * `suggestedTags` and never applied; see that file for why.
 */

/**
 * Turn keyword matches into the `suggestedTags` a create response carries,
 * leaving out tags the caller already applied explicitly.
 *
 * @param {object|null} autoAssign - Result of resolveTaskAutoAssign / resolveEpicAutoAssign
 * @param {string[]} [appliedTagIds] - Tag IDs sent with the create
 * @returns {Array<{id: string, name: string}>}
 */
export function suggestTags(autoAssign, appliedTagIds = []) {
  const applied = new Set(appliedTagIds || []);
  return (autoAssign?.matchedTags || [])
    .filter((t) => !applied.has(t.id))
    .map((t) => ({ id: t.id, name: t.name }));
}
