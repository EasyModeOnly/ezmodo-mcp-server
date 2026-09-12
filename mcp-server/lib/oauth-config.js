/**
 * Keycloak OIDC configuration for the local (stdio) MCP server.
 *
 * WHY THE SERVER LOGS IN AT ALL. Installing used to be two steps, and the
 * second one is the cumbersome one: install the server, then leave the agent,
 * open the web UI, mint an API key, paste it into a shell profile, restart.
 * That step is identical for Cursor, Codex, Zed or anything else speaking
 * stdio MCP, and it is what makes people reach for the CLI. The server signs
 * itself in instead, so installing IS the whole install (E-252 #2631).
 *
 * WHY `ezmodo-mcp` AND NOT `ezmodo-cli`. Both are public PKCE clients in the
 * `ezmodo` realm and either would authenticate, since the API skips the
 * audience check (KEYCLOAK_CLIENT_ID is deliberately empty in
 * infra/cloud-run-api-ezmodo.tf). Three things decide it:
 *
 *   1. Redirect URIs. `ezmodo-cli` registers ONE fixed loopback,
 *      http://localhost:19838/callback. A fixed port fails when it is already
 *      taken — including by an `ezmodo auth login` running in another terminal,
 *      which is exactly when a user is most likely to be signing in.
 *      `ezmodo-mcp` registers http://localhost/* and http://127.0.0.1/*, which
 *      matches ANY ephemeral port: Keycloak's RedirectUtils, on a failed match
 *      for an http URI whose host is a loopback interface, rebuilds it with
 *      port 80 and re-matches.
 *   2. Consent. `ezmodo-mcp` sets consent_required. The whole argument for
 *      preferring OAuth over a pasted key is that the user SEES what they are
 *      granting; a client that skips the consent screen throws that away.
 *   3. It is what this is. `ezmodo-mcp` is the MCP client, and the scopes a
 *      human reads on the consent screen are attached to it.
 *
 * The client id is baked in, not pasted. That is why Keycloak's refusal of
 * anonymous Dynamic Client Registration — the thing that makes a claude.ai
 * connector user paste `ezmodo-mcp` by hand — does not touch a local install
 * at all.
 */

import { CONFIG } from '../config/index.js';

/**
 * Keycloak per environment. Mirrors cli/src/lib/config.ts KEYCLOAK_CONFIG; the
 * realm is `ezmodo` everywhere, including local, so a client that works on a
 * laptop works in production.
 */
const KEYCLOAK = {
  production: { url: 'https://auth.ezmodo.com', realm: 'ezmodo' },
  staging: { url: 'https://auth.staging.ezmodo.com', realm: 'ezmodo' },
  development: { url: 'http://localhost:7373', realm: 'ezmodo' },
};

/** The public PKCE client this server authenticates as. */
export const OAUTH_CLIENT_ID = 'ezmodo-mcp';

/**
 * What we ask consent for, and deliberately NOT everything on offer.
 *
 * `ezmodo:delete` is a registered optional scope and is left out by default.
 * Keycloak's consent screen is accept-or-decline over the whole requested set,
 * so asking for it would make "permanently delete your tasks, documents, goals
 * and projects" a condition of installing an MCP server — which is not a
 * decision to bundle into a setup step someone is clicking through. The MCP
 * tool surface is overwhelmingly create/update anyway; almost nothing here
 * deletes.
 *
 * `offline_access` is what makes the refresh token outlive the short access
 * token, i.e. what stops this asking for a browser every few minutes.
 *
 * Override with EZMODO_OAUTH_SCOPES (space-separated) to widen or narrow it —
 * that is the escape hatch for someone who genuinely wants delete, without
 * making it everyone's default.
 */
export const DEFAULT_SCOPES = 'openid email profile offline_access ezmodo:read ezmodo:write';

/** The scopes to request, honouring the override. */
export function getScopes() {
  const override = process.env.EZMODO_OAUTH_SCOPES;
  return override && override.trim() ? override.trim() : DEFAULT_SCOPES;
}

/**
 * Keycloak endpoints for the environment this build targets.
 *
 * Falls back to production for an unrecognised environment for the same reason
 * config/index.js defaults BUILD_ENV to production: the only caller that
 * arrives here with nothing set is an installed copy on a real user's machine,
 * and pointing that at localhost fails with an error saying nothing about why.
 */
export function getKeycloakEndpoints() {
  const env = KEYCLOAK[CONFIG.environment] ? CONFIG.environment : 'production';
  const { url, realm } = KEYCLOAK[env];
  const base = `${url}/realms/${realm}/protocol/openid-connect`;
  return {
    environment: env,
    issuer: `${url}/realms/${realm}`,
    authorization: `${base}/auth`,
    token: `${base}/token`,
    logout: `${base}/logout`,
    clientId: OAUTH_CLIENT_ID,
  };
}
