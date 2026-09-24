import { jest } from '@jest/globals';

// #2830: create-time tag matching is suggest-only. Explicit tagIds travel in
// the create request; keyword matches come back as suggestedTags and are never
// applied — in particular, never through a follow-up bulk-tag call, which is
// what used to fail silently while the response claimed the tags were applied.

const mockCallEzmodoAPI = jest.fn();
const mockResolveTaskAutoAssign = jest.fn();
const mockResolveEpicAutoAssign = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/auto-assign.js', () => ({
  resolveTaskAutoAssign: mockResolveTaskAutoAssign,
  resolveEpicAutoAssign: mockResolveEpicAutoAssign,
}));
jest.unstable_mockModule('../lib/web-url.js', () => ({
  buildTaskUrl: jest.fn().mockResolvedValue(null),
  buildEpicUrl: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule('../lib/autolink.js', () => ({
  previewEntityLinks: jest.fn().mockResolvedValue({ proposals: [] }),
  partitionProposals: jest.fn().mockReturnValue({ autoLinked: [], linkSuggestions: [] }),
  attachSuggestionIds: jest.fn().mockImplementation(async (s) => s),
}));
jest.unstable_mockModule('../lib/active-session.js', () => ({
  writeActiveSession: jest.fn(),
  clearActiveSession: jest.fn(),
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { suggestTags } = await import('../lib/suggested-tags.js');
const { manageTask } = await import('../handlers/tasks.js');
const { manageEpic } = await import('../handlers/epics.js');

const MATCHES = {
  organizationId: 'org-1',
  matchedTags: [
    { id: 'tag-api', name: 'api' },
    { id: 'tag-notes', name: 'notes' },
  ],
};

function calledEndpoints() {
  return mockCallEzmodoAPI.mock.calls.map(([endpoint]) => endpoint);
}

describe('suggestTags', () => {
  it('returns matches the caller did not apply', () => {
    expect(suggestTags(MATCHES, ['tag-api'])).toEqual([{ id: 'tag-notes', name: 'notes' }]);
  });

  it('returns nothing for no matches or no cache', () => {
    expect(suggestTags(null)).toEqual([]);
    expect(suggestTags({ matchedTags: [] }, ['x'])).toEqual([]);
  });
});

describe('create-time tags (#2830)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('task create sends explicit tagIds and only suggests the rest', async () => {
    mockResolveTaskAutoAssign.mockResolvedValue(MATCHES);
    mockCallEzmodoAPI.mockResolvedValue({ taskId: 'task-1', taskNumber: 7 });

    const result = await manageTask({
      action: 'create',
      projectId: 'proj-1',
      title: 'Fix the api notes view',
      tagIds: ['tag-api'],
      autolink: false,
    });

    const [, createArgs] = mockCallEzmodoAPI.mock.calls.find(([e]) => e === 'mcpCreateTask');
    expect(createArgs.tagIds).toEqual(['tag-api']);
    expect(result.suggestedTags).toEqual([{ id: 'tag-notes', name: 'notes' }]);
    expect(result.autoAssigned).toBeUndefined();
    expect(calledEndpoints()).not.toContain('mcpBulkTagEntities');
  });

  it('epic create sends explicit tagIds and only suggests the rest', async () => {
    mockResolveEpicAutoAssign.mockResolvedValue(MATCHES);
    mockCallEzmodoAPI.mockResolvedValue({ epicId: 'epic-1', epicNumber: 3 });

    const result = await manageEpic({
      action: 'create',
      projectId: 'proj-1',
      title: 'Api and notes',
      tagIds: ['tag-api'],
    });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateEpic', expect.objectContaining({ tagIds: ['tag-api'] }));
    expect(result.suggestedTags).toEqual([{ id: 'tag-notes', name: 'notes' }]);
    expect(result.autoAssigned).toBeUndefined();
    expect(calledEndpoints()).not.toContain('mcpBulkTagEntities');
  });

  it('epic create with tasks omits suggestedTags when everything matched was applied', async () => {
    mockResolveEpicAutoAssign.mockResolvedValue(MATCHES);
    mockCallEzmodoAPI.mockResolvedValue({
      epicId: 'epic-2', epicNumber: 4, tasks: { results: [], created: 0, failed: 0 },
    });

    const result = await manageEpic({
      action: 'create',
      projectId: 'proj-1',
      title: 'Api and notes',
      tagIds: ['tag-api', 'tag-notes'],
      tasks: [{ title: 'one' }],
    });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith(
      'mcpCreateEpicWithTasks', expect.objectContaining({ tagIds: ['tag-api', 'tag-notes'] }),
    );
    expect(result.suggestedTags).toBeUndefined();
  });

  it('epic update passes tagIds through as an array', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ epicId: 'epic-1' });

    await manageEpic({ action: 'update', epicId: 'epic-1', tagIds: ['tag-api'] });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateEpic', { epicId: 'epic-1', tagIds: ['tag-api'] });
  });
});
