/**
 * Work Template Handlers
 * Handler for the E-211 task/epic template MCP tool.
 *
 * Thin wrappers over /api/mcp/v1/work-templates; validation, blueprint handling,
 * and instantiation (task or epic+children) happen server-side in
 * core/worktemplates.Service.
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_work_template actions.
 */
export async function manageWorkTemplate(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return callZephlyAPI('mcpCreateWorkTemplate', params);
  case 'update': return callZephlyAPI('mcpUpdateWorkTemplate', params);
  case 'delete': return callZephlyAPI('mcpDeleteWorkTemplate', { templateId: params.templateId });
  case 'get': return callZephlyAPI('mcpGetWorkTemplate', { templateId: params.templateId });
  case 'instantiate': return callZephlyAPI('mcpInstantiateWorkTemplate', params);
  case 'list': {
    const listParams = {};
    if (params.organizationId) listParams.organizationId = params.organizationId;
    if (params.kind) listParams.kind = params.kind;
    return callZephlyAPI('mcpListWorkTemplates', listParams);
  }
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, list, get, or instantiate.`);
  }
}
