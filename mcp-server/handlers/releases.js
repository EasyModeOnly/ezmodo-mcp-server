/**
 * Release Readiness handlers (E-262). Thin: every action is one API call, and
 * the API does the validation and says why when it refuses.
 */

import { callEzmodoAPI } from '../lib/http-client.js';
import { projectIdFor } from './deliverables.js';

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

/**
 * The candidate a deliverable + version names (E-280): that release's newest
 * candidate that was not rejected, or the one labelled `candidate` within it.
 * deliverable may be omitted: the API then uses the project's default one.
 */
async function lookupCandidate(args, action) {
  return callEzmodoAPI('mcpLookupReleaseCandidate', {
    projectId: await projectIdFor(args, action),
    version: args.version,
    ...pick(args, ['deliverable', 'candidate']),
  });
}

/** A release's id: releaseId, else the release at deliverable + version. */
async function releaseIdFor(args, action) {
  if (args.releaseId) return args.releaseId;
  if (!args.version) throw new Error(`${action} needs releaseId, or version (+ deliverable).`);
  const found = await callEzmodoAPI('mcpLookupRelease', {
    projectId: await projectIdFor(args, action), version: args.version, ...pick(args, ['deliverable']),
  });
  const id = found?.release?.id;
  if (!id) throw new Error(`No release ${args.deliverable ? `${args.deliverable} ` : ''}${args.version}.`);
  return id;
}

export async function getReleaseReadiness(args = {}) {
  if (args.listGateTypes) {
    return callEzmodoAPI('mcpReleaseGateTypes', {});
  }
  let candidateId = args.candidateId;
  if (!candidateId && args.version) {
    // deliverable + version (E-280): resolve the candidate the same way
    // `ezmodo release check --deliverable --version` does.
    candidateId = (await lookupCandidate(args, 'get_release_readiness'))?.id;
    if (!candidateId) {
      throw new Error(`No candidate found for ${args.deliverable ? `${args.deliverable} ` : ''}${args.version}.`);
    }
  }
  if (candidateId) {
    const params = { id: candidateId };
    if (args.environment) params.environment = args.environment;
    return callEzmodoAPI('mcpReleaseReadiness', params);
  }
  if (args.releaseId) {
    return callEzmodoAPI('mcpGetRelease', { id: args.releaseId });
  }
  if (args.milestoneId) {
    return callEzmodoAPI('mcpMilestoneRelease', { milestoneId: args.milestoneId, ...pick(args, ['deliverable']) });
  }
  throw new Error('Give candidateId (+ environment), or deliverable + version (+ environment), or releaseId, ' +
    'or milestoneId, or listGateTypes: true.');
}

