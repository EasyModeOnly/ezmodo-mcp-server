/**
 * Small pure helpers for the HTTP transport (http.js), kept here because
 * http.js starts listening the moment it is imported and so cannot be tested.
 */

/**
 * The paths that answer a health check.
 *
 * `/health` and `/healthz` are what Cloud Run's probes dial, straight at the
 * container. `${mcpPath}/health` is the only one reachable from OUTSIDE: the
 * load balancer forwards just `/mcp` and `/mcp/*` here, with the path
 * unchanged, and `/health` at the domain root belongs to the web app. The
 * uptime check has always probed `/mcp/health`, and until this was added it
 * got a 404 every minute.
 *
 * @param {string} mcpPath
 * @returns {Set<string>}
 */
export function healthPaths(mcpPath) {
  return new Set(['/health', '/healthz', `${mcpPath}/health`]);
}

/**
 * What to log about a request the MCP transport refused.
 *
 * The SDK answers a malformed or unsupported request with a 400 and reports
 * why only through `transport.onerror`. Without this, production logged a 400
 * at the start of every Claude Desktop session and nothing else, so nobody
 * could tell which request it was or what the SDK disliked about it.
 *
 * Only the shape is kept: JSON-RPC methods and the protocol headers. Never the
 * Authorization header, and never params, which can carry user content.
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {unknown} body parsed JSON body, possibly a batch array
 */
export function describeRejectedRequest(req, body) {
  const messages = Array.isArray(body) ? body : body ? [body] : [];
  const methods = messages.map((m) => (m && typeof m === 'object' && typeof m.method === 'string'
    ? m.method
    : '(no method)'));
  const initialize = messages.find((m) => m?.method === 'initialize');

  return {
    methods,
    batch: Array.isArray(body),
    protocolVersionHeader: req.headers['mcp-protocol-version'] ?? null,
    sessionIdHeader: req.headers['mcp-session-id'] ? 'present' : null,
    initializeProtocolVersion: initialize?.params?.protocolVersion ?? null,
    accept: req.headers.accept ?? null,
    contentType: req.headers['content-type'] ?? null,
  };
}
