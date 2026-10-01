import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { listTestCases } = await import('../handlers/testing.js');
const { TESTING_TOOLS } = await import('../tools/testing.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

beforeEach(() => mockCallEzmodoAPI.mockReset().mockResolvedValue({ success: true }));

describe('list_test_cases fixPrompt (E-278 #3065)', () => {
  it('asks for the newest failed run with no narrowing', async () => {
    await listTestCases({ projectId: 'p1', testCaseId: 'c1', fixPrompt: true });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetFixPrompt', { projectId: 'p1', caseId: 'c1' });
  });

  it('passes runId, testRunId and environment through', async () => {
    await listTestCases({
      projectId: 'p1', testCaseId: 'c1', fixPrompt: true, runId: 'r1', testRunId: 'tr1', environment: 'staging',
    });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetFixPrompt', {
      projectId: 'p1', caseId: 'c1', runId: 'r1', testRunId: 'tr1', environment: 'staging',
    });
  });

  it('wins over runHistory and leaves the plain lookup alone', async () => {
    await listTestCases({ projectId: 'p1', testCaseId: 'c1', fixPrompt: true, runHistory: true });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetFixPrompt', { projectId: 'p1', caseId: 'c1' });
    await listTestCases({ projectId: 'p1', testCaseId: 'c1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetTestCase', { projectId: 'p1', caseId: 'c1' });
  });

  it('declares the params and maps the endpoint', () => {
    const props = TESTING_TOOLS.find((t) => t.name === 'list_test_cases').inputSchema.properties;
    expect(props.fixPrompt.type).toBe('boolean');
    for (const k of ['runId', 'testRunId', 'environment']) {
      expect(props[k].type).toBe('string');
    }
    expect(ENDPOINT_MAP.mcpGetFixPrompt).toEqual({ route: 'mcp/v1/testing/case/fix-prompt', method: 'GET' });
  });
});
