import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * E-297 #3355: a project's gitContext (repositoryPath, defaultWorktreePath,
 * defaultBranch) and a task's gitContext.worktreePath come from the API and
 * any org member can write them. None may choose where git runs or what it
 * fetches.
 */

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCallEzmodoAPI }));

const { manageWorktree } = await import('../lib/worktree-tools.js');
const { assertBranchName } = await import('../lib/git-helpers.js');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

let tmp;
let repo;
let elsewhere;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-api-')));
  repo = path.join(tmp, 'repo');
  elsewhere = path.join(tmp, 'elsewhere');
  fs.mkdirSync(repo);
  fs.mkdirSync(elsewhere);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  git(elsewhere, 'init', '-q', '-b', 'main');
  jest.spyOn(process, 'cwd').mockReturnValue(repo);
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  mockCallEzmodoAPI.mockReset();
  jest.restoreAllMocks();
});

describe('assertBranchName', () => {
  it.each(['main', 'feat/x-1', 'release/1.2.0', 'origin/main'])('accepts %j', (name) => {
    expect(assertBranchName(name, 'base branch')).toBe(name);
  });

  it.each(['+refs/heads/evil:refs/heads/main', 'a:b', '-x', 'a..b', 'a b', 'a~1', 'a^', 'a@{0}', 'a*', ''])(
    'refuses %j', (name) => {
      expect(() => assertBranchName(name, 'base branch')).toThrow(/Invalid base branch/);
    },
  );
});

describe('API gitContext never steers git (E-297)', () => {
  it('creates a task worktree in the checkout it runs in, not the API repositoryPath', async () => {
    mockCallEzmodoAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpGetTask') return { task: { id: 't1', taskNumber: 1, title: 'T', projectId: 'p1' } };
      if (endpoint === 'mcpGetProjectContext') {
        return { project: { gitContext: { repositoryPath: elsewhere, defaultWorktreePath: '../../../../tmp/escape' } } };
      }
      return { success: true };
    });

    const result = await manageWorktree({ action: 'create_task', taskId: 't1', baseBranch: 'main' });

    expect(result.success).toBe(true);
    // Beside the repo (the built-in default), not wherever the API pointed.
    expect(path.dirname(path.dirname(result.worktreePath))).toBe(tmp);
    expect(git(elsewhere, 'worktree', 'list')).not.toContain('worktrees');
  });

  it('refuses a refspec smuggled in as the project default branch', async () => {
    mockCallEzmodoAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpGetTask') return { task: { id: 't2', taskNumber: 2, title: 'T', projectId: 'p1' } };
      if (endpoint === 'mcpGetProjectContext') {
        return { project: { gitContext: { defaultBranch: '+refs/heads/evil:refs/heads/main' } } };
      }
      return { success: true };
    });

    const result = await manageWorktree({ action: 'create_task', taskId: 't2' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a branch name/);
  });

  it('sync_status refuses a task worktreePath that is not one of this checkout\'s worktrees', async () => {
    mockCallEzmodoAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpGetTask') {
        return { task: { id: 't3', gitContext: { branchName: 'main', baseBranch: 'main', worktreePath: elsewhere } } };
      }
      return { success: true };
    });

    const result = await manageWorktree({ action: 'sync_status', taskId: 't3' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not a worktree of this repository/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalledWith('mcpUpdateTask', expect.anything());
  });
});
