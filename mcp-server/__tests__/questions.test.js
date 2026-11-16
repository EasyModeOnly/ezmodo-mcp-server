import { jest } from '@jest/globals';

// E-333 #3829: agents ask questions on the task they hold up and read the
// answers back.
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { manageQuestion, listQuestions } = await import('../handlers/questions.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { TOOLS } = await import('../tools/index.js');
const { HANDLERS } = await import('../handlers/index.js');
const { isRemoteSafe } = await import('../lib/remote-tools.js');
const { READ_ONLY_TOOLS } = await import('../lib/tool-annotations.js');

afterEach(() => {
  jest.clearAllMocks();
});

describe('manage_question', () => {
  it('creates on a task, sending only the fields given', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ question: { id: 'q1' } });
    await manageQuestion({
      action: 'create', taskId: 't1', kind: 'todo', title: 'Remove the old assignee', blocking: true,
      link: 'https://ezmodo.com/emo/projects/ezmodo/tasks/357',
    });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateQuestion', {
      taskId: 't1', kind: 'todo', title: 'Remove the old assignee', blocking: true,
      link: 'https://ezmodo.com/emo/projects/ezmodo/tasks/357',
    });
  });

  it('refuses a create with neither task nor epic before calling the API', async () => {
    await expect(manageQuestion({ action: 'create', kind: 'question', title: 'x' })).rejects.toThrow(/taskId or epicId/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('updates and withdraws by questionId', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageQuestion({ action: 'update', questionId: 'q1', blocking: false });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateQuestion', { questionId: 'q1', blocking: false });
    await manageQuestion({ action: 'withdraw', questionId: 'q1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpWithdrawQuestion', { questionId: 'q1' });
    await expect(manageQuestion({ action: 'withdraw' })).rejects.toThrow(/questionId/);
  });

  it('rejects an unknown action', async () => {
    await expect(manageQuestion({ action: 'answer' })).rejects.toThrow(/Unknown action/);
  });
});

describe('list_questions', () => {
  it('passes answeredSince through and drops empty paging', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ items: [] });
    await listQuestions({ taskId: 't1', answeredSince: '2026-11-16T09:00:00Z', offset: 0 });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListQuestions', {
      taskId: 't1', answeredSince: '2026-11-16T09:00:00Z',
    });
  });

  it('needs a task, an epic or an organization', async () => {
    await expect(listQuestions({})).rejects.toThrow(/taskId, epicId, or organizationId/);
  });
});

describe('registration', () => {
  it('maps every endpoint the handlers call', () => {
    expect(ENDPOINT_MAP.mcpCreateQuestion).toEqual({ route: 'mcp/v1/questions', method: 'POST' });
    expect(ENDPOINT_MAP.mcpUpdateQuestion).toEqual({ route: 'mcp/v1/questions', method: 'PUT' });
    expect(ENDPOINT_MAP.mcpWithdrawQuestion).toEqual({ route: 'mcp/v1/questions/withdraw', method: 'POST' });
    expect(ENDPOINT_MAP.mcpListQuestions).toEqual({ route: 'mcp/v1/questions', method: 'GET' });
  });

  it('lists both tools once, with handlers, served remotely, list_questions read-only', () => {
    for (const name of ['manage_question', 'list_questions']) {
      expect(TOOLS.filter((t) => t.name === name)).toHaveLength(1);
      expect(typeof HANDLERS[name]).toBe('function');
      expect(isRemoteSafe(name)).toBe(true);
    }
    expect(READ_ONLY_TOOLS.has('list_questions')).toBe(true);
    expect(READ_ONLY_TOOLS.has('manage_question')).toBe(false);
  });

  it('documents a decision on a task on manage_decision', () => {
    const tool = TOOLS.find((t) => t.name === 'manage_decision');
    expect(tool.inputSchema.properties.blocking.type).toBe('boolean');
    expect(tool.description).toMatch(/taskId/);
  });
});
