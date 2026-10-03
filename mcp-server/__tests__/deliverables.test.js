import { jest } from '@jest/globals';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

// projectId defaults to .ezmodo/config.json; the test controls what is there
// rather than reading this repo's own config.
const mockReadConfig = jest.fn();
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  isCacheFresh: jest.fn(),
  findConfigPath: jest.fn(),
  readConfig: mockReadConfig,
  writeConfig: jest.fn(),
  getCachedTags: jest.fn(),
  updateCacheSections: jest.fn(),
  invalidateCacheSection: jest.fn(),
}));

const { manageDeliverable } = await import('../handlers/deliverables.js');
const { getReleaseReadiness, manageRelease } = await import('../handlers/releases.js');
const { HANDLERS } = await import('../handlers/index.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { TOOLS } = await import('../tools/index.js');
const { isRemoteSafe } = await import('../lib/remote-tools.js');

beforeEach(() => {
  mockReadConfig.mockResolvedValue(null);
});
afterEach(() => jest.clearAllMocks());

describe('manage_deliverable (E-280)', () => {
  it('is registered, wired to its handler and served remotely', () => {
    const tool = TOOLS.find((t) => t.name === 'manage_deliverable');
    expect(tool).toBeDefined();
    expect(HANDLERS.manage_deliverable).toBe(manageDeliverable);
    expect(isRemoteSafe('manage_deliverable')).toBe(true);
    expect(tool.inputSchema.properties.action.enum).toEqual(['list', 'create', 'update', 'paths', 'route', 'delete']);
  });

  it('states the hard rule: a release axis only, never linked to work', () => {
    const { description } = TOOLS.find((t) => t.name === 'manage_deliverable');
    expect(description).toMatch(/release axis only/);
    expect(description).toMatch(/NEVER linked to a deliverable/);
    expect(description).toMatch(/no\s+progress figure/);
    expect(description).toMatch(/only through a release's contents/);
  });

  it('every endpoint the deliverable and release handlers call is mapped', () => {
    const used = [
      'mcpListDeliverables', 'mcpCreateDeliverable', 'mcpUpdateDeliverable', 'mcpSetDeliverablePaths',
      'mcpSetDeliverableRoute', 'mcpDeleteDeliverable', 'mcpListReleases', 'mcpCreateRelease', 'mcpLookupRelease',
      'mcpReleaseTaskShipping', 'mcpGetRelease', 'mcpUpdateRelease', 'mcpCreateReleaseCandidateForRelease',
      'mcpAddReleaseChecklistItemForRelease', 'mcpApplyReleaseChecklistForRelease', 'mcpGetReleaseContents',
      'mcpDeriveReleaseContents', 'mcpAddReleaseContent', 'mcpRemoveReleaseContent', 'mcpReleaseChangelog',
      'mcpLookupReleaseCandidate',
    ];
    expect(used.filter((e) => !ENDPOINT_MAP[e])).toEqual([]);
  });

  it('list defaults projectId from .ezmodo/config.json', async () => {
    mockReadConfig.mockResolvedValue({ projectId: 'cfg-p' });
    mockCallEzmodoAPI.mockResolvedValueOnce({ deliverables: [], multi: false });
    await manageDeliverable({ action: 'list' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDeliverables', { projectId: 'cfg-p' });
  });

  it('an explicit projectId wins over the config', async () => {
    mockReadConfig.mockResolvedValue({ projectId: 'cfg-p' });
    mockCallEzmodoAPI.mockResolvedValueOnce({});
    await manageDeliverable({ action: 'list', projectId: 'p1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListDeliverables', { projectId: 'p1' });
  });

  it('says so when there is no project to default to', async () => {
    await expect(manageDeliverable({ action: 'list' })).rejects.toThrow(/needs projectId/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('create sends only what was given', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'd1' });
    await manageDeliverable({ action: 'create', projectId: 'p1', key: 'api', name: 'API', paths: ['api/'] });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDeliverable', {
      projectId: 'p1', key: 'api', name: 'API', paths: ['api/'],
    });
    await expect(manageDeliverable({ action: 'create', projectId: 'p1', key: 'web' })).rejects.toThrow(/needs name/);
  });

  it('update names the deliverable and refuses a call that changes nothing', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({});
    await manageDeliverable({ action: 'update', projectId: 'p1', deliverable: 'api', name: 'Go API', makeDefault: true, route: [] });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDeliverable', {
      projectId: 'p1', deliverable: 'api', name: 'Go API', route: [], makeDefault: true,
    });
    await expect(manageDeliverable({ action: 'update', projectId: 'p1', deliverable: 'api' })).rejects.toThrow(/at least one of/);
    await expect(manageDeliverable({ action: 'update', projectId: 'p1', name: 'x' })).rejects.toThrow(/needs deliverable/);
  });

  it('paths defaults to replace and checks the mode', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageDeliverable({ action: 'paths', projectId: 'p1', deliverable: 'web', paths: ['web/'] });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSetDeliverablePaths', {
      projectId: 'p1', deliverable: 'web', paths: ['web/'], mode: 'replace',
    });
    await manageDeliverable({ action: 'paths', projectId: 'p1', deliverable: 'web', paths: ['packages/types/'], mode: 'add' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSetDeliverablePaths', {
      projectId: 'p1', deliverable: 'web', paths: ['packages/types/'], mode: 'add',
    });
    await expect(manageDeliverable({ action: 'paths', projectId: 'p1', deliverable: 'web', paths: [], mode: 'merge' }))
      .rejects.toThrow(/mode must be one of/);
    await expect(manageDeliverable({ action: 'paths', projectId: 'p1', deliverable: 'web' })).rejects.toThrow(/needs paths/);
  });

  it('route sends the env list; [] means every environment', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageDeliverable({ action: 'route', projectId: 'p1', deliverable: 'desktop', route: ['staging', 'production'] });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSetDeliverableRoute', {
      projectId: 'p1', deliverable: 'desktop', route: ['staging', 'production'],
    });
    await manageDeliverable({ action: 'route', projectId: 'p1', deliverable: 'desktop', route: [] });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSetDeliverableRoute', { projectId: 'p1', deliverable: 'desktop', route: [] });
    await expect(manageDeliverable({ action: 'route', projectId: 'p1', deliverable: 'desktop' })).rejects.toThrow(/needs route/);
  });

  it('delete by key', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });
    await manageDeliverable({ action: 'delete', projectId: 'p1', deliverable: 'web' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteDeliverable', { projectId: 'p1', deliverable: 'web' });
  });

  it('rejects an unknown action', async () => {
    await expect(manageDeliverable({ action: 'progress', projectId: 'p1' })).rejects.toThrow(/Unknown action/);
  });
});

