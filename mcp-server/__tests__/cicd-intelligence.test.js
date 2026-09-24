import { jest } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { getAiInsights } = await import('../handlers/ai-intelligence.js');
const { managePullRequest } = await import('../handlers/github.js');
const { AI_INTELLIGENCE_TOOLS } = await import('../tools/ai-intelligence.js');
const { GITHUB_TOOLS } = await import('../tools/github.js');

describe('CI/CD intelligence (E-32 #218)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get_ai_insights routing', () => {
    it('routes build_failure to the build-failure endpoint', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ analysis: { verdict: 'failing' } });

      const result = await getAiInsights({
        type: 'build_failure', projectId: 'proj-1', headSha: 'abc123',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpAnalyzeBuildFailure', {
        projectId: 'proj-1', headSha: 'abc123',
      });
      expect(result.analysis.verdict).toBe('failing');
    });

    it('routes deployment_risk to the deployment-risk endpoint', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ risk: { level: 'high' } });

      await getAiInsights({
        type: 'deployment_risk', projectId: 'proj-1', environment: 'production', sha: 'abc123',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpPredictDeploymentRisk', {
        projectId: 'proj-1', environment: 'production', sha: 'abc123',
      });
    });

    it('leaves the existing insight types alone', async () => {
      mockCallEzmodoAPI.mockResolvedValue({});

      await getAiInsights({ type: 'project_insights', projectId: 'p' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetProjectInsights', { projectId: 'p' });

      await getAiInsights({ type: 'suggest_next', projectId: 'p' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSuggestNextActions', { projectId: 'p' });

      await getAiInsights({ type: 'dependency_graph', projectId: 'p' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpAnalyzeDependencyGraph', { projectId: 'p' });
    });

    it('rejects an unknown type rather than silently doing nothing', async () => {
      await expect(getAiInsights({ type: 'build_failures', projectId: 'p' }))
        .rejects.toThrow(/Unknown insight type/);
    });
  });

  describe('manage_pull_request suggest_reviewers', () => {
    it('routes to the suggest-reviewers endpoint', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ suggestions: [] });

      await managePullRequest({
        action: 'suggest_reviewers',
        projectId: 'proj-1',
        repoId: '123:acme/backend',
        changedPaths: ['api/handler.go'],
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSuggestReviewers', {
        projectId: 'proj-1', repoId: '123:acme/backend', changedPaths: ['api/handler.go'],
      });
    });

    // Suggesting and requesting are deliberately separate calls: pinging the
    // wrong three people is a social cost a suggestion tool should not incur.
    it('does not request the review as a side effect', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ suggestions: [{ login: '@alice' }] });

      await managePullRequest({
        action: 'suggest_reviewers', projectId: 'p', repoId: 'r', changedPaths: ['a.go'],
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalledWith('mcpRequestPRReview', expect.anything());
    });
  });

  describe('tool schemas', () => {
    it('advertises the new insight types', () => {
      const insights = AI_INTELLIGENCE_TOOLS.find((t) => t.name === 'get_ai_insights');
      expect(insights.inputSchema.properties.type.enum).toEqual(
        expect.arrayContaining(['build_failure', 'deployment_risk'])
      );
      // The parameters those types need must be declared, or a client cannot
      // discover how to call them.
      expect(insights.inputSchema.properties).toHaveProperty('environment');
      expect(insights.inputSchema.properties).toHaveProperty('headSha');
      expect(insights.inputSchema.properties).toHaveProperty('kind');
    });

    it('advertises suggest_reviewers and its required input', () => {
      const pr = GITHUB_TOOLS.find((t) => t.name === 'manage_pull_request');
      expect(pr.inputSchema.properties.action.enum).toContain('suggest_reviewers');
      expect(pr.inputSchema.properties).toHaveProperty('changedPaths');
      expect(pr.inputSchema.properties).toHaveProperty('excludeLogins');
    });

    // No new top-level tools: these extend the consolidated manage_*/get_*
    // surface rather than adding three more names to learn.
    it('adds no new top-level tools', () => {
      expect(AI_INTELLIGENCE_TOOLS.map((t) => t.name)).toEqual([
        'get_ai_insights', 'estimate_task', 'infer_dependencies',
      ]);
      // The CI/CD work folded into the consolidated action surface: none of it
      // became a tool name of its own. (list_repositories is not from this epic
      // — it exists because repoId was otherwise undiscoverable, E-244.)
      expect(GITHUB_TOOLS.map((t) => t.name).sort()).toEqual(
        ['list_repositories', 'manage_pull_request']
      );
    });
  });
});
