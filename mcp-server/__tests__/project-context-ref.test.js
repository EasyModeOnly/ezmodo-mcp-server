import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// E-335 #4015: get_current_project_context shows the project's P: ref, cached
// per project id in the config so a monorepo never reports one project's ref
// for another.
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { getCurrentProjectContext, cachedProjectRef } = await import('../handlers/git-context.js');

async function withConfig(config, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ezmodo-ref-'));
  await fs.mkdir(path.join(dir, '.ezmodo'));
  const configPath = path.join(dir, '.ezmodo', 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config));
  try {
    return await fn(dir, configPath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('project ref in get_current_project_context', () => {
  it('cachedProjectRef reads the active project only, null when absent', () => {
    const config = { projectRefs: { p1: 'P:2601' } };
    expect(cachedProjectRef(config, 'p1')).toBe('P:2601');
    expect(cachedProjectRef(config, 'p2')).toBeNull();
    expect(cachedProjectRef({}, 'p1')).toBeNull();
    expect(cachedProjectRef(null, 'p1')).toBeNull();
  });

  it('returns the cached ref on a fresh cache', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ items: [] });
    await withConfig({
      projectId: 'p1', projectName: 'P', organizationId: 'o1', orgSlug: 'emo',
      lastUpdatedAt: new Date().toISOString(), tags: [], projectRefs: { p1: 'P:2601' },
    }, async (dir) => {
      const ctx = await getCurrentProjectContext({ workingDirectory: dir });
      expect(ctx.projectRef).toBe('P:2601');
    });
  });

  it('is null on a fresh cache written before refs existed', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ items: [] });
    await withConfig({
      projectId: 'p1', projectName: 'P', organizationId: 'o1', orgSlug: 'emo',
      lastUpdatedAt: new Date().toISOString(), tags: [],
    }, async (dir) => {
      const ctx = await getCurrentProjectContext({ workingDirectory: dir });
      expect(ctx.projectRef).toBeNull();
    });
  });

  it('fetches the ref on refresh and caches it under the project id', async () => {
    mockCallEzmodoAPI.mockImplementation(async (name) => {
      switch (name) {
        case 'mcpGetProjectContext':
          return { projectId: 'p1', ref: 'P:2603', settings: {} };
        case 'mcpListOrganizations':
          return { organizations: [{ id: 'o1', name: 'Org' }] };
        default:
          return { items: [], tags: [], organizations: [{ id: 'o1', name: 'Org' }] };
      }
    });
    await withConfig({
      projectId: 'p1', projectName: 'P', organizationId: 'o1', orgSlug: 'emo', tags: [],
    }, async (dir, configPath) => {
      const ctx = await getCurrentProjectContext({ workingDirectory: dir });
      expect(ctx.projectRef).toBe('P:2603');
      const written = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      expect(written.projectRefs).toEqual({ p1: 'P:2603' });
    });
  });
});
