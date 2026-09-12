/**
 * Background Agents Tools (E-150)
 *
 * Control-plane tools for EzModo's background hygiene agents. The agents
 * themselves (Stale Sentinel, Dependency Mapper, Related Linker, Duplicate
 * Hunter) run on EzModo's infra; these tools let an MCP client (e.g. the
 * user's Claude) review and act on what they produced.
 */

export const AGENT_TOOLS = [
  {
    name: 'list_agent_suggestions',
    description:
      'List pending background-agent suggestions for the current organization. ' +
      'Returns the newest first — review and either accept_agent_suggestion or ' +
      'reject_agent_suggestion each one. Action types: \'link\' (create entity_link), ' +
      '\'archive\' (set tasks.archived=true), \'merge\' / \'unblock_check\' / \'enrich\' ' +
      '(no destructive side effect on accept — intent only).',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Max suggestions to return (default 100).',
        },
        entityType: {
          type: 'string',
          description:
            'Narrow to one entity, e.g. entityType="task" with entityId. ' +
            'Use this to ask "what is pending on THIS task?" instead of ' +
            'scanning the whole organization. Matches EITHER end of the ' +
            'suggestion — you get it whether your entity is what the proposal ' +
            'is about or what it points at, so a PR-link suggestion keyed on ' +
            'the pull request still shows up under its target task.',
        },
        entityId: {
          type: 'string',
          description: 'The entity id. Only meaningful together with entityType.',
        },
        action: {
          type: 'string',
          enum: ['link', 'archive', 'merge', 'unblock_check', 'enrich', 'status_change', 'verify_link', 'regenerate_how_it_works'],
          description:
            'Narrow to one suggestion verb. action="link" is what a ' +
            'links-focused review asks for — the queue is shared with every ' +
            'other agent, so without this you page through their findings too.',
        },
        agentType: {
          type: 'string',
          description: 'Narrow to one producing agent, e.g. "autolink" or "related_linker".',
        },
        minConfidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description:
            'Drop findings below this confidence. Raise it when the queue is ' +
            'noisy — past three or four items people stop reading and start ' +
            'bulk-accepting, which is worse than seeing fewer.',
        },
      },
    },
  },

  {
    name: 'accept_agent_suggestion',
    description:
      'Accept a pending suggestion. The framework runs the side effect tied ' +
      'to the suggestion\'s action (e.g. action=\'link\' inserts the entity_link, ' +
      'action=\'archive\' archives the task) BEFORE flipping the status to ' +
      'accepted, so a failed side effect leaves the suggestion pending.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: 'The agent_suggestions.id returned by list_agent_suggestions.',
        },
        reviewNote: {
          type: 'string',
          description: 'Optional free-text note recorded with the acceptance.',
        },
      },
    },
  },

  {
    name: 'reject_agent_suggestion',
    description:
      'Reject a pending suggestion. Flips status to rejected and frees the ' +
      'dedup slot so the agent may re-propose the same idea in a future run ' +
      'if conditions change. Use a reviewNote to teach future judgement.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        reviewNote: { type: 'string' },
      },
    },
  },

  {
    name: 'run_agent_now',
    description:
      'Manually enqueue an agent run, bypassing the scheduler\'s cadence. ' +
      'Useful for testing or for \'check this entity for duplicates now\' ' +
      'flows. The agent type must be registered server-side. Quota is ' +
      'respected — if the org has exhausted its monthly suggestion cap the ' +
      'run completes with status=\'quota_exhausted\' and zero new suggestions.',
    inputSchema: {
      type: 'object',
      required: ['agentType'],
      properties: {
        agentType: {
          type: 'string',
          enum: ['stale_sentinel', 'dependency_mapper', 'related_linker', 'duplicate_hunter'],
        },
        scope: {
          type: 'object',
          description:
            'Optional narrowing of the run to a single entity. Omit for a ' +
            'full org/project sweep.',
          properties: {
            entity_type: { type: 'string', enum: ['task', 'epic', 'goal', 'doc'] },
            entity_id: { type: 'string' },
          },
          required: ['entity_type', 'entity_id'],
        },
      },
    },
  },

  {
    name: 'configure_agent',
    description:
      'Enable, disable, or change cadence for an agent in the current org. ' +
      'First enable on a fresh org schedules the agent\'s first run for NOW() ' +
      'so initial suggestions arrive within a scheduler tick (~60s).',
    inputSchema: {
      type: 'object',
      required: ['agentType'],
      properties: {
        agentType: {
          type: 'string',
          enum: ['stale_sentinel', 'dependency_mapper', 'related_linker', 'duplicate_hunter'],
        },
        enabled: { type: 'boolean' },
        cadenceSeconds: {
          type: 'integer',
          minimum: 60,
          description:
            'Run interval in seconds. Omit to use the agent\'s default cadence ' +
            '(typically 24h). Minimum 60s to prevent abuse.',
        },
      },
    },
  },

  {
    name: 'resolve_link_suggestions',
    description:
      'Accept and/or reject several pending suggestions in ONE call.\n\n' +
      'This exists because clearing a queue item-by-item costs a call each, and ' +
      'anything that expensive gets skipped — leaving suggestions to pile up until ' +
      'someone bulk-dismisses them unread. Pass the ids you agree with in `accept` ' +
      'and the ones you do not in `reject`.\n\n' +
      'Rejecting is a real answer, not a failure: a rejection with a reason is how ' +
      'the linker learns. Leaving items pending is the only wrong outcome.\n\n' +
      'WHERE THE IDS COME FROM: the `suggestionId` on each entry of a manage_task / ' +
      'manage_epic response\'s `linkSuggestions`, or — authoritatively — ' +
      'list_agent_suggestions with action:"link" plus entityType/entityId. Prefer ' +
      'list_agent_suggestions when a response says its list may be partial: the ' +
      'engine\'s semantic rules finish a beat after the deterministic ones, so an ' +
      'inline list can legitimately show fewer than are actually queued.\n\n' +
      'Partial failure is reported per id rather than aborting — one bad id must not ' +
      'cost the rest of the batch.',
    inputSchema: {
      type: 'object',
      properties: {
        accept: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suggestion ids to accept (the side effect runs for each).',
        },
        reject: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              reason: { type: 'string', description: 'Why — recorded to teach future judgement.' },
            },
            required: ['id'],
          },
          description: 'Suggestions to reject, each with an optional reason.',
        },
        reviewNote: {
          type: 'string',
          description: 'Note applied to every acceptance in this batch.',
        },
      },
    },
  },
];