export async function manageRelease(args = {}) {
  const { action } = args;
  switch (action) {
  case 'create_candidate': {
    const fields = pick(args, ['versionLabel', 'kind', 'commitSha', 'notes']);
    if (args.milestoneId) {
      need(args, ['versionLabel'], action);
      return callEzmodoAPI('mcpCreateReleaseCandidate', {
        milestoneId: args.milestoneId, ...fields, ...pick(args, ['deliverable']),
      });
    }
    // A release is a deliverable at a version (E-280): name it by id, or by
    // deliverable + version (started if new). The label defaults to the version.
    let releaseId = args.releaseId;
    if (!releaseId) {
      if (!args.version) {
        throw new Error('create_candidate needs releaseId, or version (+ deliverable), or milestoneId + versionLabel.');
      }
      const rel = await callEzmodoAPI('mcpCreateRelease', {
        projectId: await projectIdFor(args, action), version: args.version, ...pick(args, ['deliverable']),
      });
      releaseId = rel?.id;
    }
    return callEzmodoAPI('mcpCreateReleaseCandidateForRelease', { id: releaseId, ...fields });
  }
  case 'update_candidate': {
    need(args, ['candidateId'], action);
    const body = { id: args.candidateId, ...pick(args, ['notes', 'commitSha', 'status', 'rejectionReason']) };
    // Agents reach for `reason` (it is waive's word); take it as the
    // rejection's reason when rejecting (#2916).
    if (body.rejectionReason === undefined && args.status === 'rejected' && args.reason !== undefined) {
      body.rejectionReason = args.reason;
    }
    return callEzmodoAPI('mcpUpdateReleaseCandidate', body);
  }
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
    if (args.releaseId) {
      return callEzmodoAPI('mcpApplyReleaseChecklistForRelease', { id: args.releaseId, ...pick(args, ['templateId', 'sync']) });
    }
    need(args, ['milestoneId'], action);
    return callEzmodoAPI('mcpApplyReleaseChecklist', {
      milestoneId: args.milestoneId, ...pick(args, ['templateId', 'deliverable', 'sync']),
    });
  case 'add_checklist_item': {
    const item = pick(args, ['title', 'phase', 'ownerId', 'ownerName', 'notes', 'runbookUrl', 'autoCheck']);
    if (args.releaseId) {
      need(args, ['title', 'phase'], action);
      return callEzmodoAPI('mcpAddReleaseChecklistItemForRelease', { id: args.releaseId, ...item });
    }
    need(args, ['milestoneId', 'title', 'phase'], action);
    return callEzmodoAPI('mcpAddReleaseChecklistItem', {
      milestoneId: args.milestoneId, ...item, ...pick(args, ['deliverable']),
    });
  }
  case 'set_item_state': {
    need(args, ['itemId', 'state'], action);
    const body = { id: args.itemId, state: args.state };
    if (args.note !== undefined) body.stateNote = args.note;
    // The candidate being worked on: a failed step whose phase is set to
    // reject rejects it (#2916).
    if (args.candidateId !== undefined) body.candidateId = args.candidateId;
    return callEzmodoAPI('mcpUpdateReleaseChecklistItem', body);
  }
  case 'update_checklist_item': {
    // Edits the step itself; its state goes through set_item_state, so a
    // waiver can't skip the reason that action asks for (#3080).
    need(args, ['itemId'], action);
    const body = {
      id: args.itemId,
      ...pick(args, ['title', 'notes', 'ownerId', 'ownerName', 'runbookUrl', 'position', 'autoCheck']),
    };
    if (args.clearAutoCheck) body.clearAutoCheck = true;
    if (Object.keys(body).length === 1) {
      throw new Error('update_checklist_item needs at least one of title, notes, ownerId, ownerName, runbookUrl, position, autoCheck, clearAutoCheck.');
    }
    return callEzmodoAPI('mcpUpdateReleaseChecklistItem', body);
  }
  case 'delete_checklist_item':
    need(args, ['itemId'], action);
    return callEzmodoAPI('mcpDeleteReleaseChecklistItem', { id: args.itemId });
  case 'item_to_task':
    need(args, ['itemId'], action);
    return callEzmodoAPI('mcpReleaseChecklistItemToTask', { id: args.itemId });
  case 'add_gate':
    need(args, ['projectId', 'environment', 'type'], action);
    return callEzmodoAPI('mcpCreateReleaseGate',
      pick(args, ['projectId', 'environment', 'type', 'name', 'params', 'enforcement', 'deliverable']));
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
    return callEzmodoAPI('mcpListReleaseGates', pick(args, ['projectId', 'environment', 'deliverable']));
  case 'list_templates':
    need(args, ['projectId'], action);
    return callEzmodoAPI('mcpListReleaseTemplates', { projectId: args.projectId });
  case 'get_settings':
    need(args, ['projectId'], action);
    return callEzmodoAPI('mcpGetReleaseSettings', pick(args, ['projectId', 'deliverable']));
  case 'save_settings': {
    // A field left out is unchanged. For a deliverable, completeTasksOn ""
    // and inheritHoldDeploys go back to the project's (E-280 #3084, #3091).
    need(args, ['projectId'], action);
    const hold = typeof args.holdDeploys === 'boolean' || (args.deliverable && args.inheritHoldDeploys === true);
    const mode = args.deliverable ? args.completeTasksOn != null : !!args.completeTasksOn;
    if (!hold && !mode) {
      throw new Error(`${action} needs completeTasksOn or holdDeploys.`);
    }
    return callEzmodoAPI('mcpSaveReleaseSettings',
      pick(args, ['projectId', 'completeTasksOn', 'holdDeploys', 'inheritHoldDeploys', 'deliverable']));
  }
  case 'save_template':
    need(args, ['projectId', 'name', 'items'], action);
    return callEzmodoAPI('mcpSaveReleaseTemplate',
      pick(args, ['projectId', 'templateId', 'name', 'description', 'items', 'isDefault', 'orgWide', 'deliverable']));
  case 'report_check':
    need(args, ['projectId', 'name', 'status'], action);
    return callEzmodoAPI('mcpReportReleaseCheck', {
      source: 'mcp',
      ...pick(args, [
        'projectId', 'name', 'status', 'deliverable', 'version', 'candidate', 'commitSha', 'environment', 'url',
        'summary', 'source', 'externalId',
      ]),
    });
  case 'report_deployment':
    need(args, ['projectId', 'environment', 'status'], action);
    return callEzmodoAPI('mcpReportReleaseDeployment', {
      source: 'mcp',
      ...pick(args, [
        'projectId', 'environment', 'status', 'deliverable', 'version', 'candidate', 'commitSha', 'url', 'source',
        'externalId',
      ]),
    });

  // ── Releases: a deliverable at a version (E-280) ──────────────────────────
  case 'list_releases':
    return callEzmodoAPI('mcpListReleases', {
      projectId: await projectIdFor(args, action), ...pick(args, ['deliverable', 'milestoneId', 'limit']),
    });
  case 'create_release':
    need(args, ['version'], action);
    return callEzmodoAPI('mcpCreateRelease', {
      projectId: await projectIdFor(args, action), ...pick(args, ['deliverable', 'version', 'milestoneId', 'notes']),
    });
  case 'get_release':
    if (args.releaseId) return callEzmodoAPI('mcpGetRelease', { id: args.releaseId });
    need(args, ['version'], action);
    return callEzmodoAPI('mcpLookupRelease', {
      projectId: await projectIdFor(args, action), version: args.version, ...pick(args, ['deliverable']),
    });
  case 'update_release': {
    // milestoneId "" detaches the milestone, so it is sent when given at all.
    const body = pick(args, ['status', 'milestoneId', 'notes']);
    if (Object.keys(body).length === 0) {
      throw new Error('update_release needs at least one of status, milestoneId, notes.');
    }
    return callEzmodoAPI('mcpUpdateRelease', { id: await releaseIdFor(args, action), ...body });
  }
  case 'get_contents':
    return callEzmodoAPI('mcpGetReleaseContents', { id: await releaseIdFor(args, action) });
  case 'derive_contents':
    return callEzmodoAPI('mcpDeriveReleaseContents', { id: await releaseIdFor(args, action) });
  case 'add_content':
  case 'remove_content': {
    need(args, ['entityType', 'entityId'], action);
    const id = await releaseIdFor(args, action);
    return callEzmodoAPI(action === 'add_content' ? 'mcpAddReleaseContent' : 'mcpRemoveReleaseContent',
      { id, entityType: args.entityType, entityId: args.entityId });
  }
  case 'release_changelog':
    return callEzmodoAPI('mcpReleaseChangelog', { id: await releaseIdFor(args, action) });
  case 'task_shipping':
    need(args, ['taskId'], action);
    return callEzmodoAPI('mcpReleaseTaskShipping', {
      taskId: args.taskId, projectId: await projectIdFor(args, action),
    });
  default:
    throw new Error(`Unknown action: ${action}`);
  }
}
