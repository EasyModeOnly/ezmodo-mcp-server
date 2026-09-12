/**
 * The one place that decides which credential a request is made with.
 *
 * Four sources, and the ORDER is the contract (#2631):
 *
 *   1. The request context. Only ever set by the HTTP transport, where one
 *      process serves many callers and the credential belongs to the request
 *      rather than the process (#2599). Over stdio this is always empty.
 *   2. EZMODO_API_KEY (or legacy ZEPHLY_API_KEY). An EXPLICIT credential must
 *      beat an implicit one, or overriding the key for a single project becomes
 *      impossible to reason about — and this is what keeps CI, containers and
 *      anything headless working exactly as before OAuth existed.
 *   3. The OAuth token this server obtained for itself, refreshed if stale.
 *      The zero-configuration path: nothing to paste, nothing in a profile.
 *   4. The credential `ezmodo auth login` stored. Last because it belongs to
 *      another program: a server that silently authenticates as whoever the
 *      CLI happens to be logged in as should do so only when nothing else
 *      said otherwise.
 *
 * 3 above 4 is the deliberate part. Both are implicit, so neither "wins" on
 * explicitness; what separates them is that the OAuth token is THIS server's
 * own, obtained by a person who was shown a consent screen naming this
 * connector, while the CLI's key is a credential borrowed from a different
 * tool. Prefer the one whose grant the user actually saw.
 */

import { getApiKey } from './env.js';
import { getRequestContext, resolveApiKey } from './request-context.js';
import { getAccessToken, getSignedInIdentity } from './oauth.js';
import { readCliCredential } from './cli-credential.js';

/**
 * The CLI credential, looked up at most once.
 *
 * Memoized because reading it is not free: on macOS it shells out to
 * `security` to read the login Keychain, and doing that on every API call
 * would put a subprocess spawn — and a possible ACL prompt — on the hot path.
 * `undefined` means "not looked up yet"; `null` means "looked up, nothing
 * there".
 */
let cachedCliCredential;

function cliCredential() {
  if (cachedCliCredential === undefined) {
    cachedCliCredential = readCliCredential() ?? null;
  }
  return cachedCliCredential;
}

/**
 * Resolve the credential for the call in flight.
 *
 * Returns null rather than throwing when there is nothing to use. Every caller
 * is on the path of a tool call, and "sign in first" is something an agent can
 * act on; an exception is not.
 *
 * @returns {Promise<{ token: string, source: string }|null>}
 */
export async function resolveCredential() {
  // Steps 1 and 2 together. Deliberately NOT re-implemented here:
  // resolveApiKey() already means "request context, else environment", and a
  // second copy of that precedence is how the two drift apart.
  const explicit = resolveApiKey();
  if (explicit) {
    const fromRequest = Boolean(getRequestContext()?.apiKey);
    return { token: explicit, source: fromRequest ? 'request' : 'EZMODO_API_KEY' };
  }

  const fromOAuth = await getAccessToken();
  if (fromOAuth) {
    const identity = getSignedInIdentity();
    return { token: fromOAuth, source: identity?.email ? `OAuth (${identity.email})` : 'OAuth' };
  }

  const fromCli = cliCredential();
  if (fromCli) return { token: fromCli.key, source: fromCli.source };

  return null;
}

/**
 * What the startup banner reports, without triggering a network refresh.
 *
 * Startup must not block on Keycloak: an expired token at boot would make the
 * server hang before it ever spoke MCP, and the refresh happens on the first
 * call anyway.
 *
 * @returns {{ source: string, detail?: string }|null}
 */
export function describeCredentialSync() {
  const fromEnv = getApiKey();
  if (fromEnv) return { source: 'EZMODO_API_KEY', detail: `${fromEnv.substring(0, 12)}...` };

  const identity = getSignedInIdentity();
  if (identity) return { source: 'OAuth', detail: identity.email };

  const fromCli = cliCredential();
  if (fromCli) return { source: fromCli.source, detail: `${fromCli.key.substring(0, 12)}...` };

  return null;
}

/**
 * The borrowed CLI credential, without the key, for `authenticate status`.
 *
 * Status used to look only at EZMODO_API_KEY and its own OAuth tokens, so with
 * nothing but a CLI key present it said "not signed in" while every call
 * succeeded as the CLI's user (#2655). A status that disagrees with what calls
 * actually do is worse than none.
 *
 * @returns {{ source: string, legacy?: boolean, keyPrefix: string }|null}
 */
export function describeCliCredential() {
  const fromCli = cliCredential();
  if (!fromCli) return null;
  return {
    source: fromCli.source,
    ...(fromCli.legacy ? { legacy: true } : {}),
    keyPrefix: `${fromCli.key.substring(0, 12)}...`,
  };
}

/** Test seam: forget the memoized CLI lookup. */
export function resetCredentialCache() {
  cachedCliCredential = undefined;
}
