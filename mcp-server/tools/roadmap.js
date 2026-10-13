/**
 * Roadmap Tools (#3233)
 * manage_roadmap: change a project's PUBLIC roadmap cards. Reading the
 * roadmap is get_public_tracker {view:"roadmap"}, which is read-only, so a
 * client can allow it without approving writes.
 */

const ROADMAP_MODEL =
  'The roadmap is a project\'s PUBLIC board of cards in four columns: now, next, later and shipped. Cards are ' +
  'shown to people outside the organization when the project\'s roadmap is switched on (see get_public_tracker ' +
  'view:"settings"), so word titles and summaries for users: no task titles, code paths, colleague or customer ' +
  'names, internal URLs or secrets. A card may point at one feature, epic or milestone (entityType + entityId) ' +
  'and may have public issues linked to it; their votes add up on the card. ';

export const ROADMAP_TOOLS = [
  {
    name: 'manage_roadmap',
    description: 'Change a project\'s public roadmap. ' + ROADMAP_MODEL +
      'Read the cards first with get_public_tracker view:"roadmap". Actions: ' +
      'create (title, summary?, column?, entityType?, entityId?, showTargetDate?) — a new card, in column now ' +
      'unless you say otherwise; column cannot be shipped (use ship); ' +
      'update (itemId, title?, summary?, column?, entityType?, entityId?, showTargetDate?) — only the fields you ' +
      'send change; "" for entityType/entityId clears the reference; column cannot become shipped (use ship); ' +
      'delete (itemId) — removes the card; its issues are untouched; ' +
      'reorder (column, ids) — the full top-to-bottom order of one column\'s card ids; ' +
      'ship (itemId) — moves the card to shipped AND MARKS EVERY LINKED ISSUE NOT YET DONE OR CLOSED AS DONE, ' +
      'WHICH EMAILS THEIR REPORTERS AND FOLLOWERS. Confirm with the user before shipping; ' +
      'link_issue / unlink_issue (itemId, number) — attach or detach a public issue by its number. ' +
      'Requires member access to the project.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'reorder', 'ship', 'link_issue', 'unlink_issue'],
          description: 'Action to perform',
        },
        projectId: { type: 'string', description: 'Project ID (required)' },
        itemId: { type: 'string', description: 'Roadmap card id (update, delete, ship, link_issue, unlink_issue)' },
        title: { type: 'string', description: 'create (required) / update: public card title' },
        summary: { type: 'string', description: 'create / update: public one-paragraph summary' },
        column: {
          type: 'string',
          enum: ['now', 'next', 'later', 'shipped'],
          description: 'create / update: now, next or later (shipped only through ship); reorder: the column to order',
        },
        entityType: {
          type: 'string',
          enum: ['feature', 'epic', 'milestone', ''],
          description: 'create / update: what the card points at, if anything. "" clears it on update.',
        },
        entityId: { type: 'string', description: 'create / update: id of that feature, epic or milestone' },
        showTargetDate: {
          type: 'boolean',
          description: 'create / update: show the pointed-at epic\'s or milestone\'s target date publicly',
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'reorder only: every card id in the column, top to bottom',
        },
        number: { type: 'number', description: 'link_issue / unlink_issue: the public issue number' },
      },
      required: ['action', 'projectId'],
    },
  },
];
