/**
 * Question Handlers (E-333 #3829)
 * manage_question and list_questions: thin wrappers over /api/mcp/v1/questions.
 * Validation and who may do what are server-side, in core/questions.Service.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/** Dispatch manage_question actions. */
export async function manageQuestion(args = {}) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createQuestion(params);
  case 'update': return updateQuestion(params);
  case 'withdraw': return withdrawQuestion(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update or withdraw.`);
  }
}

async function createQuestion({ taskId, epicId, kind, title, body, link, blocking, ownerId, sessionId }) {
  if (!taskId && !epicId) {
    throw new Error('taskId or epicId is required: ask on the task (or epic) the answer unblocks');
  }
  return callEzmodoAPI('mcpCreateQuestion', compact({
    taskId, epicId, kind, title, body, link, blocking, ownerId, sessionId,
  }));
}

async function updateQuestion({ questionId, title, body, link, blocking, ownerId }) {
  if (!questionId) throw new Error('questionId is required');
  return callEzmodoAPI('mcpUpdateQuestion', compact({ questionId, title, body, link, blocking, ownerId }));
}

async function withdrawQuestion({ questionId }) {
  if (!questionId) throw new Error('questionId is required');
  return callEzmodoAPI('mcpWithdrawQuestion', { questionId });
}

/** list_questions: by task, by epic, or everything asked with this key. */
export async function listQuestions(args = {}) {
  const { taskId, epicId, organizationId, answeredSince, status, limit, offset } = args;
  if (!taskId && !epicId && !organizationId) {
    throw new Error('Pass taskId, epicId, or organizationId');
  }
  return callEzmodoAPI('mcpListQuestions', compact({
    taskId, epicId, organizationId, answeredSince, status,
    limit: limit || undefined,
    offset: offset || undefined,
  }));
}

/** Drops undefined values so they are not sent as empty fields. */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}
