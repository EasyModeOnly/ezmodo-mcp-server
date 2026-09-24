import { jest } from '@jest/globals';

const mockBeginLogin = jest.fn();
const mockGetSignedInIdentity = jest.fn();
const mockSignOut = jest.fn();
const mockGetApiKey = jest.fn();
const mockExecFile = jest.fn();

jest.unstable_mockModule('../lib/oauth.js', () => ({
  beginLogin: mockBeginLogin,
  getSignedInIdentity: mockGetSignedInIdentity,
  signOut: mockSignOut,
  getAccessToken: jest.fn(),
}));

jest.unstable_mockModule('../lib/env.js', () => ({
  getApiKey: mockGetApiKey,
  getApiUrl: jest.fn(),
}));

jest.unstable_mockModule('child_process', () => ({
  exec: jest.fn(),
  execFile: mockExecFile,
  execSync: jest.fn(),
  execFileSync: jest.fn(),
}));

const mockDescribeCliCredential = jest.fn();
jest.unstable_mockModule('../lib/credentials.js', () => ({
  describeCliCredential: mockDescribeCliCredential,
  resetCredentialCache: jest.fn(),
  // Not used by these tests, but imported by modules that
  // handlers/index.js and tools/index.js pull in.
  resolveCredential: jest.fn(),
  describeCredentialSync: jest.fn(),
}));

const { authenticate, cancelPendingLogin } = await import('../handlers/auth.js');
const { AUTH_TOOLS } = await import('../tools/auth.js');
const { LOCAL_ONLY_TOOLS, isRemoteSafe } = await import('../lib/remote-tools.js');

/** A begun flow whose completion we control. */
function flow(authUrl = 'https://auth.ezmodo.com/authorize?x=1') {
  let settle;
  const completion = new Promise((resolve, reject) => (settle = { resolve, reject }));
  return {
    authUrl,
    complete: () => completion,
    cancel: jest.fn(),
    settle,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // The pending sign-in is module state and outlives a test that deliberately
  // never completes its flow.
  cancelPendingLogin();
  mockGetApiKey.mockReturnValue(undefined);
  mockGetSignedInIdentity.mockReturnValue(null);
  mockDescribeCliCredential.mockReturnValue(null);
  // Browser launch "succeeds" unless a test says otherwise.
  mockExecFile.mockImplementation((cmd, args, cb) => cb(null));
});

describe('surface', () => {
  it('is never served remotely — the connector does its own OAuth', () => {
    expect(LOCAL_ONLY_TOOLS).toContain('authenticate');
    expect(isRemoteSafe('authenticate')).toBe(false);
  });

  it('is listed first, so an agent with no credential notices it', async () => {
    const { TOOLS } = await import('../tools/index.js');
    expect(TOOLS[0].name).toBe('authenticate');
  });

  it('has a handler registered under its tool name', async () => {
    const { HANDLERS } = await import('../handlers/index.js');
    expect(HANDLERS.authenticate).toBeDefined();
    expect(AUTH_TOOLS.map((t) => t.name)).toEqual(['authenticate']);
  });
});

describe('login', () => {
  it('returns the URL WITHOUT waiting for the browser round trip', async () => {
    // Blocking would put a human's attention span on a tool call's critical
    // path, and a client that times out at 30s would report failure for a
    // sign-in that then succeeds in the background.
    const f = flow();
    mockBeginLogin.mockResolvedValue(f);

    const result = await authenticate({});

    expect(result.authUrl).toBe(f.authUrl);
    expect(result.authenticated).toBe(false);
    // Never resolved — proving we did not wait on it.
    expect(result.action_required).toMatch(/browser/i);
  });

  it('defaults to login when no action is given', async () => {
    mockBeginLogin.mockResolvedValue(flow());
    await authenticate({});
    expect(mockBeginLogin).toHaveBeenCalled();
  });

  it('reuses the waiting sign-in instead of starting a rival flow', async () => {
    // Two live flows means two loopback listeners and two states, and whichever
    // URL the user did not click sits there until it times out.
    mockBeginLogin.mockResolvedValue(flow());

    const first = await authenticate({ action: 'login' });
    const second = await authenticate({ action: 'login' });

    expect(mockBeginLogin).toHaveBeenCalledTimes(1);
    expect(second.authUrl).toBe(first.authUrl);
    expect(second.reason).toMatch(/already waiting/i);
  });

  it('still returns the URL when no browser can be opened', async () => {
    // Expected over SSH and in containers. The URL is the contract; the launch
    // is a convenience.
    mockExecFile.mockImplementation((cmd, args, cb) => cb(new Error('no such binary')));
    const f = flow();
    mockBeginLogin.mockResolvedValue(f);

    const result = await authenticate({ action: 'login' });

    expect(result.browserOpened).toBe(false);
    expect(result.authUrl).toBe(f.authUrl);
    expect(result.next_step).toMatch(/show the URL/i);
  });

  it('opens the browser without a shell', async () => {
    mockBeginLogin.mockResolvedValue(flow());
    await authenticate({ action: 'login' });
    // execFile, not exec: a URL must never be parsed as shell syntax.
    expect(mockExecFile).toHaveBeenCalled();
  });

  it('frees the pending slot once a flow finishes, so a later login can start', async () => {
    const first = flow();
    mockBeginLogin.mockResolvedValue(first);
    await authenticate({ action: 'login' });

    first.settle.resolve({ email: 'someone@example.com' });
    await new Promise((resolve) => setImmediate(resolve));

    mockBeginLogin.mockResolvedValue(flow('https://auth.ezmodo.com/authorize?x=2'));
    const second = await authenticate({ action: 'login' });

    expect(mockBeginLogin).toHaveBeenCalledTimes(2);
    expect(second.authUrl).toContain('x=2');
  });

  it('frees the pending slot when a flow FAILS too', async () => {
    // A cancelled or timed-out sign-in must not wedge the tool permanently.
    const first = flow();
    mockBeginLogin.mockResolvedValue(first);
    await authenticate({ action: 'login' });

    first.settle.reject(new Error('user cancelled'));
    await new Promise((resolve) => setImmediate(resolve));

    mockBeginLogin.mockResolvedValue(flow('https://auth.ezmodo.com/authorize?x=3'));
    const second = await authenticate({ action: 'login' });

    expect(second.authUrl).toContain('x=3');
  });
});

