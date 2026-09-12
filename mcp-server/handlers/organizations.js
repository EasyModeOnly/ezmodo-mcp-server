/**
 * Organization Handlers
 * Handler functions for organization-related MCP tools
 */

import { callZephlyAPI } from '../lib/http-client.js';

export async function getOrganization(args) {
  const { mode = 'default' } = args;
  if (mode === 'list') {
    return callZephlyAPI('mcpListOrganizations', {});
  }
  return callZephlyAPI('mcpGetDefaultOrganization', {});
}
