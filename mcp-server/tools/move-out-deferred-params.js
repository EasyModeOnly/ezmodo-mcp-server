/**
 * The move_out_deferred parameters (#3819), shared by manage_milestone and
 * manage_epic so the two actions cannot drift apart.
 */

export const MOVE_OUT_TARGET_TYPES = ['follow_up', 'epic', 'backlog', 'cancel'];

export const MOVE_OUT_DEFERRED_DESCRIPTION =
  '"move_out_deferred" moves deferred tasks out (any time, not only at release). Pass taskIds, or all:true ' +
  'for every deferred task in scope, and target: {type:"follow_up", milestoneId?} copies each task\'s epic as ' +
  '"E-<n> follow-up: <title>" (same description, tags, owner and feature links, linked back; an open ' +
  'follow-up in that milestone is reused; omit milestoneId for no milestone) and moves the tasks into it; ' +
  '{type:"epic", epicId} moves them into an open epic; {type:"backlog"} takes them out of any milestone ' +
  '(they leave their epic unless it has no milestone); {type:"cancel", reason} cancels them. Moved tasks ' +
  'stop being deferred and take back the status they had before (else backlog); the defer reason stays.';

export const MOVE_OUT_DEFERRED_PROPERTIES = {
  taskIds: {
    type: 'array',
    items: { type: 'string' },
    description: 'move_out_deferred: the deferred tasks to move (each must be deferred work in scope). ' +
      'Or pass all:true.',
  },
  all: {
    type: 'boolean',
    description: 'move_out_deferred: move every deferred task in scope',
  },
  target: {
    type: 'object',
    description: 'move_out_deferred: where the tasks go',
    properties: {
      type: { type: 'string', enum: MOVE_OUT_TARGET_TYPES },
      milestoneId: { type: 'string', description: 'follow_up: the follow-up epic\'s milestone (id or slug); omit for none' },
      epicId: { type: 'string', description: 'epic: the epic the tasks join' },
      reason: { type: 'string', description: 'cancel: why (required)' },
    },
    required: ['type'],
  },
};
