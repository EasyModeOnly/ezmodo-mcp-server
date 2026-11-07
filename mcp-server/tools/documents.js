/**
 * Documentation Tools
 * MCP tools for managing project documentation, versions, and templates
 */

import { LINKS_ARRAY_SCHEMA, RELATED_ITEM_SCHEMA } from './link-params.js';

export const DOCUMENT_TOOLS = [
  {
    name: 'manage_document',
    description: 'Create or update documents. ' +
      'Provide markdown `content` — it is converted to the unified document body (E-192) automatically. ' +
      'To CHANGE an existing document, prefer `edits` (find-and-replace on the markdown get_document ' +
      'returns) or, in a checkout, edit the .ezmodo/docs file and send fromFile:true, plus ' +
      'expectedUpdatedAt: only the parts you change are rewritten, comments on the rest stay attached, ' +
      'and a save someone made since you read the document is not overwritten (409). Sending `content` ' +
      'on update replaces the whole body. ' +
      'To embed a diagram document, put its id in a ```diagram-ref fence (one id, nothing else); ' +
      'get_document returns embeds in that form, so they survive a get → edit → update. ' +
      '(The legacy section model is gone — `sections` and the section ops were removed; sending them is an error.) ' +
      'action:"restore" with documentId + historyEntryId makes an older version current again; find the entry ' +
      'with get_document includeHistory:true and check it with diffFrom first.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'restore'],
          description: 'Action to perform. "restore" makes a history entry the current version ' +
            '(documentId + historyEntryId).',
        },
        // --- Identifiers ---
        projectId: {
          type: 'string',
          description: 'Project ID. Provide for a PROJECT-SCOPED document. ' +
            'Mutually exclusive with organizationId — supply exactly one when creating.',
        },
        organizationId: {
          type: 'string',
          description: 'Org scope — provide organizationId with NO projectId to create an ' +
            'ORG-SCOPED (project-less) document. Exactly one of projectId or organizationId. ' +
            'Org-scoped docs live in the org\'s document areas (Goals, Features, ADRs, How it ' +
            'works — see get_org_areas / list_org_documents); leaving folderId empty for an ' +
            '"adr" or "how-it-works" type auto-files the doc into the matching reserved area. (E-195)',
        },
        documentId: {
          type: 'string',
          description: 'Document ID (required for update, restore)',
        },
        historyEntryId: {
          type: 'string',
          description: 'The history entry to restore (restore). Ids come from get_document includeHistory:true.',
        },
        // --- Create / Update fields ---
        title: {
          type: 'string',
          description: 'Document title (required for create, optional for update)',
        },
        content: {
          type: 'string',
          description: 'Document content in markdown format. Converted to the unified document body automatically. ' +
            'For a "diagram" document it is the diagram: mermaid source, bare or in a ```mermaid fence. (create, update)',
        },
        edits: {
          type: 'array',
          description: 'Targeted changes for update, applied in order, all or nothing (max 50). Each oldString ' +
            'must occur exactly once in the document\'s markdown as get_document returns it; include ' +
            'surrounding text when a phrase repeats. Not combined with content or fromFile, and not for ' +
            'diagram documents. (update)',
          items: {
            type: 'object',
            properties: {
              oldString: { type: 'string', description: 'Exact text to replace; must match once' },
              newString: { type: 'string', description: 'Replacement text ("" deletes)' },
            },
            required: ['oldString', 'newString'],
          },
        },
        expectedUpdatedAt: {
          type: 'string',
          description: 'The document\'s updatedAt when you read it. The update is refused with 409 if the ' +
            'document was saved since, instead of overwriting that save; read it again and reapply. ' +
            'fromFile sends the downloaded version automatically. (update)',
        },
        fromFile: {
          type: 'boolean',
          description: 'Push your edits to the .ezmodo/docs file get_document wrote: only the changed parts ' +
            'are sent, as edits, conditional on the version you downloaded. On a conflict the file is ' +
            'refreshed to the current version and yours is kept beside it as <name>.mine.md. (update)',
        },
        type: {
          type: 'string',
          enum: ['setup', 'api', 'architecture', 'troubleshooting', 'guide', 'diagram', 'description', 'adr', 'how-it-works', 'other'],
          description: 'Document type/category. Use "diagram" to create a project-scoped diagram ' +
            '(auto-placed in the Diagrams folder). Its content is mermaid source; content="excalidraw" or ' +
            '"sitemap" creates an empty diagram of that kind. Updating a diagram\'s content replaces its source. ' +
            'Embed it in other docs with a ```diagram-ref fence. Use "adr" for an Architecture ' +
            'Decision Record: an org-scoped "adr" document (pass organizationId, no projectId) with no folderId ' +
            'is auto-placed in the org\'s reserved "ADRs" area (E-195); seed structure from the "Architecture ' +
            'Decision Record" system template. Use "how-it-works" for a human-authored, ' +
            'cross-project overview: an org-scoped "how-it-works" doc with no folderId is auto-placed ' +
            'in the org\'s reserved "How it works" area (E-195), then relate it to the projects/epics/' +
            'features/components it describes via manage_link relates_to (distinct from the AI-generated ' +
            'how_it_works field on entities). The "description" type is ' +
            'system-managed (E-189): it marks a document that backs an entity\'s description and is ' +
            'normally created automatically when a description is promoted to a rich document — editing ' +
            'such a document re-syncs the linked entity\'s plain-text excerpt. (create, update)',
          default: 'guide',
        },
        publicAccess: {
          type: 'boolean',
          description: 'Whether publicly accessible (default: true) (create, update)',
          default: true,
        },
        folderId: {
          type: 'string',
          description: 'Folder ID to organize the document (create, update)',
        },
        isIndex: {
          type: 'boolean',
          description: 'Make this the index/landing page for its folder or project root. Only one index per location. (create, update)',
        },
        order: {
          type: 'number',
          description: 'Sort order within folder (lower = higher in list). Auto-assigned if omitted on create. (create, update)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorizing and searching (create, update)',
        },
        relatedTaskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of related tasks (create, update)',
        },
        summary: {
          type: 'string',
          description: 'AI-generated summary of the document content (create, update)',
        },
        keyPoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'AI-generated key points from the document (create, update)',
        },
        aiContext: {
          type: 'object',
          description: 'Alternative to top-level summary/keyPoints. Nested object with summary, keyPoints, relatedTasks, relatedDocs. (create, update)',
          properties: {
            summary: { type: 'string' },
            keyPoints: { type: 'array', items: { type: 'string' } },
            relatedTasks: { type: 'array', items: { type: 'string' } },
            relatedDocs: { type: 'array', items: { type: 'string' } },
          },
        },
        links: LINKS_ARRAY_SCHEMA,
        addRelatedItem: {
          ...RELATED_ITEM_SCHEMA,
          description: 'DEPRECATED — use manage_link (or `links` on create). Add a ' +
            'cross-entity related item link (update only). Still works.',
        },
        removeRelatedItem: {
          ...RELATED_ITEM_SCHEMA,
          description: 'DEPRECATED — use manage_link. Remove a cross-entity related ' +
            'item link (update only). Still works.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_org_documents',
    description: 'List an organization\'s ORG-SCOPED (project-less) documents (E-195). ' +
      'These are documents created with organizationId and no projectId — e.g. cross-project ' +
      'ADRs and "how it works" overviews living in the org\'s reserved document areas ' +
      '(Goals, Features, ADRs, How it works; see get_org_areas). ' +
      'Optionally filter to a single area/folder via folderId.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        folderId: {
          type: 'string',
          description: 'Optional area/folder ID to scope the list to. Omit to list all of ' +
            'the org\'s project-less documents.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of documents to return (default 50, max 100)',
        },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'manage_document_template',
    description: 'Create or delete custom document templates. Templates provide pre-built ' +
      'document structures for common use cases.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'delete'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        templateId: {
          type: 'string',
          description: 'Template ID (required for delete)',
        },
        // --- Create fields ---
        name: {
          type: 'string',
          description: 'Template name (required for create)',
        },
        description: {
          type: 'string',
          description: 'Brief description of what this template is for (create only)',
        },
        content: {
          type: 'string',
          description: 'Template content in markdown format. Use {{PLACEHOLDER}} for variable parts. (required for create)',
        },
        category: {
          type: 'string',
          enum: ['api', 'architecture', 'guide', 'troubleshooting', 'setup', 'other'],
          description: 'Template category (create only)',
          default: 'other',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for categorizing the template (create only)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_document',
    description: 'Retrieve a single document, or list all docs for a project. ' +
      'Provide documentId (or projectId + slug) for single lookup. ' +
      'Provide just projectId to list all docs. ' +
      'Single-doc content is saved to .ezmodo/docs/ and returns a file path; edit that file and push it ' +
      'with manage_document update fromFile:true. A re-download never overwrites edits you have not pushed ' +
      '(overwriteLocal:true discards them). ' +
      'History (single lookup): includeHistory lists versions, newest first, without their bodies; ' +
      'historyEntryId reads one version; diffFrom (+ diffTo, omitted = current) compares two versions ' +
      'as line hunks rather than two full bodies. Prefer a diff to reading two versions.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: {
          type: 'string',
          description: 'Document ID for single lookup',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for list mode, or used with slug for single lookup)',
        },
        slug: {
          type: 'string',
          description: 'Document slug for single lookup (requires projectId)',
        },
        overwriteLocal: {
          type: 'boolean',
          description: 'Overwrite the .ezmodo/docs file even if it has edits that were never pushed (single lookup)',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'body'],
          description: 'Output format. "markdown" (default) renders the document body as markdown. "body" returns the raw ProseMirror JSON body (for editor clients).',
          default: 'markdown',
        },
        // --- List mode filters ---
        docType: {
          type: 'string',
          enum: ['setup', 'api', 'architecture', 'troubleshooting', 'guide', 'diagram', 'process', 'context', 'other'],
          description: 'Filter by document type (list mode only)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (list mode only)',
        },
        status: {
          type: 'string',
          enum: ['draft', 'in_review', 'published', 'archived'],
          description: 'Filter by document status (list mode only)',
        },
        // --- History fields (E-300) ---
        includeHistory: {
          type: 'boolean',
          description: 'List the document\'s version history, newest first, without bodies (single lookup only)',
        },
        includeVersions: {
          type: 'boolean',
          description: 'Alias of includeHistory, kept for older callers',
        },
        historyEntryId: {
          type: 'string',
          description: 'Read one version: a history entry id from includeHistory (single lookup only)',
        },
        diffFrom: {
          type: 'string',
          description: 'Diff from this history entry id (single lookup only). Returns changed fields and ' +
            'the content as line hunks.',
        },
        diffTo: {
          type: 'string',
          description: 'Diff to this history entry id. Omit to diff against the current version. Needs diffFrom.',
        },
        versionNumber: {
          type: 'number',
          description: 'DEPRECATED, use historyEntryId. Versions have ids, not numbers: N reads the N-th ' +
            'newest history entry (1 = newest). Kept for backwards compatibility (single lookup only).',
        },
        historyLimit: {
          type: 'number',
          description: 'Maximum number of history entries to list with includeHistory',
        },
        versionLimit: {
          type: 'number',
          description: 'Alias of historyLimit, kept for older callers',
        },
      },
    },
  },
  {
    name: 'get_document_template',
    description: 'Retrieve a single template by ID, or list all templates. ' +
      'Provide templateId for single lookup, or omit to list all.',
    inputSchema: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: 'Template ID for single lookup',
        },
        // --- List filters ---
        category: {
          type: 'string',
          enum: ['api', 'architecture', 'guide', 'troubleshooting', 'setup', 'other'],
          description: 'Filter templates by category (list mode only)',
        },
        type: {
          type: 'string',
          enum: ['system', 'custom'],
          description: 'Filter by template type: system (built-in) or custom (user-created) (list mode only)',
        },
      },
    },
  },
];
