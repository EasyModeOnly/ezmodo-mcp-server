/**
 * MCP prompts — the things a USER deliberately invokes (#2634).
 *
 * The split that decides what belongs here, now that the server also serves
 * `instructions` (#2633):
 *
 *   instructions = what the agent should ALWAYS do. Injected into system
 *                  context on every session, so it must be short and it must
 *                  not need asking for.
 *   prompts      = actions a person chooses. Clients surface them as slash
 *                  commands, so they are invoked, not absorbed.
 *
 * Serving the always-on discipline in both places would be the same duplicate
 * that #2594 removed from every repo's CLAUDE.md, so it lives in exactly one.
 *
 * WHAT WAS REMOVED HERE, and why it is a fix rather than a loss. This module
 * used to serve `zephly-usage-guide` and `ai-workflow-automation`. Both were
 * pre-rebrand in the user-visible prompt NAME, and both instructed agents to
 * open a session with `list_organizations()` and `list_projects()` — tools that
 * no longer exist in TOOLS. A prompt that names missing tools is not stale
 * documentation, it is an instruction to make a call that fails, and the
 * work-tracking content that replaced it now ships as `instructions`.
 */

import { COMMAND_PROMPTS } from './commands.generated.js';

/**
 * The placeholder a Claude Code command uses for its argument. Kept identical
 * so one body serves both surfaces without a second copy.
 */
const ARGUMENTS_TOKEN = '$ARGUMENTS';

/** Prompts available on a surface, in the MCP list shape. */
export function listPrompts(surface = 'local') {
  return COMMAND_PROMPTS.filter((prompt) => prompt.surfaces.includes(surface)).map(
    ({ name, description, argumentHint }) => ({
      name,
      description,
      arguments: argumentHint
        ? [
          {
            name: 'arguments',
            description: argumentHint.replace(/^[[<]|[\]>]$/g, ''),
            // Never required. `submit` and `untracked` are perfectly usable
            // with nothing to add, and a required argument would make a
            // client refuse to run them at all.
            required: false,
          },
        ]
        : [],
    })
  );
}

/**
 * The body of one prompt, with the user's argument substituted.
 *
 * Returns null for a name this surface does not serve — including one it holds
 * but does not serve remotely, so `submit` is as absent over the connector as
 * a name that never existed. Reporting it differently would tell a caller a
 * prompt is there and then refuse it.
 */
export function getPromptContent(name, args = {}, surface = 'local') {
  const prompt = COMMAND_PROMPTS.find((candidate) => candidate.name === name);
  if (!prompt || !prompt.surfaces.includes(surface)) return null;

  const supplied = args?.arguments ?? '';
  return prompt.body.split(ARGUMENTS_TOKEN).join(supplied);
}

/** Back-compat for callers that only want the list. */
export const PROMPTS = listPrompts('local');
