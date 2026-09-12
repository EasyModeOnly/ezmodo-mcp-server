/**
 * Tests for manifest-query.js
 * Validates query functions, formatting, and utility helpers.
 */

import { describe, it, expect } from '@jest/globals';
import {
  getContextForTags,
  getContextForTask,
  getRelatedFiles,
  getProjectOverview,
  formatContextForPrompt,
  suggestSimilarPaths,
  getCriticalFiles,
  updateManifestEntries,
  createMeta,
} from '../lib/manifest-query.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createTestManifest() {
  return {
    metadata: {
      version: '1.0.0',
      generatedAt: '2026-02-13T19:19:10.592Z',
      projectName: 'TestProject',
      entryCount: 7,
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
        exports: ['NewTasksHandler', 'ListProjectTasks', 'CreateTask', 'UpdateTask'],
      },
      {
        path: 'api/internal/core/tasks/service.go',
        type: 'source',
        tags: ['source', 'service', 'tasks', 'api'],
        summary: 'Task service with business logic for task management',
        dependencies: ['api/internal/core/tasks/models.go'],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'go',
        layer: 'service',
        domain: 'tasks',
        exports: ['TaskService', 'CreateTask', 'UpdateTask'],
      },
      {
        path: 'api/internal/core/tasks/models.go',
        type: 'source',
        tags: ['source', 'type', 'tasks', 'api'],
        summary: 'Task data models and types',
        dependencies: [],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'go',
        layer: 'model',
        domain: 'tasks',
        exports: ['Task', 'TaskStep', 'TaskStatus'],
      },
      {
        path: 'web/src/components/tasks/task-list.tsx',
        type: 'source',
        tags: ['source', 'component', 'tasks', 'frontend'],
        summary: 'Renders a list of tasks with filtering and sorting',
        dependencies: ['packages/types/src/project/task.types.ts'],
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
        summary: 'Authentication context provider for user sessions',
        dependencies: [],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'typescript',
        layer: 'context',
        domain: 'auth',
        exports: ['AuthProvider', 'useAuth'],
      },
      {
        path: 'api/internal/api/handlers/billing.go',
        type: 'source',
        tags: ['source', 'handler', 'billing', 'api', 'stripe'],
        summary: 'BillingHandler manages Stripe webhook processing',
        dependencies: ['api/internal/core/billing/service.go'],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'go',
        layer: 'handler',
        domain: 'billing',
        exports: ['NewBillingHandler', 'HandleWebhook'],
      },
      {
        path: 'packages/types/src/project/task.types.ts',
        type: 'source',
        tags: ['source', 'type', 'tasks', 'types'],
        summary: 'Type definitions for Task, TaskStep, and TaskContext',
        dependencies: [],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'typescript',
        layer: 'type',
        domain: 'tasks',
        exports: ['Task', 'TaskStep', 'TaskContext', 'TaskStatus'],
      },
    ],
  };
}

// ============================================================================
// getContextForTags
// ============================================================================

