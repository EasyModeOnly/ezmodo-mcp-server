import { jest } from '@jest/globals';
import { mkdtempSync, readdirSync, statSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let tempHome;

const mockConfigDir = jest.fn();
jest.unstable_mockModule('../lib/user-paths.js', () => ({
  configDir: mockConfigDir,
}));

const { readTokens, writeTokens, clearTokens, isExpired, getTokenPath } = await import(
  '../lib/token-store.js'
);

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'ezmodo-tokens-'));
  mockConfigDir.mockReturnValue(join(tempHome, 'ezmodo'));
});

afterEach(() => rmSync(tempHome, { recursive: true, force: true }));

const validTokens = () => ({
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  email: 'someone@example.com',
});

describe('round trip', () => {
  it('writes then reads the same tokens back', () => {
    expect(writeTokens(validTokens())).toBe(true);
    expect(readTokens()).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
  });

  it('creates the config directory when it does not exist yet', () => {
    writeTokens(validTokens());
    expect(readTokens()).not.toBeNull();
  });

  it('stores 0600 — these are bearer tokens for the whole account', () => {
    writeTokens(validTokens());
    const mode = statSync(getTokenPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('leaves no temp file behind', () => {
    writeTokens(validTokens());
    const dir = join(tempHome, 'ezmodo');
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('degrading rather than throwing', () => {
  it('reports no tokens when the file is absent', () => {
    expect(readTokens()).toBeNull();
  });

  it('reports no tokens for malformed JSON instead of throwing', () => {
    // This sits on the path of every tool call. Corruption must send the user
    // through a sign-in that overwrites it, not take the server down.
    writeTokens(validTokens());
    writeFileSync(getTokenPath(), '{ not json');
    expect(() => readTokens()).not.toThrow();
    expect(readTokens()).toBeNull();
  });

  it('rejects a file with no usable access token', () => {
    writeTokens(validTokens());
    writeFileSync(getTokenPath(), JSON.stringify({ accessToken: '   ' }));
    expect(readTokens()).toBeNull();
  });
});

describe('isExpired', () => {
  it('treats a comfortably future expiry as live', () => {
    expect(isExpired({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toBe(false);
  });

  it('treats a past expiry as expired', () => {
    expect(isExpired({ expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(true);
  });

  it('expires EARLY, inside the margin — clock skew and flight time', () => {
    // A token that passes the check must still be valid when the request
    // lands, or we produce intermittent 401s that look like a server bug.
    expect(isExpired({ expiresAt: new Date(Date.now() + 5_000).toISOString() })).toBe(true);
  });

  it('treats missing or unparseable expiry as expired', () => {
    expect(isExpired(null)).toBe(true);
    expect(isExpired({})).toBe(true);
    expect(isExpired({ expiresAt: 'not a date' })).toBe(true);
  });
});

describe('clearTokens', () => {
  it('removes a stored login', () => {
    writeTokens(validTokens());
    expect(clearTokens()).toBe(true);
    expect(readTokens()).toBeNull();
  });

  it('is a no-op when there is nothing to clear', () => {
    expect(clearTokens()).toBe(true);
  });
});
