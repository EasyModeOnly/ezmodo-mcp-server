/**
 * Design Tools
 * MCP tools for Designs (the in-product living design system).
 *
 * A Design is an AI-authored HTML/CSS artifact that captures the product's house
 * style. kind ∈ theme|component|page. Designs are org-level (projectId nullable)
 * and LINK to features and other artifacts via the generic link graph — they do
 * not contain them.
 *
 * An agent should read the design system (get_design_system) to learn the
 * established house style before authoring or designing any new UI, so new
 * designs match the existing theme + components.
 */

import { LINKABLE_TYPES } from './linkable-types.js';
import { LINKS_ARRAY_SCHEMA } from './link-params.js';

export const DESIGN_TOOLS = [
  {
    name: 'manage_design',
    description: 'Create, update, or delete a Design (an AI-authored HTML/CSS artifact in the living ' +
      'design system: kind theme|component|page, name, html, css, status), or link/unlink it to ' +
      'existing artifacts. Designs are org-level and LINK to features/epics/tasks/milestones/etc., ' +
      'they do not contain them. Before authoring a new design, call get_design_system first to ' +
      'learn the established house style.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'link', 'unlink'],
          description: 'Action to perform. "link"/"unlink" attach/detach the design to an artifact ' +
            '(pass designId + targetType + targetId).',
        },
        // --- Identifiers ---
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create)',
        },
        designId: {
          type: 'string',
          description: 'Design ID (required for update, delete, link, unlink)',
        },
        // --- Create / update fields ---
        kind: {
          type: 'string',
          enum: ['theme', 'component', 'page'],
          description: 'Design kind: "theme" (the house style/tokens), "component" (a reusable UI ' +
            'piece), or "page" (a full page layout). Required for create (create, update).',
        },
        name: {
          type: 'string',
          description: 'Design name (required for create), e.g. "Primary Button" or "Dashboard Theme" ' +
            '(create, update)',
        },
        slug: {
          type: 'string',
          description: 'URL-friendly slug for the design (create, update)',
        },
        html: {
          type: 'string',
          description: 'The HTML markup of the design, typically Tailwind-classed (create, update)',
        },
        css: {
          type: 'string',
          description: 'The CSS for the design (create, update)',
        },
        description: {
          type: 'string',
          description: 'Description of the design / how it is used, supports markdown (create, update)',
        },
        parentDesignId: {
          type: 'string',
          description: 'Parent design ID for nesting (e.g. a component within a theme) (create, update)',
        },
        status: {
          type: 'string',
          enum: ['draft', 'active', 'deprecated'],
          description: 'Design lifecycle status (default: "draft") (create, update)',
        },
        projectId: {
          type: 'string',
          description: 'Scope the design to a project. Omit/empty = cross-project / org-wide ' +
            '(create, update)',
        },
        // --- link / unlink fields ---
        targetType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Type of artifact to link/unlink (required for link, unlink)',
        },
        targetId: {
          type: 'string',
          description: 'ID of the artifact to link/unlink (required for link, unlink)',
        },
        // --- create-time link fields ---
        linkToType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Optionally link the new design to this artifact type on creation (create)',
        },
        linkToId: {
          type: 'string',
          description: 'ID of the artifact to link the new design to on creation ' +
            '(create; requires linkToType)',
        },
        links: LINKS_ARRAY_SCHEMA,
      },
      required: ['action'],
    },
  },
  {
    name: 'get_design',
    description: 'Retrieve a single Design, or list the designs linked to a given entity (e.g. all ' +
      'designs on a feature). Provide designId for a single lookup; provide linkedType + linkedId to ' +
      'list designs linked to that entity.',
    inputSchema: {
      type: 'object',
      properties: {
        designId: {
          type: 'string',
          description: 'Design ID for a single lookup',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (optional; scopes a linkedType + linkedId lookup)',
        },
        linkedType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'List designs linked to this entity type (requires linkedId), ' +
            'e.g. all designs on a feature',
        },
        linkedId: {
          type: 'string',
          description: 'ID of the entity to list linked designs for (requires linkedType)',
        },
        includeLinks: {
          type: 'boolean',
          description: 'If true (single lookup), also return the design\'s linked artifacts',
        },
        // --- List filters (linkedType mode) ---
        projectId: {
          type: 'string',
          description: 'Filter to a single project\'s designs',
        },
        kind: {
          type: 'string',
          enum: ['theme', 'component', 'page'],
          description: 'Filter by design kind',
        },
        status: {
          type: 'string',
          enum: ['draft', 'active', 'deprecated'],
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
        },
      },
    },
  },
  {
    name: 'list_designs',
    description: 'List an organization\'s Designs, optionally filtered by project, kind, or status. ' +
      'Returns the design artifacts (theme/component/page) in the living design system.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        projectId: {
          type: 'string',
          description: 'Filter to a single project\'s designs',
        },
        kind: {
          type: 'string',
          enum: ['theme', 'component', 'page'],
          description: 'Filter by design kind',
        },
        status: {
          type: 'string',
          enum: ['draft', 'active', 'deprecated'],
          description: 'Filter by status',
        },
        includeOrgWide: {
          type: 'boolean',
          description: 'When filtering by projectId, also include org-wide (project-less) designs',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
        },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'get_design_system',
    description: 'ALWAYS CALL THIS FIRST before authoring or designing any new UI, page, or component. ' +
      'Returns the established house style — the design system\'s theme plus its component designs ' +
      '(Tailwind-classed HTML/CSS) — for the given org/project. Read it to learn the existing visual ' +
      'language so any new designs you create match the established style instead of inventing a new one.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        projectId: {
          type: 'string',
          description: 'Scope the design system to a project (optional; org-wide if omitted)',
        },
      },
      required: ['organizationId'],
    },
  },
];
