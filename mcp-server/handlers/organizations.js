/**
 * Organization Handlers
 * Handler functions for organization-related MCP tools
 */

import { callEzmodoAPI } from '../lib/http-client.js';

export async function getOrganization(args) {
  const { mode = 'default' } = args;
  if (mode === 'list') {
    return callEzmodoAPI('mcpListOrganizations', {});
  }
  return callEzmodoAPI('mcpGetDefaultOrganization', {});
}
