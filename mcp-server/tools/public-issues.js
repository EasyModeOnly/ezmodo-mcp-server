/**
 * Public Issue Tools (E-238 #2390)
 * MCP tools for a project's public issue tracker and its intake queue.
 *
 * The descriptions carry the model an agent needs to triage safely, because
 * the failure here is not a wrong status — it is internal detail or a
 * reporter's identity published to the whole internet:
 *   - a public issue is a separate, public record, worded for outsiders; it is
 *     NOT the internal task it may link to;
 *   - anonymous reporters are never named;
 *   - while statusSource is "auto", the public status follows the linked task,
 *     so link the task instead of setting a status by hand.
 */

const PUBLIC_MODEL =
  'A public issue is a SEPARATE, PUBLIC record of a bug, feature request or question, worded for people ' +
  'outside the organization. It is not the internal task: when it links to one, the two keep their own ' +
  'wording. Never paste internal details into a public issue — task titles or descriptions, code paths, ' +
  'customer or colleague names, internal URLs, stack traces with hostnames, secrets. Anonymous reporters ' +
  'are never named or quoted by identity, and their contact details are not available to you. ';

const STATUS_MODEL =
  'Public status (open, planned, in_progress, done, closed) FOLLOWS THE LINKED TASK automatically while ' +
  'statusSource is "auto" (backlog/todo → planned, in_progress/in_review/blocked → in_progress, ' +
  'completed → done). So link the task (manage_issue action:"link_task") rather than setting ' +
  'publicStatus by hand; setting it by hand switches the issue to statusSource "manual" and stops the ' +
  'sync until action:"resume_auto_status". ';

const ISSUE_TYPE = {
  type: 'string',
  enum: ['bug', 'feature', 'question'],
  description: 'Issue type',
};

export const PUBLIC_ISSUE_TOOLS = [
  {
    name: 'list_issues',
    description: 'List a project\'s public issues, or (queue: true) its intake queue. ' + PUBLIC_MODEL +
      'The intake queue holds untriaged reports that arrived from outside the organization (public form, ' +
      'widget, API, GitHub): each needs a decision — manage_issue publish_intake (becomes a public issue, ' +
      'in your own public wording), convert_intake (tracked on an internal task only) or reject_intake. ' +
      'Queue items carry piiFindings: personal data or secrets in the report, which must stay out of the ' +
      'published wording. Private security reports are never in the queue and cannot be published. ' +
      'Results are PAGED: read `total` and `hasMore`, not the row count.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (required)' },
        queue: {
          type: 'boolean',
          description: 'List the intake queue (untriaged outside reports) instead of the issues. ' +
            'Only limit/offset apply.',
        },
        state: {
          type: 'string',
          enum: ['draft', 'published', 'hidden'],
          description: 'Filter by visibility. draft and hidden issues are not public.',
        },
        status: {
          type: 'string',
          enum: ['open', 'planned', 'in_progress', 'done', 'closed'],
          description: 'Filter by public status',
        },
        type: ISSUE_TYPE,
        q: { type: 'string', description: 'Text search over title and body' },
        limit: { type: 'number', description: 'Page size (default 50, max 200)' },
        offset: { type: 'number', description: 'Rows to skip (default 0)' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_issue',
    description: 'Get one public issue by its number in the project (e.g. 12 for issue #12): title, body, ' +
      'type, labels (the names of its public tags) and tags (org tags with id, colour, and public false for one ' +
      'since taken out of the project\'s public set), state, publicStatus, statusSource, closeReason, linked taskId, ' +
      'vote and comment counts. ' +
      'Issue numbers are their own sequence, separate from task numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (required)' },
        number: { type: 'number', description: 'Issue number (required)' },
      },
      required: ['projectId', 'number'],
    },
  },
  {
    name: 'manage_issue',
    description: 'Triage and maintain a project\'s public issues. ' + PUBLIC_MODEL + STATUS_MODEL +
      'Actions: ' +
      'publish_intake (feedbackId, title, body, type, labels?, taskId?) — publish an intake report as a public ' +
      'issue, REWRITTEN in public wording (do not copy the report verbatim if it holds personal data); ' +
      'reject_intake (feedbackId, reason) — the reason may be emailed to the reporter, so write it for them; ' +
      'convert_intake (feedbackId, taskId) — track the report on an internal task without publishing it; ' +
      'create (title, body?, type?, labels?, taskId?, state?) — a maintainer-authored issue, draft by default; ' +
      'update (number, title/body/type/labels/publicStatus/closeReason/taskId); ' +
      'publish / hide (number) — make it public, or take it down; ' +
      'merge (number, intoNumber) — close as a duplicate of intoNumber; ' +
      'resume_auto_status (number) — go back to following the linked task; ' +
      'link_task (number, taskId) — link the internal task whose progress the issue should show ' +
      '(taskId "" unlinks). Requires member access to the project.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'publish_intake', 'reject_intake', 'convert_intake',
            'create', 'update', 'publish', 'hide', 'merge', 'resume_auto_status', 'link_task',
          ],
          description: 'Action to perform',
        },
        projectId: { type: 'string', description: 'Project ID (required)' },
        number: {
          type: 'number',
          description: 'Issue number (update, publish, hide, merge, resume_auto_status, link_task)',
        },
        feedbackId: {
          type: 'string',
          description: 'Intake item id from list_issues queue:true (publish_intake, reject_intake, convert_intake)',
        },
        title: { type: 'string', description: 'Public title, max 200 characters' },
        body: { type: 'string', description: 'Public body (markdown), max 20000 characters' },
        type: ISSUE_TYPE,
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Public tag NAMES (E-276: tags are org tags the project has made public). Replaces ' +
            'the issue\'s tags on update. When the project has public tags, names must be among them (or already ' +
            'on the issue); a project with none yet makes any name public. The linked task gains the issue\'s tags.',
        },
        state: {
          type: 'string',
          enum: ['draft', 'published'],
          description: 'create only: draft (default, not public) or published',
        },
        publicStatus: {
          type: 'string',
          enum: ['open', 'planned', 'in_progress', 'done', 'closed'],
          description: 'update only. Makes the status manual — prefer link_task.',
        },
        closeReason: {
          type: 'string',
          enum: ['duplicate', 'wont_fix', 'not_reproducible', 'by_design', ''],
          description: 'update only, with publicStatus closed. "" clears it.',
        },
        taskId: {
          type: 'string',
          description: 'Internal task id in the same project (link_task, convert_intake; optional on ' +
            'publish_intake, create, update). The task stays private; only its progress shows.',
        },
        intoNumber: { type: 'number', description: 'merge only: the issue this one duplicates' },
        reason: { type: 'string', description: 'reject_intake only: why, readable by the reporter' },
      },
      required: ['action', 'projectId'],
    },
  },
];
