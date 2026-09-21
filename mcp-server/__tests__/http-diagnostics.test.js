import { describe, it, expect } from '@jest/globals';
import { healthPaths, describeRejectedRequest } from '../lib/http-diagnostics.js';

const req = (headers = {}) => ({ headers });

describe('healthPaths', () => {
  it('answers under the MCP path, the only health URL the load balancer routes here', () => {
    expect(healthPaths('/mcp').has('/mcp/health')).toBe(true);
  });

  it('keeps the container-level paths the Cloud Run probes dial', () => {
    const paths = healthPaths('/mcp');
    expect(paths.has('/health')).toBe(true);
    expect(paths.has('/healthz')).toBe(true);
  });

  it('follows a custom MCP path', () => {
    expect(healthPaths('/connector').has('/connector/health')).toBe(true);
    expect(healthPaths('/connector').has('/mcp/health')).toBe(false);
  });
});

describe('describeRejectedRequest', () => {
  it('reports the method and protocol headers of a single message', () => {
    const out = describeRejectedRequest(
      req({
        'mcp-protocol-version': '2026-07-28',
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      }),
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    );
    expect(out).toEqual({
      methods: ['tools/list'],
      batch: false,
      protocolVersionHeader: '2026-07-28',
      sessionIdHeader: null,
      initializeProtocolVersion: null,
      accept: 'application/json, text/event-stream',
      contentType: 'application/json',
    });
  });

  it('reports every method in a batch and the version an initialize asked for', () => {
    const out = describeRejectedRequest(req(), [
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ]);
    expect(out.batch).toBe(true);
    expect(out.methods).toEqual(['initialize', 'tools/list']);
    expect(out.initializeProtocolVersion).toBe('2025-11-25');
  });

  it('says a session id was sent without logging its value', () => {
    const out = describeRejectedRequest(req({ 'mcp-session-id': 'secret-session' }), { method: 'tools/list' });
    expect(out.sessionIdHeader).toBe('present');
    expect(JSON.stringify(out)).not.toContain('secret-session');
  });

  it('never includes the Authorization header or params', () => {
    const out = describeRejectedRequest(
      req({ authorization: 'Bearer abc.def.ghi' }),
      { method: 'tools/call', params: { name: 'manage_task', arguments: { description: 'private' } } },
    );
    const text = JSON.stringify(out);
    expect(text).not.toContain('abc.def.ghi');
    expect(text).not.toContain('private');
  });

  it('copes with an unparsed or method-less body', () => {
    expect(describeRejectedRequest(req(), undefined).methods).toEqual([]);
    expect(describeRejectedRequest(req(), { foo: 1 }).methods).toEqual(['(no method)']);
  });
});
