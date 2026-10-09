/**
 * The remote connector's HTTP entry point (http.js, E-282 #3134).
 *
 * http.js starts listening the moment it is imported, so it is exercised the
 * way Cloud Run runs it: as a child process on a free port, with EZMODO_API_URL
 * pointing at a stub API in this process. Nothing reaches a real environment,
 * and HOME is a temp directory so no stored credential can stand in for the
 * one on the request.
 *
 * The CI handshake (scripts/ci/mcp-connector-smoke.mjs) runs against the same
 * process at the end, so the post-deploy check is known to pass against a
 * healthy server before it is ever pointed at a deployed one.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOCAL_ONLY_TOOLS, isRemoteSafe } from '../lib/remote-tools.js';
import { TOOLS } from '../tools/index.js';
import { runConnectorSmoke } from '../../scripts/ci/mcp-connector-smoke.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const HTTP_ENTRY = join(HERE, '..', 'http.js');
const KEYCLOAK_URL = 'https://auth.example.test';

let server; // the http.js child
let serverOutput = '';
let stub; // the stub EzModo API
let apiRequests = [];
let home;
let base; // http://127.0.0.1:<port>
let endpoint; // <base>/mcp

function listen(httpServer) {
  return new Promise((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve(httpServer.address().port)));
}

async function freePort() {
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

function waitForStart(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`http.js did not start:\n${serverOutput}`)), 20_000);
    const onData = (chunk) => {
      serverOutput += chunk;
      if (serverOutput.includes('ezmodo MCP Server (HTTP)')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`http.js exited with ${code}:\n${serverOutput}`));
    });
  });
}

beforeAll(async () => {
  // Answers every API call with an organization and records who asked.
  stub = createServer((req, res) => {
    apiRequests.push({ method: req.method, url: req.url, authorization: req.headers.authorization });
    const body = JSON.stringify({ id: 'org-stub', name: 'Stub Org', slug: 'stub-org' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  const stubPort = await listen(stub);

  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  endpoint = `${base}/mcp`;
  home = mkdtempSync(join(tmpdir(), 'mcp-http-test-'));

  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^EZMODO_/.test(key)) delete env[key];
  Object.assign(env, {
    PORT: String(port),
    MCP_PUBLIC_URL: endpoint,
    KEYCLOAK_URL: `${KEYCLOAK_URL}/`,
    EZMODO_API_URL: `http://127.0.0.1:${stubPort}`,
    BUILD_ENV: 'development',
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
  });
  delete env.NODE_OPTIONS; // jest's --experimental-vm-modules is not the server's business

  server = spawn(process.execPath, [HTTP_ENTRY], { env, cwd: home, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.setEncoding('utf8');
  server.stderr.setEncoding('utf8');
  await waitForStart(server);
}, 30_000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
  if (stub) await new Promise((resolve) => stub.close(resolve));
  if (home) rmSync(home, { recursive: true, force: true });
});

beforeEach(() => {
  apiRequests = [];
});

const ACCEPT = 'application/json, text/event-stream';

function rpc(body, { token, headers = {} } = {}) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: ACCEPT,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** The JSON-RPC message answering `id`, from a JSON or SSE body. */
async function answer(res, id) {
  const text = await res.text();
  const type = res.headers.get('content-type') || '';
  const messages = type.includes('text/event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5).trim()))
    : [JSON.parse(text)];
  return messages.find((m) => m.id === id);
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jest', version: '0' } },
};

describe('OAuth protected-resource metadata (RFC 9728)', () => {
  test('is served at the spec-derived path, unauthenticated', async () => {
    const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/max-age=3600/);
    const meta = await res.json();
    expect(meta).toEqual({
      resource: endpoint,
      // The trailing slash on KEYCLOAK_URL is stripped, not doubled.
      authorization_servers: [`${KEYCLOAK_URL}/realms/ezmodo`],
      scopes_supported: ['ezmodo:read', 'ezmodo:write', 'ezmodo:delete'],
      bearer_methods_supported: ['header'],
      resource_documentation: 'https://ezmodo.com/docs/emo/ezmodo/help/cli-mcp',
    });
  });

  test.each(['/.well-known/oauth-protected-resource', '/mcp/.well-known/oauth-protected-resource'])(
    'is also served at %s for clients that derive the URL differently',
    async (path) => {
      const res = await fetch(`${base}${path}`);
      expect(res.status).toBe(200);
      expect((await res.json()).resource).toBe(endpoint);
    });
});

