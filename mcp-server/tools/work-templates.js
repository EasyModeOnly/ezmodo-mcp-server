/**
 * Work Template Tools
 * MCP tools for E-211 task/epic templates (work_templates).
 *
 * A work template is a reusable blueprint for a task or an epic (a `kind`). A
 * task template carries a taskBlueprint; an epic template carries an
 * epicBlueprint with a nested child-task list. Templates are org-level (or
 * project-scoped) and are instantiated either manually (action "instantiate") or
 * by a recurring task schedule (manage_recurring_task with a templateId).
 */

import { TASK_TYPE_PROPERTY } from './task-type.js';

const TASK_BLUEPRINT_SCHEMA = {
  type: 'object',
  description: 'Reusable task shape (used when kind="task", and as each child of an epic template).',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    taskType: TASK_TYPE_PROPERTY,
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
    tagIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['title'],
};

const EPIC_BLUEPRINT_SCHEMA = {
  type: 'object',
  description: 'Reusable epic shape (used when kind="epic"), including its child tasks.',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    status: { type: 'string' },
    color: { type: 'string' },
    tasks: {
      type: 'array',
      items: TASK_BLUEPRINT_SCHEMA,
      description: 'Child tasks created under the epic on instantiation.',
    },
  },
  required: ['title'],
};

export const WORK_TEMPLATE_TOOLS = [
  {
    name: 'manage_work_template',
    description: 'Create, update, delete, list, get, or instantiate a work template (E-211) — a ' +
      'reusable blueprint for a task or an epic. "instantiate" creates a real task (kind=task) or an ' +
      'epic plus its child tasks (kind=epic) into a project, applying optional overrides. Templates ' +
      'can also be referenced by a recurring schedule (manage_recurring_task templateId).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'list', 'get', 'instantiate'],
          description: 'Action to perform. "list" needs organizationId (optional kind filter); ' +
            '"get"/"update"/"delete"/"instantiate" need templateId. "create" needs organizationId, ' +
            'kind, name, and the matching blueprint.',
        },
        // --- Identifiers ---
        organizationId: { type: 'string', description: 'Organization ID (required for create, list).' },
        templateId: { type: 'string', description: 'Template ID (required for get, update, delete, instantiate).' },
        projectId: {
          type: 'string',
          description: 'Scope the template to a project (create/update; omit = org-wide). For ' +
            'instantiate this is REQUIRED — the project the task/epic is created into.',
        },
        // --- Create / update fields ---
        kind: { type: 'string', enum: ['task', 'epic'], description: 'Template kind (required for create).' },
        name: { type: 'string', description: 'Template name (required for create).' },
        description: { type: 'string', description: 'What the template is for.' },
        category: { type: 'string', description: 'Org-scoped categorization.' },
        taskBlueprint: TASK_BLUEPRINT_SCHEMA,
        epicBlueprint: EPIC_BLUEPRINT_SCHEMA,
        // --- Instantiate overrides ---
        title: { type: 'string', description: 'Instantiate: override the blueprint title.' },
        epicId: { type: 'string', description: 'Instantiate (task kind): attach the new task to this epic.' },
        milestoneId: { type: 'string', description: 'Instantiate (epic kind): link the new epic to this milestone.' },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Instantiate: override priority.',
        },
        assigneeId: { type: 'string', description: 'Instantiate (task kind): assignee ID.' },
        assigneeName: { type: 'string', description: 'Instantiate (task kind): assignee name.' },
        assigneeType: { type: 'string', enum: ['human', 'ai'], description: 'Instantiate (task kind): assignee type.' },
        tagIds: { type: 'array', items: { type: 'string' }, description: 'Instantiate: tag IDs to apply.' },
      },
      required: ['action'],
    },
  },
];
