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
  case 'bulk': return bulkTestCases(params);
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
  // Run history for one case, paged newest first
  if (args.testCaseId && args.runHistory) {
    return callEzmodoAPI('mcpListTestCaseRuns', {
      projectId: args.projectId,
      caseId: args.testCaseId,
      ...(args.limit ? { limit: args.limit } : {}),
      ...(args.before ? { before: args.before } : {}),
    });
  }

  // Single test case lookup
  if (args.testCaseId) {
    return callEzmodoAPI('mcpGetTestCase', {
      projectId: args.projectId,
      caseId: args.testCaseId,
    });
  }

  // Counts per group (suite, category, priority or status) instead of cases
  if (args.countBy) {
    const { countBy, ...filters } = args;
    return callEzmodoAPI('mcpGroupTestCases', { ...filters, by: countBy });
  }

  // List with filters
  return callEzmodoAPI('mcpListTestCases', args);
}

/**
 * Unified get/list handler for test suites
 */
export async function listTestSuites(args) {
  if (args.runs) return listTestRuns(args);

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

/**
 * Start a run (E-278 #3032): one suite, several (a plan run), explicit cases
 * or a Cases filter (an ad-hoc run). Always the project-level endpoint; one
 * suite there is an ordinary suite run.
 */
async function startSuiteRun(args) {
  requireFields(args, ['projectId'], 'start_run');
  const body = { projectId: args.projectId };
  if (args.suiteIds?.length) body.suiteIds = args.suiteIds;
  else if (args.suiteId) body.suiteIds = [args.suiteId];
  if (args.caseIds?.length) body.caseIds = args.caseIds;
  if (args.filter) body.filter = args.filter;
  if (!body.suiteIds && !body.caseIds && !body.filter) {
    throw new Error('start_run needs suiteId, suiteIds, caseIds or filter.');
  }
  if (args.runTitle) body.title = args.runTitle;
  if (args.assignments?.length) body.assignments = args.assignments;
  const passThrough = ['environment', 'environmentId', 'releaseCandidateId', 'commitSha', 'notes', 'assigneeId', 'assigneeName'];
  for (const k of passThrough) {
    if (args[k]) body[k] = args[k];
  }
  return callEzmodoAPI('mcpStartProjectRun', body);
}

/**
 * List runs across the project, or get one (runId).
 */
async function listTestRuns(args) {
  requireFields(args, ['projectId'], 'list_test_suites runs');
  if (args.runId) {
    return callEzmodoAPI('mcpGetTestRun', { projectId: args.projectId, runId: args.runId });
  }
  const query = { projectId: args.projectId };
  if (args.runStatus) query.status = args.runStatus;
  for (const k of ['suiteId', 'environment', 'releaseCandidateId', 'assigneeId', 'trigger', 'cursor', 'limit']) {
    if (args[k]) query[k] = args[k];
  }
  return callEzmodoAPI('mcpListTestRuns', query);
}

async function recordSuiteRunResult(args) {
  requireFields(args, ['projectId', 'runId', 'caseId', 'overallStatus'], 'record_result');
  const body = {
    projectId: args.projectId, runId: args.runId,
    caseId: args.caseId, overallStatus: args.overallStatus,
  };
  if (args.suiteId) body.suiteId = args.suiteId;
  if (args.notes) body.notes = args.notes;
  if (args.duration) body.duration = args.duration;
  return callEzmodoAPI('mcpRecordSuiteRunResult', body);
}

async function completeSuiteRun(args) {
  requireFields(args, ['projectId', 'runId'], 'complete_run');
  return callEzmodoAPI('mcpUpdateSuiteRunStatus', {
    projectId: args.projectId, runId: args.runId, status: args.status || 'completed',
    ...(args.suiteId ? { suiteId: args.suiteId } : {}),
    ...(args.skipRemaining ? { skipRemaining: true } : {}),
  });
}

/**
 * Apply one action to many cases (E-278 #3031). Targets are caseIds or a
 * Cases-list filter; dryRun only counts them.
 */
async function bulkTestCases(args) {
  requireFields(args, ['projectId', 'bulkAction'], 'bulk');
  const { bulkAction, projectId, caseIds, filter, dryRun, priority, category, lifecycleStatus, suiteId } = args;
  return callEzmodoAPI('mcpBulkTestCases', {
    projectId, action: bulkAction, caseIds, filter, dryRun, priority, category, lifecycleStatus, suiteId,
  });
}
