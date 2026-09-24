/**
 * Tests for task CRUD operations
 * Tests create, update, complete, and search tasks
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  createMockCallEzmodoAPI,
  createMockTask,
  createMockError,
} from './test-utils.js';

describe('Task Operations', () => {
  let mockCallEzmodoAPI;

  beforeEach(() => {
    mockCallEzmodoAPI = createMockCallEzmodoAPI();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTask', () => {
    let createTask;

    beforeEach(() => {
      createTask = async (args) => {
        return mockCallEzmodoAPI('mcpCreateTask', args);
      };
    });

    it('should create a task with required fields', async () => {
      const taskData = {
        projectId: 'project-123',
        title: 'New Task',
        description: 'Task description',
      };

      const result = await createTask(taskData);

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.taskNumber).toBeDefined();
      expect(result.task.title).toBe(taskData.title);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateTask', taskData);
    });

    it('should create task with optional fields', async () => {
      const taskData = {
        projectId: 'project-123',
        title: 'Task with all fields',
        description: 'Description',
        priority: 'high',
        assigneeType: 'human',
        assigneeId: 'user-123',
        assigneeName: 'John Doe',
        epicId: 'epic-123',
        labels: ['bug', 'urgent'],
        estimatedHours: 5,
      };

      const result = await createTask(taskData);

      expect(result.success).toBe(true);
      expect(result.task).toMatchObject({
        projectId: taskData.projectId,
        title: taskData.title,
        description: taskData.description,
      });
    });

    it('should assign sequential task number', async () => {
      const result1 = await createTask({
        projectId: 'project-123',
        title: 'Task 1',
        description: 'First task',
      });

      mockCallEzmodoAPI.mockImplementationOnce(async (endpoint, args) => ({
        success: true,
        taskId: 'task-2',
        taskNumber: 43, // Next sequential number
        task: createMockTask({ id: 'task-2', taskNumber: 43, ...args }),
      }));

      const result2 = await createTask({
        projectId: 'project-123',
        title: 'Task 2',
        description: 'Second task',
      });

      expect(result1.taskNumber).toBe(42);
      expect(result2.taskNumber).toBe(43);
    });

    it('should reject task creation without required fields', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (!args.projectId || !args.title) {
          throw createMockError('Missing required fields', 400);
        }
      });

      await expect(createTask({ title: 'No project' })).rejects.toThrow(
        'Missing required fields'
      );
    });

    it('should handle AI assignee', async () => {
      const result = await createTask({
        projectId: 'project-123',
        title: 'AI Task',
        description: 'Task for AI',
        assigneeType: 'ai',
        assigneeId: 'claude',
        assigneeName: 'Claude',
      });

      expect(result.success).toBe(true);
      expect(result.task.assigneeType).toBe('ai');
    });
  });

  describe('updateTask', () => {
    let updateTask;

    beforeEach(() => {
      updateTask = async (args) => {
        return mockCallEzmodoAPI('mcpUpdateTask', args);
      };
    });

    it('should update task title', async () => {
      const result = await updateTask({
        taskId: 'task-123',
        title: 'Updated Title',
      });

      expect(result.success).toBe(true);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateTask', {
        taskId: 'task-123',
        title: 'Updated Title',
      });
    });

    it('should update task status', async () => {
      const result = await updateTask({
        taskId: 'task-123',
        status: 'in_progress',
      });

      expect(result.success).toBe(true);
    });

    it('should update multiple fields', async () => {
      const result = await updateTask({
        taskId: 'task-123',
        title: 'New Title',
        description: 'New Description',
        priority: 'high',
        status: 'in_progress',
      });

      expect(result.success).toBe(true);
    });

    it('should add steps to task', async () => {
      const result = await updateTask({
        taskId: 'task-123',
        addStep: 'Complete implementation',
      });

      expect(result.success).toBe(true);
    });

    it('should toggle step completion', async () => {
      const result = await updateTask({
        taskId: 'task-123',
        toggleStep: {
          stepId: 'step-1',
          completed: true,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should add knowledge to task', async () => {
      const result = await updateTask({
        taskId: 'task-123',
        addKnowledge: [
          {
            type: 'fact',
            content: 'This task requires database migration',
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should reject update without taskId', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (!args.taskId) {
          throw createMockError('taskId is required', 400);
        }
      });

      await expect(updateTask({ title: 'New Title' })).rejects.toThrow(
        'taskId is required'
      );
    });
  });

  describe('completeTask', () => {
    let completeTask;

    beforeEach(() => {
      completeTask = async (args) => {
        return mockCallEzmodoAPI('mcpCompleteTask', args);
      };
    });

    it('should complete a task', async () => {
      const result = await completeTask({
        taskId: 'task-123',
      });

      expect(result.success).toBe(true);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCompleteTask', {
        taskId: 'task-123',
      });
    });

    it('should complete task with completion notes', async () => {
      const result = await completeTask({
        taskId: 'task-123',
        completionNotes: 'Task completed successfully. All tests pass.',
      });

      expect(result.success).toBe(true);
    });

    it('should reject completion without taskId', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (!args.taskId) {
          throw createMockError('taskId is required', 400);
        }
      });

      await expect(completeTask({})).rejects.toThrow('taskId is required');
    });
  });

  describe('deferTask', () => {
    let deferTask;

    beforeEach(() => {
      deferTask = async (args) => {
        return mockCallEzmodoAPI('mcpDeferTask', args);
      };
    });

    it('should defer a whole task and return the deferred epic id', async () => {
      const result = await deferTask({
        taskId: 'task-123',
        reason: 'pushed to next sprint',
      });

      expect(result.success).toBe(true);
      expect(result.deferredEpicId).toBe('epic-deferred-1');
      expect(result.newTaskId).toBeUndefined();
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeferTask', {
        taskId: 'task-123',
        reason: 'pushed to next sprint',
      });
    });

    it('should promote a step and return the new task id', async () => {
      const result = await deferTask({
        taskId: 'task-123',
        reason: 'needs design review',
        stepId: 'step-a',
        unblockedBy: 'PM signoff',
      });

      expect(result.success).toBe(true);
      expect(result.newTaskId).toBe('task-promoted-1');
      expect(result.newTaskNumber).toBe(42);
    });

    it('should surface the no_milestone error from the API', async () => {
      mockCallEzmodoAPI.mockImplementation(async () => {
        throw createMockError('no_milestone: task is not in a milestone', 422);
      });

      await expect(deferTask({ taskId: 't', reason: 'r' })).rejects.toThrow('no_milestone');
    });
  });

  describe('searchTasks', () => {
    let searchTasks;

    beforeEach(() => {
      searchTasks = async (args) => {
        return mockCallEzmodoAPI('mcpSearchTasks', args);
      };
    });

    it('should search tasks by project', async () => {
      const result = await searchTasks({
        projectId: 'project-123',
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toBeInstanceOf(Array);
      expect(result.count).toBeGreaterThanOrEqual(0);
    });

    it('should filter tasks by status', async () => {
      const result = await searchTasks({
        projectId: 'project-123',
        status: 'in_progress',
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toBeInstanceOf(Array);
    });

    it('should search with text query', async () => {
      mockCallEzmodoAPI.mockImplementationOnce(async (endpoint, args) => {
        return {
          success: true,
          tasks: [
            createMockTask({
              id: 'task-1',
              title: 'Fix authentication bug',
            }),
          ],
          count: 1,
          searchType: 'semantic',
          query: args.searchText,
        };
      });

      const result = await searchTasks({
        projectId: 'project-123',
        searchText: 'authentication',
      });

      expect(result.success).toBe(true);
      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.searchType).toBe('semantic');
    });

    it('should filter AI-assigned tasks', async () => {
      const result = await searchTasks({
        projectId: 'project-123',
        assignedToAI: true,
      });

      expect(result.success).toBe(true);
    });

    it('should filter by multiple statuses', async () => {
      const result = await searchTasks({
        projectId: 'project-123',
        status: ['todo', 'in_progress'],
      });

      expect(result.success).toBe(true);
    });

    it('should limit search results', async () => {
      const result = await searchTasks({
        projectId: 'project-123',
        limit: 10,
      });

      expect(result.success).toBe(true);
      expect(result.tasks.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty search results', async () => {
      mockCallEzmodoAPI.mockImplementationOnce(async () => ({
        success: true,
        tasks: [],
        count: 0,
        searchType: 'basic',
      }));

      const result = await searchTasks({
        projectId: 'project-123',
        searchText: 'nonexistent',
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(0);
      expect(result.count).toBe(0);
    });
  });

  describe('Integration scenarios', () => {
    it('should create and then retrieve a task', async () => {
      const createTask = async (args) =>
        mockCallEzmodoAPI('mcpCreateTask', args);
      const getTask = async (args) => mockCallEzmodoAPI('mcpGetTask', args);

      // Create task
      const createResult = await createTask({
        projectId: 'project-123',
        title: 'New Task',
        description: 'Task description',
      });

      expect(createResult.success).toBe(true);
      const taskId = createResult.taskId;

      // Retrieve task by ID
      const getResult = await getTask({ taskId });

      expect(getResult.success).toBe(true);
      expect(getResult.task.id).toBe(taskId);
    });

    it('should create task and retrieve by task number', async () => {
      const createTask = async (args) =>
        mockCallEzmodoAPI('mcpCreateTask', args);
      const getTask = async (args) => mockCallEzmodoAPI('mcpGetTask', args);

      // Create task
      const createResult = await createTask({
        projectId: 'project-123',
        title: 'Task #42',
        description: 'Task with number',
      });

      expect(createResult.taskNumber).toBe(42);

      // Retrieve by task number
      const getResult = await getTask({
        taskNumber: 42,
        projectId: 'project-123',
      });

      expect(getResult.success).toBe(true);
      expect(getResult.task.taskNumber).toBe(42);
    });

    it('should update and then retrieve a task', async () => {
      const updateTask = async (args) =>
        mockCallEzmodoAPI('mcpUpdateTask', args);
      const getTask = async (args) => mockCallEzmodoAPI('mcpGetTask', args);

      // Update task
      const updateResult = await updateTask({
        taskId: 'task-123',
        title: 'Updated Title',
        status: 'in_progress',
      });

      expect(updateResult.success).toBe(true);

      // Retrieve updated task
      const getResult = await getTask({ taskId: 'task-123' });

      expect(getResult.success).toBe(true);
      expect(getResult.task.id).toBe('task-123');
    });
  });
});
