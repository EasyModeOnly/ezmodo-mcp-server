/**
 * Fact Tools
 * MCP tools for managing project-scoped facts (knowledge entries)
 *
 * Facts are short, tagged knowledge items scoped to a project — useful for
 * capturing decisions, conventions, and reference info that humans and AI
 * agents need.
 */

export const FACT_TOOLS = [
  {
    name: 'manage_fact',
    description: 'Create, update, or delete project facts (knowledge entries). ' +
      'Facts are short, tagged knowledge items scoped to a project — useful for capturing decisions, conventions, and reference info that humans and AI agents need.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete'],
          description: 'Action to perform',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for create and delete)',
        },
        factId: {
          type: 'string',
          description: 'Fact ID (required for update and delete)',
        },
        title: {
          type: 'string',
          description: 'Fact title (required for create)',
        },
        content: {
          type: 'string',
          description: 'Fact content (supports markdown)',
        },
        pinned: {
          type: 'boolean',
          description: 'Pin fact to top of list',
        },
        tagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag IDs for categorization',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_facts',
    description: 'List all project facts (knowledge entries) for a project. Returns pinned facts first.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        factId: {
          type: 'string',
          description: 'Optional: get a single fact by ID instead of listing all',
        },
      },
      required: ['projectId'],
    },
  },
];
