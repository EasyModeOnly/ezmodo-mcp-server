import { jest } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { listChangelog, getChangelogEntry, manageChangelog } = await import('../handlers/changelog.js');
const { CHANGELOG_TOOLS } = await import('../tools/changelog.js');
const { TOOLS } = await import('../tools/index.js');
const { HANDLERS } = await import('../handlers/index.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { READ_ONLY_TOOLS } = await import('../lib/tool-annotations.js');
const { REMOTE_SAFE_TOOLS } = await import('../lib/remote-tools.js');

const P = 'proj-1';

describe('changelog tools', () => {
  afterEach(() => jest.clearAllMocks());

  describe('registration', () => {
    const names = ['list_changelog', 'get_changelog_entry', 'manage_changelog'];

    it('registers each tool with a handler and remote access', () => {
      for (const name of names) {
        expect(TOOLS.filter((t) => t.name === name)).toHaveLength(1);
        expect(typeof HANDLERS[name]).toBe('function');
        expect(REMOTE_SAFE_TOOLS).toContain(name);
      }
    });

    it('marks only the reads read-only', () => {
      expect(READ_ONLY_TOOLS.has('list_changelog')).toBe(true);
      expect(READ_ONLY_TOOLS.has('get_changelog_entry')).toBe(true);
      expect(READ_ONLY_TOOLS.has('manage_changelog')).toBe(false);
    });

    it('maps every endpoint to a project-scoped MCP changelog route', () => {
      const endpoints = Object.keys(ENDPOINT_MAP)
        .filter((k) => ENDPOINT_MAP[k].route.startsWith('mcp/v1/projects/{projectId}/changelog'));
      expect(endpoints.sort()).toEqual([
        'mcpDraftChangelogEntry', 'mcpGetChangelogEntry', 'mcpListChangelog',
        'mcpPublishChangelogEntry', 'mcpUnpublishChangelogEntry', 'mcpUpdateChangelogEntry',
      ]);
      // Reads are GETs, so the API meters neither as a write.
      expect(ENDPOINT_MAP.mcpListChangelog.method).toBe('GET');
      expect(ENDPOINT_MAP.mcpGetChangelogEntry.method).toBe('GET');
      expect(ENDPOINT_MAP.mcpUpdateChangelogEntry.method).toBe('PATCH');
    });

    it('warns that publishing emails subscribers', () => {
      const manage = CHANGELOG_TOOLS.find((t) => t.name === 'manage_changelog');
      expect(manage.inputSchema.properties.action.enum).toEqual(['draft', 'update', 'publish', 'unpublish']);
      expect(manage.description).toMatch(/EMAIL THE PROJECT'S VERIFIED SUBSCRIBERS/);
      expect(manage.description).toMatch(/not_released/);
      expect(manage.description).toMatch(/cannot be deleted/);
      expect(manage.description).toMatch(/never paste internal details/);
      const list = CHANGELOG_TOOLS.find((t) => t.name === 'list_changelog');
      expect(list.description).toMatch(/WITHOUT bodies/);
    });
  });

  describe('reads', () => {
    it('lists the changelog', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ entries: [], candidates: [], verifiedSubscribers: 0 });
      await listChangelog({ projectId: P });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListChangelog', { projectId: P });
    });

    it('gets one entry', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'e1' });
      await getChangelogEntry({ projectId: P, entryId: 'e1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetChangelogEntry', { projectId: P, entryId: 'e1' });
    });

    it('requires projectId and entryId', async () => {
      await expect(listChangelog({})).rejects.toThrow(/projectId is required/);
      await expect(getChangelogEntry({ projectId: P })).rejects.toThrow(/entryId is required/);
    });
  });

  describe('manageChangelog', () => {
    it('drafts an entry from a milestone', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'e1', state: 'draft' });
      await manageChangelog({ action: 'draft', projectId: P, milestoneId: 'ms-1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDraftChangelogEntry', { projectId: P, milestoneId: 'ms-1' });
    });

    it('updates only the fields sent, keeping an empty version as a clear', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'e1' });
      const body = 'Run `claude mcp add ezmodo https://ezmodo.com/mcp`.';
      await manageChangelog({ action: 'update', projectId: P, entryId: 'e1', body, version: '' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateChangelogEntry',
        { projectId: P, entryId: 'e1', body, version: '' });
    });

    it('refuses an update with nothing to change', async () => {
      await expect(manageChangelog({ action: 'update', projectId: P, entryId: 'e1' }))
        .rejects.toThrow(/at least one of: title, version, body/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it.each([
      ['publish', 'mcpPublishChangelogEntry'],
      ['unpublish', 'mcpUnpublishChangelogEntry'],
    ])('%s calls %s with the entry', async (action, endpoint) => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageChangelog({ action, projectId: P, entryId: 'e1', title: 'ignored' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith(endpoint, { projectId: P, entryId: 'e1' });
    });

    it('validates required fields per action', async () => {
      await expect(manageChangelog({ action: 'draft', projectId: P })).rejects.toThrow(/milestoneId is required for draft/);
      await expect(manageChangelog({ action: 'publish', projectId: P })).rejects.toThrow(/entryId is required for publish/);
      await expect(manageChangelog({ action: 'draft', milestoneId: 'm' })).rejects.toThrow(/projectId is required/);
      await expect(manageChangelog({ action: 'delete', projectId: P })).rejects.toThrow(/Unknown action: delete/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });
  });
});
