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
      'learn the established house style. To change an existing design, send `edits` ' +
      '(find-and-replace) rather than the whole html/css, plus expectedUpdatedAt. Create and ' +
      'update return the design\'s summary and new updatedAt, not its markup.',
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
        fromFiles: {
          type: 'boolean',
          description: 'Push the design\'s local files (update): the html, css and description that ' +
            'get_design wrote to .ezmodo/designs/<slug>/ and you edited there. Only edited fields are ' +
            'sent, conditional on the version you downloaded. Do not also send html/css/description/' +
            'edits. On a conflict the files are refreshed to the current version and yours are kept ' +
            'beside them as *.mine.*. Local checkouts only.',
        },
        edits: {
          type: 'array',
          maxItems: 50,
          description: 'Change html, css or description by find-and-replace instead of resending the ' +
            'whole field (update). Prefer this for any change smaller than a rewrite. Applied in ' +
            'order; each oldString must occur exactly once (copy it exactly, whitespace included, and ' +
            'add surrounding text if it is not unique). If any edit fails, nothing is written.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', enum: ['html', 'css', 'description'] },
              oldString: { type: 'string', description: 'Exact text to replace; must match once' },
              newString: { type: 'string', description: 'Replacement text' },
            },
            required: ['field', 'oldString', 'newString'],
          },
        },
        expectedUpdatedAt: {
          type: 'string',
          description: 'The updatedAt you read the design at, copied exactly (update). When set, ' +
            'the update is refused with a 409 if the design changed since, instead of silently ' +
            'overwriting someone else\'s edit. On a 409, fetch it again, reapply your change and ' +
            'retry with the new updatedAt. Always send it when updating a design you read earlier.',
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
    description: 'Retrieve Designs in full (html, css, description). Pass designId for one, designIds ' +
      'for up to 10 in one call (e.g. the components you picked from get_design_system\'s index), ' +
      'or linkedType + linkedId to list the designs linked to an entity such as a feature (summaries ' +
      'unless includeContent is true). In a local checkout the content is WRITTEN to ' +
      '.ezmodo/designs/<slug>/ (index.html, styles.css, notes.md) and the response gives the paths ' +
      'instead: read the files you need, edit them, and push with manage_design update fromFiles:true. ' +
      'Elsewhere (or with inline:true) it is returned inline; then keep the updatedAt of any design ' +
      'you intend to change and send it as expectedUpdatedAt.',
    inputSchema: {
      type: 'object',
      properties: {
        designId: {
          type: 'string',
          description: 'Design ID for a single lookup',
        },
        designIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: 'Up to 10 design IDs to fetch in full in one call',
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
        inline: {
          type: 'boolean',
          description: 'Return the content in the response instead of writing local files ' +
            '(designId / designIds). Default false.',
        },
        overwriteLocal: {
          type: 'boolean',
          description: 'Replace local files that hold edits never pushed (designId / designIds). ' +
            'Default false: such files are left alone and the response says so.',
        },
        includeContent: {
          type: 'boolean',
          description: 'linkedType mode: return full html/css/description instead of summaries ' +
            '(default false). Prefer fetching the few you need by designIds.',
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
      'Returns one summary row per design (id, name, kind, status, summary, size, updatedAt), not ' +
      'its markup: fetch the ones you need with get_design designIds.',
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
        includeContent: {
          type: 'boolean',
          description: 'Return full html/css/description for every design instead of summaries ' +
            '(default false). This can be very large; prefer get_design designIds.',
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
    description: 'Call this before authoring or designing any new UI, page, or component. Returns ' +
      'the house style as an INDEX: the chosen theme with its CSS tokens, plus one short row per ' +
      'component and other theme (id, name, status, summary, size, updatedAt). Drafts are included ' +
      'and labelled; deprecated designs are left out. It does not include component markup: pick the ' +
      'components relevant to what you are building and fetch them with get_design designIds. Pass ' +
      'projectId, or you get every project\'s designs and a theme that may belong to another project.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        projectId: {
          type: 'string',
          description: 'Scope the design system to a project: its own designs plus org-wide ones. ' +
            'Recommended; omitting it spans every project in the org.',
        },
      },
      required: ['organizationId'],
    },
  },
];
