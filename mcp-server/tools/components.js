/**
 * Component Tools
 * MCP tools for the unified UI inventory (E-168).
 *
 * NAMING (E-107): a project's type renames the `area` kind only — a marketing
 * project calls an area a "Channel", a sales project a "Segment". The screen,
 * page and component kinds keep their literal names, because "Channel: screen"
 * is nonsense. Read the word from `get_current_project_context().terminology`.
 *
 * A Component is ONE concept that spans four kinds:
 *   - area      — coarse codebase module / domain (api, web, mcp-server); the
 *                 legacy meaning. The task component-picker uses kind=area.
 *   - screen    — a mobile / Flutter screen
 *   - page      — a web route / page
 *   - component — a reusable UI component
 * There is NO separate "UI surface" entity — surfaces ARE components. Components
 * self-nest via parentComponentId (e.g. web → Sprint Board → TaskCard) and carry
 * sourcePath / route / framework. They can be discovered from the Context
 * Manifest and bulk-imported.
 */

import { LINKS_ARRAY_SCHEMA } from './link-params.js';

export const COMPONENT_TOOLS = [
  {
    name: 'manage_component',
    description: 'Create, update, delete components, manage component dependencies and screen ' +
      'navigation edges, or discover/import ' +
      'UI surfaces. A Component is the unified UI inventory entry — ONE concept spanning kinds ' +
      'area|screen|page|component (there is no separate "UI surface" entity). "area" is the legacy ' +
      'coarse codebase module (api, web, mobile) and is what the task component-picker uses; ' +
      '"screen"/"page"/"component" describe mobile screens, web pages, and reusable UI components. ' +
      'Components self-nest via parentComponentId and carry sourcePath/route/framework. ' +
      '"discover" proposes page/component surfaces from the Context Manifest not yet in the inventory; ' +
      '"import" bulk-creates surfaces (optionally nested under a parent and/or linked to a feature).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'add_dependency', 'remove_dependency',
            'add_navigation', 'remove_navigation', 'derive_navigation', 'discover', 'import'],
          description: 'Action to perform. "discover" (pass projectId) returns candidate UI surfaces ' +
            'from the Context Manifest not yet in the inventory. "import" (pass projectId + surfaces, ' +
            'optionally parentComponentId + featureId) bulk-creates components from surfaces. ' +
            '"add_navigation"/"remove_navigation" (pass projectId + sourceComponentId + ' +
            'targetComponentId) manage screen\u2192screen navigation edges for the screen-flow map ' +
            '(E-223) \u2014 a DIFFERENT relation from add_dependency: navigation is "you can get ' +
            'there from here" and only valid between screens/pages, whereas a dependency is a code ' +
            'relationship. Read the current flow with list_components include:["navigation"]. ' +
            '"derive_navigation" (pass projectId) syncs the project\'s screens catalog with the synced ' +
            'manifest and RE-DERIVES the whole flow map, which now lives on the screens catalog ' +
            '(E-258; the response has screens, navigation and the legacy components result), from the synced ' +
            'Context Manifest \u2014 prefer it to drawing edges by hand, because a derived map stays ' +
            'true for free while an asserted one decays from the moment it is written (E-239). It is ' +
            'idempotent and cannot delete a human\u2019s edge: it reconciles only edges still at ' +
            'origin auto/inferred under its own rules, reporting the rest as `spared`. Check the ' +
            '`unresolved` list in the response \u2014 references no component matched mean the ' +
            'inventory is missing a screen, not that the code has no navigation.',
        },
        // --- Identifiers ---
        projectId: {
          type: 'string',
          description: 'Project ID (required for create, delete, add_dependency, remove_dependency)',
        },
        componentId: {
          type: 'string',
          description: 'Component ID (required for update, delete, add_dependency, remove_dependency)',
        },
        componentSlug: {
          type: 'string',
          description: 'URL-friendly slug of the component (alternative to componentId for update, delete, add_dependency, remove_dependency)',
        },
        // --- Create / Update fields ---
        name: {
          type: 'string',
          description: 'Component name (required for create, e.g., "api", "web", "mcp-server", "functions")',
        },
        description: {
          type: 'string',
          description: 'Description of what this component covers (create, update). ' +
            'Writing this stays plain text; it does not create a backing document.',
        },
        color: {
          type: 'string',
          description: 'Hex color for UI display (e.g., "#3B82F6"). Defaults to blue if not provided. (create, update)',
        },
        icon: {
          type: 'string',
          description: 'Icon name for the component (create, update)',
        },
        // --- Unified UI-inventory fields (E-168) (create, update) ---
        kind: {
          type: 'string',
          enum: ['area', 'screen', 'page', 'component'],
          description: 'Kind of inventory entry (default "area"). "area" = coarse codebase module ' +
            '(api/web/mobile — the legacy meaning, used by the task component-picker); "screen" = ' +
            'mobile/Flutter screen; "page" = web route/page; "component" = reusable UI component. ' +
            '(create, update)',
        },
        parentComponentId: {
          type: 'string',
          description: 'Parent component ID for self-nesting (e.g. web → Sprint Board → TaskCard). ' +
            'On update, pass an empty string to clear it (make top-level). (create, update)',
        },
        sourcePath: {
          type: 'string',
          description: 'Repo file/dir path this surface maps to (create, update)',
        },
        route: {
          type: 'string',
          description: 'Route this surface serves, for page/screen kinds (create, update)',
        },
        framework: {
          type: 'string',
          description: 'Framework, e.g. "nextjs", "flutter", "react" (create, update)',
        },
        // --- import fields ---
        featureId: {
          type: 'string',
          description: 'Optionally link every imported component to this feature (import only)',
        },
        surfaces: {
          type: 'array',
          description: 'UI surfaces to import as components (required for import)',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['area', 'screen', 'page', 'component'],
                description: 'Kind of surface',
              },
              name: { type: 'string', description: 'Surface / component name' },
              sourcePath: { type: 'string', description: 'Repo file/dir path it maps to' },
              route: { type: 'string', description: 'Route it serves (page/screen kinds)' },
              framework: { type: 'string', description: 'Framework (nextjs, flutter, react, ...)' },
              links: LINKS_ARRAY_SCHEMA,
            },
            required: ['kind', 'name'],
          },
        },
        links: LINKS_ARRAY_SCHEMA,
        // --- Create-only fields ---
        ownerId: {
          type: 'string',
          description: 'Owner user ID — who maintains this component (create only)',
        },
        ownerName: {
          type: 'string',
          description: 'Display name of the owner (required if ownerId is set, create only)',
        },
        teamId: {
          type: 'string',
          description: 'Team ID — which team is responsible (create, update)',
        },
        // --- Update-only fields ---
        order: {
          type: 'number',
          description: 'Display order, lower = first (update only)',
        },
        owner: {
          type: 'object',
          description: 'Component owner object (set to null to clear). Object with id and name fields. (update only)',
          properties: {
            id: { type: 'string', description: 'Owner user ID' },
            name: { type: 'string', description: 'Owner display name' },
          },
          nullable: true,
        },
        // --- Dependency fields (add_dependency, remove_dependency) ---
        targetComponentId: {
          type: 'string',
          description: 'The other end of the edge. For add_dependency/remove_dependency: the ' +
            'component depended on. For add_navigation/remove_navigation: the screen navigated TO ' +
            '(must be kind screen or page).',
        },
        type: {
          type: 'string',
          enum: ['depends_on', 'blocks'],
          description: 'Dependency type: "depends_on" (source needs target) or "blocks" ' +
            '(source blocks target). Required for add_dependency. Cycles are ALLOWED \u2014 code ' +
            'imports are legitimately mutual \u2014 but a dependency that closes one comes back with ' +
            'a `warning` and the `cyclePath` naming the loop. Re-adding an existing dependency is ' +
            'an idempotent no-op that returns `alreadyExisted: true`.',
        },
        // --- Navigation fields (add_navigation, remove_navigation) — E-223 ---
        sourceComponentId: {
          type: 'string',
          description: 'Screen the user navigates FROM (required for add_navigation/remove_navigation, ' +
            'unless sourceComponentSlug is given). Must be kind screen or page.',
        },
        sourceComponentSlug: {
          type: 'string',
          description: 'Slug alternative to sourceComponentId (add_navigation, remove_navigation)',
        },
        targetComponentSlug: {
          type: 'string',
          description: 'Slug alternative to targetComponentId (add_navigation, remove_navigation)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_components',
    description: 'List components in a project, optionally with stats, dependency graph, or navigation data. ' +
      'Provide componentId (or componentSlug) to get data for a single component — the response is the ' +
      'same shape as a list, with `components` holding just that one; an identifier that matches nothing ' +
      'is an error, never the full inventory. ' +
      'Responses include `descriptionDocumentId` — the id of the backing rich-description Document ' +
      'when the description has been promoted to one (E-189), otherwise omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID (required)',
        },
        componentId: {
          type: 'string',
          description: 'Optional component ID — narrows the listing to that one component',
        },
        componentSlug: {
          type: 'string',
          description: 'Optional component slug (alternative to componentId; the slug wins if both are given)',
        },
        kind: {
          type: 'string',
          enum: ['area', 'screen', 'page', 'component'],
          description: 'Optional filter — only return components of this kind. Use kind="area" for ' +
            'the coarse codebase modules the task component-picker uses.',
        },
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['stats', 'dependency_graph', 'navigation'],
          },
          description: 'Optional additional data to include: stats (task counts), dependency_graph ' +
            '(all dependencies; honours the kind filter), ' +
            'navigation (screen\u2192screen navigates_to edges for the screen-flow map, E-223). ' +
            'Note: "timeline" is NOT available \u2014 component timeline data is not computed by the ' +
            'API (nothing populates it, so it read back as all zeros on every path). Use ' +
            '"stats" for task counts.',
        },
      },
      required: ['projectId'],
    },
  },
];
