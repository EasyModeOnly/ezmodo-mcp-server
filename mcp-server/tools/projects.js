/**
 * Project Tools
 * MCP tools for managing projects (primary container for work)
 *
 * Projects are long-lived containers that hold tasks and epics.
 * Types: software, marketing, sales, operations, design, infrastructure,
 * creative, research, implementation, custom.
 *
 * A project's type decides what its work is CALLED (E-107). A marketing project
 * calls an epic a "Campaign"; a sales project calls
 * a task an "Activity". `get_project` returns the resolved vocabulary as
 * `terminology`, and `get_current_project_context` caches it. Use those words
 * when writing anything a person reads — titles, descriptions, chat replies —
 * while keeping the API's own field names (epicId, taskId) unchanged.
 */

export const PROJECT_TOOLS = [
  {
    name: 'manage_project',
    description: 'Create a new project within an organization, update an existing one, ' +
      'or (re)generate a project\'s grounded "how it works" living description.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'generate_how_it_works', 'apply_how_it_works'],
          description: 'Action to perform. "update" changes an existing project ' +
            '(requires projectId); only the fields you pass are touched — accepts name, ' +
            'description, slug, ownerId, gitUrl and gitProvider. Setting gitUrl after ' +
            'creation is what enables commit-to-task linking. "generate_how_it_works" (re)generates the ' +
            'project\'s grounded, source-attributed "how it works" living description from ' +
            'its linked work (requires projectId; AI-quota gated). "apply_how_it_works" (BYO-AI) ' +
            'persists a summary YOU authored (markdown + sources); the server validates your cited ' +
            'sources against the real grounded context before saving — no server model call. Read ' +
            'the result back via get_project.',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for update, generate_how_it_works, apply_how_it_works)',
        },
        // --- apply_how_it_works (BYO-AI) ---
        markdown: {
          type: 'string',
          description: 'Rendered markdown body for apply_how_it_works (the how-it-works YOU authored).',
        },
        sources: {
          type: 'object',
          description: 'Structured backing for apply_how_it_works: { claims: [{ text, sources: [ref...], ' +
            'confidence: "grounded"|"unverified" }], divergences: [{ intent, reality, severity }] }. Cite ' +
            'real source refs from the project\'s grounded context; the server drops fabricated ones.',
        },
        organizationId: {
          type: 'string',
          description: 'The ID of the organization to create the project in (required for create)',
        },
        name: {
          type: 'string',
          description: 'The project name (required for create, optional for update)',
        },
        slug: {
          type: 'string',
          description: 'URL slug for the project (update only). Changing this changes the ' +
            'project\'s URLs.',
        },
        description: {
          type: 'string',
          description: 'Project description (supports markdown). ' +
            'Writing this stays plain text; it does not create a backing document.',
        },
        type: {
          type: 'string',
          enum: ['software', 'marketing', 'sales', 'operations', 'design', 'infrastructure',
            'creative', 'research', 'implementation', 'custom'],
          description: 'Project type (default: software)',
          default: 'software',
        },
        customType: {
          type: 'string',
          description: 'Custom type name (only used when type is "custom")',
        },
        gitUrl: {
          type: 'string',
          description: 'Git repository URL (for software projects). Settable on create and ' +
            'update — this is what links the project to its repo so commits can be matched ' +
            'back to tasks.',
        },
        gitProvider: {
          type: 'string',
          enum: ['github', 'gitlab', 'bitbucket'],
          description: 'Git provider (create and update)',
        },
        ownerId: {
          type: 'string',
          description: 'User ID of the project owner (defaults to API key user on create; ' +
            'reassigns the owner on update)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_project',
    description: 'Get project info by ID (context/memory), search projects by text, or list all projects. ' +
      'Provide projectId for context retrieval, query for search, or neither to list all. ' +
      'Responses include `descriptionDocumentId` — the id of the backing rich-description Document ' +
      'when the description has been promoted to one (E-189), otherwise omitted. ' +
      'By-ID responses also carry `type` and `terminology` — the words this project uses for ' +
      'epics and tasks, and for their statuses (E-107). Write prose in those words; ' +
      'a marketing project calls an epic a "Campaign". `terminology` is absent for a type with no ' +
      'template, which means plain English, not an error.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID — returns project context including memory, knowledge, ' +
            'configuration, the project `type`, and the `terminology` that type speaks',
        },
        query: {
          type: 'string',
          description: 'Search text for project name or description (case-insensitive)',
        },
        type: {
          type: 'string',
          enum: ['software', 'marketing', 'sales', 'operations', 'design', 'infrastructure',
            'creative', 'research', 'implementation', 'custom'],
          description: 'Filter by project type (search/list mode)',
        },
        organizationId: {
          type: 'string',
          description: 'Filter by organization ID (search/list mode)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 50)',
          default: 50,
        },
      },
    },
  },
  {
    name: 'get_project_story',
    description: 'Project Story (E-208): a grounded, source-attributed narrative of what has happened to a project ' +
      'since it began in ezmodo — the time-axis complement to "how it works". Use it to catch up on a project. ' +
      'Returns rendered markdown plus validated claims (each citing real event:/decision: sources), the resolved ' +
      'window, and generatedAt. Returns a fresh cached story when available, otherwise generates one (AI-quota gated).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to narrate',
        },
        window: {
          type: 'string',
          enum: ['since_inception', 'last_release', 'last_sprint', 'custom'],
          description: 'Time window for the story (default: since_inception). last_release/last_sprint/custom require from+to.',
        },
        from: {
          type: 'string',
          description: 'Window start, RFC3339 (e.g. 2026-01-02T15:04:05Z). Required for custom/last_release/last_sprint.',
        },
        to: {
          type: 'string',
          description: 'Window end, RFC3339. Required for custom/last_release/last_sprint.',
        },
      },
      required: ['projectId'],
    },
  },
];
