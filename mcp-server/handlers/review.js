/**
 * Review Handlers (E-302 #3444)
 * list_review_queue: the project's in_review tasks, oldest submission first.
 *
 * Read-only on purpose. Approve / send back is not on the MCP route group:
 * OIDC callers there (the remote connector) are not marked as AI, so the API
 * could not apply the project's approve policy to them. A human decides in the
 * web app.
 */

import { callEzmodoAPI } from '../lib/http-client.js';
import { firstLine } from '../lib/review-feedback.js';

function newestNote(notes) {
  if (!Array.isArray(notes) || notes.length === 0) return null;
  return notes.reduce((a, b) => (Date.parse(b?.addedAt) >= Date.parse(a?.addedAt) ? b : a));
}

/** One queue row, trimmed to what an agent needs to pick a task. */
export function formatQueueTask(task) {
  const summary = firstLine(task.completionNotes) || firstLine(newestNote(task.notes)?.content);
  return {
    taskId: task.id,
    taskNumber: task.taskNumber,
    title: task.title,
    ...(task.taskType ? { taskType: task.taskType } : {}),
    ...(task.priority ? { priority: task.priority } : {}),
    assignee: task.assignee ? { type: task.assignee.type, name: task.assignee.name } : null,
    submittedAt: task.submittedAt,
    verification: task.verification,
    ...(summary ? { summary } : {}),
  };
}

export async function listReviewQueue(args = {}) {
  const { projectId, limit, offset } = args;
  if (!projectId) {
    throw new Error('projectId is required');
  }

  const result = await callEzmodoAPI('mcpListReviewQueue', {
    projectId,
    ...(limit ? { limit } : {}),
    // offset 0 is the default; sending it would only be query-string noise.
    ...(offset ? { offset } : {}),
  });

  const tasks = Array.isArray(result?.tasks) ? result.tasks : [];
  return {
    projectId: result?.projectId ?? projectId,
    tasks: tasks.map(formatQueueTask),
    total: result?.total ?? tasks.length,
    limit: result?.limit,
    offset: result?.offset ?? 0,
    hasMore: Boolean(result?.hasMore),
    approvePolicy: result?.approvePolicy,
    note: 'Agents cannot approve or send back; a human decides in the web app.',
  };
}
