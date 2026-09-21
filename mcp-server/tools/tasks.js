/**
 * Task Tools
 * MCP tools for managing tasks
 *
 * Project-First Hierarchy: Tasks belong to projects (required), with optional
 * epic grouping. Code links are derived from the files a task touches, which
 * resolve to the features that own them (E-258).
 *
 * NAMING (E-107): a project's type renames a task and its statuses — a sales
 * project calls a task an "Activity" and calls `in_review` "Awaiting Approval".
 * Read the words from `get_current_project_context().terminology` and use them
 * in anything a person reads. The status VALUES sent to the API never change.
 */

import { LINKS_ARRAY_SCHEMA, RELATED_ITEM_SCHEMA } from './link-params.js';
import { TASK_ITEM_PROPERTIES } from './task-item-schema.js';
import { TASK_TYPE_PROPERTY } from './task-type.js';

export const TASK_TOOLS = [
  {
    name: 'manage_task',
    description: 'Create, update, or complete tasks. Also manages commit linking and ' +
      '(re)generating the task\'s grounded "how it works" living description. ' +
      'IMPORTANT when creating: (1) Call get_context first with a keyword query matching the work topic ' +
      'to discover relevant files, patterns, and dependencies. (2) Write descriptions that explain WHY ' +
      '(problem/goal), WHERE (specific files/endpoints from context), and HOW (approach using existing patterns). ' +
      '(3) Write steps that reference specific file paths, not vague instructions. ' +
      '(4) Link the feature the work advances with links:[{targetType:"feature", targetId}] (find it with ' +
      'search_features), and pass changedFiles — the files resolve to the features that own those paths.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'complete', 'defer', 'link_commit', 'unlink_commit', 'get_commits', 'generate_how_it_works', 'apply_how_it_works', 'claim', 'release'],
          description: 'Action to perform. "claim" (taskId, optional claimNote) says you are working on ' +
            'this task, so other people\'s AIs on the same epic pick different work (E-259). Claim ' +
            'BEFORE starting a task on a shared epic. It lasts 2 hours and renews while you update ' +
            'the task or link commits; claiming again renews it. If someone else holds it you are ' +
            'told who — pick another task. The answer warns about other in-progress tasks on the ' +
            'epic that touch the same files. "release" gives it back when you stop. ' +
            '"generate_how_it_works" (re)generates the task\'s ' +
            'grounded, source-attributed "how it works" living description from its reality — ' +
            'subtasks, comments, status history, commits plus a manifest pass over linked files ' +
            '(requires taskId; AI-quota gated). "apply_how_it_works" (BYO-AI) persists a summary ' +
            'YOU authored: pass markdown + sources; the server validates your cited sources against ' +
            'the real grounded context (dropping fabricated ones) before saving — no server model call.',
        },
        claimNote: {
          type: 'string',
          description: 'claim: what you are about to do, in a few words (shown to the others)',
        },
        // --- Identifiers (used by most actions) ---
        taskId: {
          type: 'string',
          description: 'Task ID (required for update, complete, defer, link_commit, unlink_commit, get_commits, generate_how_it_works, apply_how_it_works)',
        },
        // --- apply_how_it_works (BYO-AI) ---
        markdown: {
          type: 'string',
          description: 'Rendered markdown body for apply_how_it_works (the how-it-works YOU authored).',
        },
        sources: {
          type: 'object',
          description: 'Structured backing for apply_how_it_works: { claims: [{ text, sources: [ref...], ' +
            'confidence: "grounded"|"unverified" }], divergences: [{ intent, reality, severity }] }. Cite ' +
            'real source refs from the entity\'s grounded context; the server drops fabricated ones.',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for create)',
        },
        // --- Create fields ---
        title: {
          type: 'string',
          description: 'Task title (required for create)',
        },
        description: {
          type: 'string',
          description: 'Task description (supports markdown). Use real newlines, not literal \\n. Used by create and update. ' +
            'Writing this stays plain text; it does not create a backing document.',
        },
        epicId: {
          type: 'string',
          description: 'Epic ID to link this task to. Used by create and update (set to empty string to remove on update).',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Priority level. Used by create and update.',
        },
        taskType: {
          ...TASK_TYPE_PROPERTY,
          description: TASK_TYPE_PROPERTY.description +
            ' Used by create and update; on update send "" to clear it back to untyped. ' +
            'This tool could not set it at all until #2545 — only the bulk create paths ' +
            'could — and the server discarded it on update until #2544, so a task\'s kind ' +
            'was effectively fixed at creation.',
        },
        parentTaskId: {
          type: 'string',
          description: 'Parent task link. Used by create. A testing task is expected to ' +
            'carry this — it is what the testing-split flow follows back to the work ' +
            'being verified.',
        },
        estimatedHours: {
          type: 'number',
          description: 'Estimated hours to complete. Used by create and update.',
        },
        tagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag IDs for categorization. Used by create and update; get available ' +
            'tags from get_current_project_context(). On update this REPLACES the set.',
        },
        assigneeType: {
          type: 'string',
          enum: ['human', 'ai'],
          description: 'Whether assigned to human or AI agent (create only)',
        },
        assigneeId: {
          type: 'string',
          description: 'Assignee user ID or AI agent identifier (create only)',
        },
        assigneeName: {
          type: 'string',
          description: 'Assignee display name (create only)',
        },
        reviewers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['code', 'test'],
                description: 'Reviewer type: code reviewer or test reviewer',
              },
              id: {
                type: 'string',
                description: 'User ID of the reviewer',
              },
              name: {
                type: 'string',
                description: 'Display name of the reviewer',
              },
            },
            required: ['type', 'id', 'name'],
          },
          description: 'Array of reviewers (create only)',
        },
        knowledge: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['fact', 'decision', 'context', 'reference'],
                description: 'Type of knowledge item',
              },
              content: {
                oneOf: [
                  { type: 'string' },
                  { type: 'object' },
                ],
                description: 'Knowledge content (string or structured data)',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional tags for categorization',
              },
            },
            required: ['type', 'content'],
          },
          description: 'Structured knowledge items (create only)',
        },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Implementation steps as strings (create only)',
        },
        aiWork: {
          type: 'boolean',
          description:
            'Whether the task is eligible for the AI agent queue. Used by create and update. ' +
            'Defaults to TRUE on create — omit it unless you specifically want a task agents ' +
            'should not pick up, in which case send false.',
        },
        origin: {
          type: 'string',
          enum: ['planned', 'discovered', 'scope-creep', 'rework', 'untracked'],
          description: 'Task origin for drift classification. Used by create and update.',
        },
        discoveredDuringTaskId: {
          type: 'string',
          description: 'Task ID that was being worked on when this task was discovered. Used by create and update.',
        },
        linkedFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Relative file path from project root' },
              source: { type: 'string', enum: ['manual', 'commit', 'mcp'], description: 'How this link was created (default: "mcp")' },
            },
            required: ['path'],
          },
          description: 'Source files this task affects. Used by create only — for update, use addLinkedFile/removeLinkedFile.',
        },
        changedFiles: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Repo-relative paths you touched. Simpler alternative to linkedFiles — just the paths. ' +
            'ezmodo resolves them to the features that own those paths and links this task to them ' +
            'automatically; a path several features share comes back as a suggestion, as does anything ' +
            'else it is unsure about, in ' +
            'linkSuggestions for you to accept or reject. Used by create and update.',
        },
        autolink: {
          type: 'boolean',
          description:
            'Default true. When no files are supplied, ezmodo searches the codebase for the task\'s ' +
            'own words and links what it finds. Set false to skip that entirely — useful for ' +
            'bookkeeping tasks that touch no code.',
        },
        // --- Update-only fields ---
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'],
          description: 'Task status (update only)',
        },
        addReviewer: {
          type: 'object',
          description: 'Add a reviewer (update only)',
          properties: {
            type: { type: 'string', enum: ['code', 'test'] },
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['type', 'id', 'name'],
        },
        removeReviewer: {
          type: 'object',
          description: 'Remove a reviewer (update only)',
          properties: {
            type: { type: 'string', enum: ['code', 'test'] },
            id: { type: 'string' },
          },
          required: ['type', 'id'],
        },
        addKnowledge: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['fact', 'decision', 'context', 'reference'],
              },
              content: {
                oneOf: [
                  { type: 'string' },
                  { type: 'object' },
                ],
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['type', 'content'],
          },
          description: 'New knowledge items to add (update only)',
        },
        addStep: {
          type: 'string',
          description: 'Add a new step (update only)',
        },
        toggleSteps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              stepId: { type: 'string' },
              completed: { type: 'boolean' },
            },
            required: ['stepId', 'completed'],
          },
          description: 'Toggle completion for one or more steps in a single update (update only). Preferred over toggleStep.',
        },
        toggleStep: {
          type: 'object',
          description: 'Toggle a single step. Prefer toggleSteps for batch. (update only)',
          properties: {
            stepId: { type: 'string' },
            completed: { type: 'boolean' },
          },
        },
        updateStepContent: {
          type: 'object',
          description: 'Update step content (update only)',
          properties: {
            stepId: { type: 'string' },
            content: { type: 'string' },
          },
        },
        deleteStep: {
          type: 'string',
          description: 'Delete a step by ID (update only)',
        },
        sprintStartDate: {
          type: 'string',
          description: 'ISO 8601 date for sprint assignment (update only)',
        },
        aiAgentName: {
          type: 'string',
          description: 'AI agent name that worked on this task (update only)',
        },
        addDependency: {
          type: 'string',
          description: 'Add a blocking dependency by task ID. If the dependency task is not yet completed, this task will be automatically set to "blocked" status. When the dependency is completed, this task auto-unblocks. (update only)',
        },
        removeDependency: {
          type: 'string',
          description: 'Remove a blocking dependency by task ID. If this task was blocked only by this dependency, it will auto-unblock to its previous status. (update only)',
        },
        addRelatedTask: {
          type: 'string',
          description: 'Add a bidirectional related task link by task ID. Unlike dependencies, related tasks are non-blocking soft links. (update only)',
        },
        removeRelatedTask: {
          type: 'string',
          description: 'Remove a bidirectional related task link by task ID (update only)',
        },
        links: LINKS_ARRAY_SCHEMA,
        addLinks: {
          type: 'array',
          items: LINKS_ARRAY_SCHEMA.items,
          description: 'Add cross-entity links to an existing task (update only). ' +
            'Same shape as `links` on create.',
        },
        removeLinks: {
          type: 'array',
          items: LINKS_ARRAY_SCHEMA.items,
          description: 'Remove cross-entity links from an existing task (update only).',
        },
        addRelatedItem: {
          ...RELATED_ITEM_SCHEMA,
          description: 'DEPRECATED — use addLinks. Add a cross-entity related item ' +
            'link (update only). Still works; addLinks takes several at once and ' +
            'supports linkType.',
        },
        removeRelatedItem: {
          ...RELATED_ITEM_SCHEMA,
          description: 'DEPRECATED — use removeLinks. Remove a cross-entity related ' +
            'item link (update only). Still works.',
        },
        addLinkedFile: {
          type: 'object',
          description: 'Link a source file to this task. Files can be linked to enable file-based dependency inference. (update only)',
          properties: {
            path: { type: 'string', description: 'Relative file path from project root (e.g., "api/internal/core/tasks/models.go")' },
            source: { type: 'string', enum: ['manual', 'commit', 'mcp'], description: 'How this link was created (default: "mcp")' },
          },
          required: ['path'],
        },
        removeLinkedFile: {
          type: 'string',
          description: 'Remove a linked file by its path (update only)',
        },
        isBacklogged: {
          type: 'boolean',
          description: 'Move task to/from backlog (update only)',
        },
        backlogPriority: {
          type: 'number',
          description: 'Priority within backlog (update only)',
        },
        // --- Complete fields ---
        completionNotes: {
          type: 'string',
          description: 'Notes about task completion (complete only)',
        },
        // --- Defer fields ---
        reason: {
          type: 'string',
          description: 'Why this work is being deferred. Required for defer.',
        },
        stepId: {
          type: 'string',
          description: 'If set on defer, promotes this step on the source task into a new task ' +
            'inside the deferred epic; otherwise the whole task is reparented. Idempotent — ' +
            're-running with the same stepId returns the existing promoted task.',
        },
        unblockedBy: {
          type: 'string',
          description: 'Optional free-form note describing what would unblock this deferred work. ' +
            'Helpful for the PM review at milestone close. (defer only)',
        },
        targetMilestoneId: {
          type: 'string',
          description: 'Optional milestone override. When set, the deferred work attaches to this ' +
            'milestone\'s deferred epic instead of the source task\'s milestone. (defer only)',
        },
        // --- Commit linking fields ---
        sha: {
          type: 'string',
          description: 'Full git commit hash, 40 chars (link_commit only)',
        },
        message: {
          type: 'string',
          description: 'Commit message first line (link_commit only)',
        },
        author: {
          type: 'string',
          description: 'Commit author name (link_commit only)',
        },
        email: {
          type: 'string',
          description: 'Author email (link_commit only)',
        },
        timestamp: {
          type: 'string',
          description: 'Commit timestamp ISO 8601 (link_commit only)',
        },
        url: {
          type: 'string',
          description: 'URL to commit on git provider (link_commit only)',
        },
        branch: {
          type: 'string',
          description: 'Branch name where commit was made (link_commit only)',
        },
        authorType: {
          type: 'string',
          enum: ['human', 'ai_agent'],
          description: 'Whether commit authored by human or AI agent (link_commit only)',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths changed in commit (link_commit only). OPTIONAL — omit it and the server derives the list from the commit itself via git. Pass it only to override that, e.g. to record a subset.',
        },
        // --- Unlink commit fields ---
        commitId: {
          type: 'string',
          description: 'Linked commit ID to remove, not the SHA (unlink_commit only)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'create_tasks',
    description: 'Create MANY tasks in ONE call. Use this instead of repeated ' +
      'manage_task action:"create" whenever you are creating more than two tasks at ' +
      'once — breaking an epic into tasks is the case it exists for. One call does ' +
      'the authentication, plan check, rate-limit accounting and database connection ' +
      'setup once instead of per task; a burst of individual creates is what made the ' +
      'app unresponsive for 45 minutes on 2026-07-28. ' +
      'Put shared values (projectId, epicId) at the TOP LEVEL and let the ' +
      'items inherit them — only override per item where a task genuinely differs. ' +
      'Each item accepts the same fields as manage_task action:"create". ' +
      'Returns a per-item result array: on partial failure retry ONLY the items marked ' +
      'failed, since the successful ones already exist and re-sending the whole batch ' +
      'would duplicate them. ' +
      'Limited to 40 tasks per call — split anything larger. ' +
      'For a single task, keep using manage_task action:"create", which also resolves ' +
      'code context and applies links.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project every task belongs to (required). All tasks in one ' +
            'call must share it. Items may omit projectId and inherit this.',
        },
        epicId: {
          type: 'string',
          description: 'Epic applied to every item that does not set its own. The ' +
            'usual case for a breakdown: one epic for the whole batch.',
        },
        tasks: {
          type: 'array',
          description: 'The tasks to create (1-40). Each item takes the same fields ' +
            'as manage_task action:"create" (both draw on the shared item schema, so ' +
            'the two cannot drift); only title is required once the shared projectId ' +
            'is set.',
          items: {
            type: 'object',
            properties: {
              ...TASK_ITEM_PROPERTIES,
              projectId: { type: 'string', description: 'Overrides the shared projectId — must match it' },
              epicId: { type: 'string', description: 'Overrides the shared epicId' },
            },
            required: ['title'],
          },
        },
      },
      required: ['projectId', 'tasks'],
    },
  },
  {
    name: 'search_tasks',
    description: 'Search for tasks with filters or semantic search. ' +
      'Use for filtered queries (by status, priority, epic, etc). ' +
      'To get ALL tasks in an epic, prefer get_epic with includeTasks=true. ' +
      'Use search_tasks with epicId only when you need additional filtering ' +
      '(e.g., only in_progress tasks within an epic). ' +
      'When searchText is provided, uses AI-powered semantic search to ' +
      'find tasks by meaning. Falls back to basic text matching if unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter by project ID (primary scope)',
        },
        epicId: {
          type: 'string',
          description: 'Filter by epic ID (feature grouping)',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'],
          description: 'Filter by status',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Filter by priority level',
        },
        assignedToAI: {
          type: 'boolean',
          description: 'Filter for AI-assigned tasks only',
        },
        isBacklogged: {
          type: 'boolean',
          description: 'Filter for backlogged tasks only',
        },
        searchText: {
          type: 'string',
          description: 'Natural language query for semantic search ' +
            '(e.g., "fix login errors", "improve performance"). ' +
            'Automatically uses vector similarity if available.',
        },
        minSimilarity: {
          type: 'number',
          description: 'Minimum similarity score for semantic search (0-1, default: 0.3)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 10 for semantic, 50 for basic)',
          default: 50,
        },
      },
    },
  },
  {
    name: 'report_untracked_work',
    description: 'Retroactively capture work you did WITHOUT a tracked task. Call this ' +
      'when you realize mid-conversation that you made code changes without an active ' +
      'ezmodo task — e.g. a "just fix this real quick" request, a quick bug fix, or work ' +
      'discovered while doing something else. Creates a task classified by `origin` ' +
      '(default "untracked"), records the branch + changed files as evidence, links the ' +
      'discovery chain when applicable, and starts it in_progress so it becomes your ' +
      'active task (also updating the desktop app). Returns the created task so you can ' +
      'keep tracking against it. Prefer this over silently continuing untracked.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The project the work belongs to (required).',
        },
        title: {
          type: 'string',
          description: 'A concise title for the work that was done (required).',
        },
        description: {
          type: 'string',
          description: 'What was done and why. The branch and changed files are appended ' +
            'automatically as evidence — do not duplicate them here.',
        },
        origin: {
          type: 'string',
          enum: ['discovered', 'scope-creep', 'rework', 'untracked'],
          description: 'How the work arose (drift classification). Default: "untracked". ' +
            'Use "discovered" if found while working on another task, "scope-creep" if it ' +
            'went beyond the active task\'s intended scope, "rework" if redoing prior work.',
        },
        discoveredDuringTaskId: {
          type: 'string',
          description: 'The task you were working on when this work was found. Set this ' +
            'when origin is "discovered" or "scope-creep" to link the discovery chain.',
        },
        branch: {
          type: 'string',
          description: 'The git branch the work was done on (recorded as evidence).',
        },
        changedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative paths of files that were changed. Recorded in the ' +
            'description and linked to the task for dependency inference.',
        },
        epicId: {
          type: 'string',
          description: 'Epic this work belongs under. Set it when the untracked work ' +
            'advanced an epic you already know about, so the captured task lands in ' +
            'the right place instead of floating in the backlog.',
        },
        featureId: {
          type: 'string',
          description: 'Feature (product capability) this work advanced. Recorded as a ' +
            'relates_to link on the created task, so the capability map stays honest ' +
            'even for work that was never planned.',
        },
        links: LINKS_ARRAY_SCHEMA,
      },
      required: ['projectId', 'title'],
    },
  },
  {
    name: 'get_task',
    description: 'Retrieve a single task by ID or task number with full details. ' +
      'Use when you have a specific task ID or number. ' +
      'To get all tasks in an epic, use get_epic with includeTasks=true instead. ' +
      'Provide EITHER taskId OR both taskNumber and projectId. ' +
      'Responses include `descriptionDocumentId` — the id of the backing rich-description Document ' +
      'when the description has been promoted to one (E-189), otherwise omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: 'The document ID of the task to retrieve (e.g., "abc123").',
        },
        taskNumber: {
          type: 'number',
          description: 'The sequential task number (e.g., 42 for task ' +
            '#42). Must be used with projectId. This is the ' +
            'human-friendly number displayed in the UI.',
        },
        projectId: {
          type: 'string',
          description: 'The project ID. Required when using taskNumber instead of taskId.',
        },
      },
    },
  },
];
