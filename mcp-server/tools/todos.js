/**
 * Todo Tools
 * MCP tools for managing personal todos (todo list)
 *
 * Todos are lightweight personal tasks for quick capture.
 * They can later be promoted to full project tasks via move_to_project.
 *
 * Consolidated: manage_todo (create/complete/move_to_project) + list_todos
 */

export const TODO_TOOLS = [
  {
    name: 'manage_todo',
    description: 'Create, complete, or promote personal todos. ' +
      'Todos are lightweight tasks for quick capture that can be promoted to project tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'complete', 'move_to_project'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        todoId: {
          type: 'string',
          description: 'Todo ID (required for complete, move_to_project)',
        },
        // --- Create fields ---
        title: {
          type: 'string',
          description: 'Todo title (required for create)',
        },
        description: {
          type: 'string',
          description: 'Optional description or notes — supports markdown (create only)',
        },
        // --- Move to project fields ---
        projectId: {
          type: 'string',
          description: 'Target project ID (required for move_to_project)',
        },
        epicId: {
          type: 'string',
          description: 'Optional epic to assign the task to (move_to_project only)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_todos',
    description: 'List personal todos from your todo list. Returns active todos by default.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'completed', 'all'],
          description: 'Filter by status (default: active)',
        },
      },
    },
  },
];
