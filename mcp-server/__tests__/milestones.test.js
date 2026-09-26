import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageMilestone, getMilestone } = await import('../handlers/milestones.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { MILESTONE_TOOLS } = await import('../tools/milestones.js');

describe('Milestone Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createMilestone', () => {
    it('should create a milestone with required fields', async () => {
      const mockResponse = { success: true, milestoneId: 'ms-new' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = { projectId: 'proj-1', title: 'v1.0 Release' };
      const result = await manageMilestone({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateMilestone', args);
      expect(result.success).toBe(true);
      expect(result.milestoneId).toBe('ms-new');
    });

    it('should create a milestone with all optional fields', async () => {
      const mockResponse = { success: true, milestoneId: 'ms-full' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = {
        projectId: 'proj-1',
        title: 'v2.0 Release',
        description: 'Major release with new features',
        targetDate: '2026-06-01',
        status: 'active',
      };
      const result = await manageMilestone({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateMilestone', args);
      expect(result.success).toBe(true);
    });

    it('should create a milestone nested under a parent (tiered milestones)', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, milestoneId: 'ms-child' });

      const args = { projectId: 'proj-1', title: 'Release v1', type: 'version', parentMilestoneId: 'ms-parent' };
      const result = await manageMilestone({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateMilestone', args);
      expect(result.success).toBe(true);
    });

    it('should propagate API errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Missing required field: projectId', 400));
      await expect(manageMilestone({ action: 'create', title: 'No Project' })).rejects.toThrow('Missing required field: projectId');
    });
  });

  describe('getMilestone', () => {
    it('should get a milestone by ID', async () => {
      const mockMilestone = { id: 'ms-1', title: 'v1.0 Release', status: 'active' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, milestone: mockMilestone });

      const args = { milestoneId: 'ms-1' };
      const result = await getMilestone(args);

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetMilestone', args);
      expect(result.success).toBe(true);
      expect(result.milestone.title).toBe('v1.0 Release');
    });

    it('should handle not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Milestone not found', 404));
      await expect(getMilestone({ milestoneId: 'nonexistent' })).rejects.toThrow('Milestone not found');
    });
  });

  describe('updateMilestone', () => {
    it('should update a milestone', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Milestone updated' });

      const args = { milestoneId: 'ms-1', title: 'v1.1 Release', status: 'completed' };
      const result = await manageMilestone({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateMilestone', args);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Milestone updated');
    });

    it('should update milestone status only', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Milestone updated' });

      const args = { milestoneId: 'ms-1', status: 'completed' };
      const result = await manageMilestone({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateMilestone', args);
      expect(result.success).toBe(true);
    });

    it('passes whatsNew store copy through on update', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Milestone updated' });

      const args = { projectId: 'proj-1', milestoneId: 'ms-1', whatsNew: 'Faster sync.' };
      await manageMilestone({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateMilestone', args);
      const props = MILESTONE_TOOLS.find((t) => t.name === 'manage_milestone').inputSchema.properties;
      expect(props.whatsNew.type).toBe('string');
    });

    it('should re-parent (or clear parent with "") via parentMilestoneId', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Milestone updated' });

      // Empty string clears the parent (promote to top-level).
      const args = { milestoneId: 'ms-1', parentMilestoneId: '' };
      const result = await manageMilestone({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateMilestone', args);
      expect(result.success).toBe(true);
    });

    it('should handle update error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Milestone not found', 404));
      await expect(manageMilestone({ action: 'update', milestoneId: 'bad' })).rejects.toThrow('Milestone not found');
    });
  });

  describe('listMilestones', () => {
    it('should list milestones for a project', async () => {
      const milestones = [
        { id: 'ms-1', title: 'v1.0' },
        { id: 'ms-2', title: 'v2.0' },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, milestones, count: 2 });

      const args = { projectId: 'proj-1' };
      const result = await getMilestone(args);

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListMilestones', args);
      expect(result.milestones).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should return empty list when no milestones exist', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, milestones: [], count: 0 });

      const result = await getMilestone({ projectId: 'empty-proj' });

      expect(result.milestones).toHaveLength(0);
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(getMilestone({ projectId: 'proj-1' })).rejects.toThrow('Internal server error');
    });
  });

  describe('deleteMilestone', () => {
    it('should delete a milestone', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Milestone deleted' });

      const args = { milestoneId: 'ms-1' };
      const result = await manageMilestone({ action: 'delete', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteMilestone', args);
      expect(result.success).toBe(true);
    });

    it('should handle delete error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Milestone not found', 404));
      await expect(manageMilestone({ action: 'delete', milestoneId: 'nonexistent' })).rejects.toThrow('Milestone not found');
    });
  });

  describe('linkEpicToMilestone', () => {
    it('should link an epic to a milestone', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Epic linked to milestone' });

      const args = { milestoneId: 'ms-1', epicId: 'epic-1' };
      const result = await manageMilestone({ action: 'link_epic', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpLinkEpicToMilestone', {
        milestoneId: 'ms-1',
        entityId: 'epic-1',
        entityType: 'epic',
      });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Epic linked to milestone');
    });

    it('should handle milestone not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Milestone not found', 404));
      await expect(manageMilestone({ action: 'link_epic', milestoneId: 'bad', epicId: 'epic-1' })).rejects.toThrow('Milestone not found');
    });

    it('should handle epic not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Epic not found', 404));
      await expect(manageMilestone({ action: 'link_epic', milestoneId: 'ms-1', epicId: 'bad' })).rejects.toThrow('Epic not found');
    });
  });

  describe('unlinkEpicFromMilestone', () => {
    it('should unlink an epic from a milestone', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Epic unlinked from milestone' });

      const args = { milestoneId: 'ms-1', epicId: 'epic-1' };
      const result = await manageMilestone({ action: 'unlink_epic', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUnlinkEpicFromMilestone', args);
      expect(result.success).toBe(true);
    });

    it('should handle error when link does not exist', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Link not found', 404));
      await expect(manageMilestone({ action: 'unlink_epic', milestoneId: 'ms-1', epicId: 'epic-1' })).rejects.toThrow('Link not found');
    });
  });

  describe('generateMilestoneChangelog', () => {
    it('should generate a changelog for a milestone', async () => {
      const mockChangelog = {
        markdown: '## v1.0 Release\n\n### Features\n- New dashboard\n- Task management',
        sections: [{ title: 'Features', items: ['New dashboard', 'Task management'] }],
      };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, changelog: mockChangelog });

      const args = { milestoneId: 'ms-1' };
      const result = await manageMilestone({ action: 'generate_changelog', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGenerateMilestoneChangelog', args);
      expect(result.success).toBe(true);
      expect(result.changelog.markdown).toContain('v1.0 Release');
    });

    it('should handle milestone with no completed work', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, changelog: { markdown: '', sections: [] } });

      const result = await manageMilestone({ action: 'generate_changelog', milestoneId: 'ms-empty' });

      expect(result.changelog.sections).toHaveLength(0);
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(manageMilestone({ action: 'generate_changelog', milestoneId: 'ms-1' })).rejects.toThrow('Internal server error');
    });
  });

  describe('draft_whats_new (#2915)', () => {
    it('drafts store copy through the draft-whats-new route', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ whatsNew: "What's new in 1.4.0:\n• Dark mode" });

      const args = { projectId: 'proj-1', milestoneId: 'ms-1' };
      const result = await manageMilestone({ action: 'draft_whats_new', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDraftMilestoneWhatsNew', args);
      expect(result.whatsNew).toContain('Dark mode');
      expect(ENDPOINT_MAP.mcpDraftMilestoneWhatsNew).toEqual({ route: 'mcp/v1/milestones/draft-whats-new', method: 'POST' });
    });

    it('is a listed manage_milestone action', () => {
      const action = MILESTONE_TOOLS.find((t) => t.name === 'manage_milestone').inputSchema.properties.action;
      expect(action.enum).toContain('draft_whats_new');
    });
  });

  describe('getMilestoneProgress (via includeProgress)', () => {
    it('should get milestone with progress', async () => {
      const mockMilestone = { id: 'ms-1', title: 'v1.0' };
      const mockProgress = {
        totalEpics: 5,
        completedEpics: 3,
        totalTasks: 20,
        completedTasks: 15,
        percentage: 75,
      };
      // First call: getMilestone, second call: getProgress
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, milestone: mockMilestone });
      mockCallEzmodoAPI.mockResolvedValueOnce(mockProgress);

      const result = await getMilestone({ milestoneId: 'ms-1', includeProgress: true });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetMilestone', { milestoneId: 'ms-1' });
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetMilestoneProgress', { milestoneId: 'ms-1' });
      expect(result.progress.percentage).toBe(75);
      expect(result.progress.completedTasks).toBe(15);
    });

    it('should handle milestone with no work items', async () => {
      const mockMilestone = { id: 'ms-empty', title: 'Empty' };
      const mockProgress = {
        totalEpics: 0,
        completedEpics: 0,
        totalTasks: 0,
        completedTasks: 0,
        percentage: 0,
      };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, milestone: mockMilestone });
      mockCallEzmodoAPI.mockResolvedValueOnce(mockProgress);

      const result = await getMilestone({ milestoneId: 'ms-empty', includeProgress: true });

      expect(result.progress.percentage).toBe(0);
    });

    it('should handle not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Milestone not found', 404));
      await expect(getMilestone({ milestoneId: 'nonexistent', includeProgress: true })).rejects.toThrow('Milestone not found');
    });
  });
});
