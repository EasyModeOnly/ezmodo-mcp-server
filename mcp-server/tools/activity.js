/**
 * Activity Timeline Tools
 * MCP tools for querying project activity/changes
 */

export const ACTIVITY_TOOLS = [
  {
    name: 'get_project_changes',
    description: 'Get recent activity and changes for a project. Returns structured events (task created/completed, epic progress, doc updates, etc.) with an aggregate summary. Use this to understand what happened in a project since a given date.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID to get changes for (required)',
        },
        since: {
          type: 'string',
          description: 'ISO 8601 date or relative duration. Examples: "2026-04-01T00:00:00Z", "7d" (last 7 days), "2w" (last 2 weeks), "30d" (last 30 days). Default: 7 days ago.',
        },
        entityTypes: {
          type: 'string',
          description: 'Comma-separated entity types to filter by. Options: task, epic, goal, document, project, comment. Example: "task,epic"',
        },
        eventTypes: {
          type: 'string',
          description: 'Comma-separated event types to filter by. Examples: "task_completed,task_created", "epic_status_changed"',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default: 20, max: 100)',
          default: 20,
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'catch_up',
    description: 'Catch me up: what happened in a project since a date, for YOU to summarise for your person. ' +
      'ezmodo does not write the summary; it hands you the activity grouped by the thing it happened to — one ' +
      'line per task, epic, goal, milestone or document, with its status journey in order (todo → in_progress → ' +
      'completed), what else changed, how many comments, who, and when — most significant first.\n\n' +
      'Built for volume. `totals` always counts the whole window. A small window comes back inline (`items`). ' +
      'A large one, in a checkout, is written to a file under .ezmodo/catch-up/ and you get its path plus the ' +
      'top `highlights`: read the file in chunks as far as you need. Over the remote connector a large window ' +
      'comes back a page at a time: pass `nextCursor` back as `cursor` for the next page.\n\n' +
      'scope "epic" (with epicId) answers for one epic instead, since you last looked, in sentences — it is ' +
      'get_epic_activity. For a sprint, pass the sprint\'s start date as `since`. For what happened to things ' +
      'you watch, use list_notifications.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['project', 'epic'],
          description: 'What to catch up on (default "project")',
        },
        projectId: {
          type: 'string',
          description: 'The project (scope "project"). Defaults to this checkout\'s project.',
        },
        epicId: {
          type: 'string',
          description: 'The epic (scope "epic")',
        },
        since: {
          type: 'string',
          description: 'ISO 8601 date or a relative duration: "7d", "2w", "1m". Default 7 days. For scope "epic" ' +
            'the default is since you last caught up on it.',
        },
        entityTypes: {
          type: 'string',
          description: 'Only these kinds, comma-separated: task, epic, goal, milestone, document, project',
        },
        cursor: {
          type: 'string',
          description: 'The `nextCursor` from the previous page (remote paging). Carries the window with it.',
        },
        markSeen: {
          type: 'boolean',
          description: 'Scope "epic" only: mark the epic as caught up (default true)',
        },
      },
    },
  },
];
