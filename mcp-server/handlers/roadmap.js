/**
 * Roadmap Handlers (#3233)
 * manage_roadmap's actions. Every route is project-scoped ({projectId} in the
 * path); the API authorizes it exactly like the web app's Roadmap tab.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/** Drop undefined values so they are not sent as body fields. */
function defined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function requireFields(action, args, fields) {
  for (const field of fields) {
    if (args[field] === undefined || args[field] === null || args[field] === '') {
      throw new Error(`${field} is required for ${action}`);
    }
  }
}

const CARD_FIELDS = ['title', 'summary', 'column', 'entityType', 'entityId', 'showTargetDate'];

function pick(p, fields) {
  return defined(Object.fromEntries(fields.map((f) => [f, p[f]])));
}

/**
 * Dispatch manage_roadmap actions.
 */
export async function manageRoadmap(args = {}) {
  const { action, ...params } = args;
  const handler = ACTIONS[action];
  if (!handler) {
    throw new Error(`Unknown action: ${action}. Expected one of: ${Object.keys(ACTIONS).join(', ')}`);
  }
  requireFields(action, params, ['projectId']);
  return handler(action, params);
}

const ACTIONS = {
  create(action, p) {
    requireFields(action, p, ['title']);
    return callEzmodoAPI('mcpCreateRoadmapItem', { projectId: p.projectId, ...pick(p, CARD_FIELDS) });
  },
  update(action, p) {
    requireFields(action, p, ['itemId']);
    const patch = pick(p, CARD_FIELDS);
    if (Object.keys(patch).length === 0) {
      throw new Error(`update needs at least one of: ${CARD_FIELDS.join(', ')}`);
    }
    return callEzmodoAPI('mcpUpdateRoadmapItem', { projectId: p.projectId, itemId: p.itemId, ...patch });
  },
  delete: itemAction('mcpDeleteRoadmapItem'),
  ship: itemAction('mcpShipRoadmapItem'),
  reorder(action, p) {
    requireFields(action, p, ['column']);
    if (!Array.isArray(p.ids)) {
      throw new Error('ids is required for reorder: every card id in the column, top to bottom');
    }
    return callEzmodoAPI('mcpReorderRoadmapItems', { projectId: p.projectId, column: p.column, ids: p.ids });
  },
  link_issue: issueAction('mcpLinkRoadmapIssue'),
  unlink_issue: issueAction('mcpUnlinkRoadmapIssue'),
};

function itemAction(endpoint) {
  return (action, p) => {
    requireFields(action, p, ['itemId']);
    return callEzmodoAPI(endpoint, { projectId: p.projectId, itemId: p.itemId });
  };
}

function issueAction(endpoint) {
  return (action, p) => {
    requireFields(action, p, ['itemId', 'number']);
    return callEzmodoAPI(endpoint, { projectId: p.projectId, itemId: p.itemId, number: p.number });
  };
}
