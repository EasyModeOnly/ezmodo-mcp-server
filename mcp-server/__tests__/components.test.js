import { jest } from '@jest/globals';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

// Mock local cache — spy on reads/writes so we can assert the kind-filter guard.
const mockGetCachedComponents = jest.fn().mockResolvedValue(null);
const mockUpdateCacheSections = jest.fn().mockResolvedValue(undefined);
const mockInvalidateCacheSection = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  getCachedComponents: mockGetCachedComponents,
  updateCacheSections: mockUpdateCacheSections,
  invalidateCacheSection: mockInvalidateCacheSection,
}));

const { listComponents, manageComponent } = await import('../handlers/components.js');

describe('listComponents caching + kind filter (E-168)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockGetCachedComponents.mockResolvedValue(null);
  });

  it('forwards a kind filter to the API', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ components: [{ id: 'c1', name: 'api' }] });

    await listComponents({ projectId: 'proj-1', kind: 'area' });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListComponents', { projectId: 'proj-1', kind: 'area' });
  });

  it('caches the FULL inventory when no kind filter is set', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({
      components: [
        { id: 'c1', name: 'api', description: 'Go API' },
        { id: 'c2', name: 'LoginScreen', description: '', kind: 'screen' },
      ],
    });

    await listComponents({ projectId: 'proj-1' });

    expect(mockUpdateCacheSections).toHaveBeenCalledWith({
      components: [
        { id: 'c1', name: 'api', description: 'Go API' },
        { id: 'c2', name: 'LoginScreen', description: '' },
      ],
    });
  });

  it('does NOT overwrite the cache with a kind-filtered subset', async () => {
    // A kind='area' call (e.g. from the project-context path) must not clobber
    // the full-inventory cache, or an unfiltered list would read back a subset.
    mockCallZephlyAPI.mockResolvedValueOnce({ components: [{ id: 'c1', name: 'api' }] });

    await listComponents({ projectId: 'proj-1', kind: 'area' });

    expect(mockUpdateCacheSections).not.toHaveBeenCalled();
  });

  it('reads the cache only for an unfiltered list', async () => {
    mockGetCachedComponents.mockResolvedValue([{ id: 'c1', name: 'api', description: '' }]);

    const result = await listComponents({ projectId: 'proj-1' });

    expect(result).toEqual({ components: [{ id: 'c1', name: 'api', description: '' }], cached: true });
    expect(mockCallZephlyAPI).not.toHaveBeenCalled();
  });

  it('skips the cache when a kind filter is set', async () => {
    mockGetCachedComponents.mockResolvedValue([{ id: 'c1', name: 'api', description: '' }]);
    mockCallZephlyAPI.mockResolvedValueOnce({ components: [{ id: 'c1', name: 'api' }] });

    await listComponents({ projectId: 'proj-1', kind: 'area' });

    expect(mockGetCachedComponents).not.toHaveBeenCalled();
    expect(mockCallZephlyAPI).toHaveBeenCalled();
  });
});

describe('listComponents single lookup (#2167)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockGetCachedComponents.mockResolvedValue(null);
  });

  // The bug: componentId/componentSlug are destructured out of the forwarded
  // args and used only to route the stats/timeline includes, so a plain single
  // lookup fell through to a full list. The caller got the entire project
  // inventory shaped exactly like a successful answer.
  it('forwards componentSlug to the API', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ components: [{ id: 'c1', name: 'Today' }] });

    await listComponents({ projectId: 'proj-1', componentSlug: 'today' });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListComponents', {
      projectId: 'proj-1',
      componentSlug: 'today',
    });
  });

  it('forwards componentId to the API', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ components: [{ id: 'c1', name: 'Today' }] });

    await listComponents({ projectId: 'proj-1', componentId: 'c1' });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListComponents', {
      projectId: 'proj-1',
      componentId: 'c1',
    });
  });

  it('still routes to stats when that include is set', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ stats: {} });
    await listComponents({ projectId: 'proj-1', componentSlug: 'today', include: ['stats'] });
    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetComponentStats', {
      projectId: 'proj-1',
      componentId: undefined,
      componentSlug: 'today',
    });
  });

  // include:["timeline"] used to be honoured for a single lookup and silently
  // dropped for a list. Both were wrong: nothing populates CachedTimeline, so
  // the "working" single lookup answered all-zeros — a lie that reads as a real
  // empty result. It is now rejected on every path, never degraded to a list.
  describe('include:["timeline"] is rejected, not dropped', () => {
    it('rejects a single lookup instead of returning zeros', async () => {
      await expect(
        listComponents({ projectId: 'proj-1', componentSlug: 'today', include: ['timeline'] })
      ).rejects.toThrow(/timeline.*not supported/i);

      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });

    it('rejects a project-wide list instead of degrading to a plain list', async () => {
      await expect(
        listComponents({ projectId: 'proj-1', include: ['timeline'] })
      ).rejects.toThrow(/timeline.*not supported/i);

      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });

    it('names stats as the working alternative', async () => {
      await expect(
        listComponents({ projectId: 'proj-1', include: ['timeline'] })
      ).rejects.toThrow(/include:\["stats"\]/);
    });

    it('rejects even when combined with a supported include', async () => {
      await expect(
        listComponents({ projectId: 'proj-1', include: ['stats', 'timeline'] })
      ).rejects.toThrow(/timeline.*not supported/i);

      expect(mockCallZephlyAPI).not.toHaveBeenCalled();
    });
  });

  // Cache poisoning this fix unmasks: while the identifier was dropped, the
  // response WAS the full inventory, so caching it was harmless. Now that a
  // single lookup returns one component, caching it would replace the whole
  // cached inventory with that single row — and every later unfiltered
  // list_components would read one component back and call it the project.
  it('does NOT overwrite the cache with a single-lookup result', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ components: [{ id: 'c1', name: 'Today', description: '' }] });

    await listComponents({ projectId: 'proj-1', componentSlug: 'today' });

    expect(mockUpdateCacheSections).not.toHaveBeenCalled();
  });

  it('does not serve a single lookup from the cached full inventory', async () => {
    mockGetCachedComponents.mockResolvedValue([
      { id: 'c1', name: 'api', description: '' },
      { id: 'c2', name: 'Today', description: '' },
    ]);
    mockCallZephlyAPI.mockResolvedValueOnce({ components: [{ id: 'c2', name: 'Today' }] });

    const result = await listComponents({ projectId: 'proj-1', componentSlug: 'today' });

    expect(mockGetCachedComponents).not.toHaveBeenCalled();
    expect(result.components).toHaveLength(1);
  });
});

