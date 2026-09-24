import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageDesign, getDesign, listDesigns, getDesignSystem } = await import('../handlers/designs.js');

describe('Design Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageDesign', () => {
    it('should create a design', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ design: { id: 'des-1', kind: 'theme' } });

      const params = { organizationId: 'org-1', title: 'House Theme', kind: 'theme', html: '<div/>' };
      const result = await manageDesign({ action: 'create', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDesign', params);
      expect(result.design.id).toBe('des-1');
    });

    it('should update a design', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ design: { id: 'des-1' } });

      const params = { designId: 'des-1', title: 'Updated' };
      await manageDesign({ action: 'update', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDesign', params);
    });

    it('should delete a design', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageDesign({ action: 'delete', designId: 'des-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteDesign', { designId: 'des-1' });
    });

    it('should link an artifact to a design', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageDesign({ action: 'link', designId: 'des-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpLinkDesign', {
        designId: 'des-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should unlink an artifact from a design', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageDesign({ action: 'unlink', designId: 'des-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUnlinkDesign', {
        designId: 'des-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should reject an unknown action', async () => {
      await expect(manageDesign({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
    });
  });

  describe('getDesign', () => {
    it('should do a single lookup by id', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ design: { id: 'des-1' } });

      await getDesign({ designId: 'des-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDesign', { designId: 'des-1' });
    });

    it('should include links on a single lookup', async () => {
      mockCallEzmodoAPI
        .mockResolvedValueOnce({ design: { id: 'des-1' } })
        .mockResolvedValueOnce({ links: [{ targetType: 'feature', targetId: 'feat-9' }] });

      const result = await getDesign({ designId: 'des-1', includeLinks: true });

      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpGetDesign', { designId: 'des-1' });
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpListDesignLinks', { designId: 'des-1' });
      expect(result.links).toHaveLength(1);
    });

    it('should list designs linked to an entity', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ designs: [] });

      await getDesign({ linkedType: 'feature', linkedId: 'feat-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDesigns', {
        linkedType: 'feature', linkedId: 'feat-9',
      });
    });

    it('should pass org/project/kind/status/limit through on a linked lookup', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ designs: [] });

      await getDesign({
        linkedType: 'feature',
        linkedId: 'feat-9',
        organizationId: 'org-1',
        projectId: 'proj-1',
        kind: 'component',
        status: 'active',
        limit: 5,
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDesigns', {
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
      mockCallEzmodoAPI.mockResolvedValueOnce({ designs: [] });

      await getDesign({ organizationId: 'org-1', kind: 'page' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDesigns', {
        organizationId: 'org-1', kind: 'page',
      });
    });
  });

  describe('listDesigns', () => {
    it('should pass organizationId/projectId/kind/status/includeOrgWide/limit through', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ designs: [] });

      await listDesigns({
        organizationId: 'org-1',
        projectId: 'proj-1',
        kind: 'theme',
        status: 'active',
        includeOrgWide: true,
        limit: 10,
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDesigns', {
        organizationId: 'org-1',
        projectId: 'proj-1',
        kind: 'theme',
        status: 'active',
        includeOrgWide: true,
        limit: 10,
      });
    });

    it('should omit unspecified filters', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ designs: [] });

      await listDesigns({ organizationId: 'org-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDesigns', { organizationId: 'org-1' });
    });
  });

  describe('getDesignSystem', () => {
    it('should pass organizationId and projectId through', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ theme: null, components: [] });

      await getDesignSystem({ organizationId: 'org-1', projectId: 'proj-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDesignSystem', {
        organizationId: 'org-1', projectId: 'proj-1',
      });
    });

    it('should omit unspecified args', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ theme: null, components: [] });

      await getDesignSystem({ organizationId: 'org-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDesignSystem', { organizationId: 'org-1' });
    });
  });
});
