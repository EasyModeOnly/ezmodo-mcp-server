import { jest } from '@jest/globals';

// Mock the http client and side-effecting lib deps so we exercise the real
// manageTask dispatcher in isolation (mirrors projects.test.js).
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

const { manageTask } = await import('../handlers/tasks.js');

describe('manageTask dispatch', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate the how-it-works summary', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ task: { id: 'task-1', howItWorks: '## How it works' } });

    const result = await manageTask({ action: 'generate_how_it_works', taskId: 'task-1' });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGenerateTaskHowItWorks', { taskId: 'task-1' });
    expect(result.task.howItWorks).toBe('## How it works');
  });

  it('should reject an unknown action', async () => {
    await expect(manageTask({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
  });
});

/**
 * E-225: a task can be born linked to the feature/goal it advances, instead of
 * needing a second manage_link call the agent usually forgets to make.
 */
describe('manage_task create with links', () => {
  beforeEach(() => {
    mockCallZephlyAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpCreateTask') return { taskId: 'task-1', taskNumber: 7 };
      return { success: true };
    });
    mockResolveTaskAutoAssign.mockResolvedValue(null);
    mockBuildTaskUrl.mockResolvedValue(null);
    mockGetContext.mockResolvedValue({ topResults: [] });
  });

  afterEach(() => jest.clearAllMocks());

  function callsTo(endpoint) {
    return mockCallZephlyAPI.mock.calls.filter((c) => c[0] === endpoint);
  }

  it('applies the links after the task exists and reports the outcome', async () => {
    const result = await manageTask({
      action: 'create',
      projectId: 'p1',
      title: 'Add rate limiting',
      links: [{ targetType: 'feature', targetId: 'feat-1' }],
    });

    expect(callsTo('mcpAddLink')).toHaveLength(1);
    expect(callsTo('mcpAddLink')[0][1]).toMatchObject({
      sourceType: 'task',
      sourceId: 'task-1',
    });
    expect(result.links.applied).toHaveLength(1);
    expect(result.links.failed).toEqual([]);
  });

  it('does not send `links` in the create payload — it is an MCP-layer concern', async () => {
    await manageTask({
      action: 'create',
      projectId: 'p1',
      title: 'Add rate limiting',
      links: [{ targetType: 'feature', targetId: 'feat-1' }],
    });

    expect(callsTo('mcpCreateTask')[0][1]).not.toHaveProperty('links');
  });

  it('still returns the created task when linking fails', async () => {
    mockCallZephlyAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpCreateTask') return { taskId: 'task-1', taskNumber: 7 };
      throw new Error('Target not found');
    });

    const result = await manageTask({
      action: 'create',
      projectId: 'p1',
      title: 'Add rate limiting',
      links: [{ targetType: 'feature', targetId: 'nope' }],
    });

    expect(result.taskId).toBe('task-1');
    expect(result.links.failed).toHaveLength(1);
  });

  it('makes no link calls when no links are given', async () => {
    await manageTask({ action: 'create', projectId: 'p1', title: 'Plain task' });
    expect(callsTo('mcpAddLink')).toHaveLength(0);
  });
});

