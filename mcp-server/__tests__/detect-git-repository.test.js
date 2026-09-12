/**
 * Tests for detectGitRepository — the tool that gets an agent from the checkout
 * it is standing in to the ezmodo project (and linked repo) behind it.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const mockExecSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
}));

jest.unstable_mockModule('fs/promises', () => {
  const fns = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    access: jest.fn(async () => {
      throw new Error('ENOENT');
    }),
    appendFile: jest.fn(),
    readdir: jest.fn().mockResolvedValue([]),
    unlink: jest.fn(),
  };
  return { default: fns, ...fns };
});

const mockGetProject = jest.fn();
jest.unstable_mockModule('../handlers/projects.js', () => ({
  getProject: mockGetProject,
}));

const mockListRepositories = jest.fn().mockResolvedValue({ repositories: [] });
jest.unstable_mockModule('../handlers/github.js', () => ({
  listRepositories: mockListRepositories,
}));

jest.unstable_mockModule('../handlers/organizations.js', () => ({
  getOrganization: jest.fn(),
}));

jest.unstable_mockModule('../handlers/components.js', () => ({
  listComponents: jest.fn(),
}));

jest.unstable_mockModule('../handlers/tags.js', () => ({
  listTags: jest.fn(),
}));

jest.unstable_mockModule('../config/index.js', () => ({
  CONFIG: { environment: 'production' },
}));

const { detectGitRepository } = await import('../handlers/git-context.js');

const REMOTE = 'https://github.com/EasyModeOnly/ezmodo.git';

/** A project row shaped the way mcpListProjects actually returns one. */
function ezmodoProject(overrides = {}) {
  return {
    id: 'proj-1',
    name: 'Ezmodo',
    slug: 'ezmodo',
    organizationId: 'org-1',
    gitUrl: REMOTE,
    gitProvider: 'github',
    gitContext: { repositoryUrl: REMOTE, defaultBranch: 'main' },
    ...overrides,
  };
}

/** Answer the three git commands detectGitRepository shells out to. */
function gitRepoAt(remote = REMOTE, branch = 'main') {
  mockExecSync.mockImplementation((cmd) => {
    if (cmd.includes('rev-parse')) return '';
    if (cmd.includes('remote.origin.url')) return `${remote}\n`;
    if (cmd.includes('branch --show-current')) return `${branch}\n`;
    throw new Error(`unexpected command: ${cmd}`);
  });
}

