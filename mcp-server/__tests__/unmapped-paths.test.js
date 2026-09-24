import { jest } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { listUnmappedPaths, resolveUnmapped } = await import('../handlers/unmapped-paths.js');

describe('Unmapped path operations', () => {
  afterEach(() => jest.clearAllMocks());

  describe('listUnmappedPaths', () => {
    it('defaults to the API default status', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ paths: [{ id: 'u1', sourcePath: 'mobile/lib/legacy' }] });

      const result = await listUnmappedPaths({ projectId: 'p1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListUnmappedPaths', { projectId: 'p1' });
      expect(result.paths).toHaveLength(1);
    });

    it('passes an explicit status through', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ paths: [] });

      await listUnmappedPaths({ projectId: 'p1', status: 'all' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListUnmappedPaths', { projectId: 'p1', status: 'all' });
    });

    it('requires a project', async () => {
      await expect(listUnmappedPaths({})).rejects.toThrow(/projectId/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });
  });

  describe('resolveUnmapped', () => {
    it('reconciles a whole project', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ resolved: [{ id: 'u1', featureId: 'f1' }], ambiguous: [], stillPending: 0 });

      const result = await resolveUnmapped({ action: 'reconcile', projectId: 'p1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReconcileUnmappedPaths', { projectId: 'p1' });
      expect(result.resolved).toHaveLength(1);
    });

    it('assigns one row to a feature', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ path: { id: 'u1', status: 'assigned' } });

      await resolveUnmapped({ action: 'assign', projectId: 'p1', pathId: 'u1', featureId: 'f1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpAssignUnmappedPath', {
        projectId: 'p1', pathId: 'u1', featureId: 'f1',
      });
    });

    it('dismisses one row', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ path: { id: 'u1', status: 'dismissed' } });

      await resolveUnmapped({ action: 'dismiss', projectId: 'p1', pathId: 'u1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDismissUnmappedPath', { projectId: 'p1', pathId: 'u1' });
    });

    it('validates arguments before calling the API', async () => {
      await expect(resolveUnmapped({ action: 'reconcile' })).rejects.toThrow(/projectId/);
      await expect(resolveUnmapped({ action: 'assign', projectId: 'p1' })).rejects.toThrow(/pathId/);
      await expect(resolveUnmapped({ action: 'assign', projectId: 'p1', pathId: 'u1' })).rejects.toThrow(/featureId/);
      await expect(resolveUnmapped({ action: 'dismiss', projectId: 'p1' })).rejects.toThrow(/pathId/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('rejects an unknown action', async () => {
      await expect(resolveUnmapped({ action: 'frobnicate', projectId: 'p1' })).rejects.toThrow(/Unknown action/);
    });
  });
});
