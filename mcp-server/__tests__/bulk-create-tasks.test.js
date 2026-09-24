import { jest } from '@jest/globals';

// Same isolation pattern as manage-task.test.js: mock the HTTP client and the
// side-effecting lib deps so the real handler logic runs.
const mockCallEzmodoAPI = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/active-session.js', () => ({
  writeActiveSession: jest.fn(),
  clearActiveSession: jest.fn(),
}));
jest.unstable_mockModule('../lib/auto-assign.js', () => ({
  resolveTaskAutoAssign: jest.fn(),
}));
jest.unstable_mockModule('../lib/web-url.js', () => ({
  buildTaskUrl: jest.fn(),
}));
jest.unstable_mockModule('../handlers/context-manifest.js', () => ({
  getContext: jest.fn(),
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { bulkCreateTasks } = await import('../handlers/tasks.js');

const okResult = (n) => ({
  created: n,
  failed: 0,
  results: Array.from({ length: n }, (_, i) => ({
    index: i, taskId: `t${i}`, taskNumber: i + 1, title: `Task ${i + 1}`,
  })),
});

describe('bulkCreateTasks', () => {
  afterEach(() => jest.clearAllMocks());

  // The whole point: N tasks, ONE API call.
  it('sends the entire batch in a single request', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce(okResult(3));

    const result = await bulkCreateTasks({
      projectId: 'proj-1',
      epicId: 'epic-1',
      tasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
    });

    expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = mockCallEzmodoAPI.mock.calls[0];
    expect(endpoint).toBe('mcpBulkCreateTasks');
    expect(payload.projectId).toBe('proj-1');
    expect(payload.epicId).toBe('epic-1');
    expect(payload.tasks).toHaveLength(3);
    expect(result.created).toBe(3);
    expect(result.taskNumbers).toEqual([1, 2, 3]);
  });

  // A partial failure must be impossible to miss, and the message must steer the
  // agent away from re-sending the whole batch (which would duplicate).
  it('surfaces failures separately and warns against re-running the batch', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({
      created: 2,
      failed: 1,
      results: [
        { index: 0, taskId: 't0', taskNumber: 1, title: 'A' },
        { index: 1, title: 'B', error: 'missing required field: title' },
        { index: 2, taskId: 't2', taskNumber: 3, title: 'C' },
      ],
    });

    const result = await bulkCreateTasks({
      projectId: 'proj-1',
      tasks: [{ title: 'A' }, { title: '' }, { title: 'C' }],
    });

    expect(result.created).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      { index: 1, title: 'B', error: 'missing required field: title' },
    ]);
    expect(result.message).toMatch(/retry ONLY/);
    // The successful numbers must still be reported, and must not include a
    // placeholder for the failed item.
    expect(result.taskNumbers).toEqual([1, 3]);
  });

  it('reports a clean success message when nothing failed', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce(okResult(2));
    const result = await bulkCreateTasks({ projectId: 'proj-1', tasks: [{ title: 'A' }, { title: 'B' }] });
    expect(result.failures).toBeUndefined();
    expect(result.message).toMatch(/Created 2 tasks in one request/);
  });

  // Rejected client-side so an oversized batch does not spend a request only to
  // be refused, and the error says what to do about it.
  it('rejects an oversized batch before calling the API', async () => {
    await expect(bulkCreateTasks({
      projectId: 'proj-1',
      tasks: Array.from({ length: 41 }, (_, i) => ({ title: `T${i}` })),
    })).rejects.toThrow(/limit 40/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('requires projectId and a non-empty tasks array', async () => {
    await expect(bulkCreateTasks({ tasks: [{ title: 'A' }] }))
      .rejects.toThrow(/projectId is required/);
    await expect(bulkCreateTasks({ projectId: 'proj-1', tasks: [] }))
      .rejects.toThrow(/non-empty array/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  // changedFiles is the E-225 spelling; manage_task accepts it, so this must too
  // rather than making callers remember which tool wants which shape.
  it('normalizes changedFiles into linkedFiles per item', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce(okResult(1));

    await bulkCreateTasks({
      projectId: 'proj-1',
      tasks: [{ title: 'A', changedFiles: ['api/a.go', 'api/b.go'] }],
    });

    const [, payload] = mockCallEzmodoAPI.mock.calls[0];
    expect(payload.tasks[0].linkedFiles).toEqual([
      { path: 'api/a.go', source: 'mcp' },
      { path: 'api/b.go', source: 'mcp' },
    ]);
    // The raw key must not also be forwarded, or the API would see both shapes.
    expect(payload.tasks[0].changedFiles).toBeUndefined();
  });
});
