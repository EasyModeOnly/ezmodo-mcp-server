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

import { callEzmodoAPI } from '../lib/http-client.js';
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
  case 'add_input': return addDecisionInput(params);
  case 'decide': return decideDecision(params);
  case 'hold_task': return holdTask(params);
  case 'release_task': return releaseTask(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, link, unlink, ` +
      'supersede, promote_from_knowledge, add_input, decide, hold_task, or release_task.');
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
    const result = await callEzmodoAPI('mcpGetDecision', { decisionId });
    if (includeLinks) {
      const links = await callEzmodoAPI('mcpListDecisionLinks', { decisionId });
      result.links = links?.links ?? links;
    }
    return result;
  }

  // Decisions to make on an epic (E-259).
  if (filters.epicId) {
    const params = { epicId: filters.epicId };
    if (filters.status) params.status = filters.status;
    return callEzmodoAPI('mcpListDecisions', params);
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
  return callEzmodoAPI('mcpListDecisions', params);
}

// --- Private helpers ---

async function createDecision(args) {
  // `links` is applied by the MCP layer after the decision exists (E-225).
  const { links, ...createArgs } = args;
  // On create the server takes option labels; accept {label} objects too.
  if (Array.isArray(createArgs.choices)) {
    createArgs.choices = createArgs.choices.map((c) => (typeof c === 'string' ? c : c?.label));
  }
  const result = await callEzmodoAPI('mcpCreateDecision', createArgs);

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, {
    sourceType: 'decision',
    sourceId: result?.decisionId || result?.decision?.id,
    links,
  });

  return result;
}

async function updateDecision(args) {
  // On update the server takes the full list as {id, label}; a bare string is
  // a new option.
  if (Array.isArray(args.choices)) {
    args = { ...args, choices: args.choices.map((c) => (typeof c === 'string' ? { label: c } : c)) };
  }
  return callEzmodoAPI('mcpUpdateDecision', args);
}

async function deleteDecision({ decisionId }) {
  return callEzmodoAPI('mcpDeleteDecision', { decisionId });
}

async function linkDecisionArtifact({ decisionId, targetType, targetId }) {
  return callEzmodoAPI('mcpLinkDecisionArtifact', { decisionId, targetType, targetId });
}

async function unlinkDecisionArtifact({ decisionId, targetType, targetId }) {
  return callEzmodoAPI('mcpUnlinkDecisionArtifact', { decisionId, targetType, targetId });
}

// Mark a decision as superseded by another decision (records the supersession
// chain; the superseded decision's status moves to "superseded" server-side).
async function supersedeDecision({ decisionId, supersededById }) {
  return callEzmodoAPI('mcpSupersedeDecision', { decisionId, supersededById });
}

// Elevate a task's decision-type knowledge item into a durable Decision (E-170),
// optionally linking the new decision to an artifact in the same call.
async function promoteFromKnowledge({ organizationId, taskId, knowledgeId, title, linkToType, linkToId }) {
  return callEzmodoAPI('mcpPromoteDecisionFromKnowledge', {
    organizationId,
    taskId,
    knowledgeId,
    title,
    linkToType,
    linkToId,
  });
}

// --- Decisions to make on an epic (E-259) ---

// Record a pick. It counts for the person whose key is used, and replaces
// their earlier pick; the server records which AI made it.
async function addDecisionInput({ decisionId, choiceId, reason }) {
  return callEzmodoAPI('mcpAddDecisionInput', { decisionId, choiceId, reason });
}

// Decide. The server refuses anyone but the epic's owner or an editor.
async function decideDecision({ decisionId, status, choiceId, decision, rejectedReasons }) {
  return callEzmodoAPI('mcpDecideDecision', { decisionId, status, choiceId, decision, rejectedReasons });
}

async function holdTask({ decisionId, taskId }) {
  return callEzmodoAPI('mcpHoldTaskForDecision', { decisionId, taskId });
}

async function releaseTask({ decisionId, taskId }) {
  return callEzmodoAPI('mcpReleaseTaskFromDecision', { decisionId, taskId });
}
