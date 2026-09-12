/**
 * AI Intelligence Tools
 * MCP tools for project insights and intelligent analysis
 *
 * Consolidated: get_ai_insights (project_insights/suggest_next/dependency_graph)
 */

export const AI_INTELLIGENCE_TOOLS = [
  {
    name: 'get_ai_insights',
    description: 'Get AI-powered project analysis. ' +
      'Types: "project_insights" for health analysis (blockers, velocity, workload), ' +
      '"suggest_next" for personalized task recommendations, ' +
      '"dependency_graph" for critical path and bottleneck analysis, ' +
      '"build_failure" for why CI is red (failing checks with their output, plus which checks are ' +
      'consistently broken vs merely flaky), ' +
      '"deployment_risk" for how risky a deploy is (CI state on the commit + the environment\'s ' +
      'recent history, returned with the signals behind the score). ' +
      'build_failure and deployment_risk are DETERMINISTIC — computed from captured CI/CD data, ' +
      'no model call and no AI quota. They return evidence for you to reason over, not a verdict.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['project_insights', 'suggest_next', 'dependency_graph', 'build_failure', 'deployment_risk'],
          description: 'Type of AI insight to retrieve',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for all types)',
        },
        // --- suggest_next fields ---
        userId: {
          type: 'string',
          description: 'User ID — defaults to API key owner (suggest_next only)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of recommendations (suggest_next only, default: 10). ' +
            'For build_failure and deployment_risk this is the ANALYSIS WINDOW — how many recent ' +
            'runs/deployments to read (default: 50). Results report the window they used.',
        },
        // --- build_failure fields ---
        headSha: {
          type: 'string',
          description: 'Narrow the analysis to one commit (build_failure only)',
        },
        taskId: {
          type: 'string',
          description: 'Narrow to the CI that ran on a task\'s linked commits (build_failure only)',
        },
        kind: {
          type: 'string',
          enum: ['check_run', 'workflow_run'],
          description: 'Analyse individual CI jobs ("check_run") or whole runs ("workflow_run"). ' +
            'Omit for both. Use workflow_run for "did CI pass"; check_run to see which job broke. ' +
            '(build_failure only)',
        },
        // --- deployment_risk fields ---
        environment: {
          type: 'string',
          description: 'Environment being deployed to, e.g. "production" (REQUIRED for ' +
            'deployment_risk — it is not defaulted, since assuming production would answer a ' +
            'different question than the one asked)',
        },
        sha: {
          type: 'string',
          description: 'Commit being deployed (deployment_risk). Without it the assessment cannot ' +
            'check CI and reports that as an unverified-change risk rather than borrowing another ' +
            'commit\'s result.',
        },
      },
      required: ['type', 'projectId'],
    },
  },
  {
    name: 'estimate_task',
    description: 'Get a Bayesian AI estimate for how long a task will take, based on similar completed tasks. ' +
      'Returns median and P80 (80% confidence) hour estimates, confidence level, and the similar tasks used as reference. ' +
      'Automatically adjusts for the assignee\'s historical accuracy if calibration data exists.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'Task ID to estimate (required)',
        },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'infer_dependencies',
    description: 'Infer task-to-task dependencies from file-level import graphs. ' +
      'Uses the project\'s context manifest (file dependencies) and task-to-file links (linkedFiles) ' +
      'to deterministically suggest which tasks depend on which. No AI required. ' +
      'Returns suggestions only — does not auto-create dependencies. ' +
      'Requires tasks to have linkedFiles populated (via addLinkedFile or git commit linking).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
      },
      required: ['projectId'],
    },
  },
];
