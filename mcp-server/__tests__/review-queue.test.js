import { jest } from '@jest/globals';

// E-302 #3444: agents can read the review queue and the feedback a reviewer
// left when sending a task back, but never decide a review.
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/active-session.js', () => ({
  writeActiveSession: jest.fn(),
  clearActiveSession: jest.fn(),
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { listReviewQueue } = await import('../handlers/review.js');
const { getTask } = await import('../handlers/tasks.js');
const { latestReviewFeedback, firstLine } = await import('../lib/review-feedback.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { TOOLS } = await import('../tools/index.js');
const { HANDLERS } = await import('../handlers/index.js');
const { isRemoteSafe } = await import('../lib/remote-tools.js');
const { READ_ONLY_TOOLS } = await import('../lib/tool-annotations.js');

afterEach(() => {
  jest.clearAllMocks();
});

describe('list_review_queue', () => {
  const apiRow = {
    id: 't-1',
    taskNumber: 42,
    title: 'Add the thing',
    status: 'in_review',
    taskType: 'feature',
    priority: 'high',
    completionNotes: '\nShipped the thing.\nMore detail below.',
    decisions: [],
    notes: [],
    commits: [],
    files: ['a.js'],
    designs: [],
    submittedAt: '2026-11-04T10:00:00Z',
    assignee: { type: 'human', id: 'u-1', name: 'Sam' },
    verification: { total: 3, pass: 2, fail: 1, blocked: 0, skip: 0, notRun: 0 },
  };

  it('forwards projectId, limit and offset to the read-only queue route', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ projectId: 'p-1', tasks: [], total: 0, limit: 10, offset: 20, hasMore: false, approvePolicy: 'humans' });

    await listReviewQueue({ projectId: 'p-1', limit: 10, offset: 20 });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListReviewQueue', { projectId: 'p-1', limit: 10, offset: 20 });
    expect(ENDPOINT_MAP.mcpListReviewQueue).toEqual({ route: 'mcp/v1/projects/{projectId}/review-queue', method: 'GET' });
  });

  it('omits default paging params', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ tasks: [] });
    await listReviewQueue({ projectId: 'p-1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListReviewQueue', { projectId: 'p-1' });
  });

  it('requires projectId', async () => {
    await expect(listReviewQueue({})).rejects.toThrow('projectId is required');
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('formats each row with verification and a one-line summary', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({
      projectId: 'p-1', tasks: [apiRow], total: 7, limit: 1, offset: 0, hasMore: true, approvePolicy: 'humans',
    });

    const result = await listReviewQueue({ projectId: 'p-1', limit: 1 });

    expect(result).toMatchObject({ projectId: 'p-1', total: 7, hasMore: true, approvePolicy: 'humans', limit: 1, offset: 0 });
    expect(result.tasks).toEqual([{
      taskId: 't-1',
      taskNumber: 42,
      title: 'Add the thing',
      taskType: 'feature',
      priority: 'high',
      assignee: { type: 'human', name: 'Sam' },
      submittedAt: '2026-11-04T10:00:00Z',
      verification: { total: 3, pass: 2, fail: 1, blocked: 0, skip: 0, notRun: 0 },
      summary: 'Shipped the thing.',
    }]);
    expect(result.note).toMatch(/cannot approve/);
  });

  it('falls back to the newest note when there are no completion notes', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({
      tasks: [{
        ...apiRow,
        completionNotes: '',
        notes: [
          { type: 'context', content: 'old progress', addedAt: '2026-11-01T00:00:00Z' },
          { type: 'fact', content: 'latest progress\nsecond line', addedAt: '2026-11-03T00:00:00Z' },
        ],
      }],
      total: 1,
    });

    const result = await listReviewQueue({ projectId: 'p-1' });
    expect(result.tasks[0].summary).toBe('latest progress');
  });

  it('returns an empty queue cleanly', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ projectId: 'p-1', tasks: [], total: 0, limit: 25, offset: 0, hasMore: false, approvePolicy: 'humans_and_agents' });

    const result = await listReviewQueue({ projectId: 'p-1' });

    expect(result).toMatchObject({ tasks: [], total: 0, hasMore: false, approvePolicy: 'humans_and_agents' });
  });

  it('is registered, read-only and served remotely', () => {
    expect(TOOLS.map((t) => t.name)).toContain('list_review_queue');
    expect(HANDLERS.list_review_queue).toBe(listReviewQueue);
    expect(READ_ONLY_TOOLS.has('list_review_queue')).toBe(true);
    expect(isRemoteSafe('list_review_queue')).toBe(true);
  });

  it('offers no way to approve or send back', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names.filter((n) => /(^|_)review/.test(n))).toEqual(['list_review_queue']);
    // POST /tasks/{id}/review decides a review; it is not on the MCP group.
    const deciding = Object.values(ENDPOINT_MAP).filter(({ route }) => /tasks\/.*\/review$/.test(route));
    expect(deciding).toEqual([]);
  });
});

