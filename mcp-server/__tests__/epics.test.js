import { jest } from '@jest/globals';
import { createMockEpic, createMockError } from './test-utils.js';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

// Mock auto-assign — return no matches so tests behave like before
jest.unstable_mockModule('../lib/auto-assign.js', () => ({
  resolveEpicAutoAssign: jest.fn().mockResolvedValue(null),
}));

const {
  manageEpic, searchEpics, listEpics, getEpic, getEpicPlan, updateEpicPlan,
} = await import('../handlers/epics.js');

describe('Epic Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // E-237 #2382: the epic is the fifth consumer of the grounding engine. Both
  // verbs are asserted here because the two differ in a way that matters — one
  // spends an AI call server-side, the other only validates what a local agent
  // already wrote.
  describe('how it works (E-237 #2382)', () => {
    it('should generate the grounded living description', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ epic: { id: 'epic-1', howItWorks: '## Where this stands' } });

      const result = await manageEpic({ action: 'generate_how_it_works', epicId: 'epic-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGenerateEpicHowItWorks', { epicId: 'epic-1' });
      expect(result.epic.howItWorks).toBe('## Where this stands');
    });

    it('should apply a locally authored description with its sources', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ epic: { id: 'epic-1', howItWorks: '## Mine' } });

      const sources = { claims: [{ text: 'x', sources: ['task:t1'], confidence: 'grounded' }], divergences: [] };
      const result = await manageEpic({
        action: 'apply_how_it_works', epicId: 'epic-1', markdown: '## Mine', sources,
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpApplyEpicHowItWorks', {
        epicId: 'epic-1', markdown: '## Mine', sources,
      });
      expect(result.epic.howItWorks).toBe('## Mine');
    });

    it('should reject an unknown action by name', async () => {
      await expect(manageEpic({ action: 'frobnicate' })).rejects.toThrow(/Unknown action: frobnicate/);
    });
  });

  describe('createEpic', () => {
    it('should create an epic with required fields', async () => {
      const mockResponse = { success: true, epicId: 'new-epic-id', epicNumber: 5 };
      mockCallZephlyAPI.mockResolvedValueOnce(mockResponse);

      const args = { projectId: 'proj-1', title: 'New Epic' };
      const result = await manageEpic({ action: 'create', ...args });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateEpic', args);
      expect(result.success).toBe(true);
      expect(result.epicId).toBe('new-epic-id');
      expect(result.epicNumber).toBe(5);
    });

    it('should create an epic with all optional fields', async () => {
      const mockResponse = { success: true, epicId: 'epic-full', epicNumber: 6 };
      mockCallZephlyAPI.mockResolvedValueOnce(mockResponse);

      const args = {
        projectId: 'proj-1',
        title: 'Full Epic',
        description: 'Detailed description',
        status: 'active',
        milestoneId: 'milestone-1',
        labels: ['frontend', 'urgent'],
      };
      const result = await manageEpic({ action: 'create', ...args });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateEpic', args);
      expect(result.success).toBe(true);
      expect(result.epicId).toBe('epic-full');
    });

    it('should propagate API errors', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Missing required field: projectId', 400));
      await expect(manageEpic({ action: 'create', title: 'No Project' })).rejects.toThrow('Missing required field: projectId');
    });

    it('should handle network errors', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(new Error('Network error'));
      await expect(manageEpic({ action: 'create', projectId: 'proj-1', title: 'Test' })).rejects.toThrow('Network error');
    });
  });

  describe('getEpic', () => {
    it('should get an epic by ID', async () => {
      const epic = createMockEpic({ id: 'epic-123', title: 'Found Epic' });
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, epic });

      const result = await getEpic({ epicId: 'epic-123' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetEpic', { epicId: 'epic-123' });
      expect(result.success).toBe(true);
      expect(result.epic.title).toBe('Found Epic');
    });

    it('should handle not found', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Epic not found', 404));
      await expect(getEpic({ epicId: 'nonexistent' })).rejects.toThrow('Epic not found');
    });

    it('should pass additional args through', async () => {
      const epic = createMockEpic();
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, epic });

      await getEpic({ epicId: 'epic-1', projectId: 'proj-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetEpic', { epicId: 'epic-1', projectId: 'proj-1' });
    });
  });

  describe('updateEpic', () => {
    it('should update an epic', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, message: 'Epic updated' });

      const args = { epicId: 'epic-1', title: 'Updated Title', status: 'completed' };
      const result = await manageEpic({ action: 'update', ...args });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUpdateEpic', args);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Epic updated');
    });

    it('should update epic status only', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, message: 'Epic updated' });

      const args = { epicId: 'epic-1', status: 'active' };
      const result = await manageEpic({ action: 'update', ...args });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUpdateEpic', args);
      expect(result.success).toBe(true);
    });

    it('should handle update error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Epic not found', 404));
      await expect(manageEpic({ action: 'update', epicId: 'bad' })).rejects.toThrow('Epic not found');
    });
  });

  describe('listEpics', () => {
    it('should list epics for a project', async () => {
      const epics = [createMockEpic({ id: 'e1' }), createMockEpic({ id: 'e2' })];
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, epics, count: 2 });

      const result = await listEpics({ projectId: 'proj-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListEpics', { projectId: 'proj-1' });
      expect(result.epics).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should return empty list for project with no epics', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, epics: [], count: 0 });

      const result = await listEpics({ projectId: 'empty-proj' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListEpics', { projectId: 'empty-proj' });
      expect(result.epics).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should handle server error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(listEpics({ projectId: 'proj-1' })).rejects.toThrow('Internal server error');
    });
  });

  describe('searchEpics', () => {
    it('should search epics with filters', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, epics: [createMockEpic()], count: 1 });

      const args = { projectId: 'proj-1', status: 'active', milestoneId: 'milestone-1' };
      const result = await searchEpics(args);

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSearchEpics', args);
      expect(result.epics).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should search with text query', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, epics: [createMockEpic({ title: 'Auth Epic' })], count: 1 });

      const args = { projectId: 'proj-1', query: 'auth' };
      const result = await searchEpics(args);

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSearchEpics', args);
      expect(result.epics[0].title).toBe('Auth Epic');
    });

    it('should return empty results when no match', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, epics: [], count: 0 });

      const result = await searchEpics({ projectId: 'proj-1', query: 'nonexistent' });

      expect(result.epics).toHaveLength(0);
    });

    it('should handle server error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(searchEpics({ projectId: 'proj-1' })).rejects.toThrow('Internal server error');
    });
  });
});

