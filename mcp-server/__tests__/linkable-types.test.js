import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { LINKABLE_TYPES } from '../tools/linkable-types.js';
import { DECISION_TOOLS } from '../tools/decisions.js';
import { DESIGN_TOOLS } from '../tools/designs.js';
import { FEATURE_TOOLS } from '../tools/features.js';
import { FEATURE_FLAG_TOOLS } from '../tools/feature-flags.js';
import { LINK_TOOLS } from '../tools/links.js';
import { GRAPH_TOOLS } from '../tools/graph.js';

const here = dirname(fileURLToPath(import.meta.url));
const GO_LINKS_SERVICE = join(here, '../../api/internal/core/links/service.go');

/**
 * The MCP enums and the Go API's allEntityTypes are two halves of one contract:
 * a type the API accepts but MCP omits is a capability agents cannot reach, and
 * a type MCP offers but the API rejects turns a clear schema error into a 400.
 * Six tool files used to spell the list out inline and all six had drifted.
 */
describe('LINKABLE_TYPES', () => {
  it('matches the Go API\'s canonical allEntityTypes list', () => {
    const src = readFileSync(GO_LINKS_SERVICE, 'utf-8');
    const block = src.match(/var allEntityTypes = \[\]EntityType\{([\s\S]*?)\n\}/);
    expect(block).not.toBeNull();

    // Constants are declared as `EntityTask EntityType = "task"` — resolve each
    // name in the list back to the string it stands for.
    const byConst = new Map(
      [...src.matchAll(/(Entity\w+)\s+EntityType = "([\w_]+)"/g)].map((m) => [m[1], m[2]])
    );
    const goTypes = [...block[1].matchAll(/Entity\w+/g)].map((m) => {
      const value = byConst.get(m[0]);
      expect(value).toBeDefined();
      return value;
    });

    expect([...LINKABLE_TYPES].sort()).toEqual([...goTypes].sort());
  });

  it('is the single list every link-bearing tool uses', () => {
    const allTools = [
      ...DECISION_TOOLS,
      ...DESIGN_TOOLS,
      ...FEATURE_TOOLS,
      ...FEATURE_FLAG_TOOLS,
      ...LINK_TOOLS,
      ...GRAPH_TOOLS,
    ];

    // Any enum naming an entity type must BE the shared array, not a copy that
    // happens to agree today.
    const enums = [];
    for (const tool of allTools) {
      for (const prop of Object.values(tool.inputSchema?.properties ?? {})) {
        if (Array.isArray(prop.enum) && prop.enum.includes('milestone')) {
          enums.push(prop.enum);
        }
      }
    }

    expect(enums.length).toBeGreaterThan(0);
    for (const e of enums) {
      expect(e).toBe(LINKABLE_TYPES);
    }
  });
});
