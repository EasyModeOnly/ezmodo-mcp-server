/**
 * Catalog Tools (E-215)
 * MCP tools for org-level Catalogs — a generalized, code-derived catalog.
 * Generalizes the Database Schema entity (E-196): a versioned, checksum-gated
 * snapshot of a list that lives in code (kind = notifications | analytics_events
 * | db_schema | custom), with a GENERIC { columns, items } shape.
 *
 * Capture-at-build: when an agent changes a catalog's source of truth in code
 * (e.g. adds a notification type), it should call manage_catalog action:"snapshot"
 * with the source path/commit in `source`. Snapshots are checksum-gated
 * server-side, so re-snapshotting unchanged structure is a cheap no-op — the same
 * discipline as the DB Schema entity and the Feature Compendium (E-164/E-165).
 * This keeps the catalog from going stale.
 *
 * Snapshots come in two modes (E-226). mode:"patch" sends only upsertItems /
 * removeKeys and the server merges them onto the current version; mode:"replace"
 * (the default) carries the whole { columns, items }. Patch exists because a full
 * snapshot has to be GENERATED token by token — restating a 90+ table db_schema
 * catalog to change one table costs tens of minutes — so incremental capture
 * should always patch.
 *
 * Catalogs ride entity_links (relates_to) — link a catalog to the feature it maps,
 * the feature-flags that gate it, the epics/tasks that change it, and the EzModo
 * document that narrates it (use action:"link").
 */

import { LINKABLE_TYPES } from './linkable-types.js';

// Reusable JSON-schema fragment for one column definition in a snapshot. Columns
// are self-describing so any client can render the item table without knowing the
// kind.
const COLUMN_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string', description: 'Attribute key present on items, e.g. "trigger"' },
    label: { type: 'string', description: 'Human column header (optional)' },
    type: { type: 'string', description: 'Value type hint: "string" | "number" | "bool" | "code" (optional)' },
  },
  required: ['key'],
};

// Reusable JSON-schema fragment for one item (row) in a snapshot.
const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string', description: 'Stable identity of the item — used for diffing across versions' },
    group: { type: 'string', description: 'Optional section, e.g. "Product types" (optional)' },
    label: { type: 'string', description: 'Human label (optional)' },
    attributes: {
      type: 'object',
      description: 'Kind-specific fields keyed by a column key, e.g. { "trigger": "assignment", "channel": "push" }',
      additionalProperties: true,
    },
    sources: {
      type: 'array',
      items: { type: 'string' },
      description: 'Code references this item was derived from, e.g. ["api/internal/model/notification.go:36"] (optional)',
    },
  },
  required: ['key'],
};

// Reusable JSON-schema fragment for a snapshot's source (what produced it).
const SOURCE_SCHEMA = {
  type: 'object',
  description: 'What produced this snapshot — how the version links back to the codebase.',
  properties: {
    sourcePaths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Source file paths, e.g. ["api/internal/model/notification.go"]',
    },
    commitSha: { type: 'string', description: 'Commit sha the change landed in' },
    note: { type: 'string', description: 'Short human note about the change' },
  },
};

