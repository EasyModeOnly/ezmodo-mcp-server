/**
 * The one definition of a task's kind.
 *
 * These four values are a Postgres enum (`task_type`, api migration 000001), so
 * this list is not a convention the tools agree on — it is a constraint the
 * database enforces, and a fifth value added here would be rejected on write.
 *
 * It lives in its own module because four unrelated tools need it and none of
 * them owns it: `manage_task`, the shared batch item in `task-item-schema.js`,
 * `manage_recurring_task` and `manage_work_template`. Three of those declared
 * their own copy of the same four strings, and `manage_task` — the tool agents
 * actually reach for — declared nothing at all, so a task's kind could be set
 * in bulk but never set or changed one at a time.
 */
export const TASK_TYPES = ['feature', 'bug', 'testing', 'chore'];

/**
 * The property as it appears in a tool's inputSchema. `description` is worth
 * carrying everywhere because task type is not decoration: it drives the
 * per-area open-bug count on the project overview, the milestone freeze gates,
 * and estimation weighting. An agent choosing a value should know that.
 */
export const TASK_TYPE_PROPERTY = {
  type: 'string',
  enum: TASK_TYPES,
  description:
    'The kind of work. Not cosmetic — "bug" feeds the per-area open-bug count ' +
    'on the project overview, milestone freezes gate on it (a "stabilization" ' +
    'freeze admits only bug and testing), and estimation weights past tasks of ' +
    'the same kind more heavily. Omit it and the task is stored as "feature". ' +
    'Prefer "testing" only for a task that verifies another task\'s work; it ' +
    'is expected to carry parentTaskId and drives the testing-split flow.',
};
