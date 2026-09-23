/**
 * Context Manifest Tools
 * MCP tools for querying the project's context manifest — a structured index
 * of all files, their roles, dependencies, and AI-useful summaries.
 *
 * `get_context` is the unified query tool replacing search_project_context,
 * get_related_files, get_project_overview, get_critical_files,
 * query_project_graph, analyze_impact, get_graph_stats, and
 * analyze_project_organization.
 */

export const CONTEXT_MANIFEST_TOOLS = [
  {
    name: 'get_context',
    description:
      'Get contextual information about any entity (project, task, epic, file, tag). ' +
      'Replaces search_project_context, get_related_files, get_project_overview, get_critical_files, ' +
      'query_project_graph, analyze_impact, get_graph_stats, analyze_project_organization. ' +
      'Use `query` for keyword search, or `entityType` + `entityId` for entity-specific context. ' +
      'Control what\'s returned via `include` array.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        entityType: {
          type: 'string',
          enum: ['project', 'task', 'epic', 'file', 'tag'],
          description: 'Type of entity to get context for',
        },
        entityId: {
          type: 'string',
          description:
            'Entity ID or file path (required when entityType is not project)',
        },
        query: {
          type: 'string',
          description:
            'Search query for keyword-based context search (alternative to entityType+entityId)',
        },
        include: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'graph',
              'files',
              'dependencies',
              'impact',
              'overview',
              'critical_files',
              'graph_stats',
              'organization',
            ],
          },
          description:
            'What to include in response. Defaults to all relevant sections for the entityType.',
        },
        queryType: {
          type: 'string',
          enum: ['context', 'impact', 'feature', 'task_context', 'connection'],
          description: 'Graph query type (when include contains "graph")',
        },
        depth: {
          type: 'number',
          description: 'Graph traversal depth (default: 2)',
        },
        format: {
          type: 'string',
          enum: ['compact', 'detailed', 'structured'],
          description: 'Output format for file context',
        },
        limit: {
          type: 'number',
          description: 'Max results for search queries',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags (for context search)',
        },
        direction: {
          type: 'string',
          enum: ['forward', 'reverse', 'both'],
          description: 'Dependency traversal direction (for file context)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'rebuild_manifest',
    description:
      'Trigger regeneration of the project context manifest. ' +
      '"incremental" re-analyzes only files changed since last generation (fast). ' +
      '"full" regenerates everything with static analysis. Needs a local manifest; the result ' +
      'is local only. The API copy is kept current by link_commit and update_manifest_entries.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['incremental', 'full'],
          description:
            'Regeneration mode. "incremental" = git diff-based (fast). ' +
            '"full" = re-analyze all files (slower). Default: "incremental"',
          default: 'incremental',
        },
        target_paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Limit regeneration to specific paths or directories (optional)',
        },
      },
    },
  },
  {
    name: 'update_manifest_entries',
    description:
      'Write AI-enriched summaries to the project\'s context manifest, which lives in the API. ' +
      'This is the follow-up to manage_task action:"link_commit": its response lists ' +
      '`manifest.needsSummary` — paths the commit added that have no summary yet — so read ' +
      'each one and write a summary here. Entries that do not exist yet are created. Pass ' +
      '`deletes` to remove paths. Marks entries as LLM-enriched; a local manifest file, if ' +
      'the repo has one, gets the same change.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description:
            'Project whose manifest to write. Defaults to this repo\'s configured project; ' +
            'required when there is none (e.g. over the remote connector).',
        },
        updates: {
          type: 'array',
          description: 'Entries to write. A path not yet in the manifest is created.',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path relative to project root',
              },
              summary: {
                type: 'string',
                description:
                  'New AI-enriched summary. Should capture intent, ' +
                  'key behaviors, integrations, and gotchas. ' +
                  'Keep under 200 words.',
              },
              criticality_score: {
                type: 'number',
                description: 'Criticality score 0-1 (optional)',
              },
              criticality_signals: {
                type: 'array',
                items: { type: 'string' },
                description: 'Criticality signals (optional)',
              },
            },
            required: ['path', 'summary'],
          },
        },
        deletes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths to remove from the manifest (optional)',
        },
      },
    },
  },
  {
    name: 'get_manifest_schema',
    description:
      'Get the full context manifest JSON schema with documentation and examples. ' +
      'Use this when you need to generate a manifest for a language or project that ' +
      'the built-in generator doesn\'t support. The schema includes field descriptions, ' +
      'valid enum values, example entries, and a reusable prompt template for AI agents. ' +
      'Supported natively: TypeScript/JavaScript, Go, Python, Rust, Java, Kotlin, Dart, ' +
      'C#, Swift, PHP, Ruby, C/C++. For any other language, use this schema to generate ' +
      'a valid manifest yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        includeExamples: {
          type: 'boolean',
          description: 'Include annotated example entries for common patterns (default: true)',
          default: true,
        },
        language: {
          type: 'string',
          description:
            'If provided, tailor examples to this language (e.g., "scala", "elixir", "haskell"). ' +
            'The schema itself is language-agnostic — this only affects examples.',
        },
      },
    },
  },
  {
    name: 'resolve_concepts',
    description:
      'Resolve user-facing product terms to code locations. Use this when a user ' +
      'refers to a feature by its product name (e.g., "dashboard", "board", "settings") ' +
      'and you need to find the corresponding code files. Returns matching concept aliases ' +
      'from the manifest, plus get_context results for broader matching.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID (required)',
        },
        terms: {
          type: 'array',
          items: { type: 'string' },
          description:
            'User-facing terms to resolve (e.g., ["dashboard", "tour", "sprint board"])',
        },
      },
      required: ['projectId', 'terms'],
    },
  },
  {
    name: 'validate_manifest',
    description:
      'Validate a manifest JSON against the schema. Returns errors and warnings. ' +
      'Use this after generating a manifest to check it before uploading. ' +
      'Checks: required fields, valid enum values, dependency paths exist in manifest, ' +
      'entry count matches metadata, and common issues.',
    inputSchema: {
      type: 'object',
      properties: {
        manifest: {
          type: 'object',
          description: 'The full ContextManifest JSON object to validate',
        },
      },
      required: ['manifest'],
    },
  },
];
