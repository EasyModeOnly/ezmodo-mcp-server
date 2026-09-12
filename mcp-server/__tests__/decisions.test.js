import { jest } from '@jest/globals';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { manageDecision, getDecision } = await import('../handlers/decisions.js');

describe('Decision Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageDecision', () => {
    it('should create a decision', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ decision: { id: 'dec-1', title: 'Use PostgreSQL' } });

      const params = { organizationId: 'org-1', title: 'Use PostgreSQL', status: 'accepted' };
      const result = await manageDecision({ action: 'create', ...params });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateDecision', params);
      expect(result.decision.id).toBe('dec-1');
    });

    it('should link an artifact to a decision', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageDecision({ action: 'link', decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpLinkDecisionArtifact', {
        decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should unlink an artifact from a decision', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageDecision({ action: 'unlink', decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUnlinkDecisionArtifact', {
        decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should supersede a decision', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageDecision({ action: 'supersede', decisionId: 'dec-1', supersededById: 'dec-2' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSupersedeDecision', {
        decisionId: 'dec-1', supersededById: 'dec-2',
      });
    });

    it('should promote a knowledge item into a decision', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ decision: { id: 'dec-3' } });

      await manageDecision({
        action: 'promote_from_knowledge',
        organizationId: 'org-1',
        taskId: 'task-1',
        knowledgeId: 'know-1',
        linkToType: 'feature',
        linkToId: 'feat-9',
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpPromoteDecisionFromKnowledge', {
        organizationId: 'org-1',
        taskId: 'task-1',
        knowledgeId: 'know-1',
        title: undefined,
        linkToType: 'feature',
        linkToId: 'feat-9',
      });
    });

    it('should reject an unknown action', async () => {
      await expect(manageDecision({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
    });
  });

  describe('getDecision', () => {
    it('should do a single lookup by id', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ decision: { id: 'dec-1' } });

      await getDecision({ decisionId: 'dec-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetDecision', { decisionId: 'dec-1' });
    });

    it('should include links on a single lookup', async () => {
      mockCallZephlyAPI
        .mockResolvedValueOnce({ decision: { id: 'dec-1' } })
        .mockResolvedValueOnce({ links: [{ targetType: 'feature', targetId: 'feat-9' }] });

      const result = await getDecision({ decisionId: 'dec-1', includeLinks: true });

      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(1, 'mcpGetDecision', { decisionId: 'dec-1' });
      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(2, 'mcpListDecisionLinks', { decisionId: 'dec-1' });
      expect(result.links).toHaveLength(1);
    });

    it('should list decisions for an organization', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ decisions: [] });

      await getDecision({ organizationId: 'org-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListDecisions', { organizationId: 'org-1' });
    });

    it('should list decisions linked to an entity', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ decisions: [] });

      await getDecision({ organizationId: 'org-1', linkedType: 'feature', linkedId: 'feat-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListDecisions', {
        organizationId: 'org-1', linkedType: 'feature', linkedId: 'feat-9',
      });
    });
  });
});
