import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageGoal, manageTeam, getGoal } = await import('../handlers/entities.js');

describe('Entity Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Goals', () => {
    describe('createGoal', () => {
      it('should create a goal with required fields', async () => {
        const mockResponse = { success: true, goalId: 'goal-new', goalNumber: 3 };
        mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

        const args = { organizationId: 'org-1', title: 'Increase Revenue' };
        const result = await manageGoal({ action: 'create', ...args });

        expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateGoal', args);
        expect(result.success).toBe(true);
        expect(result.goalId).toBe('goal-new');
        expect(result.goalNumber).toBe(3);
      });

      it('should create a goal with all optional fields', async () => {
        const mockResponse = { success: true, goalId: 'goal-full', goalNumber: 4 };
        mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

        const args = {
          organizationId: 'org-1',
          title: 'Full Goal',
          description: 'A comprehensive goal',
          status: 'active',
          targetDate: '2026-06-01',
          metrics: [{ name: 'revenue', target: 1000000 }],
        };
        const result = await manageGoal({ action: 'create', ...args });

        expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateGoal', args);
        expect(result.success).toBe(true);
      });

      it('should propagate API errors', async () => {
        mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Missing required field: organizationId', 400));
        await expect(manageGoal({ action: 'create', title: 'No Org' })).rejects.toThrow('Missing required field: organizationId');
      });
    });

    describe('getGoal', () => {
      it('should get a goal by ID', async () => {
        const mockGoal = { id: 'goal-1', title: 'Revenue Target', status: 'active' };
        mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, goal: mockGoal });

        const result = await getGoal({ goalId: 'goal-1' });

        expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetGoal', { goalId: 'goal-1' });
        expect(result.success).toBe(true);
        expect(result.goal.title).toBe('Revenue Target');
      });

      it('should handle not found', async () => {
        mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Goal not found', 404));
        await expect(getGoal({ goalId: 'nonexistent' })).rejects.toThrow('Goal not found');
      });
    });

    describe('updateGoal', () => {
      it('should update a goal', async () => {
        mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Goal updated' });

        const args = { goalId: 'goal-1', title: 'Updated Goal Title', status: 'at_risk' };
        const result = await manageGoal({ action: 'update', ...args });

        expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateGoal', args);
        expect(result.success).toBe(true);
      });

      it('should handle update error', async () => {
        mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Goal not found', 404));
        await expect(manageGoal({ action: 'update', goalId: 'bad-id' })).rejects.toThrow('Goal not found');
      });
    });

    describe('listGoals', () => {
      it('should list goals for an organization', async () => {
        const goals = [
          { id: 'g1', title: 'Goal One' },
          { id: 'g2', title: 'Goal Two' },
        ];
        mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, goals, count: 2 });

        const args = { organizationId: 'org-1' };
        const result = await getGoal(args);

        expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListGoals', args);
        expect(result.goals).toHaveLength(2);
        expect(result.count).toBe(2);
      });

      it('should return empty list when no goals exist', async () => {
        mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, goals: [], count: 0 });

        const result = await getGoal({ organizationId: 'org-empty' });

        expect(result.goals).toHaveLength(0);
      });

      it('should handle server error', async () => {
        mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
        await expect(getGoal({ organizationId: 'org-1' })).rejects.toThrow('Internal server error');
      });
    });

    describe('deleteGoal', () => {
      it('should delete a goal', async () => {
        mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Goal deleted' });

        const args = { goalId: 'goal-1' };
        const result = await manageGoal({ action: 'delete', ...args });

        expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteGoal', args);
        expect(result.success).toBe(true);
      });

      it('should handle delete error', async () => {
        mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Goal not found', 404));
        await expect(manageGoal({ action: 'delete', goalId: 'nonexistent' })).rejects.toThrow('Goal not found');
      });
    });
  });

  describe('Teams', () => {
    describe('createTeam', () => {
      it('should create a team', async () => {
        const mockResponse = { success: true, teamId: 'team-new' };
        mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

        const args = { organizationId: 'org-1', name: 'Frontend Team', description: 'UI developers' };
        const result = await manageTeam({ action: 'create', ...args });

        expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateTeam', args);
        expect(result.success).toBe(true);
        expect(result.teamId).toBe('team-new');
      });

      it('should propagate API errors', async () => {
        mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Organization not found', 404));
        await expect(manageTeam({ action: 'create', organizationId: 'bad', name: 'Team' })).rejects.toThrow('Organization not found');
      });
    });
  });

});
