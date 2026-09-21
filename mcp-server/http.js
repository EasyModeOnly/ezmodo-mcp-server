#!/usr/bin/env node
/**
 * HTTP entry point — the MCP tool surface over Streamable HTTP (#2599).
 *
 * This is what a remote connector talks to. The stdio entry point (index.js)
 * is unchanged and stays the local path; both build the same server through
 * lib/create-server.js, so the tool surface cannot differ between them.
 *
 * ── Stateless, and why ────────────────────────────────────────────────────────
 * A fresh Server is built per request: SDK v2's createMcpHandler calls the
 * factory each time, and serves 2025-era clients through the same stateless
 * idiom v1 used (`sessionIdGenerator: undefined`, a transport per request).
 * 2026-07-28 is stateless by design. The alternative — stateful sessions held in
 * memory — cannot survive the deployment target: Cloud Run runs several
 * instances with no session affinity, so a client's second request routinely
 * lands on an instance that has never heard of its session and is rejected with
 * a 404. Scale-to-zero would drop every session on the floor as well.
 *
 * Building per request is cheap here precisely because nothing in the server
 * holds state: every handler is a function of its arguments plus the
 * credential on the request.
 *
 * The cost is that the server cannot initiate messages to the client, so GET
 * (the SSE upgrade) is answered 405. Today nothing is lost — this server sends
 * no notifications and requests no sampling. If that changes, the fix is an
 * external event store, not in-memory sessions.
 *
 * ── Authentication ───────────────────────────────────────────────────────────
 * The credential comes from the request's Authorization header and is bound to
 * that request only, via lib/request-context.js. Nothing is read from the
 * environment, and no credential outlives the request that carried it.
 *
 * Today the bearer token is an EzModo API key. OAuth 2.1 lands in #2600/#2601;
 * the 401 below already carries a WWW-Authenticate header so the discovery
 * handshake has somewhere to attach.
 */

import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';

import { createServer } from './lib/create-server.js';
import { withRequestContext } from './lib/request-context.js';
import { initLogger, getLogger } from './lib/logger.js';
import { MCP_VERSION } from './lib/version.js';
import { CONFIG } from './config/index.js';
import { getApiUrl } from './lib/env.js';
import { healthPaths, describeRejectedRequest } from './lib/http-diagnostics.js';

// Structured: this process's stderr is read by Cloud Logging, not a person.
initLogger(false, undefined, { structured: true });
const log = getLogger();

const PORT = Number(process.env.PORT || 8080);
const MCP_PATH = process.env.MCP_HTTP_PATH || '/mcp';
const HEALTH_PATHS = healthPaths(MCP_PATH);

// OAuth discovery (#2601). MCP_PUBLIC_URL is this server's public identity —
// the "resource" in RFC 9728 terms — and must be the URL a client actually
// dials, because a resource identifier that does not match what was requested
// is how a token gets accepted for the wrong audience.
const PUBLIC_URL = (process.env.MCP_PUBLIC_URL || `http://localhost:${PORT}${MCP_PATH}`).replace(/\/+$/, '');
const KEYCLOAK_URL = (process.env.KEYCLOAK_URL || '').replace(/\/+$/, '');
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'ezmodo';
const AUTH_SERVER = KEYCLOAK_URL ? `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` : '';

// RFC 9728 forms the metadata URL by inserting /.well-known/... between the
// host and the resource's path — so a resource at https://host/mcp publishes
// at https://host/.well-known/oauth-protected-resource/mcp, NOT at the root.
// Getting this wrong costs nothing for a client that follows the URL in the
// 401, and everything for one that derives it instead, which the spec permits.
const WELL_KNOWN = '/.well-known/oauth-protected-resource';
const RESOURCE_PATH = new URL(PUBLIC_URL).pathname.replace(/\/+$/, '');
const METADATA_PATH = `${WELL_KNOWN}${RESOURCE_PATH}`;
const METADATA_URL = new URL(METADATA_PATH, PUBLIC_URL).toString();

