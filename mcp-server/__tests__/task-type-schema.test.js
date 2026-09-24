import { jest } from '@jest/globals';

import { TASK_TYPES, TASK_TYPE_PROPERTY } from '../tools/task-type.js';
import { TASK_ITEM_PROPERTIES } from '../tools/task-item-schema.js';
import { TASK_TOOLS } from '../tools/tasks.js';
import { RECURRING_TASK_TOOLS } from '../tools/recurring-tasks.js';
import { WORK_TEMPLATE_TOOLS } from '../tools/work-templates.js';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const tool = (tools, name) => tools.find((t) => t.name === name);

/*
  Task type is a Postgres enum (api migration 000001), so these four values are
  a database constraint rather than a convention the tools agree on. Three tools
  used to declare their own copy of them and manage_task — the tool agents
  actually reach for — declared nothing at all, so a task's kind could be set in
  bulk but never set or changed one at a time.
*/

describe('task type is declared once', () => {
  it('matches the Postgres enum', () => {
    // Adding a value here without adding it to the enum in api migration 000001
    // produces a tool that advertises a write the database rejects.
    expect(TASK_TYPES).toEqual(['feature', 'bug', 'testing', 'chore']);
  });

  it('is the same object everywhere it appears, not a copy', () => {
    // A copy is how the four drifted apart in the first place. Identity, not
    // deep equality: equal-today copies are exactly what this guards against.
    expect(TASK_ITEM_PROPERTIES.taskType).toBe(TASK_TYPE_PROPERTY);

    const recurring = tool(RECURRING_TASK_TOOLS, 'manage_recurring_task');
    const inlineTask = recurring.inputSchema.properties.inlineTask;
    expect(inlineTask.properties.taskType).toBe(TASK_TYPE_PROPERTY);

    const template = tool(WORK_TEMPLATE_TOOLS, 'manage_work_template');
    const blueprint = template.inputSchema.properties.taskBlueprint;
    expect(blueprint.properties.taskType).toBe(TASK_TYPE_PROPERTY);
  });

  it('tells an agent what the field actually drives', () => {
    // The enum alone does not say that "bug" feeds a metric on the project
    // overview and that freezes gate on the value, which is what makes the
    // choice matter.
    expect(TASK_TYPE_PROPERTY.description).toMatch(/open-bug count/);
    expect(TASK_TYPE_PROPERTY.description).toMatch(/freeze/);
  });
});

describe('manage_task exposes taskType', () => {
  const manageTask = () => tool(TASK_TOOLS, 'manage_task');

  it('offers the field at all', () => {
    // The regression: this tool had no taskType property on either action, so
    // only the bulk create paths could set a kind.
    const taskType = manageTask().inputSchema.properties.taskType;
    expect(taskType).toBeDefined();
    expect(taskType.enum).toEqual(TASK_TYPES);
  });

  it('says it works on update, and how to clear it', () => {
    const { description } = manageTask().inputSchema.properties.taskType;
    expect(description).toMatch(/create and update/);
    expect(description).toMatch(/clear/);
  });

  it('supports both the actions the description claims', () => {
    expect(manageTask().inputSchema.properties.action.enum).toEqual(
      expect.arrayContaining(['create', 'update']),
    );
  });
});

describe('create_tasks parity with manage_task', () => {
  it('accepts every field manage_task action:"create" does, taskType included', () => {
    // create_tasks describes its items as taking "the same fields as manage_task
    // action:create". That claim was false for taskType, which create_tasks had
    // and manage_task did not.
    const items = tool(TASK_TOOLS, 'create_tasks').inputSchema.properties.tasks.items;
    const manageTaskProps = tool(TASK_TOOLS, 'manage_task').inputSchema.properties;

    expect(items.properties.taskType).toBeDefined();

    // Anything a batch item accepts must be settable one at a time too, or the
    // parity sentence is wrong again. projectId/epicId are batch-level and are
    // re-declared per item as overrides, so they are expected on both sides.
    const missingFromManageTask = Object.keys(items.properties).filter(
      (key) => !(key in manageTaskProps),
    );
    expect(missingFromManageTask).toEqual([]);
  });
});
