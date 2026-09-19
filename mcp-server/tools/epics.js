/**
 * Epic Tools
 * MCP tools for managing epics
 *
 * Project-First Hierarchy: Epics belong to projects (required),
 * with optional milestone linking. *
 * NAMING (E-107): an epic is not called "Epic" everywhere. A project's type
 * decides its vocabulary — a marketing project calls this a Campaign, a sales
 * project a Deal, a research project a Study. Read the words from
 * `get_current_project_context().terminology` (or `get_project`) and use them in
 * anything a person reads. The field names here — epicId, epicNumber — never
 * change.
 */

import { LINKS_ARRAY_SCHEMA, RELATED_ITEM_SCHEMA } from './link-params.js';
import { TASK_ITEM_PROPERTIES } from './task-item-schema.js';

// A link staged on a plan or planned task before it exists (#2199, #2752).
// Mirrors the desktop LinkDraft shape so a plan an AI saves back keeps the
// links the desktop staged.
const PLAN_LINKS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      targetType: { type: 'string' },
      targetId: { type: 'string' },
      title: { type: 'string' },
      source: { type: 'string', enum: ['deterministic', 'suggested', 'manual'] },
      accepted: { type: 'boolean', description: 'false only for a suggestion that was turned down' },
      rule: { type: 'string' },
      confidence: { type: 'number' },
      suggestionId: { type: 'string' },
      matchedPaths: { type: 'array', items: { type: 'string' } },
    },
    required: ['targetType', 'targetId'],
  },
};

