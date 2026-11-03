import { jest } from '@jest/globals';

const mockReadConfig = jest.fn();
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  isCacheFresh: jest.fn(),
  findConfigPath: jest.fn(),
  readConfig: mockReadConfig,
  writeConfig: jest.fn(),
  getCachedTags: jest.fn(),
  updateCacheSections: jest.fn(),
}));

const { buildDesignUrl } = await import('../lib/web-url.js');
const { CONFIG } = await import('../config/index.js');

// #3490: agents built design links by hand, from the slug, and the page could
// not open a slug. The URL now comes from the server, in the design's own org.
describe('buildDesignUrl', () => {
  beforeEach(() => {
    mockReadConfig.mockResolvedValue({ organizationId: 'org-1', orgSlug: 'emo', projectSlug: 'ezmodo' });
  });

  it('prefers the slug', async () => {
    expect(await buildDesignUrl({ id: 'd1', slug: 'hero-banner', organizationId: 'org-1' }))
      .toBe(`${CONFIG.webUrl}/emo/designs/hero-banner`);
  });

  it('falls back to the id when the design has no slug', async () => {
    expect(await buildDesignUrl({ id: 'd1', slug: '', organizationId: 'org-1' }))
      .toBe(`${CONFIG.webUrl}/emo/designs/d1`);
  });

  it('builds nothing for a design in another org, rather than a link into the wrong workspace', async () => {
    expect(await buildDesignUrl({ id: 'd1', slug: 'hero', organizationId: 'org-2' })).toBeNull();
    expect(await buildDesignUrl({ id: 'd1', slug: 'hero' })).toBeNull();
  });

  it('builds nothing without a local config (the remote connector)', async () => {
    mockReadConfig.mockResolvedValue(null);
    expect(await buildDesignUrl({ id: 'd1', slug: 'hero', organizationId: 'org-1' })).toBeNull();
  });
});
