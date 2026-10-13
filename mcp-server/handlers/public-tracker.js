/**
 * Public Tracker Handlers (#3233)
 * get_public_tracker (reads) and manage_public_tracker (changes). Every
 * route is project-scoped ({projectId} in the path) and authorized by the API
 * exactly like the web app: these handlers only validate arguments and pick
 * the endpoint.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/** Drop undefined values so they are not sent as query or body fields. */
function defined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function requireFields(action, args, fields) {
  for (const field of fields) {
    if (args[field] === undefined || args[field] === null || args[field] === '') {
      throw new Error(`${field} is required for ${action}`);
    }
  }
}

function dispatch(kind, table, name, params) {
  const handler = table[name];
  if (!handler) {
    throw new Error(`Unknown ${kind}: ${name}. Expected one of: ${Object.keys(table).join(', ')}`);
  }
  requireFields(name, params, ['projectId']);
  return handler(name, params);
}

// ── Reads ────────────────────────────────────────────────────────────────

/**
 * Dispatch get_public_tracker views.
 */
export async function getPublicTracker(args = {}) {
  const { view, ...params } = args;
  return dispatch('view', VIEWS, view, params);
}

const VIEWS = {
  settings: (_, p) => callEzmodoAPI('mcpGetPublicSettings', { projectId: p.projectId }),
  roadmap: (_, p) => callEzmodoAPI('mcpListRoadmapItems', { projectId: p.projectId }),
  comments(_, p) {
    const paging = defined({ limit: p.limit, offset: p.offset });
    if (p.number !== undefined && p.number !== null && p.number !== '') {
      return callEzmodoAPI('mcpListIssueComments', { projectId: p.projectId, number: p.number, ...paging });
    }
    return callEzmodoAPI('mcpListModerationQueue',
      { projectId: p.projectId, ...defined({ state: p.state }), ...paging });
  },
  participants: (_, p) => callEzmodoAPI('mcpListParticipants',
    { projectId: p.projectId, ...defined({ trust: p.trust, limit: p.limit, offset: p.offset }) }),
  security_reports: (_, p) => callEzmodoAPI('mcpListSecurityReports',
    { projectId: p.projectId, ...defined({ status: p.status, limit: p.limit, offset: p.offset }) }),
  github_syncs: (_, p) => callEzmodoAPI('mcpListGitHubSyncs', { projectId: p.projectId }),
  github_sync_health(view, p) {
    requireFields(view, p, ['syncId']);
    return callEzmodoAPI('mcpGetGitHubSyncHealth', { projectId: p.projectId, syncId: p.syncId });
  },
  github_import_status: (_, p) => callEzmodoAPI('mcpGetGitHubImportStatus', { projectId: p.projectId }),
};

// ── Changes ──────────────────────────────────────────────────────────────

/**
 * Dispatch manage_public_tracker actions.
 */
export async function managePublicTracker(args = {}) {
  const { action, ...params } = args;
  return dispatch('action', ACTIONS, action, params);
}

const SETTINGS_FIELDS = [
  'level', 'submissionsEnabled', 'contributorsEnabled', 'indexingEnabled',
  'roadmapEnabled', 'changelogEnabled', 'securityEnabled', 'securityPolicy', 'securityContact',
];

const ACTIONS = {
  update_settings(action, p) {
    const patch = defined(Object.fromEntries(SETTINGS_FIELDS.map((f) => [f, p[f]])));
    if (Object.keys(patch).length === 0) {
      throw new Error(`update_settings needs at least one of: ${SETTINGS_FIELDS.join(', ')}`);
    }
    return callEzmodoAPI('mcpUpdatePublicSettings', { projectId: p.projectId, ...patch });
  },
  reply(action, p) {
    requireFields(action, p, ['number', 'body']);
    return callEzmodoAPI('mcpReplyToIssue', { projectId: p.projectId, number: p.number, body: p.body });
  },
  approve_comment: commentAction('mcpApproveIssueComment'),
  hide_comment: commentAction('mcpHideIssueComment'),
  block_author: commentAction('mcpBlockCommentAuthor'),
  lock_issue: issueAction('mcpLockIssue'),
  unlock_issue: issueAction('mcpUnlockIssue'),
  set_trust(action, p) {
    requireFields(action, p, ['userId', 'trust']);
    return callEzmodoAPI('mcpSetParticipantTrust', { projectId: p.projectId, userId: p.userId, trust: p.trust });
  },
  set_security_report_status(action, p) {
    requireFields(action, p, ['feedbackId', 'status']);
    if (p.status === 'rejected') requireFields(`${action} rejected`, p, ['reason']);
    if (p.status === 'converted') requireFields(`${action} converted`, p, ['taskId']);
    return callEzmodoAPI('mcpSetSecurityReportStatus', {
      projectId: p.projectId,
      feedbackId: p.feedbackId,
      status: p.status,
      ...defined({ reason: p.reason, taskId: p.taskId }),
    });
  },
  resolve_sync_conflict(action, p) {
    requireFields(action, p, ['syncId', 'conflictId']);
    return callEzmodoAPI('mcpResolveGitHubSyncConflict',
      { projectId: p.projectId, syncId: p.syncId, conflictId: p.conflictId });
  },
};

function commentAction(endpoint) {
  return (action, p) => {
    requireFields(action, p, ['commentId']);
    return callEzmodoAPI(endpoint, { projectId: p.projectId, commentId: p.commentId });
  };
}

function issueAction(endpoint) {
  return (action, p) => {
    requireFields(action, p, ['number']);
    return callEzmodoAPI(endpoint, { projectId: p.projectId, number: p.number });
  };
}