describe('detectGitRepository', () => {
  beforeEach(() => {
    gitRepoAt();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockListRepositories.mockResolvedValue({ repositories: [] });
  });

  // The regression this file exists for: callZephlyAPI unwraps the Go API's
  // {success, data} envelope, so getProject({}) resolves to `{projects: [...]}`
  // with no `success` flag. The old guard tested for one and therefore reported
  // "Failed to fetch accessible projects" on every single call, while holding
  // the projects it had just fetched.
  it('matches a project on an unwrapped list that carries no success flag', async () => {
    mockGetProject.mockResolvedValueOnce({ projects: [ezmodoProject()] });

    const result = await detectGitRepository({ workingDirectory: '/repo' });

    expect(result.remoteUrl).toBe(REMOTE);
    expect(result.currentBranch).toBe('main');
    expect(result.message).toBeUndefined();
    expect(result.matchCount).toBe(1);
    expect(result.matches[0].project.id).toBe('proj-1');
  });

  // The git URL lives on `gitUrl` and `gitContext.repositoryUrl`. Reading a
  // field the API does not return (`gitRepositoryUrl`) made every project fall
  // through the match loop, and the first round of these tests missed it by
  // asserting against the same invented field the code read. One case per real
  // field, so a rename fails here instead of in production.
  it.each([
    ['gitUrl', { gitUrl: REMOTE }],
    ['gitContext.repositoryUrl', { gitContext: { repositoryUrl: REMOTE, defaultBranch: 'main' } }],
    ['legacy gitRepositoryUrl', { gitRepositoryUrl: REMOTE }],
  ])('matches on %s', async (_label, gitFields) => {
    mockGetProject.mockResolvedValueOnce({
      projects: [{ id: 'proj-1', name: 'Ezmodo', slug: 'ezmodo', ...gitFields }],
    });

    const result = await detectGitRepository({ workingDirectory: '/repo' });

    expect(result.matchCount).toBe(1);
    expect(result.matches[0].project.gitRepositoryUrl).toBe(REMOTE);
  });

  it('reports the default branch from gitContext', async () => {
    mockGetProject.mockResolvedValueOnce({ projects: [ezmodoProject()] });

    const result = await detectGitRepository({ workingDirectory: '/repo' });

    expect(result.matches[0].project.gitBranch).toBe('main');
  });

  it('ignores projects whose remote does not match', async () => {
    mockGetProject.mockResolvedValueOnce({
      projects: [
        { id: 'proj-1', name: 'Other', gitUrl: 'https://github.com/other/thing' },
        { id: 'proj-2', name: 'No git configured' },
      ],
    });

    const result = await detectGitRepository({ workingDirectory: '/repo' });

    expect(result.matches).toEqual([]);
    expect(result.matchCount).toBe(0);
    // No match is not a failure — say nothing rather than blaming the fetch.
    expect(result.message).toBeUndefined();
  });

  it('sorts matches by confidence, highest first', async () => {
    mockGetProject.mockResolvedValueOnce({
      projects: [
        { id: 'same-name', name: 'Fork', gitUrl: 'https://gitlab.com/someone/ezmodo' },
        { id: 'exact', name: 'Ezmodo', gitUrl: REMOTE },
      ],
    });

    const result = await detectGitRepository({ workingDirectory: '/repo' });

    expect(result.matches.map((m) => m.project.id)).toEqual(['exact', 'same-name']);
    expect(result.matches[0].confidence).toBeGreaterThan(result.matches[1].confidence);
  });

  it('reports the API error when the project fetch actually fails', async () => {
    mockGetProject.mockRejectedValueOnce(new Error('API key does not have access'));

    const result = await detectGitRepository({ workingDirectory: '/repo' });

    expect(result.matches).toEqual([]);
    expect(result.message).toContain('API key does not have access');
    // The git facts still came back — a failed lookup must not lose them.
    expect(result.remoteUrl).toBe(REMOTE);
    expect(result.currentBranch).toBe('main');
  });

  it('reports a malformed project list without throwing', async () => {
    mockGetProject.mockResolvedValueOnce({ unexpected: true });

    const result = await detectGitRepository({ workingDirectory: '/repo' });

    expect(result.matches).toEqual([]);
    expect(result.message).toBe('Failed to fetch accessible projects');
  });

  it('returns early when the directory is not a git repository', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });

    const result = await detectGitRepository({ workingDirectory: '/tmp' });

    expect(result.isGitRepository).toBe(false);
    expect(mockGetProject).not.toHaveBeenCalled();
  });

  describe('linked repositories', () => {
    const PROJECT = ezmodoProject();

    it('attaches the matched project\'s repositories, repoId and all', async () => {
      mockGetProject.mockResolvedValueOnce({ projects: [PROJECT] });
      mockListRepositories.mockResolvedValueOnce({
        repositories: [
          {
            id: 'repo-1',
            installationId: '12345678',
            fullName: 'EasyModeOnly/ezmodo',
            repoId: '12345678:EasyModeOnly/ezmodo',
            installationStatus: 'active',
          },
        ],
      });

      const result = await detectGitRepository({ workingDirectory: '/repo' });

      expect(mockListRepositories).toHaveBeenCalledWith({ projectId: 'proj-1' });
      expect(result.matches[0].repositories[0].repoId).toBe('12345678:EasyModeOnly/ezmodo');
    });

    it('reports an empty list when the project has no GitHub integration', async () => {
      mockGetProject.mockResolvedValueOnce({ projects: [PROJECT] });
      mockListRepositories.mockRejectedValueOnce(new Error('GitHub integration is not configured'));

      const result = await detectGitRepository({ workingDirectory: '/repo' });

      // A project without an integration is the normal case, not a failure —
      // it must not cost the caller the project match it did find.
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].repositories).toEqual([]);
    });

    it('does not look up repositories when nothing matched', async () => {
      mockGetProject.mockResolvedValueOnce({ projects: [] });

      await detectGitRepository({ workingDirectory: '/repo' });

      expect(mockListRepositories).not.toHaveBeenCalled();
    });
  });
});