describe('listComponents project-wide stats', () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockGetCachedComponents.mockResolvedValue(null);
  });

  // include:["stats"] used to require a single component; on a list it fell
  // through to the plain list and the stats request disappeared with no error.
  // The batch capability existed all along (REST /projects/{id}/components/stats)
  // — only the MCP route was missing.
  it('requests stats for the whole project when no component is named', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ stats: [{ componentId: 'c1' }] });

    const result = await listComponents({ projectId: 'proj-1', include: ['stats'] });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetComponentStats', {
      projectId: 'proj-1',
      componentId: undefined,
      componentSlug: undefined,
    });
    expect(result.stats).toHaveLength(1);
  });

  it('still scopes stats to one component when an identifier is given', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ stats: {} });

    await listComponents({ projectId: 'proj-1', componentSlug: 'today', include: ['stats'] });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetComponentStats', {
      projectId: 'proj-1',
      componentId: undefined,
      componentSlug: 'today',
    });
  });

  it('does not fall through to a plain list when stats are requested', async () => {
    mockCallZephlyAPI.mockResolvedValueOnce({ stats: [] });

    await listComponents({ projectId: 'proj-1', include: ['stats'] });

    expect(mockCallZephlyAPI).not.toHaveBeenCalledWith('mcpListComponents', expect.anything());
  });
});

/**
 * E-225: a bulk import of 90 screens must be able to carry its links in the same
 * call — otherwise nobody makes the 90 follow-up manage_link calls.
 */
describe('component links at create time (E-225)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function callsTo(endpoint) {
    return mockCallZephlyAPI.mock.calls.filter((c) => c[0] === endpoint);
  }

  it('links a newly created component', async () => {
    mockCallZephlyAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpCreateComponent') return { componentId: 'comp-1', slug: 'task-card' };
      return { success: true };
    });

    const result = await manageComponent({
      action: 'create',
      projectId: 'proj-1',
      name: 'TaskCard',
      links: [{ targetType: 'feature', targetId: 'feat-1' }],
    });

    expect(callsTo('mcpCreateComponent')[0][1]).not.toHaveProperty('links');
    expect(callsTo('mcpAddLink')[0][1]).toMatchObject({
      sourceType: 'component',
      sourceId: 'comp-1',
    });
    expect(result.links.applied).toHaveLength(1);
  });

  it('applies per-surface links on import, matching by name + sourcePath', async () => {
    mockCallZephlyAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpImportComponents') {
        return {
          imported: [
            { componentId: 'c-a', name: 'Login', sourcePath: 'web/login.tsx' },
            { componentId: 'c-b', name: 'Board', sourcePath: 'web/board.tsx' },
          ],
          count: 2,
        };
      }
      return { success: true };
    });

    const result = await manageComponent({
      action: 'import',
      projectId: 'proj-1',
      surfaces: [
        {
          kind: 'page',
          name: 'Login',
          sourcePath: 'web/login.tsx',
          links: [{ targetType: 'feature', targetId: 'feat-auth' }],
        },
        { kind: 'page', name: 'Board', sourcePath: 'web/board.tsx' },
      ],
    });

    // Links are stripped from the import payload — the MCP layer applies them.
    for (const surface of callsTo('mcpImportComponents')[0][1].surfaces) {
      expect(surface).not.toHaveProperty('links');
    }
    // Only the surface that asked for links gets a link call.
    expect(callsTo('mcpAddLink')).toHaveLength(1);
    expect(callsTo('mcpAddLink')[0][1].sourceId).toBe('c-a');
    expect(result.links).toEqual([
      {
        componentId: 'c-a',
        applied: [{ targetType: 'feature', targetId: 'feat-auth', linkType: 'relates_to' }],
        failed: [],
      },
    ]);
  });

  it('adds no `links` to the import result when no surface asked for links', async () => {
    mockCallZephlyAPI.mockResolvedValue({ imported: [{ componentId: 'c-a', name: 'Login' }], count: 1 });

    const result = await manageComponent({
      action: 'import',
      projectId: 'proj-1',
      surfaces: [{ kind: 'page', name: 'Login' }],
    });

    expect(result).not.toHaveProperty('links');
    expect(callsTo('mcpAddLink')).toHaveLength(0);
  });
});
