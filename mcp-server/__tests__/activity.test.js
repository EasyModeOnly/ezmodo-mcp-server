import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { getProjectChanges } = await import('../handlers/activity.js');

describe('Activity Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjectChanges', () => {
    const mockActivityResponse = {
      events: [
        {
          id: 'evt-1',
          eventType: 'task_completed',
          entityType: 'task',
          entityId: 'task-1',
          entityTitle: 'Fix login bug',
          actor: { type: 'human', id: 'user-1', name: 'Sarah' },
          metadata: { taskNumber: 42 },
          timestamp: '2026-04-03T14:00:00Z',
        },
        {
          id: 'evt-2',
          eventType: 'epic_created',
          entityType: 'epic',
          entityId: 'epic-1',
          entityTitle: 'User Auth',
          actor: { type: 'human', id: 'user-1', name: 'Sarah' },
          metadata: { epicNumber: 5 },
          timestamp: '2026-04-03T10:00:00Z',
        },
      ],
      totalCount: 2,
      summary: {
        totalEvents: 2,
        eventTypeCounts: { task_completed: 1, epic_created: 1 },
        entityTypeCounts: { task: 1, epic: 1 },
        uniqueActors: 1,
      },
    };

    it('should get project changes with default params', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce(mockActivityResponse);

      const result = await getProjectChanges({ projectId: 'proj-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetProjectChanges', expect.objectContaining({
        projectId: 'proj-1',
        limit: 20,
        includeSummary: true,
      }));
      expect(result.totalCount).toBe(2);
      expect(result.events).toHaveLength(2);
      expect(result.summary).toBeDefined();
    });

    it('should add humanDescription to events', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce(mockActivityResponse);

      const result = await getProjectChanges({ projectId: 'proj-1' });

      expect(result.events[0].humanDescription).toBe("Sarah completed task #42 'Fix login bug'");
      expect(result.events[1].humanDescription).toBe("Sarah created epic E-5 'User Auth'");
    });

    it('should parse relative duration "7d"', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ events: [], totalCount: 0, summary: null });

      await getProjectChanges({ projectId: 'proj-1', since: '7d' });

      const call = mockCallZephlyAPI.mock.calls[0];
      const sinceDate = new Date(call[1].since);
      const daysAgo = (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysAgo).toBeGreaterThan(6.9);
      expect(daysAgo).toBeLessThan(7.1);
    });

    it('should parse relative duration "2w"', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ events: [], totalCount: 0, summary: null });

      await getProjectChanges({ projectId: 'proj-1', since: '2w' });

      const call = mockCallZephlyAPI.mock.calls[0];
      const sinceDate = new Date(call[1].since);
      const daysAgo = (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysAgo).toBeGreaterThan(13.9);
      expect(daysAgo).toBeLessThan(14.1);
    });

    it('should pass through ISO date unchanged', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ events: [], totalCount: 0, summary: null });

      await getProjectChanges({ projectId: 'proj-1', since: '2026-04-01T00:00:00Z' });

      const call = mockCallZephlyAPI.mock.calls[0];
      expect(call[1].since).toBe('2026-04-01T00:00:00Z');
    });

    it('should pass entity type filter', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ events: [], totalCount: 0, summary: null });

      await getProjectChanges({ projectId: 'proj-1', entityTypes: 'task,epic' });

      const call = mockCallZephlyAPI.mock.calls[0];
      expect(call[1].entityType).toBe('task,epic');
    });

    it('should cap limit at 100', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ events: [], totalCount: 0, summary: null });

      await getProjectChanges({ projectId: 'proj-1', limit: 500 });

      const call = mockCallZephlyAPI.mock.calls[0];
      expect(call[1].limit).toBe(100);
    });

    it('should throw if projectId is missing', async () => {
      await expect(getProjectChanges({})).rejects.toThrow('projectId is required');
    });

    it('should handle API error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Not found', 404));
      await expect(getProjectChanges({ projectId: 'proj-1' })).rejects.toThrow('Not found');
    });
  });
});
