import { jest } from '@jest/globals';

const mockGetApiKey = jest.fn();
jest.unstable_mockModule('../lib/env.js', () => ({
  getApiKey: mockGetApiKey,
  getApiUrl: jest.fn(),
}));

const { withRequestContext, getRequestContext, resolveApiKey } = await import(
  '../lib/request-context.js'
);

beforeEach(() => jest.clearAllMocks());

describe('resolveApiKey', () => {
  it('falls back to the environment outside a request — the stdio path', () => {
    mockGetApiKey.mockReturnValue('env_key');
    expect(resolveApiKey()).toBe('env_key');
    expect(getRequestContext()).toBeUndefined();
  });

  it('prefers the request credential over the environment', () => {
    mockGetApiKey.mockReturnValue('env_key');
    withRequestContext({ apiKey: 'request_key' }, () => {
      expect(resolveApiKey()).toBe('request_key');
    });
  });

  it('falls back to the environment when a context carries no key', () => {
    mockGetApiKey.mockReturnValue('env_key');
    withRequestContext({}, () => {
      expect(resolveApiKey()).toBe('env_key');
    });
  });

  it('does not leak the context after the callback returns', () => {
    mockGetApiKey.mockReturnValue('env_key');
    withRequestContext({ apiKey: 'request_key' }, () => resolveApiKey());
    expect(resolveApiKey()).toBe('env_key');
  });
});

describe('concurrency', () => {
  // The property the whole HTTP transport rests on. One process serves many
  // callers with interleaved requests; a leak here means answering one user
  // with another user's credential — the worst bug this code could have, and
  // one that no single-request test would show.
  it('keeps interleaved requests on their own credentials', async () => {
    mockGetApiKey.mockReturnValue('env_key');

    const observed = [];
    const request = (key, delayMs) =>
      withRequestContext({ apiKey: key }, async () => {
        // Yield mid-request, the way an outbound API call does.
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        observed.push([key, resolveApiKey()]);
      });

    // Deliberately out of order: the slowest starts first and finishes last.
    await Promise.all([request('alice', 30), request('bob', 5), request('carol', 15)]);

    for (const [expected, actual] of observed) {
      expect(actual).toBe(expected);
    }
    expect(observed).toHaveLength(3);
  });

  it('survives a throwing request without contaminating the next', async () => {
    mockGetApiKey.mockReturnValue('env_key');

    await expect(
      withRequestContext({ apiKey: 'doomed' }, async () => {
        throw new Error('handler blew up');
      })
    ).rejects.toThrow('handler blew up');

    expect(resolveApiKey()).toBe('env_key');
  });
});

describe('context immutability', () => {
  // A handler able to mutate the context could change the credential of the
  // request it is running inside.
  it('freezes the stored context', () => {
    withRequestContext({ apiKey: 'k' }, () => {
      const ctx = getRequestContext();
      expect(Object.isFrozen(ctx)).toBe(true);
      expect(resolveApiKey()).toBe('k');
    });
  });
});
