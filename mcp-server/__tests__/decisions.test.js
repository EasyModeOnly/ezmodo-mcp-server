import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageDecision, getDecision } = await import('../handlers/decisions.js');

describe('Decision Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageDecision', () => {
    it('should create a decision', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decision: { id: 'dec-1', title: 'Use PostgreSQL' } });

      const params = { organizationId: 'org-1', title: 'Use PostgreSQL', status: 'accepted' };
      const result = await manageDecision({ action: 'create', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDecision', params);
      expect(result.decision.id).toBe('dec-1');
    });

    it('should link an artifact to a decision', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageDecision({ action: 'link', decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpLinkDecisionArtifact', {
        decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should unlink an artifact from a decision', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageDecision({ action: 'unlink', decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUnlinkDecisionArtifact', {
        decisionId: 'dec-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should supersede a decision', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageDecision({ action: 'supersede', decisionId: 'dec-1', supersededById: 'dec-2' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSupersedeDecision', {
        decisionId: 'dec-1', supersededById: 'dec-2',
      });
    });

    it('should promote a knowledge item into a decision', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decision: { id: 'dec-3' } });

      await manageDecision({
        action: 'promote_from_knowledge',
        organizationId: 'org-1',
        taskId: 'task-1',
        knowledgeId: 'know-1',
        linkToType: 'feature',
        linkToId: 'feat-9',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpPromoteDecisionFromKnowledge', {
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
      mockCallEzmodoAPI.mockResolvedValueOnce({ decision: { id: 'dec-1' } });

      await getDecision({ decisionId: 'dec-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDecision', { decisionId: 'dec-1' });
    });

    it('should include links on a single lookup', async () => {
      mockCallEzmodoAPI
        .mockResolvedValueOnce({ decision: { id: 'dec-1' } })
        .mockResolvedValueOnce({ links: [{ targetType: 'feature', targetId: 'feat-9' }] });

      const result = await getDecision({ decisionId: 'dec-1', includeLinks: true });

      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpGetDecision', { decisionId: 'dec-1' });
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpListDecisionLinks', { decisionId: 'dec-1' });
      expect(result.links).toHaveLength(1);
    });

    it('should list decisions for an organization', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decisions: [] });

      await getDecision({ organizationId: 'org-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDecisions', { organizationId: 'org-1' });
    });

    it('should list decisions linked to an entity', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decisions: [] });

      await getDecision({ organizationId: 'org-1', linkedType: 'feature', linkedId: 'feat-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDecisions', {
        organizationId: 'org-1', linkedType: 'feature', linkedId: 'feat-9',
      });
    });
  });
  describe('decisions to make (E-259)', () => {
    it('creates a decision on an epic, sending option labels', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decision: { id: 'dec-1' } });

      await manageDecision({
        action: 'create',
        organizationId: 'org-1',
        epicId: 'epic-1',
        title: 'Who reviews proposals?',
        question: 'Who should review changes to the plan?',
        choices: ['Owner only', { label: 'Owner and editors' }],
        requestedFrom: ['u-2'],
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDecision', expect.objectContaining({
        epicId: 'epic-1',
        choices: ['Owner only', 'Owner and editors'],
        requestedFrom: ['u-2'],
      }));
    });

    it('sends the full option list as {id, label} on update', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decision: { id: 'dec-1' } });

      await manageDecision({ action: 'update', decisionId: 'dec-1', choices: [{ id: 'c1', label: 'A' }, 'New'] });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDecision', {
        decisionId: 'dec-1',
        choices: [{ id: 'c1', label: 'A' }, { label: 'New' }],
      });
    });

    it('adds a pick', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ input: { id: 'in-1' } });

      await manageDecision({ action: 'add_input', decisionId: 'dec-1', choiceId: 'c2', reason: 'fast' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpAddDecisionInput', {
        decisionId: 'dec-1', choiceId: 'c2', reason: 'fast',
      });
    });

    it('decides', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decision: { id: 'dec-1', status: 'accepted' } });

      await manageDecision({
        action: 'decide', decisionId: 'dec-1', choiceId: 'c2', rejectedReasons: { c1: 'stalls' },
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDecideDecision', {
        decisionId: 'dec-1', status: undefined, choiceId: 'c2', decision: undefined, rejectedReasons: { c1: 'stalls' },
      });
    });

    it('holds and releases a task', async () => {
      mockCallEzmodoAPI.mockResolvedValue({ success: true });

      await manageDecision({ action: 'hold_task', decisionId: 'dec-1', taskId: 't-1' });
      await manageDecision({ action: 'release_task', decisionId: 'dec-1', taskId: 't-1' });

      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpHoldTaskForDecision', { decisionId: 'dec-1', taskId: 't-1' });
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpReleaseTaskFromDecision', { decisionId: 'dec-1', taskId: 't-1' });
    });

    it('lists the decisions on an epic', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ decisions: [] });

      await getDecision({ epicId: 'epic-1', status: 'proposed' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDecisions', { epicId: 'epic-1', status: 'proposed' });
    });
  });
});
