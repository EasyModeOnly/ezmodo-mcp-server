import { jest } from '@jest/globals';

/**
 * The dispatch-level funnel (#2632): an authentication failure must reach the
 * agent as sign-in guidance it can act on, not as a bare error string.
 */

const mockHandler = jest.fn();

jest.unstable_mockModule('../handlers/index.js', () => ({
  HANDLERS: { get_task: mockHandler, authenticate: jest.fn() },
}));

jest.unstable_mockModule('../tools/index.js', () => ({
  TOOLS: [
    { name: 'get_task', description: 'x', inputSchema: { type: 'object' } },
    { name: 'authenticate', description: 'x', inputSchema: { type: 'object' } },
  ],
}));

const mockGetApiKey = jest.fn();
jest.unstable_mockModule('../lib/env.js', () => ({
  getApiKey: mockGetApiKey,
  getApiUrl: jest.fn(),
}));

const { createServer } = await import('../lib/create-server.js');
const { NOT_AUTHENTICATED, NO_ORGANIZATION, EMAIL_ALREADY_REGISTERED } =
  await import('../lib/auth-guidance.js');
const { CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

/** Reach the tool-call handler the server registered. */
function dispatcher(server) {
  return (name, args = {}) =>
    server._requestHandlers
      .get(CallToolRequestSchema.shape.method.value)
      .call(server, { method: 'tools/call', params: { name, arguments: args } });
}

const parse = (result) => JSON.parse(result.content[0].text);

const mockStartSignIn = jest.fn();
const localServer = () => createServer({ startSignIn: mockStartSignIn });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetApiKey.mockReturnValue(undefined);
  mockStartSignIn.mockResolvedValue({
    authenticated: false,
    authUrl: 'https://auth.ezmodo.com/authorize?x=1',
    action_required: 'Show this URL to the user.',
  });
});

