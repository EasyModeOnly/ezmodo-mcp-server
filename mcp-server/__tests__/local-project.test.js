import { jest } from '@jest/globals';

let mockConfig = null;
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  readConfig: async () => mockConfig,
}));

const { localProjectFor } = await import('../lib/local-project.js');

describe('localProjectFor (#3676)', () => {
  afterEach(() => {
    mockConfig = null;
  });

  it('returns the checkout\'s project for its own organization', async () => {
    mockConfig = { projectId: 'proj-1', organizationId: 'org-1' };
    expect(await localProjectFor('org-1')).toBe('proj-1');
  });

  it('returns it when the call names no organization', async () => {
    mockConfig = { projectId: 'proj-1', organizationId: 'org-1' };
    expect(await localProjectFor(undefined)).toBe('proj-1');
  });

  it('returns nothing for another organization', async () => {
    mockConfig = { projectId: 'proj-1', organizationId: 'org-1' };
    expect(await localProjectFor('org-2')).toBeUndefined();
  });

  it('returns nothing without a config (the remote connector)', async () => {
    expect(await localProjectFor('org-1')).toBeUndefined();
  });
});
