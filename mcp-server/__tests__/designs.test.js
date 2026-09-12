import { jest } from '@jest/globals';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { manageDesign, getDesign, listDesigns, getDesignSystem } = await import('../handlers/designs.js');

describe('Design Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageDesign', () => {
    it('should create a design', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ design: { id: 'des-1', kind: 'theme' } });

      const params = { organizationId: 'org-1', title: 'House Theme', kind: 'theme', html: '<div/>' };
      const result = await manageDesign({ action: 'create', ...params });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateDesign', params);
      expect(result.design.id).toBe('des-1');
    });

    it('should update a design', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ design: { id: 'des-1' } });

      const params = { designId: 'des-1', title: 'Updated' };
      await manageDesign({ action: 'update', ...params });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUpdateDesign', params);
    });

    it('should delete a design', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageDesign({ action: 'delete', designId: 'des-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpDeleteDesign', { designId: 'des-1' });
    });

    it('should link an artifact to a design', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageDesign({ action: 'link', designId: 'des-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpLinkDesign', {
        designId: 'des-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should unlink an artifact from a design', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageDesign({ action: 'unlink', designId: 'des-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUnlinkDesign', {
        designId: 'des-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should reject an unknown action', async () => {
      await expect(manageDesign({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
    });
  });

  describe('getDesign', () => {
    it('should do a single lookup by id', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ design: { id: 'des-1' } });

      await getDesign({ designId: 'des-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetDesign', { designId: 'des-1' });
    });

    it('should include links on a single lookup', async () => {
      mockCallZephlyAPI
        .mockResolvedValueOnce({ design: { id: 'des-1' } })
        .mockResolvedValueOnce({ links: [{ targetType: 'feature', targetId: 'feat-9' }] });

      const result = await getDesign({ designId: 'des-1', includeLinks: true });

      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(1, 'mcpGetDesign', { designId: 'des-1' });
      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(2, 'mcpListDesignLinks', { designId: 'des-1' });
      expect(result.links).toHaveLength(1);
    });

    it('should list designs linked to an entity', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ designs: [] });

      await getDesign({ linkedType: 'feature', linkedId: 'feat-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListDesigns', {
        linkedType: 'feature', linkedId: 'feat-9',
      });
    });

    it('should pass org/project/kind/status/limit through on a linked lookup', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ designs: [] });

      await getDesign({
        linkedType: 'feature',
        linkedId: 'feat-9',
        organizationId: 'org-1',
        projectId: 'proj-1',
        kind: 'component',
        status: 'active',
        limit: 5,
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListDesigns', {
        linkedType: 'feature',
        linkedId: 'feat-9',
        organizationId: 'org-1',
        projectId: 'proj-1',
        kind: 'component',
        status: 'active',
        limit: 5,
      });
    });

    it('should fall back to list mode when no designId/linked entity', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ designs: [] });

      await getDesign({ organizationId: 'org-1', kind: 'page' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListDesigns', {
        organizationId: 'org-1', kind: 'page',
      });
    });
  });

  describe('listDesigns', () => {
    it('should pass organizationId/projectId/kind/status/includeOrgWide/limit through', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ designs: [] });

      await listDesigns({
        organizationId: 'org-1',
        projectId: 'proj-1',
        kind: 'theme',
        status: 'active',
        includeOrgWide: true,
        limit: 10,
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListDesigns', {
        organizationId: 'org-1',
        projectId: 'proj-1',
        kind: 'theme',
        status: 'active',
        includeOrgWide: true,
        limit: 10,
      });
    });

    it('should omit unspecified filters', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ designs: [] });

      await listDesigns({ organizationId: 'org-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListDesigns', { organizationId: 'org-1' });
    });
  });

  describe('getDesignSystem', () => {
    it('should pass organizationId and projectId through', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ theme: null, components: [] });

      await getDesignSystem({ organizationId: 'org-1', projectId: 'proj-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetDesignSystem', {
        organizationId: 'org-1', projectId: 'proj-1',
      });
    });

    it('should omit unspecified args', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ theme: null, components: [] });

      await getDesignSystem({ organizationId: 'org-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetDesignSystem', { organizationId: 'org-1' });
    });
  });
});
