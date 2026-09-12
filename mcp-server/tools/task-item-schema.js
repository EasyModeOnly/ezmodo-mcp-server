/**
 * Shared per-item task schema for the batch create paths.
 *
 * Two tools create tasks in bulk: `create_tasks` (a batch under an existing
 * epic) and `manage_epic action:"create"` with a `tasks` array (an epic and its
 * breakdown in one request, #2247). They accept the SAME item, and duplicating
 * ~20 field descriptions across both is how the two drift apart — an agent then
 * learns that a field it may pass to one is not accepted by the other.
 *
 * The shared part deliberately excludes projectId and epicId. Those are batch-
 * level in `create_tasks` and fixed by the epic in the nested case, so each tool
 * adds them (or does not) for itself.
 */
import { TASK_TYPE_PROPERTY } from './task-type.js';

export const TASK_ITEM_PROPERTIES = {
  title: { type: 'string', description: 'Task title (required)' },
  description: {
    type: 'string',
    description: 'Task description (markdown). Explain WHY, WHERE and HOW, ' +
      'referencing specific file paths — same guidance as manage_task.',
  },
  steps: {
    type: 'array',
    items: { type: 'string' },
    description: 'Implementation steps referencing specific files',
  },
  priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
  status: {
    type: 'string',
    enum: ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'completed'],
    description: 'Initial status (defaults to todo)',
  },
  taskType: TASK_TYPE_PROPERTY,
  componentId: { type: 'string', description: 'DEPRECATED single component; overrides the shared componentId. Prefer componentIds.' },
  componentIds: {
    type: 'array',
    items: { type: 'string' },
    description: 'Every component this task touches; overrides the shared componentId/componentIds.',
  },
  parentTaskId: { type: 'string', description: 'Parent task link' },
  estimatedHours: { type: 'number' },
  assigneeType: { type: 'string', enum: ['human', 'ai'] },
  assigneeId: { type: 'string' },
  assigneeName: { type: 'string' },
  tagIds: { type: 'array', items: { type: 'string' } },
  origin: {
    type: 'string',
    enum: ['planned', 'discovered', 'scope-creep', 'rework', 'untracked'],
  },
  aiWork: { type: 'boolean' },
  changedFiles: {
    type: 'array',
    items: { type: 'string' },
    description: 'Repo-relative paths this task touches',
  },
};
