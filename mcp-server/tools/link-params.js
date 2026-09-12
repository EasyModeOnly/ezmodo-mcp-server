/**
 * The reusable link-shaped tool parameters, declared once.
 *
 * Two problems these exist to fix (E-225):
 *
 * 1. No creation tool could attach a link at CREATE time. An agent had to
 *    create the entity, then remember a second `manage_link` call — which it
 *    usually didn't, so work landed unlinked from the feature/flag/goal it
 *    belonged to. `LINKS_ARRAY_SCHEMA` gives every `create` action a `links`
 *    param so the graph edge is born with the entity.
 *
 * 2. Six tool files inlined a stale 4-type `['task','epic','project','document']`
 *    enum on addRelatedItem/removeRelatedItem that predated LINKABLE_TYPES, so
 *    a task could not be given a related design or decision except through
 *    `manage_link`. `RELATED_ITEM_SCHEMA` is the drop-in replacement.
 *
 * Everything here reuses the shared `LINKABLE_TYPES` array BY REFERENCE — the
 * `link-params` test asserts identity, not equality, so a copy that happens to
 * agree today cannot silently drift tomorrow.
 */

import { LINKABLE_TYPES } from './linkable-types.js';

/** Link semantics an agent may request. Mirrors links.LinkType in the Go API. */
export const LINK_TYPES = ['relates_to', 'blocked_by'];

/**
 * One link to attach, as used inside `links: [...]`. Mirrors the node shape
 * already carried by manage_feature's apply_init (`links:[{targetType,targetId}]`).
 */
export const LINK_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    targetType: {
      type: 'string',
      enum: LINKABLE_TYPES,
      description: 'Type of the entity to link to (required)',
    },
    targetId: {
      type: 'string',
      description: 'ID of the entity to link to (required)',
    },
    linkType: {
      type: 'string',
      enum: LINK_TYPES,
      default: 'relates_to',
      description:
        'relates_to: soft cross-entity link (any combo, the default). ' +
        'blocked_by: source is blocked by target (only task→task or epic→epic).',
    },
  },
  required: ['targetType', 'targetId'],
};

/**
 * The `links` array parameter. Attach on create so the entity is born
 * connected — no follow-up manage_link round trip, and no orphan work.
 *
 * Best-effort by contract: a link that fails is reported back in
 * `links.failed` on the response, it never fails the entity create.
 */
export const LINKS_ARRAY_SCHEMA = {
  type: 'array',
  items: LINK_ITEM_SCHEMA,
  description:
    'Links to attach at creation time, e.g. the feature this work advances, ' +
    'the goal it serves, or the document it implements: ' +
    '[{ targetType: "feature", targetId: "abc" }]. Prefer this over a ' +
    'follow-up manage_link call — work that is not linked when it is created ' +
    'usually never gets linked. Applied best-effort: failures are returned in ' +
    'the response\'s `links.failed` and never fail the create.',
};

/**
 * A single cross-entity related item — the shape used by the legacy
 * addRelatedItem / removeRelatedItem update params. Kept working, but
 * deprecated in favour of `addLinks` / `removeLinks`.
 */
export const RELATED_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: LINKABLE_TYPES,
      description: 'Type of the related entity',
    },
    id: {
      type: 'string',
      description: 'ID of the related entity',
    },
  },
  required: ['type', 'id'],
};
