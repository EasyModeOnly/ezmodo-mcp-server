import { jest } from '@jest/globals';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { manageFeature, getFeature, searchFeatures } = await import('../handlers/features.js');

describe('Feature Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageFeature', () => {
    it('should create a feature', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ feature: { id: 'feat-1', title: 'Push Notifications' } });

      const params = { organizationId: 'org-1', title: 'Push Notifications' };
      const result = await manageFeature({ action: 'create', ...params });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateFeature', params);
      expect(result.feature.id).toBe('feat-1');
    });

    it('should link an artifact to a feature', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageFeature({ action: 'link', featureId: 'feat-1', targetType: 'epic', targetId: 'epic-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpLinkFeatureArtifact', {
        featureId: 'feat-1', targetType: 'epic', targetId: 'epic-9',
      });
    });

    it('should generate the how-it-works summary', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ feature: { id: 'feat-1', howItWorks: '## How it works' } });

      const result = await manageFeature({ action: 'generate_how_it_works', featureId: 'feat-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGenerateHowItWorks', { featureId: 'feat-1' });
      expect(result.feature.howItWorks).toBe('## How it works');
    });

    it('should add feature paths, defaulting the mode to add', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ paths: [{ projectId: 'p1', sourcePath: 'api/x' }] });

      const paths = [{ projectId: 'p1', sourcePath: 'api/x' }];
      const result = await manageFeature({ action: 'paths', featureId: 'feat-1', paths });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSetFeaturePaths', {
        featureId: 'feat-1', mode: 'add', paths,
      });
      expect(result.paths).toHaveLength(1);
    });

    it('should pass an explicit paths mode through', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ paths: [] });

      await manageFeature({ action: 'paths', featureId: 'feat-1', pathsMode: 'replace', paths: [] });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSetFeaturePaths', {
        featureId: 'feat-1', mode: 'replace', paths: [],
      });
    });

    it('should reject an unknown action', async () => {
      await expect(manageFeature({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
    });
  });

  describe('getFeature includePaths', () => {
    it('should attach the feature paths to a single lookup', async () => {
      mockCallZephlyAPI
        .mockResolvedValueOnce({ feature: { id: 'feat-1' } })
        .mockResolvedValueOnce({ paths: [{ projectId: 'p1', sourcePath: 'web/src/app/x' }] });

      const result = await getFeature({ featureId: 'feat-1', includePaths: true });

      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(2, 'mcpListFeaturePaths', { featureId: 'feat-1' });
      expect(result.paths).toEqual([{ projectId: 'p1', sourcePath: 'web/src/app/x' }]);
    });
  });

  describe('searchFeatures', () => {
    it('should search features by query', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({
        results: [{ feature: { id: 'feat-1', title: 'Push Notifications' }, similarity: 0.92 }],
      });

      const result = await searchFeatures({ organizationId: 'org-1', query: 'notify users' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSearchFeatures', {
        organizationId: 'org-1', query: 'notify users',
      });
      expect(result.results).toHaveLength(1);
      expect(result.results[0].similarity).toBe(0.92);
    });

    it('should forward an explicit limit', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ results: [] });

      await searchFeatures({ organizationId: 'org-1', query: 'csv export', limit: 3 });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSearchFeatures', {
        organizationId: 'org-1', query: 'csv export', limit: 3,
      });
    });
  });

  describe('getFeature', () => {
    it('should do a single lookup by id', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ feature: { id: 'feat-1' } });

      await getFeature({ featureId: 'feat-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetFeature', { featureId: 'feat-1' });
    });

    it('should list features for an organization', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ features: [] });

      await getFeature({ organizationId: 'org-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListFeatures', { organizationId: 'org-1' });
    });
  });
});
