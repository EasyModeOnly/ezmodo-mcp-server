import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock child_process
const mockExecSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

// Mock logger
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const { writeActiveSession, clearActiveSession } = await import('../lib/active-session.js');

describe('active-session', () => {
  let tmpDir;
  let configDir;
  let gitDir;
  let originalCwd;

  beforeEach(async () => {
    // Create temp directory with .ezmodo/config.json
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ezmodo-test-'));
    configDir = path.join(tmpDir, '.ezmodo');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, 'config.json'),
      JSON.stringify({ projectId: 'test-project' }),
    );

    // Mock cwd to temp directory
    originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    // A git dir of its own, as a linked worktree has (.git/worktrees/<name>).
    gitDir = path.join(tmpDir, 'gitdir');
    await fs.mkdir(gitDir);

    // One rev-parse answers top level, git dir and branch, a line each.
    mockExecSync.mockReturnValue(`${tmpDir}\n${gitDir}\nfeat/test-branch\n`);
  });

  afterEach(async () => {
    process.cwd = originalCwd;
    mockExecSync.mockReset();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('writeActiveSession', () => {
    it('writes active-session.json with task data', async () => {
      await writeActiveSession({
        taskId: 'task-123',
        taskNumber: 42,
        title: 'Test task',
        epicId: 'epic-456',
        epicNumber: 7,
      });

      const sessionPath = path.join(configDir, 'active-session.json');
      const content = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));

      expect(content.taskId).toBe('task-123');
      expect(content.taskNumber).toBe(42);
      expect(content.title).toBe('Test task');
      expect(content.epicId).toBe('epic-456');
      expect(content.epicNumber).toBe(7);
      expect(content.branch).toBe('feat/test-branch');
      expect(content.worktree).toBe(tmpDir);
      expect(content.agentName).toBe('claude');
      expect(content.startedAt).toBeDefined();
    });

    it('omits optional fields when not provided', async () => {
      await writeActiveSession({
        taskId: 'task-123',
        taskNumber: 42,
        title: 'Test task',
      });

      const sessionPath = path.join(configDir, 'active-session.json');
      const content = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));

      expect(content.taskId).toBe('task-123');
      expect(content.epicId).toBeUndefined();
      expect(content.epicNumber).toBeUndefined();
    });

    it('handles missing git branch gracefully', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not a git repo');
      });

      await writeActiveSession({
        taskId: 'task-123',
        taskNumber: 42,
        title: 'Test task',
      });

      const sessionPath = path.join(configDir, 'active-session.json');
      const content = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));

      expect(content.branch).toBeNull();
      expect(content.worktree).toBeNull();
    });

    // #3195: worktrees under the repo share its untracked .ezmodo/, so the
    // per-repo file alone let parallel worktrees overwrite each other.
    it('also writes a per-worktree copy into the worktree\'s own git dir', async () => {
      await writeActiveSession({ taskId: 'task-123', taskNumber: 42, title: 'Test task' });

      const own = JSON.parse(await fs.readFile(path.join(gitDir, 'ezmodo-active-session.json'), 'utf-8'));
      const legacy = JSON.parse(await fs.readFile(path.join(configDir, 'active-session.json'), 'utf-8'));
      expect(own.taskId).toBe('task-123');
      expect(own.worktree).toBe(tmpDir);
      expect(own.branch).toBe('feat/test-branch');
      expect(legacy).toEqual(own);
    });

    it('asks git for top level, git dir and branch in one call', async () => {
      await writeActiveSession({ taskId: 'task-123', taskNumber: 42, title: 'Test task' });
      expect(mockExecSync).toHaveBeenCalledWith(
        'git rev-parse --show-toplevel --absolute-git-dir --abbrev-ref HEAD',
        expect.anything()
      );
    });

    it('does nothing when no .ezmodo/ directory exists', async () => {
      // Point cwd to a directory without .ezmodo
      const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-'));
      process.cwd = () => emptyDir;

      // Should not throw
      await writeActiveSession({
        taskId: 'task-123',
        taskNumber: 42,
        title: 'Test task',
      });

      await fs.rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe('clearActiveSession', () => {
    it('deletes active-session.json', async () => {
      // Create session file first
      const sessionPath = path.join(configDir, 'active-session.json');
      await fs.writeFile(sessionPath, '{}');

      await clearActiveSession();

      await expect(fs.access(sessionPath)).rejects.toThrow();
    });

    it('deletes the per-worktree copy too', async () => {
      await writeActiveSession({ taskId: 'task-123', taskNumber: 42, title: 'Test task' });
      await clearActiveSession();

      await expect(fs.access(path.join(gitDir, 'ezmodo-active-session.json'))).rejects.toThrow();
      await expect(fs.access(path.join(configDir, 'active-session.json'))).rejects.toThrow();
    });

    it("leaves the shared file alone when it belongs to another worktree (#3195)", async () => {
      const sessionPath = path.join(configDir, 'active-session.json');
      await fs.writeFile(sessionPath, JSON.stringify({ taskId: 'other', worktree: '/elsewhere/wt' }));
      await fs.writeFile(path.join(gitDir, 'ezmodo-active-session.json'), '{"taskId":"mine"}');

      await clearActiveSession();

      expect(JSON.parse(await fs.readFile(sessionPath, 'utf-8')).taskId).toBe('other');
      await expect(fs.access(path.join(gitDir, 'ezmodo-active-session.json'))).rejects.toThrow();
    });

    it('does not throw when file does not exist', async () => {
      // Should not throw
      await clearActiveSession();
    });
  });
});
