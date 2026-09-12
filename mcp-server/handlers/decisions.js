/**
 * Decision Handlers
 * Handler functions for the Decisions / ADRs MCP tools (E-170).
 *
 * Decisions are org-level, durable ADR-style records (title, context, options,
 * decision, consequences, status) that LINK to features and other artifacts via
 * the generic link graph. These handlers are thin wrappers over
 * /api/mcp/v1/decisions; dispatch and validation happen server-side in
 * core/decisions.Service.
 */

import { callZephlyAPI } from '../lib/http-client.js';
import { attachLinks } from '../lib/links-at-create.js';

/**
 * Dispatch manage_decision actions.
 */
export async function manageDecision(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createDecision(params);
  case 'update': return updateDecision(params);
  case 'delete': return deleteDecision(params);
  case 'link': return linkDecisionArtifact(params);
  case 'unlink': return unlinkDecisionArtifact(params);
  case 'supersede': return supersedeDecision(params);
  case 'promote_from_knowledge': return promoteFromKnowledge(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, link, unlink, supersede, or promote_from_knowledge.`);
  }
}

/**
 * Unified get/list handler for decisions.
 * - decisionId → single lookup (optionally + links).
 * - linkedType + linkedId → decisions linked to that entity (e.g. a feature).
 * - organizationId only → list (optionally filtered by projectId/status/limit).
 */
export async function getDecision(args) {
  const { includeLinks, decisionId, organizationId, linkedType, linkedId, ...filters } = args;

  if (decisionId) {
    const result = await callZephlyAPI('mcpGetDecision', { decisionId });
    if (includeLinks) {
      const links = await callZephlyAPI('mcpListDecisionLinks', { decisionId });
      result.links = links?.links ?? links;
    }
    return result;
  }

  // List mode
  const params = {};
  if (organizationId) params.organizationId = organizationId;
  if (linkedType && linkedId) {
    params.linkedType = linkedType;
    params.linkedId = linkedId;
  }
  if (filters.projectId) params.projectId = filters.projectId;
  if (filters.status) params.status = filters.status;
  if (filters.limit != null) params.limit = filters.limit;
  return callZephlyAPI('mcpListDecisions', params);
}

// --- Private helpers ---

async function createDecision(args) {
  // `links` is applied by the MCP layer after the decision exists (E-225).
  const { links, ...createArgs } = args;
  const result = await callZephlyAPI('mcpCreateDecision', createArgs);

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, {
    sourceType: 'decision',
    sourceId: result?.decisionId || result?.decision?.id,
    links,
  });

  return result;
}

async function updateDecision(args) {
  return callZephlyAPI('mcpUpdateDecision', args);
}

async function deleteDecision({ decisionId }) {
  return callZephlyAPI('mcpDeleteDecision', { decisionId });
}

async function linkDecisionArtifact({ decisionId, targetType, targetId }) {
  return callZephlyAPI('mcpLinkDecisionArtifact', { decisionId, targetType, targetId });
}

async function unlinkDecisionArtifact({ decisionId, targetType, targetId }) {
  return callZephlyAPI('mcpUnlinkDecisionArtifact', { decisionId, targetType, targetId });
}

// Mark a decision as superseded by another decision (records the supersession
// chain; the superseded decision's status moves to "superseded" server-side).
async function supersedeDecision({ decisionId, supersededById }) {
  return callZephlyAPI('mcpSupersedeDecision', { decisionId, supersededById });
}

// Elevate a task's decision-type knowledge item into a durable Decision (E-170),
// optionally linking the new decision to an artifact in the same call.
async function promoteFromKnowledge({ organizationId, taskId, knowledgeId, title, linkToType, linkToId }) {
  return callZephlyAPI('mcpPromoteDecisionFromKnowledge', {
    organizationId,
    taskId,
    knowledgeId,
    title,
    linkToType,
    linkToId,
  });
}
