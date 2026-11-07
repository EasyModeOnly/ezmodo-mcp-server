/**
 * Document Handlers
 * Handler functions for documentation-related MCP tools
 */

import path from 'path';
import { callEzmodoAPI } from '../lib/http-client.js';
import { findConfigPath } from '../lib/local-cache.js';
import { ensureDirInside, isInside, writeFileNoFollow } from '../lib/local-paths.js';
import { getLogger } from '../lib/logger.js';
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

/**
 * The file name (without .md) a fetched document is saved under: its slug when
 * that is a plain slug, else its id when that is a plain id, else nothing.
 * Both come from the API and are attacker-influenced, so neither is trusted to
 * be a file name (E-297).
 */
export function safeFileStem(slug, id) {
  if (typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return slug;
  if (typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id)) return id;
  return null;
}

async function fetchSingleDocument(args) {
  const data = await callEzmodoAPI('mcpGetDocument', args);
  const doc = data.document;

  if (!doc) {
    return data;
  }

  if (!doc.content) {
    return data;
  }

  // Save content to <repo-config-dir>/docs/<slug-or-id>.md
  const configPath = await findConfigPath();
  if (!configPath) {
    // No project config directory found — return as-is.
    return data;
  }

  const configDir = path.dirname(configPath);
  const docsDir = path.join(configDir, 'docs');
  const stem = safeFileStem(doc.slug, doc.id);
  const filePath = stem && path.resolve(docsDir, `${stem}.md`);
  if (!filePath || !isInside(docsDir, filePath)) {
    // A slug or id that is not a plain file name never becomes a path (E-297):
    // "../../CLAUDE" would otherwise overwrite a file outside .ezmodo/docs.
    getLogger().warn('Document has no safe file name; returning it inline', { id: doc.id });
    return data;
  }

  try {
    // Neither .ezmodo/docs nor the file itself may be a symlink out of the
    // checkout: a planted .ezmodo/docs/<slug>.md -> ~/.bashrc would turn a
    // document fetch into a write anywhere (E-297).
    await ensureDirInside(docsDir, path.dirname(configDir));
    await writeFileNoFollow(filePath, doc.content);
  } catch (err) {
    getLogger().warn('Failed to save document to local file', { error: err.message, filePath });
    // Fall back to returning full content in response
    return data;
  }

  // Return metadata + file path, omit heavy content from response
  const { content, ...metadata } = doc;
  return {
    ...data,
    document: metadata,
    localFilePath: filePath,
    message: `Document content saved to ${filePath}. Use the Read tool to access it when needed.`,
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

  return callEzmodoAPI('mcpUpdateDocument', rest);
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
