/**
 * Design Handlers
 * Handler functions for the Designs MCP tools (the in-product living design system).
 *
 * A Design is an AI-authored HTML/CSS artifact (kind ∈ theme|component|page) that
 * captures the house style. Designs are org-level (project_id nullable) and LINK
 * to features and other artifacts via the generic link graph. These handlers are
 * thin wrappers over /api/mcp/v1/designs; dispatch and validation happen
 * server-side in core/designs.Service.
 */

import path from 'path';
import { callEzmodoAPI } from '../lib/http-client.js';
import { getLogger } from '../lib/logger.js';
import { attachLinks } from '../lib/links-at-create.js';
import {
  readDesignFiles,
  recordPushed,
  setAsideAndRefresh,
  writeDesignFiles,
} from '../lib/design-files.js';

/**
 * Dispatch manage_design actions.
 */
export async function manageDesign(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createDesign(params);
  case 'update': return updateDesign(params);
  case 'delete': return deleteDesign(params);
  case 'link': return linkDesignArtifact(params);
  case 'unlink': return unlinkDesignArtifact(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, link, or unlink.`);
  }
}

/**
 * Unified get/list handler for designs.
 * - linkedType + linkedId → designs linked to that entity (e.g. a feature).
 * - designId → single lookup (optionally + links).
 */
export async function getDesign(args) {
  const {
    includeLinks, designId, designIds, organizationId, linkedType, linkedId, inline, overwriteLocal,
    ...filters
  } = args;
  const fileOpts = { inline, overwriteLocal };

  if (linkedType && linkedId) {
    const params = { linkedType, linkedId };
    if (organizationId) params.organizationId = organizationId;
    if (filters.projectId) params.projectId = filters.projectId;
    if (filters.kind) params.kind = filters.kind;
    if (filters.status) params.status = filters.status;
    if (filters.limit != null) params.limit = filters.limit;
    if (filters.includeContent != null) params.includeContent = filters.includeContent;
    return callEzmodoAPI('mcpListDesigns', params);
  }

  if (Array.isArray(designIds) && designIds.length > 0) {
    return getDesigns(designIds, fileOpts);
  }

  if (designId) {
    const fetched = await callEzmodoAPI('mcpGetDesign', { designId });
    const result = fetched?.design ? { ...fetched, ...(await toLocal(fetched.design, fileOpts)) } : fetched;
    if (includeLinks) {
      const links = await callEzmodoAPI('mcpListDesignLinks', { designId });
      result.links = links?.links ?? links;
    }
    return result;
  }

  // Fall back to list mode (organizationId + filters)
  return listDesigns({ organizationId, ...filters });
}

/**
 * List designs for an organization, optionally filtered by project/kind/status.
 */
export async function listDesigns(args) {
  const params = {};
  if (args.organizationId) params.organizationId = args.organizationId;
  if (args.projectId) params.projectId = args.projectId;
  if (args.kind) params.kind = args.kind;
  if (args.status) params.status = args.status;
  if (args.includeOrgWide != null) params.includeOrgWide = args.includeOrgWide;
  if (args.limit != null) params.limit = args.limit;
  if (args.includeContent != null) params.includeContent = args.includeContent;
  return callEzmodoAPI('mcpListDesigns', params);
}

/**
 * The most designs one get_design call fetches in full (E-279 #3047). The
 * design-system index exists so an agent pulls the two or three it needs; a
 * batch of fifty would put the old payload back one call later.
 */
export const MAX_DESIGN_IDS = 10;

/**
 * Fetch several designs in full, in the order asked. One request per design
 * against the single-design endpoint, so each is permission- and plan-checked
 * exactly as a single lookup is.
 */
async function getDesigns(designIds, fileOpts) {
  const ids = [...new Set(designIds)];
  if (ids.length > MAX_DESIGN_IDS) {
    throw new Error(
      `get_design takes at most ${MAX_DESIGN_IDS} designIds per call, got ${ids.length}. ` +
        'Fetch only the designs you need to match.'
    );
  }
  const results = await Promise.all(ids.map((id) => callEzmodoAPI('mcpGetDesign', { designId: id })));
  const designs = [];
  for (const r of results) {
    const d = r?.design ?? r;
    const local = await toLocal(d, fileOpts);
    designs.push(local.design ? { ...local.design, ...omit(local, 'design') } : d);
  }
  return { designs };
}

const CONTENT_FIELDS = ['html', 'css', 'description'];

function omit(obj, ...keys) {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Write a fetched design to `.ezmodo/designs/` and return its metadata and
 * file paths in place of its content (E-279 #3051). Returns `{ design }`
 * unchanged, content included, when inline is asked for or there is no local
 * `.ezmodo` directory (the remote connector).
 */
async function toLocal(design, { inline, overwriteLocal } = {}) {
  if (inline || !design?.id) return { design };
  let written;
  try {
    written = await writeDesignFiles(design, { overwriteLocal });
  } catch (err) {
    getLogger().warn('Failed to write design to local files', { error: err.message, designId: design.id });
    return { design };
  }
  if (!written) return { design };

  const meta = {
    ...omit(design, ...CONTENT_FIELDS),
    size: (design.html ?? '').length + (design.css ?? '').length,
  };
  if (written.localChanges) {
    return {
      design: meta,
      localDir: written.dir,
      localFiles: written.files,
      localChanges: written.localChanges,
      message:
        `NOT overwritten: ${written.localChanges.join(', ')} in ${written.dir} ha` +
        `${written.localChanges.length === 1 ? 's' : 've'} edits that were never pushed. Push them ` +
        `with manage_design action:"update" designId:"${design.id}" fromFiles:true, or pass ` +
        'overwriteLocal:true to discard them and download the current version.',
    };
  }
  return {
    design: meta,
    localDir: written.dir,
    localFiles: written.files,
    message:
      `Design written to ${written.dir} (index.html, styles.css, notes.md). Read the files you ` +
      'need. To change the design, edit them and push with manage_design action:"update" ' +
      `designId:"${design.id}" fromFiles:true.`,
  };
}

/**
 * Retrieve the design system (theme + components) for an org/project. Call this
 * first to learn the existing house style before authoring new UI.
 */
export async function getDesignSystem(args) {
  const params = {};
  if (args.organizationId) params.organizationId = args.organizationId;
  if (args.projectId) params.projectId = args.projectId;
  return callEzmodoAPI('mcpGetDesignSystem', params);
}

// --- Private helpers ---

async function createDesign(args) {
  // `links` is applied by the MCP layer after the design exists (E-225).
  const { links, ...createArgs } = args;
  const result = await callEzmodoAPI('mcpCreateDesign', createArgs);

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, {
    sourceType: 'design',
    sourceId: result?.designId || result?.design?.id,
    links,
  });

  return result;
}

async function updateDesign(args) {
  const { fromFiles, ...rest } = args;
  if (!fromFiles) return callEzmodoAPI('mcpUpdateDesign', rest);
  return pushDesignFiles(rest);
}

/**
 * `manage_design update fromFiles:true`: send the fields whose files were
 * edited since download, conditional on the version they were downloaded at
 * (E-279 #3051). The content goes from disk to the API without passing
 * through the model.
 */
async function pushDesignFiles(args) {
  const { designId } = args;
  if (!designId) throw new Error('designId is required');
  const inBoth = [...CONTENT_FIELDS, 'edits'].filter((k) => args[k] != null);
  if (inBoth.length > 0) {
    throw new Error(
      `fromFiles pushes html, css and description from the local files; do not also send ${inBoth.join(', ')}.`
    );
  }

  const local = await readDesignFiles(designId);
  const request = { ...args };
  for (const field of local.changed) request[field] = local.fields[field];
  request.expectedUpdatedAt = args.expectedUpdatedAt ?? local.meta?.updatedAt;

  const otherChanges = Object.keys(args).some((k) => !['designId', 'expectedUpdatedAt'].includes(k));
  if (local.changed.length === 0 && !otherChanges) {
    return { designId, localDir: local.dir, message: 'No local changes to push.' };
  }

  let result;
  try {
    result = await callEzmodoAPI('mcpUpdateDesign', request);
  } catch (err) {
    if (err.status !== 409) throw err;
    const latest = await callEzmodoAPI('mcpGetDesign', { designId });
    const mine = await setAsideAndRefresh(local.dir, latest.design);
    const aside = Object.values(mine).map((f) => path.basename(f)).join(', ');
    const e = new Error(
      `${err.message}. Nothing was pushed. The files in ${local.dir} now hold the current ` +
        `version, and yours are saved beside them (${aside}). ` +
        'Reapply your change to the current files, then push again.'
    );
    e.status = 409;
    throw e;
  }

  await recordPushed(local.dir, local.meta, local.fields, result?.design?.updatedAt ?? local.meta?.updatedAt);
  return {
    ...result,
    pushed: local.changed,
    localDir: local.dir,
  };
}

async function deleteDesign({ designId }) {
  return callEzmodoAPI('mcpDeleteDesign', { designId });
}

async function linkDesignArtifact({ designId, targetType, targetId }) {
  return callEzmodoAPI('mcpLinkDesign', { designId, targetType, targetId });
}

async function unlinkDesignArtifact({ designId, targetType, targetId }) {
  return callEzmodoAPI('mcpUnlinkDesign', { designId, targetType, targetId });
}