describe('get_task reviewFeedback', () => {
  const reviewer = { type: 'human', id: 'r-1', name: '' };

  function taskWith(knowledge) {
    return { success: true, task: { id: 't-1', taskNumber: 42, status: 'in_progress', context: { knowledge } } };
  }

  it('lifts the newest review-feedback item to the top of the response', async () => {
    const knowledge = [
      { id: 'k1', type: 'context', content: 'first round', addedBy: reviewer, addedAt: '2026-11-01T00:00:00Z', tagIds: ['review-feedback'] },
      { id: 'k2', type: 'decision', content: 'unrelated', addedAt: '2026-11-05T00:00:00Z' },
      { id: 'k3', type: 'context', content: 'second round: fix the test', addedBy: reviewer, addedAt: '2026-11-03T00:00:00Z', tagIds: ['review-feedback'] },
      { id: 'k4', type: 'context', content: 'older', addedBy: reviewer, addedAt: '2026-10-30T00:00:00Z', tagIds: ['review-feedback'] },
    ];
    mockCallEzmodoAPI.mockResolvedValueOnce(taskWith(knowledge));

    const result = await getTask({ taskId: 't-1' });

    expect(Object.keys(result)[0]).toBe('reviewFeedback');
    expect(result.reviewFeedback).toEqual({
      content: 'second round: fix the test', addedBy: reviewer, addedAt: '2026-11-03T00:00:00Z',
    });
    expect(result.task.context.knowledge).toEqual(knowledge);
  });

  it('is absent when no knowledge item is tagged review-feedback', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce(taskWith([
      { id: 'k1', type: 'context', content: 'progress', addedAt: '2026-11-01T00:00:00Z', tagIds: ['other'] },
    ]));

    const result = await getTask({ taskId: 't-1' });

    expect(result).not.toHaveProperty('reviewFeedback');
  });

  it('is absent when the task has no knowledge', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, task: { id: 't-1', context: { knowledge: null } } });
    expect(await getTask({ taskId: 't-1' })).not.toHaveProperty('reviewFeedback');
  });

  it('accepts the tag under `tags` too', () => {
    expect(latestReviewFeedback([{ content: 'x', tags: ['review-feedback'], addedAt: '2026-11-01T00:00:00Z' }]))
      .toEqual({ content: 'x', addedBy: null, addedAt: '2026-11-01T00:00:00Z' });
  });

  it('describes reviewFeedback in the get_task tool', () => {
    const tool = TOOLS.find((t) => t.name === 'get_task');
    expect(tool.description).toMatch(/reviewFeedback/);
  });
});

describe('firstLine', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['  \n  hello  \nworld', 'hello'],
    [{ a: 1 }, '{"a":1}'],
  ])('%p -> %p', (input, expected) => {
    expect(firstLine(input)).toBe(expected);
  });
});
