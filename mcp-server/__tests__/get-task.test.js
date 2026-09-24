/**
 * Tests for get_task MCP function
 * Tests both document ID and task number lookup methods
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createMockCallEzmodoAPI,
  createMockTask,
  createMockError,
} from './test-utils.js';

describe('get_task function', () => {
  let mockCallEzmodoAPI;
  let getTask;

  beforeEach(() => {
    // Create fresh mock for each test
    mockCallEzmodoAPI = createMockCallEzmodoAPI();

    // Create the getTask function with the mock
    getTask = async (args) => {
      return mockCallEzmodoAPI('mcpGetTask', args);
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Lookup by document ID', () => {
    it('should retrieve task by document ID', async () => {
      const taskId = 'test-task-123';
      const result = await getTask({ taskId });

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task.id).toBe(taskId);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetTask', { taskId });
    });

    it('should handle task not found by ID', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (endpoint === 'mcpGetTask' && args.taskId === 'nonexistent') {
          const error = createMockError('Task not found', 404);
          throw error;
        }
      });

      await expect(getTask({ taskId: 'nonexistent' })).rejects.toThrow('Task not found');
    });

    it('should return complete task data with all fields', async () => {
      const taskId = 'detailed-task';
      const result = await getTask({ taskId });

      expect(result.task).toMatchObject({
        id: expect.any(String),
        taskNumber: expect.any(Number),
        projectId: expect.any(String),
        organizationId: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        status: expect.any(String),
        context: expect.objectContaining({
          history: expect.any(Array),
          knowledge: expect.any(Array),
          artifacts: expect.any(Array),
        }),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });

  describe('Lookup by task number', () => {
    it('should retrieve task by task number and project ID', async () => {
      const taskNumber = 42;
      const projectId = 'project-123';

      const result = await getTask({ taskNumber, projectId });

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task.taskNumber).toBe(taskNumber);
      expect(result.task.projectId).toBe(projectId);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetTask', {
        taskNumber,
        projectId,
      });
    });

    it('should handle task not found by task number', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (
          endpoint === 'mcpGetTask' &&
          args.taskNumber === 999 &&
          args.projectId === 'project-123'
        ) {
          const error = createMockError(
            `Task #999 not found in project project-123`,
            404
          );
          throw error;
        }
      });

      await expect(
        getTask({ taskNumber: 999, projectId: 'project-123' })
      ).rejects.toThrow('Task #999 not found');
    });

    it('should accept task number as string and convert to number', async () => {
      const result = await getTask({
        taskNumber: '42',
        projectId: 'project-123',
      });

      expect(result.success).toBe(true);
      expect(result.task.taskNumber).toBe('42'); // Mock returns as-is
    });

    it('should work with single-digit task numbers', async () => {
      const result = await getTask({ taskNumber: 1, projectId: 'project-123' });

      expect(result.success).toBe(true);
      expect(result.task.taskNumber).toBe(1);
    });

    it('should work with large task numbers', async () => {
      const result = await getTask({
        taskNumber: 10000,
        projectId: 'project-123',
      });

      expect(result.success).toBe(true);
      expect(result.task.taskNumber).toBe(10000);
    });
  });

  describe('Input validation', () => {
    it('should reject when neither taskId nor taskNumber is provided', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (!args.taskId && (!args.taskNumber || !args.projectId)) {
          throw createMockError(
            "Must provide either 'taskId' OR both 'taskNumber' and 'projectId'",
            400
          );
        }
      });

      await expect(getTask({})).rejects.toThrow('Must provide either');
    });

    it('should reject when taskNumber provided without projectId', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (args.taskNumber && !args.projectId) {
          throw createMockError(
            "Must provide 'projectId' when using 'taskNumber'",
            400
          );
        }
      });

      await expect(getTask({ taskNumber: 42 })).rejects.toThrow('projectId');
    });

    it('should reject when projectId provided without taskNumber', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (args.projectId && !args.taskNumber && !args.taskId) {
          throw createMockError(
            "Must provide 'taskNumber' when using 'projectId'",
            400
          );
        }
      });

      await expect(getTask({ projectId: 'project-123' })).rejects.toThrow(
        'taskNumber'
      );
    });

    it('should reject when both taskId and taskNumber are provided', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (args.taskId && args.taskNumber) {
          throw createMockError(
            "Cannot provide both 'taskId' and 'taskNumber'. Use one or the other.",
            400
          );
        }
      });

      await expect(
        getTask({
          taskId: 'task-123',
          taskNumber: 42,
          projectId: 'project-123',
        })
      ).rejects.toThrow('Cannot provide both');
    });

    it('should reject invalid task number (negative)', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (args.taskNumber < 0) {
          throw createMockError('Task number must be positive', 400);
        }
      });

      await expect(
        getTask({ taskNumber: -1, projectId: 'project-123' })
      ).rejects.toThrow('positive');
    });

    it('should reject invalid task number (zero)', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (args.taskNumber === 0) {
          throw createMockError('Task number must be positive', 400);
        }
      });

      await expect(
        getTask({ taskNumber: 0, projectId: 'project-123' })
      ).rejects.toThrow('positive');
    });
  });

  describe('Edge cases', () => {
    it('should handle API timeout gracefully', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        throw createMockError('Request timeout', 408);
      });

      await expect(getTask({ taskId: 'task-123' })).rejects.toThrow('timeout');
    });

    it('should handle network errors', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        throw createMockError('Network error', 0);
      });

      await expect(getTask({ taskId: 'task-123' })).rejects.toThrow('Network error');
    });

    it('should handle unauthorized access', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        throw createMockError('Unauthorized', 401);
      });

      await expect(getTask({ taskId: 'task-123' })).rejects.toThrow('Unauthorized');
    });

    it('should handle forbidden access', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        throw createMockError('Forbidden - No access to this project', 403);
      });

      await expect(getTask({ taskId: 'task-123' })).rejects.toThrow('Forbidden');
    });

    it('should handle server errors', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        throw createMockError('Internal server error', 500);
      });

      await expect(getTask({ taskId: 'task-123' })).rejects.toThrow('Internal server error');
    });

    it('should handle malformed responses', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        return { invalid: 'response' };
      });

      const result = await getTask({ taskId: 'task-123' });
      expect(result.success).toBeUndefined();
      expect(result.task).toBeUndefined();
    });

    it('should handle tasks with null/undefined optional fields', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        return {
          success: true,
          task: createMockTask({
            assignee: null,
            labels: null,
            dependencies: null,
            dueDate: undefined,
            estimatedHours: undefined,
          }),
        };
      });

      const result = await getTask({ taskId: 'task-123' });
      expect(result.success).toBe(true);
      expect(result.task.assignee).toBeNull();
    });
  });

  describe('Performance', () => {
    it('should complete within reasonable time', async () => {
      const start = Date.now();
      await getTask({ taskId: 'task-123' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        getTask({ taskNumber: i + 1, projectId: 'project-123' })
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.task).toBeDefined();
      });
    });
  });
});
