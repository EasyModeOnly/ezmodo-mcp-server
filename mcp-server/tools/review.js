/**
 * Review Tools (E-302 #3444)
 * Read-only view of a project's review queue. There is no decision tool:
 * agents never approve or send back (see handlers/review.js).
 */

export const REVIEW_TOOLS = [
  {
    name: 'list_review_queue',
    description: 'List a project\'s tasks waiting for review (status in_review), oldest submission first. ' +
      'Each row has the task number, title, assignee, submittedAt, verification counts from linked ' +
      'test cases (total, pass, fail, blocked, skip, notRun) and a one-line summary. ' +
      'Read-only: agents cannot approve or send back; a human decides in the web app. ' +
      'approvePolicy says who may approve in this project. Paged: read total and hasMore. ' +
      'A task sent back returns to in_progress with reviewFeedback on get_task; address that first.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project whose review queue to list (required)',
        },
        limit: {
          type: 'number',
          description: 'Page size (default 25, max 100)',
        },
        offset: {
          type: 'number',
          description: 'Rows to skip, for paging past the first page (default 0)',
        },
      },
      required: ['projectId'],
    },
  },
];
