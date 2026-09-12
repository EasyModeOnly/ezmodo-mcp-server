/**
 * Testing Tools
 * MCP tools for managing test cases, test suites, and test runs
 *
 * Consolidated:
 * - manage_test_case (create/update/delete/record_run)
 * - manage_test_suite (create/update/delete/add_cases/remove_cases)
 * - list_test_cases (get single or list with filters)
 * - list_test_suites (get single or list with filters)
 * - get_testing_summary (unchanged)
 */

import { LINKS_ARRAY_SCHEMA } from './link-params.js';

export const TESTING_TOOLS = [
  {
    name: 'manage_test_case',
    description: 'Create, update, delete test cases, or record a test run. ' +
      'Test cases belong to projects and define verification criteria with optional structured steps.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'record_run'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        projectId: {
          type: 'string',
          description: 'Project ID (required for all actions)',
        },
        caseId: {
          type: 'string',
          description: 'Test case ID (required for update, delete, record_run)',
        },
        // --- Create/update fields ---
        title: {
          type: 'string',
          description: 'Test case title (required for create, optional for update)',
        },
        description: {
          type: 'string',
          description: 'Description of what this test case verifies. Used by create and update.',
        },
        preconditions: {
          type: 'string',
          description: 'Preconditions before executing the test. Used by create and update.',
        },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instruction: {
                type: 'string',
                description: 'The step instruction to execute',
              },
              expectedResult: {
                type: 'string',
                description: 'The expected result after executing the step',
              },
            },
          },
          description: 'Ordered list of test steps. Used by create and update.',
        },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Priority level. Used by create and update.',
        },
        category: {
          type: 'string',
          description: 'Test category (e.g., "functional", "regression", "edge-case"). Used by create and update.',
        },
        links: LINKS_ARRAY_SCHEMA,
        environments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target environments (e.g., ["staging", "production"]). Used by create and update.',
        },
        lifecycleStatus: {
          type: 'string',
          enum: ['active', 'needs_review', 'stale', 'deprecated'],
          description: 'Lifecycle status. Used by create and update.',
        },
        retention: {
          type: 'string',
          enum: ['transient', 'persistent'],
          description: 'Retention type: transient (auto-cleaned) or persistent. Used by create and update.',
        },
        // --- Create-only fields ---
        originTaskId: {
          type: 'string',
          description: 'Origin task ID that generated this test case (create only)',
        },
        taskId: {
          type: 'string',
          description: 'Deprecated: use originTaskId instead (create only)',
        },
        linkedTaskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task IDs this test case is linked to (create only)',
        },
        epicId: {
          type: 'string',
          description: 'Optional epic ID for context (create only)',
        },
        userName: {
          type: 'string',
          description: 'Name of the user creating the test case. Used by create and record_run.',
        },
        // --- Record run fields ---
        overallStatus: {
          type: 'string',
          enum: ['pass', 'fail', 'skip', 'blocked'],
          description: 'Overall result of the test run (required for record_run)',
        },
        stepResults: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              stepId: {
                type: 'string',
                description: 'The ID of the step',
              },
              status: {
                type: 'string',
                description: 'Result status for this step (pass/fail/skip/blocked)',
              },
              actualResult: {
                type: 'string',
                description: 'What actually happened when the step was executed',
              },
            },
          },
          description: 'Per-step execution results (record_run only)',
        },
        notes: {
          type: 'string',
          description: 'Additional notes about the test run (record_run only)',
        },
        environment: {
          type: 'string',
          description: 'Environment where the test was executed e.g. "staging" (record_run only)',
        },
        duration: {
          type: 'number',
          description: 'Duration of the test run in milliseconds (record_run only)',
        },
      },
      required: ['action', 'projectId'],
    },
  },
  {
    name: 'manage_test_suite',
    description: 'Create, update, delete test suites, or add/remove cases from a suite. ' +
      'Suites are project-level groupings of test cases (e.g., regression, smoke, acceptance).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'add_cases', 'remove_cases'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        projectId: {
          type: 'string',
          description: 'Project ID (required for all actions)',
        },
        suiteId: {
          type: 'string',
          description: 'Test suite ID (required for update, delete, add_cases, remove_cases)',
        },
        // --- Create/update fields ---
        title: {
          type: 'string',
          description: 'Suite title (required for create, optional for update)',
        },
        description: {
          type: 'string',
          description: 'Suite description. Used by create and update.',
        },
        category: {
          type: 'string',
          enum: ['regression', 'smoke', 'acceptance', 'integration', 'custom'],
          description: 'Suite category (defaults to "custom"). Used by create and update.',
        },
        links: LINKS_ARRAY_SCHEMA,
        // --- Create-only fields ---
        organizationId: {
          type: 'string',
          description: 'Organization ID — auto-resolved from API key if not provided (create only)',
        },
        userName: {
          type: 'string',
          description: 'Name of the user creating the suite (create only)',
        },
        // --- Add/remove cases fields ---
        cases: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              caseId: {
                type: 'string',
                description: 'The test case ID',
              },
              taskId: {
                type: 'string',
                description: 'Optional: the task ID the test case is linked to',
              },
            },
            required: ['caseId'],
          },
          description: 'Array of test case references (required for add_cases, remove_cases)',
        },
      },
      required: ['action', 'projectId'],
    },
  },
  {
    name: 'list_test_cases',
    description: 'List test cases or get a single test case. ' +
      'Provide testCaseId (+ projectId) for single lookup, or projectId with optional filters for listing.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        // --- Single lookup ---
        testCaseId: {
          type: 'string',
          description: 'Test case ID for single lookup',
        },
        // --- List filters ---
        originTaskId: {
          type: 'string',
          description: 'Filter by origin task ID',
        },
        taskId: {
          type: 'string',
          description: 'Deprecated: use originTaskId instead',
        },
        category: {
          type: 'string',
          description: 'Filter by test category (e.g., "functional", "regression")',
        },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'medium', 'low'],
          description: 'Filter by priority level',
        },
        status: {
          type: 'string',
          enum: ['not_run', 'pass', 'fail', 'skip', 'blocked'],
          description: 'Filter by latest run status',
        },
        epicId: {
          type: 'string',
          description: 'Filter by epic ID',
        },
        lifecycleStatus: {
          type: 'string',
          enum: ['active', 'needs_review', 'stale', 'deprecated'],
          description: 'Filter by lifecycle status',
        },
        retention: {
          type: 'string',
          enum: ['transient', 'persistent'],
          description: 'Filter by retention type',
        },
        limit: {
          type: 'number',
          description: 'Max results per page (default 50, max 200)',
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_test_suites',
    description: 'List test suites or get a single test suite. ' +
      'Provide testSuiteId (+ projectId) for single lookup, or projectId with optional filters for listing.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        // --- Single lookup ---
        testSuiteId: {
          type: 'string',
          description: 'Test suite ID for single lookup',
        },
        // --- List filters ---
        category: {
          type: 'string',
          enum: ['regression', 'smoke', 'acceptance', 'integration', 'custom'],
          description: 'Filter by suite category',
        },
        limit: {
          type: 'number',
          description: 'Max results per page (default 50, max 200)',
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_testing_summary',
    description: 'Get aggregate test statistics for a project (or a specific task) ' +
      'including pass/fail counts, coverage, recent run history, and ' +
      'per-environment breakdowns.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        taskId: {
          type: 'string',
          description: 'Optional: filter summary to a specific task',
        },
      },
      required: ['projectId'],
    },
  },
];
