import { jest } from '@jest/globals';

/**
 * E-225 / #2204: `link_commit` accepts a `files` array and callers routinely
 * omit it. A task with a commit but no files is invisible to auto-linking
 * forever — the engine has no paths to resolve — and 359 of saltpig's 1224
 * commit-carrying tasks were in exactly that state.
 *
 * The commit's file set is a fact in the repository, so it gets derived rather
 * than demanded. These tests pin the three things that make that safe: the
 * caller still wins, derivation is skipped when unnecessary, and nothing about
 * it can fail the commit link.
 */
const mockCallZephlyAPI = jest.fn();
const mockGetCommitFiles = jest.fn();
const mockGetRepositoryRoot = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));
jest.unstable_mockModule('../lib/git-helpers.js', () => ({
  getCommitFiles: mockGetCommitFiles,
  getRepositoryRoot: mockGetRepositoryRoot,
}));
jest.unstable_mockModule('../lib/active-session.js', () => ({
  writeActiveSession: jest.fn(),
  clearActiveSession: jest.fn(),
}));
jest.unstable_mockModule('../lib/auto-assign.js', () => ({
  resolveTaskAutoAssign: jest.fn(),
}));
jest.unstable_mockModule('../lib/web-url.js', () => ({
  buildTaskUrl: jest.fn(),
}));
jest.unstable_mockModule('../handlers/context-manifest.js', () => ({
  getContext: jest.fn(),
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { manageTask } = await import('../handlers/tasks.js');

const SHA = 'a'.repeat(40);

function linkCommit(extra = {}) {
  return manageTask({
    action: 'link_commit',
    taskId: 'task-1',
    sha: SHA,
    message: 'feat: something',
    author: 'J-Monti',
    ...extra,
  });
}

describe('link_commit file derivation', () => {
  beforeEach(() => {
    mockCallZephlyAPI.mockResolvedValue({ commit: { sha: SHA } });
    mockGetRepositoryRoot.mockReturnValue('/repo');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('derives the changed files when the caller omits them', async () => {
    mockGetCommitFiles.mockReturnValue(['api/a.go', 'web/b.tsx']);

    await linkCommit();

    expect(mockGetCommitFiles).toHaveBeenCalledWith('/repo', SHA);
    expect(mockCallZephlyAPI).toHaveBeenCalledWith(
      'mcpLinkCommitToTask',
      expect.objectContaining({ files: ['api/a.go', 'web/b.tsx'] })
    );
  });

  it('leaves caller-supplied files alone and does not consult git', async () => {
    await linkCommit({ files: ['only/this.go'] });

    expect(mockGetCommitFiles).not.toHaveBeenCalled();
    expect(mockCallZephlyAPI).toHaveBeenCalledWith(
      'mcpLinkCommitToTask',
      expect.objectContaining({ files: ['only/this.go'] })
    );
  });

  it('derives when the caller passes an empty array', async () => {
    mockGetCommitFiles.mockReturnValue(['api/a.go']);

    await linkCommit({ files: [] });

    expect(mockCallZephlyAPI).toHaveBeenCalledWith(
      'mcpLinkCommitToTask',
      expect.objectContaining({ files: ['api/a.go'] })
    );
  });

  it('still links the commit when the repo cannot be found', async () => {
    mockGetRepositoryRoot.mockReturnValue(null);

    const result = await linkCommit();

    expect(mockGetCommitFiles).not.toHaveBeenCalled();
    expect(result.commit.sha).toBe(SHA);
    expect(mockCallZephlyAPI.mock.calls[0][1].files).toBeUndefined();
  });

  it('still links the commit when git throws', async () => {
    mockGetCommitFiles.mockImplementation(() => {
      throw new Error('not a git repository');
    });

    const result = await linkCommit();

    expect(result.commit.sha).toBe(SHA);
    expect(mockCallZephlyAPI.mock.calls[0][1].files).toBeUndefined();
  });

  it('sends no files key when the commit changed nothing (e.g. a merge)', async () => {
    mockGetCommitFiles.mockReturnValue([]);

    await linkCommit();

    expect(mockCallZephlyAPI.mock.calls[0][1].files).toBeUndefined();
  });
});
