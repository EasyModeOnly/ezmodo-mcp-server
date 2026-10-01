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
      'Test cases belong to projects and define verification criteria with optional structured steps. ' +
      'action "bulk" applies one bulkAction to many cases (caseIds or a filter, max 500); dryRun first.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'record_run', 'bulk'],
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
          enum: ['functional', 'regression', 'edge_case', 'error_handling', 'performance', 'security', 'accessibility'],
          description: 'Test category. Used by create, update and bulk set_category. Spelling variants such as ' +
            '"Edge-case" are folded; anything else is rejected.',
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
        externalKey: {
          type: 'string',
          description: 'The id a test runner reports for this case (JUnit classname.name), which CI results ' +
            'match on; unique per project. "" clears it. Update only.',
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
        releaseCandidateId: {
          type: 'string',
          description: 'Release candidate that was tested, so readiness can count it (record_run only)',
        },
        commitSha: {
          type: 'string',
          description: 'Commit that was tested (record_run only)',
        },
        // --- bulk ---
        bulkAction: {
          type: 'string',
          enum: ['set_priority', 'set_category', 'set_lifecycle', 'add_to_suite', 'delete'],
          description: 'bulk: what to do to every target case. Reads priority, category, lifecycleStatus or suiteId.',
        },
        caseIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'bulk: the cases to act on (max 500). Or give filter instead.',
        },
        filter: {
          type: 'object',
          description: 'bulk: act on every case matching this Cases-list filter: search, statuses, priorities, ' +
            'categories, lifecycleStatuses, retentions, suiteIds, notInSuiteId. Refused if more than 500 match.',
        },
        dryRun: {
          type: 'boolean',
          description: 'bulk: only report how many cases match; change nothing. Use it before a delete.',
        },
        suiteId: {
          type: 'string',
          description: 'bulk add_to_suite: the suite to add the cases to',
        },
      },
      required: ['action', 'projectId'],
    },
  },
  {
    name: 'manage_test_suite',
    description: 'Create, update, delete test suites, or add/remove cases from a suite. ' +
      'Suites are project-level groupings of test cases (e.g., regression, smoke, acceptance). ' +
      'Start a run with start_run: suiteId for one suite, suiteIds for a plan run over several (a case in two ' +
      'suites runs once), or caseIds / filter for an ad-hoc run with no suite; plus environment and ' +
      'releaseCandidateId? (ties the run to the build under test so release gates can read it) and assignments ' +
      'to split the cases between people. Then record_result (runId, caseId, overallStatus: pass|fail|skip|blocked) ' +
      'for each case, and complete_run (runId; skipRemaining:true if some cases were not run). suiteId is not ' +
      'needed on record_result or complete_run. List runs with list_test_suites runs:true. ' +
      'import_results records a CI results file (JUnit XML, xUnit v2 XML, or JSON ' +
      '{results:[{key,name,status,durationMs,message}]}) as one completed run with trigger "ci": give filePath ' +
      '(a local file) or content, plus suite (id or slug, optional), environment and commitSha. Each result ' +
      'matches the case whose externalKey equals JUnit classname.name (set it with manage_test_case update ' +
      'externalKey). Unmatched results are returned and kept 30 days. Repeating the same file for the same ' +
      'suite, commit and environment returns the first import (duplicate:true).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create', 'update', 'delete', 'add_cases', 'remove_cases',
            'start_run', 'record_result', 'complete_run', 'import_results',
          ],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        projectId: {
          type: 'string',
          description: 'Project ID (required for all actions)',
        },
        suiteId: {
          type: 'string',
          description: 'Test suite ID (required for update, delete, add_cases, remove_cases; start_run for one suite)',
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
        // --- Suite run fields (start_run, record_result, complete_run) ---
        suiteIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'start_run: several suites make one plan run (max 20). ' +
            'Give suiteId, suiteIds, caseIds or filter — one of them.',
        },
        caseIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'start_run: run exactly these cases, with no suite (max 500)',
        },
        filter: {
          type: 'object',
          description: 'start_run: run every case matching this Cases-list filter (search, statuses, priorities, ' +
            'categories, lifecycleStatuses, retentions, suiteIds, notInSuiteId). Refused if more than 500 match.',
        },
        runTitle: {
          type: 'string',
          description: 'start_run: a name for a plan or ad-hoc run, e.g. "v0.22 regression"',
        },
        assignments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              assigneeId: { type: 'string', description: 'User id, or an AI agent id such as "claude"' },
              suiteId: { type: 'string', description: 'Every case the run took from this suite' },
              caseIds: { type: 'array', items: { type: 'string' }, description: 'These cases' },
            },
            required: ['assigneeId'],
          },
          description: 'start_run: who runs which cases. Give suiteId or caseIds per entry; case-level entries win. ' +
            'Unassigned cases stay open to anyone on the run.',
        },
        assigneeId: {
          type: 'string',
          description: 'start_run: who owns the run (defaults to you)',
        },
        runId: {
          type: 'string',
          description: 'Suite run ID (record_result, complete_run)',
        },
        environment: {
          type: 'string',
          description: 'Environment the run is in, e.g. "staging" (start_run)',
        },
        environmentId: {
          type: 'string',
          description: 'Environment registry id, instead of environment (start_run)',
        },
        releaseCandidateId: {
          type: 'string',
          description: 'Release candidate under test (start_run). Its commit SHA is recorded too.',
        },
        commitSha: {
          type: 'string',
          description: 'Commit under test, when there is no candidate (start_run)',
        },
        notes: {
          type: 'string',
          description: 'Notes (start_run, record_result)',
        },
        caseId: {
          type: 'string',
          description: 'Test case ID (record_result)',
        },
        overallStatus: {
          type: 'string',
          enum: ['pass', 'fail', 'skip', 'blocked'],
          description: 'Result (record_result)',
        },
        duration: {
          type: 'number',
          description: 'Milliseconds (record_result)',
        },
        status: {
          type: 'string',
          enum: ['completed', 'cancelled', 'in_progress'],
          description: 'complete_run: the run\'s final status (default completed)',
        },
        skipRemaining: {
          type: 'boolean',
          description: 'complete_run: mark every case without a result as skipped. Completing a run that still ' +
            'has unrun cases is refused without it — record the missing results, or pass this to skip them.',
        },
        // --- import_results (E-278 #3043) ---
        filePath: {
          type: 'string',
          description: 'import_results: path to the results file on this machine (max 10 MB)',
        },
        content: {
          type: 'string',
          description: 'import_results: the results file content, instead of filePath',
        },
        format: {
          type: 'string',
          enum: ['junit', 'xunit', 'json'],
          description: 'import_results: file format; detected from the content when omitted',
        },
        suite: {
          type: 'string',
          description: 'import_results: suite id or slug (e.g. "smoke-core-navigation"); omit for a run with no suite',
        },
        fileName: {
          type: 'string',
          description: 'import_results: name shown for the upload (defaults to the file\'s name)',
        },
      },
      required: ['action', 'projectId'],
    },
  },
  {
    name: 'list_test_cases',
    description: 'List test cases or get a single test case. ' +
      'Provide testCaseId (+ projectId) for single lookup, or projectId with optional filters for listing. ' +
      'A list response includes `total` (every case matching the filters) — read it before concluding a case ' +
      'does not exist, since one page holds at most 200.',
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
        runHistory: {
          type: 'boolean',
          description: 'With testCaseId: return that case\'s run history instead, newest first, with suite and ' +
            'release candidate per run. Pages with limit and before (the previous page\'s nextCursor).',
        },
        before: {
          type: 'string',
          description: 'runHistory paging: nextCursor from the previous page',
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
        suiteId: {
          type: 'string',
          description: 'Filter to cases in this suite',
        },
        notInSuiteId: {
          type: 'string',
          description: 'Exclude cases already in this suite (e.g. to find cases to add to it)',
        },
        countBy: {
          type: 'string',
          enum: ['suite', 'category', 'priority', 'status'],
          description: 'Return per-group counts (total and pass/fail/skip/blocked/not run) under the same filters ' +
            'instead of cases. A case in two suites counts in both suite groups; key "" is the none group.',
        },
        search: {
          type: 'string',
          description: 'Case-insensitive substring of the title or category',
        },
        sortBy: {
          type: 'string',
          enum: ['createdAt', 'title', 'priority', 'lastRun'],
          description: 'Sort column (offset paging only; lastRun puts never-run cases last)',
        },
        sortDir: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default asc)',
        },
        limit: {
          type: 'number',
          description: 'Max results per page (default 50, max 200)',
        },
        offset: {
          type: 'number',
          description: 'Skip this many matching cases (offset paging). Cannot be combined with cursor.',
        },
        cursor: {
          type: 'string',
          description: 'Pagination cursor from a previous response (created-at order; cannot be combined with sortBy)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'list_test_suites',
    description: 'List test suites or get a single test suite. ' +
      'Provide testSuiteId (+ projectId) for single lookup, or projectId with optional filters for listing. ' +
      'With runs:true, list test runs across the project instead — every suite, plan and ad-hoc run, newest ' +
      'first — filtered by runStatus, suiteId, environment, releaseCandidateId, assigneeId and trigger; the ' +
      'response has `total`. With runs:true and runId, get one run with its cases, assignees and results.',
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
        // --- Runs (runs:true) ---
        runs: {
          type: 'boolean',
          description: 'List test runs across the project instead of suites',
        },
        runId: {
          type: 'string',
          description: 'runs:true — get this one run in full',
        },
        runStatus: {
          type: 'string',
          description: 'runs:true — active (pending + in_progress), pending, in_progress, completed or cancelled; ' +
            'comma-separate several',
        },
        suiteId: {
          type: 'string',
          description: 'runs:true — runs of this suite, including plan runs that took cases from it',
        },
        environment: {
          type: 'string',
          description: 'runs:true — environment name or registry id',
        },
        releaseCandidateId: {
          type: 'string',
          description: 'runs:true — runs of this build',
        },
        assigneeId: {
          type: 'string',
          description: 'runs:true — runs this person owns or has cases assigned in',
        },
        trigger: {
          type: 'string',
          enum: ['manual', 'release', 'ci'],
          description: 'runs:true — what started the run (ci = a results import)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'get_testing_summary',
    description: 'Get aggregate test statistics for a project (or a specific task) ' +
      'including pass/fail counts, coverage, recent run history, and ' +
      'per-environment breakdowns. The project summary also has caseCount (real cases; ' +
      'totalCases counts case x environment), flakyCount/flakyCases and medianRunAgeDays. ' +
      'view "confidence" returns shipping confidence for a release candidate per environment ' +
      '(pass rate, suites run and not run, suite_pass_rate gate status); view "trend" returns ' +
      'daily pass/fail/skip/blocked counts.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        taskId: {
          type: 'string',
          description: 'Optional: filter summary to a specific task (view "summary" only)',
        },
        view: {
          type: 'string',
          enum: ['summary', 'confidence', 'trend'],
          description: 'What to return (default "summary")',
        },
        candidateId: {
          type: 'string',
          description: 'view "confidence": release candidate id; default the newest active candidate',
        },
        days: {
          type: 'number',
          description: 'view "trend": days of history, 1-90 (default 30)',
        },
      },
      required: ['projectId'],
    },
  },
];
