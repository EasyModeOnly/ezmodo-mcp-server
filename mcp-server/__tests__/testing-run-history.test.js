import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { listTestCases } = await import('../handlers/testing.js');
const { TESTING_TOOLS } = await import('../tools/testing.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

beforeEach(() => mockCallEzmodoAPI.mockReset().mockResolvedValue({ success: true }));

describe('list_test_cases runHistory', () => {
  it('routes to the case run-history endpoint with paging', async () => {
    await listTestCases({ projectId: 'p1', testCaseId: 'c1', runHistory: true, limit: 5, before: 'cur' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListTestCaseRuns', {
      projectId: 'p1', caseId: 'c1', limit: 5, before: 'cur',
    });
  });

  it('still returns the single case without runHistory', async () => {
    await listTestCases({ projectId: 'p1', testCaseId: 'c1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetTestCase', { projectId: 'p1', caseId: 'c1' });
  });

  it('declares the params and maps the endpoint', () => {
    const tool = TESTING_TOOLS.find((t) => t.name === 'list_test_cases');
    expect(tool.inputSchema.properties.runHistory.type).toBe('boolean');
    expect(tool.inputSchema.properties.before.type).toBe('string');
    expect(ENDPOINT_MAP.mcpListTestCaseRuns).toEqual({ route: 'mcp/v1/testing/case/runs', method: 'GET' });
  });
});

describe('list_test_cases countBy', () => {
  it('asks for group counts with the same filters', async () => {
    await listTestCases({ projectId: 'p1', countBy: 'suite', status: 'fail' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGroupTestCases', { projectId: 'p1', status: 'fail', by: 'suite' });
    expect(ENDPOINT_MAP.mcpGroupTestCases).toEqual({ route: 'mcp/v1/testing/cases/groups', method: 'GET' });
  });
});

describe('manage_test_case bulk', () => {
  it('sends the bulk request to the bulk endpoint', async () => {
    const { manageTestCase } = await import('../handlers/testing.js');
    await manageTestCase({
      action: 'bulk', projectId: 'p1', bulkAction: 'set_lifecycle', lifecycleStatus: 'deprecated',
      filter: { statuses: ['not_run'] }, dryRun: true,
    });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpBulkTestCases', expect.objectContaining({
      projectId: 'p1', action: 'set_lifecycle', lifecycleStatus: 'deprecated', filter: { statuses: ['not_run'] }, dryRun: true,
    }));
    expect(ENDPOINT_MAP.mcpBulkTestCases).toEqual({ route: 'mcp/v1/testing/cases/bulk', method: 'POST' });
  });

  it('offers only canonical categories', () => {
    const tool = TESTING_TOOLS.find((t) => t.name === 'manage_test_case');
    expect(tool.inputSchema.properties.category.enum).toContain('edge_case');
    expect(tool.inputSchema.properties.category.enum).not.toContain('edge-case');
  });
});

describe('project-level runs (E-278 #3032)', () => {
  it('start_run with one suiteId goes to the project runs endpoint as suiteIds', async () => {
    const { manageTestSuite } = await import('../handlers/testing.js');
    await manageTestSuite({ action: 'start_run', projectId: 'p1', suiteId: 's1', environment: 'staging' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpStartProjectRun', {
      projectId: 'p1', suiteIds: ['s1'], environment: 'staging',
    });
    expect(ENDPOINT_MAP.mcpStartProjectRun).toEqual({ route: 'mcp/v1/testing/runs', method: 'POST' });
  });

  it('start_run sends a plan run with its title and assignments', async () => {
    const { manageTestSuite } = await import('../handlers/testing.js');
    const assignments = [{ assigneeId: 'claude', suiteId: 's2' }];
    await manageTestSuite({
      action: 'start_run', projectId: 'p1', suiteIds: ['s1', 's2'], runTitle: 'v0.22 regression',
      assignments, releaseCandidateId: 'rc-1',
    });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpStartProjectRun', {
      projectId: 'p1', suiteIds: ['s1', 's2'], title: 'v0.22 regression', assignments, releaseCandidateId: 'rc-1',
    });
  });

  it('start_run sends an ad-hoc run from a filter', async () => {
    const { manageTestSuite } = await import('../handlers/testing.js');
    await manageTestSuite({ action: 'start_run', projectId: 'p1', filter: { statuses: ['not_run'] } });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpStartProjectRun', {
      projectId: 'p1', filter: { statuses: ['not_run'] },
    });
  });

  it('start_run without a source is refused before any call', async () => {
    const { manageTestSuite } = await import('../handlers/testing.js');
    await expect(manageTestSuite({ action: 'start_run', projectId: 'p1' })).rejects.toThrow(/suiteId, suiteIds, caseIds or filter/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('record_result and complete_run no longer need suiteId', async () => {
    const { manageTestSuite } = await import('../handlers/testing.js');
    await manageTestSuite({ action: 'record_result', projectId: 'p1', runId: 'r1', caseId: 'c1', overallStatus: 'pass' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpRecordSuiteRunResult', {
      projectId: 'p1', runId: 'r1', caseId: 'c1', overallStatus: 'pass',
    });
    await manageTestSuite({ action: 'complete_run', projectId: 'p1', runId: 'r1', skipRemaining: true });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateSuiteRunStatus', {
      projectId: 'p1', runId: 'r1', status: 'completed', skipRemaining: true,
    });
  });

  it('list_test_suites runs:true lists runs with filters, or gets one', async () => {
    const { listTestSuites } = await import('../handlers/testing.js');
    await listTestSuites({ projectId: 'p1', runs: true, runStatus: 'active', assigneeId: 'u1', limit: 10 });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListTestRuns', {
      projectId: 'p1', status: 'active', assigneeId: 'u1', limit: 10,
    });
    await listTestSuites({ projectId: 'p1', runs: true, runId: 'r1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetTestRun', { projectId: 'p1', runId: 'r1' });
    expect(ENDPOINT_MAP.mcpListTestRuns).toEqual({ route: 'mcp/v1/testing/runs', method: 'GET' });
    expect(ENDPOINT_MAP.mcpGetTestRun).toEqual({ route: 'mcp/v1/testing/runs/by-id', method: 'GET' });
  });

  it('declares the new params', () => {
    const manage = TESTING_TOOLS.find((t) => t.name === 'manage_test_suite');
    for (const k of ['suiteIds', 'caseIds', 'filter', 'runTitle', 'assignments', 'environmentId']) {
      expect(manage.inputSchema.properties[k]).toBeDefined();
    }
    const list = TESTING_TOOLS.find((t) => t.name === 'list_test_suites');
    expect(list.inputSchema.properties.runs.type).toBe('boolean');
    expect(list.inputSchema.properties.runStatus.type).toBe('string');
  });
});
