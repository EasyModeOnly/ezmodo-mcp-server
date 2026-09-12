/**
 * Authorization Code + PKCE sign-in, run by the MCP server for itself (#2631).
 *
 * Ported from cli/src/lib/oauth-login.ts, oauth-callback-server.ts and
 * token-refresh.ts rather than imported from them. This package is published to
 * npm and launched with `npx @ezmodo/mcp-server`; it must not require the CLI
 * to be installed. lib/cli-credential.js re-implements the CLI's credential
 * read for the same reason, and records the same trade-off: when the CLI's
 * formats move, a copy goes stale and stops working, which is the safe
 * direction to fail in.
 *
 * WHAT IS DIFFERENT FROM THE CLI'S COPY, and why:
 *
 *   - An EPHEMERAL loopback port, not the CLI's fixed 19838. The `ezmodo-mcp`
 *     client registers http://localhost/* and http://127.0.0.1/*, so any port
 *     matches; a fixed port would collide with a concurrent `ezmodo auth
 *     login`, which is precisely when someone is likely to be signing in.
 *   - NOTHING is written to stdout. Over stdio, stdout IS the MCP protocol
 *     channel — a stray console.log is a protocol violation that corrupts the
 *     session. The CLI's copy prints progress freely because it owns its
 *     terminal. Here, diagnostics go to the logger (stderr) and anything the
 *     user must read is returned to the caller to surface (#2632).
 *   - Refresh is single-flight. Tool calls run concurrently, so several can
 *     find the same expired token at once; without this they would each burn a
 *     refresh token and all but one would fail, because Keycloak rotates it.
 */

import { createHash, randomBytes } from 'crypto';
import { createServer } from 'http';
import fetch from 'node-fetch';
import { getKeycloakEndpoints, getScopes } from './oauth-config.js';
import { clearTokens, isExpired, readTokens, writeTokens } from './token-store.js';
import { getLogger } from './logger.js';

/** How long to wait for the user to finish in the browser before giving up. */
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

// ============================================================
// PKCE primitives (RFC 7636)
// ============================================================

function generateState() {
  return randomBytes(32).toString('hex');
}

function generateCodeVerifier() {
  return randomBytes(32)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9\-._~]/g, '')
    .substring(0, 128);
}

function generateCodeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Read the `sub`, `email` and `exp` out of a JWT WITHOUT verifying it.
 *
 * Safe here, and only here: this token came from a TLS connection to the token
 * endpoint moments ago, and nothing security-relevant is decided from these
 * claims — they are stored so a human can be told which account is signed in.
 * The API verifies the signature on every request, which is where that check
 * belongs.
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return {};
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
  } catch {
    return {};
  }
}

// ============================================================
// Loopback callback capture
// ============================================================

/** The loopback page is HTML built from strings, so anything interpolated is escaped. */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
  })[c]);
}

const DONE_PAGE = (heading, detail) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>EzModo</title>
<style>
 body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1115;color:#e8eaed;
      display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
 main{text-align:center;max-width:26rem;padding:2rem}
 h1{font-size:1.25rem;font-weight:600;margin:0 0 .5rem}
 p{color:#9aa0a6;line-height:1.5;margin:0 0 .75rem}
 strong{color:#e8eaed;font-weight:600}
</style></head>
<body><main><h1>${escapeHtml(heading)}</h1>${detail}</main></body></html>`;

/**
 * Listen on an ephemeral loopback port for the authorization redirect.
 *
 * Resolves with the code, and a `respond` to answer the browser with, once one
 * arrives. The redirect URI is returned before
 * the code is, because the caller needs the port to build the authorize URL —
 * hence the two-stage shape rather than a single promise.
 *
 * @param {string} expectedState
 * @typedef {{ code: string, respond: (status: number, page: string) => void }} Callback
 * @returns {Promise<{ redirectUri: string, code: Promise<Callback>, close: () => void }>}
 */
function startCallbackServer(expectedState) {
  return new Promise((resolveReady, rejectReady) => {
    let settle;
    const code = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });

    let finished = false;
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204).end();
        return;
      }

      const fail = (message) => {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(DONE_PAGE('Sign-in failed', `<p>${escapeHtml(message)}</p>`));
        if (!finished) {
          finished = true;
          settle.reject(new Error(message));
        }
      };

      const error = url.searchParams.get('error');
      if (error) {
        // Keycloak reports a refused consent here rather than by not
        // redirecting, so this is the ordinary "user clicked Cancel" path.
        const description = url.searchParams.get('error_description') || error;
        fail(description);
        return;
      }

      const received = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!received) {
        fail('No authorization code in the callback.');
        return;
      }
      if (state !== expectedState) {
        // The CSRF check. A mismatch means this redirect was not the one we
        // started, so the code must not be exchanged.
        fail('State mismatch — this sign-in did not come from this request.');
        return;
      }

      // The page is NOT written here. It waits for the token exchange, so it
      // can say which account was signed in (#2654). With an existing Keycloak
      // session the browser never shows a login or consent screen — the tab
      // flashes straight here — and "you are signed in" with no name is how
      // someone ends up connected as an identity they did not expect.
      if (!finished) {
        finished = true;
        settle.resolve({ code: received, respond: (status, page) => {
          res.writeHead(status, { 'Content-Type': 'text/html' });
          res.end(page);
        } });
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(DONE_PAGE('Already handled', '<p>This sign-in has already completed. You can close this tab.</p>'));
      }
    });

    server.on('error', (error) => {
      if (!finished) {
        finished = true;
        settle.reject(error);
      }
      rejectReady(error);
    });

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        settle.reject(new Error('Timed out waiting for the browser sign-in to complete.'));
      }
    }, CALLBACK_TIMEOUT_MS);
    // Do not hold the process open purely to wait for a browser.
    timer.unref?.();

    const close = () => {
      clearTimeout(timer);
      server.close();
    };
    code.then(close, close);

    // Port 0 = let the OS pick. 127.0.0.1 rather than a wildcard bind: this
    // socket briefly accepts an authorization code, and it has no business
    // being reachable from the network.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveReady({ redirectUri: `http://127.0.0.1:${port}/callback`, code, close });
    });
  });
}

