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
      'with get_document includeHistory:true and check it with diffFrom first. ' +
      'Editing a PUBLISHED document makes it a draft and readers keep seeing the published copy: when your ' +
      'change is ready, action:"submit_for_review" (documentId, optional note for the reviewer) asks a person ' +
      'to approve and publish it; action:"withdraw_review" takes that back. Agents cannot publish. ' +
      'action:"add_image" uploads an image (PNG, JPEG, GIF or WebP, up to 10 MB; no SVG) and places it ' +
      'below the block holding an anchor: documentId, alt, one of filePath or base64+mimeType, and one of ' +
      'afterHeading, afterText or append:true. ' +
      'action:"import" brings Markdown in: projectId, optional folderId (default the project root), and ' +
      'one .md/.markdown file or a .zip of them, as filePath or base64+name. Each .md becomes a DRAFT ' +
      'document titled by its first "# Heading" (else its file name); folders in the zip become folders; ' +
      'a README.md or index.md becomes its folder\'s index page when the folder has none. Existing ' +
      'documents are never changed: a clashing title gets " (imported)". Relative links between imported ' +
      'files become document links, and local images (PNG, JPEG, GIF, WebP, SVG; up to 10 MB each) become ' +
      'document images. Anything not carried over (external or broken links, other files) is listed in ' +
      'notCarried. Call with dryRun:true first to see the plan without writing anything. ' +
      'action:"export" downloads documents as files: documentId (one document: format "md" gives a .md, or a ' +
      '.zip with an images/ folder when it has images; "pdf" gives a PDF), folderId (a folder: "md" gives a ' +
      '.zip of .md files with folders kept and links between them made relative, "pdf" one PDF with a ' +
      'contents page), or projectId alone (every document in the project). Only documents you can read are ' +
      'included, up to 500. In a checkout the file is written to .ezmodo/exports/ and its path returned; over ' +
      'the remote connector it comes back as base64, up to 5 MB.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'restore', 'submit_for_review', 'withdraw_review', 'add_image', 'import', 'export'],
          description: 'Action to perform. "restore" makes a history entry the current version ' +
            '(documentId + historyEntryId). "submit_for_review" asks a person to approve and publish the ' +
            'document (documentId, optional note); "withdraw_review" returns it to draft. "add_image" ' +
            'uploads an image and places it in the document (see filePath, base64, alt, afterHeading). ' +
            '"import" turns a .md/.markdown file or a .zip of them into draft documents and folders ' +
            '(projectId, filePath or base64+name, optional folderId and dryRun). ' +
            '"export" downloads a document, folder or the project root as Markdown or PDF (see format).',
        },
        // --- Identifiers ---
        projectId: {
          type: 'string',
          description: 'Project ID. Provide for a PROJECT-SCOPED document; required for import. ' +
            'Mutually exclusive with organizationId — supply exactly one when creating. For export, ' +
            'projectId alone (no documentId or folderId) exports the whole Documentation root.',
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
          description: 'Document ID (required for update, restore, add_image; the document to export)',
        },
        note: {
          type: 'string',
          description: 'A short note for the reviewer: what you changed and why (submit_for_review)',
        },
        historyEntryId: {
          type: 'string',
          description: 'The history entry to restore (restore). Ids come from get_document includeHistory:true.',
        },
        // --- export (E-305 #3458) ---
        format: {
          type: 'string',
          enum: ['md', 'pdf'],
          description: 'Required for export. "md": a .md for one document (a .zip with images/ when it has ' +
            'images), a .zip of .md files for a folder or the project root. "pdf": one PDF. (export)',
        },
        includeSubfolders: {
          type: 'boolean',
          description: 'Include the documents in subfolders (folder or project-root export; default true). (export)',
        },
        version: {
          type: 'string',
          enum: ['current', 'published'],
          description: '"current" (default) exports what is there now, drafts included; "published" exports ' +
            'each document\'s published copy and leaves out documents never published. (export)',
        },
        // --- add_image (#3449) and import (#3456) ---
        filePath: {
          type: 'string',
          description: 'A file in this checkout: relative to the project root (the directory holding ' +
            '.ezmodo) or absolute inside it. Symlinks and files outside the checkout are refused. Works ' +
            'only in a local checkout; over the remote connector send base64. For add_image, the image: ' +
            'PNG, JPEG, GIF or WebP, up to 10 MB; the extension must match the image. For import, a .md, ' +
            '.markdown or .zip file, up to 22 MB for import. (add_image, import)',
        },
        base64: {
          type: 'string',
          description: 'The file\'s bytes, base64-encoded (a data: URL prefix is allowed). Use instead of ' +
            'filePath, and always over the remote connector. For add_image, the image, with mimeType; for ' +
            'import, the .md/.markdown/.zip file, with name. (add_image, import)',
        },
        name: {
          type: 'string',
          description: 'The base64 file\'s name, e.g. "handbook.zip" or "guide.md"; required with base64. ' +
            'Its extension (.md, .markdown or .zip) says how the bytes are read. (import)',
        },
        dryRun: {
          type: 'boolean',
          description: 'true returns the plan (documents, folders, renames, links, notCarried) without ' +
            'writing anything. Recommended before a real import. (import)',
        },
        mimeType: {
          type: 'string',
          enum: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
          description: 'The base64 image\'s type; required with base64 and must match its bytes. (add_image)',
        },
        alt: {
          type: 'string',
          description: 'Required for add_image: alt text describing what the image shows, for readers who ' +
            'cannot see it (not a file name, not "image").',
        },
        caption: {
          type: 'string',
          description: 'Optional caption shown under the image. (add_image)',
        },
        afterHeading: {
          type: 'string',
          description: 'Place the image below this heading: its text without the leading #s, e.g. ' +
            '"Architecture". Must match exactly one heading. Exactly one of afterHeading, afterText, ' +
            'append. (add_image)',
        },
        afterText: {
          type: 'string',
          description: 'Place the image below the block (paragraph, list, table…) containing this text. It ' +
            'must occur exactly once in the markdown get_document returns; include surrounding words when ' +
            'a phrase repeats. A bad anchor is refused (400) and nothing changes. (add_image)',
        },
        append: {
          type: 'boolean',
          description: 'true places the image at the end of the document. (add_image)',
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
            'fromFile sends the downloaded version automatically. (update, add_image)',
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
          description: 'Folder ID to organize the document (create, update). For import, the folder the ' +
            'imported documents and folders go into; omitted = the project root. For export, the folder to ' +
            'export. (create, update, import, export)',
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
      'as line hunks rather than two full bodies. Prefer a diff to reading two versions. ' +
      'A single lookup returns `access`: restricted (not everyone in the organization can read it), ' +
      'restrictedBy (document, folder or project), public, and yourRole (viewer or editor). When it is ' +
      'restricted, `accessNotice` says so: don\'t copy its content where other people can read it. ' +
      'Who can read a document is managed with get_access / manage_access entityType:"document".',
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
