/**
 * Review Handlers (E-302 #3444)
 * list_review_queue: the project's in_review tasks, oldest submission first,
 * optionally narrowed by assignee (E-336 #3939). Without a projectId, or with
 * projectIds, the caller's cross-project queue instead: the web Inbox's
 * Review tab, tasks and documents (E-336 #4008).
 *
 * Read-only on purpose. Approve / send back is not on the MCP route group:
 * OIDC callers there (the remote connector) are not marked as AI, so the API
 * could not apply the project's approve policy to them. A human decides in the
 * web app.
 */

import { callEzmodoAPI } from '../lib/http-client.js';
import { firstLine } from '../lib/review-feedback.js';
import { readConfig } from '../lib/local-cache.js';

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

/** One cross-project queue row (E-336 #4008): a task or a document, with its project. */
export function formatPersonQueueItem(item) {
  const project = { id: item.projectId, name: item.projectName };
  if (item.type === 'document' && item.document) {
    const doc = item.document;
    const summary = firstLine(doc.reviewNote);
    return {
      type: 'document',
      project,
      approvePolicy: item.approvePolicy,
      documentId: doc.id,
      title: doc.title,
      submittedAt: item.submittedAt,
      ...(doc.reviewSubmittedAgent ? { submittedByAgent: doc.reviewSubmittedAgent } : {}),
      ...(summary ? { summary } : {}),
    };
  }
  return {
    type: 'task',
    project,
    approvePolicy: item.approvePolicy,
    ...formatQueueTask({ ...(item.task || {}), submittedAt: item.task?.submittedAt ?? item.submittedAt }),
  };
}

/** A list filter as the API reads it: one comma-separated value (E-336 #3939). */
function listParam(values) {
  const list = (Array.isArray(values) ? values : values ? [values] : [])
    .filter((a) => a !== undefined && a !== null)
    .map((a) => String(a).trim())
    .filter(Boolean);
  return list.length > 0 ? [...new Set(list)].join(',') : undefined;
}

const NOTE = 'Agents cannot approve or send back; a human decides in the web app.';

/**
 * The caller's queue across the projects they review in (E-336 #4008), over
 * GET /api/mcp/v1/review-queue: one paged listing, so total and hasMore stay
 * right, which N per-project calls merged here could not.
 */
async function listPersonReviewQueue(args, assignee) {
  const { limit, offset, type } = args;
  const organizationId = args.organizationId || (await readConfig())?.organizationId;
  if (!organizationId) {
    throw new Error('Pass projectId for one project\'s queue, or organizationId for your cross-project queue');
  }
  const projectIds = listParam([...(Array.isArray(args.projectIds) ? args.projectIds : []), args.projectId]);
  const result = await callEzmodoAPI('mcpListPersonReviewQueue', {
    organizationId,
    ...(projectIds ? { projectIds } : {}),
    ...(type ? { type } : {}),
    ...(limit ? { limit } : {}),
    ...(offset ? { offset } : {}),
    ...(assignee ? { assignee } : {}),
  });

  const items = Array.isArray(result?.items) ? result.items : [];
  const projects = Array.isArray(result?.projects) ? result.projects : [];
  return {
    organizationId: result?.organizationId ?? organizationId,
    items: items.map(formatPersonQueueItem),
    counts: result?.counts,
    total: result?.total ?? items.length,
    limit: result?.limit,
    offset: result?.offset ?? 0,
    hasMore: Boolean(result?.hasMore),
    // The review scope, each with what waits in it under the assignee filter.
    projects: projects.map((p) => ({ id: p.id, name: p.name, approvePolicy: p.approvePolicy, count: p.count })),
    note: NOTE,
  };
}

export async function listReviewQueue(args = {}) {
  const { projectId, limit, offset } = args;
  const assignee = listParam(args.assignee);
  const crossProject = !projectId || (Array.isArray(args.projectIds) && args.projectIds.length > 0);
  if (crossProject) {
    return listPersonReviewQueue(args, assignee);
  }

  const result = await callEzmodoAPI('mcpListReviewQueue', {
    projectId,
    ...(limit ? { limit } : {}),
    // offset 0 is the default; sending it would only be query-string noise.
    ...(offset ? { offset } : {}),
    ...(assignee ? { assignee } : {}),
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
    note: NOTE,
  };
}
