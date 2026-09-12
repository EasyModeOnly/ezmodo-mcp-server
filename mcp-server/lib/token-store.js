/**
 * On-disk store for the OAuth tokens this server obtains for itself (#2631).
 *
 * Lives at <config dir>/mcp-oauth.json, beside the CLI's own `credentials`
 * file. A DISTINCT filename on purpose: the CLI owns `credentials` and
 * `oauth.json`, and two programs writing one file is how a working login
 * disappears the next time the other one runs. This server only ever reads the
 * CLI's files (see lib/cli-credential.js) and only ever writes its own.
 *
 * Three properties this module is responsible for:
 *
 *   1. It never throws. It sits on the path every tool call takes to resolve a
 *      credential. A malformed or unreadable file must degrade to "not signed
 *      in" — which prompts a fresh sign-in and fixes itself — rather than
 *      taking down the server, which does not.
 *   2. It writes 0600, and creates the directory 0700. These are bearer
 *      tokens for the user's whole account; a world-readable file in a shared
 *      home directory hands the account over.
 *   3. It writes atomically, via a temp file in the same directory and a
 *      rename. A torn write here is indistinguishable from corruption, and
 *      corruption logs a user out.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { configDir } from './user-paths.js';
import { getLogger } from './logger.js';

const FILENAME = 'mcp-oauth.json';

/**
 * Treat a token as expired this many milliseconds BEFORE it actually expires.
 *
 * Without a margin, a token that passes the check can still be rejected by the
 * time the request lands — clock skew between this machine and Keycloak, plus
 * the request's own flight time. Thirty seconds costs nothing (the refresh is
 * one round trip) and removes a class of intermittent 401 that would look like
 * a server bug rather than a clock.
 */
const EXPIRY_MARGIN_MS = 30_000;

function tokenPath() {
  return join(configDir(), FILENAME);
}

/**
 * @typedef {object} StoredTokens
 * @property {string} accessToken
 * @property {string} [refreshToken]
 * @property {string} expiresAt   ISO 8601
 * @property {string} [userId]
 * @property {string} [email]
 * @property {string} [scope]
 * @property {string} [issuer]    Which Keycloak issued these
 */

/**
 * Read the stored tokens, or null if there are none to read.
 *
 * @returns {StoredTokens|null}
 */
export function readTokens() {
  const path = tokenPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (!parsed || typeof parsed.accessToken !== 'string' || !parsed.accessToken.trim()) {
      return null;
    }
    return parsed;
  } catch (error) {
    // Malformed, truncated, or unreadable. Reporting "not signed in" sends the
    // user through a sign-in that overwrites it; throwing would strand them.
    getLogger().warn('Ignoring unreadable OAuth token file', { path, error: error.message });
    return null;
  }
}

/**
 * Persist tokens, replacing whatever was there.
 *
 * @param {StoredTokens} tokens
 * @returns {boolean} whether the write landed
 */
export function writeTokens(tokens) {
  const dir = configDir();
  const path = tokenPath();
  const temp = `${path}.${process.pid}.tmp`;
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(temp, JSON.stringify(tokens, null, 2), { encoding: 'utf-8', mode: 0o600 });
    renameSync(temp, path);
    return true;
  } catch (error) {
    getLogger().warn('Could not persist OAuth tokens', { path, error: error.message });
    try {
      if (existsSync(temp)) unlinkSync(temp);
    } catch {
      // Nothing useful to do about a leftover temp file.
    }
    return false;
  }
}

/** Forget the stored tokens. Used by sign-out and by an unrecoverable refresh. */
export function clearTokens() {
  const path = tokenPath();
  try {
    if (existsSync(path)) unlinkSync(path);
    return true;
  } catch (error) {
    getLogger().warn('Could not clear OAuth tokens', { path, error: error.message });
    return false;
  }
}

/**
 * Whether an access token is past use, margin included.
 *
 * Missing or unparseable expiry counts as expired: if we cannot tell, the safe
 * answer is the one that triggers a refresh rather than the one that sends a
 * possibly-dead token to the API.
 *
 * @param {StoredTokens|null} tokens
 */
export function isExpired(tokens) {
  if (!tokens?.expiresAt) return true;
  const expiry = Date.parse(tokens.expiresAt);
  if (Number.isNaN(expiry)) return true;
  return Date.now() >= expiry - EXPIRY_MARGIN_MS;
}

/** The path tokens are stored at, for diagnostics and messages. */
export function getTokenPath() {
  return tokenPath();
}
