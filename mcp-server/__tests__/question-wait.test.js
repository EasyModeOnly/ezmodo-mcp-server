import { jest } from '@jest/globals';

// #3893: an agent waits for an answer with manage_question action "wait", and
// the stdio server's own session id travels on create and on the reads that
// count as the asking session checking.
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { manageQuestion, listQuestions } = await import('../handlers/questions.js');
const { startAgentSession, getAgentSessionId, resetAgentSessionForTests } = await import('../lib/agent-session.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { TOOLS } = await import('../tools/index.js');

afterEach(() => {
  jest.clearAllMocks();
  resetAgentSessionForTests();
});

describe('manage_question wait', () => {
  it('sends the ids, deduplicated, with questionId folded in', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ answered: [], waiting: ['q1', 'q2'], timedOut: true });
    await manageQuestion({ action: 'wait', questionIds: ['q1', 'q2', 'q1'], questionId: 'q2' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpWaitQuestions', { questionIds: ['q1', 'q2'] });
  });

  it('caps the timeout at 50 seconds and drops a nonsense one', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageQuestion({ action: 'wait', questionIds: ['q1'], timeoutSeconds: 600 });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpWaitQuestions', { questionIds: ['q1'], timeoutSeconds: 50 });
    await manageQuestion({ action: 'wait', questionIds: ['q1'], timeoutSeconds: 12.7 });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpWaitQuestions', { questionIds: ['q1'], timeoutSeconds: 12 });
    await manageQuestion({ action: 'wait', questionIds: ['q1'], timeoutSeconds: -1 });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpWaitQuestions', { questionIds: ['q1'] });
  });

  it('needs at least one id before calling the API', async () => {
    await expect(manageQuestion({ action: 'wait' })).rejects.toThrow(/questionIds/);
    await expect(manageQuestion({ action: 'wait', questionIds: [] })).rejects.toThrow(/questionIds/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('is mapped and documented on the tool', () => {
    expect(ENDPOINT_MAP.mcpWaitQuestions).toEqual({ route: 'mcp/v1/questions/wait', method: 'POST' });
    const tool = TOOLS.find((t) => t.name === 'manage_question');
    expect(tool.inputSchema.properties.action.enum).toContain('wait');
    expect(tool.inputSchema.properties.questionIds.type).toBe('array');
    expect(tool.description).toMatch(/waiting for your answer/);
  });
});

describe('agent session id', () => {
  it('is null until the stdio entry point starts one, then stable', () => {
    expect(getAgentSessionId()).toBeNull();
    const id = startAgentSession();
    expect(id).toMatch(/^mcp-[0-9a-f-]{36}$/);
    expect(startAgentSession()).toBe(id);
    expect(getAgentSessionId()).toBe(id);
  });

  it('is the default sessionId on create, and an agent-given one wins', async () => {
    const id = startAgentSession();
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageQuestion({ action: 'create', taskId: 't1', kind: 'question', title: 'x' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpCreateQuestion', {
      taskId: 't1', kind: 'question', title: 'x', sessionId: id,
    });
    await manageQuestion({ action: 'create', taskId: 't1', kind: 'question', title: 'x', sessionId: 'mine' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpCreateQuestion', {
      taskId: 't1', kind: 'question', title: 'x', sessionId: 'mine',
    });
  });

  it('travels on list_questions so the asking session counts as checking', async () => {
    const id = startAgentSession();
    mockCallEzmodoAPI.mockResolvedValue({ items: [] });
    await listQuestions({ taskId: 't1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListQuestions', { taskId: 't1', sessionId: id });
  });

  it('is not sent without a session (the HTTP connector)', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ items: [] });
    await listQuestions({ taskId: 't1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListQuestions', { taskId: 't1' });
  });
});
