import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageMilestone } = await import('../handlers/milestones.js');
const { manageEpic } = await import('../handlers/epics.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { MILESTONE_TOOLS } = await import('../tools/milestones.js');
const { EPIC_TOOLS } = await import('../tools/epics.js');

// #3819: move deferred work out of a milestone or an epic.
describe('move_out_deferred', () => {
  afterEach(() => jest.clearAllMocks());

  it('routes both actions to their move-out endpoints', () => {
    expect(ENDPOINT_MAP.mcpMoveOutDeferredFromMilestone).toEqual(
      { route: 'mcp/v1/milestones/{id}/deferred/move-out', method: 'POST' });
    expect(ENDPOINT_MAP.mcpMoveOutDeferredFromEpic).toEqual(
      { route: 'mcp/v1/epics/{id}/deferred/move-out', method: 'POST' });
  });

  it('offers the action and its params on manage_milestone and manage_epic', () => {
    for (const tool of [MILESTONE_TOOLS[0], EPIC_TOOLS[0]]) {
      const props = tool.inputSchema.properties;
      expect(props.action.enum).toContain('move_out_deferred');
      expect(props.target.properties.type.enum).toEqual(['follow_up', 'epic', 'backlog', 'cancel']);
      expect(props.taskIds.type).toBe('array');
      expect(props.all.type).toBe('boolean');
    }
  });

  it('moves a milestone\'s selected tasks into follow-ups, by slug', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ moved: ['t1'], failed: [] });
    const target = { type: 'follow_up', milestoneId: '1.7.0' };
    await manageMilestone({
      action: 'move_out_deferred', projectId: 'p1', milestoneSlug: '1.6.0', taskIds: ['t1'], target,
    });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpMoveOutDeferredFromMilestone',
      { id: '1.6.0', projectId: 'p1', taskIds: ['t1'], target });
  });

  it('moves all of an epic\'s deferred work to the backlog', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ moved: ['t1', 't2'], failed: [] });
    await manageEpic({ action: 'move_out_deferred', epicId: 'e1', all: true, target: { type: 'backlog' } });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpMoveOutDeferredFromEpic',
      { id: 'e1', all: true, target: { type: 'backlog' } });
  });

  it('refuses a request with neither taskIds nor all, or both', async () => {
    const target = { type: 'cancel', reason: 'no longer needed' };
    await expect(manageEpic({ action: 'move_out_deferred', epicId: 'e1', target }))
      .rejects.toThrow('taskIds or all');
    await expect(manageEpic({ action: 'move_out_deferred', epicId: 'e1', all: true, taskIds: ['t1'], target }))
      .rejects.toThrow('taskIds or all');
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('refuses a request without a target type or a scope', async () => {
    await expect(manageEpic({ action: 'move_out_deferred', epicId: 'e1', all: true }))
      .rejects.toThrow('target');
    await expect(manageMilestone({ action: 'move_out_deferred', projectId: 'p1', all: true, target: { type: 'backlog' } }))
      .rejects.toThrow('milestoneId');
    await expect(manageEpic({ action: 'move_out_deferred', all: true, target: { type: 'backlog' } }))
      .rejects.toThrow('epicId');
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });
});