// Every path a client might reasonably ask for. The spec-derived one is what
// gets advertised; the others are served because being generous here is free
// and a failed discovery is opaque to debug from the client side.
const METADATA_PATHS = new Set([METADATA_PATH, WELL_KNOWN, `${MCP_PATH}${WELL_KNOWN}`]);

// The three scopes a person sees on the consent screen. Deliberately not the
// ~33 the API enforces: a consent screen with thirty-three checkboxes is not
// informed consent. The API expands these — see
// api/internal/api/middleware/mcp_scopes.go.
const CONSENT_SCOPES = ['ezmodo:read', 'ezmodo:write', 'ezmodo:delete'];

/**
 * RFC 9728 protected-resource metadata: what this resource is, and who issues
 * tokens for it. A connector fetches this after a 401 to discover where to send
 * the user for authorization.
 */
export function protectedResourceMetadata() {
  return {
    resource: PUBLIC_URL,
    authorization_servers: AUTH_SERVER ? [AUTH_SERVER] : [],
    scopes_supported: CONSENT_SCOPES,
    bearer_methods_supported: ['header'],
    // The DB-backed help centre, verified to resolve. /help/connectors was
    // invented for this field and never existed — a dead link shipped inside a
    // public discovery document, where nobody would notice because nothing in
    // the handshake reads it.
    resource_documentation:
      process.env.MCP_DOCS_URL || 'https://ezmodo.com/docs/emo/ezmodo/help/cli-mcp',
  };
}

/**
 * The WWW-Authenticate challenge. `resource_metadata` is the whole point: it
 * is how a client that has never seen this server finds the authorization
 * server without being told out of band.
 */
function authenticateChallenge(error, description) {
  const parts = ['Bearer realm="ezmodo-mcp"', `resource_metadata="${METADATA_URL}"`];
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description}"`);
  return parts.join(', ');
}

/** Bearer token from the Authorization header, or null. */
export function bearerToken(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

// The request being served, for the handler-level onerror below. The SDK
// reports why it refused a request only through that callback, which is set
// once for the whole process; this is how a report finds its way back to the
// request it is about. Same mechanism as the credential in request-context.js.
const inFlight = new AsyncLocalStorage();

// One handler for the process; the factory builds a fresh server for each
// request. It serves protocol revision 2026-07-28 (the `server/discover`
// Claude opens every connection with, which SDK v1 answered with a 400) and,
// by default (legacy: 'stateless'), 2025-era clients the same stateless way
// the v1 transport did. See the stateless note at the top.
//
// 'remote': excludes tools that operate on a local checkout, which do not
// exist here and whose git helpers shell out with caller-supplied arguments
// (#2614).
const mcpHandler = createMcpHandler(() => createServer({ surface: 'remote' }), {
  onerror: (error) => {
    const current = inFlight.getStore();
    log.warn('MCP transport rejected request', {
      requestId: current?.requestId,
      error: error?.message || String(error),
      ...(current ? describeRejectedRequest(current.req, current.body) : {}),
    });
  },
});

const serveMcp = toNodeHandler(mcpHandler, {
  // The adapter itself failed (converting the request, or the handler threw)
  // and is about to answer 500.
  onerror: (error) => {
    log.error('MCP handler failed', {
      requestId: inFlight.getStore()?.requestId,
      error: error?.message || String(error),
    });
  },
});

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

/** A JSON-RPC error shaped so an MCP client can read it, not just a bare HTTP code. */
function rpcError(res, status, code, message, extraHeaders) {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null }, extraHeaders);
}

