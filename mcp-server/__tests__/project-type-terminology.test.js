/**
 * The agent-facing side of E-107 (#1131): project types and their vocabulary.
 *
 * Two things are guarded here, both of which were actually wrong before this
 * task:
 *
 *  1. The project-type enums listed seven of the ten real types, so three types
 *     were unreachable through MCP entirely — an agent could not create a
 *     creative, research or implementation project, and filtering by one
 *     returned a schema error rather than results.
 *  2. Nothing in the tool descriptions told an agent that "epic" is not what
 *     every project calls an epic, so a marketing project's UI said "Campaign"
 *     while the agent replied "I've broken this epic into five tasks".
 */

import { describe, it, expect } from '@jest/globals';

import { PROJECT_TOOLS } from '../tools/projects.js';
import { GIT_CONTEXT_TOOLS } from '../tools/git-context.js';

/** Every ProjectType value. Mirrors packages/types/src/enums.ts. */
const ALL_PROJECT_TYPES = [
  'software',
  'marketing',
  'sales',
  'operations',
  'design',
  'infrastructure',
  'creative',
  'research',
  'implementation',
  'custom',
];

function tool(tools, name) {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`tool ${name} not found`);
  return found;
}

/** Collect every `enum` under a JSON-schema property tree, by property name. */
function enumsFor(schema, propertyName) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.properties?.[propertyName]?.enum) {
      found.push(node.properties[propertyName].enum);
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(schema);
  return found;
}

describe('project type coverage in MCP tool schemas', () => {
  it('offers every project type wherever a type can be set or filtered', () => {
    // A type missing here is a type an agent cannot create or search for, with
    // no error anywhere to say so.
    const schemas = [
      tool(PROJECT_TOOLS, 'manage_project').inputSchema,
      tool(PROJECT_TOOLS, 'get_project').inputSchema,
    ];

    const typeEnums = schemas.flatMap((schema) => enumsFor(schema, 'type'));
    expect(typeEnums.length).toBeGreaterThan(0);

    for (const values of typeEnums) {
      expect([...values].sort()).toEqual([...ALL_PROJECT_TYPES].sort());
    }
  });

  it('never offers the reserved off-enum types as a choice', () => {
    // 'todo_list' is a live projects.type value whose behaviour comes from the
    // app, not a vocabulary, and 'standard' is the historic column default that
    // migration 000118 backfilled away from. Neither is a type to pick.
    const typeEnums = [
      ...enumsFor(tool(PROJECT_TOOLS, 'manage_project').inputSchema, 'type'),
      ...enumsFor(tool(PROJECT_TOOLS, 'get_project').inputSchema, 'type'),
    ];

    for (const values of typeEnums) {
      expect(values).not.toContain('todo_list');
      expect(values).not.toContain('standard');
    }
  });
});

describe('terminology is advertised to agents', () => {
  it('tells get_project callers that responses carry the project vocabulary', () => {
    const description = tool(PROJECT_TOOLS, 'get_project').description;

    expect(description).toContain('terminology');
    // An absent template must read as "plain English", not as a failure the
    // agent should retry or report.
    expect(description.toLowerCase()).toContain('plain english');
  });

  it('tells get_current_project_context callers the same thing', () => {
    // This is the session-init call, so it is the one an agent actually makes
    // before writing anything.
    const description = tool(GIT_CONTEXT_TOOLS, 'get_current_project_context').description;

    expect(description).toContain('terminology');
    expect(description).toContain('projectType');
  });

  it('warns that the vocabulary changes words, not field names', () => {
    // The failure this prevents: an agent renaming `epicId` to `campaignId`
    // because it was told epics are called campaigns.
    const description = tool(GIT_CONTEXT_TOOLS, 'get_current_project_context').description;

    expect(description).toContain('epicId');
  });
});