// #2297: the create response used to carry linkSuggestions with no suggestionId,
// while CLAUDE.md told agents to clear them via resolve_link_suggestions — which
// takes ids. It was also short: the engine's semantic rules persist a beat after
// the preview is taken, so queued rows never appeared at all.
describe('manageTask create — link suggestions', () => {
  afterEach(() => jest.clearAllMocks());

  const suggestionRow = (id, targetId, rule) => ({
    ID: id,
    TargetEntityType: 'feature',
    TargetEntityID: targetId,
    Action: 'link',
    Confidence: 0.88,
    Payload: { link_type: 'relates_to', rule },
  });

  function mockCreateFlow({ proposals = [], suggestions = [] }) {
    mockResolveTaskAutoAssign.mockResolvedValue(null);
    mockCallZephlyAPI.mockImplementation(async (endpoint) => {
      switch (endpoint) {
      case 'mcpCreateTask': return { taskId: 'task-1', taskNumber: 1 };
      case 'mcpPreviewLinks': return { proposals };
      case 'mcpListAgentSuggestions': return { suggestions };
      default: return {};
      }
    });
  }

  const proposal = (targetId) => ({
    targetType: 'feature',
    targetId,
    linkType: 'relates_to',
    rule: 'code.component_feature',
    autoApplies: false,
  });

  it('gives each suggestion the id resolve_link_suggestions needs', async () => {
    mockCreateFlow({
      proposals: [proposal('feat-1')],
      suggestions: [suggestionRow('sug-1', 'feat-1', 'code.component_feature')],
    });

    const result = await manageTask({
      action: 'create', projectId: 'proj-1', title: 'A task', autolink: false,
    });

    expect(result.linkSuggestions).toHaveLength(1);
    expect(result.linkSuggestions[0].suggestionId).toBe('sug-1');
    expect(result.linkSuggestionsNote).toContain('resolve_link_suggestions');
    expect(result.linkSuggestionsNote).not.toContain('list_agent_suggestions');
  });

  it('includes queued suggestions the preview never proposed', async () => {
    mockCreateFlow({
      proposals: [],
      suggestions: [suggestionRow('sug-2', 'feat-2', 'semantic.feature_match')],
    });

    const result = await manageTask({
      action: 'create', projectId: 'proj-1', title: 'A task', autolink: false,
    });

    expect(result.linkSuggestions).toHaveLength(1);
    expect(result.linkSuggestions[0].suggestionId).toBe('sug-2');
    expect(result.linkSuggestions[0].rule).toBe('semantic.feature_match');
  });

  // Needs the preview to run (autolink on), so there is a proposal with no
  // queued row behind it — that mismatch is what "partial" reports.
  it('points at list_agent_suggestions when the inline list may be short', async () => {
    mockCreateFlow({
      proposals: [proposal('feat-1'), proposal('feat-9')],
      suggestions: [suggestionRow('sug-1', 'feat-1', 'code.component_feature')],
    });
    mockGetContext.mockResolvedValue({ files: [] });

    const result = await manageTask({
      action: 'create', projectId: 'proj-1', title: 'A task',
    });

    expect(result.linkSuggestionsNote).toContain('list_agent_suggestions');
    expect(result.linkSuggestionsNote).toContain('task-1');
  });

  it('omits the key entirely when there is nothing to resolve', async () => {
    mockCreateFlow({ proposals: [], suggestions: [] });

    const result = await manageTask({
      action: 'create', projectId: 'proj-1', title: 'A task', autolink: false,
    });

    expect(result.linkSuggestions).toBeUndefined();
    expect(result.linkSuggestionsNote).toBeUndefined();
  });
});


/**
 * #2429: the "no component" hint tested only the DEPRECATED singular field, so
 * a create that correctly used componentIds was told it had named none — while
 * the links had in fact been written. Agents acted on the wrong warning and
 * issued a redundant follow-up update.
 */
describe('manage_task create — the missing-component hint', () => {
  const AVAILABLE = [{ id: 'c-web', name: 'web' }, { id: 'c-api', name: 'api' }];

  beforeEach(() => {
    mockCallZephlyAPI.mockImplementation(async (endpoint) => (
      endpoint === 'mcpCreateTask' ? { taskId: 'task-1', taskNumber: 7 } : {}
    ));
    mockResolveTaskAutoAssign.mockResolvedValue({
      organizationId: 'org-1',
      matchedTags: [],
      availableComponents: AVAILABLE,
    });
    mockBuildTaskUrl.mockResolvedValue(null);
    mockGetContext.mockResolvedValue({ topResults: [] });
  });

  afterEach(() => jest.clearAllMocks());

  const create = (extra) => manageTask({
    action: 'create', projectId: 'p1', title: 'A task', autolink: false, ...extra,
  });

  it('stays silent when componentIds names a component', async () => {
    const result = await create({ componentIds: ['c-web'] });

    expect(result.warning).toBeUndefined();
    expect(result.availableComponents).toBeUndefined();
  });

  it('stays silent when the deprecated componentId names one', async () => {
    const result = await create({ componentId: 'c-web' });

    expect(result.warning).toBeUndefined();
  });

  it('warns when no component is named at all', async () => {
    const result = await create({});

    expect(result.warning).toMatch(/without a component/i);
    expect(result.warning).toContain('componentIds');
    expect(result.availableComponents).toEqual(AVAILABLE);
  });

  it('warns on an empty or blank componentIds, which names nothing', async () => {
    expect((await create({ componentIds: [] })).warning).toMatch(/without a component/i);
    expect((await create({ componentIds: [''] })).warning).toMatch(/without a component/i);
  });

  it('forwards componentIds to the create call', async () => {
    await create({ componentIds: ['c-web', 'c-api'] });

    const payload = mockCallZephlyAPI.mock.calls.find((c) => c[0] === 'mcpCreateTask')[1];
    expect(payload.componentIds).toEqual(['c-web', 'c-api']);
  });
});
