/**
 * Test utilities for MCP server
 * Provides mocks and helpers for testing MCP functions
 */

import { jest } from '@jest/globals';

/**
 * Mock implementation of callZephlyAPI for testing
 * Returns predictable responses based on endpoint name
 */
export function createMockCallZephlyAPI() {
  const mockImplementation = jest.fn(async (endpoint, args) => {
    // Mock responses for different endpoints
    switch (endpoint) {
      case 'mcpGetTask':
        // Simulate task retrieval by ID or task number
        if (args.taskId) {
          return {
            success: true,
            task: createMockTask({ id: args.taskId }),
          };
        } else if (args.taskNumber && args.projectId) {
          return {
            success: true,
            task: createMockTask({
              id: `task-${args.taskNumber}`,
              taskNumber: args.taskNumber,
              projectId: args.projectId,
            }),
          };
        }
        throw new Error('Invalid parameters for mcpGetTask');

      case 'mcpSearchTasks':
        return {
          success: true,
          tasks: [
            createMockTask({ id: 'task-1', title: 'Task 1' }),
            createMockTask({ id: 'task-2', title: 'Task 2' }),
          ],
          count: 2,
          searchType: 'basic',
        };

      case 'mcpCreateTask':
        return {
          success: true,
          taskId: 'new-task-id',
          taskNumber: 42,
          task: createMockTask({
            id: 'new-task-id',
            taskNumber: 42,
            ...args,
          }),
        };

      case 'mcpUpdateTask':
        return {
          success: true,
          message: 'Task updated successfully',
        };

      case 'mcpCompleteTask':
        return {
          success: true,
          message: 'Task completed successfully',
        };

      case 'mcpDeferTask':
        return {
          success: true,
          deferredEpicId: 'epic-deferred-1',
          newTaskId: args.stepId ? 'task-promoted-1' : undefined,
          newTaskNumber: args.stepId ? 42 : undefined,
          parentUpdated: true,
          alreadyDeferred: false,
        };

      case 'mcpGetProjectContext':
        return {
          success: true,
          context: {
            projectId: args.projectId,
            name: 'Test Project',
            description: 'A test project',
            knowledge: [],
            memory: {},
          },
        };

      default:
        throw new Error(`Unhandled endpoint in mock: ${endpoint}`);
    }
  });

  return mockImplementation;
}

/**
 * Creates a mock task object with default values
 */
export function createMockTask(overrides = {}) {
  return {
    id: 'test-task-id',
    taskNumber: 1,
    projectId: 'test-project-id',
    organizationId: 'test-org-id',
    title: 'Test Task',
    description: 'A test task description',
    status: 'todo',
    priority: 'medium',
    assignee: null,
    labels: [],
    dependencies: [],
    context: {
      history: [],
      knowledge: [],
      artifacts: [],
    },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Creates a mock project object
 */
export function createMockProject(overrides = {}) {
  return {
    id: 'test-project-id',
    organizationId: 'test-org-id',
    name: 'Test Project',
    description: 'A test project',
    slug: 'test-project',
    complexity: 'full',
    members: [],
    views: [],
    contexts: [],
    settings: {},
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Creates a mock epic object
 */
export function createMockEpic(overrides = {}) {
  return {
    id: 'test-epic-id',
    projectId: 'test-project-id',
    title: 'Test Epic',
    description: 'A test epic',
    status: 'active',
    progress: 0,
    successCriteria: [],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Creates a mock error response
 */
export function createMockError(message, code = 500) {
  const error = new Error(message);
  error.status = code;
  return error;
}

/**
 * Waits for all pending promises to resolve
 * Useful for testing async operations
 */
export function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}
