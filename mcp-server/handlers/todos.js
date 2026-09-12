/**
 * Todo Handlers
 * Handler functions for personal todo MCP tools
 *
 * Consolidated: manageTodo dispatches create/complete/move_to_project.
 * listTodos is unchanged.
 *
 * Todos are lightweight personal tasks in the user's todo list.
 * They can be promoted to project tasks via move_to_project.
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_todo actions to the appropriate handler
 */
export async function manageTodo(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createTodo(params);
  case 'complete': return completeTodo(params);
  case 'move_to_project': return moveTodoToProject(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

export async function listTodos(args) {
  return callZephlyAPI('mcpListTodos', args || {});
}

// --- Private helpers ---

async function createTodo(args) {
  return callZephlyAPI('mcpCreateTodo', args);
}

async function completeTodo(args) {
  return callZephlyAPI('mcpCompleteTodo', args);
}

async function moveTodoToProject(args) {
  return callZephlyAPI('mcpMoveTodo', args);
}