async function readBody(req, limitBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    // Bounded on purpose: this endpoint is reachable by anyone who can reach
    // the service, so an unbounded read is a trivial way to exhaust memory.
    if (size > limitBytes) {
      const err = new Error('Request body too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

async function handleMcpPost(req, res, requestId) {
  const token = bearerToken(req.headers.authorization);
  if (!token) {
    log.warn('MCP request without credentials', { requestId });
    // The WWW-Authenticate header is where OAuth discovery attaches in #2601;
    // it costs nothing now and means clients already look in the right place.
    return rpcError(res, 401, -32001, 'Missing or malformed Authorization header. Expected: Bearer <token>', {
      'WWW-Authenticate': authenticateChallenge('invalid_request', 'Authorization header required'),
    });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    const status = error.statusCode === 413 ? 413 : 400;
    log.warn('Unreadable MCP request body', { requestId, error: error.message });
    return rpcError(res, status, -32700, `Could not parse request body: ${error.message}`);
  }

  await withRequestContext({ apiKey: token }, () =>
    inFlight.run({ requestId, req, body }, () => serveMcp(req, res, body)));
}

const httpServer = createHttpServer(async (req, res) => {
  const requestId = randomUUID();
  const started = Date.now();
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.on('finish', () => {
    log.info('http request', {
      requestId,
      method: req.method,
      path: url.pathname,
      status: res.statusCode,
      durationMs: Date.now() - started,
    });
  });

  try {
    // Health check. Deliberately does NOT touch the EzModo API: this answers
    // "is this process serving?", and a health check that fails when a
    // dependency is briefly unavailable gets the container killed and makes an
    // outage worse.
    // Served unauthenticated and before anything else: discovery is what a
    // client reads BECAUSE it has no credential yet, so requiring one would
    // make the handshake unresolvable.
    if (METADATA_PATHS.has(url.pathname)) {
      return sendJson(res, 200, protectedResourceMetadata(), {
        'Cache-Control': 'public, max-age=3600',
      });
    }

    if (HEALTH_PATHS.has(url.pathname)) {
      return sendJson(res, 200, { status: 'ok', version: MCP_VERSION, environment: CONFIG.environment });
    }

    if (url.pathname !== MCP_PATH) {
      return rpcError(res, 404, -32601, `Not found. The MCP endpoint is ${MCP_PATH}`);
    }

    if (req.method === 'POST') {
      return await handleMcpPost(req, res, requestId);
    }

    // GET is the SSE upgrade for server-initiated messages, which stateless
    // mode cannot serve. Said plainly rather than by a bare 405, because
    // "method not allowed" on a spec-defined method reads as a bug.
    if (req.method === 'GET') {
      return rpcError(res, 405, -32000,
        'This server runs stateless; server-initiated SSE streams are not supported. Use POST.',
        { Allow: 'POST' });
    }

    return rpcError(res, 405, -32000, `${req.method} is not supported on ${MCP_PATH}`, { Allow: 'POST' });
  } catch (error) {
    log.error('Unhandled error serving request', {
      requestId,
      error: error?.message || String(error),
    });
    if (!res.headersSent) {
      rpcError(res, 500, -32603, 'Internal server error');
    } else {
      res.end();
    }
  }
});

httpServer.listen(PORT, () => {
  log.info('MCP server running over HTTP', { port: PORT, path: MCP_PATH, version: MCP_VERSION });
  console.error(`✅ ezmodo MCP Server (HTTP) on :${PORT}${MCP_PATH}`);
  // The RESOLVED url, not CONFIG.apiUrl: EZMODO_API_URL overrides it per call,
  // so printing the build-time default tells an operator pointing this at a
  // local stack the opposite of what is happening.
  console.error(`   Environment: ${CONFIG.environment}   API URL: ${getApiUrl() || CONFIG.apiUrl}`);
  console.error(`   Resource: ${PUBLIC_URL}`);
  console.error(`   Metadata: ${METADATA_URL}`);
  // Say so loudly rather than serving a metadata document with an empty
  // authorization_servers array, which fails later and further away.
  console.error(
    AUTH_SERVER
      ? `   Authorization server: ${AUTH_SERVER}`
      : '   ⚠️  KEYCLOAK_URL is unset — OAuth discovery will advertise no authorization server.'
  );
});

// Cloud Run sends SIGTERM before reclaiming an instance. Closing gracefully
// lets in-flight tool calls finish instead of being cut off mid-request.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    log.info('Shutting down', { signal });
    httpServer.close(() => mcpHandler.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
