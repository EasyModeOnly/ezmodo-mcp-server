/**
 * Attachment Tools (E-21 #158)
 * MCP tools for AI agents to read and manage file attachments on any entity.
 *
 * Read/manage only: agents can list attachments, fetch signed download/preview
 * URLs, and delete attachments. Files are CREATED via the app's two-phase
 * signed-URL upload flow, not through MCP (byte uploads don't belong in tool
 * args), so there is deliberately no upload tool.
 */

// The ATTACHABLE set, NOT the linkable set — deliberately not LINKABLE_TYPES
// (tools/linkable-types.js). Attachments only exist on these four entities;
// offering the 14 linkable types would advertise combinations the API rejects.
const ENTITY_TYPES = ['task', 'epic', 'goal', 'project'];

export const ATTACHMENT_TOOLS = [
  {
    name: 'list_attachments',
    description:
      'List file attachments. Two modes: (1) pass entityType + entityId to list ' +
      'the files on ONE entity (task/epic/goal/project), or (2) pass projectId to ' +
      'get the PROJECT-WIDE aggregate — every file across the project\'s tasks, ' +
      'epics, goals, and the project itself, each enriched with its source entity ' +
      '(entityTitle / entityNumber). Returns attachment metadata (id, name, ' +
      'mimeType, size, storagePath, uploadedAt, entityType, entityId).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description:
            'Project ID for the project-wide aggregate view. Mutually exclusive ' +
            'with entityType/entityId — supply this OR the entity pair.',
        },
        entityType: {
          type: 'string',
          enum: ENTITY_TYPES,
          description: 'Entity type for single-entity mode (with entityId).',
        },
        entityId: {
          type: 'string',
          description: 'Entity ID for single-entity mode (with entityType).',
        },
      },
      // Server requires either projectId or (entityType + entityId).
      required: [],
    },
  },
  {
    name: 'get_attachment_url',
    description:
      'Get a short-lived signed URL for an attachment so its contents can be ' +
      'fetched. By default the URL force-downloads the file; pass ' +
      'disposition:"inline" for a preview URL that renders in the browser — ' +
      'honored only for safe types (raster images + PDF), otherwise it still ' +
      'downloads. Get the attachmentId from list_attachments.',
    inputSchema: {
      type: 'object',
      properties: {
        attachmentId: {
          type: 'string',
          description: 'The attachment ID (from list_attachments).',
        },
        disposition: {
          type: 'string',
          enum: ['attachment', 'inline'],
          description:
            'attachment (default) = force download; inline = preview URL for ' +
            'safe types (images/PDF).',
        },
      },
      required: ['attachmentId'],
    },
  },
  {
    name: 'delete_attachment',
    description:
      'Delete an attachment by ID. Soft-deletes the metadata, removes the stored ' +
      'file, and releases the org\'s tracked storage usage. Get the attachmentId ' +
      'from list_attachments.',
    inputSchema: {
      type: 'object',
      properties: {
        attachmentId: {
          type: 'string',
          description: 'The attachment ID to delete (from list_attachments).',
        },
      },
      required: ['attachmentId'],
    },
  },
];
