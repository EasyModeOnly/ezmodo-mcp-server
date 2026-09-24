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
});
