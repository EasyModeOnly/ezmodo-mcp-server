/**
 * Recurring Task Schedule Handlers
 * Handler for the E-211 recurrence-engine MCP tool.
 *
 * Thin wrappers over /api/mcp/v1/recurring-tasks; validation, next_run_at
 * computation, and the schedule lifecycle happen server-side in
 * core/recurringtasks.Service.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_recurring_task actions.
 */
export async function manageRecurringTask(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return callEzmodoAPI('mcpCreateRecurringTask', params);
  case 'update': return callEzmodoAPI('mcpUpdateRecurringTask', params);
  case 'pause': return callEzmodoAPI('mcpPauseRecurringTask', { scheduleId: params.scheduleId });
  case 'resume': return callEzmodoAPI('mcpResumeRecurringTask', { scheduleId: params.scheduleId });
  case 'delete': return callEzmodoAPI('mcpDeleteRecurringTask', { scheduleId: params.scheduleId });
  case 'get': return callEzmodoAPI('mcpGetRecurringTask', { scheduleId: params.scheduleId });
  case 'list': {
    const listParams = {};
    if (params.organizationId) listParams.organizationId = params.organizationId;
    if (params.projectId) listParams.projectId = params.projectId;
    return callEzmodoAPI('mcpListRecurringTasks', listParams);
  }
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, pause, resume, delete, list, or get.`);
  }
}