export const CATALOG_TOOLS = [
  {
    name: 'manage_catalog',
    description: 'Create, update, or delete an org-level Catalog, link/unlink it to other artifacts, ' +
      'or push a new versioned snapshot of its contents. A Catalog is a generalized, code-derived ' +
      'catalog (kind = notifications | analytics_events | db_schema | custom); its versions are ' +
      'immutable { columns, items } snapshots.\n\n' +
      'CAPTURE-AT-BUILD (important): whenever you change the catalog\'s source of truth in code, call ' +
      'action:"snapshot" and put the source path/commit in `source`. The server is checksum-gated — ' +
      're-snapshotting unchanged content creates no new version and is a cheap no-op — so it is safe ' +
      'to snapshot after every change. This keeps the catalog current as a side effect of building.\n\n' +
      'PREFER mode:"patch" (important for cost): send ONLY what changed, as `upsertItems` (entries to ' +
      'add or replace, matched by key) and `removeKeys` (entries to delete). The server merges them ' +
      'onto the current version. Writing out a full snapshot means emitting every entry as output ' +
      'tokens — on a large catalog (a db_schema with 90+ tables) that is tens of minutes of generation ' +
      'to change one entry. Read the current entries first with get_catalog (or list_catalog_items) to ' +
      'see which keys exist, then patch just those. Use mode:"replace" with a full `snapshot` only for ' +
      'the catalog\'s FIRST snapshot or a genuine full re-derivation.\n\n' +
      'NOTE for db_schema catalogs: if you have shell access, a live database and the ezmodo repo, ' +
      '`go run ./cmd/dbschema-snapshot -upload -catalog-id <id>` from api/ introspects and uploads the ' +
      'whole schema without passing it through the model at all — cheaper still than a patch.\n\n' +
      'LINK, DON\'T CONTAIN: use action:"link"/"unlink" to relate a catalog to a feature, feature_flag, ' +
      'epic, task, document, component, milestone, goal or project (e.g. link the notification catalog ' +
      'to its Notifications feature and the ezmodo doc that describes it).\n\n' +
      'ITEM-LEVEL LINKS (E-218): pass `itemKey` on action:"link"/"unlink" to attach the link to a SINGLE ' +
      'catalog entry instead of the whole catalog — this is how a task/epic that builds one entry records ' +
      'that relationship. With an itemKey, provide EITHER targetType+targetId (internal work link) OR ' +
      'url[+label] (an external URL, when the entry is handled in another system). Read entries and their ' +
      'links back with list_catalog_items.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'link', 'unlink', 'snapshot'],
          description: 'Action to perform. "snapshot" pushes a new version (checksum-gated) — send a ' +
            'delta with mode:"patch" unless this is the catalog\'s first snapshot. "link"/"unlink" ' +
            'manage relates_to edges to other artifacts.',
        },
        // --- Identifiers ---
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create)',
        },
        projectId: {
          type: 'string',
          description: 'Project ID to scope the catalog to. Omit for an org-wide catalog (create, update)',
        },
        catalogId: {
          type: 'string',
          description: 'Catalog ID (required for update, delete, link, unlink, snapshot)',
        },
        // --- Create / update fields ---
        kind: {
          type: 'string',
          enum: ['db_schema', 'notifications', 'analytics_events', 'custom'],
          description: 'What the catalog catalogs (default "custom") (create, update)',
        },
        name: {
          type: 'string',
          description: 'Catalog name, e.g. "Notifications" (required for create) (create, update)',
        },
        slug: {
          type: 'string',
          description: 'URL-friendly slug (derived from name when omitted) (create, update)',
        },
        description: {
          type: 'string',
          description: 'What this catalog is, supports markdown (create, update)',
        },
        parentCatalogId: {
          type: 'string',
          description: 'Parent catalog ID to nest under (optional) (create, update)',
        },
        status: {
          type: 'string',
          enum: ['draft', 'active', 'deprecated'],
          description: 'Lifecycle status (default "draft") (create, update)',
        },
        // --- Link / unlink fields ---
        targetType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Artifact type to link/unlink (link, unlink)',
        },
        targetId: {
          type: 'string',
          description: 'ID of the artifact to link/unlink (link, unlink)',
        },
        itemKey: {
          type: 'string',
          description: 'Attach the link to a SINGLE catalog entry with this stable key instead of the ' +
            'whole catalog (E-218). With itemKey, use targetType+targetId for an internal work link OR ' +
            'url[+label] for an external URL. (link, unlink)',
        },
        url: {
          type: 'string',
          description: 'External URL to link the entry to (an http(s) link in another system, e.g. a Stripe ' +
            'dashboard). Requires itemKey. Present url ⇒ external-link path instead of a work link. (link, unlink)',
        },
        label: {
          type: 'string',
          description: 'Optional human label for the external url link (link with itemKey + url)',
        },
        // --- Snapshot fields ---
        mode: {
          type: 'string',
          enum: ['replace', 'patch'],
          description: 'How to apply the snapshot payload (default "replace"). Use "patch" for ' +
            'incremental changes — send only upsertItems/removeKeys and the server merges them onto ' +
            'the current version. Use "replace" only for the FIRST snapshot of a catalog, or when ' +
            'you genuinely re-derived every item (e.g. a full introspection run). (snapshot)',
        },
        snapshot: {
          type: 'object',
          description: 'The full current contents of the catalog. Required in "replace" mode. In ' +
            '"patch" mode omit it, or send only `columns`/`meta` to update those — items sent here ' +
            'are ignored in patch mode (use upsertItems).',
          properties: {
            columns: {
              type: 'array',
              description: 'Self-describing column definitions for the item attributes.',
              items: COLUMN_SCHEMA,
            },
            items: {
              type: 'array',
              description: 'Every entry in the catalog.',
              items: ITEM_SCHEMA,
            },
          },
          required: ['items'],
        },
        upsertItems: {
          type: 'array',
          description: 'Patch mode only: entries to add or replace, matched by `key`. An entry whose ' +
            'key already exists is replaced WHOLESALE (send its complete attributes, not a partial); ' +
            'one whose key is new is appended. Entries you do not list are left untouched.',
          items: ITEM_SCHEMA,
        },
        removeKeys: {
          type: 'array',
          description: 'Patch mode only: item keys to delete from the catalog. Removing a key that is ' +
            'not present is a safe no-op. A key may not appear in both upsertItems and removeKeys.',
          items: { type: 'string' },
        },
        source: SOURCE_SCHEMA,
      },
      required: ['action'],
    },
  },
  {
    name: 'get_catalog',
    description: 'Retrieve a single Catalog and, by default, its CURRENT snapshot (the live { columns, ' +
      'items } you read to understand the catalog). Pass `version` to read a specific historical ' +
      'snapshot instead, `includeVersions` to also get the version history (metadata only), or ' +
      '`metadataOnly` to skip the snapshot blob.',
    inputSchema: {
      type: 'object',
      properties: {
        catalogId: {
          type: 'string',
          description: 'Catalog ID (required)',
        },
        version: {
          type: 'number',
          description: 'Return this specific version\'s full snapshot instead of the current one',
        },
        includeVersions: {
          type: 'boolean',
          description: 'Also include the list of version metadata (history), newest first',
        },
        versionsLimit: {
          type: 'number',
          description: 'Max number of versions to include when includeVersions is set',
        },
        metadataOnly: {
          type: 'boolean',
          description: 'Return just the catalog row without fetching any snapshot blob',
        },
      },
      required: ['catalogId'],
    },
  },
  {
    name: 'list_catalogs',
    description: 'List the Catalogs in an organization (optionally filtered by project or kind), or ' +
      'the catalogs linked to a given entity. Returns catalog metadata (name, kind, current version) ' +
      '— use get_catalog to read a catalog\'s snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        projectId: {
          type: 'string',
          description: 'Filter to a single project\'s catalogs',
        },
        kind: {
          type: 'string',
          enum: ['db_schema', 'notifications', 'analytics_events', 'custom'],
          description: 'Filter to a single kind',
        },
        linkedType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'With linkedId, return catalogs linked (relates_to) to this entity type, e.g. "feature"',
        },
        linkedId: {
          type: 'string',
          description: 'With linkedType, the entity ID whose linked catalogs to return',
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
    name: 'get_catalog_diff',
    description: 'Diff two versions of a Catalog — returns added/removed items (by key) and, for items ' +
      'present in both, the before/after of those that changed. Use it to see how the catalog evolved ' +
      'between two snapshots.',
    inputSchema: {
      type: 'object',
      properties: {
        catalogId: {
          type: 'string',
          description: 'Catalog ID (required)',
        },
        from: {
          type: 'number',
          description: 'The earlier version number to diff from (required)',
        },
        to: {
          type: 'number',
          description: 'The later version number to diff to (required)',
        },
      },
      required: ['catalogId', 'from', 'to'],
    },
  },
  {
    name: 'list_catalog_items',
    description: 'List a Catalog\'s ENTRIES that carry item-level links (E-218) — each returned with its ' +
      'work links and external URLs attached. Only entries with at least one link are returned (unlinked ' +
      'entries already live in the snapshot from get_catalog); links are compact {entityType,entityId} ' +
      'edges and urls are {url,label}, not expanded entities. Use it to see which catalog entries are ' +
      'wired to work or to other systems.',
    inputSchema: {
      type: 'object',
      properties: {
        catalogId: {
          type: 'string',
          description: 'Catalog ID (required)',
        },
      },
      required: ['catalogId'],
    },
  },
];