describe('getContextForTags', () => {
  const manifest = createTestManifest();

  it('should return entries matching a single tag', () => {
    const results = getContextForTags(manifest, ['billing']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.domain).toBe('billing');
  });

  it('should return entries matching multiple tags (OR logic)', () => {
    const results = getContextForTags(manifest, ['handler', 'auth']);
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('should sort by relevance score (highest first)', () => {
    const results = getContextForTags(manifest, ['tasks', 'handler']);
    expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
    // The tasks handler should score highest (matches both tags)
    expect(results[0].entry.path).toBe('api/internal/api/handlers/tasks.go');
  });

  it('should be case-insensitive', () => {
    const results = getContextForTags(manifest, ['TASKS']);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should support prefix matching', () => {
    const results = getContextForTags(manifest, ['task']);
    // "task" should prefix-match "tasks"
    expect(results.length).toBeGreaterThan(0);
  });

  it('should return empty array for empty tags', () => {
    expect(getContextForTags(manifest, [])).toEqual([]);
  });

  it('should return empty array for no matches', () => {
    const results = getContextForTags(manifest, ['nonexistent']);
    expect(results).toEqual([]);
  });
});

// ============================================================================
// getContextForTask
// ============================================================================

describe('getContextForTask', () => {
  const manifest = createTestManifest();

  it('should find relevant files for a task description', () => {
    const results = getContextForTask(manifest, 'Fix a bug in the task handler');
    expect(results.length).toBeGreaterThan(0);
    // Task handler should be in results
    const paths = results.map((r) => r.entry.path);
    expect(paths).toContain('api/internal/api/handlers/tasks.go');
  });

  it('should match against multiple fields (tags, summary, exports)', () => {
    const results = getContextForTask(manifest, 'billing webhook stripe');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.path).toBe('api/internal/api/handlers/billing.go');
  });

  it('should respect limit parameter', () => {
    const results = getContextForTask(manifest, 'task', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('should return empty for empty description', () => {
    expect(getContextForTask(manifest, '')).toEqual([]);
  });

  it('should filter stop words', () => {
    // "the", "a", "is", "to" are all stop words
    const results = getContextForTask(manifest, 'the a is to');
    expect(results).toEqual([]);
  });

  it('should match exports', () => {
    const results = getContextForTask(manifest, 'AuthProvider');
    expect(results.length).toBeGreaterThan(0);
    const paths = results.map((r) => r.entry.path);
    expect(paths).toContain('web/src/contexts/auth-context.tsx');
  });
});

// ============================================================================
// getRelatedFiles
// ============================================================================

describe('getRelatedFiles', () => {
  const manifest = createTestManifest();

  it('should find direct forward dependencies', () => {
    const results = getRelatedFiles(manifest, 'api/internal/api/handlers/tasks.go', 1, 'forward');
    const paths = results.map((r) => r.path);
    expect(paths).toContain('api/internal/core/tasks/service.go');
  });

  it('should find reverse dependencies (files that depend on it)', () => {
    const results = getRelatedFiles(manifest, 'api/internal/core/tasks/service.go', 1, 'reverse');
    const paths = results.map((r) => r.path);
    expect(paths).toContain('api/internal/api/handlers/tasks.go');
  });

  it('should find both directions by default', () => {
    const results = getRelatedFiles(manifest, 'api/internal/core/tasks/service.go');
    const paths = results.map((r) => r.path);
    expect(paths).toContain('api/internal/api/handlers/tasks.go'); // reverse
    expect(paths).toContain('api/internal/core/tasks/models.go'); // forward
  });

  it('should traverse deeper with depth > 1', () => {
    // handlers/tasks.go -> core/tasks/service.go -> core/tasks/models.go
    const results = getRelatedFiles(manifest, 'api/internal/api/handlers/tasks.go', 2, 'forward');
    const paths = results.map((r) => r.path);
    expect(paths).toContain('api/internal/core/tasks/models.go');
  });

  it('should prioritize direct deps over reverse deps', () => {
    const results = getRelatedFiles(manifest, 'api/internal/core/tasks/service.go');
    // service.go depends on models.go (direct), handler depends on service.go (reverse)
    const directIdx = results.findIndex((r) => r.path === 'api/internal/core/tasks/models.go');
    const reverseIdx = results.findIndex((r) => r.path === 'api/internal/api/handlers/tasks.go');
    expect(directIdx).toBeLessThan(reverseIdx);
  });

  it('should return empty for unknown file', () => {
    const results = getRelatedFiles(manifest, 'nonexistent/file.ts');
    expect(results).toEqual([]);
  });

  it('should return empty for empty path', () => {
    const results = getRelatedFiles(manifest, '');
    expect(results).toEqual([]);
  });
});

// ============================================================================
// getProjectOverview
// ============================================================================

describe('getProjectOverview', () => {
  const manifest = createTestManifest();

  it('should return full project overview', () => {
    const overview = getProjectOverview(manifest);
    expect(overview.totalFiles).toBe(7);
    expect(overview.byType.source).toBe(7);
    expect(overview.byDomain.tasks).toBeGreaterThanOrEqual(4);
    expect(overview.byLanguage.go).toBeGreaterThan(0);
    expect(overview.byLanguage.typescript).toBeGreaterThan(0);
  });

  it('should filter by domain', () => {
    const overview = getProjectOverview(manifest, { domain: 'billing' });
    expect(overview.totalFiles).toBe(1);
    expect(overview.filteredByDomain).toBe('billing');
  });

  it('should filter by layer', () => {
    const overview = getProjectOverview(manifest, { layer: 'handler' });
    expect(overview.totalFiles).toBe(2); // tasks handler + billing handler
    expect(overview.filteredByLayer).toBe('handler');
  });

  it('should include dependency statistics', () => {
    const overview = getProjectOverview(manifest);
    expect(overview.dependencyStats).toBeDefined();
    expect(overview.dependencyStats.totalRelationships).toBeGreaterThan(0);
    expect(overview.dependencyStats.mostDependedOn).toBeInstanceOf(Array);
  });

  it('should include entry points per domain', () => {
    const overview = getProjectOverview(manifest);
    expect(overview.entryPoints.tasks).toBeDefined();
    expect(overview.entryPoints.tasks.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// formatContextForPrompt
// ============================================================================

describe('formatContextForPrompt', () => {
  const entries = createTestManifest().entries.slice(0, 3);

  it('should format compact mode', () => {
    const output = formatContextForPrompt(entries, { mode: 'compact' });
    expect(output).toContain('## Relevant Context (3 files)');
    expect(output).toContain('**api/internal/api/handlers/tasks.go**');
    expect(output).toContain('TasksHandler');
  });

  it('should format detailed mode', () => {
    const output = formatContextForPrompt(entries, { mode: 'detailed' });
    expect(output).toContain('**Type**:');
    expect(output).toContain('**Tags**:');
    expect(output).toContain('**Layer**:');
  });

  it('should format structured mode (JSON)', () => {
    const output = formatContextForPrompt(entries, { mode: 'structured' });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].path).toBe('api/internal/api/handlers/tasks.go');
  });

  it('should group by type', () => {
    const output = formatContextForPrompt(entries, { groupBy: 'type' });
    expect(output).toContain('### source');
  });

  it('should group by domain', () => {
    const output = formatContextForPrompt(entries, { groupBy: 'domain' });
    expect(output).toContain('### tasks');
  });

  it('should truncate at maxLength', () => {
    const output = formatContextForPrompt(entries, { maxLength: 100 });
    expect(output.length).toBeLessThanOrEqual(100);
    expect(output).toContain('truncated');
  });

  it('should return "No relevant context found." for empty entries', () => {
    expect(formatContextForPrompt([])).toBe('No relevant context found.');
  });
});

// ============================================================================
// suggestSimilarPaths
// ============================================================================

describe('suggestSimilarPaths', () => {
  const manifest = createTestManifest();

  it('should suggest files with similar names', () => {
    const suggestions = suggestSimilarPaths(manifest, 'api/handlers/task.go');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain('api/internal/api/handlers/tasks.go');
  });

  it('should suggest based on basename', () => {
    const suggestions = suggestSimilarPaths(manifest, 'some/other/tasks.go');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('should respect limit', () => {
    const suggestions = suggestSimilarPaths(manifest, 'task', 2);
    expect(suggestions.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================================
// createMeta
// ============================================================================

describe('createMeta', () => {
  it('should create meta with timing info', () => {
    const manifest = createTestManifest();
    const start = process.hrtime.bigint();
    const meta = createMeta(manifest, 5, start);

    expect(meta.resultCount).toBe(5);
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);
    expect(meta.manifestVersion).toBe('1.0.0');
    expect(meta.totalManifestEntries).toBe(7);
  });

  it('should handle null manifest gracefully', () => {
    const start = process.hrtime.bigint();
    const meta = createMeta(null, 0, start);

    expect(meta.resultCount).toBe(0);
    expect(meta.manifestVersion).toBeNull();
    expect(meta.totalManifestEntries).toBe(0);
  });
});

// ============================================================================
// getCriticalFiles
// ============================================================================

describe('getCriticalFiles', () => {
  function createManifestWithHeavyDeps() {
    // models.go is depended on by 6 files -> critical
    const manifest = createTestManifest();
    // Add more entries that depend on models.go
    const modelPath = 'api/internal/core/tasks/models.go';
    for (let i = 0; i < 5; i++) {
      manifest.entries.push({
        path: `api/internal/extra/dep${i}.go`,
        type: 'source',
        tags: ['source', 'api'],
        summary: `Extra dependency ${i}`,
        dependencies: [modelPath],
        lastAnalyzed: '2026-02-13T19:19:10.592Z',
        language: 'go',
        domain: 'tasks',
      });
    }
    manifest.metadata.entryCount = manifest.entries.length;
    return manifest;
  }

  it('should identify files with high inbound deps', () => {
    const manifest = createManifestWithHeavyDeps();
    const critical = getCriticalFiles(manifest, { threshold: 5 });
    const paths = critical.map((c) => c.path);
    expect(paths).toContain('api/internal/core/tasks/models.go');
  });

  it('should include criticality signals', () => {
    const manifest = createManifestWithHeavyDeps();
    const critical = getCriticalFiles(manifest, { threshold: 5 });
    const models = critical.find(
      (c) => c.path === 'api/internal/core/tasks/models.go'
    );
    expect(models).toBeDefined();
    expect(models.signals.some((s) => s.startsWith('high_dependency_count'))).toBe(true);
  });

  it('should identify key directory files', () => {
    const manifest = createTestManifest();
    const critical = getCriticalFiles(manifest, { threshold: 0 });
    // handlers/ and services/ are key directories
    const handlerFiles = critical.filter(
      (c) => c.signals.some((s) => s.includes('key_directory'))
    );
    expect(handlerFiles.length).toBeGreaterThan(0);
  });

  it('should skip non-source files', () => {
    const manifest = createTestManifest();
    // Add a config file in a key directory
    manifest.entries.push({
      path: 'api/internal/core/config.yaml',
      type: 'config',
      tags: ['config'],
      summary: 'Config file',
      dependencies: [],
      lastAnalyzed: '2026-02-13T19:19:10.592Z',
    });
    const critical = getCriticalFiles(manifest, { threshold: 0 });
    const paths = critical.map((c) => c.path);
    expect(paths).not.toContain('api/internal/core/config.yaml');
  });

  it('should skip already-enriched files when unenrichedOnly', () => {
    const manifest = createManifestWithHeavyDeps();
    const modelEntry = manifest.entries.find(
      (e) => e.path === 'api/internal/core/tasks/models.go'
    );
    modelEntry.enrichment_method = 'llm';

    const critical = getCriticalFiles(manifest, {
      threshold: 5,
      unenrichedOnly: true,
    });
    const paths = critical.map((c) => c.path);
    expect(paths).not.toContain('api/internal/core/tasks/models.go');
  });

  it('should include already-enriched when unenrichedOnly=false', () => {
    const manifest = createManifestWithHeavyDeps();
    const modelEntry = manifest.entries.find(
      (e) => e.path === 'api/internal/core/tasks/models.go'
    );
    modelEntry.enrichment_method = 'llm';

    const critical = getCriticalFiles(manifest, {
      threshold: 5,
      unenrichedOnly: false,
    });
    const paths = critical.map((c) => c.path);
    expect(paths).toContain('api/internal/core/tasks/models.go');
  });

  it('should respect limit', () => {
    const manifest = createManifestWithHeavyDeps();
    const critical = getCriticalFiles(manifest, { threshold: 0, limit: 2 });
    expect(critical.length).toBeLessThanOrEqual(2);
  });

  it('should sort by score descending', () => {
    const manifest = createManifestWithHeavyDeps();
    const critical = getCriticalFiles(manifest, { threshold: 0 });
    for (let i = 1; i < critical.length; i++) {
      expect(critical[i - 1].score).toBeGreaterThanOrEqual(critical[i].score);
    }
  });
});

// ============================================================================
// updateManifestEntries
// ============================================================================

describe('updateManifestEntries', () => {
  it('should update entry summary and mark as llm-enriched', () => {
    const manifest = createTestManifest();
    const result = updateManifestEntries(manifest, [
      {
        path: 'api/internal/api/handlers/tasks.go',
        summary: 'Enriched: This handler orchestrates all task CRUD operations...',
      },
    ]);

    expect(result.updated).toContain('api/internal/api/handlers/tasks.go');
    expect(result.notFound).toHaveLength(0);

    const entry = manifest.entries.find(
      (e) => e.path === 'api/internal/api/handlers/tasks.go'
    );
    expect(entry.summary).toBe(
      'Enriched: This handler orchestrates all task CRUD operations...'
    );
    expect(entry.enrichment_method).toBe('llm');
    expect(entry.lastAnalyzed).toBeDefined();
  });

  it('should report not-found paths', () => {
    const manifest = createTestManifest();
    const result = updateManifestEntries(manifest, [
      { path: 'nonexistent/file.go', summary: 'test' },
    ]);

    expect(result.updated).toHaveLength(0);
    expect(result.notFound).toContain('nonexistent/file.go');
  });

  it('should handle batch updates', () => {
    const manifest = createTestManifest();
    const result = updateManifestEntries(manifest, [
      { path: 'api/internal/api/handlers/tasks.go', summary: 'Updated 1' },
      { path: 'api/internal/core/tasks/service.go', summary: 'Updated 2' },
      { path: 'nonexistent.go', summary: 'Should fail' },
    ]);

    expect(result.updated).toHaveLength(2);
    expect(result.notFound).toHaveLength(1);
  });

  it('should set criticality fields when provided', () => {
    const manifest = createTestManifest();
    updateManifestEntries(manifest, [
      {
        path: 'api/internal/api/handlers/tasks.go',
        summary: 'Enriched summary',
        criticality_score: 0.85,
        criticality_signals: ['high_dependency_count:12'],
      },
    ]);

    const entry = manifest.entries.find(
      (e) => e.path === 'api/internal/api/handlers/tasks.go'
    );
    expect(entry.criticality_score).toBe(0.85);
    expect(entry.criticality_signals).toEqual(['high_dependency_count:12']);
  });
});
