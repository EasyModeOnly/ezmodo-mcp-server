/**
 * Tests for testing (test case) MCP tool operations
 * Tests CRUD for test cases, test runs, summaries, and AI generation
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock test case data
function createMockTestCase(overrides = {}) {
  return {
    id: 'case-123',
    taskId: 'task-123',
    organizationId: 'org-123',
    epicId: 'epic-123',
    title: 'Test login form validation',
    description: 'Verify login form validates inputs correctly',
    preconditions: 'User is on the login page',
    steps: [
      { id: 'step_0', order: 0, instruction: 'Enter invalid email', expectedResult: 'Error shown' },
      { id: 'step_1', order: 1, instruction: 'Enter valid email', expectedResult: 'No error' },
    ],
    priority: 'high',
    category: 'functional',
    lifecycleStatus: 'active',
    latestStatus: 'not_run',
    createdBy: 'user-123',
    createdByName: 'Test User',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockSummary(overrides = {}) {
  return {
    totalCases: 5,
    passCount: 3,
    failCount: 1,
    skipCount: 0,
    blockedCount: 0,
    notRunCount: 1,
    ...overrides,
  };
}

describe('Testing Tools', () => {
  let mockCallEzmodoAPI;

  beforeEach(() => {
    mockCallEzmodoAPI = jest.fn(async (endpoint, args) => {
      switch (endpoint) {
        case 'mcpListTestCases':
          return {
            cases: [
              createMockTestCase({ id: 'case-1', title: 'Test case 1' }),
              createMockTestCase({ id: 'case-2', title: 'Test case 2' }),
            ],
          };

        case 'mcpGetTestCase':
          return {
            testCase: createMockTestCase({ id: args.caseId, taskId: args.taskId }),
          };

        case 'mcpCreateTestCase':
          return {
            caseId: 'new-case-id',
          };

        case 'mcpUpdateTestCase':
          return {
            status: 'success',
          };

        case 'mcpDeleteTestCase':
          return {
            status: 'success',
          };

        case 'mcpRecordTestRun':
          return {
            runId: 'run-123',
          };

        case 'mcpGetTestingSummary':
          return {
            summary: createMockSummary(),
          };

        default:
          throw new Error(`Unhandled endpoint in mock: ${endpoint}`);
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTestCases', () => {
    let listTestCases;

    beforeEach(() => {
      listTestCases = async (args) => mockCallEzmodoAPI('mcpListTestCases', args);
    });

    it('should list test cases for a task', async () => {
      const result = await listTestCases({ taskId: 'task-123' });

      expect(result.cases).toHaveLength(2);
      expect(result.cases[0].title).toBe('Test case 1');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListTestCases', { taskId: 'task-123' });
    });
  });

  describe('getTestCase', () => {
    let getTestCase;

    beforeEach(() => {
      getTestCase = async (args) => mockCallEzmodoAPI('mcpGetTestCase', args);
    });

    it('should get a specific test case', async () => {
      const result = await getTestCase({ taskId: 'task-123', caseId: 'case-456' });

      expect(result.testCase).toBeDefined();
      expect(result.testCase.id).toBe('case-456');
      expect(result.testCase.taskId).toBe('task-123');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetTestCase', {
        taskId: 'task-123',
        caseId: 'case-456',
      });
    });
  });

  describe('createTestCase', () => {
    let createTestCase;

    beforeEach(() => {
      createTestCase = async (args) => mockCallEzmodoAPI('mcpCreateTestCase', args);
    });

    it('should create a test case with required fields', async () => {
      const data = {
        taskId: 'task-123',
        title: 'New test case',
      };

      const result = await createTestCase(data);

      expect(result.caseId).toBe('new-case-id');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateTestCase', data);
    });

    it('should create a test case with all fields', async () => {
      const data = {
        taskId: 'task-123',
        title: 'Full test case',
        description: 'Detailed description',
        preconditions: 'User is logged in',
        steps: [
          { instruction: 'Click button', expectedResult: 'Form submits' },
        ],
        priority: 'critical',
        category: 'regression',
        epicId: 'epic-123',
        userName: 'Test User',
      };

      const result = await createTestCase(data);

      expect(result.caseId).toBe('new-case-id');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateTestCase', data);
    });

    it('should reject creation without required fields', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (!args.taskId || !args.title) {
          throw new Error('Missing required fields');
        }
      });

      await expect(createTestCase({ taskId: 'task-123' })).rejects.toThrow('Missing required fields');
      await expect(createTestCase({ title: 'No task' })).rejects.toThrow('Missing required fields');
    });
  });

  describe('updateTestCase', () => {
    let updateTestCase;

    beforeEach(() => {
      updateTestCase = async (args) => mockCallEzmodoAPI('mcpUpdateTestCase', args);
    });

    it('should update a test case', async () => {
      const data = {
        taskId: 'task-123',
        caseId: 'case-456',
        title: 'Updated title',
        priority: 'low',
      };

      const result = await updateTestCase(data);

      expect(result.status).toBe('success');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateTestCase', data);
    });

    it('should update lifecycle status', async () => {
      const data = {
        taskId: 'task-123',
        caseId: 'case-456',
        lifecycleStatus: 'deprecated',
      };

      const result = await updateTestCase(data);

      expect(result.status).toBe('success');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateTestCase', data);
    });

    it('should update test case steps', async () => {
      const data = {
        taskId: 'task-123',
        caseId: 'case-456',
        steps: [
          { instruction: 'New step 1', expectedResult: 'Result 1' },
          { instruction: 'New step 2', expectedResult: 'Result 2' },
        ],
      };

      const result = await updateTestCase(data);
      expect(result.status).toBe('success');
    });
  });

  describe('deleteTestCase', () => {
    let deleteTestCase;

    beforeEach(() => {
      deleteTestCase = async (args) => mockCallEzmodoAPI('mcpDeleteTestCase', args);
    });

    it('should delete a test case', async () => {
      const result = await deleteTestCase({ taskId: 'task-123', caseId: 'case-456' });

      expect(result.status).toBe('success');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteTestCase', {
        taskId: 'task-123',
        caseId: 'case-456',
      });
    });
  });

  describe('recordTestRun', () => {
    let recordTestRun;

    beforeEach(() => {
      recordTestRun = async (args) => mockCallEzmodoAPI('mcpRecordTestRun', args);
    });

    it('should record a test run with required fields', async () => {
      const data = {
        taskId: 'task-123',
        caseId: 'case-456',
        overallStatus: 'pass',
      };

      const result = await recordTestRun(data);

      expect(result.runId).toBe('run-123');
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpRecordTestRun', data);
    });

    it('should record a test run with all fields', async () => {
      const data = {
        taskId: 'task-123',
        caseId: 'case-456',
        overallStatus: 'fail',
        stepResults: [
          { stepId: 'step_0', status: 'pass', actualResult: 'Error shown correctly' },
          { stepId: 'step_1', status: 'fail', actualResult: 'Error still shown' },
        ],
        notes: 'Bug in validation logic',
        environment: 'staging',
        duration: 5000,
        userName: 'QA Tester',
      };

      const result = await recordTestRun(data);
      expect(result.runId).toBe('run-123');
    });

    it('should reject run without required fields', async () => {
      mockCallEzmodoAPI.mockImplementation(async (endpoint, args) => {
        if (!args.overallStatus) {
          throw new Error('Missing required field: overallStatus');
        }
      });

      await expect(
        recordTestRun({ taskId: 'task-123', caseId: 'case-456' })
      ).rejects.toThrow('Missing required field: overallStatus');
    });
  });

  describe('getTestingSummary', () => {
    let getTestingSummary;

    beforeEach(() => {
      getTestingSummary = async (args) => mockCallEzmodoAPI('mcpGetTestingSummary', args);
    });

    it('should get testing summary for a task', async () => {
      const result = await getTestingSummary({ taskId: 'task-123' });

      expect(result.summary).toBeDefined();
      expect(result.summary.totalCases).toBe(5);
      expect(result.summary.passCount).toBe(3);
      expect(result.summary.failCount).toBe(1);
      expect(result.summary.notRunCount).toBe(1);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetTestingSummary', { taskId: 'task-123' });
    });
  });

});
