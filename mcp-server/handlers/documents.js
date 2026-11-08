/**
 * Document Handlers
 * Handler functions for documentation-related MCP tools
 */

import path from 'path';
import { callEzmodoAPI } from '../lib/http-client.js';
import { getLogger } from '../lib/logger.js';
import {
  findDownloadedDoc, readDocFile, refreshDocFile, safeFileStem, setAsideAndRefreshDoc, writeDocFile,
} from '../lib/doc-files.js';
import { loadImage, uploadImageBytes, validateAddImageArgs } from '../lib/doc-images.js';
import { loadImportFile, summarizeImport, validateImportArgs } from '../lib/doc-import.js';
import { computeEdits } from '../lib/text-edits.js';
import { attachLinks } from '../lib/links-at-create.js';
import { historyMode, summarizeEntry } from '../lib/version-history.js';
import { MAX_INLINE_BYTES, exportsRoot, safeExportFilename, writeExportFile } from '../lib/doc-exports.js';

/**
 * Dispatch manage_document actions to the appropriate handler
 */
export async function manageDocument(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createDocument(params);
  case 'update': return updateDocument(params);
  case 'restore': return restoreDocument(params);
  case 'submit_for_review': return reviewDocument('submit', params);
  case 'withdraw_review': return reviewDocument('withdraw', params);
  case 'add_image': return addImage(params);
  case 'import': return importDocuments(params);
  case 'export': return exportDocuments(params);
  case 'create_version': throw new Error('Document versioning is not yet supported. Use the "update" action to modify documents.');
  default: throw new Error(`Unknown action: ${action}`);
  }
}

const EXPORT_FORMATS = new Set(['md', 'pdf']);
const EXPORT_VERSIONS = new Set(['current', 'published']);

/**
 * The export request the API takes: exactly one target (documentId, else
 * folderId, else projectId for the project's Documentation root), a format,
 * and for folders whether to include subfolders and which version to export.
 * Every refusal here happens before the network.
 */
export function exportRequest(args) {
  const { documentId, folderId, projectId, format, includeSubfolders, version } = args;
  if (documentId && folderId) {
    throw new Error('Export one thing at a time: pass documentId OR folderId (or projectId alone for the ' +
      'whole Documentation root), not both.');
  }
  if (!documentId && !folderId && !projectId) {
    throw new Error('Pass what to export: documentId (one document), folderId (a folder), or projectId ' +
      'alone (every document in the project).');
  }
  if (!EXPORT_FORMATS.has(format)) {
    throw new Error('format must be "md" (Markdown: a .md, or a .zip with images and folders) or "pdf".');
  }
  if (version != null && !EXPORT_VERSIONS.has(version)) {
    throw new Error('version must be "current" (drafts included) or "published" (published copies only).');
  }
  if (includeSubfolders != null && typeof includeSubfolders !== 'boolean') {
    throw new Error('includeSubfolders must be true or false.');
  }
  const request = { format };
  if (documentId) request.documentId = documentId;
  else if (folderId) request.folderId = folderId;
  else request.projectId = projectId;
  if (!documentId) {
    request.includeSubfolders = includeSubfolders ?? true;
    request.version = version ?? 'current';
  } else if (version) {
    request.version = version;
  }
  return request;
}

/**
 * manage_document action:"export" (E-305 #3458): a document as .md (or .zip
 * when it has images) or .pdf; a folder or the project root as a .zip of
 * Markdown or one PDF. In a checkout the file goes to .ezmodo/exports and the
 * path comes back; over the remote connector the bytes come back inline, up to
 * 5 MB.
 */
