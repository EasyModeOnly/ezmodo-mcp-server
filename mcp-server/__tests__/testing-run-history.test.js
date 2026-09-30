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
