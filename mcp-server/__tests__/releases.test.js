import { jest } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { getReleaseReadiness, manageRelease } = await import('../handlers/releases.js');
const { manageMilestone } = await import('../handlers/milestones.js');
const { manageTestSuite } = await import('../handlers/testing.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { TOOLS } = await import('../tools/index.js');

describe('Release Readiness tools (E-262)', () => {
  afterEach(() => jest.clearAllMocks());

  it('registers get_release_readiness and manage_release', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('get_release_readiness');
    expect(names).toContain('manage_release');
  });

  it('every endpoint the release handlers call is mapped', () => {
    const used = [
      'mcpReleaseGateTypes', 'mcpMilestoneRelease', 'mcpCreateReleaseCandidate', 'mcpAddReleaseChecklistItem',
      'mcpApplyReleaseChecklist', 'mcpUpdateReleaseChecklistItem', 'mcpReleaseChecklistItemToTask',
      'mcpCreateReleaseGate', 'mcpAddRecommendedReleaseGates', 'mcpUpdateReleaseGate', 'mcpDeleteReleaseGate',
      'mcpSaveReleaseTemplate', 'mcpCreateReleaseWaiver', 'mcpRevokeReleaseWaiver', 'mcpReportReleaseCheck',
      'mcpReportReleaseDeployment', 'mcpUpdateReleaseCandidate', 'mcpReleaseReadiness', 'mcpPromoteReleaseCandidate',
      'mcpSignOffReleaseCandidate', 'mcpReleaseMilestone', 'mcpStartSuiteRun', 'mcpRecordSuiteRunResult',
      'mcpUpdateSuiteRunStatus', 'mcpListReleaseGates', 'mcpListReleaseTemplates', 'mcpGetReleaseSettings',
      'mcpSaveReleaseSettings',
    ];
    expect(used.filter((e) => !ENDPOINT_MAP[e])).toEqual([]);
  });

  describe('get_release_readiness', () => {
    it('one candidate in one environment', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ verdict: 'no_go' });
      const r = await getReleaseReadiness({ candidateId: 'c1', environment: 'prod' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReleaseReadiness', { id: 'c1', environment: 'prod' });
      expect(r.verdict).toBe('no_go');
    });

    it('the matrix when no environment is given', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ environments: [] });
      await getReleaseReadiness({ candidateId: 'c1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReleaseReadiness', { id: 'c1' });
    });

    it('the milestone overview, and gate types', async () => {
      mockCallEzmodoAPI.mockResolvedValue({});
      await getReleaseReadiness({ milestoneId: 'm1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpMilestoneRelease', { milestoneId: 'm1' });
      await getReleaseReadiness({ listGateTypes: true });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReleaseGateTypes', {});
    });

    it('says what it needs when given nothing', async () => {
      await expect(getReleaseReadiness({})).rejects.toThrow(/candidateId/);
    });
  });

  describe('manage_release', () => {
    it('create_candidate sends only what was given', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'c1' });
      await manageRelease({ action: 'create_candidate', milestoneId: 'm1', versionLabel: '1.4.0-rc.1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateReleaseCandidate', { milestoneId: 'm1', versionLabel: '1.4.0-rc.1' });
    });

    it('promote goes through the API as source api', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageRelease({ action: 'promote', candidateId: 'c1', environment: 'staging' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpPromoteReleaseCandidate', { id: 'c1', environment: 'staging', source: 'api' });
    });

    it('a refused promote surfaces the API error untouched', async () => {
      const err = Object.assign(new Error('1.4.0-rc.1 cannot go to production: 1 required gate(s) not met'), { status: 409, code: 'release_blocked' });
      mockCallEzmodoAPI.mockRejectedValueOnce(err);
      await expect(manageRelease({ action: 'promote', candidateId: 'c1', environment: 'production' })).rejects.toMatchObject({ code: 'release_blocked' });
    });

    it('waive needs a reason', async () => {
      await expect(manageRelease({ action: 'waive', candidateId: 'c1', environment: 'prod', targetType: 'gate', targetId: 'g1' }))
        .rejects.toThrow(/reason/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('waive with feature-flag evidence', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ valid: true });
      await manageRelease({
        action: 'waive', candidateId: 'c1', environment: 'prod', targetType: 'epic', targetId: 'e1',
        reason: 'ships dark', evidenceType: 'feature_flag', evidence: { flagKey: 'search.v2' },
      });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateReleaseWaiver', {
        candidateId: 'c1', environment: 'prod', targetType: 'epic', targetId: 'e1', reason: 'ships dark',
        evidenceType: 'feature_flag', evidence: { flagKey: 'search.v2' },
      });
    });

    it('set_item_state maps note to stateNote', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageRelease({ action: 'set_item_state', itemId: 'i1', state: 'waived', note: 'no support team yet' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateReleaseChecklistItem', { id: 'i1', state: 'waived', stateNote: 'no support team yet' });
    });

    it('report_check defaults the source to mcp but keeps an explicit one', async () => {
      mockCallEzmodoAPI.mockResolvedValue({});
      await manageRelease({ action: 'report_check', projectId: 'p1', name: 'build', status: 'success', candidate: '1.4.0-rc.1' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpReportReleaseCheck', {
        source: 'mcp', projectId: 'p1', name: 'build', status: 'success', candidate: '1.4.0-rc.1',
      });
      await manageRelease({ action: 'report_deployment', projectId: 'p1', environment: 'stg', status: 'success', commitSha: 'abc', source: 'gitlab' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpReportReleaseDeployment', {
        source: 'gitlab', projectId: 'p1', environment: 'stg', status: 'success', commitSha: 'abc',
      });
    });

    it('reads the release process back: gates, templates, settings (#2915)', async () => {
      mockCallEzmodoAPI.mockResolvedValue({});
      await manageRelease({ action: 'list_gates', projectId: 'p1', environment: 'production' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpListReleaseGates', { projectId: 'p1', environment: 'production' });
      await manageRelease({ action: 'list_templates', projectId: 'p1' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpListReleaseTemplates', { projectId: 'p1' });
      await manageRelease({ action: 'get_settings', projectId: 'p1' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetReleaseSettings', { projectId: 'p1' });
      await manageRelease({ action: 'save_settings', projectId: 'p1', completeTasksOn: 'milestone_released' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSaveReleaseSettings', { projectId: 'p1', completeTasksOn: 'milestone_released' });
    });

    it('save_settings needs completeTasksOn', async () => {
      await expect(manageRelease({ action: 'save_settings', projectId: 'p1' })).rejects.toThrow(/completeTasksOn/);
    });

    it('rejects an unknown action', async () => {
      await expect(manageRelease({ action: 'ship_it' })).rejects.toThrow(/Unknown action/);
    });
  });

  describe('manage_milestone release / freeze', () => {
    it('release passes the candidate and deferred confirmation', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({});
      await manageMilestone({ action: 'release', projectId: 'p1', milestoneId: 'm1', environment: 'production', candidateId: '1.4.0-rc.2', confirmDeferred: true });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReleaseMilestone', {
        projectId: 'p1', milestoneId: 'm1', environment: 'production', candidateId: '1.4.0-rc.2', confirmDeferred: true,
      });
    });

    it('freeze needs a type; unfreeze clears it', async () => {
      await expect(manageMilestone({ action: 'freeze', projectId: 'p1', milestoneId: 'm1' })).rejects.toThrow(/freezeType/);
      mockCallEzmodoAPI.mockResolvedValue({});
      await manageMilestone({ action: 'freeze', projectId: 'p1', milestoneId: 'm1', freezeType: 'stabilization', reason: 'RC week' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpUpdateMilestone', {
        projectId: 'p1', milestoneId: 'm1', freezeConfig: { enabled: true, freezeType: 'stabilization', reason: 'RC week' },
      });
      await manageMilestone({ action: 'unfreeze', projectId: 'p1', milestoneId: 'm1' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpUpdateMilestone', {
        projectId: 'p1', milestoneId: 'm1', freezeConfig: { enabled: false, freezeType: '' },
      });
    });
  });

  describe('manage_test_suite runs', () => {
    it('start_run → record_result → complete_run', async () => {
      mockCallEzmodoAPI.mockResolvedValue({ runId: 'r1' });
      await manageTestSuite({ action: 'start_run', projectId: 'p1', suiteId: 's1', environment: 'staging', releaseCandidateId: 'c1' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpStartSuiteRun', { projectId: 'p1', suiteId: 's1', environment: 'staging', releaseCandidateId: 'c1' });
      await manageTestSuite({ action: 'record_result', projectId: 'p1', suiteId: 's1', runId: 'r1', caseId: 'tc1', overallStatus: 'pass' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpRecordSuiteRunResult', { projectId: 'p1', suiteId: 's1', runId: 'r1', caseId: 'tc1', overallStatus: 'pass' });
      await manageTestSuite({ action: 'complete_run', projectId: 'p1', suiteId: 's1', runId: 'r1' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpUpdateSuiteRunStatus', { projectId: 'p1', suiteId: 's1', runId: 'r1', status: 'completed' });
    });

    it('record_result says what is missing', async () => {
      await expect(manageTestSuite({ action: 'record_result', projectId: 'p1', suiteId: 's1' })).rejects.toThrow(/runId, caseId, overallStatus/);
    });
  });
});