describe('unauthenticated requests', () => {
  test.each([
    ['no Authorization header', {}],
    ['a non-Bearer scheme', { Authorization: 'Basic dXNlcjpwYXNz' }],
    ['an empty bearer', { Authorization: 'Bearer   ' }],
  ])('POST with %s is 401 with a challenge naming the metadata', async (_label, headers) => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { headers });
    expect(res.status).toBe(401);
    const challenge = res.headers.get('www-authenticate');
    expect(challenge).toMatch(/^Bearer realm="ezmodo-mcp"/);
    expect(challenge).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
    expect(challenge).toContain('error="invalid_request"');
    const body = await res.json();
    expect(body).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32001 } });
    // Refused before anything reached the API.
    expect(apiRequests).toHaveLength(0);
  });

  test('the tool surface is never returned without a credential', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(JSON.stringify(await res.json())).not.toContain('manage_task');
  });
});

describe('routing', () => {
  test.each(['/health', '/healthz', '/mcp/health'])('%s answers without touching the API', async (path) => {
    const res = await fetch(`${base}${path}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', environment: 'development' });
    expect(apiRequests).toHaveLength(0);
  });

  test('GET on the endpoint is 405: stateless, no SSE stream', async () => {
    const res = await fetch(endpoint, { headers: { Accept: 'text/event-stream', Authorization: 'Bearer k' } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
    expect((await res.json()).error.message).toMatch(/stateless/);
  });

  test('other methods are 405 with Allow: POST', async () => {
    const res = await fetch(endpoint, { method: 'DELETE', headers: { Authorization: 'Bearer k' } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  test('an unknown path is 404 and names the endpoint', async () => {
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()).error.message).toContain('/mcp');
  });

  test('an unparseable body is a 400 parse error', async () => {
    const res = await rpc('{not json', { token: 'k' });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });
});

describe('MCP over Streamable HTTP with a key', () => {
  test('initialize answers with server info and the tools capability', async () => {
    const res = await rpc(INITIALIZE, { token: 'key-init' });
    expect(res.status).toBe(200);
    const msg = await answer(res, 1);
    expect(msg.error).toBeUndefined();
    expect(msg.result.protocolVersion).toBe('2025-06-18');
    expect(msg.result.serverInfo.name).toBeTruthy();
    expect(msg.result.capabilities.tools).toBeDefined();
    // Stateless: there is no session to hand back.
    expect(res.headers.get('mcp-session-id')).toBeNull();
  });

  test('tools/list serves exactly the remote-safe tools', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, {
      token: 'key-list',
      headers: { 'MCP-Protocol-Version': '2025-06-18' },
    });
    expect(res.status).toBe(200);
    const names = (await answer(res, 2)).result.tools.map((t) => t.name).sort();

    const expected = TOOLS.map((t) => t.name).filter(isRemoteSafe).sort();
    expect(names).toEqual(expected);
    for (const local of LOCAL_ONLY_TOOLS) expect(names).not.toContain(local);
    // Listing is static metadata: it does not call the API.
    expect(apiRequests).toHaveLength(0);
  });

  test('a local-only tool is refused even when called by name', async () => {
    const res = await rpc({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'detect_git_repository', arguments: {} },
    }, { token: 'key-local', headers: { 'MCP-Protocol-Version': '2025-06-18' } });
    const msg = await answer(res, 3);
    expect(msg.error || msg.result?.isError).toBeTruthy();
    expect(apiRequests).toHaveLength(0);
  });

  test('each call reaches the API with its own request\'s bearer, concurrently', async () => {
    const call = (id, token) => rpc({
      jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'get_organization', arguments: {} },
    }, { token, headers: { 'MCP-Protocol-Version': '2025-06-18' } }).then((res) => answer(res, id));

    const [a, b] = await Promise.all([call(10, 'key-alpha'), call(11, 'key-beta')]);
    for (const msg of [a, b]) {
      expect(msg.result.isError).toBeFalsy();
      expect(msg.result.content[0].text).toContain('Stub Org');
    }
    const seen = apiRequests.map((r) => r.authorization).sort();
    expect(seen).toEqual(['Bearer key-alpha', 'Bearer key-beta']);
  });
});

describe('the CI connector handshake (scripts/ci/mcp-connector-smoke.mjs)', () => {
  test('passes against a healthy server', async () => {
    const log = console.log;
    console.log = () => {};
    let results;
    try {
      results = await runConnectorSmoke({ endpoint, apiKey: 'key-smoke' });
    } finally {
      console.log = log;
    }
    expect(results.map((r) => [r.name, r.status, r.message])).toEqual([
      ['initialize', 'pass', undefined],
      ['tools-list', 'pass', undefined],
      ['tools-call', 'pass', undefined],
    ]);
    expect(apiRequests.map((r) => r.authorization)).toEqual(['Bearer key-smoke']);
  });
});
