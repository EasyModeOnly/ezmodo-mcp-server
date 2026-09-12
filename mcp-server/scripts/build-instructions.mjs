#!/usr/bin/env node
/**
 * Generate lib/instructions.generated.js from the work-tracking skill.
 *
 * WHY GENERATE RATHER THAN WRITE IT TWICE. The MCP `instructions` string and
 * plugins/ezmodo/skills/work-tracking/SKILL.md say the same thing to different
 * audiences: the string reaches every MCP client on every session, the skill
 * reaches Claude Code on demand and in full. Two hand-maintained prose copies
 * of one contract is precisely the failure that moved these rules out of every
 * repo's CLAUDE.md and into the plugin in the first place (#2594) — copies
 * drift, and the drift is invisible until someone follows the stale one.
 *
 * WHY GENERATE AT BUILD TIME RATHER THAN READ THE SKILL AT RUNTIME. This
 * package is published to npm and launched with `npx @ezmodo/mcp-server`. It
 * ships no plugins/ directory and cannot: the skill lives in the plugin, which
 * is a different artifact. So the extracted text is committed here, and
 * __tests__/instructions.test.js re-extracts it whenever the skill IS present
 * (i.e. in the repo, never in a published install) and fails on any difference.
 * That test is the drift guard; there is no CI wiring to forget.
 *
 * Run: npm run generate:instructions --workspace=@ezmodo/mcp-server
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
export const SKILL_PATH = join(here, '..', '..', 'plugins', 'ezmodo', 'skills', 'work-tracking', 'SKILL.md');
const OUTPUT_PATH = join(here, '..', 'lib', 'instructions.generated.js');

/**
 * Pull the text between a marker pair.
 *
 * Throws rather than returning empty on a missing marker: a silently empty
 * instructions string would ship a server that says nothing, and look fine.
 */
export function extract(markdown, marker) {
  const open = `<!-- mcp:${marker}:start -->`;
  const close = `<!-- mcp:${marker}:end -->`;
  const from = markdown.indexOf(open);
  const to = markdown.indexOf(close);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`Marker mcp:${marker} not found (or inverted) in the skill.`);
  }
  return markdown.slice(from + open.length, to).trim();
}

/** Build the module source from a skill document. */
export function render(markdown) {
  const core = extract(markdown, 'core');
  const local = extract(markdown, 'local');

  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Extracted from plugins/ezmodo/skills/work-tracking/SKILL.md by
 * scripts/build-instructions.mjs. Edit the SKILL, then run:
 *
 *   npm run generate:instructions --workspace=@ezmodo/mcp-server
 *
 * __tests__/instructions.test.js fails if this drifts from the skill.
 */

export const WORK_TRACKING_CORE = ${JSON.stringify(core)};

export const WORK_TRACKING_LOCAL = ${JSON.stringify(local)};
`;
}

// Only write when run directly, so the test can import the helpers above.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const skill = readFileSync(SKILL_PATH, 'utf-8');
  writeFileSync(OUTPUT_PATH, render(skill), 'utf-8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}
