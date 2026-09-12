#!/usr/bin/env node
/**
 * Generate prompts/commands.generated.js from the plugin's slash commands.
 *
 * WHAT PROMPTS ARE FOR, now that #2633 exists. The two overlap enough to be
 * worth stating: `instructions` is what the agent should ALWAYS do, injected
 * into system context on every session. Prompts are things a USER deliberately
 * invokes. That split is what decides the content — the four plugin commands
 * (start, resume, submit, untracked) are user-invoked actions, so they belong
 * here; the always-on discipline does not, and serving it twice would be the
 * drift problem again.
 *
 * Same generate-don't-retype rule as scripts/build-instructions.mjs, for the
 * same reason: plugins/ is a different artifact and is absent from a published
 * npx install, so the text is extracted at build time and committed, with
 * __tests__/prompts.test.js re-extracting whenever the commands ARE present.
 *
 * TWO TRANSLATIONS ARE NECESSARY, neither cosmetic. Both are cases where the
 * command body refers to something only Claude Code has, which an MCP client
 * would read as an instruction it cannot carry out:
 *
 *   1. !`cmd` shell interpolation. The Claude Code CLI runs it before the model
 *      sees it. MCP has no such preprocessor, so the raw syntax arrives as
 *      literal text and the model reads a backtick as a command result.
 *      Rewritten into an explicit instruction to run the command.
 *   2. "the **EzModo Work Tracking** skill". There are no skills outside Claude
 *      Code — but the same contract IS served to every client as the MCP
 *      `instructions` string (#2633), so the reference is repointed there
 *      rather than deleted. A reference to a sibling skill with no MCP
 *      equivalent (Link Upkeep) is dropped instead: the step that cites it
 *      already names the tools it needs, and pointing at something absent is
 *      worse than not pointing.
 *
 * Tests assert that neither form survives into a served prompt.
 *
 * Run: npm run generate:prompts --workspace=@ezmodo/mcp-server
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
export const COMMANDS_DIR = join(here, '..', '..', 'plugins', 'ezmodo', 'commands');
const OUTPUT_PATH = join(here, '..', 'prompts', 'commands.generated.js');

/**
 * Which surfaces each command is served on.
 *
 * `submit` is local-only: it reads git SHAs and links commits, neither of which
 * exists on a hosted server. Serving it remotely would hand someone a checklist
 * whose third step cannot be done.
 */
export const COMMANDS = [
  { file: 'start.md', name: 'start', surfaces: ['local', 'remote'] },
  { file: 'resume.md', name: 'resume', surfaces: ['local', 'remote'] },
  { file: 'submit.md', name: 'submit', surfaces: ['local'] },
  { file: 'untracked.md', name: 'untracked', surfaces: ['local', 'remote'] },
];

/** Split YAML-ish frontmatter from the body. Only the two keys we use. */
export function parseCommand(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(markdown);
  if (!match) {
    return { description: '', argumentHint: '', body: markdown.trim() };
  }
  const meta = {};
  for (const line of match[1].split('\n')) {
    const at = line.indexOf(':');
    if (at === -1) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return {
    description: meta.description || '',
    argumentHint: meta['argument-hint'] || '',
    body: markdown.slice(match[0].length).trim(),
  };
}

/**
 * Rewrite Claude Code's !`cmd` shell interpolation into a plain instruction.
 *
 * `HEAD: !`git rev-parse HEAD`` becomes
 * `HEAD: run `git rev-parse HEAD` and use its output`.
 */
export function stripShellInterpolation(body) {
  return body.replace(/!`([^`]+)`/g, (_, command) => `run \`${command}\` and use its output`);
}

/**
 * Repoint or remove references to Claude Code skills.
 *
 * The patterns allow \s+ between words rather than a literal space: these
 * bodies are hard-wrapped markdown, so a reference routinely straddles a line
 * break and a space-literal pattern silently misses exactly those.
 *
 * Work Tracking is repointed because its content genuinely reaches every
 * client, as this server's `instructions`. Anything else is removed with its
 * sentence, because it does not.
 */
export function retargetSkillReferences(body) {
  return body
    .replace(
      /the\s+\*\*EzModo\s+Work\s+Tracking\*\*\s+skill/g,
      'the work-tracking contract in this server\'s instructions'
    )
    .replace(/\s*See\s+the\s+\*\*EzModo\s+[^*]+\*\*\s+skill\./g, '');
}

export function render(read = (file) => readFileSync(join(COMMANDS_DIR, file), 'utf-8')) {
  const entries = COMMANDS.map(({ file, name, surfaces }) => {
    const { description, argumentHint, body } = parseCommand(read(file));
    if (!description) throw new Error(`${file} has no description in its frontmatter.`);
    return {
      name,
      description,
      argumentHint,
      surfaces,
      body: retargetSkillReferences(stripShellInterpolation(body)),
    };
  });

  return `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Extracted from plugins/ezmodo/commands/ by scripts/build-prompts.mjs.
 * Edit the command, then run:
 *
 *   npm run generate:prompts --workspace=@ezmodo/mcp-server
 *
 * __tests__/prompts.test.js fails if this drifts from the commands.
 */

export const COMMAND_PROMPTS = ${JSON.stringify(entries, null, 2)};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(COMMANDS_DIR)) {
    throw new Error(`No commands directory at ${COMMANDS_DIR} — run this from the repo.`);
  }
  writeFileSync(OUTPUT_PATH, render(), 'utf-8');
  console.log(`Wrote ${OUTPUT_PATH}`);
}
