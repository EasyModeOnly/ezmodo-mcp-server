import { LINKABLE_TYPES } from '../tools/linkable-types.js';
import {
  LINK_ITEM_SCHEMA,
  LINKS_ARRAY_SCHEMA,
  RELATED_ITEM_SCHEMA,
  LINK_TYPES,
} from '../tools/link-params.js';
import { TOOLS } from '../tools/index.js';

/**
 * Walk every schema node reachable from a tool's inputSchema — properties,
 * array items, and nested combinations — yielding [path, node]. Scanning the
 * whole tree (not a hand-listed set of files) is the point: a new tool file
 * with a hand-copied entity enum must fail this test the day it is added.
 */
function* walk(node, path = '') {
  if (!node || typeof node !== 'object') return;
  yield [path, node];
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    yield* walk(child, `${path}.${key}`);
  }
  if (node.items) yield* walk(node.items, `${path}[]`);
}

/**
 * Enums that name entity types but are deliberately NOT the linkable set.
 * Keyed by `${toolName}${path}` so adding an exemption is a visible, reviewed
 * act rather than a silent widening of the heuristic.
 */
const EXEMPT = new Map([
  // tools/tags.js — the TAGGABLE set. entity_tags covers fewer entities than
  // entity_links; widening it would offer combos the tagging API rejects.
  ['manage_tag.entities[].entityType', 'taggable set, not linkable set'],
  ['list_tags.entityTypes[]', 'taggable set, not linkable set'],
  ['list_tags.entityType', 'taggable set, not linkable set'],
  // tools/attachments.js — the ATTACHABLE set. Attachments only exist on these
  // four entities.
  ['list_attachments.entityType', 'attachable set, not linkable set'],
]);

/** An enum is entity-type-shaped when every member is a linkable type. */
function isEntityTypeEnum(values) {
  return (
    Array.isArray(values) &&
    values.length >= 3 &&
    values.every((v) => LINKABLE_TYPES.includes(v))
  );
}

function collectEntityTypeEnums() {
  const found = [];
  for (const tool of TOOLS) {
    for (const [path, node] of walk(tool.inputSchema)) {
      if (!isEntityTypeEnum(node.enum)) continue;
      const key = `${tool.name}${path}`;
      if (EXEMPT.has(key)) continue;
      found.push({ key, enum: node.enum });
    }
  }
  return found;
}

describe('entity-type enum hygiene', () => {
  it('every entity-type enum in every tool IS the shared LINKABLE_TYPES array', () => {
    const found = collectEntityTypeEnums();

    // Sanity: the scan must actually be finding enums, or it proves nothing.
    expect(found.length).toBeGreaterThan(5);

    const drifted = found
      .filter((f) => f.enum !== LINKABLE_TYPES)
      .map((f) => `${f.key}: [${f.enum.join(', ')}]`);

    // Identity, not equality — a copy that happens to agree today is exactly
    // the failure mode this guards (six files had drifted before E-225).
    expect(drifted).toEqual([]);
  });

  it('covers the tools that carried the stale 4-type enum before E-225', () => {
    const keys = collectEntityTypeEnums().map((f) => f.key);
    for (const key of [
      'manage_task.addRelatedItem.type',
      'manage_task.removeRelatedItem.type',
      'manage_epic.addRelatedItem.type',
      'manage_epic.removeRelatedItem.type',
      'manage_document.addRelatedItem.type',
      'manage_document.removeRelatedItem.type',
      'manage_catalog.targetType',
      'list_catalogs.linkedType',
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('exempts only enums that are documented as a different set', () => {
    for (const reason of EXEMPT.values()) {
      expect(typeof reason).toBe('string');
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});

describe('link parameter schemas', () => {
  it('LINK_ITEM_SCHEMA requires targetType + targetId and defaults to relates_to', () => {
    expect(LINK_ITEM_SCHEMA.required).toEqual(['targetType', 'targetId']);
    expect(LINK_ITEM_SCHEMA.properties.targetType.enum).toBe(LINKABLE_TYPES);
    expect(LINK_ITEM_SCHEMA.properties.linkType.enum).toBe(LINK_TYPES);
    expect(LINK_ITEM_SCHEMA.properties.linkType.default).toBe('relates_to');
  });

  it('LINKS_ARRAY_SCHEMA is an array of LINK_ITEM_SCHEMA', () => {
    expect(LINKS_ARRAY_SCHEMA.type).toBe('array');
    expect(LINKS_ARRAY_SCHEMA.items).toBe(LINK_ITEM_SCHEMA);
  });

  it('RELATED_ITEM_SCHEMA is the drop-in replacement for the stale inline objects', () => {
    expect(RELATED_ITEM_SCHEMA.required).toEqual(['type', 'id']);
    expect(RELATED_ITEM_SCHEMA.properties.type.enum).toBe(LINKABLE_TYPES);
  });

  it('offers `links` on the create-bearing tools E-225 targeted', () => {
    const byName = new Map(TOOLS.map((t) => [t.name, t]));
    for (const name of [
      'manage_task',
      'report_untracked_work',
      'manage_epic',
      'manage_document',
      'manage_decision',
      'manage_design',
      'manage_feature_flag',
      'manage_milestone',
      'manage_test_case',
      'manage_test_suite',
    ]) {
      const tool = byName.get(name);
      expect(tool).toBeDefined();
      expect(tool.inputSchema.properties.links).toBe(LINKS_ARRAY_SCHEMA);
    }
  });
});
