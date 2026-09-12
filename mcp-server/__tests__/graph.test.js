import { jest } from '@jest/globals';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { getGraph } = await import('../handlers/graph.js');

describe('get_graph', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('forwards required params to mcpTraverseGraph', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ result: { nodes: [], edges: [] } });

    await getGraph({ projectId: 'proj-1', rootType: 'feature', rootId: 'feat-9' });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpTraverseGraph', {
      projectId: 'proj-1',
      rootType: 'feature',
      rootId: 'feat-9',
    });
  });

  it('includes optional bounds only when provided', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ result: { nodes: [], edges: [] } });

    await getGraph({
      projectId: 'proj-1',
      rootType: 'epic',
      rootId: 'epic-3',
      scope: 'project',
      depth: 3,
      maxNodes: 50,
    });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpTraverseGraph', {
      projectId: 'proj-1',
      rootType: 'epic',
      rootId: 'epic-3',
      scope: 'project',
      depth: 3,
      maxNodes: 50,
    });
  });

  it('omits undefined optional bounds (no scope/depth/maxNodes keys)', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ result: { nodes: [], edges: [] } });

    await getGraph({ projectId: 'proj-1', rootType: 'task', rootId: 't-1' });

    const [, params] = mockCallZephlyAPI.mock.calls[0];
    expect(params).not.toHaveProperty('scope');
    expect(params).not.toHaveProperty('depth');
    expect(params).not.toHaveProperty('maxNodes');
  });

  it('forwards depth=0 as an explicit value (falsy but defined)', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ result: { nodes: [], edges: [] } });

    await getGraph({ projectId: 'proj-1', rootType: 'task', rootId: 't-1', depth: 0 });

    const [, params] = mockCallZephlyAPI.mock.calls[0];
    expect(params.depth).toBe(0);
  });

  it('returns the API response verbatim', async () => {
    const payload = { result: { rootType: 'feature', rootId: 'f1', nodes: [{ id: 'f1' }], edges: [] } };
    mockCallZephlyAPI.mockResolvedValueOnce(payload);

    const result = await getGraph({ projectId: 'proj-1', rootType: 'feature', rootId: 'f1' });

    expect(result).toEqual(payload);
  });
});

describe('get_graph tool definition', () => {
  it('is registered with the required schema', async () => {
    const { GRAPH_TOOLS } = await import('../tools/graph.js');
    const tool = GRAPH_TOOLS.find((t) => t.name === 'get_graph');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toEqual(['projectId', 'rootType', 'rootId']);
    expect(tool.inputSchema.properties.rootType.enum).toContain('feature');
    expect(tool.inputSchema.properties.scope.enum).toEqual(['org', 'project']);
  });
});