/**
 * E-225: an epic can be born linked to the feature/goal/milestone it advances,
 * instead of relying on a follow-up manage_link call the agent rarely makes.
 */
describe('createEpic with links (E-225)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function callsTo(endpoint) {
    return mockCallZephlyAPI.mock.calls.filter((c) => c[0] === endpoint);
  }

  it('applies the links after the epic exists and reports the outcome', async () => {
    mockCallZephlyAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpCreateEpic') return { epicId: 'epic-1', epicNumber: 5 };
      return { success: true };
    });

    const result = await manageEpic({
      action: 'create',
      projectId: 'proj-1',
      title: 'Auto-linking',
      links: [{ targetType: 'feature', targetId: 'feat-1' }],
    });

    expect(callsTo('mcpCreateEpic')[0][1]).not.toHaveProperty('links');
    expect(callsTo('mcpAddLink')[0][1]).toMatchObject({
      sourceType: 'epic',
      sourceId: 'epic-1',
    });
    expect(result.links.applied).toHaveLength(1);
  });

  it('still returns the created epic when linking fails', async () => {
    mockCallZephlyAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpCreateEpic') return { epicId: 'epic-1', epicNumber: 5 };
      throw new Error('Target not found');
    });

    const result = await manageEpic({
      action: 'create',
      projectId: 'proj-1',
      title: 'Auto-linking',
      links: [{ targetType: 'feature', targetId: 'nope' }],
    });

    expect(result.epicId).toBe('epic-1');
    expect(result.links.failed).toHaveLength(1);
  });
});

