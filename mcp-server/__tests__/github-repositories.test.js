/**
 * Tests for list_repositories — the only path an agent has to a repoId.
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { listRepositories } = await import('../handlers/github.js');
const { GITHUB_TOOLS } = await import('../tools/github.js');

describe('listRepositories', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the linked repositories with their repoIds', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({
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

    const result = await listRepositories({ projectId: 'proj-1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListRepositories', { projectId: 'proj-1' });
    expect(result.repositories[0].repoId).toBe('12345678:EasyModeOnly/ezmodo');
  });
});

describe('GitHub tool definitions', () => {
  const tool = (name) => GITHUB_TOOLS.find((t) => t.name === name);

  it('exposes list_repositories, requiring only a projectId', () => {
    const t = tool('list_repositories');
    expect(t).toBeDefined();
    expect(t.inputSchema.required).toEqual(['projectId']);
  });

  // The API rejects every manage_pull_request action without a projectId; the
  // schema used to describe it as needed only for suggest_reviewers, which read
  // as optional everywhere else.
  it('requires projectId on manage_pull_request', () => {
    expect(tool('manage_pull_request').inputSchema.required).toContain('projectId');
  });

  it('points repoId at the tool that produces one', () => {
    const repoId = tool('manage_pull_request').inputSchema.properties.repoId;
    expect(repoId.description).toContain('list_repositories');
  });

  // E-310 #3497: the tools are provider-aware, so their descriptions must say
  // which providers they cover and what webhook-only means for the caller.
  it('names both providers and the instance on list_repositories', () => {
    const d = tool('list_repositories').description;
    expect(d).toContain('Forgejo/Gitea');
    expect(d).toContain('connectionId:owner/repo');
    expect(d).toContain('`instance`');
    expect(d).toContain('webhook_only');
  });

  it('tells manage_pull_request callers what webhook-only and unsupported mean', () => {
    const d = tool('manage_pull_request').description;
    expect(d).toContain('Forgejo/Gitea');
    expect(d).toContain(
      'this repository is connected in webhook-only mode, so EzModo can\'t reach its server; act on the server directly',
    );
    expect(d).toContain('capability_unsupported');
  });
});
