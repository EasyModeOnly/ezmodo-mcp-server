/**
 * Background Agents Handlers (E-150)
 *
 * Thin wrappers over /api/mcp/v1/agent-* — all real logic lives in
 * api/internal/core/agents. These tools let an MCP client review and act on
 * what the background agents staged in agent_suggestions.
 */

import { callZephlyAPI } from '../lib/http-client.js';

export async function listAgentSuggestions({
  limit, entityType, entityId, action, agentType, minConfidence,
} = {}) {
  const params = {};
  if (limit !== undefined) params.limit = limit;
  if (entityType) params.entityType = entityType;
  if (entityId) params.entityId = entityId;
  if (action) params.action = action;
  if (agentType) params.agentType = agentType;
  if (minConfidence !== undefined) params.minConfidence = minConfidence;
  return callZephlyAPI('mcpListAgentSuggestions', params);
}

/**
 * Accept and/or reject a batch of suggestions in one tool call.
 *
 * The API has no bulk endpoint, so this fans out sequentially — but from the
 * agent's side it is ONE call, which is the point. Clearing a queue item by
 * item costs a round trip each, and anything that expensive gets skipped;
 * suggestions then pile up until someone bulk-dismisses them unread.
 *
 * Sequential rather than parallel on purpose: accepting runs a real side effect
 * (inserting the link), and the dedup/quota bookkeeping behind it is easier to
 * reason about serialized. These batches are small — a handful per task.
 *
 * A failure is recorded against its id and the batch continues. One bad id must
 * not cost the rest.
 */
export async function resolveLinkSuggestions({ accept = [], reject = [], reviewNote } = {}) {
  const accepted = [];
  const rejected = [];
  const failed = [];

  for (const id of accept) {
    if (!id) continue;
    try {
      await acceptAgentSuggestion({ id, reviewNote });
      accepted.push(id);
    } catch (err) {
      failed.push({ id, action: 'accept', error: err?.message || String(err) });
    }
  }

  for (const item of reject) {
    const id = typeof item === 'string' ? item : item?.id;
    if (!id) continue;
    try {
      await rejectAgentSuggestion({ id, reviewNote: (typeof item === 'object' && item.reason) || reviewNote });
      rejected.push(id);
    } catch (err) {
      failed.push({ id, action: 'reject', error: err?.message || String(err) });
    }
  }

  return { accepted, rejected, failed, resolved: accepted.length + rejected.length };
}

export async function acceptAgentSuggestion({ id, reviewNote } = {}) {
  if (!id) throw new Error('accept_agent_suggestion: id is required');
  const body = { id };
  if (reviewNote) body.reviewNote = reviewNote;
  return callZephlyAPI('mcpAcceptAgentSuggestion', body);
}

export async function rejectAgentSuggestion({ id, reviewNote } = {}) {
  if (!id) throw new Error('reject_agent_suggestion: id is required');
  const body = { id };
  if (reviewNote) body.reviewNote = reviewNote;
  return callZephlyAPI('mcpRejectAgentSuggestion', body);
}

export async function runAgentNow({ agentType, scope } = {}) {
  if (!agentType) throw new Error('run_agent_now: agentType is required');
  const body = { agentType };
  if (scope) body.scope = scope;
  return callZephlyAPI('mcpRunAgentNow', body);
}

export async function configureAgent({ agentType, enabled, cadenceSeconds } = {}) {
  if (!agentType) throw new Error('configure_agent: agentType is required');
  const body = { agentType };
  if (enabled !== undefined) body.enabled = enabled;
  if (cadenceSeconds !== undefined) body.cadenceSeconds = cadenceSeconds;
  return callZephlyAPI('mcpConfigureAgent', body);
}
