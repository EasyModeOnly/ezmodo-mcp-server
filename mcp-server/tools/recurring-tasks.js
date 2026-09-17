/**
 * Recurring Task Schedule Tools
 * MCP tools for the E-211 recurrence engine.
 *
 * A recurring task schedule is a durable record of "what task to create, on what
 * cadence, until when" (e.g. "every weekday at 9am for three weeks, create a
 * 'check app stats' task"). A scheduled runner instantiates the task each time
 * the schedule fires. The payload is either an inline task definition or a
 * reference to a work template (manage_work_template).
 */

import { TASK_TYPE_PROPERTY } from './task-type.js';

const RECURRENCE_SCHEMA = {
  type: 'object',
  description: 'The recurrence spec. Occurrences fire at atHour:atMinute local to timezone.',
  properties: {
    frequency: {
      type: 'string',
      enum: ['daily', 'weekly', 'monthly'],
      description: 'Base cadence.',
    },
    interval: {
      type: 'number',
      description: 'Every N units (e.g. interval 2 + weekly = biweekly). Must be >= 1. Default 1.',
    },
    byWeekdays: {
      type: 'array',
      items: { type: 'number' },
      description: 'Weekly only: weekdays to fire on, 0=Sunday .. 6=Saturday. Required for weekly.',
    },
    byMonthDay: {
      type: 'number',
      description: 'Monthly only: day-of-month 1..31 (clamped to shorter months). Required for monthly.',
    },
    atHour: { type: 'number', description: 'Hour of day 0..23.' },
    atMinute: { type: 'number', description: 'Minute of hour 0..59. Default 0.' },
    timezone: { type: 'string', description: 'IANA timezone (e.g. "America/New_York"). Default "UTC".' },
  },
  required: ['frequency'],
};

const INLINE_TASK_SCHEMA = {
  type: 'object',
  description: 'Inline task definition to create each time the schedule fires (alternative to templateId).',
  properties: {
    title: { type: 'string', description: 'Task title (required for an inline schedule).' },
    description: { type: 'string' },
    steps: { type: 'array', items: { type: 'string' } },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
    taskType: TASK_TYPE_PROPERTY,
    epicId: { type: 'string' },
    tagIds: { type: 'array', items: { type: 'string' } },
    assigneeId: { type: 'string' },
    assigneeName: { type: 'string' },
    assigneeType: { type: 'string', enum: ['human', 'ai'] },
  },
};

export const RECURRING_TASK_TOOLS = [
  {
    name: 'manage_recurring_task',
    description: 'Create, update, pause, resume, delete, list, or get a recurring task schedule ' +
      '(E-211). A schedule creates a task on a cadence (e.g. "every weekday at 9am for three weeks"). ' +
      'The payload is either an inlineTask definition OR a templateId (a work template). Returns the ' +
      'schedule including its computed nextRunAt so you can confirm when it will next fire.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'pause', 'resume', 'delete', 'list', 'get'],
          description: 'Action to perform. "pause"/"resume" toggle whether the runner fires the ' +
            'schedule (resume recomputes nextRunAt from now). "list" needs organizationId ' +
            '(optionally projectId); "get"/"update"/"pause"/"resume"/"delete" need scheduleId.',
        },
        // --- Identifiers ---
        organizationId: { type: 'string', description: 'Organization ID (required for create, list).' },
        projectId: {
          type: 'string',
          description: 'Project the created task(s) belong to (required for create; optional filter for list).',
        },
        scheduleId: {
          type: 'string',
          description: 'Schedule ID (required for get, update, pause, resume, delete).',
        },
        // --- Create / update fields ---
        title: {
          type: 'string',
          description: 'Human name for the schedule (required for create), e.g. "Daily app-stats check".',
        },
        recurrence: RECURRENCE_SCHEMA,
        startsAt: {
          type: 'string',
          description: 'ISO 8601 timestamp: earliest the schedule may fire (required for create).',
        },
        until: {
          type: 'string',
          description: 'ISO 8601 timestamp end bound (optional). The schedule stops after this time.',
        },
        count: {
          type: 'number',
          description: 'Max number of occurrences (optional end bound). The schedule stops after this many tasks.',
        },
        templateId: {
          type: 'string',
          description: 'A work template to instantiate each fire (mutually exclusive with inlineTask).',
        },
        inlineTask: INLINE_TASK_SCHEMA,
      },
      required: ['action'],
    },
  },
];
