/**
 * Builds a configured MCP `Server` — tools, prompts and their handlers.
 *
 * Extracted from index.js so stdio and HTTP share ONE definition of the tool
 * surface (#2599). Two entry points that each register their own handlers is
 * how a tool ends up working on one transport and not the other, and the gap
 * is invisible until a user reports it.
 *
 * A fresh Server per call, deliberately. The HTTP transport runs stateless and
 * builds one per request; that is only safe because nothing here holds state
 * between calls — every handler is a function of its arguments plus the
 * credential in the request context.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOLS } from '../tools/index.js';
import { HANDLERS } from '../handlers/index.js';
import { listPrompts, getPromptContent } from '../prompts/index.js';
import { MCP_VERSION } from './version.js';
import { getLogger } from './logger.js';
import { isRemoteSafe } from './remote-tools.js';
import {
  EMAIL_ALREADY_REGISTERED,
  NOT_AUTHENTICATED,
  NO_ORGANIZATION,
  emailAlreadyRegistered,
  organizationRequired,
  signInRequired,
} from './auth-guidance.js';
import { getInstructions } from './instructions.js';
import { getApiKey } from './env.js';
import { startSignIn as defaultStartSignIn } from '../handlers/auth.js';

/**
 * @param {object} [options]
 * @param {'local'|'remote'} [options.surface] Which tool surface to serve.
 *   'local' (the default) is the full set, for stdio on a user's machine.
 *   'remote' excludes tools that operate on the local filesystem or git — see
 *   lib/remote-tools.js for why that is an allowlist and not a denylist.
 */
/**
 * Whether a failure means "nobody is signed in" rather than "the call went
 * wrong".
 *
 * 401 counts as well as the no-credential case: a credential that WAS valid can
 * stop being so — a revoked API key, or a refresh token whose grant expired
 * while the editor sat open overnight — and telling the user to sign in is the
 * right answer to both.
 *
 * 403 deliberately does NOT count. That means signed in but not permitted,
 * most often a new account in no organization yet, and sending someone back
 * through a sign-in that cannot fix it is worse than saying nothing. That case
 * gets its own answer below — saying nothing was the placeholder, not the plan.
 */
function isAuthFailure(error) {
  return error?.code === NOT_AUTHENTICATED || error?.status === 401;
}

/**
 * Whether a failure means "signed in, but in no organization" (#2639).
 *
 * Keyed on the API's code, never on the message: the API owns the wording and
 * will improve it, and a prose match that silently stops matching degrades to
 * the bare 403 this exists to replace — the failure would be invisible, since
 * the call still fails either way, just uselessly.
 */
function isNoOrganization(error) {
  return error?.code === NO_ORGANIZATION;
}

/**
 * Whether a failure means "signed in, but this email is already spoken for"
 * (#2652). Same keying, and the same reason for it.
 */
function isEmailAlreadyRegistered(error) {
  return error?.code === EMAIL_ALREADY_REGISTERED;
}

