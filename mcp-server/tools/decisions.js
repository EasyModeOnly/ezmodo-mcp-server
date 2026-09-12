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
      'they do not contain them.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'link', 'unlink', 'supersede', 'promote_from_knowledge'],
          description: 'Action to perform. "supersede" marks a decision as superseded by another ' +
            '(pass decisionId + supersededById). "promote_from_knowledge" elevates a task\'s ' +
            'decision-type knowledge item into a durable Decision (pass organizationId + taskId + ' +
            'knowledgeId, optionally title + linkToType/linkToId to link it on creation).',
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
          description: 'Decision lifecycle status (default: "proposed") (create, update)',
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
          description: 'Task whose knowledge item to promote (required for promote_from_knowledge)',
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
      'lookup; provide linkedType + linkedId to list decisions linked to that entity; otherwise ' +
      'provide organizationId to list.',
    inputSchema: {
      type: 'object',
      properties: {
        decisionId: {
          type: 'string',
          description: 'Decision ID for a single lookup',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for list, unless using linkedType + linkedId)',
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
