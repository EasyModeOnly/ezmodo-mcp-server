/**
 * Entity Management Tools
 * MCP tools for managing goals, teams, and labels
 *
 * Consolidated: manage_goal (create/update/delete), manage_team (create), get_goal (get/list)
 */

export const ENTITY_TOOLS = [
  {
    name: 'manage_goal',
    description: 'Create, update, or delete organization-wide strategic goals, or ' +
      '(re)generate a goal\'s grounded "how it works" living description.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'generate_how_it_works', 'apply_how_it_works'],
          description: 'Action to perform. "generate_how_it_works" (re)generates the ' +
            'goal\'s grounded, source-attributed "how it works" living description from ' +
            'its linked work (requires goalId; AI-quota gated). "apply_how_it_works" (BYO-AI) ' +
            'persists a summary YOU authored (markdown + sources); the server validates your cited ' +
            'sources against the real grounded context before saving — no server model call. Read ' +
            'the result back via get_goal.',
        },
        // --- Identifiers ---
        goalId: {
          type: 'string',
          description: 'Goal ID (required for update, delete, generate_how_it_works, apply_how_it_works)',
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
            'real source refs from the goal\'s grounded context; the server drops fabricated ones.',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create)',
        },
        // --- Create fields ---
        title: {
          type: 'string',
          description: 'Goal title (required for create, optional for update)',
        },
        description: {
          type: 'string',
          description: 'Goal description — supports markdown. Used by create and update.',
        },
        targetDate: {
          type: 'string',
          description: 'Target completion date (RFC3339 format, e.g., 2026-03-31T00:00:00Z). Used by create and update.',
        },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'archived'],
          description: 'Goal status (default: active). Used by create and update.',
        },
        parentGoalId: {
          type: 'string',
          description: 'Parent goal ID for goal hierarchy (create only)',
        },
        metrics: {
          type: 'array',
          description: 'Goal metrics. Used by create and update.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              target: { type: 'number' },
              unit: { type: 'string' },
              current: { type: 'number' },
              description: { type: 'string' },
            },
            required: ['name', 'target', 'unit'],
          },
        },
        linkedMilestones: {
          type: 'array',
          description: 'Milestones to link to this goal. Used by create and update.',
          items: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID containing the milestone' },
              milestoneId: { type: 'string', description: 'Milestone ID to link' },
            },
            required: ['projectId', 'milestoneId'],
          },
        },
        epicIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of linked epic IDs (update only)',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label IDs. Used by create and update.',
        },
        teamIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of team IDs responsible for this goal. Used by create and update.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_team',
    description: 'Create a team within an organization.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create'],
          description: 'Action to perform',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create)',
        },
        name: {
          type: 'string',
          description: 'Team name (required for create)',
        },
        description: {
          type: 'string',
          description: 'Team description',
        },
        memberIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of user IDs to add as team members',
        },
        slug: {
          type: 'string',
          description: 'URL-friendly slug (e.g., "frontend-team")',
        },
        color: {
          type: 'string',
          description: 'Hex color for visual identification (e.g., "#3B82F6")',
        },
        leaderId: {
          type: 'string',
          description: 'User ID of team lead/manager',
        },
        sprintOverride: {
          type: 'object',
          description: 'Sprint configuration override',
          properties: {
            enabled: { type: 'boolean' },
            duration: { type: 'number', enum: [7, 10, 14, 21] },
            startDate: { type: 'string', description: 'RFC3339 format (e.g., 2026-01-01T00:00:00Z)' },
            offset: { type: 'number', description: 'Days offset from org sprint' },
          },
        },
        capacityOverrides: {
          type: 'array',
          description: 'Individual capacity overrides per member',
          items: {
            type: 'object',
            properties: {
              memberId: { type: 'string' },
              pointsPerSprint: { type: 'number' },
            },
          },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_goal',
    description: 'Retrieve a single goal or list all goals. ' +
      'Modes: (1) Provide goalId for single lookup. ' +
      '(2) Provide organizationId + goalNumber for number lookup. ' +
      '(3) Provide organizationId to list all goals with optional filters.',
    inputSchema: {
      type: 'object',
      properties: {
        // --- Single goal lookup ---
        goalId: {
          type: 'string',
          description: 'Document ID of the goal to retrieve',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for goalNumber lookup or listing)',
        },
        goalNumber: {
          type: 'number',
          description: 'Sequential goal number (e.g., 7 for goal g-7). Must be used with organizationId.',
        },
        includeEpics: {
          type: 'boolean',
          description: 'Include linked epic details (single goal mode)',
        },
        // --- List filters ---
        status: {
          type: 'string',
          enum: ['active', 'completed', 'archived'],
          description: 'Filter by goal status (list mode)',
        },
        teamId: {
          type: 'string',
          description: 'Filter by team assignment (list mode)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (list mode, default: 50)',
        },
      },
    },
  },
];
