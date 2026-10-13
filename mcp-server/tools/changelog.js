/**
 * Changelog Tools (#3219)
 * MCP tools for a project's public changelog: one release-notes entry per
 * milestone, drafted, edited and published by the project's maintainers.
 *
 * The descriptions carry what an agent must know before it publishes,
 * because publishing is the one action here with consequences outside
 * EzModo: it puts the entry on the public changelog page AND emails the
 * project's verified subscribers.
 */

const CHANGELOG_MODEL =
  'A changelog entry is a milestone\'s PUBLIC release notes, worded for people outside the organization ' +
  '(each milestone has at most one entry). Write it for users: never paste internal details such as task ' +
  'titles, code paths, colleague or customer names, internal URLs or secrets. An entry stays a draft (not ' +
  'public) until published, and can only be published once its milestone has reached production. ';

export const CHANGELOG_TOOLS = [
  {
    name: 'list_changelog',
    description: 'List a project\'s changelog: its entries (draft and published, WITHOUT bodies; read one ' +
      'with get_changelog_entry), the milestones that can have release notes (candidates, with hasEntry and ' +
      'reachedProductionAt, which is null until the milestone reached production), and verifiedSubscribers, ' +
      'how many people publishing an entry would email. ' + CHANGELOG_MODEL +
      'Requires view access to the project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (required)' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_changelog_entry',
    description: 'Get one changelog entry by id, with its markdown body: title, version, slug (the public ' +
      'page address: the version, or the id when it has none), state (draft or published), milestoneId, ' +
      'releasedAt and publishedAt.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (required)' },
        entryId: { type: 'string', description: 'Entry id from list_changelog (required)' },
      },
      required: ['projectId', 'entryId'],
    },
  },
  {
    name: 'manage_changelog',
    description: 'Write and publish a project\'s release notes. ' + CHANGELOG_MODEL +
      'Actions: ' +
      'draft (milestoneId) — the milestone\'s entry, created as a draft when it has none, titled and versioned ' +
      'after the milestone and seeded from its "What\'s new" (or a draft of it); returns the existing entry ' +
      'unchanged if there is one. There is no other way to create an entry; ' +
      'update (entryId, title?, version?, body?) — edit the public wording; only the fields you send change, ' +
      'and a published entry changes on the public page at once. version is the entry\'s URL slug, so it ' +
      'cannot contain / ? or #; ' +
      'publish (entryId) — make it public AND EMAIL THE PROJECT\'S VERIFIED SUBSCRIBERS. Fails with ' +
      'not_released until the milestone reached production. Returns the entry and verifiedSubscribers; each ' +
      'subscriber gets an entry once, in the background, so publishing again emails nobody twice, and nothing ' +
      'is sent while the project\'s public changelog is off. Confirm with the user before publishing, and tell ' +
      'them how many subscribers were notified; ' +
      'unpublish (entryId) — take it off the public changelog (back to draft); emails already sent stay sent. ' +
      'Entries cannot be deleted: unpublish one instead. ' +
      'Requires member access to the project.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['draft', 'update', 'publish', 'unpublish'],
          description: 'Action to perform',
        },
        projectId: { type: 'string', description: 'Project ID (required)' },
        milestoneId: { type: 'string', description: 'draft only: the milestone the notes are for' },
        entryId: { type: 'string', description: 'Entry id (update, publish, unpublish)' },
        title: { type: 'string', description: 'update only: public title, max 200 characters, not empty' },
        version: {
          type: 'string',
          description: 'update only: version label shown and used as the URL slug, max 100 characters, ' +
            'no / ? or #. "" clears it (the slug becomes the id).',
        },
        body: { type: 'string', description: 'update only: release notes in markdown, max 20000 characters' },
      },
      required: ['action', 'projectId'],
    },
  },
];
