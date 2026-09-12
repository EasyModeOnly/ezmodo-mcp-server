/**
 * Attachment Handlers (E-21 #158)
 * Handler functions for attachment-related MCP tools. Read/manage only —
 * uploads go through the app's two-phase signed-URL flow, not MCP.
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * List attachments for a single entity (entityType + entityId) or the
 * project-wide aggregate (projectId). Validation of the mutually-exclusive
 * modes is enforced server-side.
 */
export async function listAttachments(args) {
  return callZephlyAPI('mcpListAttachments', args);
}

/**
 * Get a signed download/preview URL for an attachment.
 */
export async function getAttachmentUrl(args) {
  return callZephlyAPI('mcpGetAttachmentUrl', args);
}

/**
 * Delete an attachment (also removes the stored file and releases usage).
 */
export async function deleteAttachment(args) {
  return callZephlyAPI('mcpDeleteAttachment', args);
}
