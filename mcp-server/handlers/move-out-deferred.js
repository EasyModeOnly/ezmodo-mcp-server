/**
 * move_out_deferred (#3819): move deferred tasks out of a milestone or an
 * epic, into a follow-up copy of their epic, another epic, the backlog, or
 * cancelled. Shared by manage_milestone and manage_epic.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/** The body both routes take, checked before anything is sent. */
function moveOutBody({ taskIds, all, target }) {
  const hasIds = Array.isArray(taskIds) && taskIds.length > 0;
  if (hasIds === Boolean(all)) {
    throw new Error('move_out_deferred needs taskIds or all:true (not both).');
  }
  if (!target || !target.type) {
    throw new Error('move_out_deferred needs target: {type: follow_up | epic | backlog | cancel}.');
  }
  const body = { target };
  if (hasIds) body.taskIds = taskIds;
  if (all) body.all = true;
  return body;
}

/** Move deferred work out of a milestone (id or slug). */
export async function moveOutDeferredFromMilestone(args) {
  const { projectId, milestoneId, milestoneSlug } = args;
  const id = milestoneSlug || milestoneId;
  if (!id) throw new Error('move_out_deferred needs milestoneId or milestoneSlug.');
  return callEzmodoAPI('mcpMoveOutDeferredFromMilestone', { id, projectId, ...moveOutBody(args) });
}

/** Move one epic's deferred work out. */
export async function moveOutDeferredFromEpic(args) {
  const { epicId } = args;
  if (!epicId) throw new Error('move_out_deferred needs epicId.');
  return callEzmodoAPI('mcpMoveOutDeferredFromEpic', { id: epicId, ...moveOutBody(args) });
}