describe('local surface', () => {
  it('starts sign-in on the FIRST call and returns the URL itself (#2654)', async () => {
    // It used to say "call `authenticate`", so the URL took a second round trip.
    const error = new Error('Not authenticated with EzModo.');
    error.code = NOT_AUTHENTICATED;
    mockHandler.mockRejectedValue(error);

    const result = await dispatcher(localServer())('get_task');
    const payload = parse(result);

    expect(mockStartSignIn).toHaveBeenCalledTimes(1);
    expect(payload.authenticated).toBe(false);
    expect(payload.authUrl).toMatch(/^https:\/\/auth\.ezmodo\.com\//);
  });

  it('returns it as a RESULT, not an error — nothing is broken, the user has a step (#2654)', async () => {
    // Some clients drop an error result's text or report the call as failed,
    // and this text is the one thing that must reach the user.
    const error = new Error('Not authenticated with EzModo.');
    error.code = NOT_AUTHENTICATED;
    mockHandler.mockRejectedValue(error);

    expect((await dispatcher(localServer())('get_task')).isError).toBeUndefined();
  });

  it('treats a 401 the same way — a credential can STOP being valid', async () => {
    // A refresh grant that expired while the editor sat open overnight, or a
    // revoked CLI key. A fresh browser sign-in is the right answer to both.
    const error = new Error('Unauthorized');
    error.status = 401;
    mockHandler.mockRejectedValue(error);

    expect(parse(await dispatcher(localServer())('get_task')).authUrl).toBeDefined();
    expect(mockStartSignIn).toHaveBeenCalledTimes(1);
  });

  it('does NOT open a browser when the rejected credential is EZMODO_API_KEY', async () => {
    // An explicit key outranks OAuth, so a browser sign-in could not take
    // effect. Say what to fix instead of sending the user on that errand.
    mockGetApiKey.mockReturnValue('ezm_sk_revoked');
    const error = new Error('Unauthorized');
    error.status = 401;
    mockHandler.mockRejectedValue(error);

    const result = await dispatcher(localServer())('get_task');

    expect(mockStartSignIn).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(parse(result).reason).toMatch(/EZMODO_API_KEY was rejected/);
  });

  it('falls back to plain guidance if sign-in cannot even start', async () => {
    // e.g. no loopback port available. The call must still say something useful.
    mockStartSignIn.mockRejectedValue(new Error('listen EADDRINUSE'));
    const error = new Error('Not authenticated with EzModo.');
    error.code = NOT_AUTHENTICATED;
    mockHandler.mockRejectedValue(error);

    const payload = parse(await dispatcher(localServer())('get_task'));

    expect(payload.authenticated).toBe(false);
    expect(payload.action_required).toMatch(/authenticate/i);
  });

  it('does NOT hijack a 403 — signed in but not permitted', async () => {
    // Most often a new account in no organization. Sending someone back
    // through a sign-in that cannot fix it is worse than saying nothing.
    const error = new Error('Forbidden: not a member of this organization');
    error.status = 403;
    mockHandler.mockRejectedValue(error);

    const payload = parse(await dispatcher(createServer())('get_task'));

    expect(payload.authenticated).toBeUndefined();
    expect(payload.error).toMatch(/Forbidden/);
  });

  it('answers the no-organization 403 with workspace guidance, not a bare error', async () => {
    // #2639. The one 403 that has a specific answer: sign-in worked, the
    // account just has no workspace. Keyed on the API's code, so the branch
    // above ("do not hijack a 403") still holds for every other 403.
    const error = new Error('Signed in successfully, but this account does not belong to any EzModo organization yet.');
    error.status = 403;
    error.code = NO_ORGANIZATION;
    mockHandler.mockRejectedValue(error);

    const payload = parse(await dispatcher(createServer())('get_task'));

    expect(payload.authenticated).toBe(true);
    expect(payload.organization).toBeNull();
    expect(payload.onboardingUrl).toMatch(/\/onboarding$/);
    // Must NOT tell them to sign in again — that is the mistake this replaces.
    expect(payload.action_required).not.toMatch(/sign in|authenticate/i);
  });

  it('answers an email collision differently from a missing workspace', async () => {
    // #2652. Both are "signed in but got nothing back", and the fix for one is
    // a dead end for the other: creating a workspace runs the same insert
    // against the same unique index and fails identically.
    const error = new Error('This email address already belongs to a different EzModo account.');
    error.status = 409;
    error.code = EMAIL_ALREADY_REGISTERED;
    mockHandler.mockRejectedValue(error);

    const payload = parse(await dispatcher(createServer())('get_task'));

    expect(payload.accountProvisioned).toBe(false);
    // The distinguishing property: it must NOT send them to onboarding.
    expect(payload.onboardingUrl).toBeUndefined();
    expect(payload.action_required).toMatch(/originally did|support/i);
  });

  it('leaves ordinary failures alone', async () => {
    mockHandler.mockRejectedValue(new Error('Task not found'));

    expect(parse(await dispatcher(createServer())('get_task')).error).toBe('Task not found');
  });

  it('does not interfere with a successful call', async () => {
    mockHandler.mockResolvedValue({ id: 't1' });

    const result = await dispatcher(createServer())('get_task');

    expect(result.isError).toBeUndefined();
    expect(parse(result)).toEqual({ id: 't1' });
  });
});

describe('remote surface', () => {
  it('does NOT offer local sign-in — Claude owns the OAuth there', async () => {
    const error = new Error('Unauthorized');
    error.status = 401;
    mockHandler.mockRejectedValue(error);

    const payload = parse(
      await dispatcher(createServer({ surface: 'remote', startSignIn: mockStartSignIn }))('get_task')
    );

    expect(payload.authenticated).toBeUndefined();
    expect(payload.error).toBe('Unauthorized');
    expect(mockStartSignIn).not.toHaveBeenCalled();
  });

  it('DOES answer the no-organization 403 — a missing workspace is ours on every surface', async () => {
    // The asymmetry with sign-in above is deliberate (#2639): Claude owns the
    // OAuth over the connector, but not the workspace, and a claude.ai user
    // hits this exactly as a local one does.
    const error = new Error('Signed in successfully, but this account does not belong to any EzModo organization yet.');
    error.status = 403;
    error.code = NO_ORGANIZATION;
    mockHandler.mockRejectedValue(error);

    const payload = parse(await dispatcher(createServer({ surface: 'remote' }))('get_task'));

    expect(payload.authenticated).toBe(true);
    expect(payload.onboardingUrl).toMatch(/\/onboarding$/);
  });
});
