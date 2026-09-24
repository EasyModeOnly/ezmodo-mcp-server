import { jest } from '@jest/globals';

const mockCall = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCall }));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { listAgentSuggestions, resolveLinkSuggestions } = await import('../handlers/agents.js');

beforeEach(() => mockCall.mockReset());

describe('list_agent_suggestions filters', () => {
  // The queue is shared with every other agent, so without action=link a
  // links-focused review pages through merge/archive/status_change findings.
  it('forwards every filter', async () => {
    mockCall.mockResolvedValue({ suggestions: [] });
    await listAgentSuggestions({
      limit: 25, entityType: 'task', entityId: 't1',
      action: 'link', agentType: 'autolink', minConfidence: 0.8,
    });
    expect(mockCall).toHaveBeenCalledWith('mcpListAgentSuggestions', {
      limit: 25, entityType: 'task', entityId: 't1',
      action: 'link', agentType: 'autolink', minConfidence: 0.8,
    });
  });

  // Absent filters must not become empty-string params, which the API would
  // read as "filter on empty" rather than "no filter".
  it('omits absent filters entirely', async () => {
    mockCall.mockResolvedValue({ suggestions: [] });
    await listAgentSuggestions({});
    expect(mockCall).toHaveBeenCalledWith('mcpListAgentSuggestions', {});
  });

  // 0 is a meaningful floor, distinct from "unset".
  it('forwards minConfidence 0 rather than dropping it', async () => {
    mockCall.mockResolvedValue({ suggestions: [] });
    await listAgentSuggestions({ minConfidence: 0 });
    expect(mockCall.mock.calls[0][1]).toHaveProperty('minConfidence', 0);
  });
});

describe('resolve_link_suggestions', () => {
  it('accepts and rejects in one call, partitioning the outcome', async () => {
    mockCall.mockResolvedValue({ success: true });

    const got = await resolveLinkSuggestions({
      accept: ['s1', 's2'],
      reject: [{ id: 's3', reason: 'wrong component' }],
    });

    expect(got.accepted).toEqual(['s1', 's2']);
    expect(got.rejected).toEqual(['s3']);
    expect(got.failed).toEqual([]);
    expect(got.resolved).toBe(3);

    const accepts = mockCall.mock.calls.filter((c) => c[0] === 'mcpAcceptAgentSuggestion');
    const rejects = mockCall.mock.calls.filter((c) => c[0] === 'mcpRejectAgentSuggestion');
    expect(accepts).toHaveLength(2);
    expect(rejects).toHaveLength(1);
    // A rejection reason is how the linker learns, so it must reach the API.
    expect(rejects[0][1]).toMatchObject({ id: 's3', reviewNote: 'wrong component' });
  });

  // One bad id must not cost the rest of the batch — otherwise a single stale
  // suggestion blocks the agent from clearing anything.
  it('records a per-id failure and keeps going', async () => {
    mockCall.mockImplementation((endpoint, body) => {
      if (body?.id === 's2') return Promise.reject(new Error('already reviewed'));
      return Promise.resolve({ success: true });
    });

    const got = await resolveLinkSuggestions({ accept: ['s1', 's2', 's3'] });

    expect(got.accepted).toEqual(['s1', 's3']);
    expect(got.failed).toHaveLength(1);
    expect(got.failed[0]).toMatchObject({ id: 's2', action: 'accept' });
    expect(got.failed[0].error).toContain('already reviewed');
  });

  it('accepts a bare id string in the reject list', async () => {
    mockCall.mockResolvedValue({ success: true });
    const got = await resolveLinkSuggestions({ reject: ['s9'] });
    expect(got.rejected).toEqual(['s9']);
  });

  it('is a no-op with nothing to resolve', async () => {
    const got = await resolveLinkSuggestions({});
    expect(got).toMatchObject({ accepted: [], rejected: [], failed: [], resolved: 0 });
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('skips empty ids rather than calling with an undefined id', async () => {
    mockCall.mockResolvedValue({ success: true });
    await resolveLinkSuggestions({ accept: ['', null], reject: [{ reason: 'no id' }] });
    expect(mockCall).not.toHaveBeenCalled();
  });
});
