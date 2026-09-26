/**
 * Release Readiness handlers (E-262). Thin: every action is one API call, and
 * the API does the validation and says why when it refuses.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/** Keep only the keys that were given, so the API sees omitted as omitted. */
function pick(args, keys) {
  const out = {};
  for (const k of keys) {
    if (args[k] !== undefined && args[k] !== null) out[k] = args[k];
  }
  return out;
}

function need(args, keys, action) {
  const missing = keys.filter((k) => args[k] === undefined || args[k] === null || args[k] === '');
  if (missing.length) {
    throw new Error(`${action} needs ${missing.join(', ')}.`);
  }
}

export async function getReleaseReadiness(args = {}) {
  if (args.listGateTypes) {
    return callEzmodoAPI('mcpReleaseGateTypes', {});
  }
  if (args.candidateId) {
    const params = { id: args.candidateId };
    if (args.environment) params.environment = args.environment;
    return callEzmodoAPI('mcpReleaseReadiness', params);
  }
  if (args.milestoneId) {
    return callEzmodoAPI('mcpMilestoneRelease', { milestoneId: args.milestoneId });
  }
  throw new Error('Give candidateId (+ environment), or milestoneId, or listGateTypes: true.');
}

export async function manageRelease(args = {}) {
  const { action } = args;
  switch (action) {
  case 'create_candidate':
    need(args, ['milestoneId', 'versionLabel'], action);
    return callEzmodoAPI('mcpCreateReleaseCandidate', {
      milestoneId: args.milestoneId, ...pick(args, ['versionLabel', 'kind', 'commitSha', 'notes']),
    });
  case 'update_candidate':
    need(args, ['candidateId'], action);
    return callEzmodoAPI('mcpUpdateReleaseCandidate', { id: args.candidateId, ...pick(args, ['notes', 'commitSha', 'status']) });
  case 'promote':
    need(args, ['candidateId', 'environment'], action);
    return callEzmodoAPI('mcpPromoteReleaseCandidate', { id: args.candidateId, ...pick(args, ['environment', 'notes']), source: 'api' });
  case 'sign_off':
    need(args, ['candidateId', 'environment'], action);
    return callEzmodoAPI('mcpSignOffReleaseCandidate', { id: args.candidateId, environment: args.environment, ...pick(args, ['note']) });
  case 'waive':
    need(args, ['candidateId', 'environment', 'targetType', 'targetId', 'reason'], action);
    return callEzmodoAPI('mcpCreateReleaseWaiver',
      pick(args, ['candidateId', 'environment', 'targetType', 'targetId', 'reason', 'evidenceType', 'evidence']));
  case 'revoke_waiver':
    need(args, ['waiverId'], action);
    return callEzmodoAPI('mcpRevokeReleaseWaiver', { id: args.waiverId });
  case 'apply_checklist':
    need(args, ['milestoneId'], action);
    return callEzmodoAPI('mcpApplyReleaseChecklist', { milestoneId: args.milestoneId, ...pick(args, ['templateId']) });
  case 'add_checklist_item':
    need(args, ['milestoneId', 'title', 'phase'], action);
    return callEzmodoAPI('mcpAddReleaseChecklistItem', {
      milestoneId: args.milestoneId, ...pick(args, ['title', 'phase', 'ownerId', 'ownerName', 'notes', 'runbookUrl', 'autoCheck']),
    });
  case 'set_item_state': {
    need(args, ['itemId', 'state'], action);
    const body = { id: args.itemId, state: args.state };
    if (args.note !== undefined) body.stateNote = args.note;
    return callEzmodoAPI('mcpUpdateReleaseChecklistItem', body);
  }
  case 'item_to_task':
    need(args, ['itemId'], action);
    return callEzmodoAPI('mcpReleaseChecklistItemToTask', { id: args.itemId });
  case 'add_gate':
    need(args, ['projectId', 'environment', 'type'], action);
    return callEzmodoAPI('mcpCreateReleaseGate', pick(args, ['projectId', 'environment', 'type', 'name', 'params', 'enforcement']));
  case 'update_gate':
    need(args, ['gateId'], action);
    return callEzmodoAPI('mcpUpdateReleaseGate', { id: args.gateId, ...pick(args, ['name', 'params', 'enforcement', 'enabled']) });
  case 'delete_gate':
    need(args, ['gateId'], action);
    return callEzmodoAPI('mcpDeleteReleaseGate', { id: args.gateId });
  case 'add_recommended_gates':
    need(args, ['projectId'], action);
    return callEzmodoAPI('mcpAddRecommendedReleaseGates', { projectId: args.projectId });
  case 'list_gates':
    need(args, ['projectId'], action);
    return callEzmodoAPI('mcpListReleaseGates', pick(args, ['projectId', 'environment']));
  case 'list_templates':
    need(args, ['projectId'], action);
    return callEzmodoAPI('mcpListReleaseTemplates', { projectId: args.projectId });
  case 'get_settings':
    need(args, ['projectId'], action);
    return callEzmodoAPI('mcpGetReleaseSettings', { projectId: args.projectId });
  case 'save_settings':
    need(args, ['projectId', 'completeTasksOn'], action);
    return callEzmodoAPI('mcpSaveReleaseSettings', pick(args, ['projectId', 'completeTasksOn']));
  case 'save_template':
    need(args, ['projectId', 'name', 'items'], action);
    return callEzmodoAPI('mcpSaveReleaseTemplate',
      pick(args, ['projectId', 'templateId', 'name', 'description', 'items', 'isDefault', 'orgWide']));
  case 'report_check':
    need(args, ['projectId', 'name', 'status'], action);
    return callEzmodoAPI('mcpReportReleaseCheck', {
      source: 'mcp',
      ...pick(args, ['projectId', 'name', 'status', 'candidate', 'commitSha', 'environment', 'url', 'summary', 'source', 'externalId']),
    });
  case 'report_deployment':
    need(args, ['projectId', 'environment', 'status'], action);
    return callEzmodoAPI('mcpReportReleaseDeployment', {
      source: 'mcp',
      ...pick(args, ['projectId', 'environment', 'status', 'candidate', 'commitSha', 'url', 'source', 'externalId']),
    });
  default:
    throw new Error(`Unknown action: ${action}`);
  }
}
