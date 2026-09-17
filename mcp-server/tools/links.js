/**
 * Links Tools
 *
 * Polymorphic link management — exposes the unified entity_links surface
 * (Phase 3 of the entity_links unification). One tool covers every link
 * combo across tasks, epics, projects, and documents instead of having
 * to remember which entity-specific tool to use.
 *
 * Use these in preference to manage_task / manage_epic's per-link fields
 * (addDependency, addRelatedItem, ...) when the link's source and target
 * are different entity types — e.g. linking a task to a related document.
 */

import { LINKABLE_TYPES } from './linkable-types.js';

export const LINK_TOOLS = [
  {
    name: 'manage_link',
    description:
      'Add, remove, or verify a link between two entities. Covers blocking ' +
      'dependencies (blocked_by) and soft cross-entity links (relates_to) ' +
      'uniformly. blocked_by is only valid for task→task and epic→epic; ' +
      'relates_to works between any of: task, epic, project, document, ' +
      'feature, decision, design, test_suite, feature_flag, catalog, catalog_item ' +
      '(e.g. link a feature to the feature_flag that gates it). ' +
      'Idempotent — re-adding an existing link is a no-op, removing an ' +
      'absent link is a no-op. Use action "verify" to stamp a link\'s ' +
      'freshness (E-166/E-154): record that you confirmed it still correct, ' +
      'optionally against a commitSha — call it after touching code a linked ' +
      'document describes so the freshness signal stays accurate.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'verify'],
          description: 'Action to perform',
        },
        sourceType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description:
            'The entity from which the link originates. For blocked_by ' +
            'this is the entity being blocked.',
        },
        sourceId: {
          type: 'string',
          description: 'ID of the source entity (required)',
        },
        targetType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description:
            'The entity the link points to. For blocked_by this is the ' +
            'entity that must complete first.',
        },
        targetId: {
          type: 'string',
          description: 'ID of the target entity (required)',
        },
        linkType: {
          type: 'string',
          enum: ['blocked_by', 'relates_to'],
          description:
            'blocked_by: source is blocked by target (only task→task or ' +
            'epic→epic). relates_to: soft cross-entity link (any combo).',
        },
        commitSha: {
          type: 'string',
          description:
            'Optional, for action "verify": the commit sha you confirmed the ' +
            'link correct against. Recorded as the verification point.',
        },
      },
      required: ['action', 'sourceType', 'sourceId', 'targetType', 'targetId', 'linkType'],
    },
  },
  {
    name: 'list_links',
    description:
      'List an entity\'s links. Returns one row per ' +
      'link (source, target, linkType, createdAt, and freshness fields ' +
      'lastVerifiedAt / lastVerifiedBy / lastVerifiedCommitSha). By default ' +
      'only OUTGOING links (the entity as source) are returned — set ' +
      'direction:"incoming" for links pointing AT it (e.g. the features that ' +
      'reference this task), or "both" for the full neighbourhood, since ' +
      'relates_to is not always stored bidirectionally. Optionally ' +
      'filter by linkType (e.g. only blockers) or targetType (e.g. only ' +
      'related documents). Set hydrate:true to also get each target\'s ' +
      'title/status, so you can read the graph without a get_* per link.',
    inputSchema: {
      type: 'object',
      properties: {
        sourceType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Type of the source entity (required)',
        },
        sourceId: {
          type: 'string',
          description: 'ID of the source entity (required)',
        },
        linkType: {
          type: 'string',
          enum: ['blocked_by', 'relates_to'],
          description: 'Optional filter: only return this kind of link',
        },
        targetType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Optional filter: only return links to this entity type',
        },
        direction: {
          type: 'string',
          enum: ['outgoing', 'incoming', 'both'],
          default: 'outgoing',
          description:
            'Which edges to return relative to the given entity. "outgoing" ' +
            '(default) = links where it is the source. "incoming" = links ' +
            'pointing at it. "both" = either. Use "both" when you want the ' +
            'entity\'s whole neighbourhood — relates_to is not always stored ' +
            'in both directions.',
        },
        includeSuggested: {
          type: 'boolean',
          description:
            'When true, also return machine-suggested (not yet confirmed) ' +
            'links alongside confirmed ones, so you can review and confirm ' +
            'them. Off by default — suggestions are not facts.',
        },
        hydrate: {
          type: 'boolean',
          description:
            'When true, each row gains a `related` object with the target\'s ' +
            'title/status/kind. Costs one lookup per link, so leave it off ' +
            'when you only need the edges.',
        },
      },
      required: ['sourceType', 'sourceId'],
    },
  },
  {
    name: 'resolve_links',
    description:
      'Given files you have touched (or are about to), return the entities you should link to: ' +
      'the features (product capabilities) whose owned code paths cover them, plus how confident ' +
      'each match is. Read-only; nothing is written.\n\n' +
      '`features.owned` are capabilities that solely own a path: link them. `features.shared` are ' +
      'paths several features claim: pick the one your work actually advanced. `unmatchedPaths` ' +
      'are owned by no feature — a gap in the feature map, fixed with manage_feature action:"paths".\n\n' +
      'Call it BEFORE creating work to fill in the `links` param, or after a change set to check ' +
      'you have not missed anything. If it returns a feature you did not expect, that is a signal ' +
      'your change is broader than you thought — worth reading before you continue.\n\n' +
      'Paths are repo-relative (e.g. "mobile/lib/features/auth/screens/login_screen.dart").',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (required)' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative file paths to resolve (required)',
        },
      },
      required: ['projectId', 'paths'],
    },
  },
  {
    name: 'preview_links',
    description:
      'Show what ezmodo WOULD link an entity to, without writing anything. Each proposal reports ' +
      '`autoApplies`: true means ezmodo records it on its own, false means it wants a human or you ' +
      'to confirm.\n\n' +
      'Use it when you want to see and choose rather than let linking happen — confirm the ones you ' +
      'agree with via manage_link, which records them as deliberately asserted rather than derived.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID' },
        subjectType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Type of the entity the links would hang off (required)',
        },
        subjectId: { type: 'string', description: 'ID of that entity (required)' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative file paths the work touches',
        },
        epicId: { type: 'string', description: 'The epic the work belongs to' },
        trigger: {
          type: 'string',
          enum: ['files_linked', 'commit_linked', 'work_created', 'work_reparented', 'plan_approved', 'surface_imported'],
          description: 'What kind of event to simulate. Defaults sensibly from whether paths were supplied.',
        },
      },
      required: ['subjectType', 'subjectId'],
    },
  },
];
