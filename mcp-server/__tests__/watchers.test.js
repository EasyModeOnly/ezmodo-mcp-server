import { jest } from '@jest/globals';

const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { manageWatch, listWatched, listNotifications } = await import('../handlers/watchers.js');
const { WATCHER_TOOLS } = await import('../tools/watchers.js');

describe('Watching Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manage_watch', () => {
    it('watches a task', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageWatch({ action: 'watch', taskId: 'task-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpManageWatch', {
        action: 'watch',
        taskId: 'task-1',
      });
    });

    it('unwatches a task', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageWatch({ action: 'unwatch', taskId: 'task-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpManageWatch', {
        action: 'unwatch',
        taskId: 'task-1',
      });
    });

    it('rejects an unknown action without calling the API', async () => {
      await expect(manageWatch({ action: 'mute', taskId: 'task-1' })).rejects.toThrow(/Unknown action/);
      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });

    it('requires a taskId', async () => {
      await expect(manageWatch({ action: 'watch' })).rejects.toThrow(/taskId is required/);
      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });
  });

  describe('list_watched', () => {
    it('lists watched tasks for an organization', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ watching: [] });

      await listWatched({ organizationId: 'org-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListWatched', { organizationId: 'org-1' });
    });

    it('passes a limit when given', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ watching: [] });

      await listWatched({ organizationId: 'org-1', limit: 10 });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListWatched', {
        organizationId: 'org-1',
        limit: 10,
      });
    });

    it('requires an organizationId', async () => {
      await expect(listWatched({})).rejects.toThrow(/organizationId is required/);
      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });
  });

  describe('list_notifications', () => {
    // The API already defaults to unread; echoing the default back would just
    // be noise in the query string.
    it('sends no unreadOnly flag by default', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ notifications: [] });

      await listNotifications();

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListNotifications', {});
    });

    it('sends unreadOnly only when explicitly disabled', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ notifications: [] });

      await listNotifications({ unreadOnly: false, limit: 5 });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListNotifications', {
        unreadOnly: false,
        limit: 5,
      });
    });
  });

  describe('tool definitions', () => {
    it('exposes three tools', () => {
      expect(WATCHER_TOOLS.map((t) => t.name)).toEqual([
        'manage_watch',
        'list_watched',
        'list_notifications',
      ]);
    });

    // The acting user is the API key's owner. A userId parameter would let an
    // agent subscribe a colleague to anything, so none of these may grow one.
    it('never accepts a userId parameter', () => {
      for (const tool of WATCHER_TOOLS) {
        expect(Object.keys(tool.inputSchema.properties)).not.toContain('userId');
      }
    });
  });
});