export const EPIC_TOOLS = [
  {
    name: 'manage_epic',
    description: 'Create or update an epic within a project. Epics belong to projects (required). ' +
      'IMPORTANT when creating: Call get_context first for each area the epic covers to discover relevant ' +
      'files and integration points. Include in the description which layers/services are affected and ' +
      'reference specific file paths. Create child tasks that each reference specific files from context queries. ' +
      'Auto-applies matching tags from cached project context based on content analysis. ' +
      'To align an epic to an organization goal, link it to a milestone that is linked to that goal ' +
      '(set milestoneId) — epics have no direct goal field. ' +
      'BREAKING DOWN A FEATURE: pass the child tasks in the `tasks` array on create and the epic and its ' +
      'whole breakdown are created in ONE request — do not follow a create with a separate create_tasks call. ' +
      'Besides the saved request, it removes the gap between the two: a failure part-way can no longer ' +
      'leave an epic with no tasks that you then have to reconcile.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'generate_how_it_works', 'apply_how_it_works'],
          description: 'Action to perform. "generate_how_it_works" (re)generates the epic\'s grounded, ' +
            'source-attributed "how it works" living description from its reality — its tasks\' status ' +
            'rollup, their captured decisions and their linked commits (requires epicId; AI-quota gated). ' +
            'An epic is where intent and reality drift furthest apart: intent is a charter written once, ' +
            'reality is months of accumulated work. "apply_how_it_works" (BYO-AI) persists a summary YOU ' +
            'authored: pass markdown + sources; the server validates your cited sources against the real ' +
            'grounded context (dropping fabricated ones) before saving — no server model call.',
        },
        // --- Identifiers ---
        epicId: {
          type: 'string',
          description: 'Epic ID (required for update, generate_how_it_works, apply_how_it_works)',
        },
        markdown: {
          type: 'string',
          description: 'Rendered markdown body for apply_how_it_works (the how-it-works YOU authored).',
        },
        sources: {
          type: 'object',
          description: 'Structured backing for apply_how_it_works: { claims: [{ text, sources: [ref...], ' +
            'confidence }], divergences: [{ intent, reality, severity }] }. Cite real source refs from the ' +
            'epic\'s grounded context ("task:<id>", "commit:<sha>", "epic:<id>"); the server drops ' +
            'fabricated ones.',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for create)',
        },
        // --- Shared fields ---
        title: {
          type: 'string',
          description: 'Epic title (required for create)',
        },
        description: {
          type: 'string',
          description: 'Epic description (supports markdown). Use real newlines, not literal \\n. ' +
            'Writing this stays plain text; it does not create a backing document.',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'ready', 'active', 'completed', 'cancelled', 'archived'],
          description: 'Epic status (default: backlog for create)',
        },
        milestoneId: {
          type: 'string',
          description: 'Link to project milestone (set to empty string to remove on update). ' +
            'This is also how an epic aligns to an organization goal: link the epic to a ' +
            'milestone that is linked to the goal — there is no direct goal field on an epic.',
        },
        featureId: {
          type: 'string',
          description: 'Tie this epic to a durable Feature it advances (E-210). When the project ' +
            'has feature-link governance enabled, this is REQUIRED on create (and on updating an ' +
            'unlinked epic): the epic is linked to the feature via a relates_to edge. If a create/update ' +
            'is rejected with "requires every epic to be linked to a Feature", find an existing ' +
            'capability or propose a new one with search_features, then pass its id here.',
        },
        startDate: {
          type: 'string',
          description: 'Start date (RFC3339 format, e.g., 2026-01-01T00:00:00Z)',
        },
        endDate: {
          type: 'string',
          description: 'End/deadline date (RFC3339 format). Enforced — incomplete tasks auto-move to backlog when passed.',
        },
        estimatedHours: {
          type: 'number',
          description: 'Epic-level effort estimate in HOURS. Stored as given — the API does not ' +
            'derive dates from it (the web rail does that client-side, at 8h per work day). Distinct ' +
            'from the points shown on the epic detail, which are a read-only rollup of the child ' +
            'tasks\' sprintPoints: this is the epic\'s own input, that is what the tasks add up to.',
        },
        owner: {
          type: 'object',
          description: 'Epic owner (userId and name)',
          properties: {
            userId: { type: 'string' },
            name: { type: 'string' },
          },
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of label names',
        },
        color: {
          type: 'string',
          description: 'Hex color for visual identification (e.g., "#3B82F6"). Set to empty string to remove on update.',
        },
        links: LINKS_ARRAY_SCHEMA,
        // --- Create-only: the epic's breakdown, created in the same request ---
        tasks: {
          type: 'array',
          description: 'Child tasks to create WITH the epic, in the same request (create only, 1-40). ' +
            'Each item takes the same fields as manage_task action:"create"; only title is required. ' +
            'projectId and epicId are taken from the epic — do not set them per item. ' +
            'The response reports the epic separately from a per-item task result: if some tasks fail, ' +
            'the epic still exists and you retry ONLY the failed items, never the whole call. ' +
            'For more than 40 tasks, create the epic here with the first 40 and send the rest with create_tasks.',
          items: {
            type: 'object',
            properties: { ...TASK_ITEM_PROPERTIES },
            required: ['title'],
          },
        },
        // --- Update-only fields ---
        addLinks: {
          type: 'array',
          items: LINKS_ARRAY_SCHEMA.items,
          description: 'Add cross-entity links to an existing epic (update only). ' +
            'Same shape as `links` on create.',
        },
        removeLinks: {
          type: 'array',
          items: LINKS_ARRAY_SCHEMA.items,
          description: 'Remove cross-entity links from an existing epic (update only).',
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
        addDependency: {
          type: 'string',
          description: 'Add a cross-project blocking dependency by epic ID. ' +
            'Same-org only. Rejected as ErrCircularDependency if it would close a cycle. (update only)',
        },
        removeDependency: {
          type: 'string',
          description: 'Remove a blocking dependency by target epic ID. ' +
            'Idempotent — no error if absent. (update only)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'search_epics',
    description: 'Search and filter epics by project, status, or text. ' +
      'Primary filter is by project. If no scope (projectId) is provided, ' +
      'searches across all projects accessible to the API key. ' +
      'To find epics aligned to a goal, filter by the goal\'s milestone (milestoneId).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter by project ID (primary filter)',
        },
        milestoneId: {
          type: 'string',
          description: 'Filter by milestone ID (release)',
        },
        status: {
          type: 'string',
          enum: ['backlog', 'ready', 'active', 'completed', 'cancelled', 'archived'],
          description: 'Filter by epic status',
        },
        searchText: {
          type: 'string',
          description: 'Text to search in epic title or description (case-insensitive)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 50, max: 1000)',
          default: 50,
        },
      },
    },
  },
  {
    name: 'list_epics',
    description: 'List all epics for a specific project. For advanced filtering use search_epics. Requires projectId.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'The ID of the project to list epics for (required)',
        },
      },
    },
  },
  {
    name: 'get_epic',
    description: 'Retrieve a single epic by ID or epic number with ' +
      'full details. Provide EITHER epicId OR both epicNumber and projectId. ' +
      'Optionally include lightweight task information ' +
      '(id, title, status, priority, assignee). ' +
      'Responses include `descriptionDocumentId` — the id of the backing rich-description Document ' +
      'when the description has been promoted to one (E-189), otherwise omitted. ' +
      'Responses also include `derivedGoalIds` — the organization goal(s) this epic aligns to, ' +
      'derived via its milestone (epics have no direct goal field).',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: {
          type: 'string',
          description: 'The document ID of the epic to retrieve',
        },
        epicNumber: {
          type: 'number',
          description: 'The sequential epic number (e.g., 7 for ' +
            'epic #7). Must be used with projectId. This is the ' +
            'human-friendly number displayed in the UI.',
        },
        projectId: {
          type: 'string',
          description: 'The project ID. Required when using epicNumber instead of epicId.',
        },
        includeTasks: {
          type: 'boolean',
          description: 'If true, includes lightweight task info (id, title, status, priority, assignee) ' +
            'for all tasks in this epic. This is the recommended way to get all tasks in an epic.',
        },
      },
    },
  },
  {
    name: 'get_epic_plan',
    description: 'Read an epic\'s plan (E-259): the planned tasks, notes, status, staged links and any ' +
      'open planner questions, with ' +
      '`currentRevision`, the version number you must send back to `update_epic_plan`. ' +
      'Several people and their AIs can work on one plan, so read it right before you change it. ' +
      'Pass `includeHistory` to see who changed what, in plain sentences, and `revision` to read an older version.',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: { type: 'string', description: 'The epic ID (required)' },
        revision: { type: 'number', description: 'Read this saved version instead of the current one' },
        includeHistory: {
          type: 'boolean',
          description: 'Also return recent versions: who saved each, which AI, and what changed',
        },
        historyLimit: { type: 'number', description: 'How many versions of history to return (default 20)' },
      },
      required: ['epicId'],
    },
  },
  {
    name: 'update_epic_plan',
    description: 'Save an epic\'s plan as a new version (E-259). Send the WHOLE plan, changed where you ' +
      'mean to change it, plus `baseRevision`: the `currentRevision` you read with `get_epic_plan` ' +
      '(0 when the epic has no plan). Keep each planned task\'s `id` so the change is matched to the right task. ' +
      'If someone else saved since you read it, nothing is written and you get `PLAN_CONFLICT` with the ' +
      'current plan and what changed — apply your change to THAT plan and save again with its revision. ' +
      'Never resend your old copy: that erases their work. ' +
      'Keep plans simple and readable by anyone: a plain title and one line on why for each task. ' +
      'Only the epic\'s owner, its creator or an organization admin can save the plan; anyone else ' +
      'suggests the change with add_epic_comment or asks it as a decision to make (manage_decision).',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: { type: 'string', description: 'The epic ID (required)' },
        baseRevision: {
          type: 'number',
          description: 'The currentRevision you started from (required; 0 for a new plan)',
        },
        plan: {
          type: 'object',
          description: 'The full plan. Fields not listed here (conversation, targetFeatureId, …) ' +
            'are kept only if you send them back.',
          properties: {
            notes: { type: 'string', description: 'Assumptions, risks and scope notes' },
            status: { type: 'string', enum: ['draft', 'approved'], description: 'draft (default) or approved' },
            proposedTasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'Keep the id from get_epic_plan; omit for a new task' },
                  title: { type: 'string' },
                  workType: { type: 'string' },
                  description: { type: 'string' },
                  steps: { type: 'array', items: { type: 'string' } },
                  rationale: { type: 'string', description: 'One line on why this task exists' },
                  dependsOnIndices: { type: 'array', items: { type: 'number' } },
                  needsHumanGate: { type: 'boolean' },
                  links: {
                    ...PLAN_LINKS_SCHEMA,
                    description: 'Links to create with this task when the plan is approved. Send back ' +
                      'what get_epic_plan returned',
                  },
                },
                required: ['title'],
              },
            },
            links: {
              ...PLAN_LINKS_SCHEMA,
              description: 'Links for the epic, applied when the plan is approved. Send back what ' +
                'get_epic_plan returned',
            },
            questions: {
              type: 'array',
              description: 'The planner\'s open clarifying questions, kept as returned by get_epic_plan. ' +
                'A choice that needs several people\'s view belongs on the epic as a decision to make ' +
                '(manage_decision with epicId) instead.',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  question: { type: 'string' },
                  header: { type: 'string' },
                  options: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: { label: { type: 'string' }, description: { type: 'string' } },
                      required: ['label'],
                    },
                  },
                  multiSelect: { type: 'boolean' },
                },
                required: ['question'],
              },
            },
          },
        },
      },
      required: ['epicId', 'baseRevision', 'plan'],
    },
  },
  {
    name: 'list_epic_comments',
    description: 'Read an epic\'s discussion (E-259), oldest first. Each comment says who wrote it and, ' +
      'when an AI wrote it for them, which AI (`agentName`). Replies carry `parentId`. ' +
      'Read this before planning or changing a shared epic: other people\'s questions and objections live here.',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: { type: 'string', description: 'The epic ID (required)' },
        limit: { type: 'number', description: 'Maximum comments to return (default 100, max 500)' },
      },
      required: ['epicId'],
    },
  },
  {
    name: 'add_epic_comment',
    description: 'Post to an epic\'s discussion (E-259), or reply to a comment with `parentId`. ' +
      'Posted as the person whose key you use, marked as written by you. ' +
      'Mentioned people, the author you reply to and everyone following the epic are notified, ' +
      'and posting makes that person follow it. Write plainly: one point per comment, readable by anyone.',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: { type: 'string', description: 'The epic ID (required)' },
        content: { type: 'string', description: 'The comment (markdown)' },
        parentId: { type: 'string', description: 'Reply to this comment' },
        mentions: { type: 'array', items: { type: 'string' }, description: 'User IDs to notify' },
      },
      required: ['epicId', 'content'],
    },
  },
];
