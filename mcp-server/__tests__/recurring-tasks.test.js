import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageRecurringTask } = await import('../handlers/recurring-tasks.js');

describe('Recurring Task Schedule Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create an inline recurring schedule', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ schedule: { id: 'sch-1', nextRunAt: '2026-07-21T09:00:00Z' } });

    const params = {
      organizationId: 'org-1',
      projectId: 'proj-1',
      title: 'Daily stats',
      recurrence: { frequency: 'daily', interval: 1, atHour: 9 },
      startsAt: '2026-07-20T00:00:00Z',
      inlineTask: { title: 'Check app stats' },
    };
    const result = await manageRecurringTask({ action: 'create', ...params });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateRecurringTask', params);
    expect(result.schedule.id).toBe('sch-1');
  });

  it('should create a template-backed recurring schedule', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ schedule: { id: 'sch-2' } });

    const params = {
      organizationId: 'org-1',
      projectId: 'proj-1',
      title: 'Weekly review',
      recurrence: { frequency: 'weekly', byWeekdays: [1], atHour: 10 },
      startsAt: '2026-07-20T00:00:00Z',
      templateId: 'tmpl-1',
    };
    await manageRecurringTask({ action: 'create', ...params });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateRecurringTask', params);
  });

  it('should update a schedule', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ schedule: { id: 'sch-1' } });

    const params = { scheduleId: 'sch-1', title: 'Renamed' };
    await manageRecurringTask({ action: 'update', ...params });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateRecurringTask', params);
  });

  it('should pause a schedule (only scheduleId sent)', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ schedule: { id: 'sch-1', active: false } });

    await manageRecurringTask({ action: 'pause', scheduleId: 'sch-1', title: 'ignored' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpPauseRecurringTask', { scheduleId: 'sch-1' });
  });

  it('should resume a schedule', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ schedule: { id: 'sch-1', active: true } });

    await manageRecurringTask({ action: 'resume', scheduleId: 'sch-1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpResumeRecurringTask', { scheduleId: 'sch-1' });
  });

  it('should delete a schedule', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

    await manageRecurringTask({ action: 'delete', scheduleId: 'sch-1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteRecurringTask', { scheduleId: 'sch-1' });
  });

  it('should get a schedule', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ schedule: { id: 'sch-1' } });

    await manageRecurringTask({ action: 'get', scheduleId: 'sch-1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetRecurringTask', { scheduleId: 'sch-1' });
  });

  it('should list schedules for a project', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ schedules: [] });

    await manageRecurringTask({ action: 'list', organizationId: 'org-1', projectId: 'proj-1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListRecurringTasks', {
      organizationId: 'org-1', projectId: 'proj-1',
    });
  });

  it('should reject an unknown action', async () => {
    await expect(manageRecurringTask({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
  });
});
