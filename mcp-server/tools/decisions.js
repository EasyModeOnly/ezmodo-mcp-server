/**
 * Decision Tools
 * MCP tools for Decisions / ADRs (E-170).
 *
 * A Decision is a durable, org-level ADR-style record of a choice and its
 * rationale (title, context, options, decision, consequences, status). Decisions
 * live on the capability/knowledge axis: they LINK to features, epics, tasks,
 * milestones, and other artifacts via the generic link graph — they do not own
 * them.
 *
 * Decisions capture "why we built it this way" so the rationale survives the work
 * that produced it. A task's decision-type knowledge item can be elevated into a
 * durable Decision via promote_from_knowledge.
 *
 * Decisions to make (E-259): a proposed Decision asked on an epic, with a plain
 * question, options, a recommendation and the people who should weigh in. Each
 * of them, or their AI, adds a pick (add_input); the epic's owner or an editor
 * decides (decide). A decision can hold tasks back until it is decided.
 */

import { LINKABLE_TYPES } from './linkable-types.js';
import { LINKS_ARRAY_SCHEMA } from './link-params.js';

export const DECISION_TOOLS = [
  {
    name: 'manage_decision',
    description: 'Create, update, or delete a Decision (a durable ADR-style record: title, context, ' +
      'options, decision, consequences, status), link/unlink it to existing artifacts, mark it ' +
      'superseded by another decision, or promote a task\'s decision-type knowledge item into a ' +
      'durable Decision. Decisions are org-level and LINK to features/epics/tasks/milestones/etc., ' +
      'they do not contain them.\n\n' +
      'DECISIONS TO MAKE (open choices on an epic that several people weigh in on): create with ' +
      'epicId + question + choices + recommendation + requestedFrom (the people whose view is ' +
      'wanted; they are notified). Write the question, options and recommendation in plain ' +
      'language a non-developer can answer. Then "add_input" records a pick (choiceId + a ' +
      'one-line reason; your pick counts for the person whose key you use, and replaces their ' +
      'earlier one). "decide" is for the epic\'s owner or an editor only: pass choiceId, ' +
      'optionally decision (the answer in plain words) and rejectedReasons {choiceId: why}. ' +
      '"hold_task" makes a task wait until the decision is made (it is blocked, and released on ' +
      'decide); "release_task" undoes that. Do not decide on someone\'s behalf unless they asked ' +
      'you to — add a pick instead.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'link', 'unlink', 'supersede', 'promote_from_knowledge',
            'add_input', 'decide', 'hold_task', 'release_task'],
          description: 'Action to perform. "supersede" marks a decision as superseded by another ' +
            '(pass decisionId + supersededById). "promote_from_knowledge" elevates a task\'s ' +
            'decision-type knowledge item into a durable Decision (pass organizationId + taskId + ' +
            'knowledgeId, optionally title + linkToType/linkToId to link it on creation). ' +
            '"add_input" (decisionId + choiceId + reason), "decide" (decisionId + choiceId), ' +
            '"hold_task" / "release_task" (decisionId + taskId) are for decisions to make on an epic.',
        },
        // --- Decisions to make (E-259) ---
        epicId: {
          type: 'string',
          description: 'Ask this decision on an epic (create). Its owner or an editor decides it; the ' +
            'decision is scoped to the epic\'s project and linked to it.',
        },
        question: {
          type: 'string',
          description: 'The plain question to answer, e.g. "Who should review changes to the plan?" ' +
            '(create, update)',
        },
        recommendation: {
          type: 'string',
          description: 'The recommended answer and why, in a sentence or two (create, update)',
        },
        choices: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: { id: { type: 'string' }, label: { type: 'string' } },
                required: ['label'],
              },
            ],
          },
          description: 'The options to pick from. On create, a list of plain labels. On update, the ' +
            'full list as {id, label}: keep an option\'s id to keep the picks made for it; leave id ' +
            'off to add one; omit an option to remove it (create, update)',
        },
        requestedFrom: {
          type: 'array',
          items: { type: 'string' },
          description: 'User ids of the people whose view is wanted. They are notified (on update, ' +
            'only the newly added ones) (create, update)',
        },
        choiceId: {
          type: 'string',
          description: 'An option id from the decision\'s choices, e.g. "c2" (add_input: your pick, ' +
            'omit for "none of these" and say why in reason; decide: the chosen option)',
        },
        reason: {
          type: 'string',
          description: 'One line on why you picked it (add_input)',
        },
        rejectedReasons: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Why each option was turned down, as {choiceId: reason} (decide)',
        },
        // --- Identifiers ---
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create and promote_from_knowledge)',
        },
        decisionId: {
          type: 'string',
          description: 'Decision ID (required for update, delete, link, unlink, supersede)',
        },
        supersededById: {
          type: 'string',
          description: 'ID of the decision that supersedes this one (required for supersede)',
        },
        // --- Create / update fields ---
        title: {
          type: 'string',
          description: 'Decision title (required for create), e.g. "Use PostgreSQL over Firestore". ' +
            'Optional for promote_from_knowledge (defaults from the knowledge item).',
        },
        context: {
          type: 'string',
          description: 'The situation / forces that motivated the decision, supports markdown ' +
            '(create, update)',
        },
        options: {
          type: 'string',
          description: 'The options considered, supports markdown (create, update)',
        },
        decision: {
          type: 'string',
          description: 'The decision that was made, supports markdown (create, update)',
        },
        consequences: {
          type: 'string',
          description: 'The resulting consequences / trade-offs, supports markdown (create, update)',
        },
        status: {
          type: 'string',
          enum: ['proposed', 'accepted', 'rejected', 'superseded', 'deprecated'],
          description: 'Decision lifecycle status (default: "proposed") (create, update). For decide: ' +
            '"accepted" (default) or "rejected" (none of the options). A decision to make on an epic ' +
            'cannot change status through update; use decide.',
        },
        projectId: {
          type: 'string',
          description: 'Scope the decision to a project. Omit/empty = cross-project / org-wide ' +
            '(create, update)',
        },
        // --- link / unlink fields ---
        targetType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Type of artifact to link/unlink (required for link, unlink)',
        },
        targetId: {
          type: 'string',
          description: 'ID of the artifact to link/unlink (required for link, unlink)',
        },
        links: LINKS_ARRAY_SCHEMA,
        // --- promote_from_knowledge fields ---
        taskId: {
          type: 'string',
          description: 'Task whose knowledge item to promote (required for promote_from_knowledge), ' +
            'or the task to hold back / release (hold_task, release_task)',
        },
        knowledgeId: {
          type: 'string',
          description: 'ID of the decision-type knowledge item to promote ' +
            '(required for promote_from_knowledge)',
        },
        linkToType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Optionally link the new decision to this artifact type on creation ' +
            '(create, promote_from_knowledge)',
        },
        linkToId: {
          type: 'string',
          description: 'ID of the artifact to link the new decision to on creation ' +
            '(create, promote_from_knowledge; requires linkToType)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'get_decision',
    description: 'Retrieve a single Decision, list an organization\'s decisions, or list the decisions ' +
      'linked to a given entity (e.g. all decisions on a feature). Provide decisionId for a single ' +
      'lookup; provide linkedType + linkedId to list decisions linked to that entity; provide ' +
      'epicId to list the decisions to make on an epic (open ones first, each with everyone\'s ' +
      'picks and the tasks it holds back; add status "proposed" for only the open ones); ' +
      'otherwise provide organizationId to list.',
    inputSchema: {
      type: 'object',
      properties: {
        decisionId: {
          type: 'string',
          description: 'Decision ID for a single lookup',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for list, unless using linkedType + linkedId or epicId)',
        },
        epicId: {
          type: 'string',
          description: 'List the decisions to make on this epic, with picks and held tasks',
        },
        linkedType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'List decisions linked to this entity type (requires linkedId), ' +
            'e.g. all decisions on a feature',
        },
        linkedId: {
          type: 'string',
          description: 'ID of the entity to list linked decisions for (requires linkedType)',
        },
        includeLinks: {
          type: 'boolean',
          description: 'If true (single lookup), also return the decision\'s linked artifacts',
        },
        // --- List filters ---
        projectId: {
          type: 'string',
          description: 'Filter to a single project\'s decisions (list mode)',
        },
        status: {
          type: 'string',
          enum: ['proposed', 'accepted', 'rejected', 'superseded', 'deprecated'],
          description: 'Filter by status (list mode)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (list mode)',
        },
      },
    },
  },
];
