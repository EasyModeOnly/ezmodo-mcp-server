import { jest } from '@jest/globals';

const mockGetApiKey = jest.fn();
const mockGetAccessToken = jest.fn();
const mockGetSignedInIdentity = jest.fn();
const mockReadCliCredential = jest.fn();

jest.unstable_mockModule('../lib/env.js', () => ({
  getApiKey: mockGetApiKey,
  getApiUrl: jest.fn(),
}));

jest.unstable_mockModule('../lib/oauth.js', () => ({
  getAccessToken: mockGetAccessToken,
  getSignedInIdentity: mockGetSignedInIdentity,
  beginLogin: jest.fn(),
  signOut: jest.fn(),
}));

jest.unstable_mockModule('../lib/cli-credential.js', () => ({
  readCliCredential: mockReadCliCredential,
}));

const { resolveCredential, describeCredentialSync, resetCredentialCache } = await import(
  '../lib/credentials.js'
);
const { withRequestContext } = await import('../lib/request-context.js');

beforeEach(() => {
  jest.clearAllMocks();
  resetCredentialCache();
  mockGetApiKey.mockReturnValue(undefined);
  mockGetAccessToken.mockResolvedValue(null);
  mockGetSignedInIdentity.mockReturnValue(null);
  mockReadCliCredential.mockReturnValue(null);
});

describe('resolveCredential precedence', () => {
  it('prefers the request context over everything — the HTTP surface', async () => {
    mockGetApiKey.mockReturnValue('env_key');
    mockGetAccessToken.mockResolvedValue('oauth_token');
    mockReadCliCredential.mockReturnValue({ key: 'cli_key', source: 'cli' });

    const result = await withRequestContext({ apiKey: 'request_key' }, () => resolveCredential());

    expect(result).toEqual({ token: 'request_key', source: 'request' });
  });

  it('prefers an explicit EZMODO_API_KEY over an OAuth token', async () => {
    mockGetApiKey.mockReturnValue('env_key');
    mockGetAccessToken.mockResolvedValue('oauth_token');

    expect(await resolveCredential()).toEqual({ token: 'env_key', source: 'EZMODO_API_KEY' });
  });

  it('prefers its OWN OAuth token over the CLI credential', async () => {
    // Both are implicit, so neither wins on explicitness. The OAuth token is
    // preferred because it was granted to THIS connector on a consent screen,
    // rather than borrowed from another program.
    mockGetAccessToken.mockResolvedValue('oauth_token');
    mockGetSignedInIdentity.mockReturnValue({ email: 'someone@example.com' });
    mockReadCliCredential.mockReturnValue({ key: 'cli_key', source: 'cli' });

    expect(await resolveCredential()).toEqual({
      token: 'oauth_token',
      source: 'OAuth (someone@example.com)',
    });
  });

  it('falls back to the CLI credential when nothing else is set', async () => {
    mockReadCliCredential.mockReturnValue({ key: 'cli_key', source: 'ezmodo CLI' });

    expect(await resolveCredential()).toEqual({ token: 'cli_key', source: 'ezmodo CLI' });
  });

  it('returns null rather than throwing when there is nothing to use', async () => {
    // Null is the contract: every caller is on a tool-call path, and "sign in
    // first" is actionable where an exception is not.
    expect(await resolveCredential()).toBeNull();
  });
});

describe('CLI credential lookup', () => {
  it('is read at most once — on macOS it shells out to the Keychain', async () => {
    mockReadCliCredential.mockReturnValue({ key: 'cli_key', source: 'cli' });

    await resolveCredential();
    await resolveCredential();
    await resolveCredential();

    expect(mockReadCliCredential).toHaveBeenCalledTimes(1);
  });

  it('caches a MISS too, so a missing credential is not re-probed per call', async () => {
    await resolveCredential();
    await resolveCredential();

    expect(mockReadCliCredential).toHaveBeenCalledTimes(1);
  });
});

describe('describeCredentialSync', () => {
  it('never triggers a refresh — startup must not block on Keycloak', () => {
    mockGetSignedInIdentity.mockReturnValue({ email: 'someone@example.com' });

    expect(describeCredentialSync()).toEqual({ source: 'OAuth', detail: 'someone@example.com' });
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  it('reports nothing when no credential is available, rather than failing', () => {
    expect(describeCredentialSync()).toBeNull();
  });

  it('truncates a key rather than printing it in full', () => {
    mockGetApiKey.mockReturnValue('ezm_sk_abcdefghijklmnop');

    expect(describeCredentialSync()).toEqual({
      source: 'EZMODO_API_KEY',
      detail: 'ezm_sk_abcde...',
    });
  });
});
