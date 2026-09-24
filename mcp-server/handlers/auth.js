/**
 * Sign-in handlers (#2632).
 *
 * THE SHAPE THAT MATTERS: `login` returns as soon as it has a URL, and does
 * NOT wait for the user.
 *
 * Blocking until the browser round trip finished would read better in a
 * transcript — one call, "signed in as you" — but it puts a human's attention
 * span on the critical path of a tool call. Clients time tool calls out at
 * wildly different limits, and a client that gives up at thirty seconds would
 * report a failure for a sign-in that then succeeds in the background, leaving
 * the agent with a wrong answer and the user with a working login. Returning
 * immediately is correct under every timeout.
 *
 * The flow keeps running after the return: the loopback listener is alive in
 * this process, and completion writes the tokens itself. So the recovery is
 * simply for the agent to retry whatever it was doing.
 */

import { beginLogin, getSignedInIdentity, signOut } from '../lib/oauth.js';
import { getApiKey } from '../lib/env.js';
import { signInRequired } from '../lib/auth-guidance.js';
import { describeCliCredential, resetCredentialCache } from '../lib/credentials.js';
import { getLogger } from '../lib/logger.js';

/**
 * The sign-in currently waiting on a browser, if any.
 *
 * Held so a second `login` while one is already open returns the SAME URL
 * rather than starting a rival flow. Two live flows would mean two loopback
 * listeners and two states, and whichever URL the user did not click would sit
 * there until it timed out.
 */
let pending = null;

/**
 * Abandon a sign-in that is still waiting on a browser.
 *
 * Real behaviour, not just a test seam: signing out while a browser tab is
 * still open should not leave a loopback listener alive that would quietly
 * complete the login the user just cancelled.
 */
export function cancelPendingLogin() {
  if (!pending) return false;
  pending.cancel();
  pending = null;
  return true;
}

/** Open a URL in the user's browser, best-effort. */
async function openBrowser(url) {
  const { execFile } = await import('child_process');
  const commands =
    process.platform === 'darwin'
      ? [['open', [url]]]
      : process.platform === 'win32'
        ? [['cmd', ['/c', 'start', '', url]]]
        : [
          ['xdg-open', [url]],
          ['sensible-browser', [url]],
          ['x-www-browser', [url]],
        ];

  for (const [command, args] of commands) {
    const opened = await new Promise((resolve) => {
      // execFile, not exec: no shell, so a URL cannot be read as shell syntax.
      execFile(command, args, (error) => resolve(!error));
    });
    if (opened) return true;
  }
  // Not a failure. The URL in the result is the contract; the browser launch
  // is a convenience, and it is expected to fail over SSH or in a container.
  return false;
}

/**
 * Start (or rejoin) a browser sign-in and return the payload that hands its URL
 * to the agent.
 *
 * Exported because it has two callers: the `authenticate` tool, and the
 * dispatch funnel in lib/create-server.js, which calls it on the FIRST call that
 * finds no credential (#2654). Before that, the first call only said "call
 * `authenticate`", and the URL took a second round trip to appear.
 *
 * @param {object} [options]
 * @param {string} [options.reason] Why sign-in is needed, when it was not asked for.
 */
export async function startSignIn({ reason } = {}) {
  return login(reason);
}

async function login(reason) {
  const log = getLogger();

  if (pending) {
    return {
      ...signInRequired({ authUrl: pending.authUrl, reason: 'A sign-in is already waiting.' }),
      browserOpened: pending.browserOpened,
    };
  }

  const flow = await beginLogin();
  const browserOpened = await openBrowser(flow.authUrl);

  pending = { authUrl: flow.authUrl, browserOpened, cancel: flow.cancel };
  flow
    .complete()
    .then((tokens) => {
      // The credential chain memoizes the CLI lookup; drop it so the fresh
      // OAuth token is what the next call sees.
      resetCredentialCache();
      log.info('Browser sign-in completed', { email: tokens.email });
    })
    .catch((error) => log.warn('Browser sign-in did not complete', { error: error.message }))
    .finally(() => {
      pending = null;
    });


  return {
    ...signInRequired({
      authUrl: flow.authUrl,
      reason: reason
        ? `${reason} Sign-in started — waiting for approval in a browser.`
        : 'Sign-in started. Waiting for you to approve it in a browser.',
    }),
    browserOpened,
    next_step: browserOpened
      ? 'A browser should have opened. Once approved, retry the call you were making.'
      : 'No browser could be opened here — show the URL to the user, then retry the call.',
  };
}

function status() {
  const envKey = getApiKey();
  if (envKey) {
    return {
      authenticated: true,
      source: 'EZMODO_API_KEY',
      note: 'An explicit key is set, so it takes precedence over any browser sign-in.',
    };
  }

  const identity = getSignedInIdentity();
  if (identity) {
    return { authenticated: true, source: 'OAuth', ...identity };
  }

  // Same order as lib/credentials.js resolveCredential(): the CLI's key is
  // used when there is nothing else, so status must say so (#2655).
  const cli = describeCliCredential();
  if (cli) {
    return {
      authenticated: true,
      source: cli.source,
      keyPrefix: cli.keyPrefix,
      note: 'Calls are using the API key the ezmodo CLI stored. A browser sign-in via ' +
        '`authenticate` would take precedence over it.',
    };
  }

  return signInRequired({ reason: 'This server is not signed in.' });
}

/**
 * @param {{ action?: 'login'|'status'|'sign_out' }} args
 */
export async function authenticate(args = {}) {
  switch (args.action || 'login') {
  case 'status':
    return status();
  case 'sign_out': {
    // Cancel first: a listener left alive would complete the very sign-in
    // being abandoned.
    const cancelled = cancelPendingLogin();
    signOut();
    resetCredentialCache();
    return {
      signedOut: true,
      cancelledPendingSignIn: cancelled,
      note:
          'Stored OAuth tokens removed. EZMODO_API_KEY and the ezmodo CLI login ' +
          'are untouched — this server does not own either.',
    };
  }
  case 'login':
    return login();
  default:
    throw new Error(`Unknown action: ${args.action}. Use login, status or sign_out.`);
  }
}
