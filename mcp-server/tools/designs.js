/**
 * Design Tools
 * MCP tools for Designs (the in-product living design system).
 *
 * A Design is an AI-authored HTML/CSS artifact that captures the product's house
 * style. kind ∈ theme|component|page. A design belongs to a project (E-326); what
 * a workspace shares lives in its shared-library project, which every project
 * sees. Designs LINK to features and other artifacts via the generic link graph —
 * they do not contain them.
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
      'existing artifacts. A design belongs to a project; designs every project should use (the ' +
      'house theme, shared components) go in the workspace\'s shared-library project. Designs LINK ' +
      'to features/epics/tasks/milestones/etc., they do not contain them. Before authoring a new design, call get_design_system first to ' +
      'learn the established house style. To change an existing design, send `edits` ' +
      '(find-and-replace) rather than the whole html/css, plus expectedUpdatedAt. Create and ' +
      'update return the design\'s summary and new updatedAt, not its markup. action:"restore" makes ' +
      'an older version current again (designId + historyEntryId + expectedUpdatedAt); find it with ' +
      'get_design includeHistory:true and check it with diffFrom first. action:"paths" sets the code ' +
      'paths a THEME owns (designId + paths + pathsMode), so a project can have several themes: ' +
      'get_design_system picks the one owning the longest prefix of the file being written.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'link', 'unlink', 'restore', 'paths'],
          description: 'Action to perform. "link"/"unlink" attach/detach the design to an artifact ' +
            '(pass designId + targetType + targetId). "restore" makes a history entry the current ' +
            'version (designId + historyEntryId + expectedUpdatedAt). "paths" adds, removes or ' +
            'replaces the repo-relative files/folders a theme owns (designId + paths + pathsMode); ' +
            'a theme with no paths is its project\'s default. Only themes own paths; a component ' +
            'belongs to the theme above it (parentDesignId).',
        },
        // --- Identifiers ---
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create)',
        },
        designId: {
          type: 'string',
          description: 'Design ID (required for update, delete, link, unlink, restore, paths)',
        },
        historyEntryId: {
          type: 'string',
          description: 'The history entry to restore (required for restore). Ids come from get_design ' +
            'includeHistory:true.',
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
          description: 'The project the design belongs to (create, update). On create, omitted = ' +
            'this checkout\'s project, else the workspace\'s shared library; with neither the ' +
            'create is refused. Cannot be cleared: there are no org-wide designs.',
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
          description: 'The updatedAt you read the design at, copied exactly (update; required for ' +
            'restore). When set, the update is refused with a 409 if the design changed since, instead ' +
            'of silently overwriting someone else\'s edit. On a 409, fetch it again, reapply your change ' +
            'and retry with the new updatedAt. Always send it when updating a design you read earlier.',
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
        // --- paths fields (E-328) ---
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative files or folders the theme owns (required for paths), e.g. ' +
            '["web/src/components/marketing/", "mobile/"]. Normalized like feature paths. Two active ' +
            'themes in one project cannot own the same path: the call is refused naming the theme ' +
            'that has it.',
        },
        pathsMode: {
          type: 'string',
          enum: ['add', 'remove', 'replace'],
          description: 'How "paths" applies (default "add"). "replace" makes the list the theme\'s ' +
            'entire path set; an empty list clears it, making it a default.',
        },
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
      'you intend to change and send it as expectedUpdatedAt. History (designId): includeHistory lists ' +
      'versions, newest first, without markup; historyEntryId returns one past version inline and ' +
      'read-only (never written to the local files); diffFrom (+ diffTo, omitted = current) compares ' +
      'versions as line hunks for html, css and description. Prefer a diff to reading two versions.',
    inputSchema: {
      type: 'object',
      properties: {
        designId: {
          type: 'string',
          description: 'Design ID for a single lookup. A design slug also works when organizationId is given. ' +
            'The response carries webUrl: give that to the user rather than building a link yourself.',
        },
        designIds: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 10,
          description: 'Up to 10 design IDs to fetch in full in one call',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (optional; scopes a linkedType + linkedId lookup, and lets designId be a slug)',
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
        // --- History (designId, E-300) ---
        includeHistory: {
          type: 'boolean',
          description: 'Also list the design\'s version history, newest first, without markup (designId)',
        },
        historyLimit: {
          type: 'number',
          description: 'Maximum number of history entries to list with includeHistory',
        },
        historyBefore: {
          type: 'string',
          description: 'includeHistory paging: list entries changed before this time. Pass the ' +
            'historyNextBefore value from the previous page (given when historyHasMore is true).',
        },
        historyEntryId: {
          type: 'string',
          description: 'Return one past version inline (designId): a history entry id from includeHistory',
        },
        diffFrom: {
          type: 'string',
          description: 'Diff from this history entry id (designId). Returns changed fields and html, css ' +
            'and description as line hunks.',
        },
        diffTo: {
          type: 'string',
          description: 'Diff to this history entry id. Omit to diff against the current version. Needs diffFrom.',
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
    description: 'List an organization\'s Designs, optionally filtered by project, kind, status, theme ' +
      'surface, source or a search. Returns one summary row per design (id, name, kind, status, summary, ' +
      'size, updatedAt), not its markup: fetch the ones you need with get_design designIds. Paged: the ' +
      'answer carries total, hasMore and deprecatedCount; pass offset to read further.',
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
          description: 'When filtering by projectId, also include the designs that project sees from ' +
            'the workspace\'s shared library',
        },
        includeContent: {
          type: 'boolean',
          description: 'Return full html/css/description for every design instead of summaries ' +
            '(default false). This can be very large; prefer get_design designIds.',
        },
        statuses: {
          type: 'array',
          items: { type: 'string', enum: ['draft', 'active', 'deprecated'] },
          description: 'Keep designs in any of these statuses, e.g. ["active", "draft"] (instead of status)',
        },
        search: {
          type: 'string',
          description: 'Case-insensitive substring of the name, slug or description',
        },
        theme: {
          type: 'string',
          description: 'Theme surface: a theme design id (that theme and the designs whose parent chain reaches it ' +
            'first), or "any" for designs under no theme',
        },
        source: {
          type: 'string',
          enum: ['project', 'library'],
          description: 'With projectId: only the project\'s own designs, or only the shared library\'s',
        },
        sortBy: {
          type: 'string',
          enum: ['name', 'kind', 'status', 'createdAt', 'updatedAt'],
          description: 'Sort field (default createdAt, newest first)',
        },
        sortDir: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction',
        },
        limit: {
          type: 'number',
          description: 'Page size (default 200, max 500)',
        },
        offset: {
          type: 'number',
          description: 'Rows to skip, for the next page',
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
      'components relevant to what you are building and fetch them with get_design designIds. A ' +
      'project can have several themes, each owning code paths: pass `path`, the file you are about ' +
      'to write, and you get the theme that owns it (themeReason says why) with its components ' +
      'first, then components for any surface; other themes\' components come last under ' +
      'otherSurfaces. Scoped ' +
      'to a project (its own designs plus the shared library\'s): projectId, defaulting to this ' +
      'checkout\'s project. Unscoped (remote, no projectId) you get every project\'s designs and a ' +
      'theme that may belong to another project.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        projectId: {
          type: 'string',
          description: 'Scope the design system to a project: its own designs plus the shared ' +
            'library\'s. Defaults to this checkout\'s project; with none, it spans every project.',
        },
        path: {
          type: 'string',
          description: 'The repo-relative file you are about to write, e.g. ' +
            '"web/src/components/marketing/pricing-hero.tsx". Picks the theme owning its longest ' +
            'prefix, else the project default. Pass it: it is the precise answer. Omitted in a local ' +
            'checkout of this project, your working directory relative to the repo root is used.',
        },
      },
      required: ['organizationId'],
    },
  },
];
