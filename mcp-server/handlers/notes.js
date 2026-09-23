/**
 * Note Handlers (E-204)
 * Handler functions for the personal-notes MCP tools.
 *
 * manageNote dispatches create/update/delete/move/pin/promote;
 * manageNoteFolder dispatches list/create/rename/move/delete.
 * move and pin are conveniences over the one update route, so an agent does not
 * have to know that "move to root" is an empty folderId.
 */

import { callZephlyAPI } from '../lib/http-client.js';

export async function listNotes(args) {
  return callZephlyAPI('mcpListNotes', args || {});
}

export async function getNote(args) {
  return callZephlyAPI('mcpGetNote', { noteId: args?.noteId });
}

/**
 * Dispatch manage_note actions to the appropriate handler
 */
export async function manageNote(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createNote(params);
  case 'update': return updateNote(params);
  case 'delete': return deleteNote(params);
  case 'move': return moveNote(params);
  case 'pin': return pinNote(params);
  case 'promote': return promoteNote(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Dispatch manage_note_folder actions to the appropriate handler
 */
export async function manageNoteFolder(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'list': return callZephlyAPI('mcpListNoteFolders', {});
  case 'create': return createNoteFolder(params);
  case 'rename': return renameNoteFolder(params);
  case 'move': return moveNoteFolder(params);
  case 'delete': return deleteNoteFolder(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

// --- Private helpers ---

/** "root" and "" both mean "no folder"; anything else is a folder id. */
function isRoot(folderId) {
  return folderId === undefined || folderId === null || folderId === '' || folderId === 'root';
}

/** Copy only the keys that were actually supplied, so the API sees no stray nulls. */
function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function requireField(params, field, action) {
  if (params[field] === undefined || params[field] === null || params[field] === '') {
    throw new Error(`${field} is required for ${action}`);
  }
}

async function createNote(params) {
  requireField(params, 'title', 'create');
  const body = pick(params, ['title', 'content']);
  if (!isRoot(params.folderId)) body.folderId = params.folderId;
  return callZephlyAPI('mcpCreateNote', body);
}

async function updateNote(params) {
  requireField(params, 'noteId', 'update');
  const fields = pick(params, ['title', 'content', 'append', 'isPinned']);
  if (params.folderId !== undefined) {
    fields.folderId = isRoot(params.folderId) ? '' : params.folderId;
  }
  if (Object.keys(fields).length === 0) {
    throw new Error(
      'No updates provided. Specify at least one of: title, content, append, folderId, isPinned.'
    );
  }
  return callZephlyAPI('mcpUpdateNote', { noteId: params.noteId, ...fields });
}

async function deleteNote(params) {
  requireField(params, 'noteId', 'delete');
  await callZephlyAPI('mcpDeleteNote', { noteId: params.noteId });
  return { deleted: true, noteId: params.noteId };
}

async function moveNote(params) {
  requireField(params, 'noteId', 'move');
  if (params.folderId === undefined) {
    throw new Error('folderId is required for move (use "root" to move out of any folder)');
  }
  return callZephlyAPI('mcpUpdateNote', {
    noteId: params.noteId,
    folderId: isRoot(params.folderId) ? '' : params.folderId,
  });
}

async function pinNote(params) {
  requireField(params, 'noteId', 'pin');
  return callZephlyAPI('mcpUpdateNote', {
    noteId: params.noteId,
    isPinned: params.isPinned !== false,
  });
}

async function promoteNote(params) {
  requireField(params, 'noteId', 'promote');
  requireField(params, 'kind', 'promote');
  requireField(params, 'organizationId', 'promote');
  requireField(params, 'projectId', 'promote');
  return callZephlyAPI('mcpPromoteNote', {
    noteId: params.noteId,
    ...pick(params, [
      'kind', 'organizationId', 'projectId', 'title', 'description', 'priority', 'epicId',
    ]),
  });
}

async function createNoteFolder(params) {
  requireField(params, 'name', 'create');
  const body = { name: params.name };
  if (!isRoot(params.parentId)) body.parentId = params.parentId;
  return callZephlyAPI('mcpCreateNoteFolder', body);
}

async function renameNoteFolder(params) {
  requireField(params, 'folderId', 'rename');
  requireField(params, 'name', 'rename');
  return callZephlyAPI('mcpUpdateNoteFolder', { folderId: params.folderId, name: params.name });
}

async function moveNoteFolder(params) {
  requireField(params, 'folderId', 'move');
  if (params.parentId === undefined) {
    throw new Error('parentId is required for move (use "root" to move to the top level)');
  }
  return callZephlyAPI('mcpUpdateNoteFolder', {
    folderId: params.folderId,
    parentId: isRoot(params.parentId) ? null : params.parentId,
  });
}

async function deleteNoteFolder(params) {
  requireField(params, 'folderId', 'delete');
  await callZephlyAPI('mcpDeleteNoteFolder', { folderId: params.folderId });
  return { deleted: true, folderId: params.folderId };
}
