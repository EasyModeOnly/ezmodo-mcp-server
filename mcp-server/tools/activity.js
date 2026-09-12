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
];
