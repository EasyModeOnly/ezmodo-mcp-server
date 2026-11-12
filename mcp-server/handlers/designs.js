/**
 * Design Handlers
 * Handler functions for the Designs MCP tools (the in-product living design system).
 *
 * A Design is an AI-authored HTML/CSS artifact (kind ∈ theme|component|page) that
 * captures the house style. A design belongs to a project (E-326); the workspace's
 * shared-library project holds what every project sees. Designs LINK to features
 * and other artifacts via the generic link graph. These handlers are
 * thin wrappers over /api/mcp/v1/designs; dispatch and validation happen
 * server-side in core/designs.Service.
 */

import path from 'path';
import { localProjectFor } from '../lib/local-project.js';
import { callEzmodoAPI } from '../lib/http-client.js';
import { getLogger } from '../lib/logger.js';
import { attachLinks } from '../lib/links-at-create.js';
import { buildDesignUrl } from '../lib/web-url.js';
import {
  readDesignFiles,
  recordPushed,
  setAsideAndRefresh,
  writeDesignFiles,
} from '../lib/design-files.js';
import { historyMode, staleRestoreMessage, summarizeEntry } from '../lib/version-history.js';

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
  case 'restore': return restoreDesign(params);
  default:
    throw new Error(`Unknown action: ${action}. Expected create, update, delete, link, unlink, or restore.`);
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
    includeHistory, historyEntryId, diffFrom, diffTo, historyLimit, historyBefore,
    ...filters
  } = args;
  const fileOpts = { inline, overwriteLocal };
  const mode = historyMode({ includeHistory, historyEntryId, diffFrom, diffTo });
  if (mode && !designId) {
    throw new Error('History needs a single design: pass designId.');
  }
  if (mode === 'diff' || mode === 'entry') {
    return getDesignVersion({ designId, organizationId, historyEntryId, diffFrom, diffTo });
  }

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
    // designId may be a slug when organizationId is given (#3490).
    const fetched = await callEzmodoAPI('mcpGetDesign', organizationId ? { designId, organizationId } : { designId });
    const result = fetched?.design ? { ...fetched, ...(await toLocal(fetched.design, fileOpts)) } : fetched;
    await withWebUrl(result?.design);
    if (includeLinks) {
      const links = await callEzmodoAPI('mcpListDesignLinks', { designId });
      result.links = links?.links ?? links;
    }
    if (mode === 'list') {
      Object.assign(result, await listDesignHistory(result?.design?.id ?? designId, historyLimit, historyBefore));
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
    designs.push(await withWebUrl(local.design ? { ...local.design, ...omit(local, 'design') } : d));
  }
  return { designs };
}

/**
 * Set `webUrl` on a design object (#3490), so agents link to the design the
 * page will actually open instead of building the URL by hand. Leaves the
 * object alone when no URL can be built (see buildDesignUrl).
 */
async function withWebUrl(design) {
  if (!design || typeof design !== 'object') return design;
  const webUrl = await buildDesignUrl(design);
  if (webUrl) design.webUrl = webUrl;
  return design;
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
 * The design's id. History routes take an id; designId may be a slug when
 * organizationId is given (#3490), so that case resolves it first.
 */
async function resolveDesignId(designId, organizationId) {
  if (!organizationId) return designId;
  const fetched = await callEzmodoAPI('mcpGetDesign', { designId, organizationId });
  const id = fetched?.design?.id;
  if (!id) throw new Error(`Design not found: "${designId}".`);
  return id;
}

/**
 * One version (historyEntryId) or a diff (diffFrom/diffTo) of a design,
 * returned inline: a past version is read-only, so it is never written over
 * the editable files in .ezmodo/designs (E-300 #3409).
 */
async function getDesignVersion({ designId, organizationId, historyEntryId, diffFrom, diffTo }) {
  const id = await resolveDesignId(designId, organizationId);
  if (diffFrom != null) {
    const params = { designId: id, from: diffFrom };
    if (diffTo != null) params.to = diffTo;
    return callEzmodoAPI('mcpDiffDesignHistory', params);
  }
  const entry = await callEzmodoAPI('mcpGetDesignHistoryEntry', { designId: id, entryId: historyEntryId });
  return {
    ...(entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : { entry }),
    message: 'A past version, returned inline and read-only: pushing local files never sends it. ' +
      'To make it current, use manage_design action:"restore" with this historyEntryId and the ' +
      'design\'s current updatedAt as expectedUpdatedAt.',
  };
}

/** includeHistory: the design's versions, newest first, without their markup. */
async function listDesignHistory(designId, limit, before) {
  const params = { designId };
  if (limit != null) params.limit = limit;
  if (before != null) params.before = before;
  const listed = await callEzmodoAPI('mcpListDesignHistory', params);
  const entries = listed?.history ?? [];
  const out = {
    history: entries.map((e) => summarizeEntry(e, CONTENT_FIELDS)),
    historyHasMore: Boolean(listed?.hasMore),
  };
  if (out.historyHasMore && entries.length > 0) {
    out.historyNextBefore = entries[entries.length - 1].changedAt;
  }
  return out;
}

/**
 * Retrieve the design system (theme + components) for an org/project. Call this
 * first to learn the existing house style before authoring new UI.
 */
export async function getDesignSystem(args) {
  const params = {};
  if (args.organizationId) params.organizationId = args.organizationId;
  // Scoped to this checkout's project unless told otherwise (#3676): unscoped,
  // the theme may belong to another project.
  const projectId = args.projectId || (await localProjectFor(args.organizationId));
  if (projectId) params.projectId = projectId;
  return callEzmodoAPI('mcpGetDesignSystem', params);
}

// --- Private helpers ---

async function createDesign(args) {
  // `links` is applied by the MCP layer after the design exists (E-225).
  const { links, ...createArgs } = args;
  // A design belongs to a project (E-326): default to this checkout's.
  if (!createArgs.projectId) {
    const local = await localProjectFor(createArgs.organizationId);
    if (local) createArgs.projectId = local;
  }
  const result = await callEzmodoAPI('mcpCreateDesign', createArgs);
  await withWebUrl(result?.design);

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
  const result = fromFiles ? await pushDesignFiles(rest) : await callEzmodoAPI('mcpUpdateDesign', rest);
  await withWebUrl(result?.design);
  return result;
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

/**
 * manage_design action:"restore": make a history entry the current version,
 * conditional on the version the agent read, as an update is (E-300 #3409).
 */
async function restoreDesign({ designId, historyEntryId, expectedUpdatedAt }) {
  if (!designId) throw new Error('designId is required for restore');
  if (!historyEntryId) {
    throw new Error('historyEntryId is required for restore: list them with get_design includeHistory:true.');
  }
  if (!expectedUpdatedAt) {
    throw new Error(
      'expectedUpdatedAt is required for restore: the updatedAt you read the design at, from get_design. ' +
        'It stops a restore from silently discarding an edit made since.'
    );
  }
  let result;
  try {
    result = await callEzmodoAPI('mcpRestoreDesignHistory', { designId, entryId: historyEntryId, expectedUpdatedAt });
  } catch (err) {
    if (err.status !== 409) throw err;
    const e = new Error(staleRestoreMessage('design', designId, err.message));
    e.status = 409;
    throw e;
  }
  await withWebUrl(result?.design);
  return {
    ...result,
    message: 'Restored. Any local files for this design in .ezmodo/designs still hold the version ' +
      'before the restore: fetch it again with get_design before editing them.',
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
