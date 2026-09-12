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

import { callZephlyAPI } from '../lib/http-client.js';
import { attachLinks } from '../lib/links-at-create.js';

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
  const { includeLinks, designId, organizationId, linkedType, linkedId, ...filters } = args;

  if (linkedType && linkedId) {
    const params = { linkedType, linkedId };
    if (organizationId) params.organizationId = organizationId;
    if (filters.projectId) params.projectId = filters.projectId;
    if (filters.kind) params.kind = filters.kind;
    if (filters.status) params.status = filters.status;
    if (filters.limit != null) params.limit = filters.limit;
    return callZephlyAPI('mcpListDesigns', params);
  }

  if (designId) {
    const result = await callZephlyAPI('mcpGetDesign', { designId });
    if (includeLinks) {
      const links = await callZephlyAPI('mcpListDesignLinks', { designId });
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
  return callZephlyAPI('mcpListDesigns', params);
}

/**
 * Retrieve the design system (theme + components) for an org/project. Call this
 * first to learn the existing house style before authoring new UI.
 */
export async function getDesignSystem(args) {
  const params = {};
  if (args.organizationId) params.organizationId = args.organizationId;
  if (args.projectId) params.projectId = args.projectId;
  return callZephlyAPI('mcpGetDesignSystem', params);
}

// --- Private helpers ---

async function createDesign(args) {
  // `links` is applied by the MCP layer after the design exists (E-225).
  const { links, ...createArgs } = args;
  const result = await callZephlyAPI('mcpCreateDesign', createArgs);

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, {
    sourceType: 'design',
    sourceId: result?.designId || result?.design?.id,
    links,
  });

  return result;
}

async function updateDesign(args) {
  return callZephlyAPI('mcpUpdateDesign', args);
}

async function deleteDesign({ designId }) {
  return callZephlyAPI('mcpDeleteDesign', { designId });
}

async function linkDesignArtifact({ designId, targetType, targetId }) {
  return callZephlyAPI('mcpLinkDesign', { designId, targetType, targetId });
}

async function unlinkDesignArtifact({ designId, targetType, targetId }) {
  return callZephlyAPI('mcpUnlinkDesign', { designId, targetType, targetId });
}
