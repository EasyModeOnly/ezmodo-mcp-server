import { jest } from '@jest/globals';

// E-265: reminders on manage_task and due dates/reminders on manage_todo.
const mockCallEzmodoAPI = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/active-session.js', () => ({
  writeActiveSession: jest.fn(),
  clearActiveSession: jest.fn(),
}));
jest.unstable_mockModule('../lib/web-url.js', () => ({
  buildTaskUrl: jest.fn(),
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { manageTask } = await import('../handlers/tasks.js');
const { manageTodo } = await import('../handlers/todos.js');
const { TODO_TOOLS } = await import('../tools/todos.js');
const { TASK_TOOLS } = await import('../tools/tasks.js');

describe('manage_task reminders', () => {
  afterEach(() => jest.clearAllMocks());

  it('adds and removes reminders on a task', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ reminders: [] });
    await manageTask({
      action: 'reminders',
      taskId: 't1',
      reminders: { add: [{ remindAt: '2026-10-02T09:00' }], remove: ['r9'] },
    });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpTaskReminders', {
      taskId: 't1',
      add: [{ remindAt: '2026-10-02T09:00' }],
      remove: ['r9'],
    });
  });

  it('lists upcoming reminders when no taskId is given', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ reminders: [] });
    await manageTask({ action: 'reminders' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListReminders', {});
  });

  it('refuses to add without a taskId', async () => {
    await expect(manageTask({ action: 'reminders', reminders: { add: [{ remindAt: 'x' }] } }))
      .rejects.toThrow(/taskId is required/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('an update that only changes reminders does not call the task update', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ reminders: [] });
    await manageTask({ action: 'update', taskId: 't1', reminders: { add: [{ relativeToDue: '1d' }] } });
    expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpTaskReminders', expect.objectContaining({ taskId: 't1' }));
  });

  it('an update with other fields strips reminders from the task payload', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ taskId: 't1' })
      .mockResolvedValueOnce({ reminders: [{ id: 'r1' }], timezoneNote: 'UTC assumed' });
    const result = await manageTask({
      action: 'update', taskId: 't1', priority: 'high', reminders: { add: [{ remindAt: '2026-10-02T09:00' }] },
    });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpUpdateTask', { taskId: 't1', priority: 'high' });
    expect(result.reminders).toEqual([{ id: 'r1' }]);
    expect(result.timezoneNote).toBe('UTC assumed');
  });

  it('declares the reminders action and parameter', () => {
    const tool = TASK_TOOLS.find((t) => t.name === 'manage_task');
    expect(tool.inputSchema.properties.action.enum).toContain('reminders');
    expect(tool.inputSchema.properties.reminders.properties.add.items.properties).toHaveProperty('relativeToDue');
  });
});

describe('manage_todo due dates and reminders', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes dueDate and remindAt through on create', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ todoId: 'td1' });
    await manageTodo({ action: 'create', title: 'Rotate keys', dueDate: '2026-10-02', remindAt: '2026-10-01T09:00' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateTodo', {
      title: 'Rotate keys', dueDate: '2026-10-02', remindAt: '2026-10-01T09:00',
    });
  });

  it('updates a todo', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ todo: {} });
    await manageTodo({ action: 'update', todoId: 'td1', dueDate: '' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateTodo', { todoId: 'td1', dueDate: '' });
  });

  it('requires a todoId to update', async () => {
    await expect(manageTodo({ action: 'update', dueDate: '2026-10-02' })).rejects.toThrow(/todoId is required/);
  });

  it('declares update, dueDate and reminders in the schema', () => {
    const props = TODO_TOOLS.find((t) => t.name === 'manage_todo').inputSchema.properties;
    expect(props.action.enum).toContain('update');
    for (const key of ['dueDate', 'remindAt', 'remindBeforeDue', 'timezone', 'priority']) {
      expect(props).toHaveProperty(key);
    }
  });
});
