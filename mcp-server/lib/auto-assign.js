/**
 * Auto-assign Utility
 * Matches task/epic content against cached tags and components
 * for automatic assignment during creation.
 */

import { readConfig } from './local-cache.js';

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match components against text content using word boundary matching.
 * @param {string} text - Combined title + description
 * @param {Array} components - Array of {id, name, description}
 * @returns {Array} Matching component objects
 */
export function matchComponents(text, components) {
  if (!text || !components?.length) return [];
  return components.filter((c) => {
    const regex = new RegExp(`\\b${escapeRegex(c.name)}\\b`, 'i');
    return regex.test(text);
  });
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
 * Returns { matchedTags, availableComponents, organizationId } or null if no cache available.
 *
 * Components are NOT auto-assigned — agents must explicitly provide componentId.
 * This function returns available components so the handler can hint at them if needed.
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

  const components = config.projectId === projectId ? (config.components || []) : [];
  const tags = config.tags || [];

  return {
    matchedTags: text ? matchTags(text, tags) : [],
    availableComponents: components.map((c) => ({ id: c.id, name: c.name })),
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
