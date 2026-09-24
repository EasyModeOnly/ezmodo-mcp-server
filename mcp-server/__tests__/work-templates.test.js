import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageWorkTemplate } = await import('../handlers/work-templates.js');

describe('Work Template Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create a task template', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ template: { id: 'tmpl-1', kind: 'task' } });

    const params = {
      organizationId: 'org-1',
      kind: 'task',
      name: 'Daily check',
      taskBlueprint: { title: 'Check app stats', taskType: 'chore' },
    };
    const result = await manageWorkTemplate({ action: 'create', ...params });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateWorkTemplate', params);
    expect(result.template.id).toBe('tmpl-1');
  });

  it('should create an epic template', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ template: { id: 'tmpl-2', kind: 'epic' } });

    const params = {
      organizationId: 'org-1',
      kind: 'epic',
      name: 'Onboarding',
      epicBlueprint: { title: 'Customer onboarding', tasks: [{ title: 'Kickoff' }] },
    };
    await manageWorkTemplate({ action: 'create', ...params });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateWorkTemplate', params);
  });

  it('should update a template', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ template: { id: 'tmpl-1' } });

    const params = { templateId: 'tmpl-1', name: 'Renamed' };
    await manageWorkTemplate({ action: 'update', ...params });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateWorkTemplate', params);
  });

  it('should delete a template (only templateId sent)', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

    await manageWorkTemplate({ action: 'delete', templateId: 'tmpl-1', name: 'ignored' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteWorkTemplate', { templateId: 'tmpl-1' });
  });

  it('should get a template', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ template: { id: 'tmpl-1' } });

    await manageWorkTemplate({ action: 'get', templateId: 'tmpl-1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetWorkTemplate', { templateId: 'tmpl-1' });
  });

  it('should list templates filtered by kind', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ templates: [] });

    await manageWorkTemplate({ action: 'list', organizationId: 'org-1', kind: 'epic' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListWorkTemplates', {
      organizationId: 'org-1', kind: 'epic',
    });
  });

  it('should instantiate a template', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ result: { kind: 'task', taskId: 'task-1' } });

    const params = { templateId: 'tmpl-1', projectId: 'proj-1', priority: 'high' };
    const result = await manageWorkTemplate({ action: 'instantiate', ...params });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpInstantiateWorkTemplate', params);
    expect(result.result.taskId).toBe('task-1');
  });

  it('should reject an unknown action', async () => {
    await expect(manageWorkTemplate({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
  });
});
