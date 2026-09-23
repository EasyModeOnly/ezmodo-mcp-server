import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildManifestDelta,
  createScopeMatcher,
  globToRegExp,
  isEmptyDelta,
  isLikelySourcePath,
  loadManifestScope,
  summarizeManifestResult,
  REVIEW_SUMMARY_CAP,
} from '../lib/manifest-delta.js';

describe('globToRegExp', () => {
  it.each([
    ['api/**/*.go', 'api/main.go', true],
    ['api/**/*.go', 'api/internal/x/y.go', true],
    ['api/**/*.go', 'web/api/main.go', false],
    ['web/src/**/*.{ts,tsx}', 'web/src/app/page.tsx', true],
    ['web/src/**/*.{ts,tsx}', 'web/src/app/page.js', false],
    ['*.md', 'README.md', true],
    ['*.md', 'docs/README.md', false],
    ['**/node_modules/**', 'node_modules/x/index.js', true],
    ['**/node_modules/**', 'web/node_modules/x/index.js', true],
    ['docker-compose*.yml', 'docker-compose.e2e.yml', true],
    ['file?.ts', 'file1.ts', true],
    ['a.b', 'axb', false],
  ])('%s vs %s → %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});

describe('createScopeMatcher', () => {
  it('uses include and exclude globs from the manifest config', () => {
    const inScope = createScopeMatcher({
      include: ['api/**/*.go', '*.json'],
      exclude: ['**/package-lock.json'],
    });
    expect(inScope('api/a.go')).toBe(true);
    expect(inScope('web/a.ts')).toBe(false);
    expect(inScope('package.json')).toBe(true);
    expect(inScope('package-lock.json')).toBe(false);
  });

  it('falls back to skipping obvious non-source without a config', () => {
    const inScope = createScopeMatcher(null);
    expect(inScope('src/a.ts')).toBe(true);
    expect(inScope('package-lock.json')).toBe(false);
    expect(inScope('web/public/logo.png')).toBe(false);
    expect(inScope('web/node_modules/x/index.js')).toBe(false);
    expect(inScope('dist/bundle.js')).toBe(false);
  });
});

describe('isLikelySourcePath', () => {
  it.each([
    ['api/main.go', true],
    ['go.sum', false],
    ['assets/app.min.js', false],
    ['build/out.js', false],
    ['docs/guide.md', true],
    ['', false],
  ])('%p → %p', (path, expected) => {
    expect(isLikelySourcePath(path)).toBe(expected);
  });
});

describe('loadManifestScope', () => {
  let root;

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = null;
  });

  it('reads .ezmodo/manifest/config.json', () => {
    root = mkdtempSync(join(tmpdir(), 'ezmodo-scope-'));
    mkdirSync(join(root, '.ezmodo', 'manifest'), { recursive: true });
    writeFileSync(join(root, '.ezmodo', 'manifest', 'config.json'),
      JSON.stringify({ include: ['a/**'], exclude: ['b/**'], other: 1 }));
    expect(loadManifestScope(root)).toEqual({ include: ['a/**'], exclude: ['b/**'] });
  });

  it('falls back to the legacy .zephly directory', () => {
    root = mkdtempSync(join(tmpdir(), 'ezmodo-scope-'));
    mkdirSync(join(root, '.zephly', 'manifest'), { recursive: true });
    writeFileSync(join(root, '.zephly', 'manifest', 'config.json'), JSON.stringify({ include: ['x/**'] }));
    expect(loadManifestScope(root).include).toEqual(['x/**']);
  });

  it('returns null when there is no config', () => {
    root = mkdtempSync(join(tmpdir(), 'ezmodo-scope-'));
    expect(loadManifestScope(root)).toBeNull();
    expect(loadManifestScope('')).toBeNull();
  });
});

describe('buildManifestDelta', () => {
  it('maps A/M to upserts, D to deletes and R to renames', () => {
    const delta = buildManifestDelta([
      { status: 'A', path: 'a.ts' },
      { status: 'M', path: 'b.ts' },
      { status: 'D', path: 'c.ts' },
      { status: 'R', path: 'e.ts', from: 'd.ts', similarity: 100 },
    ]);
    expect(delta).toEqual({
      upserts: [{ path: 'a.ts' }, { path: 'b.ts' }],
      deletes: ['c.ts'],
      renames: [{ from: 'd.ts', to: 'e.ts' }],
    });
  });

  it('also upserts a rename whose content changed', () => {
    const delta = buildManifestDelta([{ status: 'R', path: 'e.ts', from: 'd.ts', similarity: 80 }]);
    expect(delta.renames).toEqual([{ from: 'd.ts', to: 'e.ts' }]);
    expect(delta.upserts).toEqual([{ path: 'e.ts' }]);
  });

  it('treats renames across the scope boundary as add or delete', () => {
    const inScope = (p) => p.startsWith('src/');
    const delta = buildManifestDelta([
      { status: 'R', path: 'src/in.ts', from: 'tmp/in.ts', similarity: 100 },
      { status: 'R', path: 'tmp/out.ts', from: 'src/out.ts', similarity: 100 },
      { status: 'R', path: 'tmp/b.ts', from: 'tmp/a.ts', similarity: 100 },
    ], inScope);
    expect(delta).toEqual({
      upserts: [{ path: 'src/in.ts' }],
      deletes: ['src/out.ts'],
      renames: [],
    });
  });

  it('drops out-of-scope paths and de-duplicates upserts', () => {
    const delta = buildManifestDelta([
      { status: 'M', path: 'src/a.ts' },
      { status: 'M', path: 'src/a.ts' },
      { status: 'D', path: 'package-lock.json' },
      { status: 'X', path: 'src/weird.ts' },
    ], createScopeMatcher(null));
    expect(delta).toEqual({ upserts: [{ path: 'src/a.ts' }], deletes: [], renames: [] });
  });

  it('handles an empty or missing change list', () => {
    expect(isEmptyDelta(buildManifestDelta([]))).toBe(true);
    expect(isEmptyDelta(buildManifestDelta(undefined))).toBe(true);
    expect(isEmptyDelta(buildManifestDelta([{ status: 'A', path: 'x.ts' }]))).toBe(false);
  });
});

describe('summarizeManifestResult', () => {
  it('splits new paths needing a summary from modified ones worth reviewing', () => {
    const shaped = summarizeManifestResult({
      created: ['new.ts'],
      updated: ['old.ts', 'blank.ts'],
      deleted: ['gone.ts'],
      renamed: [{ from: 'a.ts', to: 'b.ts' }],
      needsSummary: ['new.ts', 'blank.ts'],
    });
    expect(shaped).toEqual({
      created: ['new.ts'],
      deleted: ['gone.ts'],
      renamed: [{ from: 'a.ts', to: 'b.ts' }],
      needsSummary: ['new.ts', 'blank.ts'],
      reviewSummary: ['old.ts'],
      instruction: expect.stringContaining('update_manifest_entries'),
    });
  });

  it('caps reviewSummary', () => {
    const updated = Array.from({ length: 40 }, (_, i) => `f${i}.ts`);
    expect(summarizeManifestResult({ updated }).reviewSummary).toHaveLength(REVIEW_SUMMARY_CAP);
  });

  it('omits the instruction when there is nothing to write', () => {
    const shaped = summarizeManifestResult({ deleted: ['x.ts'] });
    expect(shaped.instruction).toBeUndefined();
    expect(shaped.needsSummary).toEqual([]);
  });

  it('reports a missing manifest as skipped', () => {
    expect(summarizeManifestResult({ manifestMissing: true })).toEqual({
      skipped: expect.stringContaining('no manifest yet'),
    });
  });
});
