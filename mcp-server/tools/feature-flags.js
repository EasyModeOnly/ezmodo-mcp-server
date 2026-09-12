/**
 * Feature Flag Tools
 * MCP tools for Feature Flags (E-149) — PM-aware, lifecycle-tracked runtime gates.
 *
 * A Feature Flag is an org-level (projectId nullable) runtime gate with a
 * lifecycle (draft → … → enabled/disabled → sunset → archived), a served value
 * (boolean | multivariate | config), optional prerequisite nesting
 * (parentFeatureFlagId — a child only serves "on" when its parent chain is on
 * for the same subject), and targeting rules + percentage rollout. Flags LINK to
 * the feature(s) they gate via the generic link graph — they do not contain them.
 *
 * Prefer the polymorphic manage_link (sourceType "feature", targetType
 * "feature_flag") to attach a flag to a feature; the link/unlink actions here are
 * a convenience that go through the flag's own link surface.
 */

import { LINKABLE_TYPES } from './linkable-types.js';
import { LINKS_ARRAY_SCHEMA } from './link-params.js';

export const FEATURE_FLAG_TOOLS = [
  {
    name: 'manage_feature_flag',
    description: 'Create, update, or delete a Feature Flag (a PM-aware runtime gate: key, name, ' +
      'kind boolean|multivariate|config, rollout %, prerequisite parent, governance properties), ' +
      'advance its lifecycle status (action "transition"), or link/unlink it to the feature(s) it ' +
      'gates. Flags are org-level and LINK to features/epics/tasks/etc., they do not contain them. ' +
      'Status changes go through action "transition" (recorded in history), NOT update.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete', 'transition', 'link', 'unlink', 'set_environment_config'],
          description: 'Action to perform. "transition" advances lifecycle status (pass flagId + ' +
            'status + reason). "link"/"unlink" attach/detach the flag to an artifact (pass flagId + ' +
            'targetType + targetId). "set_environment_config" sets the flag\'s served state in ONE ' +
            'environment (pass flagId + environmentId + enabled + rolloutPercentage [+ defaultVariantId]) — ' +
            'this is how you turn a flag on in dev but off in prod (E-186).',
        },
        // --- per-environment served state (E-186, action set_environment_config) ---
        environmentId: {
          type: 'string',
          description: 'Environment ID whose served state to set (set_environment_config). Get ids ' +
            'from manage_environment action "list".',
        },
        enabled: {
          type: 'boolean',
          description: 'Per-environment kill switch — when false the flag serves off in this ' +
            'environment regardless of rules/rollout (set_environment_config)',
        },
        // --- Identifiers ---
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for create)',
        },
        flagId: {
          type: 'string',
          description: 'Feature flag ID (required for update, delete, transition, link, unlink)',
        },
        // --- Create / update fields ---
        key: {
          type: 'string',
          description: 'Stable programmatic identifier used by code gates and the evaluator ' +
            '(e.g. "analytics.behavioral_source"). Unique per organization. Required for create.',
        },
        name: {
          type: 'string',
          description: 'Human-friendly flag name (required for create) (create, update)',
        },
        description: {
          type: 'string',
          description: 'What the flag gates and when it can be removed, supports markdown (create, update)',
        },
        kind: {
          type: 'string',
          enum: ['boolean', 'multivariate', 'config'],
          description: 'What the flag serves: "boolean" on/off (default), "multivariate" named ' +
            'weighted variants, or "config" a JSON payload (create, update)',
        },
        rolloutPercentage: {
          type: 'number',
          description: 'Percentage rollout 0–100 (default 0). Subjects are bucketed by a consistent ' +
            'hash of (key, subjectId); those below the cutoff are served on (create, update)',
        },
        projectId: {
          type: 'string',
          description: 'Scope the flag to a project. Omit/empty = org-wide / system flag ' +
            '(e.g. a backend gate) (create, update)',
        },
        parentFeatureFlagId: {
          type: 'string',
          description: 'Prerequisite parent flag ID — this flag serves "on" for a subject only if ' +
            'the parent chain is also on for that subject. Omit/empty = root flag. Cycles are ' +
            'rejected (create, update)',
        },
        defaultVariantId: {
          type: 'string',
          description: 'Variant served when the flag is on and no rule matched (fallthrough). ' +
            'Empty string clears it (update)',
        },
        properties: {
          type: 'object',
          description: 'Governance metadata (owner, expiry/ttl, ticket link, environment, custom ' +
            'k/v). Does NOT affect evaluation (create, update)',
        },
        // --- transition fields ---
        status: {
          type: 'string',
          enum: ['draft', 'in_development', 'rolling_out', 'enabled', 'disabled',
            'sunset', 'archived', 'cancelled'],
          description: 'For action "create": the initial lifecycle status (default "draft"). For ' +
            'action "transition": the target status to move to.',
        },
        reason: {
          type: 'string',
          description: 'Why the status changed — recorded in the flag\'s history (transition)',
        },
        // --- link / unlink fields ---
        targetType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Type of artifact to link/unlink — usually "feature" (required for link, unlink)',
        },
        targetId: {
          type: 'string',
          description: 'ID of the artifact to link/unlink (required for link, unlink)',
        },
        // --- create-time link fields ---
        linkToType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Optionally link the new flag to this artifact type on creation (create)',
        },
        linkToId: {
          type: 'string',
          description: 'ID of the artifact to link the new flag to on creation (create; requires linkToType)',
        },
        links: LINKS_ARRAY_SCHEMA,
      },
      required: ['action'],
    },
  },
  {
    name: 'get_feature_flag',
    description: 'Retrieve a single Feature Flag (with its variants + rules) by ID, or by ' +
      'organizationId + key (key is unique per org). Provide flagId, OR organizationId + key.',
    inputSchema: {
      type: 'object',
      properties: {
        flagId: {
          type: 'string',
          description: 'Feature flag ID for a single lookup',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (with key, for a lookup by key)',
        },
        key: {
          type: 'string',
          description: 'Flag key (with organizationId, for a lookup by key)',
        },
        includeLinks: {
          type: 'boolean',
          description: 'If true, also return the flag\'s linked artifacts',
        },
      },
    },
  },
  {
    name: 'list_feature_flags',
    description: 'List an organization\'s Feature Flags, optionally filtered by project, status, or ' +
      'kind — or list the flags linked to a given entity (e.g. all flags on a feature) via ' +
      'linkedType + linkedId.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        projectId: {
          type: 'string',
          description: 'Filter to a single project\'s flags',
        },
        status: {
          type: 'string',
          enum: ['draft', 'in_development', 'rolling_out', 'enabled', 'disabled',
            'sunset', 'archived', 'cancelled'],
          description: 'Filter by lifecycle status',
        },
        kind: {
          type: 'string',
          enum: ['boolean', 'multivariate', 'config'],
          description: 'Filter by flag kind',
        },
        includeOrgWide: {
          type: 'boolean',
          description: 'When filtering by projectId, also include org-wide (project-less) flags',
        },
        linkedType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'List flags linked to this entity type (requires linkedId), e.g. all flags on a feature',
        },
        linkedId: {
          type: 'string',
          description: 'ID of the entity to list linked flags for (requires linkedType)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
        },
      },
      required: ['organizationId'],
    },
  },
  {
    name: 'evaluate_feature_flag',
    description: 'Evaluate a Feature Flag for a subject and return the served Result ({ on, ' +
      'variantKey, value, reason }) — for debugging a flag\'s behavior from chat. Resolves the ' +
      'prerequisite chain and runs the deterministic evaluator (status → targeting rules → ' +
      'percentage rollout). Look up by organizationId + key.',
    inputSchema: {
      type: 'object',
      properties: {
        organizationId: {
          type: 'string',
          description: 'Organization ID (required)',
        },
        key: {
          type: 'string',
          description: 'Flag key to evaluate (required)',
        },
        subjectId: {
          type: 'string',
          description: 'Stable subject identifier for percentage bucketing (e.g. a userId). ' +
            'Same subject always lands in the same bucket per flag.',
        },
        environment: {
          type: 'string',
          description: 'Environment KEY to evaluate in (e.g. "production", "development"). ' +
            'Omit to use the flag scope\'s default environment (E-186).',
        },
        attributes: {
          type: 'object',
          description: 'Targeting facts the rules test against (e.g. { plan: "pro", country: "US" })',
        },
      },
      required: ['organizationId', 'key'],
    },
  },
  {
    name: 'manage_environment',
    description: 'Manage the configurable ENVIRONMENT registry (E-186): the named environments ' +
      '(e.g. development/staging/production) a flag can be served differently in. Environments are ' +
      'per-scope: org-wide (omit projectId) or project-scoped (set projectId). Exactly one per scope ' +
      'is the default (used when an evaluation does not name an environment). To set a flag\'s value ' +
      'IN an environment, use manage_feature_flag action "set_environment_config".',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'create', 'update', 'delete', 'set_default'],
          description: 'list (by organizationId [+projectId]); create; update (name/order); delete; ' +
            'set_default (make this the scope\'s default environment).',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for list and create)',
        },
        projectId: {
          type: 'string',
          description: 'Project scope. Omit/empty = the org-wide environment set (used by org-wide flags).',
        },
        environmentId: {
          type: 'string',
          description: 'Environment ID (required for update, delete, set_default)',
        },
        key: {
          type: 'string',
          description: 'Stable environment key, lowercase (e.g. "production"). Immutable. Required for create.',
        },
        name: {
          type: 'string',
          description: 'Human-friendly environment name (create, update)',
        },
        order: {
          type: 'number',
          description: 'Display order within the scope (create, update)',
        },
        isDefault: {
          type: 'boolean',
          description: 'Make this the scope\'s default environment on create (create)',
        },
      },
      required: ['action'],
    },
  },
];
