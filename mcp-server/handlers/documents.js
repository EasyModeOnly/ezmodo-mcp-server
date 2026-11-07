/**
 * Document Handlers
 * Handler functions for documentation-related MCP tools
 */

import path from 'path';
import { callEzmodoAPI } from '../lib/http-client.js';
import { getLogger } from '../lib/logger.js';
import { readDocFile, refreshDocFile, safeFileStem, setAsideAndRefreshDoc, writeDocFile } from '../lib/doc-files.js';
import { computeEdits } from '../lib/text-edits.js';
import { attachLinks } from '../lib/links-at-create.js';
import { historyMode, summarizeEntry } from '../lib/version-history.js';

/**
 * Dispatch manage_document actions to the appropriate handler
 */
export async function manageDocument(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createDocument(params);
  case 'update': return updateDocument(params);
  case 'restore': return restoreDocument(params);
  case 'create_version': throw new Error('Document versioning is not yet supported. Use the "update" action to modify documents.');
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Dispatch manage_document_template actions to the appropriate handler
 */
export async function manageDocumentTemplate(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createDocumentTemplate(params);
  case 'delete': return deleteDocumentTemplate(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified get/list handler for documents.
 * - If documentId or slug is provided, returns a single document.
 * - Otherwise, lists all documents for the project with optional filters.
 * - Optionally lists the document's history, reads one version, or diffs two
 *   (E-300 #3387 #3409).
 */
export async function getDocument(args) {
  const {
    docType, tags, status,
    includeHistory, includeVersions, historyEntryId, versionNumber, versionLimit, historyLimit, diffFrom, diffTo,
    ...rest
  } = args;
  const isSingleLookup = rest.documentId || rest.slug;
  const mode = historyMode({ includeHistory, includeVersions, historyEntryId, versionNumber, diffFrom, diffTo });

  if (isSingleLookup) {
    if (mode === 'diff') {
      const documentId = await resolveDocumentId(rest);
      const params = { documentId, from: diffFrom };
      if (diffTo != null) params.to = diffTo;
      return callEzmodoAPI('mcpDiffDocumentHistory', params);
    }
    if (mode === 'entry') {
      const documentId = await resolveDocumentId(rest);
      return callEzmodoAPI('mcpGetDocumentHistoryEntry', { documentId, entryId: historyEntryId });
    }
    if (mode === 'nth') {
      return fetchNthNewestVersion(await resolveDocumentId(rest), versionNumber);
    }

    const result = await fetchSingleDocument(rest);

    if (mode === 'list') {
      const documentId = rest.documentId || result?.document?.id;
      const params = { documentId };
      const limit = historyLimit ?? versionLimit;
      if (limit != null) params.limit = limit;
      const listed = await callEzmodoAPI('mcpListDocumentHistory', params);
      const entries = listed?.history ?? [];
      result.history = entries.map((e) => summarizeEntry(e, DOCUMENT_CONTENT_FIELDS));
      result.historyMessage = 'Each entry is a version, newest first. Read one with get_document ' +
        'historyEntryId, compare with diffFrom/diffTo, or restore with manage_document action:"restore".';
    }

    return result;
  }

  if (mode) {
    throw new Error('History needs a single document: pass documentId (or projectId + slug).');
  }

  // List mode
  const listArgs = { projectId: rest.projectId };
  if (docType) listArgs.docType = docType;
  if (tags) listArgs.tags = tags;
  if (status) listArgs.status = status;

  return getDocumentation(listArgs);
}

/** Bodies a history entry may carry; a list returns entries without them. */
const DOCUMENT_CONTENT_FIELDS = ['content', 'body'];

/**
 * The document's id. History routes take an id, so a slug lookup resolves it
 * first (without writing the current version to .ezmodo/docs).
 */
async function resolveDocumentId(args) {
  if (args.documentId) return args.documentId;
  const data = await callEzmodoAPI('mcpGetDocument', args);
  const id = data?.document?.id;
  if (!id) throw new Error(`Document not found for slug "${args.slug}".`);
  return id;
}

/**
 * `versionNumber` (kept for backwards compatibility, #3387): history entries
 * have ids, not numbers, so N means the N-th newest entry, 1 being the newest.
 */
async function fetchNthNewestVersion(documentId, versionNumber) {
  const listed = await callEzmodoAPI('mcpListDocumentHistory', { documentId, limit: versionNumber });
  const entries = listed?.history ?? [];
  const entry = entries[versionNumber - 1];
  if (!entry?.id) {
    throw new Error(
      `Document ${documentId} has ${entries.length} version${entries.length === 1 ? '' : 's'} in its ` +
        `history, so there is no version ${versionNumber}. versionNumber counts back from the newest (1).`
    );
  }
  return callEzmodoAPI('mcpGetDocumentHistoryEntry', { documentId, entryId: entry.id });
}

/**
 * manage_document action:"restore": make a history entry the current version.
 */
async function restoreDocument({ documentId, historyEntryId }) {
  if (!documentId) throw new Error('documentId is required for restore');
  if (!historyEntryId) {
    throw new Error('historyEntryId is required for restore: list them with get_document includeHistory:true.');
  }
  return callEzmodoAPI('mcpRestoreDocumentHistory', { documentId, entryId: historyEntryId });
}

/**
 * Unified get/list handler for document templates.
 * - If templateId is provided, returns a single template.
 * - Otherwise, lists all templates with optional filters.
 */
export async function getDocumentTemplate(args) {
  const { templateId, category, type } = args;

  if (templateId) {
    return fetchSingleDocumentTemplate({ templateId });
  }

  // List mode
  const listArgs = {};
  if (category) listArgs.category = category;
  if (type) listArgs.type = type;

  return listDocumentTemplates(listArgs);
}

// --- Private helpers ---

async function getDocumentation(args) {
  return callEzmodoAPI('mcpGetDocumentation', args);
}

// Kept exported from here for existing callers; it lives in lib/doc-files.js.
export { safeFileStem };

async function fetchSingleDocument(args) {
  const { overwriteLocal, ...lookup } = args;
  const data = await callEzmodoAPI('mcpGetDocument', lookup);
  const doc = data.document;
  if (!doc || !doc.content) return data;

  let written;
  try {
    // Saved to .ezmodo/docs/<slug-or-id>.md with a sidecar recording the
    // version it was downloaded at (E-304 #3453). No checkout, or a slug that
    // is not a safe file name (E-297), returns the content inline.
    written = await writeDocFile(doc, { overwriteLocal });
  } catch (err) {
    getLogger().warn('Failed to save document to local file', { error: err.message, id: doc.id });
    return data;
  }
  if (!written) return data;

  const { content, ...metadata } = doc;
  if (written.localChanges) {
    return {
      ...data,
      document: metadata,
      localFilePath: written.file,
      localChanges: true,
      message:
        `NOT overwritten: ${written.file} has edits that were never pushed. Push them with ` +
        `manage_document action:"update" documentId:"${doc.id}" fromFile:true, or pass ` +
        'overwriteLocal:true to discard them and download the current version.',
    };
  }
  return {
    ...data,
    document: metadata,
    localFilePath: written.file,
    message:
      `Document content saved to ${written.file}. Read it when needed. To change the document, edit ` +
      `that file and push it with manage_document action:"update" documentId:"${doc.id}" fromFile:true: ` +
      'only your changes are sent, and only if nobody saved the document since you downloaded it.',
  };
}

async function createDocument(args) {
  // Support both top-level summary/keyPoints and nested aiContext input.
  // `links` is applied by the MCP layer after the document exists (E-225).
  const { summary, keyPoints, aiContext, links, ...rest } = args;
  const hasFlatFields = summary !== undefined || keyPoints !== undefined;
  if (hasFlatFields || aiContext) {
    rest.aiContext = {
      ...(aiContext || {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(keyPoints !== undefined ? { keyPoints } : {}),
    };
  }

  const result = await callEzmodoAPI('mcpCreateDocument', rest);

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, {
    sourceType: 'document',
    sourceId: result?.documentId,
    links,
  });

  return result;
}

async function updateDocument(args) {
  // Support both top-level summary/keyPoints and nested aiContext input
  const { summary, keyPoints, aiContext, addRelatedItem, removeRelatedItem, ...rest } = args;
  const hasFlatFields = summary !== undefined || keyPoints !== undefined;
  if (hasFlatFields || aiContext) {
    rest.aiContext = {
      ...(aiContext || {}),
      ...(summary !== undefined ? { summary } : {}),
      ...(keyPoints !== undefined ? { keyPoints } : {}),
    };
  }

  if (addRelatedItem !== undefined) {
    rest.addRelatedItem = addRelatedItem;
  }
  if (removeRelatedItem !== undefined) {
    rest.removeRelatedItem = removeRelatedItem;
  }

  if (rest.fromFile) {
    const { fromFile, ...pushArgs } = rest;
    return pushDocFile(pushArgs);
  }
  return callEzmodoAPI('mcpUpdateDocument', rest);
}

/**
 * `manage_document update fromFile:true` (E-304 #3453): push the edited
 * `.ezmodo/docs` file as targeted edits, conditional on the version it was
 * downloaded at. While the server still has that version, its markdown is the
 * file as downloaded, so diffing it against the file gives the agent's
 * changes; sending those as edits (not the whole text) means the server
 * rebuilds only the blocks they touch, and comments on the rest stay put.
 */
async function pushDocFile(args) {
  const { documentId } = args;
  if (!documentId) throw new Error('documentId is required');
  const inBoth = ['content', 'body', 'edits'].filter((k) => args[k] != null);
  if (inBoth.length > 0) {
    throw new Error(`fromFile pushes the local file; do not also send ${inBoth.join(', ')}.`);
  }

  const server = (await callEzmodoAPI('mcpGetDocument', { documentId }))?.document;
  if (!server) throw new Error(`Document ${documentId} not found.`);
  const local = await readDocFile(server);
  const expectedUpdatedAt = args.expectedUpdatedAt ?? local.meta.updatedAt;

  const otherChanges = Object.keys(args).some((k) => !['documentId', 'expectedUpdatedAt'].includes(k));
  if (!local.changed && !otherChanges) {
    return { documentId, localFilePath: local.file, message: 'No local changes to push.' };
  }

  const conflict = async (reason) => {
    const aside = await setAsideAndRefreshDoc(local, server.updatedAt === local.meta.updatedAt
      ? (await callEzmodoAPI('mcpGetDocument', { documentId })).document
      : server);
    const e = new Error(
      `${reason} Nothing was pushed. ${local.file} now holds the current version, and yours is saved ` +
        `beside it as ${path.basename(aside)}. Reapply your change to the current file, then push again.`
    );
    e.status = 409;
    return e;
  };

  if (!sameInstant(server.updatedAt, expectedUpdatedAt)) {
    throw await conflict(`Document ${documentId} was saved since you downloaded it (now ${server.updatedAt}).`);
  }

  const request = { ...args, expectedUpdatedAt };
  if (local.changed) {
    const edits = computeEdits(server.content ?? '', local.text);
    if (edits.length > 0) request.edits = edits;
  }

  let result;
  try {
    result = await callEzmodoAPI('mcpUpdateDocument', request);
  } catch (err) {
    if (err.status !== 409) throw err;
    throw await conflict(`${err.message}.`);
  }

  // The file becomes the server's version, normalized as the server writes
  // markdown, so the next diff starts from what the server holds.
  const saved = (await callEzmodoAPI('mcpGetDocument', { documentId }))?.document;
  if (saved) await refreshDocFile(local, saved);
  return {
    ...result,
    pushed: request.edits?.length ?? 0,
    localFilePath: local.file,
  };
}

/** updatedAt values compare as instants: the API and the sidecar may format them differently. */
function sameInstant(a, b) {
  if (a == null || b == null) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
  // Date.parse keeps milliseconds only; compare the full strings when they agree there.
  return ta === tb && fraction(a) === fraction(b);
}

function fraction(ts) {
  const m = /\.(\d+)/.exec(String(ts));
  return (m ? m[1] : '').replace(/0+$/, '');
}

/**
 * List an organization's project-less (org-scoped) documents. (E-195)
 * Params: organizationId (required), folderId (optional), limit (optional).
 */
export async function listOrgDocuments(args) {
  return callEzmodoAPI('mcpListOrgDocuments', args);
}

// Document Template helpers

async function listDocumentTemplates(args) {
  return callEzmodoAPI('mcpListDocumentTemplates', args);
}

async function fetchSingleDocumentTemplate(args) {
  return callEzmodoAPI('mcpGetDocumentTemplate', args);
}

async function createDocumentTemplate(args) {
  return callEzmodoAPI('mcpCreateDocumentTemplate', args);
}

async function deleteDocumentTemplate(args) {
  return callEzmodoAPI('mcpDeleteDocumentTemplate', args);
}
