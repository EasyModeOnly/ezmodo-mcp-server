/**
 * Testing Handlers
 * Handler functions for testing-related MCP tools
 *
 * Consolidated:
 * - manageTestCase dispatches create/update/delete/record_run
 * - manageTestSuite dispatches create/update/delete/add_cases/remove_cases
 * - listTestCases unifies get_test_case + list_test_cases
 * - listTestSuites unifies get_test_suite + list_test_suites
 * - getTestingSummary unchanged
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_test_case actions to the appropriate handler
 */
export async function manageTestCase(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createTestCase(params);
  case 'update': return updateTestCase(params);
  case 'delete': return deleteTestCase(params);
  case 'record_run': return recordTestRun(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Dispatch manage_test_suite actions to the appropriate handler
 */
export async function manageTestSuite(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createTestSuite(params);
  case 'update': return updateTestSuite(params);
  case 'delete': return deleteTestSuite(params);
  case 'add_cases': return addCasesToSuite(params);
  case 'remove_cases': return removeCasesFromSuite(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified get/list handler for test cases
 */
export async function listTestCases(args) {
  // Single test case lookup
  if (args.testCaseId) {
    return callZephlyAPI('mcpGetTestCase', {
      projectId: args.projectId,
      caseId: args.testCaseId,
    });
  }

  // List with filters
  return callZephlyAPI('mcpListTestCases', args);
}

/**
 * Unified get/list handler for test suites
 */
export async function listTestSuites(args) {
  // Single test suite lookup
  if (args.testSuiteId) {
    return callZephlyAPI('mcpGetTestSuite', {
      projectId: args.projectId,
      suiteId: args.testSuiteId,
    });
  }

  // List with filters
  return callZephlyAPI('mcpListTestSuites', args);
}

export async function getTestingSummary(args) {
  return callZephlyAPI('mcpGetTestingSummary', args);
}

// --- Private helpers ---

async function createTestCase(args) {
  return callZephlyAPI('mcpCreateTestCase', args);
}

async function updateTestCase(args) {
  return callZephlyAPI('mcpUpdateTestCase', args);
}

async function deleteTestCase(args) {
  return callZephlyAPI('mcpDeleteTestCase', args);
}

async function recordTestRun(args) {
  return callZephlyAPI('mcpRecordTestRun', args);
}

async function createTestSuite(args) {
  return callZephlyAPI('mcpCreateTestSuite', args);
}

async function updateTestSuite(args) {
  return callZephlyAPI('mcpUpdateTestSuite', args);
}

async function deleteTestSuite(args) {
  return callZephlyAPI('mcpDeleteTestSuite', args);
}

async function addCasesToSuite(args) {
  return callZephlyAPI('mcpAddCasesToSuite', args);
}

async function removeCasesFromSuite(args) {
  return callZephlyAPI('mcpRemoveCasesFromSuite', args);
}
