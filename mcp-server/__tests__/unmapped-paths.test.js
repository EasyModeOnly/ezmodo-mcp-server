import { jest } from '@jest/globals';

const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { listUnmappedPaths, resolveUnmapped } = await import('../handlers/unmapped-paths.js');

describe('Unmapped path operations', () => {
  afterEach(() => jest.clearAllMocks());

  describe('listUnmappedPaths', () => {
    it('defaults to the API default status', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ paths: [{ id: 'u1', sourcePath: 'mobile/lib/legacy' }] });

      const result = await listUnmappedPaths({ projectId: 'p1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListUnmappedPaths', { projectId: 'p1' });
      expect(result.paths).toHaveLength(1);
    });

    it('passes an explicit status through', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ paths: [] });

      await listUnmappedPaths({ projectId: 'p1', status: 'all' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListUnmappedPaths', { projectId: 'p1', status: 'all' });
    });

    it('requires a project', async () => {
      await expect(listUnmappedPaths({})).rejects.toThrow(/projectId/);
      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });
  });

  describe('resolveUnmapped', () => {
    it('reconciles a whole project', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ resolved: [{ id: 'u1', featureId: 'f1' }], ambiguous: [], stillPending: 0 });

      const result = await resolveUnmapped({ action: 'reconcile', projectId: 'p1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpReconcileUnmappedPaths', { projectId: 'p1' });
      expect(result.resolved).toHaveLength(1);
    });

    it('assigns one row to a feature', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ path: { id: 'u1', status: 'assigned' } });

      await resolveUnmapped({ action: 'assign', projectId: 'p1', pathId: 'u1', featureId: 'f1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpAssignUnmappedPath', {
        projectId: 'p1', pathId: 'u1', featureId: 'f1',
      });
    });

    it('dismisses one row', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ path: { id: 'u1', status: 'dismissed' } });

      await resolveUnmapped({ action: 'dismiss', projectId: 'p1', pathId: 'u1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpDismissUnmappedPath', { projectId: 'p1', pathId: 'u1' });
    });

    it('validates arguments before calling the API', async () => {
      await expect(resolveUnmapped({ action: 'reconcile' })).rejects.toThrow(/projectId/);
      await expect(resolveUnmapped({ action: 'assign', projectId: 'p1' })).rejects.toThrow(/pathId/);
      await expect(resolveUnmapped({ action: 'assign', projectId: 'p1', pathId: 'u1' })).rejects.toThrow(/featureId/);
      await expect(resolveUnmapped({ action: 'dismiss', projectId: 'p1' })).rejects.toThrow(/pathId/);
      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });

    it('rejects an unknown action', async () => {
      await expect(resolveUnmapped({ action: 'frobnicate', projectId: 'p1' })).rejects.toThrow(/Unknown action/);
    });
  });
});
