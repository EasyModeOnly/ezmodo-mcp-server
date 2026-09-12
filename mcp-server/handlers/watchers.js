/**
 * Watching Handlers
 * Handler functions for task subscriptions and the notification inbox (E-41)
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Watch or unwatch a task.
 */
export async function manageWatch(args) {
  const { action, taskId } = args;

  if (action !== 'watch' && action !== 'unwatch') {
    throw new Error(`Unknown action: ${action}. Expected "watch" or "unwatch".`);
  }
  if (!taskId) {
    throw new Error('taskId is required');
  }

  return callZephlyAPI('mcpManageWatch', { action, taskId });
}

/**
 * List the tasks the caller is watching.
 */
export async function listWatched(args) {
  const { organizationId, limit, offset } = args;

  if (!organizationId) {
    throw new Error('organizationId is required');
  }

  return callZephlyAPI('mcpListWatched', {
    organizationId,
    ...(limit ? { limit } : {}),
    // offset 0 is the default, so sending it would only be query-string noise.
    ...(offset ? { offset } : {}),
  });
}

/**
 * List the caller's in-app notifications.
 */
export async function listNotifications(args = {}) {
  const { unreadOnly, limit } = args;

  return callZephlyAPI('mcpListNotifications', {
    // Only send unreadOnly when explicitly false — the API defaults to unread,
    // and sending the default back would just be noise in the query string.
    ...(unreadOnly === false ? { unreadOnly: false } : {}),
    ...(limit ? { limit } : {}),
  });
}
