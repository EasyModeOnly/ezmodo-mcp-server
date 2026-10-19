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

/**
 * Dispatch manage_document actions to the appropriate handler
 */
export async function manageDocument(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createDocument(params);
  case 'update': return updateDocument(params);
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
 * - Optionally includes version history or fetches a specific version.
 */
export async function getDocument(args) {
  const { docType, tags, status, includeVersions, versionNumber, versionLimit, ...rest } = args;
  const isSingleLookup = rest.documentId || rest.slug;

  if (isSingleLookup) {
    // Specific version requested
    if (versionNumber !== undefined) {
      return fetchDocumentVersion({ documentId: rest.documentId, versionNumber });
    }

    const result = await fetchSingleDocument(rest);

    // Include version history if requested
    if (includeVersions) {
      const versions = await listDocumentVersions({
        documentId: rest.documentId || result?.document?.id,
        limit: versionLimit,
      });
      result.versions = versions;
    }

    return result;
  }

  // List mode
  const listArgs = { projectId: rest.projectId };
  if (docType) listArgs.docType = docType;
  if (tags) listArgs.tags = tags;
  if (status) listArgs.status = status;

  return getDocumentation(listArgs);
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

// Document Version helpers

async function listDocumentVersions(args) {
  return callEzmodoAPI('mcpListDocumentVersions', args);
}

async function fetchDocumentVersion(args) {
  return callEzmodoAPI('mcpGetDocumentVersion', args);
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
