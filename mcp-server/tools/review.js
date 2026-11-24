/**
 * Review Tools (E-302 #3444)
 * Read-only view of a project's review queue. There is no decision tool:
 * agents never approve or send back (see handlers/review.js).
 */

export const REVIEW_TOOLS = [
  {
    name: 'list_review_queue',
    description: 'List what is waiting for review (tasks in_review, and documents submitted for review), ' +
      'oldest submission first. Two modes. With projectId (and no projectIds): that project\'s tasks, ' +
      'with the project\'s approvePolicy. Without projectId, or with projectIds: YOUR cross-project queue ' +
      'in an organization, the same as the web Inbox\'s Review tab: every project you may decide reviews in ' +
      '(member or above), narrowed to projectIds when given; each row names its project and that project\'s ' +
      'approvePolicy, and documents are included when your key can read documents (type narrows to one). ' +
      'Each task row has the task number, title, assignee, submittedAt, verification counts from linked ' +
      'test cases (total, pass, fail, blocked, skip, notRun), a one-line summary, and referenced: every ' +
      'entity its title, description, comments, completion notes and knowledge cite (type, ref, id, title, ' +
      'status), so you can review those too without looking each up; absent when it cites nothing, and ' +
      'never anything you may not open. ' +
      'Read-only: agents cannot approve or send back; a human decides in the web app. ' +
      'Paged: read total and hasMore. ' +
      'Pass assignee to narrow by who the task is assigned to (a document by its owner): ' +
      '"me" (you, the key\'s user), "agents" (any AI assignee), "unassigned", ' +
      'or a user or agent id; several are OR\'d. ' +
      'A task sent back returns to in_progress with reviewFeedback on get_task; address that first.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'One project\'s review queue. Omit it for your cross-project queue.',
        },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 100,
          description: 'Cross-project mode: only these projects of your review scope ' +
            '(a project outside it is refused). Omit for every project you review in. ' +
            'projectId is merged in when both are sent.',
        },
        organizationId: {
          type: 'string',
          description: 'Cross-project mode: the organization whose queue to list. Defaults to this checkout\'s ' +
            '.ezmodo/config.json organization; required where there is none (the remote connector).',
        },
        type: {
          type: 'string',
          enum: ['task', 'document'],
          description: 'Cross-project mode: list only tasks or only documents. Omit for both.',
        },
        limit: {
          type: 'number',
          description: 'Page size (default 25, max 100)',
        },
        offset: {
          type: 'number',
          description: 'Rows to skip, for paging past the first page (default 0)',
        },
        assignee: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 50,
          description: 'Only tasks assigned to any of these: "me", "agents" (any AI assignee), "unassigned", ' +
            'or a user or agent id. Omit for everyone. Applied before paging, so total counts only matches.',
        },
      },
    },
  },
];
