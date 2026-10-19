import { jest, describe, it, expect } from '@jest/globals';

// E-297: target_paths was joined into a shell string, so
// ["x; touch /tmp/marker; #"] ran under the user's shell.
const { rebuildCommand } = await import('../handlers/context-manifest.js');

describe('rebuild_manifest command (E-297)', () => {
  it('is a file and an argv array, never a shell string', () => {
    expect(rebuildCommand('incremental', ['web/src', 'api'])).toEqual({
      file: 'npx',
      args: ['tsx', 'scripts/context-manifest/update.ts', '--', '--paths', 'web/src,api'],
    });
    expect(rebuildCommand('full')).toEqual({ file: 'npx', args: ['tsx', 'scripts/context-manifest/generate.ts'] });
  });

  it('passes shell metacharacters as one literal argument', () => {
    const { args } = rebuildCommand('full', ['x; touch /tmp/marker; #']);
    expect(args.at(-1)).toBe('x; touch /tmp/marker; #');
  });

  it.each(['-rf', '--paths=/', '../etc', 'a/../../b', '/abs/path', 'a,b', '', 'a\0b'])(
    'refuses %j', (p) => {
      expect(() => rebuildCommand('full', [p])).toThrow('not a repo-relative path');
    },
  );

  it('rebuildManifest never spawns for a refused path', async () => {
    const { rebuildManifest } = await import('../handlers/context-manifest.js');
    const run = jest.fn();
    const result = await rebuildManifest({ target_paths: ['-rf'] }, run);
    expect(run).not.toHaveBeenCalled();
    // No local manifest in the test cwd answers first; either way nothing ran.
    expect(result.success).toBe(false);
  });
});
