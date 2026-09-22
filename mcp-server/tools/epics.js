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
      'Tags: pass the tag IDs you want as tagIds; the response lists keyword-matched tags you did not pass as ' +
      'suggestedTags, which are NOT applied — add any that fit with an update. ' +
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
          enum: ['create', 'update', 'generate_how_it_works', 'apply_how_it_works', 'add_editor', 'remove_editor'],
          description: 'Action to perform. "add_editor" / "remove_editor" (epicId + editorUserId) choose who ' +
            'else may change the epic\'s plan, decide its questions and answer suggested changes (E-259). ' +
            'Only the owner, the creator or an org admin may choose; an editor may remove themselves. ' +
            'get_epic lists the current editors. ' +
            '"generate_how_it_works" (re)generates the epic\'s grounded, ' +
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
          description: 'Epic ID (required for update, generate_how_it_works, apply_how_it_works, ' +
            'add_editor, remove_editor)',
        },
        editorUserId: {
          type: 'string',
          description: 'add_editor / remove_editor: the user to add or remove (must be in the organization)',
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
        tagIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag IDs for categorization (get them from get_current_project_context). ' +
            'Used by create and update; on update this REPLACES the set.',
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
      'derived via its milestone (epics have no direct goal field). ' +
      '`editors` lists the people besides the owner who may change its plan (E-259).',
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
      'Only the epic\'s owner, its creator or an organization admin can save the plan. If you are ' +
      'refused, do not give up: send the SAME plan to manage_plan_proposal action "propose" and the ' +
      'owner can accept your changes one at a time.',
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
    name: 'get_epic_activity',
    description: 'Catch me up on an epic (E-259): what changed since YOU last looked. Returns `summary`, ' +
      'plain sentences you can relay to your person as-is, most important first: decisions waiting on ' +
      'their view, open questions put to them and open objections, comments that mention or reply to ' +
      'them, decisions made, new plan versions (who ' +
      'changed what, and which AI did it for them), and tasks added, started, finished or blocked. ' +
      'The details are alongside. Their own changes are left out. Call it when you start or resume ' +
      'work on an epic other people also work on, and before changing its plan. By default this also ' +
      'marks the epic as caught up, so the next call shows only newer changes; pass markSeen:false to ' +
      'look without that.\n\n' +
      'LIVE: pass waitSeconds (up to 25) to wait for something to happen instead of hearing ' +
      '"nothing has changed" — the call returns as soon as someone changes the plan, comments, ' +
      'decides, or picks up or moves a task. Call it again to keep following a shared session. ' +
      '`hereNow` says who else is on the epic right now, people and their AIs; calling any epic tool ' +
      'shows you there too.',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: { type: 'string', description: 'The epic ID (required)' },
        since: {
          type: 'string',
          description: 'Show changes since this time (RFC 3339, e.g. 2026-09-19T14:00:00Z) instead of ' +
            'since the last catch-up. The first catch-up on an epic covers the last 7 days.',
        },
        markSeen: {
          type: 'boolean',
          description: 'Mark the epic as caught up after answering (default true)',
        },
        waitSeconds: {
          type: 'number',
          description: 'Wait up to this many seconds (max 25) for something new before answering',
        },
      },
      required: ['epicId'],
    },
  },
  {
    name: 'list_epic_comments',
    description: 'Read an epic\'s discussion (E-259), oldest first. Each comment says who wrote it and, ' +
      'when an AI wrote it for them, which AI (`agentName`). Replies carry `parentId`. ' +
      'Read this before planning or changing a shared epic: other people\'s questions and objections live here. ' +
      'Each comment has a `kind` (comment, question, objection, alternative); the last three stay open until ' +
      '`resolvedAt` is set. Pass open:true for only the ones still waiting — check it before approving a plan.',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: { type: 'string', description: 'The epic ID (required)' },
        limit: { type: 'number', description: 'Maximum comments to return (default 100, max 500)' },
        open: { type: 'boolean', description: 'Only the questions, objections and alternatives not yet settled' },
      },
      required: ['epicId'],
    },
  },
  {
    name: 'add_epic_comment',
    description: 'Post to an epic\'s discussion (E-259), or reply to a comment with `parentId`. ' +
      'Posted as the person whose key you use, marked as written by you. ' +
      'Mentioned people, the author you reply to and everyone following the epic are notified, ' +
      'and posting makes that person follow it. Write plainly: one point per comment, readable by anyone.\n\n' +
      'Say what the comment is with `kind`: a `question` you need answered, an `objection` to the plan, or ' +
      'an `alternative` approach. Those stay open until settled, show up in catch me up, and an open objection ' +
      'warns whoever approves the plan. To answer one, reply with parentId and resolvesParent:true ' +
      '(the person who raised it, or the epic\'s owner, may settle it; anyone may reply).',
    inputSchema: {
      type: 'object',
      properties: {
        epicId: { type: 'string', description: 'The epic ID (required)' },
        content: { type: 'string', description: 'The comment (markdown)' },
        parentId: { type: 'string', description: 'Reply to this comment' },
        mentions: { type: 'array', items: { type: 'string' }, description: 'User IDs to notify' },
        kind: {
          type: 'string',
          enum: ['comment', 'question', 'objection', 'alternative'],
          description: 'What this is (default comment). Replies are always comments.',
        },
        resolvesParent: {
          type: 'boolean',
          description: 'With parentId: this reply settles the question, objection or alternative it answers',
        },
      },
      required: ['epicId', 'content'],
    },
  },
  {
    name: 'manage_plan_proposal',
    description: 'Suggest a change to an epic\'s plan when you cannot save it yourself, and answer ' +
      'suggestions on plans you own (E-259).\n\n' +
      'propose: send the plan you WANT, exactly as you would to update_epic_plan. The server works out ' +
      'what you changed and lists it as separate changes, each with a plain sentence, so the owner can ' +
      'take some and leave others. Nothing changes until they do.\n' +
      'list: what is waiting on an epic. Open ones come first, and each change that no longer fits the ' +
      'current plan is flagged with the reason.\n' +
      'review (owner, editors, creator or org admin only): `accept` and `reject` name changes by their op id. ' +
      'A change you name in neither is left for later and the proposal stays open. A change whose task ' +
      'someone has since removed is reported back as stale rather than quietly reapplied.\n' +
      'withdraw: take back a proposal you made.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['propose', 'list', 'get', 'review', 'withdraw'],
          description: 'What to do',
        },
        epicId: { type: 'string', description: 'The epic (required for propose and list)' },
        proposalId: { type: 'string', description: 'The proposal (required for get, review and withdraw)' },
        plan: {
          type: 'object',
          description: 'propose: the whole plan you want, same shape as update_epic_plan. Keep each ' +
            'planned task\'s id so your change is matched to the right task.',
        },
        title: { type: 'string', description: 'propose: a short name for the proposal' },
        rationale: { type: 'string', description: 'propose: why, in a sentence or two, in plain language' },
        accept: {
          type: 'array',
          items: { type: 'string' },
          description: 'review: op ids of the changes you are taking',
        },
        reject: {
          type: 'array',
          items: { type: 'string' },
          description: 'review: op ids of the changes you are turning down',
        },
        note: { type: 'string', description: 'review: what you want to say back, in your own words' },
        status: { type: 'string', description: 'list: only proposals in this state (default: all)' },
      },
      required: ['action'],
    },
  },
];
