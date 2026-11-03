/**
 * Web URL Builder
 * Constructs web app URLs for entities using cached project context.
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
 * Build a web URL for a task.
 * @param {number} taskNumber
 * @returns {Promise<string|null>}
 */
export async function buildTaskUrl(taskNumber) {
  if (!taskNumber) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/projects/${ctx.projectSlug}/tasks/${taskNumber}`;
}

/**
 * Build a web URL for an epic.
 * @param {number} epicNumber
 * @returns {Promise<string|null>}
 */
export async function buildEpicUrl(epicNumber) {
  if (!epicNumber) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/projects/${ctx.projectSlug}/epics/${epicNumber}`;
}

/**
 * Build a web URL for a goal.
 * @param {string} goalId
 * @returns {Promise<string|null>}
 */
export async function buildGoalUrl(goalId) {
  if (!goalId) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/goals/${goalId}`;
}

/**
 * Build a web URL for a milestone.
 * @param {string} milestoneSlug
 * @returns {Promise<string|null>}
 */
export async function buildMilestoneUrl(milestoneSlug) {
  if (!milestoneSlug) return null;
  const ctx = await getRoutingContext();
  if (!ctx) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/projects/${ctx.projectSlug}/milestones/${milestoneSlug}`;
}

/**
 * Build a web URL for a design (#3490): `<base>/<orgSlug>/designs/<slug or id>`.
 *
 * Designs are org-level, so the org in the URL must be the design's own. The
 * cached config only knows the checkout's org slug, so a design from any other
 * org (or one whose org is not in the response) gets no URL rather than a link
 * into the wrong workspace. The slug is preferred: it is unique among the
 * org's live designs and the page resolves it.
 * @param {{id?: string, slug?: string, organizationId?: string}} design
 * @returns {Promise<string|null>}
 */
export async function buildDesignUrl(design) {
  const handle = design?.slug || design?.id;
  if (!handle || !design?.organizationId) return null;
  const ctx = await getRoutingContext();
  if (!ctx || ctx.organizationId !== design.organizationId) return null;
  return `${ctx.baseUrl}/${ctx.orgSlug}/designs/${encodeURIComponent(handle)}`;
}
