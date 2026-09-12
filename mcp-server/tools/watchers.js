/**
 * Watching Tools
 * MCP tools for task subscriptions and the notification inbox (E-41)
 *
 * NOTE: none of these take a userId. The acting user is the API key's owner,
 * resolved server-side. A userId parameter would let an agent subscribe a
 * colleague to anything.
 */

export const WATCHER_TOOLS = [
  {
    name: 'manage_watch',
    description: 'Watch or unwatch a task. Watching subscribes YOU (the API key owner) to notifications ' +
      'about the task: status changes and new comments. Use this for "watch this task for me" or ' +
      '"stop notifying me about this". Both actions are idempotent. ' +
      'Note you are subscribed automatically to tasks you are assigned, own, or comment on — ' +
      'this tool is for following work that is not yours.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['watch', 'unwatch'],
          description: 'Whether to start or stop watching the task',
        },
        taskId: {
          type: 'string',
          description: 'The task ID to watch or unwatch (required)',
        },
      },
      required: ['action', 'taskId'],
    },
  },
  {
    name: 'list_watched',
    description: 'List the tasks you are watching, with their current status, priority, project and ' +
      'when each last changed. Answers "what is happening on the work I follow?" in one call — ' +
      'do NOT follow this with get_task per row. Each result also carries `reason`, why you are ' +
      'subscribed (manual, assignee, owner or commenter). Results are ordered most-recently-changed ' +
      'first, and PAGED: read `total` and `hasMore` rather than the row count — a short page and the ' +
      'end of the list look identical otherwise, which is how you conclude a subscription is gone.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization to list watched tasks for (required)',
        },
        limit: {
          type: 'number',
          description: 'Page size (default 50, max 200)',
        },
        offset: {
          type: 'number',
          description: 'Rows to skip, for paging past the first page (default 0)',
        },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'list_notifications',
    description: 'List your in-app notifications — mentions, replies, assignments, status changes on ' +
      'watched tasks. Defaults to UNREAD only, which is usually what "what have I missed?" means. ' +
      'Pass unreadOnly: false to include already-read history.',
    inputSchema: {
      type: 'object',
      properties: {
        unreadOnly: {
          type: 'boolean',
          description: 'Only unread notifications (default: true)',
          default: true,
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default 20, max 100)',
        },
      },
    },
  },
];
