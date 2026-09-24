import { jest } from '@jest/globals';
import zlib from 'zlib';

// Mock node-fetch so we can inspect the outgoing request.
const mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({ default: mockFetch }));

// Mock auth/env resolution.
jest.unstable_mockModule('../lib/env.js', () => ({
  getApiKey: () => 'test-api-key',
  getApiUrl: () => 'https://api.test',
}));

const { callEzmodoAPI } = await import('../lib/http-client.js');

function okResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data }),
    text: async () => JSON.stringify({ success: true, data }),
  };
}

describe('callEzmodoAPI body encoding', () => {
  afterEach(() => jest.clearAllMocks());

  it('gzips large POST bodies with Content-Encoding: gzip', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ version: { version: 3 } }));

    // Build a payload well over the 64 KB threshold.
    const tables = [];
    for (let i = 0; i < 400; i++) {
      tables.push({
        name: `table_${i}`,
        columns: [
          { name: 'id', type: 'uuid', nullable: false },
          { name: 'organization_id', type: 'text', nullable: false },
          { name: 'created_at', type: 'timestamptz', nullable: false },
        ],
        primaryKey: ['id'],
      });
    }
    const data = { taskId: 't-1', snapshot: { tables } };

    await callEzmodoAPI('mcpCreateTask', data);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, opts] = mockFetch.mock.calls[0];

    expect(opts.headers['Content-Encoding']).toBe('gzip');
    expect(Buffer.isBuffer(opts.body)).toBe(true);

    // Body must gunzip back to the original JSON (not base64-wrapped).
    const roundTripped = JSON.parse(zlib.gunzipSync(opts.body).toString('utf-8'));
    expect(roundTripped).toEqual(data);
    expect(roundTripped.__base64_body).toBeUndefined();

    // gzip must actually be smaller than the raw JSON it replaced.
    expect(opts.body.length).toBeLessThan(Buffer.byteLength(JSON.stringify(data), 'utf-8'));
  });

  it('base64-wraps small POST bodies (no gzip)', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ task: { id: 't-1' } }));

    const data = { title: 'small task', projectId: 'p-1' };
    await callEzmodoAPI('mcpCreateTask', data);

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Content-Encoding']).toBeUndefined();

    const parsed = JSON.parse(opts.body);
    expect(parsed.__base64_body).toBe(true);
    const decoded = JSON.parse(Buffer.from(parsed.value, 'base64').toString('utf-8'));
    expect(decoded).toEqual(data);
  });

  it('sends GET params as query string with no body', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ projects: [] }));

    await callEzmodoAPI('mcpListProjects', { organizationId: 'org-1' });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('organizationId=org-1');
    expect(opts.body).toBeNull();
    expect(opts.headers['Content-Encoding']).toBeUndefined();
  });
});

// E-204: routes with `{param}` placeholders, and 204 No Content.
describe('callEzmodoAPI route params', () => {
  afterEach(() => jest.clearAllMocks());

  it('fills a path param and does not also send it as a query param', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ id: 'n 1' }));

    await callEzmodoAPI('mcpGetNote', { noteId: 'n 1' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test/mcp/v1/notes/n%201');
  });

  it('keeps the other fields in the body of a write', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ id: 'n-1' }));

    await callEzmodoAPI('mcpUpdateNote', { noteId: 'n-1', title: 'T' });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test/mcp/v1/notes/n-1');
    expect(opts.method).toBe('PUT');
    const decoded = JSON.parse(Buffer.from(JSON.parse(opts.body).value, 'base64').toString('utf-8'));
    expect(decoded).toEqual({ title: 'T' });
  });

  it('throws before any request when a path param is missing', async () => {
    await expect(callEzmodoAPI('mcpGetNote', {})).rejects.toThrow('noteId is required for mcpGetNote');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns success for a 204 instead of parsing an empty body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => { throw new Error('Unexpected end of JSON input'); },
      text: async () => '',
    });

    const result = await callEzmodoAPI('mcpDeleteNote', { noteId: 'n-1' });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.test/mcp/v1/notes/n-1');
    expect(opts.method).toBe('DELETE');
    expect(result).toEqual({ success: true });
  });
});

// The client half of #2282. The API now distinguishes "your key is bad" from
// "the database is unreachable"; these assert the agent-visible consequence of
// that distinction, and pin the regression that produced the phantom message.
describe('callEzmodoAPI error classification', () => {
  afterEach(() => jest.clearAllMocks());

  function errorResponse(status, statusText, bodyText) {
    return {
      ok: false,
      status,
      statusText,
      text: async () => bodyText,
    };
  }

  it('surfaces a capacity 503 as retryable, not as an auth failure', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(
        503,
        'Service Unavailable',
        JSON.stringify({
          success: false,
          error: 'Database capacity temporarily exhausted — retry shortly',
          details: 'database capacity temporarily exhausted: context deadline exceeded',
          retryable: true,
        })
      )
    );

    await expect(callEzmodoAPI('mcpSearchEpics', { query: 'x' })).rejects.toMatchObject({
      status: 503,
      retryable: true,
    });
  });

  it('does not mark a genuine 401 retryable', async () => {
    mockFetch.mockResolvedValueOnce(
      errorResponse(
        401,
        'Unauthorized',
        JSON.stringify({ success: false, error: 'invalid or revoked API key' })
      )
    );

    const thrown = await callEzmodoAPI('mcpSearchEpics', { query: 'x' }).catch((e) => e);

    expect(thrown.status).toBe(401);
    expect(thrown.retryable).toBeUndefined();
    // The API's own words, not the HTTP status line.
    expect(thrown.message).toContain('invalid or revoked API key');
  });

  it('regression: a plain-text body is what produced the phantom "Unauthorized"', async () => {
    // Exactly what the API sent before #2282 — http.Error writes text/plain, so
    // JSON.parse threw and the client fell back to `response.statusText`. The
    // word "Unauthorized" in every wedge report came from HERE, not from the
    // server, and it hid a database outage behind an auth error for a week.
    mockFetch.mockResolvedValueOnce(
      errorResponse(401, 'Unauthorized', 'API key validation failed: database capacity temporarily exhausted\n')
    );

    const thrown = await callEzmodoAPI('mcpSearchEpics', { query: 'x' }).catch((e) => e);

    expect(thrown.message).toBe('Unauthorized');
    // The true cause was on the wire the whole time and the client discarded
    // it. Nothing asserts a fix here — the fix is that the API no longer sends
    // plain text — but this documents the failure mode so it is recognisable
    // if any endpoint regresses to http.Error.
  });
});
