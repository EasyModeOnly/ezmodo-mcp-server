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
const mockCallEzmodoAPI = jest.fn();
const mockGetCommitFiles = jest.fn();
const mockGetRepositoryRoot = jest.fn();
const mockGetCommitNameStatus = jest.fn();
const mockReadConfig = jest.fn();

jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/git-helpers.js', () => ({
  getCommitFiles: mockGetCommitFiles,
  getRepositoryRoot: mockGetRepositoryRoot,
  getCommitNameStatus: mockGetCommitNameStatus,
}));
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  readConfig: mockReadConfig,
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
    mockCallEzmodoAPI.mockResolvedValue({ commit: { sha: SHA } });
    mockGetRepositoryRoot.mockReturnValue('/repo');
    mockGetCommitNameStatus.mockReturnValue([]);
    mockReadConfig.mockResolvedValue({ projectId: 'proj-1' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('derives the changed files when the caller omits them', async () => {
    mockGetCommitFiles.mockReturnValue(['api/a.go', 'web/b.tsx']);

    await linkCommit();

    expect(mockGetCommitFiles).toHaveBeenCalledWith('/repo', SHA);
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith(
      'mcpLinkCommitToTask',
      expect.objectContaining({ files: ['api/a.go', 'web/b.tsx'] })
    );
  });

  it('leaves caller-supplied files alone and does not consult git', async () => {
    await linkCommit({ files: ['only/this.go'] });

    expect(mockGetCommitFiles).not.toHaveBeenCalled();
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith(
      'mcpLinkCommitToTask',
      expect.objectContaining({ files: ['only/this.go'] })
    );
  });

  it('derives when the caller passes an empty array', async () => {
    mockGetCommitFiles.mockReturnValue(['api/a.go']);

    await linkCommit({ files: [] });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith(
      'mcpLinkCommitToTask',
      expect.objectContaining({ files: ['api/a.go'] })
    );
  });

  it('still links the commit when the repo cannot be found', async () => {
    mockGetRepositoryRoot.mockReturnValue(null);

    const result = await linkCommit();

    expect(mockGetCommitFiles).not.toHaveBeenCalled();
    expect(result.commit.sha).toBe(SHA);
    expect(mockCallEzmodoAPI.mock.calls[0][1].files).toBeUndefined();
  });

  it('still links the commit when git throws', async () => {
    mockGetCommitFiles.mockImplementation(() => {
      throw new Error('not a git repository');
    });

    const result = await linkCommit();

    expect(result.commit.sha).toBe(SHA);
    expect(mockCallEzmodoAPI.mock.calls[0][1].files).toBeUndefined();
  });

  it('sends no files key when the commit changed nothing (e.g. a merge)', async () => {
    mockGetCommitFiles.mockReturnValue([]);

    await linkCommit();

    expect(mockCallEzmodoAPI.mock.calls[0][1].files).toBeUndefined();
  });
});

/**
 * The API holds the only copy of the context manifest, and nothing regenerates
 * it on push. link_commit is the step every agent already takes after every
 * commit, so it carries the commit's effect on the manifest too — and must
 * never let that fail the link.
 */
describe('link_commit manifest update', () => {
  const apply = () => mockCallEzmodoAPI.mock.calls.find(([name]) => name === 'mcpApplyManifestChanges');

  beforeEach(() => {
    mockGetRepositoryRoot.mockReturnValue('/repo');
    mockGetCommitFiles.mockReturnValue(['api/a.go']);
    mockReadConfig.mockResolvedValue({ projectId: 'proj-1' });
    mockGetCommitNameStatus.mockReturnValue([
      { status: 'A', path: 'api/new.go' },
      { status: 'M', path: 'api/old.go' },
      { status: 'D', path: 'api/gone.go' },
      { status: 'R', path: 'api/moved.go', from: 'api/was.go', similarity: 100 },
      { status: 'M', path: 'package-lock.json' },
    ]);
    mockCallEzmodoAPI.mockImplementation(async (name) => {
      if (name === 'mcpApplyManifestChanges') {
        return {
          created: ['api/new.go'],
          updated: ['api/old.go'],
          deleted: ['api/gone.go'],
          renamed: [{ from: 'api/was.go', to: 'api/moved.go' }],
          notFound: [],
          needsSummary: ['api/new.go'],
          manifestMissing: false,
        };
      }
      return { commit: { sha: SHA } };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('links first, then sends the commit\'s delta to the manifest', async () => {
    const result = await linkCommit();

    expect(mockCallEzmodoAPI.mock.calls[0][0]).toBe('mcpLinkCommitToTask');
    expect(mockGetCommitNameStatus).toHaveBeenCalledWith('/repo', SHA);
    expect(apply()[1]).toEqual({
      projectId: 'proj-1',
      commitSha: SHA,
      upserts: [{ path: 'api/new.go' }, { path: 'api/old.go' }],
      deletes: ['api/gone.go'],
      renames: [{ from: 'api/was.go', to: 'api/moved.go' }],
    });
    expect(result.commit.sha).toBe(SHA);
    expect(result.manifest).toEqual(expect.objectContaining({
      created: ['api/new.go'],
      deleted: ['api/gone.go'],
      renamed: [{ from: 'api/was.go', to: 'api/moved.go' }],
      needsSummary: ['api/new.go'],
      reviewSummary: ['api/old.go'],
      instruction: expect.stringContaining('update_manifest_entries'),
    }));
  });

  it('prefers an explicit projectId over the repo config', async () => {
    await linkCommit({ projectId: 'proj-explicit' });

    expect(apply()[1].projectId).toBe('proj-explicit');
  });

  it('does not forward updateManifest to the link call', async () => {
    await linkCommit({ updateManifest: true });

    expect(mockCallEzmodoAPI.mock.calls[0][1]).not.toHaveProperty('updateManifest');
  });

  it('skips the manifest entirely with updateManifest:false', async () => {
    const result = await linkCommit({ updateManifest: false });

    expect(apply()).toBeUndefined();
    expect(result.manifest).toBeUndefined();
  });

  it('still derives the manifest delta from git when the caller passes files', async () => {
    await linkCommit({ files: ['only/this.go'] });

    expect(mockGetCommitNameStatus).toHaveBeenCalledWith('/repo', SHA);
    expect(apply()).toBeDefined();
  });

  it('reports a missing manifest as skipped', async () => {
    mockCallEzmodoAPI.mockImplementation(async (name) => (
      name === 'mcpApplyManifestChanges' ? { manifestMissing: true } : { commit: { sha: SHA } }
    ));

    const result = await linkCommit();

    expect(result.manifest).toEqual({ skipped: expect.stringContaining('no manifest yet') });
  });

  it('reports a manifest error without failing the link', async () => {
    mockCallEzmodoAPI.mockImplementation(async (name) => {
      if (name === 'mcpApplyManifestChanges') throw new Error('boom');
      return { commit: { sha: SHA } };
    });

    const result = await linkCommit();

    expect(result.commit.sha).toBe(SHA);
    expect(result.manifest).toEqual({ error: 'boom' });
  });

  it('skips when no project can be resolved', async () => {
    mockReadConfig.mockResolvedValue(null);

    const result = await linkCommit();

    expect(apply()).toBeUndefined();
    expect(result.manifest.skipped).toBeDefined();
  });

  it('makes no manifest call when the commit touched nothing in scope', async () => {
    mockGetCommitNameStatus.mockReturnValue([{ status: 'M', path: 'package-lock.json' }]);

    const result = await linkCommit();

    expect(apply()).toBeUndefined();
    expect(result.manifest.skipped).toBeDefined();
  });
});
