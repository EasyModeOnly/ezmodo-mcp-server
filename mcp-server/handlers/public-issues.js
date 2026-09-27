/**
 * Public Issue Handlers (E-238 #2390)
 * Handler functions for list_issues, get_issue and manage_issue.
 *
 * Every route is project-scoped ({projectId} in the path); the API authorizes
 * it exactly like the web app's Issues tab.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/** Drop undefined values so they are not sent as query params or body fields. */
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

/**
 * List public issues, or the intake queue with queue: true.
 */
export async function listIssues(args = {}) {
  const { projectId, queue, state, status, type, q, limit, offset } = args;
  requireFields('list_issues', args, ['projectId']);
  if (queue) {
    return callEzmodoAPI('mcpListIssueIntake', defined({ projectId, limit, offset }));
  }
  return callEzmodoAPI('mcpListPublicIssues', defined({ projectId, state, status, type, q, limit, offset }));
}

/**
 * Get one public issue by number.
 */
export async function getIssue(args = {}) {
  requireFields('get_issue', args, ['projectId', 'number']);
  return callEzmodoAPI('mcpGetPublicIssue', { projectId: args.projectId, number: args.number });
}

/**
 * Dispatch manage_issue actions.
 */
export async function manageIssue(args = {}) {
  const { action, ...params } = args;
  const handler = ACTIONS[action];
  if (!handler) {
    throw new Error(`Unknown action: ${action}. Expected one of: ${Object.keys(ACTIONS).join(', ')}`);
  }
  requireFields(action, params, ['projectId']);
  return handler(action, params);
}

const ACTIONS = {
  publish_intake(action, p) {
    requireFields(action, p, ['feedbackId', 'title']);
    const { projectId, feedbackId, title, body, type, labels, taskId } = p;
    return callEzmodoAPI('mcpPublishIssueIntake',
      defined({ projectId, feedbackId, title, body, type, labels, taskId }));
  },
  reject_intake(action, p) {
    requireFields(action, p, ['feedbackId', 'reason']);
    const { projectId, feedbackId, reason } = p;
    return callEzmodoAPI('mcpRejectIssueIntake', { projectId, feedbackId, reason });
  },
  convert_intake(action, p) {
    requireFields(action, p, ['feedbackId', 'taskId']);
    const { projectId, feedbackId, taskId } = p;
    return callEzmodoAPI('mcpConvertIssueIntake', { projectId, feedbackId, taskId });
  },
  create(action, p) {
    requireFields(action, p, ['title']);
    const { projectId, title, body, type, labels, taskId, state } = p;
    return callEzmodoAPI('mcpCreatePublicIssue', defined({ projectId, title, body, type, labels, taskId, state }));
  },
  update(action, p) {
    requireFields(action, p, ['number']);
    const { projectId, number, title, body, type, labels, publicStatus, closeReason, taskId } = p;
    const patch = defined({ title, body, type, labels, publicStatus, closeReason, taskId });
    if (Object.keys(patch).length === 0) {
      throw new Error('update needs at least one of: title, body, type, labels, publicStatus, closeReason, taskId');
    }
    return callEzmodoAPI('mcpUpdatePublicIssue', { projectId, number, ...patch });
  },
  publish: numberAction('mcpPublishPublicIssue'),
  hide: numberAction('mcpHidePublicIssue'),
  resume_auto_status: numberAction('mcpResumePublicIssueAutoStatus'),
  merge(action, p) {
    requireFields(action, p, ['number', 'intoNumber']);
    const { projectId, number, intoNumber } = p;
    return callEzmodoAPI('mcpMergePublicIssue', { projectId, number, intoNumber });
  },
  link_task(action, p) {
    // taskId "" unlinks, so only undefined counts as missing.
    requireFields(action, p, ['number']);
    if (p.taskId === undefined || p.taskId === null) {
      throw new Error('taskId is required for link_task (pass "" to unlink)');
    }
    const { projectId, number, taskId } = p;
    return callEzmodoAPI('mcpUpdatePublicIssue', { projectId, number, taskId });
  },
};

function numberAction(endpoint) {
  return (action, p) => {
    requireFields(action, p, ['number']);
    return callEzmodoAPI(endpoint, { projectId: p.projectId, number: p.number });
  };
}
