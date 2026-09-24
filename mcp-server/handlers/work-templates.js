/**
 * Work Template Handlers
 * Handler for the E-211 task/epic template MCP tool.
 *
 * Thin wrappers over /api/mcp/v1/work-templates; validation, blueprint handling,
 * and instantiation (task or epic+children) happen server-side in
 * core/worktemplates.Service.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_work_template actions.
 */
export async function manageWorkTemplate(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return callEzmodoAPI('mcpCreateWorkTemplate', params);
  case 'update': return callEzmodoAPI('mcpUpdateWorkTemplate', params);
  case 'delete': return callEzmodoAPI('mcpDeleteWorkTemplate', { templateId: params.templateId });
  case 'get': return callEzmodoAPI('mcpGetWorkTemplate', { templateId: params.templateId });
  case 'instantiate': return callEzmodoAPI('mcpInstantiateWorkTemplate', params);
  case 'list': {
    const listParams = {};
    if (params.organizationId) listParams.organizationId = params.organizationId;
    if (params.kind) listParams.kind = params.kind;
    return callEzmodoAPI('mcpListWorkTemplates', listParams);
  }
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, list, get, or instantiate.`);
  }
}