export function createServer({ surface = 'local', startSignIn = defaultStartSignIn } = {}) {
  const log = getLogger();

  // Filtered ONCE here rather than at each call site, so listing and dispatch
  // cannot disagree. They must agree: filtering only tools/list would leave
  // every excluded handler dispatchable by a client that guesses the name,
  // which is the failure this whole module exists to prevent.
  const tools = surface === 'remote' ? TOOLS.filter((tool) => isRemoteSafe(tool.name)) : TOOLS;
  const available = new Set(tools.map((tool) => tool.name));

  const server = new Server(
    { name: 'ezmodo-mcp-server', version: MCP_VERSION },
    {
      capabilities: { tools: {}, prompts: {} },
      // Reaches every client on every session, which is what makes it the one
      // place the work-tracking discipline can live without a per-editor
      // plugin (#2633). Varies by surface for the same reason the tool list
      // does.
      instructions: getInstructions(surface),
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Checked before the handler lookup: a tool excluded from this surface is
    // refused even though HANDLERS still contains it.
    if (!available.has(name)) {
      const handler = HANDLERS[name];
      if (handler) {
        log.warn('Refused a tool not served on this surface', { tool: name, surface });
        throw new Error(
          `Tool "${name}" is not available over this connection. It operates on a local ` +
            'checkout and is served only by the local (stdio) MCP server.'
        );
      }
      throw new Error(`Unknown tool: ${name}`);
    }

    const handler = HANDLERS[name];
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const start = Date.now();
    try {
      const result = await handler(args || {});
      log.debug('Tool call succeeded', { tool: name, durationMs: Date.now() - start });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const errMsg = error.message || String(error);
      log.error('Tool call failed', { tool: name, error: errMsg, durationMs: Date.now() - start });

      // An authentication failure is not an error the model should relay as
      // one — it is a request for the user to do something. Funnelled HERE, at
      // the single dispatch point, for the same reason the surface filter is:
      // every tool goes through it, so none of them can be missed or drift
      // (#2632). Only on the local surface; over the connector Claude owns the
      // OAuth and this advice would be wrong.
      //
      // Two changes from the first version (#2654), both from its first real
      // run:
      //
      // - It STARTS the sign-in, instead of telling the agent to call
      //   `authenticate`. The URL is what the user needs, and making it take a
      //   second tool call bought nothing.
      // - It is NOT flagged isError. Nothing is broken; the user has something
      //   to do. Clients differ in how they treat an error result — some drop
      //   its text or report the call as failed — and this text is the one
      //   thing that must reach the user.
      //
      // Except when EZMODO_API_KEY was the credential that got rejected: an
      // explicit key outranks OAuth, so a browser sign-in could not take
      // effect, and opening one would send the user on an errand that cannot
      // work. That case says so, and stays an error.
      if (surface !== 'remote' && isAuthFailure(error)) {
        if (getApiKey()) {
          return {
            content: [{ type: 'text', text: JSON.stringify(signInRequired({
              reason: `EZMODO_API_KEY was rejected (${errMsg}). It takes precedence over a browser ` +
                'sign-in, so fix or unset it — signing in will not help while it is set.',
            }), null, 2) }],
            isError: true,
          };
        }
        let payload;
        try {
          payload = await startSignIn({ reason: 'Not signed in to EzModo.' });
        } catch (signInError) {
          log.warn('Could not start sign-in from the dispatch funnel', { error: signInError.message });
          payload = signInRequired({ reason: errMsg });
        }
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
      }
      // Answered on EVERY surface, unlike the sign-in prompt above. Sign-in
      // advice is surface-specific because over the connector Claude owns the
      // OAuth; a missing workspace is ours either way, and a claude.ai user
      // hits it exactly as a local one does.
      if (isNoOrganization(error)) {
        return {
          content: [
            { type: 'text', text: JSON.stringify(organizationRequired({ reason: errMsg }), null, 2) },
          ],
          isError: true,
        };
      }
      // Checked separately from the branch above, never merged into it: these
      // two look alike from outside and their answers point opposite ways.
      if (isEmailAlreadyRegistered(error)) {
        return {
          content: [
            { type: 'text', text: JSON.stringify(emailAlreadyRegistered({ reason: errMsg }), null, 2) },
          ],
          isError: true,
        };
      }
      // Returned as content rather than thrown: a tool that fails is a result
      // the model can read and act on, not a transport error.
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: errMsg }, null, 2) }],
        isError: true,
      };
    }
  });

  // Filtered by surface exactly as tools are, and for the same reason: `submit`
  // reads git SHAs and links commits, which a hosted server cannot do.
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listPrompts(surface),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const content = getPromptContent(request.params.name, request.params.arguments, surface);
    if (!content) {
      throw new Error(`Unknown prompt: ${request.params.name}`);
    }
    return {
      messages: [{ role: 'user', content: { type: 'text', text: content } }],
    };
  });

  return server;
}