describe('manage_epic link params (E-225)', () => {
  it('uses the shared linkable-type list for related items and offers addLinks', async () => {
    const { EPIC_TOOLS } = await import('../tools/epics.js');
    const { LINKABLE_TYPES } = await import('../tools/linkable-types.js');
    const props = EPIC_TOOLS.find((t) => t.name === 'manage_epic').inputSchema.properties;

    expect(props.addRelatedItem.properties.type.enum).toBe(LINKABLE_TYPES);
    expect(props.removeRelatedItem.properties.type.enum).toBe(LINKABLE_TYPES);
    // Kept working, but agents should be steered at addLinks/removeLinks.
    expect(props.addRelatedItem.description).toMatch(/DEPRECATED/);
    expect(props.removeRelatedItem.description).toMatch(/DEPRECATED/);
    expect(props.addLinks.type).toBe('array');
    expect(props.removeLinks.type).toBe('array');
  });
});

// E-259: an epic plan shared by several people's AIs.
describe('epic plan (E-259)', () => {
  afterEach(() => jest.clearAllMocks());

  it('reads the plan through the plan endpoint', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ epicId: 'e1', currentRevision: 3, plan: { proposedTasks: [] } });
    const result = await getEpicPlan({ epicId: 'e1', includeHistory: true });
    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetEpicPlan', { epicId: 'e1', includeHistory: true });
    expect(result.currentRevision).toBe(3);
  });

  it('turns a plan conflict into a result the agent can act on', async () => {
    const err = new Error('the plan changed');
    err.code = 'PLAN_CONFLICT';
    err.status = 409;
    err.details = {
      baseRevision: 1,
      currentRevision: 2,
      changesSince: ['Added task: Export to CSV'],
      current: { proposedTasks: [{ id: 't1', title: 'Export to CSV' }] },
    };
    mockCallZephlyAPI.mockRejectedValueOnce(err);

    const result = await updateEpicPlan({ epicId: 'e1', baseRevision: 1, plan: { notes: 'mine' } });

    expect(result.saved).toBe(false);
    expect(result.conflict).toBe(true);
    expect(result.currentRevision).toBe(2);
    expect(result.changesSince).toEqual(['Added task: Export to CSV']);
    expect(result.currentPlan.proposedTasks[0].title).toBe('Export to CSV');
    expect(result.message).toMatch(/baseRevision 2/);
  });

  it('still throws other failures', async () => {
    const err = new Error('forbidden');
    err.status = 403;
    mockCallZephlyAPI.mockRejectedValueOnce(err);
    await expect(updateEpicPlan({ epicId: 'e1', baseRevision: 0, plan: {} })).rejects.toThrow('forbidden');
  });
});

describe('epic discussion (E-259)', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists and posts epic comments through their endpoints', async () => {
    const { listEpicComments, addEpicComment } = await import('../handlers/epics.js');
    mockCallZephlyAPI.mockResolvedValueOnce({ comments: [] });
    await listEpicComments({ epicId: 'e1' });
    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListEpicComments', { epicId: 'e1' });

    mockCallZephlyAPI.mockResolvedValueOnce({ commentId: 'c1' });
    const result = await addEpicComment({ epicId: 'e1', content: 'Question', parentId: 'c0' });
    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpAddEpicComment', { epicId: 'e1', content: 'Question', parentId: 'c0' });
    expect(result.commentId).toBe('c1');
  });
});

describe('getEpicActivity (E-259 #2746)', () => {
  it('asks for what changed since the last look, and marks it seen by default', async () => {
    const { getEpicActivity } = await import('../handlers/epics.js');
    mockCallZephlyAPI.mockResolvedValueOnce({ activity: { summary: ['Nothing has changed since you last looked.'] } });
    await getEpicActivity({ epicId: 'e1' });
    expect(mockCallZephlyAPI).toHaveBeenLastCalledWith('mcpGetEpicActivity', { epicId: 'e1' });
  });

  it('passes since and markSeen:false through', async () => {
    const { getEpicActivity } = await import('../handlers/epics.js');
    mockCallZephlyAPI.mockResolvedValueOnce({ activity: {} });
    await getEpicActivity({ epicId: 'e1', since: '2026-09-19T14:00:00Z', markSeen: false });
    expect(mockCallZephlyAPI).toHaveBeenLastCalledWith('mcpGetEpicActivity', {
      epicId: 'e1', since: '2026-09-19T14:00:00Z', markSeen: 'false',
    });
  });
});
