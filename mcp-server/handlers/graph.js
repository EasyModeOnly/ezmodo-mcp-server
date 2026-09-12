/**
 * Graph Handlers
 *
 * Thin wrapper over /api/mcp/v1/graph/traverse — the navigation-graph
 * projection (E-209). The BFS walk + node hydration happen server-side in
 * core/graph.ProjectionService; the MCP layer just forwards the request and
 * only sends the optional bounding params when provided.
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Walk the compendium navigation graph outward from a root node. projectId,
 * rootType, and rootId are required; scope/depth/maxNodes are optional bounds
 * (omitted params fall back to server defaults).
 */
export async function getGraph({ projectId, rootType, rootId, scope, depth, maxNodes }) {
  const params = { projectId, rootType, rootId };
  if (scope) params.scope = scope;
  if (depth !== undefined) params.depth = depth;
  if (maxNodes !== undefined) params.maxNodes = maxNodes;
  return callZephlyAPI('mcpTraverseGraph', params);
}
