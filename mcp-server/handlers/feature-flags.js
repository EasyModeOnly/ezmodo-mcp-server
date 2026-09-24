/**
 * Feature Flag Handlers
 * Handler functions for the Feature Flags MCP tools (E-149).
 *
 * Feature Flags are org-level (projectId nullable) PM-aware runtime gates that
 * LINK to the feature(s) they gate via the generic link graph. These handlers are
 * thin wrappers over /api/mcp/v1/feature-flags; dispatch, validation, prerequisite
 * resolution, and evaluation happen server-side in core/featureflags.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_feature_flag actions.
 */
export async function manageFeatureFlag(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createFeatureFlag(params);
  case 'update': return updateFeatureFlag(params);
  case 'delete': return deleteFeatureFlag(params);
  case 'transition': return transitionFeatureFlag(params);
  case 'link': return linkFeatureFlagArtifact(params);
  case 'unlink': return unlinkFeatureFlagArtifact(params);
  case 'set_environment_config': return setFeatureFlagEnvironmentConfig(params);
  default:
    throw new Error(
      `Unknown action: ${action}. Expected create, update, delete, transition, link, unlink, ` +
      'or set_environment_config.');
  }
}

/**
 * Dispatch manage_environment actions (E-186 environment registry).
 */
export async function manageEnvironment(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'list': return listEnvironments(params);
  case 'create': return callEzmodoAPI('mcpCreateEnvironment', params);
  case 'update': return callEzmodoAPI('mcpUpdateEnvironment', params);
  case 'delete': return callEzmodoAPI('mcpDeleteEnvironment', { environmentId: params.environmentId });
  case 'set_default': return callEzmodoAPI('mcpSetDefaultEnvironment', { environmentId: params.environmentId });
  default:
    throw new Error(`Unknown action: ${action}. Expected list, create, update, delete, or set_default.`);
  }
}

async function listEnvironments({ organizationId, projectId }) {
  const params = { organizationId };
  if (projectId) params.projectId = projectId;
  return callEzmodoAPI('mcpListEnvironments', params);
}

async function setFeatureFlagEnvironmentConfig({ flagId, environmentId, enabled, rolloutPercentage, defaultVariantId }) {
  const body = { flagId, environmentId, enabled, rolloutPercentage };
  if (defaultVariantId !== undefined) body.defaultVariantId = defaultVariantId;
  return callEzmodoAPI('mcpSetFlagEnvironmentConfig', body);
}

/**
 * Retrieve a single flag by ID or by organizationId + key (optionally + links).
 */
export async function getFeatureFlag(args) {
  const { includeLinks, flagId, organizationId, key } = args;

  const params = {};
  if (flagId) {
    params.flagId = flagId;
  } else if (organizationId && key) {
    params.organizationId = organizationId;
    params.key = key;
  } else {
    throw new Error('Provide flagId, or organizationId and key.');
  }

  const result = await callEzmodoAPI('mcpGetFeatureFlag', params);
  if (includeLinks) {
    const id = flagId || result?.featureFlag?.id || result?.id;
    if (id) {
      const links = await callEzmodoAPI('mcpListFeatureFlagLinks', { flagId: id });
      result.links = links?.links ?? links;
    }
  }
  return result;
}

/**
 * List an org's flags (filtered), or the flags linked to an entity.
 */
export async function listFeatureFlags(args) {
  const params = {};
  if (args.organizationId) params.organizationId = args.organizationId;
  if (args.linkedType && args.linkedId) {
    params.linkedType = args.linkedType;
    params.linkedId = args.linkedId;
    return callEzmodoAPI('mcpListFeatureFlags', params);
  }
  if (args.projectId) params.projectId = args.projectId;
  if (args.status) params.status = args.status;
  if (args.kind) params.kind = args.kind;
  if (args.includeOrgWide != null) params.includeOrgWide = args.includeOrgWide;
  if (args.limit != null) params.limit = args.limit;
  return callEzmodoAPI('mcpListFeatureFlags', params);
}

/**
 * Evaluate a flag for a subject — debugging affordance from chat.
 */
export async function evaluateFeatureFlag(args) {
  const params = { organizationId: args.organizationId, key: args.key };
  if (args.subjectId) params.subjectId = args.subjectId;
  if (args.environment) params.environment = args.environment;
  if (args.attributes) params.attributes = args.attributes;
  return callEzmodoAPI('mcpEvaluateFeatureFlag', params);
}

// --- Private helpers ---

async function createFeatureFlag(args) {
  return callEzmodoAPI('mcpCreateFeatureFlag', args);
}

async function updateFeatureFlag(args) {
  return callEzmodoAPI('mcpUpdateFeatureFlag', args);
}

async function deleteFeatureFlag({ flagId }) {
  return callEzmodoAPI('mcpDeleteFeatureFlag', { flagId });
}

async function transitionFeatureFlag({ flagId, status, reason }) {
  return callEzmodoAPI('mcpTransitionFeatureFlag', { flagId, status, reason });
}

async function linkFeatureFlagArtifact({ flagId, targetType, targetId }) {
  return callEzmodoAPI('mcpLinkFeatureFlag', { flagId, targetType, targetId });
}

async function unlinkFeatureFlagArtifact({ flagId, targetType, targetId }) {
  return callEzmodoAPI('mcpUnlinkFeatureFlag', { flagId, targetType, targetId });
}
