import { jest } from '@jest/globals';

const mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({ default: mockFetch }));

const mockReadTokens = jest.fn();
const mockWriteTokens = jest.fn();
const mockClearTokens = jest.fn();
const mockIsExpired = jest.fn();
jest.unstable_mockModule('../lib/token-store.js', () => ({
  readTokens: mockReadTokens,
  writeTokens: mockWriteTokens,
  clearTokens: mockClearTokens,
  isExpired: mockIsExpired,
  getTokenPath: () => '/tmp/mcp-oauth.json',
}));

const { getAccessToken, beginLogin } = await import('../lib/oauth.js');

/** A Keycloak token response, JWT payload included so claims can be read out. */
function tokenResponse({ access = 'new_access', refresh = 'new_refresh', expiresIn = 300 } = {}) {
  const claims = Buffer.from(
    JSON.stringify({ sub: 'user-1', email: 'someone@example.com' })
  ).toString('base64url');
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        access_token: `header.${claims}.sig-${access}`,
        // Omitted entirely when null, which is how Keycloak declines to rotate.
        ...(refresh === null ? {} : { refresh_token: refresh }),
        expires_in: expiresIn,
        scope: 'openid ezmodo:read ezmodo:write',
      }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWriteTokens.mockReturnValue(true);
});

describe('getAccessToken', () => {
  it('returns null when nobody has signed in', async () => {
    mockReadTokens.mockReturnValue(null);
    expect(await getAccessToken()).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns a live token without touching the network', async () => {
    mockReadTokens.mockReturnValue({ accessToken: 'live', refreshToken: 'r' });
    mockIsExpired.mockReturnValue(false);

    expect(await getAccessToken()).toBe('live');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('refreshes an expired token and persists the result', async () => {
    mockReadTokens.mockReturnValue({ accessToken: 'old', refreshToken: 'r' });
    mockIsExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue(tokenResponse());

    const token = await getAccessToken();

    expect(token).toContain('sig-new_access');
    expect(mockWriteTokens).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'new_refresh', email: 'someone@example.com' })
    );
  });

  it('keeps the old refresh token when Keycloak does not issue a new one', async () => {
    // Otherwise the next refresh has nothing to present and the user is
    // silently signed out.
    mockReadTokens.mockReturnValue({ accessToken: 'old', refreshToken: 'keep_me' });
    mockIsExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue(tokenResponse({ refresh: null }));

    await getAccessToken();

    expect(mockWriteTokens).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'keep_me' })
    );
  });

  it('is single-flight — concurrent callers share ONE refresh', async () => {
    // Keycloak rotates refresh tokens, so two concurrent refreshes race to
    // invalidate each other and the loser signs the user out.
    mockReadTokens.mockReturnValue({ accessToken: 'old', refreshToken: 'r' });
    mockIsExpired.mockReturnValue(true);
    let resolveFetch;
    mockFetch.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));

    const calls = [getAccessToken(), getAccessToken(), getAccessToken()];
    resolveFetch(tokenResponse());
    const results = await Promise.all(calls);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(new Set(results).size).toBe(1);
  });

  it('clears a dead grant on 400 rather than retrying it forever', async () => {
    mockReadTokens.mockReturnValue({ accessToken: 'old', refreshToken: 'r' });
    mockIsExpired.mockReturnValue(true);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    });

    expect(await getAccessToken()).toBeNull();
    expect(mockClearTokens).toHaveBeenCalled();
  });

  it('KEEPS the tokens on a transient failure so a later call can retry', async () => {
    mockReadTokens.mockReturnValue({ accessToken: 'old', refreshToken: 'r' });
    mockIsExpired.mockReturnValue(true);
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));

    expect(await getAccessToken()).toBeNull();
    expect(mockClearTokens).not.toHaveBeenCalled();
  });

  it('returns null when an expired token has no refresh token at all', async () => {
    mockReadTokens.mockReturnValue({ accessToken: 'old' });
    mockIsExpired.mockReturnValue(true);

    expect(await getAccessToken()).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('beginLogin', () => {
  it('hands back the authorize URL BEFORE anyone can complete the flow', async () => {
    const { authUrl, cancel } = await beginLogin();
    const url = new URL(authUrl);

    expect(url.searchParams.get('client_id')).toBe('ezmodo-mcp');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');
    cancel();
  });

  it('asks for offline_access and the consent scopes, but NOT delete', async () => {
    // Keycloak consent is accept-or-decline over the whole set, so requesting
    // delete would make "permanently delete your projects" a condition of
    // installing an MCP server.
    const { authUrl, cancel } = await beginLogin();
    const scope = new URL(authUrl).searchParams.get('scope');

    expect(scope).toContain('offline_access');
    expect(scope).toContain('ezmodo:read');
    expect(scope).toContain('ezmodo:write');
    expect(scope).not.toContain('ezmodo:delete');
    cancel();
  });

  it('redirects to an EPHEMERAL loopback port, not a fixed one', async () => {
    // A fixed port collides with a concurrent `ezmodo auth login`, which is
    // exactly when someone is likely to be signing in.
    const first = await beginLogin();
    const second = await beginLogin();

    const portOf = (u) => new URL(new URL(u).searchParams.get('redirect_uri')).port;
    expect(portOf(first.authUrl)).not.toBe(portOf(second.authUrl));
    expect(new URL(new URL(first.authUrl).searchParams.get('redirect_uri')).hostname).toBe(
      '127.0.0.1'
    );

    first.cancel();
    second.cancel();
  });

  it('uses a fresh state and PKCE challenge each time', async () => {
    const first = await beginLogin();
    const second = await beginLogin();

    const param = (u, k) => new URL(u).searchParams.get(k);
    expect(param(first.authUrl, 'state')).not.toBe(param(second.authUrl, 'state'));
    expect(param(first.authUrl, 'code_challenge')).not.toBe(param(second.authUrl, 'code_challenge'));

    first.cancel();
    second.cancel();
  });
});

describe('the loopback page (#2654)', () => {
  /** Drive the browser half: hit the redirect URI the way Keycloak would. */
  async function redirect(authUrl, params) {
    const { get } = await import('http');
    const target = new URL(new URL(authUrl).searchParams.get('redirect_uri'));
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    return new Promise((resolve, reject) => {
      get(target, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }).on('error', reject);
    });
  }

  it('names the signed-in account — an SSO session skips every screen before it', async () => {
    mockFetch.mockResolvedValue(tokenResponse());
    const { authUrl, complete } = await beginLogin();
    const state = new URL(authUrl).searchParams.get('state');

    const finished = complete();
    const page = await redirect(authUrl, { code: 'abc', state });
    await finished;

    expect(page.status).toBe(200);
    expect(page.body).toContain('someone@example.com');
    expect(page.body).toMatch(/sign_out/);
  });

  it('waits for the token exchange, so a failed exchange is not shown as success', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, text: async () => 'invalid_grant' });
    const { authUrl, complete } = await beginLogin();
    const state = new URL(authUrl).searchParams.get('state');

    const finished = complete().catch((e) => e);
    const page = await redirect(authUrl, { code: 'abc', state });

    expect(page.status).toBe(400);
    expect(page.body).toMatch(/Sign-in failed/);
    expect(page.body).not.toMatch(/Signed in to EzModo/);
    expect(await finished).toBeInstanceOf(Error);
  });

  it('escapes what it interpolates', async () => {
    const claims = Buffer.from(JSON.stringify({ sub: 'u', email: '<img src=x onerror=alert(1)>' })).toString('base64url');
    mockFetch.mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ access_token: `h.${claims}.s`, refresh_token: 'r', expires_in: 60 }),
    });
    const { authUrl, complete } = await beginLogin();
    const state = new URL(authUrl).searchParams.get('state');

    const finished = complete();
    const page = await redirect(authUrl, { code: 'abc', state });
    await finished;

    expect(page.body).not.toContain('<img');
    expect(page.body).toContain('&lt;img');
  });
});
