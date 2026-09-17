import { jest } from '@jest/globals';

// Mock every side-effecting dependency of the create path so we exercise the
// real reportUntrackedWork -> createTask flow in isolation.
const mockCallZephlyAPI = jest.fn();
const mockWriteActiveSession = jest.fn();
const mockClearActiveSession = jest.fn();
const mockResolveTaskAutoAssign = jest.fn();
const mockBuildTaskUrl = jest.fn();
const mockGetContext = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));
jest.unstable_mockModule('../lib/active-session.js', () => ({
  writeActiveSession: mockWriteActiveSession,
  clearActiveSession: mockClearActiveSession,
}));
jest.unstable_mockModule('../lib/auto-assign.js', () => ({
  resolveTaskAutoAssign: mockResolveTaskAutoAssign,
}));
jest.unstable_mockModule('../lib/web-url.js', () => ({
  buildTaskUrl: mockBuildTaskUrl,
}));
jest.unstable_mockModule('../handlers/context-manifest.js', () => ({
  getContext: mockGetContext,
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { reportUntrackedWork } = await import('../handlers/tasks.js');

/** Extract the create-call payload sent to the Go API. */
function lastCreateArgs() {
  const call = mockCallZephlyAPI.mock.calls.find((c) => c[0] === 'mcpCreateTask');
  return call ? call[1] : undefined;
}

describe('report_untracked_work', () => {
  beforeEach(() => {
    mockCallZephlyAPI.mockResolvedValue({
      taskId: 'task-1',
      taskNumber: 42,
      task: { id: 'task-1', taskNumber: 42, title: 'Quick fix' },
    });
    mockResolveTaskAutoAssign.mockResolvedValue(null);
    mockBuildTaskUrl.mockResolvedValue(null);
    mockGetContext.mockResolvedValue({ topResults: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('requires projectId and title', async () => {
    await expect(reportUntrackedWork({ title: 'x' })).rejects.toThrow(/projectId/);
    await expect(reportUntrackedWork({ projectId: 'p' })).rejects.toThrow(/title/);
  });

  it('creates an in_progress task defaulting origin to untracked', async () => {
    await reportUntrackedWork({ projectId: 'p1', title: 'Quick fix' });

    const args = lastCreateArgs();
    expect(args.projectId).toBe('p1');
    expect(args.title).toBe('Quick fix');
    expect(args.origin).toBe('untracked');
    expect(args.status).toBe('in_progress');
  });

  it('enriches the description with branch and changed files, and links them', async () => {
    await reportUntrackedWork({
      projectId: 'p1',
      title: 'Fix CORS header',
      description: 'Added the missing header.',
      branch: 'feature/x',
      changedFiles: ['api/a.go', 'api/b.go'],
    });

    const args = lastCreateArgs();
    expect(args.description).toContain('Added the missing header.');
    expect(args.description).toContain('feature/x');
    expect(args.description).toContain('api/a.go');
    expect(args.description).toContain('Changed files (2)');
    // Changed files are linked for dependency inference.
    expect(args.linkedFiles).toEqual([
      { path: 'api/a.go', source: 'mcp' },
      { path: 'api/b.go', source: 'mcp' },
    ]);
  });

  it('passes the discovery link through', async () => {
    await reportUntrackedWork({
      projectId: 'p1',
      title: 'Found a bug while doing #7',
      origin: 'discovered',
      discoveredDuringTaskId: 'task-7',
    });

    const args = lastCreateArgs();
    expect(args.origin).toBe('discovered');
    expect(args.discoveredDuringTaskId).toBe('task-7');
    expect(args.componentId).toBeUndefined();
    expect(args.componentIds).toBeUndefined();
  });

  it('writes the active-session file so the desktop app picks it up', async () => {
    await reportUntrackedWork({ projectId: 'p1', title: 'Quick fix' });

    expect(mockWriteActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', taskNumber: 42 }),
    );
  });

  it('returns the created task for continued tracking', async () => {
    const result = await reportUntrackedWork({ projectId: 'p1', title: 'Quick fix' });
    expect(result.taskId).toBe('task-1');
    expect(result.taskNumber).toBe(42);
  });

  // E-225: untracked work is exactly the work most likely to end up orphaned,
  // so it must be able to name its epic and feature at capture time.
  describe('epic and feature attribution (E-225)', () => {
    // Links are applied one request each (there is no batch route), so the
    // assertions read the sequence of mcpAddLink payloads.
    function linkCalls() {
      return mockCallZephlyAPI.mock.calls.filter((c) => c[0] === 'mcpAddLink').map((c) => c[1]);
    }

    it('passes epicId through to the create call', async () => {
      await reportUntrackedWork({ projectId: 'p1', title: 'Quick fix', epicId: 'epic-9' });
      expect(lastCreateArgs().epicId).toBe('epic-9');
    });

    it('omits epicId when not given', async () => {
      await reportUntrackedWork({ projectId: 'p1', title: 'Quick fix' });
      expect(lastCreateArgs()).not.toHaveProperty('epicId');
    });

    it('maps featureId into a relates_to link on the created task', async () => {
      await reportUntrackedWork({ projectId: 'p1', title: 'Quick fix', featureId: 'feat-3' });

      expect(linkCalls()).toEqual([{
        sourceType: 'task',
        sourceId: 'task-1',
        targetType: 'feature',
        targetId: 'feat-3',
        linkType: 'relates_to',
      }]);
    });

    it('merges explicit links with the featureId shorthand', async () => {
      await reportUntrackedWork({
        projectId: 'p1',
        title: 'Quick fix',
        featureId: 'feat-3',
        links: [{ targetType: 'document', targetId: 'doc-1' }],
      });

      expect(linkCalls().map(({ targetType, targetId, linkType }) => ({ targetType, targetId, linkType })))
        .toEqual([
          { targetType: 'document', targetId: 'doc-1', linkType: 'relates_to' },
          { targetType: 'feature', targetId: 'feat-3', linkType: 'relates_to' },
        ]);
    });

    it('makes no link call when neither featureId nor links are given', async () => {
      await reportUntrackedWork({ projectId: 'p1', title: 'Quick fix' });
      expect(linkCalls()).toEqual([]);
    });
  });
});
