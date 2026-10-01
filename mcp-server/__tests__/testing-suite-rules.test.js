import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageTestSuite, listTestSuites } = await import('../handlers/testing.js');
const { TESTING_TOOLS } = await import('../tools/testing.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

beforeEach(() => mockCallEzmodoAPI.mockReset().mockResolvedValue({ success: true }));

describe('suite rules, order and matrix over MCP (E-278 #3060)', () => {
  it('create and update pass the membership rule and gating through', async () => {
    const rule = { priorities: ['critical'], categories: ['security'] };
    await manageTestSuite({ action: 'create', projectId: 'p1', title: 'Critical security', membershipRule: rule });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpCreateTestSuite', expect.objectContaining({
      projectId: 'p1', title: 'Critical security', membershipRule: rule,
    }));
    await manageTestSuite({
      action: 'update', projectId: 'p1', suiteId: 's1', membershipRule: {}, milestoneId: 'm1', milestonePriority: 'high',
    });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpUpdateTestSuite', expect.objectContaining({
      suiteId: 's1', membershipRule: {}, milestoneId: 'm1', milestonePriority: 'high',
    }));
  });

  it('preview_rule sends the rule, suite and limit', async () => {
    await manageTestSuite({ action: 'preview_rule', projectId: 'p1', suiteId: 's1', rule: { retentions: ['transient'] }, previewLimit: 5 });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpPreviewSuiteRule', {
      projectId: 'p1', suiteId: 's1', rule: { retentions: ['transient'] }, limit: 5,
    });
    await expect(manageTestSuite({ action: 'preview_rule', projectId: 'p1' })).rejects.toThrow(/needs rule/);
  });

  it('reorder_cases sends only order fields', async () => {
    await manageTestSuite({
      action: 'reorder_cases', projectId: 'p1', suiteId: 's1',
      cases: [{ caseId: 'c2', position: 0, section: 'Checkout', taskId: 'ignored' }, { caseId: 'c1', position: 1 }],
    });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpReorderSuiteCases', {
      projectId: 'p1', suiteId: 's1',
      cases: [{ caseId: 'c2', position: 0, section: 'Checkout' }, { caseId: 'c1', position: 1 }],
    });
    await expect(manageTestSuite({ action: 'reorder_cases', projectId: 'p1', suiteId: 's1', cases: [] })).rejects.toThrow(/needs cases/);
  });

  it('list_test_suites returns a suite\'s case order or matrix', async () => {
    await listTestSuites({ projectId: 'p1', testSuiteId: 's1', caseOrder: true });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetSuiteCaseOrder', { projectId: 'p1', suiteId: 's1' });
    await listTestSuites({ projectId: 'p1', testSuiteId: 's1', matrix: true, matrixRuns: 5 });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetSuiteMatrix', { projectId: 'p1', suiteId: 's1', runs: 5 });
    await listTestSuites({ projectId: 'p1', testSuiteId: 's1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetTestSuite', { projectId: 'p1', suiteId: 's1' });
  });

  it('declares the params and maps the endpoints', () => {
    const manage = TESTING_TOOLS.find((t) => t.name === 'manage_test_suite').inputSchema.properties;
    expect(manage.action.enum).toEqual(expect.arrayContaining(['preview_rule', 'reorder_cases']));
    for (const k of ['membershipRule', 'rule', 'previewLimit', 'milestoneId', 'milestonePriority']) {
      expect(manage[k]).toBeDefined();
    }
    expect(manage.cases.items.properties.position.type).toBe('number');
    const list = TESTING_TOOLS.find((t) => t.name === 'list_test_suites').inputSchema.properties;
    expect(list.caseOrder.type).toBe('boolean');
    expect(list.matrix.type).toBe('boolean');
    expect(ENDPOINT_MAP.mcpPreviewSuiteRule).toEqual({ route: 'mcp/v1/testing/suites/rule-preview', method: 'POST' });
    expect(ENDPOINT_MAP.mcpGetSuiteCaseOrder).toEqual({ route: 'mcp/v1/testing/suites/cases/order', method: 'GET' });
    expect(ENDPOINT_MAP.mcpReorderSuiteCases).toEqual({ route: 'mcp/v1/testing/suites/cases/order', method: 'PUT' });
    expect(ENDPOINT_MAP.mcpGetSuiteMatrix).toEqual({ route: 'mcp/v1/testing/suites/matrix', method: 'GET' });
  });
});
