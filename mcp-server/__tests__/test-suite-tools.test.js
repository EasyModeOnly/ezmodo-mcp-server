/**
 * Tests for test suite MCP tool operations
 * Tests CRUD for test suites and suite membership (add/remove cases)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock test suite data
function createMockTestSuite(overrides = {}) {
  return {
    id: 'suite-123',
    projectId: 'project-123',
    organizationId: 'org-123',
    title: 'Regression Suite',
    description: 'Core regression tests',
    category: 'regression',
    testCaseCount: 5,
    passRate: 0.8,
    createdBy: 'user-123',
    createdByName: 'Test User',
    createdAt: '2024-01-01T00:00:00Z',
    isDeleted: false,
    ...overrides,
  };
}

describe('Test Suite Tools', () => {
  let mockCallZephlyAPI;

  beforeEach(() => {
    mockCallZephlyAPI = jest.fn(async (endpoint, args) => {
      switch (endpoint) {
        case 'mcpListTestSuites':
          return {
            suites: [
              createMockTestSuite({ id: 'suite-1', title: 'Regression Suite' }),
              createMockTestSuite({ id: 'suite-2', title: 'Smoke Suite', category: 'smoke' }),
            ],
            nextCursor: '',
            hasMore: false,
            count: 2,
          };

        case 'mcpGetTestSuite':
          return {
            suite: createMockTestSuite({ id: args.suiteId }),
          };

        case 'mcpCreateTestSuite':
          return {
            suiteId: 'new-suite-id',
          };

        case 'mcpUpdateTestSuite':
          return {
            status: 'success',
          };

        case 'mcpDeleteTestSuite':
          return {
            status: 'success',
          };

        case 'mcpAddCasesToSuite':
          return {
            status: 'success',
          };

        case 'mcpRemoveCasesFromSuite':
          return {
            status: 'success',
          };

        default:
          throw new Error(`Unhandled endpoint in mock: ${endpoint}`);
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTestSuites', () => {
    let listTestSuites;

    beforeEach(() => {
      listTestSuites = async (args) => mockCallZephlyAPI('mcpListTestSuites', args);
    });

    it('should list test suites for a project', async () => {
      const result = await listTestSuites({ projectId: 'project-123' });

      expect(result.suites).toHaveLength(2);
      expect(result.suites[0].title).toBe('Regression Suite');
      expect(result.count).toBe(2);
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListTestSuites', { projectId: 'project-123' });
    });

    it('should pass category filter', async () => {
      await listTestSuites({ projectId: 'project-123', category: 'smoke' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListTestSuites', {
        projectId: 'project-123',
        category: 'smoke',
      });
    });

    it('should pass pagination params', async () => {
      await listTestSuites({ projectId: 'project-123', limit: 10, cursor: 'abc' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListTestSuites', {
        projectId: 'project-123',
        limit: 10,
        cursor: 'abc',
      });
    });
  });

  describe('getTestSuite', () => {
    let getTestSuite;

    beforeEach(() => {
      getTestSuite = async (args) => mockCallZephlyAPI('mcpGetTestSuite', args);
    });

    it('should get a specific test suite', async () => {
      const result = await getTestSuite({ projectId: 'project-123', suiteId: 'suite-456' });

      expect(result.suite).toBeDefined();
      expect(result.suite.id).toBe('suite-456');
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetTestSuite', { projectId: 'project-123', suiteId: 'suite-456' });
    });
  });

  describe('createTestSuite', () => {
    let createTestSuite;

    beforeEach(() => {
      createTestSuite = async (args) => mockCallZephlyAPI('mcpCreateTestSuite', args);
    });

    it('should create a test suite with required fields', async () => {
      const data = {
        projectId: 'project-123',
        title: 'New Suite',
      };

      const result = await createTestSuite(data);

      expect(result.suiteId).toBe('new-suite-id');
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateTestSuite', data);
    });

    it('should create a test suite with all fields', async () => {
      const data = {
        projectId: 'project-123',
        title: 'Full Suite',
        description: 'Complete regression suite',
        category: 'regression',
        organizationId: 'org-123',
        userName: 'Test User',
      };

      const result = await createTestSuite(data);

      expect(result.suiteId).toBe('new-suite-id');
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateTestSuite', data);
    });

    it('should reject creation without required fields', async () => {
      mockCallZephlyAPI.mockImplementation(async (endpoint, args) => {
        if (!args.projectId || !args.title) {
          throw new Error('Missing required fields');
        }
      });

      await expect(createTestSuite({ projectId: 'project-123' })).rejects.toThrow('Missing required fields');
      await expect(createTestSuite({ title: 'No project' })).rejects.toThrow('Missing required fields');
    });
  });

  describe('updateTestSuite', () => {
    let updateTestSuite;

    beforeEach(() => {
      updateTestSuite = async (args) => mockCallZephlyAPI('mcpUpdateTestSuite', args);
    });

    it('should update a test suite', async () => {
      const data = {
        projectId: 'project-123',
        suiteId: 'suite-123',
        title: 'Updated Suite',
        category: 'smoke',
      };

      const result = await updateTestSuite(data);

      expect(result.status).toBe('success');
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUpdateTestSuite', data);
    });

    it('should update description only', async () => {
      const data = {
        projectId: 'project-123',
        suiteId: 'suite-123',
        description: 'Updated description',
      };

      const result = await updateTestSuite(data);
      expect(result.status).toBe('success');
    });
  });

  describe('deleteTestSuite', () => {
    let deleteTestSuite;

    beforeEach(() => {
      deleteTestSuite = async (args) => mockCallZephlyAPI('mcpDeleteTestSuite', args);
    });

    it('should delete a test suite', async () => {
      const result = await deleteTestSuite({ projectId: 'project-123', suiteId: 'suite-123' });

      expect(result.status).toBe('success');
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpDeleteTestSuite', { projectId: 'project-123', suiteId: 'suite-123' });
    });
  });

  describe('addCasesToSuite', () => {
    let addCasesToSuite;

    beforeEach(() => {
      addCasesToSuite = async (args) => mockCallZephlyAPI('mcpAddCasesToSuite', args);
    });

    it('should add cases to a suite', async () => {
      const data = {
        projectId: 'project-123',
        suiteId: 'suite-123',
        cases: [
          { taskId: 'task-1', caseId: 'case-1' },
          { taskId: 'task-2', caseId: 'case-2' },
        ],
      };

      const result = await addCasesToSuite(data);

      expect(result.status).toBe('success');
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpAddCasesToSuite', data);
    });

    it('should reject without cases', async () => {
      mockCallZephlyAPI.mockImplementation(async (endpoint, args) => {
        if (!args.cases || args.cases.length === 0) {
          throw new Error('Missing required field: cases');
        }
      });

      await expect(
        addCasesToSuite({ projectId: 'project-123', suiteId: 'suite-123', cases: [] })
      ).rejects.toThrow('Missing required field: cases');
    });
  });

  describe('removeCasesFromSuite', () => {
    let removeCasesFromSuite;

    beforeEach(() => {
      removeCasesFromSuite = async (args) => mockCallZephlyAPI('mcpRemoveCasesFromSuite', args);
    });

    it('should remove cases from a suite', async () => {
      const data = {
        projectId: 'project-123',
        suiteId: 'suite-123',
        cases: [
          { taskId: 'task-1', caseId: 'case-1' },
        ],
      };

      const result = await removeCasesFromSuite(data);

      expect(result.status).toBe('success');
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpRemoveCasesFromSuite', data);
    });

    it('should reject without cases', async () => {
      mockCallZephlyAPI.mockImplementation(async (endpoint, args) => {
        if (!args.cases || args.cases.length === 0) {
          throw new Error('Missing required field: cases');
        }
      });

      await expect(
        removeCasesFromSuite({ projectId: 'project-123', suiteId: 'suite-123', cases: [] })
      ).rejects.toThrow('Missing required field: cases');
    });
  });
});
