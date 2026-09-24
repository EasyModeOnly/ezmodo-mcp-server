/**
 * Milestone Handlers
 * Handler functions for milestone-related MCP tools
 *
 * Milestones are project-scoped containers for tracking:
 * - Version releases (e.g., v1.2.0, v2.0.0-beta)
 * - Initiatives (e.g., Q1 2025, Sprint 5)
 *
 * Epics can be linked to milestones to track which features
 * will be included in a release or initiative.
 */

import { callEzmodoAPI } from '../lib/http-client.js';
import { buildMilestoneUrl } from '../lib/web-url.js';

/**
 * Dispatch manage_milestone actions to the appropriate handler
 */
export async function manageMilestone(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createMilestone(params);
  case 'update': return updateMilestone(params);
  case 'delete': return deleteMilestone(params);
  case 'link_epic': return linkEpicToMilestone(params);
  case 'unlink_epic': return unlinkEpicFromMilestone(params);
  case 'generate_changelog': return generateMilestoneChangelog(params);
  case 'reorder_epics': return reorderMilestoneEpics(params);
  case 'link_suite': return linkSuiteToMilestone(params);
  case 'unlink_suite': return unlinkSuiteFromMilestone(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified get/list handler for milestones.
 * - If milestoneId or milestoneSlug is provided, returns a single milestone.
 * - Otherwise, lists all milestones for the project with optional filters.
 * - If includeProgress is true, also fetches progress data.
 */
export async function getMilestone(args) {
  const { includeProgress, type, status, ...rest } = args;
  const isSingleLookup = rest.milestoneId || rest.milestoneSlug;

  if (isSingleLookup) {
    const result = await fetchSingleMilestone(rest);

    if (includeProgress) {
      const progress = await fetchMilestoneProgress(rest);
      result.progress = progress;
    }

    return result;
  }

  // List mode
  const listArgs = { projectId: rest.projectId };
  if (type) listArgs.type = type;
  if (status) listArgs.status = status;

  return listMilestones(listArgs);
}

// --- Private helpers ---

async function createMilestone(args) {
  const result = await callEzmodoAPI('mcpCreateMilestone', args);
  const webUrl = await buildMilestoneUrl(result?.slug);
  if (webUrl) result.webUrl = webUrl;
  return result;
}

async function fetchSingleMilestone(args) {
  const result = await callEzmodoAPI('mcpGetMilestone', args);
  const webUrl = await buildMilestoneUrl(result?.milestone?.slug);
  if (webUrl && result?.milestone) result.milestone.webUrl = webUrl;
  return result;
}

async function updateMilestone(args) {
  return callEzmodoAPI('mcpUpdateMilestone', args);
}

async function listMilestones(args) {
  return callEzmodoAPI('mcpListMilestones', args);
}

async function deleteMilestone(args) {
  return callEzmodoAPI('mcpDeleteMilestone', args);
}

async function linkEpicToMilestone(args) {
  const { epicId, entityType, ...rest } = args;
  return callEzmodoAPI('mcpLinkEpicToMilestone', {
    ...rest,
    entityId: epicId,
    entityType: entityType || 'epic',
  });
}

async function unlinkEpicFromMilestone(args) {
  return callEzmodoAPI('mcpUnlinkEpicFromMilestone', args);
}

async function generateMilestoneChangelog(args) {
  return callEzmodoAPI('mcpGenerateMilestoneChangelog', args);
}

async function fetchMilestoneProgress(args) {
  return callEzmodoAPI('mcpGetMilestoneProgress', args);
}

async function reorderMilestoneEpics(args) {
  const { itemIds, ...rest } = args;
  return callEzmodoAPI('mcpReorderMilestoneEpics', {
    ...rest,
    itemIds,
  });
}

async function linkSuiteToMilestone(args) {
  const { suiteId, ...rest } = args;
  return callEzmodoAPI('mcpLinkSuiteToMilestone', {
    ...rest,
    suiteId,
  });
}

async function unlinkSuiteFromMilestone(args) {
  return callEzmodoAPI('mcpUnlinkSuiteFromMilestone', args);
}