describe('status', () => {
  it('reports an explicit key as taking precedence', async () => {
    mockGetApiKey.mockReturnValue('ezm_sk_abc');
    const result = await authenticate({ action: 'status' });
    expect(result).toMatchObject({ authenticated: true, source: 'EZMODO_API_KEY' });
  });

  it('reports the signed-in identity', async () => {
    mockGetSignedInIdentity.mockReturnValue({ email: 'someone@example.com', userId: 'u1' });
    const result = await authenticate({ action: 'status' });
    expect(result).toMatchObject({ authenticated: true, source: 'OAuth', email: 'someone@example.com' });
  });

  it('asks for sign-in when there is nothing, and never starts one', async () => {
    const result = await authenticate({ action: 'status' });
    expect(result.authenticated).toBe(false);
    expect(mockBeginLogin).not.toHaveBeenCalled();
  });
});

describe('status with only a CLI key (#2655)', () => {
  it('says calls are using it, instead of "not signed in"', async () => {
    // Every call succeeds with the borrowed key, so "not signed in" was false.
    mockDescribeCliCredential.mockReturnValue({
      source: 'macOS Keychain (ezmodo CLI)', keyPrefix: 'ezm_sk_abcde...',
    });

    const result = await authenticate({ action: 'status' });

    expect(result.authenticated).toBe(true);
    expect(result.source).toBe('macOS Keychain (ezmodo CLI)');
    expect(JSON.stringify(result)).not.toMatch(/ezm_sk_abcdefghij/);
  });

  it('still prefers OAuth when both exist — same order as resolveCredential', async () => {
    mockGetSignedInIdentity.mockReturnValue({ email: 'a@b.c', userId: 'u', scope: 's' });
    mockDescribeCliCredential.mockReturnValue({ source: 'macOS Keychain (ezmodo CLI)', keyPrefix: 'x' });

    expect((await authenticate({ action: 'status' })).source).toBe('OAuth');
  });
});

describe('sign_out', () => {
  it('clears the tokens and says what it did NOT touch', async () => {
    const result = await authenticate({ action: 'sign_out' });
    expect(mockSignOut).toHaveBeenCalled();
    expect(result.note).toMatch(/EZMODO_API_KEY/);
  });

  it('cancels a sign-in still waiting on a browser', async () => {
    // Otherwise a live listener would complete the very login being abandoned.
    const f = flow();
    mockBeginLogin.mockResolvedValue(f);
    await authenticate({ action: 'login' });

    const result = await authenticate({ action: 'sign_out' });

    expect(result.cancelledPendingSignIn).toBe(true);
    expect(f.cancel).toHaveBeenCalled();
  });

  it('reports nothing cancelled when no sign-in was pending', async () => {
    const result = await authenticate({ action: 'sign_out' });
    expect(result.cancelledPendingSignIn).toBe(false);
  });
});

describe('guidance', () => {
  it('always names the two things a user cannot guess', async () => {
    const result = await authenticate({ action: 'status' });
    const notes = result.notes.join(' ');
    // A browser is mandatory (direct access grants are off by design)...
    expect(notes).toMatch(/browser is required/i);
    // ...and a fresh account is in no organization, which signing in again
    // will not fix.
    expect(notes).toMatch(/no organization/i);
  });

  it('offers the API key as the headless alternative', async () => {
    const result = await authenticate({ action: 'status' });
    expect(result.alternatives.join(' ')).toMatch(/EZMODO_API_KEY/);
  });
});

describe('unknown action', () => {
  it('names the valid actions rather than failing silently', async () => {
    await expect(authenticate({ action: 'nope' })).rejects.toThrow(/login, status or sign_out/);
  });
});
