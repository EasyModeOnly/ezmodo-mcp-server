import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * E-297 #3352: cleanup matches worktrees by a task's gitContext.branchName,
 * which any org member can write. A forged "completed" task naming someone's
 * in-progress branch used to get that worktree force-removed, uncommitted work
 * and all. Real git here: the guarantee is git's own refusal without --force.
 */

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCallEzmodoAPI }));

const { manageWorktree } = await import('../lib/worktree-tools.js');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

let tmp;
let repo;

function addWorktree(branch) {
  const wt = path.join(tmp, branch.replace(/\//g, '-'));
  git(repo, 'worktree', 'add', '-q', '-b', branch, wt);
  return wt;
}

function apiWith(tasks) {
  mockCallEzmodoAPI.mockImplementation(async (endpoint, params) => {
    if (endpoint === 'mcpGetProjectContext') return { project: { gitContext: { repositoryPath: repo } } };
    if (endpoint === 'mcpSearchTasks') return { tasks: params.status === 'completed' ? tasks : [] };
    return { success: true };
  });
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-cleanup-'));
  repo = path.join(tmp, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  mockCallEzmodoAPI.mockReset();
});

describe('manage_worktree cleanup never destroys work (E-297)', () => {
  it('leaves a worktree with uncommitted changes in place, even for a completed task', async () => {
    const wt = addWorktree('feat/victim');
    fs.writeFileSync(path.join(wt, 'wip.txt'), 'unsaved work');
    apiWith([{ id: 't-forged', title: 'Forged', gitContext: { branchName: 'feat/victim' } }]);

    const result = await manageWorktree({ action: 'cleanup', projectId: 'p1' });

    expect(result.results[0].action).toBe('skipped');
    expect(result.results[0].reason).toMatch(/uncommitted/);
    expect(fs.readFileSync(path.join(wt, 'wip.txt'), 'utf-8')).toBe('unsaved work');
    expect(mockCallEzmodoAPI).not.toHaveBeenCalledWith('mcpUpdateTask', expect.anything());
  });

  it('removes a clean worktree and keeps its unmerged branch', async () => {
    const wt = addWorktree('feat/done');
    fs.writeFileSync(path.join(wt, 'f.txt'), 'x');
    git(wt, 'add', 'f.txt');
    git(wt, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'work');
    apiWith([{ id: 't1', title: 'Done', gitContext: { branchName: 'feat/done', baseBranch: 'main' } }]);

    const result = await manageWorktree({ action: 'cleanup', projectId: 'p1', deleteBranches: true });

    expect(result.results[0].action).toBe('removed');
    expect(fs.existsSync(wt)).toBe(false);
    expect(git(repo, 'branch', '--list', 'feat/done')).toContain('feat/done');
  });

  it('does not discover shared epic branches automatically', async () => {
    const wt = addWorktree('epic/shared');
    apiWith([{ id: 't2', title: 'One of many', gitContext: { branchName: 'epic/shared', isEpicBranch: true } }]);

    const result = await manageWorktree({ action: 'cleanup', projectId: 'p1' });

    expect(result.results).toEqual([]);
    expect(fs.existsSync(wt)).toBe(true);
  });
});
