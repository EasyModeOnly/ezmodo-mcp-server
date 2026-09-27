import { jest } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { listIssues, getIssue, manageIssue } = await import('../handlers/public-issues.js');
const { PUBLIC_ISSUE_TOOLS } = await import('../tools/public-issues.js');
const { TOOLS } = await import('../tools/index.js');
const { HANDLERS } = await import('../handlers/index.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { READ_ONLY_TOOLS } = await import('../lib/tool-annotations.js');
const { REMOTE_SAFE_TOOLS } = await import('../lib/remote-tools.js');

const P = 'proj-1';

describe('public issue tools', () => {
  afterEach(() => jest.clearAllMocks());

  describe('registration', () => {
    const names = ['list_issues', 'get_issue', 'manage_issue'];

    it('registers each tool with a handler and remote access', () => {
      for (const name of names) {
        expect(TOOLS.some((t) => t.name === name)).toBe(true);
        expect(typeof HANDLERS[name]).toBe('function');
        expect(REMOTE_SAFE_TOOLS).toContain(name);
      }
    });

    it('marks only the reads read-only', () => {
      expect(READ_ONLY_TOOLS.has('list_issues')).toBe(true);
      expect(READ_ONLY_TOOLS.has('get_issue')).toBe(true);
      expect(READ_ONLY_TOOLS.has('manage_issue')).toBe(false);
    });

    it('maps every endpoint to a project-scoped MCP route', () => {
      const endpoints = Object.keys(ENDPOINT_MAP).filter((k) => /PublicIssue|IssueIntake/.test(k));
      expect(endpoints).toHaveLength(12);
      for (const key of endpoints) {
        expect(ENDPOINT_MAP[key].route).toMatch(/^mcp\/v1\/projects\/\{projectId\}\/(issues|intake)/);
      }
      // Reads are GETs, so the API meters none of them as writes.
      expect(ENDPOINT_MAP.mcpListPublicIssues.method).toBe('GET');
      expect(ENDPOINT_MAP.mcpGetPublicIssue.method).toBe('GET');
      expect(ENDPOINT_MAP.mcpListIssueIntake.method).toBe('GET');
    });

    it('teaches the public model in the descriptions', () => {
      const manage = PUBLIC_ISSUE_TOOLS.find((t) => t.name === 'manage_issue');
      expect(manage.description).toMatch(/Never paste internal details/);
      expect(manage.description).toMatch(/never named/);
      expect(manage.description).toMatch(/FOLLOWS THE LINKED TASK/);
      expect(manage.inputSchema.properties.action.enum).toEqual([
        'publish_intake', 'reject_intake', 'convert_intake',
        'create', 'update', 'publish', 'hide', 'merge', 'resume_auto_status', 'link_task',
      ]);
      const list = PUBLIC_ISSUE_TOOLS.find((t) => t.name === 'list_issues');
      expect(list.description).toMatch(/security reports are never in the queue/i);
    });
  });

  describe('listIssues', () => {
    it('lists issues with filters, dropping unset ones', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ issues: [], total: 0, hasMore: false });
      await listIssues({ projectId: P, status: 'planned', limit: 10 });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListPublicIssues', { projectId: P, status: 'planned', limit: 10 });
    });

    it('lists the intake queue with queue: true, ignoring issue filters', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ items: [], total: 0, hasMore: false });
      await listIssues({ projectId: P, queue: true, status: 'open', offset: 50 });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListIssueIntake', { projectId: P, offset: 50 });
    });

    it('requires projectId', async () => {
      await expect(listIssues({})).rejects.toThrow(/projectId is required/);
    });
  });

  it('getIssue passes projectId and number', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ number: 3 });
    await getIssue({ projectId: P, number: 3 });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetPublicIssue', { projectId: P, number: 3 });
  });

  describe('manageIssue', () => {
    const cases = [
      [
        { action: 'publish_intake', feedbackId: 'fb-1', title: 'Crash on save', body: 'Steps', type: 'bug', labels: ['editor'] },
        'mcpPublishIssueIntake',
        { projectId: P, feedbackId: 'fb-1', title: 'Crash on save', body: 'Steps', type: 'bug', labels: ['editor'] },
      ],
      [{ action: 'reject_intake', feedbackId: 'fb-1', reason: 'Spam' }, 'mcpRejectIssueIntake', { projectId: P, feedbackId: 'fb-1', reason: 'Spam' }],
      [{ action: 'convert_intake', feedbackId: 'fb-1', taskId: 't-1' }, 'mcpConvertIssueIntake', { projectId: P, feedbackId: 'fb-1', taskId: 't-1' }],
      [{ action: 'create', title: 'Dark mode' }, 'mcpCreatePublicIssue', { projectId: P, title: 'Dark mode' }],
      [{ action: 'update', number: 2, publicStatus: 'closed', closeReason: '' }, 'mcpUpdatePublicIssue', { projectId: P, number: 2, publicStatus: 'closed', closeReason: '' }],
      [{ action: 'publish', number: 2 }, 'mcpPublishPublicIssue', { projectId: P, number: 2 }],
      [{ action: 'hide', number: 2 }, 'mcpHidePublicIssue', { projectId: P, number: 2 }],
      [{ action: 'resume_auto_status', number: 2 }, 'mcpResumePublicIssueAutoStatus', { projectId: P, number: 2 }],
      [{ action: 'merge', number: 2, intoNumber: 1 }, 'mcpMergePublicIssue', { projectId: P, number: 2, intoNumber: 1 }],
      [{ action: 'link_task', number: 2, taskId: 't-9' }, 'mcpUpdatePublicIssue', { projectId: P, number: 2, taskId: 't-9' }],
      [{ action: 'link_task', number: 2, taskId: '' }, 'mcpUpdatePublicIssue', { projectId: P, number: 2, taskId: '' }],
    ];

    it.each(cases)('%j → %s', async (args, endpoint, payload) => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageIssue({ projectId: P, ...args });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith(endpoint, payload);
    });

    it('rejects missing required fields before calling the API', async () => {
      await expect(manageIssue({ action: 'publish', projectId: P })).rejects.toThrow(/number is required/);
      await expect(manageIssue({ action: 'reject_intake', projectId: P, feedbackId: 'fb-1' })).rejects.toThrow(/reason is required/);
      await expect(manageIssue({ action: 'link_task', projectId: P, number: 1 })).rejects.toThrow(/taskId is required/);
      await expect(manageIssue({ action: 'update', projectId: P, number: 1 })).rejects.toThrow(/at least one/);
      await expect(manageIssue({ action: 'hide', number: 1 })).rejects.toThrow(/projectId is required/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('rejects an unknown action', async () => {
      await expect(manageIssue({ action: 'delete', projectId: P })).rejects.toThrow(/Unknown action/);
    });
  });
});
