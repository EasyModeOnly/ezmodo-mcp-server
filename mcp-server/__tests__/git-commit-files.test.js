import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { getCommitFiles, getCommitNameStatus, parseNameStatusZ } from '../lib/git-helpers.js';

/**
 * Driven against a real repository rather than a mocked execSync: the value of
 * getCommitFiles is entirely in whether it reads git correctly, which a mock
 * would assert nothing about.
 */
describe('getCommitFiles', () => {
  let repo;
  let sha;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'ezmodo-git-'));
    const git = (cmd) => execSync(cmd, { cwd: repo, stdio: 'pipe' });

    git('git init -q');
    git('git config user.email test@example.com');
    git('git config user.name Test');
    writeFileSync(join(repo, 'README.md'), 'base\n');
    git('git add -A');
    git('git commit -q -m base');

    mkdirSync(join(repo, 'api'), { recursive: true });
    writeFileSync(join(repo, 'api', 'a.go'), 'package a\n');
    writeFileSync(join(repo, 'README.md'), 'changed\n');
    git('git add -A');
    git('git commit -q -m change');
    sha = execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf-8' }).trim();
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('returns every path the commit changed', () => {
    expect(getCommitFiles(repo, sha).sort()).toEqual(['README.md', 'api/a.go']);
  });

  it('accepts an abbreviated sha', () => {
    expect(getCommitFiles(repo, sha.slice(0, 7))).toContain('api/a.go');
  });

  it('returns [] for an unknown commit rather than throwing', () => {
    expect(getCommitFiles(repo, 'f'.repeat(40))).toEqual([]);
  });

  // The sha is interpolated into a shell string, so anything that is not hex
  // must be rejected before it gets there.
  it.each([
    'HEAD; rm -rf /',
    '$(whoami)',
    '`id`',
    'main',
    '',
  ])('rejects %p without running git', (bad) => {
    expect(getCommitFiles(repo, bad)).toEqual([]);
  });

  it('returns [] without a repo path', () => {
    expect(getCommitFiles('', sha)).toEqual([]);
  });
});

describe('getCommitNameStatus', () => {
  let repo;
  const shas = {};

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'ezmodo-git-ns-'));
    const git = (cmd) => execSync(cmd, { cwd: repo, stdio: 'pipe' });
    const head = () => execSync('git rev-parse HEAD', { cwd: repo, encoding: 'utf-8' }).trim();
    const body = (name) => Array.from({ length: 20 }, (_, i) => `${name} line ${i}`).join('\n') + '\n';

    git('git init -q -b main');
    git('git config user.email test@example.com');
    git('git config user.name Test');
    writeFileSync(join(repo, 'keep.ts'), body('keep'));
    writeFileSync(join(repo, 'gone.ts'), body('gone'));
    writeFileSync(join(repo, 'was.ts'), body('was'));
    git('git add -A');
    git('git commit -q -m root');
    shas.root = head();

    writeFileSync(join(repo, 'keep.ts'), body('keep') + 'more\n');
    writeFileSync(join(repo, 'new file.ts'), body('new'));
    git('git rm -q gone.ts');
    git('git mv was.ts moved.ts');
    git('git add -A');
    git('git commit -q -m change');
    shas.change = head();

    git('git checkout -q -b side');
    writeFileSync(join(repo, 'side.ts'), body('side'));
    git('git add -A');
    git('git commit -q -m side');
    git('git checkout -q main');
    writeFileSync(join(repo, 'main.ts'), body('main'));
    git('git add -A');
    git('git commit -q -m main');
    git('git merge -q --no-ff side -m merge');
    shas.merge = head();
  });

  afterAll(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('reports added, modified, deleted and renamed paths', () => {
    const byPath = Object.fromEntries(getCommitNameStatus(repo, shas.change).map(c => [c.path, c]));
    expect(byPath['keep.ts'].status).toBe('M');
    expect(byPath['new file.ts'].status).toBe('A');
    expect(byPath['gone.ts'].status).toBe('D');
    expect(byPath['moved.ts']).toEqual({ status: 'R', path: 'moved.ts', from: 'was.ts', similarity: 100 });
  });

  it('reports a root commit\'s files as added', () => {
    const changes = getCommitNameStatus(repo, shas.root);
    expect(changes.map(c => c.path).sort()).toEqual(['gone.ts', 'keep.ts', 'was.ts']);
    expect(changes.every(c => c.status === 'A')).toBe(true);
  });

  it('diffs a merge against its first parent', () => {
    expect(getCommitNameStatus(repo, shas.merge)).toEqual([{ status: 'A', path: 'side.ts' }]);
  });

  it.each(['HEAD; rm -rf /', '--output=/tmp/x', 'main', ''])('rejects %p without running git', (bad) => {
    expect(getCommitNameStatus(repo, bad)).toEqual([]);
  });

  it('returns [] for an unknown commit or missing repo', () => {
    expect(getCommitNameStatus(repo, 'f'.repeat(40))).toEqual([]);
    expect(getCommitNameStatus('', shas.change)).toEqual([]);
  });
});

describe('parseNameStatusZ', () => {
  it('parses renames, copies and type changes', () => {
    expect(parseNameStatusZ('R087\0a.ts\0b.ts\0C100\0c.ts\0d.ts\0T\0e.ts\0U\0f.ts\0')).toEqual([
      { status: 'R', path: 'b.ts', from: 'a.ts', similarity: 87 },
      { status: 'A', path: 'd.ts' },
      { status: 'M', path: 'e.ts' },
    ]);
  });

  it('returns [] for empty output', () => {
    expect(parseNameStatusZ('')).toEqual([]);
  });
});
