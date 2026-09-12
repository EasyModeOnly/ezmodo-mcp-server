/**
 * Folder Handlers
 * Handler functions for document folder-related MCP tools
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_folder actions to the appropriate handler
 */
export async function manageFolder(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createFolder(params);
  case 'update': return updateFolder(params);
  case 'delete': return deleteFolder(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified list handler for folders.
 * mode='tree' returns hierarchical view, mode='flat' (default) returns flat list.
 */
export async function listFolders(args) {
  const { mode, ...rest } = args;

  if (mode === 'tree') {
    return getFolderTree(rest);
  }

  return fetchFolderList(rest);
}

/**
 * List an organization's reserved document areas (Goals, Features, ADRs,
 * How it works), creating any that are missing. (E-195)
 * Params: organizationId (required).
 */
export async function getOrgAreas(args) {
  return callZephlyAPI('mcpGetOrgAreas', args);
}

// --- Private helpers ---

async function fetchFolderList(args) {
  return callZephlyAPI('mcpListFolders', args);
}

async function getFolderTree(args) {
  return callZephlyAPI('mcpGetFolderTree', args);
}

/**
 * Access is not a property of a folder write: neither folders.CreateFolderRequest
 * nor UpdateFolderRequest carries an access field, so an `access` object was
 * decoded away to nothing on both paths (#2168). The capability itself is real
 * and now HAS an MCP surface of its own — the polymorphic manage_access tool
 * (#2170) — so the honest response is to do the folder write and point at the
 * tool that actually applies access, rather than dropping it silently or
 * failing the whole call over it.
 */
const ACCESS_UNSUPPORTED =
  'The `access` field was ignored: access is not set through manage_folder. ' +
  'Use manage_access with entityType:"folder" (action "update_settings" or "add_entry") ' +
  'to apply it. Note only root folders carry their own access — nested folders ' +
  'inherit from their root folder.';

async function createFolder(args) {
  // Map parentFolderId (MCP schema) → parentId (Go API field name)
  const { parentFolderId, access, ...rest } = args;
  const mapped = { ...rest };
  if (parentFolderId) {
    mapped.parentId = parentFolderId;
  }
  const result = await callZephlyAPI('mcpCreateFolder', mapped);
  if (access !== undefined) result.warning = ACCESS_UNSUPPORTED;
  return result;
}

async function updateFolder(args) {
  const { parentFolderId, access, ...rest } = args;

  // Check if there are fields to update beyond projectId/folderId. `access` is
  // deliberately NOT counted: it cannot be applied, so counting it would report
  // a successful update that changed nothing.
  const hasFieldUpdates = rest.name || rest.color || rest.icon;
  let result;

  if (hasFieldUpdates) {
    result = await callZephlyAPI('mcpUpdateFolder', rest);
  } else {
    result = { success: true, folderId: args.folderId };
  }

  // Move folder if parentFolderId was specified
  if (parentFolderId !== undefined) {
    const newParentId = (parentFolderId === '' || parentFolderId === 'root') ? null : parentFolderId;
    await callZephlyAPI('mcpMoveFolder', {
      projectId: args.projectId,
      folderId: args.folderId,
      newParentId,
    });
    result.moved = true;
    result.newParentId = newParentId;
  }

  if (!hasFieldUpdates && parentFolderId === undefined) {
    // Name the access case explicitly. Reporting a bare "no updates provided"
    // to a caller who did pass something reads as though the argument never
    // arrived, sending them to debug their own call instead of the real answer.
    throw new Error(
      access !== undefined
        ? `No applicable updates provided. ${ACCESS_UNSUPPORTED} ` +
          'To update the folder itself, pass one of: name, color, icon, or parentFolderId.'
        : 'No updates provided. Specify at least one of: name, color, icon, or parentFolderId.'
    );
  }

  if (access !== undefined) result.warning = ACCESS_UNSUPPORTED;

  return result;
}

async function deleteFolder(args) {
  return callZephlyAPI('mcpDeleteFolder', args);
}
