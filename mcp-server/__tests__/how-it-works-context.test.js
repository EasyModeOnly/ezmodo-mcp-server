import { jest } from '@jest/globals';

// E-283 #3173: the user's own agent is the normal author of a how-it-works. It
// reads how_it_works_context for the refs it may cite, then saves its summary
// with apply_how_it_works. All five tools that carry generate/apply carry the
// read too, and every tool's schema offers it.
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));
jest.unstable_mockModule('../lib/active-session.js', () => ({
  writeActiveSession: jest.fn(),
  clearActiveSession: jest.fn(),
}));
jest.unstable_mockModule('../lib/auto-assign.js', () => ({
  resolveTaskAutoAssign: jest.fn(),
  resolveEpicAutoAssign: jest.fn().mockResolvedValue(null),
}));
jest.unstable_mockModule('../handlers/context-manifest.js', () => ({
  getContext: jest.fn(),
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ info() {}, warn() {}, debug() {}, error() {} }),
}));

const { manageTask } = await import('../handlers/tasks.js');
const { manageEpic } = await import('../handlers/epics.js');
const { manageProject } = await import('../handlers/projects.js');
const { manageGoal } = await import('../handlers/entities.js');
const { manageFeature } = await import('../handlers/features.js');
const { TASK_TOOLS } = await import('../tools/tasks.js');
const { EPIC_TOOLS } = await import('../tools/epics.js');
const { PROJECT_TOOLS } = await import('../tools/projects.js');
const { ENTITY_TOOLS } = await import('../tools/entities.js');
const { FEATURE_TOOLS } = await import('../tools/features.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

const CASES = [
  { name: 'task', manage: manageTask, idParam: 'taskId', endpoint: 'mcpTaskHowItWorksContext', tools: TASK_TOOLS, tool: 'manage_task', seg: 'tasks' },
  { name: 'epic', manage: manageEpic, idParam: 'epicId', endpoint: 'mcpEpicHowItWorksContext', tools: EPIC_TOOLS, tool: 'manage_epic', seg: 'epics' },
  { name: 'project', manage: manageProject, idParam: 'projectId', endpoint: 'mcpProjectHowItWorksContext', tools: PROJECT_TOOLS, tool: 'manage_project', seg: 'projects' },
  { name: 'goal', manage: manageGoal, idParam: 'goalId', endpoint: 'mcpGoalHowItWorksContext', tools: ENTITY_TOOLS, tool: 'manage_goal', seg: 'goals' },
  { name: 'feature', manage: manageFeature, idParam: 'featureId', endpoint: 'mcpFeatureHowItWorksContext', tools: FEATURE_TOOLS, tool: 'manage_feature', seg: 'features' },
];

describe('how_it_works_context (E-283 #3173)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe.each(CASES)('$name', ({ manage, idParam, endpoint, tools, tool, seg }) => {
    it('reads the grounded context for the entity', async () => {
      const ctx = { intent: { title: 'X' }, sources: [{ ref: 'task:t1', confidence: 'grounded', text: 'done' }] };
      mockCallEzmodoAPI.mockResolvedValueOnce(ctx);

      const result = await manage({ action: 'how_it_works_context', [idParam]: 'id-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith(endpoint, { [idParam]: 'id-1' });
      expect(result).toEqual(ctx);
    });

    it(`requires ${idParam}`, async () => {
      await expect(manage({ action: 'how_it_works_context' })).rejects.toThrow(idParam);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('is a GET of the entity\'s context route', () => {
      expect(ENDPOINT_MAP[endpoint]).toEqual({ route: `mcp/v1/${seg}/how-it-works-context`, method: 'GET' });
    });

    it(`is offered by ${tool}`, () => {
      const def = tools.find((t) => t.name === tool);
      expect(def.inputSchema.properties.action.enum).toContain('how_it_works_context');
      expect(def.inputSchema.properties.action.description).toMatch(/how_it_works_context/);
    });
  });
});
