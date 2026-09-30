import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

// The file layer has its own tests (design-files.test.js). Here it reports
// "no .ezmodo directory" unless a test says otherwise, so nothing is written
// into the real checkout.
const mockWriteDesignFiles = jest.fn(async () => null);
const mockReadDesignFiles = jest.fn();
const mockRecordPushed = jest.fn();
const mockSetAsideAndRefresh = jest.fn();
jest.unstable_mockModule('../lib/design-files.js', () => ({
  writeDesignFiles: mockWriteDesignFiles,
  readDesignFiles: mockReadDesignFiles,
  recordPushed: mockRecordPushed,
  setAsideAndRefresh: mockSetAsideAndRefresh,
}));

const { manageDesign, getDesign, listDesigns, getDesignSystem, MAX_DESIGN_IDS } = await import('../handlers/designs.js');

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

  describe('local files (E-279 #3051)', () => {
    const full = { id: 'des-1', name: 'Button', html: '<b/>', css: '.b{}', description: 'notes', updatedAt: 'v1' };

    it('returns metadata and paths instead of content when the design was written locally', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ design: full });
      mockWriteDesignFiles.mockResolvedValueOnce({ dir: '/p/.ezmodo/designs/button', files: { html: '/p/.ezmodo/designs/button/index.html' } });

      const result = await getDesign({ designId: 'des-1' });

      expect(result.design.html).toBeUndefined();
      expect(result.design.css).toBeUndefined();
      expect(result.design.size).toBe(8);
      expect(result.localDir).toBe('/p/.ezmodo/designs/button');
      expect(result.message).toMatch(/fromFiles:true/);
    });

    it('returns content inline when asked, without writing', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ design: full });

      const result = await getDesign({ designId: 'des-1', inline: true });

      expect(mockWriteDesignFiles).not.toHaveBeenCalled();
      expect(result.design.html).toBe('<b/>');
    });

    it('says so when local edits were not overwritten', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ design: full });
      mockWriteDesignFiles.mockResolvedValueOnce({ dir: '/d', files: {}, localChanges: ['html'] });

      const result = await getDesign({ designId: 'des-1' });

      expect(result.localChanges).toEqual(['html']);
      expect(result.message).toMatch(/NOT overwritten/);
    });

    it('pushes only the edited fields, conditional on the downloaded version', async () => {
      mockReadDesignFiles.mockResolvedValueOnce({
        dir: '/d', meta: { updatedAt: 'v1', hashes: {} }, changed: ['html'],
        fields: { html: '<i/>', css: '.b{}', description: 'notes' },
      });
      mockCallEzmodoAPI.mockResolvedValueOnce({ design: { id: 'des-1', updatedAt: 'v2' } });

      const result = await manageDesign({ action: 'update', designId: 'des-1', fromFiles: true });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDesign', {
        designId: 'des-1', html: '<i/>', expectedUpdatedAt: 'v1',
      });
      expect(mockRecordPushed).toHaveBeenCalledWith('/d', expect.anything(), expect.anything(), 'v2');
      expect(result.pushed).toEqual(['html']);
    });

    it('on a conflict, refreshes the files and keeps the agent\'s version aside', async () => {
      mockReadDesignFiles.mockResolvedValueOnce({
        dir: '/d', meta: { updatedAt: 'v1' }, changed: ['css'], fields: { css: '.x{}' },
      });
      const conflict = Object.assign(new Error('design des-1 changed since you read it'), { status: 409 });
      mockCallEzmodoAPI
        .mockRejectedValueOnce(conflict)
        .mockResolvedValueOnce({ design: { id: 'des-1', updatedAt: 'v3' } });
      mockSetAsideAndRefresh.mockResolvedValueOnce({ css: '/d/styles.mine.css' });

      await expect(manageDesign({ action: 'update', designId: 'des-1', fromFiles: true }))
        .rejects.toThrow(/styles\.mine\.css.*Reapply/);
      expect(mockSetAsideAndRefresh).toHaveBeenCalledWith('/d', { id: 'des-1', updatedAt: 'v3' });
      expect(mockRecordPushed).not.toHaveBeenCalled();
    });

    it('refuses fromFiles combined with content or edits', async () => {
      await expect(manageDesign({ action: 'update', designId: 'des-1', fromFiles: true, html: '<b/>' }))
        .rejects.toThrow(/do not also send html/);
    });

    it('reports nothing to push without calling the API', async () => {
      mockReadDesignFiles.mockResolvedValueOnce({ dir: '/d', meta: { updatedAt: 'v1' }, changed: [], fields: {} });

      const result = await manageDesign({ action: 'update', designId: 'des-1', fromFiles: true });

      expect(result.message).toMatch(/No local changes/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });
  });

  describe('getDesign', () => {
    it('fetches several designs in full, in the order asked, deduplicated', async () => {
      mockCallEzmodoAPI
        .mockResolvedValueOnce({ design: { id: 'des-2' } })
        .mockResolvedValueOnce({ design: { id: 'des-1' } });

      const result = await getDesign({ designIds: ['des-2', 'des-1', 'des-2'] });

      expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(2);
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpGetDesign', { designId: 'des-2' });
      expect(result.designs.map((d) => d.id)).toEqual(['des-2', 'des-1']);
    });

    it('refuses a batch over the cap rather than rebuilding the whole payload', async () => {
      const ids = Array.from({ length: MAX_DESIGN_IDS + 1 }, (_, i) => `des-${i}`);
      await expect(getDesign({ designIds: ids })).rejects.toThrow(/at most 10/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('passes includeContent through on a linked lookup', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ designs: [] });

      await getDesign({ linkedType: 'feature', linkedId: 'feat-1', includeContent: true });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDesigns', {
        linkedType: 'feature', linkedId: 'feat-1', includeContent: true,
      });
    });

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
