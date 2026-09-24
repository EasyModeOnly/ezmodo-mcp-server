/**
 * Entity Access Handlers (#2170)
 *
 * Thin wrappers over /mcp/v1/access — the polymorphic entity-access surface.
 * All authorization happens server-side: the Go handlers share one
 * implementation with the REST routes (api/internal/api/handlers/access_ops.go),
 * so the permission thresholds cannot differ between the two transports and
 * there is nothing to enforce here.
 *
 * What this layer DOES owe the caller is honesty about parameters. Every field
 * below is forwarded to an endpoint that uses it, and a field that belongs to a
 * different action is rejected rather than dropped — the failure mode this whole
 * line of work exists to eliminate is a parameter that is advertised, accepted,
 * and silently discarded (#2168, #2169, #2171).
 */

import { callEzmodoAPI } from '../lib/http-client.js';

// Fields that only mean something for one action. Passing one to a different
// action is a mistake worth surfacing: silently ignoring `role` on a
// remove_entry call would look exactly like a successful role change.
const ACTION_ONLY_FIELDS = {
  update_settings: ['inheritFromParent', 'accessList', 'publicAccess'],
  add_entry: ['userId', 'teamId', 'role'],
  remove_entry: ['entryId'],
  check: ['requiredRole'],
};

const ALL_ACTIONS = Object.keys(ACTION_ONLY_FIELDS);

/**
 * Reject fields belonging to another action instead of dropping them.
 */
function rejectForeignFields(action, params) {
  const allowed = new Set(ACTION_ONLY_FIELDS[action]);
  const foreign = [];

  for (const [otherAction, fields] of Object.entries(ACTION_ONLY_FIELDS)) {
    if (otherAction === action) continue;
    for (const field of fields) {
      if (params[field] !== undefined && !allowed.has(field)) {
        foreign.push(`${field} (belongs to action "${otherAction}")`);
      }
    }
  }

  if (foreign.length > 0) {
    throw new Error(
      `manage_access action "${action}" does not use: ${foreign.join(', ')}. ` +
      'Remove the field or use the action it belongs to — it would otherwise be ' +
      'accepted and discarded, which reads as a successful change.'
    );
  }
}

/**
 * Read an entity's access settings. Requires viewer access to the entity.
 */
export async function getAccess({ entityType, entityId, organizationId }) {
  return callEzmodoAPI('mcpGetAccess', { entityType, entityId, organizationId });
}

/**
 * Dispatch manage_access to the appropriate operation.
 */
export async function manageAccess(args) {
  const { action, ...params } = args;

  if (!ALL_ACTIONS.includes(action)) {
    throw new Error(
      `Unknown action: ${action}. Expected one of: ${ALL_ACTIONS.join(', ')}.`
    );
  }

  rejectForeignFields(action, params);

  switch (action) {
  case 'update_settings': return updateAccessSettings(params);
  case 'add_entry': return addAccessEntry(params);
  case 'remove_entry': return removeAccessEntry(params);
  case 'check': return checkAccess(params);
  }
}

/**
 * Replace an entity's access configuration. Requires admin on the entity and
 * the write:access scope.
 */
async function updateAccessSettings({
  entityType, entityId, organizationId, inheritFromParent, accessList, publicAccess,
}) {
  const body = { entityType, entityId, organizationId };
  // Only forward what was actually set: these are tri-state server-side
  // (unset means "leave alone"), so sending explicit nulls would clear them.
  if (inheritFromParent !== undefined) body.inheritFromParent = inheritFromParent;
  if (accessList !== undefined) body.accessList = accessList;
  if (publicAccess !== undefined) body.publicAccess = publicAccess;

  if (Object.keys(body).length === 3) {
    throw new Error(
      'manage_access action "update_settings" needs at least one of ' +
      'inheritFromParent, accessList, or publicAccess.'
    );
  }

  return callEzmodoAPI('mcpUpdateAccess', body);
}

/**
 * Grant one user or team a role. Requires admin on the entity and the
 * write:access scope.
 */
async function addAccessEntry({ entityType, entityId, organizationId, userId, teamId, role }) {
  const body = { entityType, entityId, organizationId, role };
  if (userId) body.userId = userId;
  if (teamId) body.teamId = teamId;
  return callEzmodoAPI('mcpAddAccessEntry', body);
}

/**
 * Revoke a single access entry. Requires admin on the entity and the
 * write:access scope.
 */
async function removeAccessEntry({ entityType, entityId, organizationId, entryId }) {
  return callEzmodoAPI('mcpRemoveAccessEntry', {
    entityType,
    entityId,
    organizationId,
    entryId,
  });
}

/**
 * Report whether the calling key's user holds a role on the entity. A denial is
 * a normal successful response carrying granted:false.
 */
async function checkAccess({ entityType, entityId, organizationId, requiredRole }) {
  const body = { entityType, entityId, organizationId };
  if (requiredRole) body.requiredRole = requiredRole;
  return callEzmodoAPI('mcpCheckAccess', body);
}
