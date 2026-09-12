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
  let zephlyDir;
  let originalCwd;

  beforeEach(async () => {
    // Create temp directory with .zephly/config.json
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zephly-test-'));
    zephlyDir = path.join(tmpDir, '.zephly');
    await fs.mkdir(zephlyDir, { recursive: true });
    await fs.writeFile(
      path.join(zephlyDir, 'config.json'),
      JSON.stringify({ projectId: 'test-project' }),
    );

    // Mock cwd to temp directory
    originalCwd = process.cwd;
    process.cwd = () => tmpDir;

    // Mock git branch
    mockExecSync.mockReturnValue('feat/test-branch\n');
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

      const sessionPath = path.join(zephlyDir, 'active-session.json');
      const content = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));

      expect(content.taskId).toBe('task-123');
      expect(content.taskNumber).toBe(42);
      expect(content.title).toBe('Test task');
      expect(content.epicId).toBe('epic-456');
      expect(content.epicNumber).toBe(7);
      expect(content.branch).toBe('feat/test-branch');
      expect(content.agentName).toBe('claude');
      expect(content.startedAt).toBeDefined();
    });

    it('omits optional fields when not provided', async () => {
      await writeActiveSession({
        taskId: 'task-123',
        taskNumber: 42,
        title: 'Test task',
      });

      const sessionPath = path.join(zephlyDir, 'active-session.json');
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

      const sessionPath = path.join(zephlyDir, 'active-session.json');
      const content = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));

      expect(content.branch).toBeNull();
    });

    it('does nothing when no .zephly/ directory exists', async () => {
      // Point cwd to a directory without .zephly
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
      const sessionPath = path.join(zephlyDir, 'active-session.json');
      await fs.writeFile(sessionPath, '{}');

      await clearActiveSession();

      await expect(fs.access(sessionPath)).rejects.toThrow();
    });

    it('does not throw when file does not exist', async () => {
      // Should not throw
      await clearActiveSession();
    });
  });
});
