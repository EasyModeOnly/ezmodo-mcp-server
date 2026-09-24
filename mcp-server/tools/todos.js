/**
 * Todo Tools
 * MCP tools for managing personal todos (todo list)
 *
 * Todos are lightweight personal tasks for quick capture.
 * They can later be promoted to full project tasks via move_to_project.
 *
 * Consolidated: manage_todo (create/update/complete/move_to_project) + list_todos
 * E-265: due dates and reminders (dueDate, remindAt, remindBeforeDue).
 */

export const TODO_TOOLS = [
  {
    name: 'manage_todo',
    description: 'Create, update, complete, or promote personal todos. ' +
      'Todos are lightweight tasks for quick capture that can be promoted to project tasks. ' +
      'create and update take a due date and a reminder: remindAt fires once at a time you give, ' +
      'remindBeforeDue fires that long before the due date and follows it if it moves. ' +
      'Times without an offset ("2026-10-02T09:00") are read in the person\'s own timezone; the ' +
      'response says which zone was used and warns when none is set and UTC was assumed — tell ' +
      'your person rather than guessing. For something that repeats, use manage_recurring_task.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'complete', 'move_to_project'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        todoId: {
          type: 'string',
          description: 'Todo ID (required for update, complete, move_to_project)',
        },
        // --- Create fields ---
        title: {
          type: 'string',
          description: 'Todo title (required for create; optional on update)',
        },
        description: {
          type: 'string',
          description: 'Optional description or notes — supports markdown (create, update)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priority (update only)',
        },
        // --- Due date and reminder (create, update) ---
        dueDate: {
          type: 'string',
          description: 'When it is due (create, update): a date "2026-10-02" (= end of that day in the ' +
            'person\'s timezone), a local time "2026-10-02T17:00", or an ISO instant with offset. ' +
            'On update, "" clears it.',
        },
        remindAt: {
          type: 'string',
          description: 'Add a one-off reminder (create, update): a local time "2026-10-02T09:00" ' +
            '(read in the person\'s timezone) or an ISO instant with offset "2026-10-02T07:00:00Z".',
        },
        remindBeforeDue: {
          type: 'string',
          description: 'Add a reminder this long before the due date (create, update): "1d", "2h", ' +
            '"1w", "3d12h". It moves when the due date moves, and waits while there is none.',
        },
        timezone: {
          type: 'string',
          description: 'IANA zone ("Europe/Paris") for dueDate/remindAt local times. Omit to use the ' +
            'person\'s own timezone.',
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