describe('manage_release with deliverables (E-280)', () => {
  it('lists the new actions and keeps every old one', () => {
    const { enum: actions } = TOOLS.find((t) => t.name === 'manage_release').inputSchema.properties.action;
    for (const a of [
      'create_candidate', 'promote', 'report_check', 'report_deployment', 'list_gates',
      'list_releases', 'create_release', 'get_release', 'update_release', 'get_contents', 'derive_contents',
      'add_content', 'remove_content', 'release_changelog', 'task_shipping',
    ]) expect(actions).toContain(a);
  });

  it('create_candidate on the milestone path is unchanged, and passes a deliverable', async () => {
    mockCallEzmodoAPI.mockResolvedValue({ id: 'c1' });
    await manageRelease({ action: 'create_candidate', milestoneId: 'm1', versionLabel: '1.4.0-rc.1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpCreateReleaseCandidate', { milestoneId: 'm1', versionLabel: '1.4.0-rc.1' });
    await manageRelease({ action: 'create_candidate', milestoneId: 'm1', versionLabel: '1.4.0-rc.1', deliverable: 'web' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpCreateReleaseCandidate', {
      milestoneId: 'm1', versionLabel: '1.4.0-rc.1', deliverable: 'web',
    });
  });

  it('create_candidate with deliverable + version starts the release, then cuts the candidate on it', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'r1' }).mockResolvedValueOnce({ id: 'c1' });
    await manageRelease({ action: 'create_candidate', projectId: 'p1', deliverable: 'api', version: '0.1.0', commitSha: 'abc' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpCreateRelease', { projectId: 'p1', version: '0.1.0', deliverable: 'api' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpCreateReleaseCandidateForRelease', { id: 'r1', commitSha: 'abc' });
  });

  it('create_candidate by releaseId', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'c1' });
    await manageRelease({ action: 'create_candidate', releaseId: 'r1', versionLabel: '0.1.0-rc.2' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateReleaseCandidateForRelease', { id: 'r1', versionLabel: '0.1.0-rc.2' });
  });

  it('create_candidate says what it needs when given nothing to name the release', async () => {
    await expect(manageRelease({ action: 'create_candidate', projectId: 'p1' })).rejects.toThrow(/releaseId, or version/);
    await expect(manageRelease({ action: 'create_candidate', milestoneId: 'm1' })).rejects.toThrow(/versionLabel/);
  });

  it('list_releases and create_release', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageRelease({ action: 'list_releases', projectId: 'p1', deliverable: 'api', limit: 5 });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpListReleases', { projectId: 'p1', deliverable: 'api', limit: 5 });
    await manageRelease({ action: 'create_release', projectId: 'p1', deliverable: 'api', version: '0.2.0', milestoneId: 'm1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpCreateRelease', {
      projectId: 'p1', deliverable: 'api', version: '0.2.0', milestoneId: 'm1',
    });
    await expect(manageRelease({ action: 'create_release', projectId: 'p1' })).rejects.toThrow(/needs version/);
  });

  it('get_release by id, or by deliverable + version', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageRelease({ action: 'get_release', releaseId: 'r1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetRelease', { id: 'r1' });
    await manageRelease({ action: 'get_release', projectId: 'p1', deliverable: 'web', version: '0.1.0' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpLookupRelease', { projectId: 'p1', version: '0.1.0', deliverable: 'web' });
  });

  it('update_release resolves deliverable + version and lets milestoneId "" detach', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ release: { id: 'r9' } }).mockResolvedValueOnce({});
    await manageRelease({ action: 'update_release', projectId: 'p1', deliverable: 'api', version: '0.1.0', milestoneId: '' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpLookupRelease', { projectId: 'p1', version: '0.1.0', deliverable: 'api' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpUpdateRelease', { id: 'r9', milestoneId: '' });
    await expect(manageRelease({ action: 'update_release', releaseId: 'r1' })).rejects.toThrow(/at least one of/);
  });

  it('contents: get, derive, add, remove, changelog', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageRelease({ action: 'get_contents', releaseId: 'r1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetReleaseContents', { id: 'r1' });
    await manageRelease({ action: 'derive_contents', releaseId: 'r1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpDeriveReleaseContents', { id: 'r1' });
    await manageRelease({ action: 'add_content', releaseId: 'r1', entityType: 'task', entityId: 't1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpAddReleaseContent', { id: 'r1', entityType: 'task', entityId: 't1' });
    await manageRelease({ action: 'remove_content', releaseId: 'r1', entityType: 'epic', entityId: 'e1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpRemoveReleaseContent', { id: 'r1', entityType: 'epic', entityId: 'e1' });
    await manageRelease({ action: 'release_changelog', releaseId: 'r1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpReleaseChangelog', { id: 'r1' });
    await expect(manageRelease({ action: 'add_content', releaseId: 'r1', entityType: 'task' })).rejects.toThrow(/entityId/);
    await expect(manageRelease({ action: 'get_contents', projectId: 'p1' })).rejects.toThrow(/releaseId, or version/);
  });

  it('task_shipping defaults projectId from the config', async () => {
    mockReadConfig.mockResolvedValue({ projectId: 'cfg-p' });
    mockCallEzmodoAPI.mockResolvedValueOnce({ summary: 'API shipped, Web pending' });
    const r = await manageRelease({ action: 'task_shipping', taskId: 't1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReleaseTaskShipping', { taskId: 't1', projectId: 'cfg-p' });
    expect(r.summary).toBe('API shipped, Web pending');
  });

  it('reports name the build by deliverable + version', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageRelease({ action: 'report_check', projectId: 'p1', name: 'build', status: 'success', deliverable: 'api', version: '0.1.0' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpReportReleaseCheck', {
      source: 'mcp', projectId: 'p1', name: 'build', status: 'success', deliverable: 'api', version: '0.1.0',
    });
    await manageRelease({ action: 'report_deployment', projectId: 'p1', environment: 'prod', status: 'success', deliverable: 'web', version: '0.1.0' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpReportReleaseDeployment', {
      source: 'mcp', projectId: 'p1', environment: 'prod', status: 'success', deliverable: 'web', version: '0.1.0',
    });
  });

  it('checklist actions take releaseId instead of milestoneId', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageRelease({ action: 'apply_checklist', releaseId: 'r1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpApplyReleaseChecklistForRelease', { id: 'r1' });
    await manageRelease({ action: 'add_checklist_item', releaseId: 'r1', title: 'Notify support', phase: 'pre-prod' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpAddReleaseChecklistItemForRelease', {
      id: 'r1', title: 'Notify support', phase: 'pre-prod',
    });
    await manageRelease({ action: 'apply_checklist', milestoneId: 'm1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpApplyReleaseChecklist', { milestoneId: 'm1' });
    // #3096: sync brings open steps in line with the template, never deleting.
    await manageRelease({ action: 'apply_checklist', releaseId: 'r1', sync: true });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpApplyReleaseChecklistForRelease', { id: 'r1', sync: true });
    await manageRelease({ action: 'apply_checklist', milestoneId: 'm1', deliverable: 'api', sync: true });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpApplyReleaseChecklist', { milestoneId: 'm1', deliverable: 'api', sync: true });
  });

  it('settings: a deliverable override, and "" removes it', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await manageRelease({ action: 'get_settings', projectId: 'p1', deliverable: 'api' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetReleaseSettings', { projectId: 'p1', deliverable: 'api' });
    await manageRelease({ action: 'save_settings', projectId: 'p1', deliverable: 'api', completeTasksOn: '' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSaveReleaseSettings', { projectId: 'p1', completeTasksOn: '', deliverable: 'api' });
    await expect(manageRelease({ action: 'save_settings', projectId: 'p1', completeTasksOn: '' })).rejects.toThrow(/completeTasksOn/);
    await expect(manageRelease({ action: 'save_settings', projectId: 'p1', deliverable: 'api' })).rejects.toThrow(/completeTasksOn/);
    // #3091: holding CI deploys is a setting of its own, inherited separately.
    await manageRelease({ action: 'save_settings', projectId: 'p1', deliverable: 'cli', holdDeploys: true });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSaveReleaseSettings', { projectId: 'p1', holdDeploys: true, deliverable: 'cli' });
    await manageRelease({ action: 'save_settings', projectId: 'p1', deliverable: 'cli', inheritHoldDeploys: true });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSaveReleaseSettings', { projectId: 'p1', inheritHoldDeploys: true, deliverable: 'cli' });
    await manageRelease({ action: 'save_settings', projectId: 'p1', holdDeploys: false });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpSaveReleaseSettings', { projectId: 'p1', holdDeploys: false });
    await expect(manageRelease({ action: 'save_settings', projectId: 'p1', inheritHoldDeploys: true })).rejects.toThrow(/holdDeploys/);
  });
});

describe('get_release_readiness with deliverables (E-280)', () => {
  it('resolves deliverable + version to its candidate, then checks it', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'c7' }).mockResolvedValueOnce({ verdict: 'go' });
    const r = await getReleaseReadiness({ projectId: 'p1', deliverable: 'api', version: '0.1.0', environment: 'production' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpLookupReleaseCandidate', { projectId: 'p1', version: '0.1.0', deliverable: 'api' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpReleaseReadiness', { id: 'c7', environment: 'production' });
    expect(r.verdict).toBe('go');
  });

  it('passes a candidate label within the release, and defaults the project', async () => {
    mockReadConfig.mockResolvedValue({ projectId: 'cfg-p' });
    mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'c8' }).mockResolvedValueOnce({ environments: [] });
    await getReleaseReadiness({ version: '0.1.0', candidate: '0.1.0-rc.2' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpLookupReleaseCandidate', {
      projectId: 'cfg-p', version: '0.1.0', candidate: '0.1.0-rc.2',
    });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpReleaseReadiness', { id: 'c8' });
  });

  it('candidateId still wins, untouched', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({});
    await getReleaseReadiness({ candidateId: 'c1', version: '0.1.0', environment: 'prod' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpReleaseReadiness', { id: 'c1', environment: 'prod' });
  });

  it('a release page by releaseId, and a milestone overview for one deliverable', async () => {
    mockCallEzmodoAPI.mockResolvedValue({});
    await getReleaseReadiness({ releaseId: 'r1' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpGetRelease', { id: 'r1' });
    await getReleaseReadiness({ milestoneId: 'm1', deliverable: 'web' });
    expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpMilestoneRelease', { milestoneId: 'm1', deliverable: 'web' });
  });
});
