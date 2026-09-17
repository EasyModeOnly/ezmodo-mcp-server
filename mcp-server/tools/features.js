/**
 * Feature Tools
 * MCP tools for the Feature Compendium (E-162).
 *
 * A Feature is a durable, user-facing product CAPABILITY — a NOUN, on a
 * separate axis from work. Epics/tasks are VERBS (work); features LINK to work,
 * they do not own it. Features are ORG-LEVEL, and a feature SPANS MULTIPLE
 * PROJECTS (E-242) — a real capability like "Push notifications" lives in api +
 * web + mobile at once:
 *  - projectIds []    → every project the capability spans; the FIRST is the
 *                       primary/owner. An empty set = cross-project / org-wide,
 *                       which is in scope for every project.
 *  - projectId        → DEPRECATED single-project form, treated as a
 *                       one-element projectIds. Still accepted everywhere.
 *  - parent_feature_id builds a sub-feature tree.
 *
 * The "is this a feature?" test: would a PM/user call it "a feature of the app"?
 * (push notifications = yes; "refactor auth middleware" = no, that's an epic).
 * Discipline: features track the product-capability map, NOT every change — do
 * not create a feature per task.
 */

import { LINKABLE_TYPES } from './linkable-types.js';

export const FEATURE_TOOLS = [
  {
    name: 'manage_feature',
    description: 'Create, update, or delete a Feature (a durable product capability), or link/unlink it ' +
      'to existing work artifacts. Features are org-level and live on a separate axis from work — they ' +
      'LINK to epics/tasks/milestones/etc., they do not contain them.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create', 'update', 'delete', 'link', 'unlink', 'paths',
            'promote_epic', 'generate_how_it_works', 'apply_how_it_works', 'apply_init',
          ],
          description: 'Action to perform. "paths" adds, removes or replaces the code paths the ' +
            'feature OWNS (featureId + paths + pathsMode) — work touching a file under an owned path ' +
            'auto-links to the feature. "promote_epic" creates a feature from an existing epic ' +
            '(inheriting its title/description/scope) and links the epic to it. ' +
            '"generate_how_it_works" (re)generates the feature\'s grounded, source-attributed ' +
            '"how it works" living description from its linked work + code (requires featureId; ' +
            'AI-quota gated). "apply_how_it_works" (BYO-AI) persists a summary YOU authored ' +
            '(markdown + sources); the server validates your cited sources against the real ' +
            'grounded context before saving — no server model call. Read the result back via ' +
            'get_feature with includeDetail. ' +
            '"apply_init" commits a human-approved init/backfill proposal (E-167): pass ' +
            'organizationId + nodes (a candidate-feature tree) to create features parents→children, ' +
            'backfill links, and persist any agent-authored "how it works". Inference itself runs ' +
            'locally with the user\'s AI — this only applies the approved result.',
        },
        // --- Identifiers ---
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create)',
        },
        featureId: {
          type: 'string',
          description: 'Feature ID (required for update, delete, link, unlink, generate_how_it_works, apply_how_it_works)',
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
            'real source refs from the feature\'s grounded context; the server drops fabricated ones.',
        },
        epicId: {
          type: 'string',
          description: 'Epic ID to promote into a feature (required for promote_epic)',
        },
        // --- Create / update fields ---
        title: {
          type: 'string',
          description: 'Feature title (required for create), e.g. "Push Notifications"',
        },
        description: {
          type: 'string',
          description: 'Feature description, supports markdown (create, update). ' +
            'Writing this stays plain text; it does not create a backing document.',
        },
        status: {
          type: 'string',
          enum: ['proposed', 'active', 'deprecated', 'removed'],
          description: 'Capability lifecycle status (default: "active") (create, update)',
        },
        projectId: {
          type: 'string',
          description: 'DEPRECATED single-project form — prefer projectIds. Treated as a ' +
            'one-element projectIds. Omit/empty = cross-project / org-wide; on update an empty ' +
            'string clears the scope back to org-wide.',
        },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Every project this capability spans (create, update). The FIRST id is ' +
            'the primary/owner. On UPDATE this REPLACES the whole set — pass the full list, not ' +
            'just additions — and an empty array makes the feature org-wide. Omitting it on an ' +
            'update leaves the existing projects alone. Wins over projectId.',
        },
        parentFeatureId: {
          type: 'string',
          description: 'Parent feature ID for the sub-feature tree. Omit/empty = root feature. ' +
            'On update, an empty string makes it a root.',
        },
        // --- link / unlink fields ---
        targetType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Type of artifact to link/unlink (required for link, unlink). ' +
            'test_suite surfaces read-only pass/fail coverage on the feature (E-173).',
        },
        targetId: {
          type: 'string',
          description: 'ID of the artifact to link/unlink (required for link, unlink)',
        },
        // --- paths fields (E-258) ---
        paths: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              projectId: {
                type: 'string',
                description: 'Project the path lives in. Must be one the feature spans ' +
                  '(any project in the org for an org-wide feature).',
              },
              sourcePath: {
                type: 'string',
                description: 'Repo-relative file or folder, e.g. "api/internal/core/features" or ' +
                  '"web/src/app/checkout/page.tsx". Matched by exact prefix, NOT glob.',
              },
            },
            required: ['projectId', 'sourcePath'],
          },
          description: 'Code paths for the "paths" action. A file resolves to the feature owning its ' +
            'LONGEST matching folder or the exact file. Own what is characteristic of the capability; ' +
            'leave shared plumbing (e.g. web/src/components/ui, api/internal/api/router.go) owned by no ' +
            'feature — a path owned by several features only ever produces suggestions.',
        },
        pathsMode: {
          type: 'string',
          enum: ['add', 'remove', 'replace'],
          description: 'How "paths" applies (default "add"). "replace" makes the list the feature\'s ' +
            'entire path set; an empty list clears it.',
        },
        // --- apply_init fields (E-167) ---
        nodes: {
          type: 'array',
          description: 'Approved candidate-feature tree to commit (required for apply_init). Each node: ' +
            '{ tempId, title, description?, status?, parentTempId?|parentFeatureId?, mergeIntoFeatureId?, ' +
            'projectId?, links?:[{targetType,targetId}], howItWorks?:{markdown, sources, validSources?} }. ' +
            'tempId lets nodes reference each other before creation; mergeIntoFeatureId picks the dedup path.',
          items: { type: 'object' },
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_feature',
    description: 'Retrieve a single Feature, list features for a project, view the feature tree, ' +
      'or list a feature\'s links. Provide featureId (or organizationId + featureSlug) for a single ' +
      'lookup; for list/tree provide organizationId AND a project scope (projectId, or ' +
      'projectIds for several at once) — an org can span several products, so list/tree is ' +
      'project-scoped (it still includes org-wide capabilities, i.e. features spanning no ' +
      'project). List mode is PAGINATED: the response carries total/hasMore alongside features, ' +
      'so use offset to page rather than assuming you got everything. ' +
      'Responses include `descriptionDocumentId` — the id of the backing rich-description Document ' +
      'when the description has been promoted to one (E-189), otherwise omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for list/tree, alongside projectId; ' +
            'with featureSlug for slug lookup)',
        },
        featureId: {
          type: 'string',
          description: 'Feature ID for a single lookup',
        },
        featureSlug: {
          type: 'string',
          description: 'Feature slug for a single lookup (requires organizationId)',
        },
        tree: {
          type: 'boolean',
          description: 'If true, return the nested feature forest instead of a flat list',
        },
        includeLinks: {
          type: 'boolean',
          description: 'If true (single lookup), also return the feature\'s linked artifacts',
        },
        includePaths: {
          type: 'boolean',
          description: 'If true (single lookup), also return the code paths the feature owns (E-258).',
        },
        includeDetail: {
          type: 'boolean',
          description: 'If true (single lookup), return the aggregated detail: linked artifacts ' +
            'hydrated + grouped by type + a progress rollup over linked epics/tasks, plus the ' +
            'generated "how it works" summary (howItWorks/howItWorksSources/generatedAt/model on ' +
            'the feature) and a coarse howItWorksStale flag. Supersedes includeLinks.',
        },
        // --- List/tree filters ---
        projectId: {
          type: 'string',
          description: 'Scope the listing to one project. Either this or projectIds is REQUIRED ' +
            'for list/tree mode. Returns features spanning that project PLUS org-wide ' +
            '(cross-project) ones. Ignored for a single lookup by featureId/featureSlug.',
        },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Scope the listing to several projects at once — satisfies the list/tree ' +
            'scope requirement in place of projectId. Use it when working across projects ' +
            '(e.g. api + web) to get one call instead of two. Wins over projectId.',
        },
        status: {
          type: 'string',
          enum: ['proposed', 'active', 'deprecated', 'removed'],
          description: 'Filter by status (list/tree mode)',
        },
        search: {
          type: 'string',
          description: 'Substring filter over title, description and slug (list mode). This is a ' +
            'literal text match — for "does this capability already exist?" use search_features, ' +
            'which ranks by meaning.',
        },
        sortBy: {
          type: 'string',
          enum: ['title', 'status', 'createdAt', 'updatedAt', 'howItWorksGeneratedAt'],
          description: 'Sort column (list mode, default "title"). An unrecognised value is an error.',
        },
        sortDir: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (list mode, default "asc")',
        },
        limit: {
          type: 'number',
          description: 'Page size (list mode, default 25, max 500)',
        },
        offset: {
          type: 'number',
          description: 'Rows to skip (list mode, default 0). Page with this while hasMore is true.',
        },
      },
    },
  },
  {
    name: 'search_features',
    description: 'Semantic search over an organization\'s Features. Returns existing features ' +
      'ranked by meaning-similarity to a query — use this BEFORE creating a new feature to find ' +
      'an existing capability the work belongs to, so the compendium stays small and free of ' +
      'duplicates (capture-at-build, E-164). Each result is {feature, similarity}.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID to search within (required)',
        },
        query: {
          type: 'string',
          description: 'Natural-language description of the capability to find ' +
            '(e.g. "let users get notified about activity"). Required.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10)',
        },
      },
      required: ['organizationId', 'query'],
    },
  },
];
