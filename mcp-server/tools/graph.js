/**
 * Graph Tools
 *
 * The living navigation graph (E-209): a browsable, cross-entity projection
 * over the entity_links link graph (relates_to / blocked_by). One read lets an
 * agent walk "what connects to this" from any node — features, epics, tasks,
 * goals, milestones, components, designs, decisions, documents, test suites,
 * feature flags — instead of issuing N separate list_links calls and stitching
 * the results together.
 *
 * It is a READ VIEW, not a hierarchy: features/goals stay org-level; nothing is
 * re-parented. Backed by the graph projection endpoint (proxies GET-equivalent
 * server-side traversal, org-scoped + RLS).
 */

import { LINKABLE_TYPES } from './linkable-types.js';

export const GRAPH_TOOLS = [
  {
    name: 'get_graph',
    description:
      'Walk the compendium navigation graph outward from a root node and return ' +
      'the hydrated neighborhood as nodes + edges. Nodes carry lightweight ' +
      'display fields (type, id, title, status, projectId, kind, number, depth); ' +
      'edges are the entity_links relations (relates_to / blocked_by) between ' +
      'them, direction preserved. Use it to answer "what connects to this?" in ' +
      'one call. Traversal is a breadth-first walk bounded by depth and a node ' +
      'cap (truncated:true in the response means the cap was hit). A root ' +
      '(rootType + rootId) is REQUIRED — the graph is always explored from a ' +
      'node, not listed wholesale.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description:
            'Project that scopes access (authorizes the caller and sets the org ' +
            'scope). Required. The graph itself can still reach org-level nodes ' +
            '(features/goals) under scope "org".',
        },
        rootType: {
          type: 'string',
          enum: LINKABLE_TYPES,
          description: 'Type of the node to explore from (required).',
        },
        rootId: {
          type: 'string',
          description: 'ID of the root node to explore from (required).',
        },
        scope: {
          type: 'string',
          enum: ['org', 'project'],
          description:
            'org (default): keep every reachable in-org node. project: drop nodes ' +
            'that belong to a different project than the root (org-level nodes and ' +
            'the root are always kept).',
        },
        depth: {
          type: 'number',
          description: 'Hops from the root to traverse. Default 2, max 5.',
        },
        maxNodes: {
          type: 'number',
          description: 'Cap on the number of nodes returned. Default 150, max 500.',
        },
      },
      required: ['projectId', 'rootType', 'rootId'],
    },
  },
];
