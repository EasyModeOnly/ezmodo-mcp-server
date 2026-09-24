import { jest } from '@jest/globals';

const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockExecFileSync = jest.fn();
const mockHomedir = jest.fn(() => '/home/tester');

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));
jest.unstable_mockModule('child_process', () => ({
  execFileSync: mockExecFileSync,
}));
jest.unstable_mockModule('os', () => ({
  homedir: mockHomedir,
}));

const { readCliCredential } = await import('../lib/cli-credential.js');

const realPlatform = process.platform;
function setPlatform(p) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockExecFileSync.mockImplementation(() => {
    throw new Error('not stored');
  });
  setPlatform('linux');
});

afterEach(() => setPlatform(realPlatform));

describe('readCliCredential — credentials file', () => {
  it('reads the key the CLI stored, and names its source', () => {
    mockExistsSync.mockImplementation((p) => p === '/home/tester/.config/ezmodo/credentials');
    mockReadFileSync.mockReturnValue(JSON.stringify({ apiKey: 'ezm_sk_realkey' }));

    expect(readCliCredential()).toEqual({
      key: 'ezm_sk_realkey',
      source: 'ezmodo CLI credentials file',
    });
  });

  // #2843: the pre-rebrand ~/.config/zephly directory is no longer read.
  it('ignores the pre-rebrand zephly directory', () => {
    mockExistsSync.mockImplementation((p) => p === '/home/tester/.config/zephly/credentials');
    mockReadFileSync.mockReturnValue(JSON.stringify({ apiKey: 'ezm_sk_legacy' }));

    expect(readCliCredential()).toBeNull();
  });

  it('returns null when there is no credentials file', () => {
    expect(readCliCredential()).toBeNull();
  });

  // Nothing here may throw: this runs during server startup, and a fallback
  // that crashes is worse than one that finds nothing.
  it('survives malformed JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ not json');
    expect(readCliCredential()).toBeNull();
  });

  it('survives an unreadable file', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('EACCES');
    });
    expect(readCliCredential()).toBeNull();
  });

  it('ignores a file with no apiKey, and an empty one', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ apiKey: '   ' }));
    expect(readCliCredential()).toBeNull();

    mockReadFileSync.mockReturnValue(JSON.stringify({ somethingElse: 'x' }));
    expect(readCliCredential()).toBeNull();
  });
});

describe('readCliCredential — macOS Keychain', () => {
  it('reads from the Keychain when there is no file', () => {
    setPlatform('darwin');
    mockExecFileSync.mockReturnValue('ezm_sk_keychain\n');

    expect(readCliCredential()).toEqual({
      key: 'ezm_sk_keychain',
      source: 'macOS Keychain (ezmodo CLI)',
    });
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'security',
      ['find-generic-password', '-s', 'ezmodo-cli', '-a', 'api-key', '-w'],
      expect.objectContaining({ timeout: 2000 })
    );
  });

  // A Keychain ACL can raise a GUI prompt. From a server started headlessly by
  // an editor, a modal that never returns would be a worse failure than the
  // missing key this module exists to fix, so the read must stay bounded.
  it('bounds the Keychain read with a timeout', () => {
    setPlatform('darwin');
    mockExecFileSync.mockReturnValue('ezm_sk_x');
    readCliCredential();
    const opts = mockExecFileSync.mock.calls[0][2];
    expect(opts.timeout).toBeGreaterThan(0);
    expect(opts.timeout).toBeLessThanOrEqual(5000);
  });

  it('reads only the ezmodo-cli service (#2843)', () => {
    setPlatform('darwin');
    readCliCredential();
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    expect(mockExecFileSync.mock.calls[0][1]).toContain('ezmodo-cli');
  });

  it('returns null when the Keychain read fails or times out', () => {
    setPlatform('darwin');
    expect(readCliCredential()).toBeNull();
  });

  it('never shells out on a non-darwin platform', () => {
    setPlatform('linux');
    readCliCredential();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });
});
