import { jest } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageRoadmap } = await import('../handlers/roadmap.js');
const { getPublicTracker, managePublicTracker } = await import('../handlers/public-tracker.js');
const { ROADMAP_TOOLS } = await import('../tools/roadmap.js');
const { PUBLIC_TRACKER_TOOLS } = await import('../tools/public-tracker.js');
const { TOOLS } = await import('../tools/index.js');
const { HANDLERS } = await import('../handlers/index.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { READ_ONLY_TOOLS } = await import('../lib/tool-annotations.js');
const { REMOTE_SAFE_TOOLS } = await import('../lib/remote-tools.js');

const P = 'proj-1';
const tool = (list, name) => list.find((t) => t.name === name);

// Every endpoint #3233 adds, by the tool that calls it.
const ENDPOINTS = [
  'mcpListRoadmapItems', 'mcpCreateRoadmapItem', 'mcpReorderRoadmapItems', 'mcpUpdateRoadmapItem',
  'mcpDeleteRoadmapItem', 'mcpShipRoadmapItem', 'mcpLinkRoadmapIssue', 'mcpUnlinkRoadmapIssue',
  'mcpGetPublicSettings', 'mcpUpdatePublicSettings',
  'mcpListParticipants', 'mcpSetParticipantTrust', 'mcpListModerationQueue', 'mcpApproveIssueComment',
  'mcpHideIssueComment', 'mcpBlockCommentAuthor', 'mcpListIssueComments', 'mcpReplyToIssue',
  'mcpLockIssue', 'mcpUnlockIssue',
  'mcpListSecurityReports', 'mcpSetSecurityReportStatus',
  'mcpListGitHubSyncs', 'mcpGetGitHubSyncHealth', 'mcpResolveGitHubSyncConflict', 'mcpGetGitHubImportStatus',
];

describe('public tracker tools (#3233)', () => {
  afterEach(() => jest.clearAllMocks());

  describe('registration', () => {
    const names = ['manage_roadmap', 'get_public_tracker', 'manage_public_tracker'];

    it('registers each tool once, with a handler and remote access', () => {
      for (const name of names) {
        expect(TOOLS.filter((t) => t.name === name)).toHaveLength(1);
        expect(typeof HANDLERS[name]).toBe('function');
        expect(REMOTE_SAFE_TOOLS).toContain(name);
      }
    });

    it('marks only the read tool read-only', () => {
      expect(READ_ONLY_TOOLS.has('get_public_tracker')).toBe(true);
      expect(READ_ONLY_TOOLS.has('manage_roadmap')).toBe(false);
      expect(READ_ONLY_TOOLS.has('manage_public_tracker')).toBe(false);
    });

    it('maps every endpoint to a project-scoped MCP route', () => {
      for (const key of ENDPOINTS) {
        expect(ENDPOINT_MAP[key]).toBeDefined();
        expect(ENDPOINT_MAP[key].route).toMatch(/^mcp\/v1\/projects\/\{projectId\}\//);
      }
    });

    it('serves every read the read-only tool makes as a GET, so none is metered as a write', () => {
      const reads = ['mcpListRoadmapItems', 'mcpGetPublicSettings', 'mcpListParticipants', 'mcpListModerationQueue',
        'mcpListIssueComments', 'mcpListSecurityReports', 'mcpListGitHubSyncs', 'mcpGetGitHubSyncHealth',
        'mcpGetGitHubImportStatus'];
      for (const key of reads) expect(ENDPOINT_MAP[key].method).toBe('GET');
      for (const key of ENDPOINTS.filter((k) => !reads.includes(k))) {
        expect(ENDPOINT_MAP[key].method).not.toBe('GET');
      }
    });

    it('carries the warnings an agent needs before acting', () => {
      const roadmap = tool(ROADMAP_TOOLS, 'manage_roadmap');
      expect(roadmap.description).toMatch(/EMAILS THEIR REPORTERS AND FOLLOWERS/);
      expect(roadmap.description).toMatch(/PUBLIC board/);
      const manage = tool(PUBLIC_TRACKER_TOOLS, 'manage_public_tracker');
      expect(manage.description).toMatch(/MAKES THEM PUBLIC AT ONCE/);
      expect(manage.description).toMatch(/EMAILED TO THE REPORTER/);
      expect(manage.description).toMatch(/changes neither side/);
      const read = tool(PUBLIC_TRACKER_TOOLS, 'get_public_tracker');
      expect(read.description).toMatch(/name and email are not included/);
    });

    it('offers none of the actions #3219 kept off MCP', () => {
      const actions = [
        ...tool(ROADMAP_TOOLS, 'manage_roadmap').inputSchema.properties.action.enum,
        ...tool(PUBLIC_TRACKER_TOOLS, 'manage_public_tracker').inputSchema.properties.action.enum,
      ];
      for (const banned of [/secret/, /pii/, /erase/, /blocklist/, /import$/, /create_sync|delete_sync/]) {
        expect(actions.filter((a) => banned.test(a))).toEqual([]);
      }
      const routes = Object.values(ENDPOINT_MAP).map((m) => m.route);
      expect(routes.filter((r) => /identity-secret|erase-reporter|intake-blocklist|\/pii$/.test(r))).toEqual([]);
    });
  });

  describe('manage_roadmap', () => {
    it('creates a card with only the fields sent', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'i1' });
      await manageRoadmap({ action: 'create', projectId: P, title: 'Dark mode', column: 'next' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateRoadmapItem',
        { projectId: P, title: 'Dark mode', column: 'next' });
    });

    it('updates, keeping "" as a clear and false as a value', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageRoadmap({ action: 'update', projectId: P, itemId: 'i1', entityType: '', showTargetDate: false });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateRoadmapItem',
        { projectId: P, itemId: 'i1', entityType: '', showTargetDate: false });
    });

    it.each([
      ['delete', 'mcpDeleteRoadmapItem'],
      ['ship', 'mcpShipRoadmapItem'],
    ])('%s calls %s with the card', async (action, endpoint) => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageRoadmap({ action, projectId: P, itemId: 'i1', title: 'ignored' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith(endpoint, { projectId: P, itemId: 'i1' });
    });

    it.each([
      ['link_issue', 'mcpLinkRoadmapIssue'],
      ['unlink_issue', 'mcpUnlinkRoadmapIssue'],
    ])('%s calls %s with the issue number', async (action, endpoint) => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageRoadmap({ action, projectId: P, itemId: 'i1', number: 7 });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith(endpoint, { projectId: P, itemId: 'i1', number: 7 });
    });

    it('reorders a column', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ items: [] });
      await manageRoadmap({ action: 'reorder', projectId: P, column: 'now', ids: ['b', 'a'] });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReorderRoadmapItems',
        { projectId: P, column: 'now', ids: ['b', 'a'] });
    });

    it('validates before calling the API', async () => {
      await expect(manageRoadmap({ action: 'create', projectId: P })).rejects.toThrow(/title is required for create/);
      await expect(manageRoadmap({ action: 'update', projectId: P, itemId: 'i1' })).rejects.toThrow(/at least one of/);
      await expect(manageRoadmap({ action: 'reorder', projectId: P, column: 'now' })).rejects.toThrow(/ids is required/);
      await expect(manageRoadmap({ action: 'link_issue', projectId: P, itemId: 'i1' }))
        .rejects.toThrow(/number is required for link_issue/);
      await expect(manageRoadmap({ action: 'ship', itemId: 'i1' })).rejects.toThrow(/projectId is required/);
      await expect(manageRoadmap({ action: 'list', projectId: P })).rejects.toThrow(/Unknown action: list/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });
  });

  describe('get_public_tracker', () => {
    it.each([
      ['settings', 'mcpGetPublicSettings', {}, {}],
      ['roadmap', 'mcpListRoadmapItems', {}, {}],
      ['comments', 'mcpListModerationQueue', { state: 'hidden', limit: 5 }, { state: 'hidden', limit: 5 }],
      ['comments', 'mcpListIssueComments', { number: 3, state: 'hidden' }, { number: 3 }],
      ['participants', 'mcpListParticipants', { trust: 'blocked' }, { trust: 'blocked' }],
      ['security_reports', 'mcpListSecurityReports', { status: 'new,triaging' }, { status: 'new,triaging' }],
      ['github_syncs', 'mcpListGitHubSyncs', {}, {}],
      ['github_sync_health', 'mcpGetGitHubSyncHealth', { syncId: 's1' }, { syncId: 's1' }],
      ['github_import_status', 'mcpGetGitHubImportStatus', {}, {}],
    ])('%s calls %s', async (view, endpoint, args, sent) => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await getPublicTracker({ view, projectId: P, ...args });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith(endpoint, { projectId: P, ...sent });
    });

    it('validates before calling the API', async () => {
      await expect(getPublicTracker({ view: 'github_sync_health', projectId: P }))
        .rejects.toThrow(/syncId is required for github_sync_health/);
      await expect(getPublicTracker({ view: 'settings' })).rejects.toThrow(/projectId is required/);
      await expect(getPublicTracker({ view: 'pii', projectId: P })).rejects.toThrow(/Unknown view: pii/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });
  });

  describe('manage_public_tracker', () => {
    it('updates only the settings sent, keeping false', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await managePublicTracker({ action: 'update_settings', projectId: P, level: 'issues', roadmapEnabled: false });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdatePublicSettings',
        { projectId: P, level: 'issues', roadmapEnabled: false });
    });

    it.each([
      ['reply', 'mcpReplyToIssue', { number: 3, body: 'Fixed in `v2.0`, see https://ezmodo.com/x' }],
      ['approve_comment', 'mcpApproveIssueComment', { commentId: 'c1' }],
      ['hide_comment', 'mcpHideIssueComment', { commentId: 'c1' }],
      ['block_author', 'mcpBlockCommentAuthor', { commentId: 'c1' }],
      ['lock_issue', 'mcpLockIssue', { number: 3 }],
      ['unlock_issue', 'mcpUnlockIssue', { number: 3 }],
      ['set_trust', 'mcpSetParticipantTrust', { userId: 'u1', trust: 'trusted' }],
      ['set_security_report_status', 'mcpSetSecurityReportStatus', { feedbackId: 'f1', status: 'triaging' }],
      ['set_security_report_status', 'mcpSetSecurityReportStatus',
        { feedbackId: 'f1', status: 'converted', taskId: 't1' }],
      ['resolve_sync_conflict', 'mcpResolveGitHubSyncConflict', { syncId: 's1', conflictId: 'c1' }],
    ])('%s calls %s', async (action, endpoint, args) => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await managePublicTracker({ action, projectId: P, ...args });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith(endpoint, { projectId: P, ...args });
    });

    it('validates before calling the API', async () => {
      await expect(managePublicTracker({ action: 'update_settings', projectId: P }))
        .rejects.toThrow(/at least one of/);
      await expect(managePublicTracker({ action: 'reply', projectId: P, number: 3 }))
        .rejects.toThrow(/body is required for reply/);
      await expect(managePublicTracker({ action: 'set_security_report_status', projectId: P, feedbackId: 'f1', status: 'rejected' }))
        .rejects.toThrow(/reason is required/);
      await expect(managePublicTracker({ action: 'set_security_report_status', projectId: P, feedbackId: 'f1', status: 'converted' }))
        .rejects.toThrow(/taskId is required/);
      await expect(managePublicTracker({ action: 'set_trust', projectId: P, userId: 'u1' }))
        .rejects.toThrow(/trust is required for set_trust/);
      await expect(managePublicTracker({ action: 'erase_reporter', projectId: P }))
        .rejects.toThrow(/Unknown action: erase_reporter/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });
  });
});
