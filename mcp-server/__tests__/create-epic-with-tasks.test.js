import { jest } from '@jest/globals';

// Same isolation pattern as epics.test.js: mock the HTTP client and the
// side-effecting lib deps so the real handler logic runs.
const mockCallZephlyAPI = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));
jest.unstable_mockModule('../lib/auto-assign.js', () => ({
  resolveEpicAutoAssign: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule('../lib/web-url.js', () => ({
  buildEpicUrl: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule('../lib/links-at-create.js', () => ({
  attachLinks: jest.fn(),
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { manageEpic } = await import('../handlers/epics.js');

const epicWithTasks = (created, failed = 0) => ({
  epicId: 'epic-1',
  epicNumber: 7,
  tasks: {
    created,
    failed,
    results: [
      ...Array.from({ length: created }, (_, i) => ({
        index: i, taskId: `t${i}`, taskNumber: i + 1, title: `Task ${i + 1}`,
      })),
      ...Array.from({ length: failed }, (_, i) => ({
        index: created + i, title: `Bad ${i + 1}`, error: 'title is required',
      })),
    ],
  },
});

describe('manage_epic action:"create" with nested tasks', () => {
  afterEach(() => jest.clearAllMocks());

  // The whole point: an epic and its breakdown in ONE request, so a failure
  // can no longer land between create_epic and create_tasks.
  it('sends the epic and its tasks in a single request', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce(epicWithTasks(3));

    const result = await manageEpic({
      action: 'create',
      projectId: 'proj-1',
      title: 'Breakdown epic',
      componentId: 'comp-1',
      tasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
    });

    expect(mockCallZephlyAPI).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = mockCallZephlyAPI.mock.calls[0];
    expect(endpoint).toBe('mcpCreateEpicWithTasks');
    expect(payload.projectId).toBe('proj-1');
    expect(payload.componentId).toBe('comp-1');
    expect(payload.tasks).toHaveLength(3);
    expect(result.epicId).toBe('epic-1');
    expect(result.taskNumbers).toEqual([1, 2, 3]);
  });

  // Without tasks nothing changes: the plain create must keep using the plain
  // endpoint, which is what keeps this an addition rather than a migration.
  it('still uses the plain epic endpoint when no tasks are given', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ epicId: 'epic-2', epicNumber: 8 });

    const result = await manageEpic({
      action: 'create', projectId: 'proj-1', title: 'Bare epic',
    });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateEpic', {
      projectId: 'proj-1', title: 'Bare epic',
    });
    expect(result.epicId).toBe('epic-2');
    // No task summary to report when no tasks were requested.
    expect(result.message).toBeUndefined();
  });

  it('treats an empty tasks array as no tasks', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ epicId: 'epic-3', epicNumber: 9 });

    await manageEpic({
      action: 'create', projectId: 'proj-1', title: 'Bare epic', tasks: [],
    });

    expect(mockCallZephlyAPI.mock.calls[0][0]).toBe('mcpCreateEpic');
  });

  // A partial failure must be impossible to miss, and the advice must steer the
  // caller away from re-running the create — that would make a SECOND epic on
  // top of duplicating the tasks that already landed.
  it('surfaces failed items separately and says to keep the epic', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce(epicWithTasks(2, 1));

    const result = await manageEpic({
      action: 'create',
      projectId: 'proj-1',
      title: 'Breakdown epic',
      tasks: [{ title: 'A' }, { title: 'B' }, { title: '' }],
    });

    expect(result.epicId).toBe('epic-1');
    expect(result.failures).toEqual([
      { index: 2, title: 'Bad 1', error: 'title is required' },
    ]);
    expect(result.message).toMatch(/retry ONLY/);
    expect(result.taskNumbers).toEqual([1, 2]);
  });

  // The epic exists even when the whole task batch was refused, so the caller
  // must be told to send the tasks — not to create the epic again.
  it('reports a batch-level task failure without hiding the epic', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({
      epicId: 'epic-1',
      epicNumber: 7,
      tasks: { results: [] },
      tasksError: 'connection pool exhausted',
    });

    const result = await manageEpic({
      action: 'create', projectId: 'proj-1', title: 'Breakdown epic',
      tasks: [{ title: 'A' }],
    });

    expect(result.epicId).toBe('epic-1');
    expect(result.message).toMatch(/connection pool exhausted/);
    expect(result.message).toMatch(/create_tasks/);
  });

  // Rejected client-side, so an oversized breakdown does not spend a request to
  // be told the same thing.
  it('rejects more than 40 tasks before calling the API', async () => {
    const tasks = Array.from({ length: 41 }, (_, i) => ({ title: `Task ${i}` }));

    await expect(manageEpic({
      action: 'create', projectId: 'proj-1', title: 'Too big', tasks,
    })).rejects.toThrow(/limit 40/);

    expect(mockCallZephlyAPI).not.toHaveBeenCalled();
  });

  // changedFiles and linkedFiles are both accepted on a nested item, matching
  // manage_task and create_tasks — an agent should not have to remember which
  // spelling this path wants.
  it('normalizes changedFiles on nested items', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce(epicWithTasks(1));

    await manageEpic({
      action: 'create',
      projectId: 'proj-1',
      title: 'Breakdown epic',
      tasks: [{ title: 'A', changedFiles: ['api/main.go'] }],
    });

    const [, payload] = mockCallZephlyAPI.mock.calls[0];
    expect(payload.tasks[0].changedFiles).toBeUndefined();
    expect(payload.tasks[0].linkedFiles).toEqual([
      { path: 'api/main.go', source: 'mcp' },
    ]);
  });
});
