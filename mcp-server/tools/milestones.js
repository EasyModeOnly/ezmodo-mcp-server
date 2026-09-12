/**
 * Milestone Tools
 * MCP tools for managing project milestones (version releases and initiatives)
 *
 * Milestones are project-scoped containers for tracking:
 * - Version releases (e.g., v1.2.0, v2.0.0-beta)
 * - Initiatives (e.g., Q1 2025, Sprint 5)
 *
 * Epics can be linked to milestones to track which features/work
 * will be included in a release or initiative.
 */

import { LINKS_ARRAY_SCHEMA } from './link-params.js';

export const MILESTONE_TOOLS = [
  {
    name: 'manage_milestone',
    description: 'Create, update, delete milestones, or manage epic/suite linking and changelog generation. ' +
      'Milestones can be version releases or initiatives.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create', 'update', 'delete',
            'link_epic', 'unlink_epic',
            'generate_changelog', 'reorder_epics',
            'link_suite', 'unlink_suite',
          ],
          description: 'Action to perform',
        },
        // --- Identifiers (used by most actions) ---
        projectId: {
          type: 'string',
          description: 'Project ID (required for all actions)',
        },
        milestoneId: {
          type: 'string',
          description: 'Milestone ID (required for update, delete, link_epic, unlink_epic, generate_changelog, reorder_epics, link_suite, unlink_suite)',
        },
        milestoneSlug: {
          type: 'string',
          description: 'URL-friendly slug of the milestone (alternative to milestoneId)',
        },
        // --- Create fields ---
        name: {
          type: 'string',
          description: 'Milestone name (required for create, e.g., "v1.2.0", "Q1 2025 Launch")',
        },
        type: {
          type: 'string',
          enum: ['version', 'initiative'],
          description: 'Milestone type (required for create): "version" for releases, "initiative" for initiatives',
        },
        description: {
          type: 'string',
          description: 'Milestone description, supports markdown (create, update). ' +
            'Writing this stays plain text; it does not create a backing document.',
        },
        version: {
          type: 'string',
          description: 'Semantic version string for version type milestones (e.g., "1.2.0", "2.0.0-beta") (create, update)',
        },
        targetDate: {
          type: 'string',
          description: 'Target completion/release date (RFC3339, e.g., 2026-03-31T00:00:00Z) (create, update)',
        },
        parentMilestoneId: {
          type: 'string',
          description: 'Nest this milestone under an overarching parent milestone (tiered milestones, E-217). ' +
            'On create: empty/omitted = top-level. On update: omit = leave unchanged, empty string "" = clear (promote to top-level), ' +
            'a milestone ID = re-parent. Validated for existence, cycles, and max nesting depth (3); parent must be in the same project. (create, update)',
        },
        status: {
          type: 'string',
          enum: ['planned', 'in_progress', 'released', 'archived'],
          description: 'Milestone status (default: "planned") (create, update)',
        },
        links: LINKS_ARRAY_SCHEMA,
        items: {
          type: 'array',
          description: 'Initial linked items, e.g., epics (create, update)',
          items: {
            type: 'object',
            properties: {
              entityId: { type: 'string', description: 'ID of the entity to link' },
              entityType: { type: 'string', description: 'Type of entity', enum: ['epic'], default: 'epic' },
              priority: { type: 'string', description: 'Priority level', enum: ['critical', 'high', 'medium', 'low'] },
              order: { type: 'number', description: 'Display order' },
            },
            required: ['entityId'],
          },
        },
        changelog: {
          type: 'string',
          description: 'Markdown changelog for version type milestones (create, update)',
        },
        // --- Update-only fields ---
        releasedDate: {
          type: 'string',
          description: 'Actual release date (RFC3339, typically set when status changes to "released") (update only)',
        },
        // --- link_epic / unlink_epic fields ---
        epicId: {
          type: 'string',
          description: 'Epic ID to link/unlink (required for link_epic, unlink_epic)',
        },
        entityType: {
          type: 'string',
          enum: ['epic'],
          description: 'Type of entity being linked (default: "epic") (link_epic only)',
          default: 'epic',
        },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Priority of epic/suite within milestone (default: "medium") (link_epic, link_suite)',
        },
        // --- reorder_epics fields ---
        itemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ordered array of item IDs — must contain same set as currently linked (reorder_epics only)',
        },
        // --- link_suite / unlink_suite fields ---
        suiteId: {
          type: 'string',
          description: 'Test suite ID to link/unlink (required for link_suite, unlink_suite)',
        },
      },
      required: ['action', 'projectId'],
    },
  },
  {
    name: 'get_milestone',
    description: 'Retrieve a single milestone by ID, or list all milestones for a project. ' +
      'Provide milestoneId (or milestoneSlug) for single lookup, or just projectId to list all. ' +
      'Optionally include progress data. ' +
      'Responses include `descriptionDocumentId` — the id of the backing rich-description Document ' +
      'when the description has been promoted to one (E-189), otherwise omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID (required)',
        },
        milestoneId: {
          type: 'string',
          description: 'Milestone ID for single lookup',
        },
        milestoneSlug: {
          type: 'string',
          description: 'Milestone slug for single lookup (alternative to milestoneId)',
        },
        includeProgress: {
          type: 'boolean',
          description: 'If true, include progress data (overall percentage, epic breakdown)',
        },
        // --- List filters (used when no milestoneId/milestoneSlug) ---
        type: {
          type: 'string',
          enum: ['version', 'initiative'],
          description: 'Filter by milestone type (list mode only)',
        },
        status: {
          type: 'string',
          enum: ['planned', 'in_progress', 'released', 'archived'],
          description: 'Filter by milestone status (list mode only)',
        },
      },
      required: ['projectId'],
    },
  },
];