async function exportDocuments(args) {
  const request = exportRequest(args);
  const data = await callEzmodoAPI('mcpExportDocument', request);
  if (!data || typeof data.contentBase64 !== 'string') {
    throw new Error('The export came back empty; try again, or export from the web app.');
  }
  const bytes = Buffer.from(data.contentBase64, 'base64');
  const contentType = data.contentType || 'application/octet-stream';
  const filename = safeExportFilename(data.filename, contentType);
  const summary = {
    filename,
    contentType,
    sizeBytes: bytes.length,
    documentCount: data.documentCount,
  };

  const root = await exportsRoot();
  if (root) {
    const filePath = await writeExportFile(root, filename, bytes);
    return {
      ...summary,
      filename: path.basename(filePath),
      filePath,
      message: `Exported to ${filePath}.`,
    };
  }

  if (bytes.length > MAX_INLINE_BYTES) {
    throw new Error(
      `The export is ${(bytes.length / (1024 * 1024)).toFixed(1)} MB, over the 5 MB that can be returned ` +
        'over the remote connector. Export it from the web app instead (the document or folder ⋯ menu → ' +
        'Export), or export a smaller folder.'
    );
  }
  return {
    ...summary,
    contentBase64: data.contentBase64,
    message: 'No local checkout, so the file is returned inline as base64 (contentBase64).',
  };
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
 * manage_document action:"submit_for_review" / "withdraw_review" (E-304 #3454):
 * ask a person to approve the document, optionally with a note for them, or
 * take the request back. Agents have no publish or approve action.
 */
async function reviewDocument(action, { documentId, note }) {
  const name = action === 'submit' ? 'submit_for_review' : 'withdraw_review';
  if (!documentId) throw new Error(`documentId is required for ${name}`);
  const params = { documentId, action };
  if (action === 'submit' && note) params.note = note;
  return callEzmodoAPI('mcpReviewDocument', params);
}

/**
 * manage_document action:"add_image" (#3449): upload an image and place it in
 * the document below the block holding the anchor. The server inserts it and
 * saves; this side never edits markdown. Order matters: every refusal that
 * needs no network happens first, then the unpushed-edits check, and only
 * then is an upload URL requested.
 */
async function addImage(args) {
  validateAddImageArgs(args);
  const { documentId, alt, caption, afterHeading, afterText, append, expectedUpdatedAt } = args;
  const image = await loadImage(args);

  // The local copy's edits are diffed against the server on the next push;
  // with an image placed in between, that push would drop the image.
  const local = await findDownloadedDoc(documentId);
  if (local?.changed) {
    throw new Error(
      `${local.file} has edits that were never pushed. Push them first with manage_document ` +
        `action:"update" documentId:"${documentId}" fromFile:true (or re-download with get_document ` +
        'overwriteLocal:true to discard them), then add the image. Adding it now would make your next ' +
        'push drop it.'
    );
  }

  const ticket = await callEzmodoAPI('mcpDocumentImageUploadURL', {
    documentId, filename: image.filename, contentType: image.contentType,
  });
  if (ticket?.maxBytes && image.bytes.length > ticket.maxBytes) {
    throw new Error(`The image is ${image.bytes.length} bytes; the limit is ${ticket.maxBytes}.`);
  }
  await uploadImageBytes({ ...ticket, contentType: ticket.contentType || image.contentType }, image.bytes);

  const request = { documentId, objectPath: ticket.objectPath, alt: alt.trim() };
  if (caption) request.caption = caption;
  if (afterHeading) request.afterHeading = afterHeading;
  else if (afterText) request.afterText = afterText;
  else if (append) request.append = true;
  if (expectedUpdatedAt) request.expectedUpdatedAt = expectedUpdatedAt;

  let placed;
  try {
    placed = await callEzmodoAPI('mcpInsertDocumentImage', request);
  } catch (err) {
    if (err.status !== 409) throw err;
    const e = new Error(
      `${err.message}. The image was not placed: read the document again with get_document and retry ` +
        'with its updatedAt as expectedUpdatedAt.'
    );
    e.status = 409;
    throw e;
  }

  const result = {
    documentId: placed?.documentId ?? documentId,
    imageUrl: placed?.imageUrl,
    updatedAt: placed?.updatedAt,
    status: placed?.status,
  };
  if (local && placed?.content != null) {
    try {
      await refreshDocFile(local, {
        id: result.documentId, slug: placed.slug, updatedAt: placed.updatedAt, content: placed.content,
      });
      result.localFilePath = local.file;
    } catch (err) {
      getLogger().warn('Failed to refresh local document file after add_image', { error: err.message, id: documentId });
    }
  }
  if (placed?.message) result.message = placed.message;
  return result;
}

/**
 * manage_document action:"import" (#3456): send one .md/.markdown file or a
 * .zip of them to the API, which turns files into draft documents and zip
 * folders into folders, and reports what it made and what it could not carry
 * over. Every refusal that needs no network happens before the upload.
 */
async function importDocuments(args) {
  validateImportArgs(args);
  const file = await loadImportFile(args);
  const request = {
    projectId: args.projectId,
    name: file.name,
    contentBase64: file.bytes.toString('base64'),
    dryRun: args.dryRun === true,
  };
  if (args.folderId) request.folderId = args.folderId;

  const report = await callEzmodoAPI('mcpImportDocuments', request);
  return { summary: summarizeImport(report), ...report };
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

/**
 * A sentence for the agent when the document isn't open to the whole
 * organization (E-320 #3560): the API's `access` summary says where the
 * restriction is set, and an agent that copies such a document into an open or
 * public one leaks it.
 */
export function accessNotice(summary) {
  if (!summary?.restricted) return undefined;
  const where = {
    document: 'only the people on its own access list',
    folder: 'only the people who can open its folder',
    project: 'only the members of its project',
  }[summary.restrictedBy] || 'only some people in the organization';
  return `Restricted: ${where} can read this document. Don't copy its content into a document, task, ` +
    'comment or message that other people can read without asking your person first.';
}

async function fetchSingleDocument(args) {
  const { overwriteLocal, ...lookup } = args;
  const fetched = await callEzmodoAPI('mcpGetDocument', lookup);
  const notice = accessNotice(fetched?.access);
  const data = notice ? { ...fetched, accessNotice: notice } : fetched;
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
