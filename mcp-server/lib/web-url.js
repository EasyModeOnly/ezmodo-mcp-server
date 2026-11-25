/**
 * Web URL Builder
 *
 * The API builds the link (#4059): every entity in an MCP API response that
 * carries a `ref` comes back with a `webUrl`, from the one route table in
 * api/internal/core/refs/weburl.go. Each builder here returns that link when
 * the entity has one, and only builds a URL itself, from the cached project
 * context, for a response that carries no ref (a create's bare
 * { taskId, taskNumber }). Never add a route here: add it to the API's table.
 */

import { readConfig } from './local-cache.js';
import { CONFIG } from '../config/index.js';

/**
 * Get the base web URL and routing slugs from cached config.
 * Returns null if config is unavailable.
 */
async function getRoutingContext() {
  const config = await readConfig();
  if (!config?.orgSlug || !config?.projectSlug) return null;
  return {
    baseUrl: CONFIG.webUrl,
    organizationId: config.organizationId,
    orgSlug: config.orgSlug,
    projectSlug: config.projectSlug,
  };
}

/**
 * The API's own link for an entity (#4059), or null when it sent none.
 * @param {object} [entity]
 * @returns {string|null}
 */
export function apiWebUrl(entity) {
  const url = entity && typeof entity === 'object' ? entity.webUrl : null;
  return typeof url === 'string' && url ? url : null;
}

/**
 * Build a web URL for a task.
 * @param {number} taskNumber
 * @param {object} [entity] the task as the API returned it; its webUrl wins
 * @returns {Promise<string|null>}
 */
export async function buildTaskUrl(taskNumber, entity) {
  const fromApi = apiWebUrl(entity);
  if (fromApi) return fromApi;
  if (!taskNumber) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/projects/${ctx.projectSlug}/tasks/${taskNumber}`;
}

/**
 * Build a web URL for an epic.
 * @param {number} epicNumber
 * @param {object} [entity] the epic as the API returned it; its webUrl wins
 * @returns {Promise<string|null>}
 */
export async function buildEpicUrl(epicNumber, entity) {
  const fromApi = apiWebUrl(entity);
  if (fromApi) return fromApi;
  if (!epicNumber) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/projects/${ctx.projectSlug}/epics/${epicNumber}`;
}

/**
 * Build a web URL for a goal.
 * @param {string} goalId
 * @param {object} [entity] the goal as the API returned it; its webUrl wins
 * @returns {Promise<string|null>}
 */
export async function buildGoalUrl(goalId, entity) {
  const fromApi = apiWebUrl(entity);
  if (fromApi) return fromApi;
  if (!goalId) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/goals/${goalId}`;
}

/**
 * Build a web URL for a milestone.
 * @param {string} milestoneSlug
 * @param {object} [entity] the milestone as the API returned it; its webUrl wins
 * @returns {Promise<string|null>}
 */
export async function buildMilestoneUrl(milestoneSlug, entity) {
  const fromApi = apiWebUrl(entity);
  if (fromApi) return fromApi;
  if (!milestoneSlug) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/projects/${ctx.projectSlug}/milestones/${milestoneSlug}`;
}

/**
 * Build a web URL for a design (#3490): `<base>/<orgSlug>/designs/<slug or id>`.
 *
 * The API's webUrl wins when the design carries one (#4059). Otherwise:
 * designs are org-level, so the org in the URL must be the design's own. The
 * cached config only knows the checkout's org slug, so a design from any other
 * org (or one whose org is not in the response) gets no URL rather than a link
 * into the wrong workspace. The slug is preferred: it is unique among the
 * org's live designs and the page resolves it.
 * @param {{id?: string, slug?: string, organizationId?: string}} design
 * @returns {Promise<string|null>}
 */
export async function buildDesignUrl(design) {
  const fromApi = apiWebUrl(design);
  if (fromApi) return fromApi;
  const handle = design?.slug || design?.id;
  if (!handle || !design?.organizationId) return null;
  const ctx = await getRoutingContext();
  if (!ctx || ctx.organizationId !== design.organizationId) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/designs/${encodeURIComponent(handle)}`;
}
