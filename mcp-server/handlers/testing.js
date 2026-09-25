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

import { callEzmodoAPI } from '../lib/http-client.js';

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
  case 'start_run': return startSuiteRun(params);
  case 'record_result': return recordSuiteRunResult(params);
  case 'complete_run': return completeSuiteRun(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified get/list handler for test cases
 */
export async function listTestCases(args) {
  // Single test case lookup
  if (args.testCaseId) {
    return callEzmodoAPI('mcpGetTestCase', {
      projectId: args.projectId,
      caseId: args.testCaseId,
    });
  }

  // List with filters
  return callEzmodoAPI('mcpListTestCases', args);
}

/**
 * Unified get/list handler for test suites
 */
export async function listTestSuites(args) {
  // Single test suite lookup
  if (args.testSuiteId) {
    return callEzmodoAPI('mcpGetTestSuite', {
      projectId: args.projectId,
      suiteId: args.testSuiteId,
    });
  }

  // List with filters
  return callEzmodoAPI('mcpListTestSuites', args);
}

export async function getTestingSummary(args) {
  return callEzmodoAPI('mcpGetTestingSummary', args);
}

// --- Private helpers ---

async function createTestCase(args) {
  return callEzmodoAPI('mcpCreateTestCase', args);
}

async function updateTestCase(args) {
  return callEzmodoAPI('mcpUpdateTestCase', args);
}

async function deleteTestCase(args) {
  return callEzmodoAPI('mcpDeleteTestCase', args);
}

async function recordTestRun(args) {
  return callEzmodoAPI('mcpRecordTestRun', args);
}

async function createTestSuite(args) {
  return callEzmodoAPI('mcpCreateTestSuite', args);
}

async function updateTestSuite(args) {
  return callEzmodoAPI('mcpUpdateTestSuite', args);
}

async function deleteTestSuite(args) {
  return callEzmodoAPI('mcpDeleteTestSuite', args);
}

async function addCasesToSuite(args) {
  return callEzmodoAPI('mcpAddCasesToSuite', args);
}

async function removeCasesFromSuite(args) {
  return callEzmodoAPI('mcpRemoveCasesFromSuite', args);
}

// --- Suite runs (E-262 #2818) ---

function requireFields(args, keys, action) {
  const missing = keys.filter((k) => !args[k]);
  if (missing.length) throw new Error(`${action} needs ${missing.join(', ')}.`);
}

async function startSuiteRun(args) {
  requireFields(args, ['projectId', 'suiteId'], 'start_run');
  const body = { projectId: args.projectId, suiteId: args.suiteId };
  for (const k of ['environment', 'releaseCandidateId', 'commitSha', 'notes', 'assigneeId', 'assigneeName']) {
    if (args[k]) body[k] = args[k];
  }
  return callEzmodoAPI('mcpStartSuiteRun', body);
}

async function recordSuiteRunResult(args) {
  requireFields(args, ['projectId', 'suiteId', 'runId', 'caseId', 'overallStatus'], 'record_result');
  const body = {
    projectId: args.projectId, suiteId: args.suiteId, runId: args.runId,
    caseId: args.caseId, overallStatus: args.overallStatus,
  };
  if (args.notes) body.notes = args.notes;
  if (args.duration) body.duration = args.duration;
  return callEzmodoAPI('mcpRecordSuiteRunResult', body);
}

async function completeSuiteRun(args) {
  requireFields(args, ['projectId', 'suiteId', 'runId'], 'complete_run');
  return callEzmodoAPI('mcpUpdateSuiteRunStatus', {
    projectId: args.projectId, suiteId: args.suiteId, runId: args.runId, status: args.status || 'completed',
  });
}
