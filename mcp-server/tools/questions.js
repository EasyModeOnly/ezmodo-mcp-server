/**
 * Question Tools (E-333 #3829)
 *
 * When you need something from a person, ask a question on the task it holds
 * up instead of ending your session with a "still on you" list. The person
 * answers it from their Inbox in the web app; you read the answer back with
 * list_questions.
 *
 * Kinds: "todo" (a step only a person can do, with a deep link to the exact
 * place), "question" (a free-text reply), "approval" (a pointer to where the
 * approval really happens; nobody approves from the card). A DECISION (options
 * plus a recommendation) is a decision to make: ask it with manage_decision
 * action "create" and taskId.
 */

export const QUESTION_TOOLS = [
  {
    name: 'manage_question',
    description: 'Ask a person something on the task (or epic) it holds up, change the question, or ' +
      'withdraw it. Use it instead of ending a session with a list of things left for the person: ' +
      'each item becomes a question in their Inbox, linked to the work it blocks.\n\n' +
      'KINDS: "todo" = a step only a person can do (say exactly what, and put a deep link to the ' +
      'exact place in link; if the API cannot do it, also file the API gap as a task); "question" = ' +
      'you need a free-text reply; "approval" = it needs approving somewhere else (link to where; ' +
      'nobody approves from the card). For a choice between options, ask a DECISION instead: ' +
      'manage_decision action "create" with taskId, question, choices and recommendation.\n\n' +
      'Write the title as the question itself, in plain words a non-developer can answer, and put ' +
      'what, why and what each option costs in body (markdown). blocking:true holds the task ' +
      'blocked until it is answered. The owner (who answers) defaults to the person you work for. ' +
      'Read the answer later with list_questions (answeredSince). "update" changes an open ' +
      'question (questionId plus the fields); "withdraw" takes it back when you no longer need it.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'withdraw'],
          description: 'create (taskId or epicId, kind, title), update (questionId + fields), withdraw (questionId)',
        },
        questionId: {
          type: 'string',
          description: 'The question to change or withdraw (update, withdraw)',
        },
        taskId: {
          type: 'string',
          description: 'Ask on this task (create). Prefer the task the answer unblocks.',
        },
        epicId: {
          type: 'string',
          description: 'Ask on this epic as a whole, when no single task is held up (create)',
        },
        kind: {
          type: 'string',
          enum: ['todo', 'question', 'approval'],
          description: 'What you need: todo, question or approval (create)',
        },
        title: {
          type: 'string',
          description: 'The question or the step, in one plain line (create, update)',
        },
        body: {
          type: 'string',
          description: 'What, why, and what each option costs, in markdown (create, update)',
        },
        link: {
          type: 'string',
          description: 'A deep link to where the person does it: a web page, a PR, a console screen (create, update)',
        },
        blocking: {
          type: 'boolean',
          description: 'true holds the task blocked until it is answered; false releases it (create, update)',
        },
        ownerId: {
          type: 'string',
          description: 'User id of who should answer. Defaults to the person you work for (create, update)',
        },
        sessionId: {
          type: 'string',
          description: 'Your session id, so the person can tell which session asked (create)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_questions',
    description: 'List questions and decisions to make asked on a task (taskId) or on an epic and its ' +
      'tasks (epicId), or, with only organizationId, everything asked with your key. Each row has the ' +
      'kind, title, status (open, answered, done, dismissed, withdrawn; a decision: proposed, accepted, ' +
      'rejected), blocking, the answer {text, by, at} once there is one, and the task and epic it is ' +
      'on. answeredSince (an ISO time) returns only what changed since then: answered, done, ' +
      'dismissed and reopened questions and decided decisions. Check it when you resume work you ' +
      'asked about. unseen:true returns only what no agent with your key has been shown yet ' +
      '("answered while you were away") and marks it shown, so each answer reaches you once; ' +
      'get_task and get_current_project_context already lead with it. A row with reopened:true was ' +
      'put back to open by the person: its earlier answer no longer stands. Paged: read total and hasMore.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Questions on this task' },
        epicId: { type: 'string', description: 'Questions on this epic and on its tasks' },
        organizationId: {
          type: 'string',
          description: 'Without taskId or epicId: everything asked with your key in this organization',
        },
        answeredSince: {
          type: 'string',
          description: 'ISO 8601 time, e.g. 2026-11-16T09:00:00Z: only what changed since then',
        },
        status: {
          type: 'string',
          enum: ['open'],
          description: 'Only open ones. Omit for every status.',
        },
        unseen: {
          type: 'boolean',
          description: 'Only what changed that no agent with your key has been shown yet, then mark it shown',
        },
        limit: { type: 'number', description: 'Page size (default 50, max 200)' },
        offset: { type: 'number', description: 'Rows to skip (default 0)' },
      },
    },
  },
];
