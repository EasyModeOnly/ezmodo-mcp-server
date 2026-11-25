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

const {
  apiWebUrl, buildTaskUrl, buildEpicUrl, buildGoalUrl, buildMilestoneUrl, buildDesignUrl,
} = await import('../lib/web-url.js');
const { CONFIG } = await import('../config/index.js');

// #4059: the API builds links from one route table and returns webUrl on
// every entity with a ref; these builders are a thin layer over it.
describe('web-url builders', () => {
  beforeEach(() => {
    mockReadConfig.mockResolvedValue({ organizationId: 'org-1', orgSlug: 'emo', projectSlug: 'ezmodo' });
  });

  it('return the API\'s webUrl when the entity carries one', async () => {
    const api = 'https://ezmodo.com/emo/projects/web/tasks/42';
    expect(await buildTaskUrl(42, { webUrl: api })).toBe(api);
    expect(await buildEpicUrl(7, { webUrl: api })).toBe(api);
    expect(await buildGoalUrl('g1', { webUrl: api })).toBe(api);
    expect(await buildMilestoneUrl('v1', { webUrl: api })).toBe(api);
    expect(await buildDesignUrl({ id: 'd1', organizationId: 'org-2', webUrl: api })).toBe(api);
  });

  it('build the same URLs as before when the API sent none', async () => {
    expect(await buildTaskUrl(42)).toBe(`${CONFIG.webUrl}/emo/projects/ezmodo/tasks/42`);
    expect(await buildTaskUrl(42, { taskNumber: 42 })).toBe(`${CONFIG.webUrl}/emo/projects/ezmodo/tasks/42`);
    expect(await buildEpicUrl(7)).toBe(`${CONFIG.webUrl}/emo/projects/ezmodo/epics/7`);
    expect(await buildGoalUrl('g1')).toBe(`${CONFIG.webUrl}/emo/goals/g1`);
    expect(await buildMilestoneUrl('v1-3')).toBe(`${CONFIG.webUrl}/emo/projects/ezmodo/milestones/v1-3`);
  });

  it('build nothing without a number, an API link or a local config', async () => {
    expect(await buildTaskUrl(undefined)).toBeNull();
    mockReadConfig.mockResolvedValue(null);
    expect(await buildTaskUrl(42)).toBeNull();
    // The remote connector has no local config, and gets the API's link.
    expect(await buildTaskUrl(42, { webUrl: 'https://ezmodo.com/x' })).toBe('https://ezmodo.com/x');
  });

  it('apiWebUrl ignores anything that is not a non-empty string', () => {
    expect(apiWebUrl(null)).toBeNull();
    expect(apiWebUrl({ webUrl: '' })).toBeNull();
    expect(apiWebUrl({ webUrl: 3 })).toBeNull();
    expect(apiWebUrl({ webUrl: 'https://ezmodo.com/a' })).toBe('https://ezmodo.com/a');
  });
});
