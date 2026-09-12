import { jest } from '@jest/globals';

const mockCallZephlyAPI = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { applyLinks, attachLinks } = await import('../lib/links-at-create.js');

const LINKS = [
  { targetType: 'feature', targetId: 'feat-1' },
  { targetType: 'goal', targetId: 'goal-1', linkType: 'relates_to' },
];

function singleCalls() {
  return mockCallZephlyAPI.mock.calls.filter((c) => c[0] === 'mcpAddLink');
}

describe('applyLinks', () => {
  afterEach(() => jest.clearAllMocks());

  // One request per link, and no attempt at a batch route: the endpoint map
  // used to advertise `mcp/v1/links/batch`, which the Go API never implemented,
  // so every create-with-links paid a 404 before doing exactly this.
  it('applies each link with its own mcpAddLink call', async () => {
    mockCallZephlyAPI.mockResolvedValue({ success: true });

    const result = await applyLinks({
      sourceType: 'task',
      sourceId: 'task-1',
      links: LINKS,
    });

    expect(mockCallZephlyAPI.mock.calls.map((c) => c[0])).toEqual(['mcpAddLink', 'mcpAddLink']);
    expect(singleCalls()[0][1]).toEqual({
      sourceType: 'task',
      sourceId: 'task-1',
      targetType: 'feature',
      targetId: 'feat-1',
      linkType: 'relates_to',
    });
    expect(result.applied).toHaveLength(2);
    expect(result.failed).toEqual([]);
  });

  it('defaults linkType to relates_to but honours an explicit one', async () => {
    mockCallZephlyAPI.mockResolvedValue({ success: true });

    await applyLinks({
      sourceType: 'task',
      sourceId: 'task-1',
      links: [{ targetType: 'task', targetId: 'task-2', linkType: 'blocked_by' }],
    });

    expect(singleCalls()[0][1].linkType).toBe('blocked_by');
  });

  it('is a no-op with no links, no source id, or malformed entries', async () => {
    expect(await applyLinks({ sourceType: 'task', sourceId: 't1', links: [] }))
      .toEqual({ applied: [], failed: [] });
    expect(await applyLinks({ sourceType: 'task', sourceId: undefined, links: LINKS }))
      .toEqual({ applied: [], failed: [] });
    expect(await applyLinks({ sourceType: 'task', sourceId: 't1', links: [{ targetId: 'x' }] }))
      .toEqual({ applied: [], failed: [] });
    expect(mockCallZephlyAPI).not.toHaveBeenCalled();
  });

  it('records one failed link in `failed` without throwing', async () => {
    mockCallZephlyAPI.mockImplementation(async (_endpoint, params) => {
      if (params.targetId === 'goal-1') throw new Error('Target not found');
      return { success: true };
    });

    const result = await applyLinks({ sourceType: 'task', sourceId: 't1', links: LINKS });

    expect(result.applied).toEqual([
      { targetType: 'feature', targetId: 'feat-1', linkType: 'relates_to' },
    ]);
    expect(result.failed).toEqual([
      {
        targetType: 'goal',
        targetId: 'goal-1',
        linkType: 'relates_to',
        error: 'Target not found',
      },
    ]);
  });

  // The entity is the user's work; the links are metadata. Losing every link
  // must still return normally so the create result reaches the caller.
  it('never throws when every link is rejected', async () => {
    mockCallZephlyAPI.mockRejectedValue(new Error('Forbidden'));

    const result = await applyLinks({ sourceType: 'task', sourceId: 't1', links: LINKS });

    expect(result.applied).toEqual([]);
    expect(result.failed).toHaveLength(2);
    expect(result.failed[0].error).toBe('Forbidden');
  });
});

describe('attachLinks', () => {
  afterEach(() => jest.clearAllMocks());

  it('stamps the outcome onto the create result', async () => {
    mockCallZephlyAPI.mockResolvedValue({ success: true });

    const result = { taskId: 't1' };
    await attachLinks(result, { sourceType: 'task', sourceId: 't1', links: LINKS });

    expect(result.links.applied).toHaveLength(2);
    expect(result.links.failed).toEqual([]);
  });

  it('adds no `links` property when there is nothing to link', async () => {
    const result = { taskId: 't1' };
    await attachLinks(result, { sourceType: 'task', sourceId: 't1', links: undefined });
    expect(result).not.toHaveProperty('links');
    expect(mockCallZephlyAPI).not.toHaveBeenCalled();
  });

  it('adds no `links` property when the entity id could not be resolved', async () => {
    const result = {};
    await attachLinks(result, { sourceType: 'task', sourceId: undefined, links: LINKS });
    expect(result).not.toHaveProperty('links');
    expect(mockCallZephlyAPI).not.toHaveBeenCalled();
  });
});
