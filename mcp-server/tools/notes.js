/**
 * Note Tools (E-204)
 * MCP tools for the calling user's personal notes.
 *
 * Notes are PRIVATE to the user: they live in the user's own personal
 * workspace, are never visible to teammates, and are reachable from any
 * organization. Content goes in and comes out as markdown. A note can be
 * promoted into a task, bug or epic in a real project, which links the new
 * item back to the note.
 *
 * Kept to four tools on purpose — every tool costs context in every session:
 * list_notes + get_note (reads), manage_note, manage_note_folder.
 */

const PRIVACY =
  'Notes are the user\'s PRIVATE scratch notes: personal (never shared with ' +
  'teammates) and cross-org (the same notes whichever organization is active).';

const MARKDOWN_FORMAT =
  'Checklists are GFM task items (`- [ ] todo`, `- [x] done`). References to ' +
  'tasks, epics, projects or goals are links like ' +
  '`[#Fix login bug](ezmodo://task/<entityId>?org=<orgId>&number=42)`; a promoted ' +
  'reference uses `ezmodo://ref/<type>/<id>?org=<orgId>`. Keep these links ' +
  'unchanged when rewriting a note — removing one removes the reference and its ' +
  'backlink. To add a reference, write the same link with the entity\'s type, id ' +
  'and organization id.';

export const NOTE_TOOLS = [
  {
    name: 'list_notes',
    description: `List the user's personal notes (title, snippet, pin, folder). ${PRIVACY} ` +
      'Use get_note for a note\'s full markdown content.',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: {
          type: 'string',
          description: 'Only notes in this note folder. "root" = notes not in any folder. ' +
            'Omit for all notes.',
        },
        query: {
          type: 'string',
          description: 'Case-insensitive match on title or snippet',
        },
        limit: {
          type: 'number',
          description: 'Maximum notes to return',
        },
      },
    },
  },
  {
    name: 'get_note',
    description: `Get one personal note with its full content as markdown. ${MARKDOWN_FORMAT} ${PRIVACY}`,
    inputSchema: {
      type: 'object',
      properties: {
        noteId: {
          type: 'string',
          description: 'Note ID (required)',
        },
      },
      required: ['noteId'],
    },
  },
  {
    name: 'manage_note',
    description: `Create, edit, move, pin, delete or promote a personal note. ${PRIVACY} ` +
      'Content is markdown. "promote" turns the note into a task, bug or epic in a ' +
      'project of the user\'s choosing and links the new item back to the note.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'move', 'pin', 'promote'],
          description: 'Action to perform',
        },
        noteId: {
          type: 'string',
          description: 'Note ID (required for everything except create)',
        },
        title: {
          type: 'string',
          description: 'Note title (create, update). For promote: the new item\'s title ' +
            '(defaults to the note title).',
        },
        content: {
          type: 'string',
          description: `Markdown body. On update it REPLACES the whole note (create, update). ${MARKDOWN_FORMAT}`,
        },
        append: {
          type: 'string',
          description: 'Markdown appended to the end of the note, keeping what is there (update)',
        },
        folderId: {
          type: 'string',
          description: 'Note folder (create, move). For move, "root" or "" moves the note ' +
            'out of any folder.',
        },
        isPinned: {
          type: 'boolean',
          description: 'Pin state (pin; default true — pass false to unpin)',
        },
        // --- Promote fields ---
        kind: {
          type: 'string',
          enum: ['task', 'bug', 'epic'],
          description: 'What to promote the note into (required for promote)',
        },
        organizationId: {
          type: 'string',
          description: 'Organization of the target project (required for promote)',
        },
        projectId: {
          type: 'string',
          description: 'Target project (required for promote)',
        },
        description: {
          type: 'string',
          description: 'New item\'s description, markdown (promote; defaults to the note\'s text)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'New task/bug\'s priority (promote; ignored for kind epic, which has no priority)',
        },
        epicId: {
          type: 'string',
          description: 'Epic to put the new task/bug in (promote, kind task|bug; rejected for kind epic)',
        },
        featureId: {
          type: 'string',
          description: 'Feature to link the new item to (promote; same organization). Required for ' +
            'kind epic when the project requires every epic to be linked to a Feature — find one ' +
            'with search_features. For task/bug the created task is linked to it.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_note_folder',
    description: 'List, create, rename, move or delete the folders that organize the user\'s ' +
      'personal notes (separate from project document folders). Deleting a folder never ' +
      'deletes notes: its notes and subfolders move up to its parent.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'rename', 'move', 'delete'],
          description: 'Action to perform',
        },
        folderId: {
          type: 'string',
          description: 'Folder ID (required for rename, move, delete)',
        },
        name: {
          type: 'string',
          description: 'Folder name (required for create, rename)',
        },
        parentId: {
          type: 'string',
          description: 'Parent folder (create, move). For move, "root" or "" moves it to the top level.',
        },
      },
      required: ['action'],
    },
  },
];
