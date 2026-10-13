/**
 * Changelog Handlers (#3219)
 * Handler functions for list_changelog, get_changelog_entry and
 * manage_changelog.
 *
 * Every route is project-scoped ({projectId} in the path); the API authorizes
 * it exactly like the web app's Changelog tab.
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

/**
 * List the project's changelog entries (no bodies), candidates and
 * verified subscriber count.
 */
export async function listChangelog(args = {}) {
  requireFields('list_changelog', args, ['projectId']);
  return callEzmodoAPI('mcpListChangelog', { projectId: args.projectId });
}

/**
 * Get one changelog entry with its body.
 */
export async function getChangelogEntry(args = {}) {
  requireFields('get_changelog_entry', args, ['projectId', 'entryId']);
  return callEzmodoAPI('mcpGetChangelogEntry', { projectId: args.projectId, entryId: args.entryId });
}

/**
 * Dispatch manage_changelog actions.
 */
export async function manageChangelog(args = {}) {
  const { action, ...params } = args;
  const handler = ACTIONS[action];
  if (!handler) {
    throw new Error(`Unknown action: ${action}. Expected one of: ${Object.keys(ACTIONS).join(', ')}`);
  }
  requireFields(action, params, ['projectId']);
  return handler(action, params);
}

const ACTIONS = {
  draft(action, p) {
    requireFields(action, p, ['milestoneId']);
    return callEzmodoAPI('mcpDraftChangelogEntry', { projectId: p.projectId, milestoneId: p.milestoneId });
  },
  update(action, p) {
    requireFields(action, p, ['entryId']);
    const { projectId, entryId, title, version, body } = p;
    const patch = defined({ title, version, body });
    if (Object.keys(patch).length === 0) {
      throw new Error('update needs at least one of: title, version, body');
    }
    return callEzmodoAPI('mcpUpdateChangelogEntry', { projectId, entryId, ...patch });
  },
  publish: entryAction('mcpPublishChangelogEntry'),
  unpublish: entryAction('mcpUnpublishChangelogEntry'),
};

function entryAction(endpoint) {
  return (action, p) => {
    requireFields(action, p, ['entryId']);
    return callEzmodoAPI(endpoint, { projectId: p.projectId, entryId: p.entryId });
  };
}
