/**
 * getManifestSource — which manifest answers a context request.
 *
 * The local manifest describes the working tree it sits in, so it answers for
 * exactly one project. Serving it for a DIFFERENT project is the worst possible
 * failure mode: an authoritative-looking answer entirely about the wrong
 * codebase (an agent in the ezmodo repo asking about Saltpig got ezmodo's files).
 */
import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const LOCAL_PROJECT_ID = 'ezmodo-project-id';
const MOCK_MANIFEST = { metadata: { projectName: 'Ezmodo', entryCount: 0 }, entries: [] };

let configPathMock;
let readConfigMock;

jest.unstable_mockModule('../lib/local-cache.js', () => ({
  findConfigPath: (...args) => configPathMock(...args),
  readConfig: (...args) => readConfigMock(...args),
}));

const { getManifestSource, reloadManifest } = await import('../lib/manifest-loader.js');

/** Build a repo root on disk, optionally holding a local manifest. */
async function makeRepo({ withManifest }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ezmodo-manifest-'));
  await fs.mkdir(path.join(root, '.ezmodo', 'manifest'), { recursive: true });
  if (withManifest) {
    await fs.writeFile(
      path.join(root, '.ezmodo', 'manifest', 'manifest.json'),
      JSON.stringify(MOCK_MANIFEST)
    );
  }
  configPathMock = jest.fn(async () => path.join(root, '.ezmodo', 'config.json'));
  await reloadManifest();
  return root;
}

beforeEach(async () => {
  readConfigMock = jest.fn(async () => ({ projectId: LOCAL_PROJECT_ID }));
  await makeRepo({ withManifest: true });
});

describe('getManifestSource', () => {
  it("serves the local manifest when the caller asks for this repo's project", async () => {
    const source = await getManifestSource(LOCAL_PROJECT_ID);
    expect(source.source).toBe('local');
    expect(source.manifest.metadata.projectName).toBe('Ezmodo');
  });

  it('serves the local manifest when no project is named', async () => {
    const source = await getManifestSource(undefined);
    expect(source.source).toBe('local');
  });

  it('goes remote for a DIFFERENT project even though a local manifest exists', async () => {
    const source = await getManifestSource('saltpig-project-id');
    expect(source).toEqual({ source: 'remote', projectId: 'saltpig-project-id' });
  });

  it('goes remote when the working tree has no configured project to vouch for its manifest', async () => {
    readConfigMock = jest.fn(async () => null);
    const source = await getManifestSource('saltpig-project-id');
    expect(source).toEqual({ source: 'remote', projectId: 'saltpig-project-id' });
  });

  it('falls back to the configured project when there is no local manifest', async () => {
    await makeRepo({ withManifest: false });
    const source = await getManifestSource(undefined);
    expect(source).toEqual({ source: 'remote', projectId: LOCAL_PROJECT_ID });
  });

  it('throws when there is neither a local manifest nor any project to query', async () => {
    await makeRepo({ withManifest: false });
    readConfigMock = jest.fn(async () => null);
    await expect(getManifestSource(undefined)).rejects.toThrow(/No local manifest found/);
  });
});