// ============================================================
// Token endpoint
// ============================================================

async function postToken(body) {
  const endpoints = getKeycloakEndpoints();
  const response = await fetch(endpoints.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Token request failed (${response.status}): ${text}`);
    error.status = response.status;
    throw error;
  }
  return JSON.parse(text);
}

/** Turn a Keycloak token response into what the store holds. */
function toStoredTokens(response) {
  const claims = decodeJwtPayload(response.access_token);
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: new Date(Date.now() + (response.expires_in ?? 60) * 1000).toISOString(),
    userId: claims.sub,
    email: claims.email || claims.preferred_username,
    scope: response.scope,
    issuer: getKeycloakEndpoints().issuer,
  };
}

// ============================================================
// Sign-in
// ============================================================

/**
 * Build the authorize URL and start listening for its redirect.
 *
 * Split from the wait deliberately: the caller needs the URL to hand to the
 * user (in a tool result, or a browser it opened) BEFORE anyone can complete
 * the flow. Returning both at once would mean the URL only became available
 * after it was already too late to show it.
 *
 * @returns {Promise<{ authUrl: string, complete: () => Promise<StoredTokens>, cancel: () => void }>}
 */
export async function beginLogin() {
  const endpoints = getKeycloakEndpoints();
  const state = generateState();
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);

  const { redirectUri, code, close } = await startCallbackServer(state);

  const authUrl = new URL(endpoints.authorization);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', endpoints.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', getScopes());
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  getLogger().debug('OAuth sign-in started', { redirectUri, environment: endpoints.environment });

  const complete = async () => {
    const { code: authorizationCode, respond } = await code;
    let tokens;
    try {
      const response = await postToken({
        grant_type: 'authorization_code',
        client_id: endpoints.clientId,
        code: authorizationCode,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      tokens = toStoredTokens(response);
      writeTokens(tokens);
    } catch (error) {
      // The browser is still waiting on this response. Leaving it hanging
      // would look exactly like the silent success this page exists to avoid.
      respond(400, DONE_PAGE('Sign-in failed',
        `<p>${escapeHtml(error.message)}</p><p>Return to your editor and try again.</p>`));
      throw error;
    }

    getLogger().info('OAuth sign-in complete', { email: tokens.email });
    respond(200, DONE_PAGE('Signed in to EzModo',
      (tokens.email ? `<p>as <strong>${escapeHtml(tokens.email)}</strong></p>` : '') +
      '<p>You can close this tab and return to your editor.</p>' +
      '<p>Not the account you meant? Ask your agent to run <code>authenticate</code> ' +
      'with <code>sign_out</code>, then sign in again.</p>'));
    return tokens;
  };

  return { authUrl: authUrl.toString(), complete, cancel: close };
}

// ============================================================
// Refresh
// ============================================================

/**
 * In-flight refresh, shared by every caller that arrives while it runs.
 *
 * Keycloak ROTATES refresh tokens: the old one dies the moment the new one is
 * issued. Two concurrent refreshes therefore do not merely waste a round trip,
 * they race to invalidate each other, and the loser signs the user out. One
 * promise, awaited by all.
 */
let refreshInFlight = null;

async function refreshTokens(tokens) {
  const endpoints = getKeycloakEndpoints();
  try {
    const response = await postToken({
      grant_type: 'refresh_token',
      client_id: endpoints.clientId,
      refresh_token: tokens.refreshToken,
    });
    const refreshed = toStoredTokens(response);
    // Keycloak may omit a new refresh token; keep the old one when it does,
    // or the next refresh has nothing to present.
    if (!refreshed.refreshToken) refreshed.refreshToken = tokens.refreshToken;
    writeTokens(refreshed);
    return refreshed;
  } catch (error) {
    // 400 from the token endpoint on a refresh means the grant is dead —
    // expired, revoked, or already rotated. Keeping it would retry forever
    // against something that can never succeed, so drop it and let the caller
    // ask for a fresh sign-in.
    if (error.status === 400) {
      getLogger().info('Refresh token no longer valid; signing out', { error: error.message });
      clearTokens();
      return null;
    }
    // Anything else (network, 5xx) is plausibly transient. Leave the stored
    // tokens alone so a later call can try again.
    getLogger().warn('Token refresh failed', { error: error.message });
    return null;
  }
}

/**
 * A usable access token, refreshing if needed, or null when a sign-in is due.
 *
 * Null is the ONLY failure mode: every caller is on the path of a tool call,
 * and "you need to sign in" is a message the agent can act on, whereas a thrown
 * error is one it cannot.
 *
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
  const tokens = readTokens();
  if (!tokens) return null;
  if (!isExpired(tokens)) return tokens.accessToken;
  if (!tokens.refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = refreshTokens(tokens).finally(() => {
      refreshInFlight = null;
    });
  }
  const refreshed = await refreshInFlight;
  return refreshed?.accessToken ?? null;
}

/** Who is signed in, for diagnostics. Null when nobody is. */
export function getSignedInIdentity() {
  const tokens = readTokens();
  if (!tokens) return null;
  return { email: tokens.email, userId: tokens.userId, scope: tokens.scope };
}

/** Forget the stored tokens. */
export function signOut() {
  return clearTokens();
}
