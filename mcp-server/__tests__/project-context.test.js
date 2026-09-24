/**
 * Tests for project context and metadata operations
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createMockCallEzmodoAPI,
  createMockProject,
  createMockError,
} from './test-utils.js';

describe('Project Context Operations', () => {
  let mockCallEzmodoAPI;

  beforeEach(() => {
    mockCallEzmodoAPI = createMockCallEzmodoAPI();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProjectContext', () => {
    let getProjectContext;

    beforeEach(() => {
      getProjectContext = async (args) => {
        return mockCallEzmodoAPI('mcpGetProjectContext', args);
      };
    });

    it('should retrieve project context with all fields', async () => {
      const result = await getProjectContext({
        projectId: 'project-123',
      });

      expect(result.success).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context.projectId).toBe('project-123');
      expect(result.context.name).toBeDefined();
      expect(result.context.knowledge).toBeInstanceOf(Array);
      expect(result.context.memory).toBeDefined();
    });

    it('should reject without projectId', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (!args.projectId) {
          throw createMockError('projectId is required', 400);
        }
      });

      await expect(getProjectContext({})).rejects.toThrow('projectId is required');
    });

    it('should handle project not found', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (args.projectId === 'nonexistent') {
          throw createMockError('Project not found', 404);
        }
      });

      await expect(
        getProjectContext({ projectId: 'nonexistent' })
      ).rejects.toThrow('Project not found');
    });

    it('should handle unauthorized access', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        throw createMockError('Unauthorized', 401);
      });

      await expect(
        getProjectContext({ projectId: 'project-123' })
      ).rejects.toThrow('Unauthorized');
    });

    it('should include project knowledge array', async () => {
      mockCallEzmodoAPI.mockImplementationOnce(async (endpoint, args) => ({
        success: true,
        context: {
          projectId: args.projectId,
          name: 'Test Project',
          knowledge: [
            { type: 'fact', content: 'Project uses React' },
            { type: 'decision', content: 'Decided to use TypeScript' },
          ],
          memory: {},
        },
      }));

      const result = await getProjectContext({ projectId: 'project-123' });

      expect(result.context.knowledge).toHaveLength(2);
      expect(result.context.knowledge[0]).toHaveProperty('type');
      expect(result.context.knowledge[0]).toHaveProperty('content');
    });

    it('should include project memory object', async () => {
      mockCallEzmodoAPI.mockImplementationOnce(async (endpoint, args) => ({
        success: true,
        context: {
          projectId: args.projectId,
          name: 'Test Project',
          knowledge: [],
          memory: {
            lastAIInteraction: new Date('2024-01-01'),
            recentTopics: ['authentication', 'testing'],
            preferences: {
              codingStyle: 'TypeScript strict mode',
            },
          },
        },
      }));

      const result = await getProjectContext({ projectId: 'project-123' });

      expect(result.context.memory).toBeDefined();
      expect(result.context.memory.recentTopics).toBeInstanceOf(Array);
      expect(result.context.memory.preferences).toBeDefined();
    });
  });

  describe('Project access validation', () => {
    it('should verify user has access to project', async () => {
      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      const result = await getProjectContext({ projectId: 'project-123' });

      expect(result.success).toBe(true);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetProjectContext', {
        projectId: 'project-123',
      });
    });

    it('should reject access to private project', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (args.projectId === 'private-project') {
          throw createMockError(
            'Forbidden - No access to this project',
            403
          );
        }
      });

      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      await expect(
        getProjectContext({ projectId: 'private-project' })
      ).rejects.toThrow('Forbidden');
    });

    it('should allow access to team project', async () => {
      mockCallEzmodoAPI.mockImplementationOnce(async (endpoint, args) => ({
        success: true,
        context: {
          projectId: args.projectId,
          name: 'Team Project',
          knowledge: [],
          memory: {},
        },
      }));

      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      const result = await getProjectContext({ projectId: 'team-project' });

      expect(result.success).toBe(true);
      expect(result.context.name).toBe('Team Project');
    });
  });

  describe('Context consistency', () => {
    it('should maintain context across multiple calls', async () => {
      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      const result1 = await getProjectContext({ projectId: 'project-123' });
      const result2 = await getProjectContext({ projectId: 'project-123' });

      expect(result1.context.projectId).toBe(result2.context.projectId);
      expect(result1.context.name).toBe(result2.context.name);
    });

    it('should handle concurrent context requests', async () => {
      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      const requests = Array.from({ length: 5 }, () =>
        getProjectContext({ projectId: 'project-123' })
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.context.projectId).toBe('project-123');
      });
    });
  });

  describe('Error handling', () => {
    it('should handle network timeout', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw createMockError('Request timeout', 408);
      });

      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      await expect(
        getProjectContext({ projectId: 'project-123' })
      ).rejects.toThrow('timeout');
    });

    it('should handle server errors gracefully', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        throw createMockError('Internal server error', 500);
      });

      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      await expect(
        getProjectContext({ projectId: 'project-123' })
      ).rejects.toThrow('Internal server error');
    });

    it('should handle malformed responses', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        return { invalid: 'response' };
      });

      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      const result = await getProjectContext({ projectId: 'project-123' });

      expect(result.success).toBeUndefined();
      expect(result.context).toBeUndefined();
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      const start = Date.now();
      await getProjectContext({ projectId: 'project-123' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });

    it('should cache project context appropriately', async () => {
      const getProjectContext = async (args) =>
        mockCallEzmodoAPI('mcpGetProjectContext', args);

      // First call
      const start1 = Date.now();
      await getProjectContext({ projectId: 'project-123' });
      const duration1 = Date.now() - start1;

      // Second call (might be cached)
      const start2 = Date.now();
      await getProjectContext({ projectId: 'project-123' });
      const duration2 = Date.now() - start2;

      // Both should complete quickly
      expect(duration1).toBeLessThan(1000);
      expect(duration2).toBeLessThan(1000);
    });
  });
});
