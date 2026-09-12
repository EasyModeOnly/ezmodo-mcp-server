/**
 * The MCP `instructions` string — what the server tells every client about how
 * to work with it (#2633).
 *
 * WHY THIS MATTERS OUT OF PROPORTION TO ITS SIZE. The tools were always the
 * easy half. What makes an agent actually TRACK work — create a task before you
 * edit, tick steps off, capture knowledge, link the commit, finish at
 * in_review — shipped only as Claude Code skills in plugins/ezmodo/skills/.
 * Cursor, Codex, Zed and every other stdio MCP client got the tools and none of
 * the discipline. The initialize result carries an instructions string that
 * clients inject into system context, so this reaches all of them with no
 * plugin, no per-editor packaging, and no install step.
 *
 * WHY IT IS SHORT. A skill is loaded on demand and can afford several hundred
 * lines. Instructions are paid for on every session, so this is the irreducible
 * core and nothing else. The full contract stays in the skill, and the two are
 * the same words — see scripts/build-instructions.mjs for how, and why they are
 * not two hand-maintained copies.
 *
 * WHY IT VARIES BY SURFACE. The remote connector serves no local-machine tools,
 * so telling an agent there to link commits and pass changed files is advice it
 * cannot follow — worse than silence, because an agent that tries will report a
 * failure the user cannot act on. The local block is appended only for stdio,
 * on the same `surface` parameter that filters the tool list.
 */

import { WORK_TRACKING_CORE, WORK_TRACKING_LOCAL } from './instructions.generated.js';

/**
 * @param {'local'|'remote'} [surface]
 * @returns {string}
 */
export function getInstructions(surface = 'local') {
  return surface === 'remote'
    ? WORK_TRACKING_CORE
    : `${WORK_TRACKING_CORE}\n\n${WORK_TRACKING_LOCAL}`;
}
