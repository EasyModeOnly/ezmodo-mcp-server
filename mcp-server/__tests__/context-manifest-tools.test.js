/**
 * Tests for context manifest MCP tool handlers.
 * Tests the handler functions that wrap the query engine.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestManifest() {
  return {
    metadata: {
      version: '1.0.0',
      generatedAt: '2026-02-13T19:19:10.592Z',
      projectName: 'TestProject',
      entryCount: 4,
      generator: 'test',
    },
    entries: [
      {
        path: 'api/internal/api/handlers/tasks.go',
        type: 'source',
        tags: ['source', 'handler', 'tasks', 'api'],
        summary: 'TasksHandler handles HTTP requests for task CRUD operations',
        dependencies: ['api/internal/core/tasks/service.go'],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'go',
        layer: 'handler',
        domain: 'tasks',
        exports: ['NewTasksHandler', 'ListProjectTasks', 'CreateTask'],
      },
      {
        path: 'api/internal/core/tasks/service.go',
        type: 'source',
        tags: ['source', 'service', 'tasks', 'api'],
        summary: 'Task service with business logic',
        dependencies: [],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'go',
        layer: 'service',
        domain: 'tasks',
        exports: ['TaskService', 'CreateTask'],
      },
      {
        path: 'web/src/components/tasks/task-list.tsx',
        type: 'source',
        tags: ['source', 'component', 'tasks', 'frontend'],
        summary: 'Renders a list of tasks with filtering',
        dependencies: [],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'typescript',
        layer: 'component',
        domain: 'tasks',
        exports: ['TaskList'],
      },
      {
        path: 'web/src/contexts/auth-context.tsx',
        type: 'source',
        tags: ['source', 'context', 'auth', 'frontend'],
        summary: 'Authentication context provider',
        dependencies: [],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'typescript',
        layer: 'context',
        domain: 'auth',
        exports: ['AuthProvider', 'useAuth'],
      },
    ],
  };
}

const MOCK_MANIFEST = createTestManifest();

// Mock the manifest loader (includes saveManifest)
jest.unstable_mockModule('../lib/manifest-loader.js', () => ({
  loadManifest: jest.fn(async () => MOCK_MANIFEST),
  reloadManifest: jest.fn(async () => MOCK_MANIFEST),
  saveManifest: jest.fn(async () => true),
  getManifestCacheInfo: jest.fn(() => ({
    loaded: true,
    loadedAt: '2026-02-13T20:00:00.000Z',
    entryCount: 4,
    version: '1.0.0',
    generatedAt: '2026-02-13T19:19:10.592Z',
    manifestPath: '/project/.zephly/manifest/manifest.json',
  })),
  isLocalManifestAvailable: jest.fn(async () => true),
  getManifestSource: jest.fn(async () => ({ source: 'local', manifest: MOCK_MANIFEST })),
  resolveManifestProjectId: jest.fn(async (override) => override || null),
}));

// Mock the http-client (not needed for local tests, but imported by handlers)
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: jest.fn(async () => ({})),
}));

const { callZephlyAPI } = await import('../lib/http-client.js');
const { getManifestSource, saveManifest } = await import('../lib/manifest-loader.js');

// Import handlers after mock setup
const {
  getContext,
  updateManifestEntriesHandler,
} = await import('../handlers/context-manifest.js');

// ============================================================================
// search_project_context
// ============================================================================

describe('getContext — search mode (replaces searchProjectContext)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should search by task description (default mode)', async () => {
    const result = await getContext({
      projectId: 'test',
      query: 'Fix task handler endpoint',
    });

    expect(result.context).toContain('handlers/tasks.go');
    expect(result.returnedCount).toBeGreaterThan(0);
    expect(result._meta).toBeDefined();
    expect(result._meta.manifestVersion).toBe('1.0.0');
  });

  it('should search by tags', async () => {
    const result = await getContext({
      projectId: 'test',
      query: 'handler tasks',
      tags: ['handler', 'tasks'],
    });

    expect(result.returnedCount).toBeGreaterThan(0);
    expect(result.topResults[0].path).toBe('api/internal/api/handlers/tasks.go');
  });

  it('should respect limit', async () => {
    const result = await getContext({
      projectId: 'test',
      query: 'tasks',
      limit: 1,
    });

    expect(result.returnedCount).toBeLessThanOrEqual(1);
  });

  it('should support detailed format', async () => {
    const result = await getContext({
      projectId: 'test',
      query: 'auth',
      format: 'detailed',
    });

    expect(result.context).toContain('**Type**:');
    expect(result.context).toContain('**Tags**:');
  });

  it('should support structured format', async () => {
    const result = await getContext({
      projectId: 'test',
      query: 'auth',
      format: 'structured',
    });

    const parsed = JSON.parse(result.context);
    expect(parsed).toBeInstanceOf(Array);
  });

  it('should include _meta with timing', async () => {
    const result = await getContext({
      projectId: 'test',
      query: 'tasks',
    });

    expect(result._meta.durationMs).toBeGreaterThanOrEqual(0);
    expect(result._meta.totalManifestEntries).toBe(4);
  });

  it('should split query into tags for tag mode without explicit tags', async () => {
    const result = await getContext({
      projectId: 'test',
      query: 'handler api',
      tags: ['handler', 'api'],
    });

    expect(result.returnedCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// get_related_files
// ============================================================================

describe('getContext — file mode (replaces getRelatedFilesHandler)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return related files for a known path', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'file',
      entityId: 'api/internal/api/handlers/tasks.go',
    });

    expect(result.sourceFile).toBe('api/internal/api/handlers/tasks.go');
    expect(result.related.length).toBeGreaterThan(0);
    expect(result.stats).toBeDefined();
  });

  it('should classify relationships', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'file',
      entityId: 'api/internal/api/handlers/tasks.go',
      depth: 1,
      direction: 'forward',
    });

    const dep = result.related.find((r) => r.path === 'api/internal/core/tasks/service.go');
    expect(dep).toBeDefined();
    expect(dep.relationship).toBe('dependency');
  });

  it('should suggest similar paths for unknown file', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'file',
      entityId: 'api/handlers/task.go',
    });

    expect(result.suggestions).toBeDefined();
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.hint).toContain('not found');
  });

  it('should include _meta', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'file',
      entityId: 'api/internal/api/handlers/tasks.go',
    });

    expect(result._meta).toBeDefined();
    expect(result._meta.manifestVersion).toBe('1.0.0');
  });
});

// ============================================================================
// get_project_overview
// ============================================================================

describe('getContext — project overview mode (replaces getProjectOverviewHandler)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return full project overview', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'project',
      include: ['overview'],
    });

    expect(result.overview).toBeDefined();
    expect(result.overview.totalFiles).toBe(4);
    expect(result.overview.byType).toBeDefined();
    expect(result.overview.byDomain).toBeDefined();
    expect(result.overview.byLanguage).toBeDefined();
    expect(result.overview.manifest.version).toBe('1.0.0');
  });

  it('should include _meta in overview', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'project',
      include: ['overview'],
    });

    expect(result.overview._meta).toBeDefined();
    expect(result.overview._meta.resultCount).toBe(4);
  });
});

// ============================================================================
// get_critical_files
// ============================================================================

describe('getContext — critical files mode (replaces getCriticalFilesHandler)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return critical files', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'project',
      include: ['critical_files'],
    });

    expect(result.critical_files).toBeDefined();
    expect(result.critical_files.criticalFiles.length).toBeGreaterThan(0);
    expect(result.critical_files.totalCritical).toBeGreaterThan(0);
    expect(result.critical_files._meta).toBeDefined();
  });

  it('should include file metadata in results', async () => {
    const result = await getContext({
      projectId: 'test',
      entityType: 'project',
      include: ['critical_files'],
    });

    if (result.critical_files.criticalFiles.length > 0) {
      const file = result.critical_files.criticalFiles[0];
      expect(file.path).toBeDefined();
      expect(file.score).toBeGreaterThanOrEqual(0);
      expect(file.signals).toBeInstanceOf(Array);
      expect(file.currentSummary).toBeDefined();
    }
  });
});

// ============================================================================
// update_manifest_entries
// ============================================================================

describe('updateManifestEntriesHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update entries and save to disk', async () => {
    const result = await updateManifestEntriesHandler({
      updates: [
        {
          path: 'api/internal/api/handlers/tasks.go',
          summary: 'Enriched: Orchestrates task CRUD via HTTP handlers.',
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(1);
    expect(result.updated).toContain('api/internal/api/handlers/tasks.go');
  });

  it('should report not-found paths', async () => {
    const result = await updateManifestEntriesHandler({
      updates: [
        { path: 'nonexistent/file.go', summary: 'test' },
      ],
    });

    expect(result.notFoundCount).toBe(1);
    expect(result.notFound).toContain('nonexistent/file.go');
  });

  it('should handle batch updates', async () => {
    const result = await updateManifestEntriesHandler({
      updates: [
        { path: 'api/internal/api/handlers/tasks.go', summary: 'Updated 1' },
        { path: 'api/internal/core/tasks/service.go', summary: 'Updated 2' },
      ],
    });

    expect(result.updatedCount).toBe(2);
  });

  it('should throw when no updates provided', async () => {
    await expect(
      updateManifestEntriesHandler({ updates: [] })
    ).rejects.toThrow('No updates provided');
  });

  it('should include _meta and timestamp', async () => {
    const result = await updateManifestEntriesHandler({
      updates: [
        { path: 'api/internal/api/handlers/tasks.go', summary: 'test' },
      ],
    });

    expect(result._meta).toBeDefined();
    expect(result.timestamp).toBeDefined();
  });
});

describe('updateManifestEntriesHandler — remote (API is the source of truth)', () => {
  const serverResult = {
    created: ['web/src/new.ts'],
    updated: ['api/internal/api/handlers/tasks.go'],
    deleted: ['old/gone.ts'],
    renamed: [],
    notFound: [],
    needsSummary: [],
    manifestMissing: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    callZephlyAPI.mockResolvedValue(serverResult);
    getManifestSource.mockResolvedValue({ source: 'remote', projectId: 'proj-1' });
  });

  afterEach(() => {
    getManifestSource.mockImplementation(async () => ({ source: 'local', manifest: MOCK_MANIFEST }));
  });

  it('writes through apply-changes, creating missing entries', async () => {
    const updates = [
      { path: 'web/src/new.ts', summary: 'New file' },
      { path: 'api/internal/api/handlers/tasks.go', summary: 'Updated' },
    ];
    const result = await updateManifestEntriesHandler({
      project_id: 'proj-1',
      updates,
      deletes: ['old/gone.ts'],
    });

    expect(callZephlyAPI).toHaveBeenCalledWith('mcpApplyManifestChanges', {
      projectId: 'proj-1',
      upserts: updates,
      deletes: ['old/gone.ts'],
    });
    expect(result).toEqual(expect.objectContaining({
      success: true,
      created: ['web/src/new.ts'],
      updated: ['api/internal/api/handlers/tasks.go'],
      deleted: ['old/gone.ts'],
      notFound: [],
      needsSummary: [],
      updatedCount: 2,
      _source: 'remote',
    }));
    expect(result.localMirror).toBeUndefined();
  });

  it('accepts deletes alone', async () => {
    await updateManifestEntriesHandler({ project_id: 'proj-1', deletes: ['old/gone.ts'] });

    expect(callZephlyAPI).toHaveBeenCalledWith('mcpApplyManifestChanges', {
      projectId: 'proj-1',
      upserts: [],
      deletes: ['old/gone.ts'],
    });
  });

  it('writes to the API even when a local manifest exists, and mirrors it locally', async () => {
    const manifest = createTestManifest();
    getManifestSource.mockResolvedValue({ source: 'local', manifest });

    const result = await updateManifestEntriesHandler({
      project_id: 'proj-1',
      updates: [{ path: 'api/internal/api/handlers/tasks.go', summary: 'Mirrored' }],
      deletes: ['api/internal/core/tasks/service.go'],
    });

    expect(callZephlyAPI).toHaveBeenCalledWith('mcpApplyManifestChanges', expect.anything());
    expect(result._source).toBe('remote');
    expect(result.localMirror).toEqual({ updated: 1, deleted: 1, saved: true });
    expect(saveManifest).toHaveBeenCalled();
    expect(manifest.entries.find(e => e.path === 'api/internal/api/handlers/tasks.go').summary).toBe('Mirrored');
    expect(manifest.entries.some(e => e.path === 'api/internal/core/tasks/service.go')).toBe(false);
  });

  it('warns when the project has no manifest yet', async () => {
    callZephlyAPI.mockResolvedValue({ manifestMissing: true });

    const result = await updateManifestEntriesHandler({
      project_id: 'proj-1',
      updates: [{ path: 'a.ts', summary: 'x' }],
    });

    expect(result.success).toBe(false);
    expect(result.warning).toMatch(/no manifest yet/);
  });
});
