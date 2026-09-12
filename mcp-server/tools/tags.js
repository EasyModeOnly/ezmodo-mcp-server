/**
 * Tag Tools
 * MCP tools for managing tags (organization-scoped categorization)
 *
 * Consolidated: manage_tag (create/update/delete/merge/bulk_tag) + list_tags (get/list/find/suggest)
 *
 * NOTE for future sweeps: the `['task', 'epic', 'document', 'goal']` enums below
 * are the TAGGABLE set, NOT the LINKABLE set. They are deliberately NOT
 * `LINKABLE_TYPES` (tools/linkable-types.js) — entity_tags covers a different,
 * smaller set of entities than entity_links, and widening these to the 14
 * linkable types would offer agents combinations the tagging API rejects.
 * Do not "fix" them to LINKABLE_TYPES.
 */

export const TAG_TOOLS = [
  {
    name: 'manage_tag',
    description: 'Create, update, delete, merge, or bulk-apply tags. ' +
      'Tags are organization-scoped categorization labels for tasks, epics, and other entities.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'merge', 'bulk_tag'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        tagId: {
          type: 'string',
          description: 'Tag ID (required for update, delete)',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create, merge, bulk_tag)',
        },
        // --- Create fields ---
        name: {
          type: 'string',
          description: 'Tag name (required for create, optional for update)',
        },
        color: {
          type: 'string',
          description: 'Hex color code e.g. "#FF5733" (required for create, optional for update)',
        },
        category: {
          type: 'string',
          enum: ['priority', 'status', 'type', 'team', 'customer', 'custom'],
          description: 'Tag category (default: custom). Used by create and update.',
        },
        description: {
          type: 'string',
          description: 'Tag description. Used by create and update.',
        },
        aliases: {
          type: 'array',
          items: { type: 'string' },
          description: 'Alternative names for search/matching. Used by create and update.',
        },
        pinned: {
          type: 'boolean',
          description: 'Whether the tag should be pinned (shown prominently). Used by create and update.',
        },
        // --- Update-only fields ---
        hidden: {
          type: 'boolean',
          description: 'Whether the tag should be hidden (update only)',
        },
        // --- Merge fields ---
        sourceTagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of tags to merge — will be deleted after merge (merge only)',
        },
        targetTagId: {
          type: 'string',
          description: 'ID of the tag to merge into — will be kept (merge only)',
        },
        createAlias: {
          type: 'boolean',
          description: 'Add source tag names as aliases to the target tag (merge only, default: true)',
        },
        // --- Bulk tag fields ---
        tagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of tags to apply (bulk_tag only)',
        },
        entities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityType: {
                type: 'string',
                enum: ['task', 'epic', 'document', 'goal'],
                description: 'Type of entity',
              },
              entityId: {
                type: 'string',
                description: 'ID of the entity',
              },
            },
            required: ['entityType', 'entityId'],
          },
          description: 'List of entities to tag (bulk_tag only)',
        },
        operation: {
          type: 'string',
          enum: ['add', 'remove', 'set'],
          description: 'Operation: add, remove, or set/replace all tags (bulk_tag only)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_tags',
    description: 'List, get, find entities by tags, or get AI tag suggestions. ' +
      'Modes: (1) Provide tagId for single tag lookup. ' +
      '(2) Provide organizationId to list tags with optional filters. ' +
      '(3) Set findEntities=true with tagIds array to search entities by tags. ' +
      '(4) Set suggest=true with queryText for AI-powered tag suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        // --- Single tag lookup ---
        tagId: {
          type: 'string',
          description: 'Get a single tag by ID',
        },
        // --- List mode ---
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for list, find, suggest modes)',
        },
        category: {
          type: 'string',
          enum: ['priority', 'status', 'type', 'team', 'customer', 'custom'],
          description: 'Filter by tag category (list mode)',
        },
        projectId: {
          type: 'string',
          description: 'Filter by project ID (list and find modes)',
        },
        searchQuery: {
          type: 'string',
          description: 'Search query to filter tags by name, description, or aliases (list mode)',
        },
        pinnedOnly: {
          type: 'boolean',
          description: 'Only return pinned tags (list mode)',
        },
        includeHidden: {
          type: 'boolean',
          description: 'Include hidden tags in results (list mode)',
        },
        // --- Get by name (alternative to tagId) ---
        name: {
          type: 'string',
          description: 'Tag name to look up (used with organizationId instead of tagId)',
        },
        // --- Find entities mode ---
        findEntities: {
          type: 'boolean',
          description: 'Set to true to search for entities by tags',
        },
        tagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of tags to filter by (findEntities mode)',
        },
        operator: {
          type: 'string',
          enum: ['AND', 'OR'],
          description: 'Match all tags (AND) or any tag (OR) (findEntities mode, default: AND)',
        },
        entityTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['task', 'epic', 'document', 'goal'],
          },
          description: 'Types of entities to search (findEntities mode, default: all)',
        },
        epicId: {
          type: 'string',
          description: 'Scope search to a specific epic (findEntities mode)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (findEntities default: 50, suggest default: 5)',
        },
        // --- Suggest mode ---
        suggest: {
          type: 'boolean',
          description: 'Set to true for AI-powered tag suggestions',
        },
        queryText: {
          type: 'string',
          description: 'Text to find matching tags for, e.g. task title+description (suggest mode)',
        },
        entityType: {
          type: 'string',
          enum: ['task', 'epic', 'document', 'goal'],
          description: 'Type of entity being tagged — for context (suggest mode)',
        },
        entityId: {
          type: 'string',
          description: 'ID of entity being tagged — for context (suggest mode)',
        },
        minSimilarity: {
          type: 'number',
          description: 'Minimum similarity threshold 0-1 (suggest mode, default: 0.3)',
        },
      },
    },
  },
];
