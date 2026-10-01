import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageTestSuite, importTestResults, MAX_RESULTS_FILE_BYTES } = await import('../handlers/testing.js');
const { TESTING_TOOLS } = await import('../tools/testing.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

beforeEach(() => mockCallEzmodoAPI.mockReset().mockResolvedValue({ success: true }));

describe('manage_test_suite import_results (E-278 #3043)', () => {
  it('sends inline content with the build fields', async () => {
    await manageTestSuite({
      action: 'import_results', projectId: 'p1', content: '<testsuite/>', suite: 'smoke',
      environment: 'development', commitSha: 'abc1234', format: 'junit',
    });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpImportTestResults', {
      projectId: 'p1', content: '<testsuite/>', suite: 'smoke', environment: 'development',
      commitSha: 'abc1234', format: 'junit',
    });
  });

  it('reads filePath locally and sends it base64 with its name', async () => {
    const readFile = jest.fn().mockResolvedValue(Buffer.from('<testsuites/>'));
    const stat = jest.fn().mockResolvedValue({ size: 13 });
    await importTestResults({ projectId: 'p1', filePath: '/tmp/out/junit.xml', suiteId: 's1' }, readFile, stat);
    expect(readFile).toHaveBeenCalledWith('/tmp/out/junit.xml');
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpImportTestResults', {
      projectId: 'p1', contentBase64: Buffer.from('<testsuites/>').toString('base64'), suite: 's1', fileName: 'junit.xml',
    });
  });

  it('refuses a file over the limit without reading it', async () => {
    const readFile = jest.fn();
    const stat = jest.fn().mockResolvedValue({ size: MAX_RESULTS_FILE_BYTES + 1 });
    await expect(importTestResults({ projectId: 'p1', filePath: '/big.xml' }, readFile, stat)).rejects.toThrow('limit');
    expect(readFile).not.toHaveBeenCalled();
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('needs a file', async () => {
    await expect(importTestResults({ projectId: 'p1' })).rejects.toThrow('filePath or content');
  });

  it('declares the action, its params and the endpoint', () => {
    const suiteTool = TESTING_TOOLS.find((t) => t.name === 'manage_test_suite');
    expect(suiteTool.inputSchema.properties.action.enum).toContain('import_results');
    expect(suiteTool.inputSchema.properties.filePath.type).toBe('string');
    expect(suiteTool.inputSchema.properties.format.enum).toEqual(['junit', 'xunit', 'json']);
    const caseTool = TESTING_TOOLS.find((t) => t.name === 'manage_test_case');
    expect(caseTool.inputSchema.properties.externalKey.type).toBe('string');
    const listTool = TESTING_TOOLS.find((t) => t.name === 'list_test_suites');
    expect(listTool.inputSchema.properties.trigger.enum).toContain('ci');
    expect(ENDPOINT_MAP.mcpImportTestResults).toEqual({ route: 'mcp/v1/testing/results', method: 'POST' });
  });
});

describe('manage_test_suite map_unmatched (E-278 #3057)', () => {
  it('maps a key to a case through the mapping endpoint', async () => {
    const { manageTestSuite } = await import('../handlers/testing.js');
    const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
    await manageTestSuite({ action: 'map_unmatched', projectId: 'p1', key: 'billing.TestPlanLimits', caseId: 'c1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpMapUnmatchedResult', {
      projectId: 'p1', key: 'billing.TestPlanLimits', caseId: 'c1',
    });
    expect(ENDPOINT_MAP.mcpMapUnmatchedResult).toEqual({ route: 'mcp/v1/testing/results/unmatched/map', method: 'POST' });
  });

  it('refuses without key and caseId', async () => {
    const { manageTestSuite } = await import('../handlers/testing.js');
    await expect(manageTestSuite({ action: 'map_unmatched', projectId: 'p1', key: 'x' })).rejects.toThrow(/key and caseId/);
  });
});
