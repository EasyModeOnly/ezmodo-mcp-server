/**
 * Folder Tools
 * MCP tools for managing document folders within projects
 */

export const FOLDER_TOOLS = [
  {
    name: 'manage_folder',
    description: 'Create, update, or delete document folders. Folders are usually ' +
      'project-scoped (pass projectId), but a folder can also be ORG-SCOPED ' +
      '(project-less) by passing organizationId with NO projectId — exactly one of the two. ' +
      'Org-scoped folders are the org\'s document "areas"; the reserved areas (Goals, ' +
      'Features, ADRs, How it works) are managed via get_org_areas. (E-195)',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        projectId: {
          type: 'string',
          description: 'Project ID. Provide for a PROJECT-SCOPED folder. ' +
            'Mutually exclusive with organizationId — supply exactly one when creating.',
        },
        organizationId: {
          type: 'string',
          description: 'Org scope — provide organizationId with NO projectId to create/list an ' +
            'ORG-SCOPED (project-less) folder (an org document "area"). Exactly one of projectId ' +
            'or organizationId. (E-195)',
        },
        folderId: {
          type: 'string',
          description: 'Folder ID (required for update, delete)',
        },
        // --- Create / Update fields ---
        name: {
          type: 'string',
          description: 'Folder name (required for create, optional for update)',
        },
        color: {
          type: 'string',
          description: 'Folder color (e.g., "blue", "red", "#FF0000") (create, update)',
        },
        icon: {
          type: 'string',
          description: 'Folder icon identifier (create, update)',
        },
        // NOTE: there is deliberately no `access` parameter. Folder access
        // control is real, but it is generic across entity types rather than a
        // property of folders — folders.CreateFolderRequest /
        // UpdateFolderRequest carry no access field, so a previously-advertised
        // `access` object was decoded away to nothing on both create and update
        // (#2168). Use the `manage_access` / `get_access` tools with
        // entityType:"folder" instead; passing `access` here is reported back as
        // a warning rather than silently accepted, see handlers/folders.js.
        // Note that only ROOT folders carry their own access — nested folders
        // inherit from their root, and manage_access rejects them accordingly.
        // --- Create-only fields ---
        parentFolderId: {
          type: 'string',
          description: 'Parent folder ID for nested folders (create only). For update, use this to move the folder. Use "root" or empty string to move to root level.',
        },
        // --- Delete-only fields ---
        cascade: {
          type: 'boolean',
          description: 'If true, delete all contents recursively. If false (default), move contents to root. (delete only)',
          default: false,
        },
      },
      // projectId OR organizationId is required for create (see scope descriptions);
      // update/delete require folderId. Enforced server-side.
      required: ['action'],
    },
  },
  {
    name: 'list_folders',
    description: 'List document folders. Provide projectId for a project\'s folders, OR ' +
      'organizationId (with no projectId) for the org\'s ORG-SCOPED (project-less) folders / ' +
      'document areas (E-195). Use mode "tree" for hierarchical parent-child view, or "flat" ' +
      '(default) for a flat list with document counts.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project ID. Mutually exclusive with organizationId.',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID — list the org\'s ORG-SCOPED (project-less) folders ' +
            'instead of a project\'s. Mutually exclusive with projectId. (E-195)',
        },
        mode: {
          type: 'string',
          enum: ['flat', 'tree'],
          description: 'Output mode: "flat" (default) for list with document counts, "tree" for hierarchical parent-child view',
          default: 'flat',
        },
      },
    },
  },
  {
    name: 'get_org_areas',
    description: 'List the org\'s reserved document areas (Goals, Features, ADRs, How it works), ' +
      'creating any missing ones. Areas are org-scoped (project-less) system folders that ' +
      'organize cross-project documents — e.g. org-scoped "adr" and "how-it-works" documents ' +
      'are auto-filed into the ADRs / How it works areas. (E-195)',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
      },
      required: ['organizationId'],
    },
  },
];
