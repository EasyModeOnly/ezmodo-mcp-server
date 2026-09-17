/**
 * Auto-assign Utility
 * Matches task/epic content against cached tags for automatic assignment
 * during creation.
 */

import { readConfig } from './local-cache.js';

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match tags against text content using word boundary matching.
 * @param {string} text - Combined title + description
 * @param {Array} tags - Array of {id, name, color, category, description}
 * @returns {Array} Matching tag objects
 */
export function matchTags(text, tags) {
  if (!text || !tags?.length) return [];
  return tags.filter((t) => {
    const regex = new RegExp(`\\b${escapeRegex(t.name)}\\b`, 'i');
    return regex.test(text);
  });
}

/**
 * Resolve auto-assignment for a task being created.
 * Returns { matchedTags, organizationId } or null if no cache available.
 *
 * @param {string} projectId - The task's project ID
 * @param {string} title - Task title
 * @param {string} description - Task description
 * @returns {Promise<object|null>}
 */
export async function resolveTaskAutoAssign(projectId, title, description) {
  const config = await readConfig();
  if (!config) return null;

  const text = `${title || ''} ${description || ''}`.trim();

  const tags = config.tags || [];

  return {
    matchedTags: text ? matchTags(text, tags) : [],
    organizationId: config.organizationId || null,
  };
}

/**
 * Resolve auto-assignment for an epic being created.
 * Returns { matchedTags, organizationId } or null if no cache available.
 *
 * @param {string} title - Epic title
 * @param {string} description - Epic description
 * @returns {Promise<object|null>}
 */
export async function resolveEpicAutoAssign(title, description) {
  const config = await readConfig();
  if (!config) return null;

  const text = `${title || ''} ${description || ''}`.trim();
  if (!text) return null;

  const tags = config.tags || [];

  return {
    matchedTags: matchTags(text, tags),
    organizationId: config.organizationId || null,
  };
}
