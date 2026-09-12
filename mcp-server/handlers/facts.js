/**
 * Fact Handlers
 * Handler functions for fact-related MCP tools
 *
 * Facts are project-scoped knowledge entries for tracking:
 * - Decisions and conventions
 * - Reference information
 * - Key context for humans and AI agents
 *
 * Write operations (create, update, delete) invalidate the cache.
 */

import { callZephlyAPI } from '../lib/http-client.js';
import { invalidateCacheSection } from '../lib/local-cache.js';

/**
 * Dispatch manage_fact actions to the appropriate handler
 */
export async function manageFact(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createFact(params);
  case 'update': return updateFact(params);
  case 'delete': return deleteFact(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * List facts for a project, optionally retrieving a single fact by ID.
 */
export async function listFacts(args) {
  const { projectId, factId } = args;
  return callZephlyAPI('mcpListFacts', { projectId, factId });
}

/**
 * Create a new fact
 */
async function createFact(args) {
  const result = await callZephlyAPI('mcpCreateFact', args);
  await invalidateCacheSection('facts');
  return result;
}

/**
 * Update an existing fact
 */
async function updateFact(args) {
  const result = await callZephlyAPI('mcpUpdateFact', args);
  await invalidateCacheSection('facts');
  return result;
}

/**
 * Delete a fact
 */
async function deleteFact(args) {
  const result = await callZephlyAPI('mcpDeleteFact', args);
  await invalidateCacheSection('facts');
  return result;
}
