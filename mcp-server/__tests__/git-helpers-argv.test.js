import { execSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  branchExists,
  createBranch,
  createWorktree,
  deleteBranch,
  execGit,
  getCurrentBranch,
} from '../lib/git-helpers.js';

/**
 * The shell is gone from execGit (#2614 step 5). These run against a REAL
 * repository, because the whole claim is about what a spawned git actually
 * does with an argument — a mocked child_process would assert only that the
 * test and the code agree with each other.
 */
describe('git-helpers without a shell', () => {
  let repo;
  let marker;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'ezmodo-argv-'));
    marker = join(repo, 'pwned');

    const git = (cmd) => execSync(cmd, { cwd: repo, stdio: 'pipe' });
    git('git init -q');
    git('git config user.email test@example.com');
    git('git config user.name Test');
    writeFileSync(join(repo, 'README.md'), 'base\n');
    git('git add -A');
    git('git commit -q -m base');
  });

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('treats shell metacharacters in a branch name as part of the name', () => {
    // The exact payload from #2614: under execSync this ran `touch`.
    const payload = `x; touch ${marker}`;

    expect(branchExists(repo, payload)).toEqual({ local: false, remote: false });
    expect(existsSync(marker)).toBe(false);
  });

  it('does not run a command substitution smuggled into a branch name', () => {
    expect(() => createBranch(repo, `$(touch ${marker})`, 'HEAD')).toThrow();
    expect(existsSync(marker)).toBe(false);
  });

  it('refuses a branch name that git would read as an option', () => {
    expect(() => createBranch(repo, '--help', 'HEAD')).toThrow(/Invalid branch name/);
    expect(() => deleteBranch(repo, '-D')).toThrow(/Invalid branch name/);
    expect(() => createWorktree(repo, '--upload-pack=touch', 'main')).toThrow(
      /Invalid worktree path/
    );
  });

  it('still does the ordinary thing with an ordinary name', () => {
    createBranch(repo, 'feature/a-b_c.1', 'HEAD');
    expect(branchExists(repo, 'feature/a-b_c.1').local).toBe(true);
    expect(getCurrentBranch(repo)).not.toBe('feature/a-b_c.1');
  });

  it('handles a path containing spaces, which used to need manual quoting', () => {
    const worktree = join(repo, '..', `ezmodo wt ${Date.now()}`);
    try {
      createWorktree(repo, worktree, 'wt-branch', true);
      expect(existsSync(join(worktree, 'README.md'))).toBe(true);
    } finally {
      rmSync(worktree, { recursive: true, force: true });
    }
  });

  it('rejects a command string, so an old-style caller fails loudly', () => {
    expect(() => execGit('git status', repo)).toThrow(TypeError);
  });
});
