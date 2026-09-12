import { execSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { getCommitFiles } from '../lib/git-helpers.js';

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
