import { TOOLS } from '../tools/index.js';
import { HANDLERS } from '../handlers/index.js';
import { LOCAL_ONLY_TOOLS, REMOTE_SAFE_TOOLS, isRemoteSafe } from '../lib/remote-tools.js';

describe('remote tool surface', () => {
  // The guard that makes the allowlist self-maintaining. A tool added without
  // a remote-safety decision fails here rather than being silently exposed —
  // or silently withheld — on the hosted connector.
  it('classifies every tool as either local-only or remote-safe', () => {
    const classified = new Set([...LOCAL_ONLY_TOOLS, ...REMOTE_SAFE_TOOLS]);
    const unclassified = TOOLS.map((t) => t.name).filter((name) => !classified.has(name));

    expect(unclassified).toEqual([]);
  });

  it('lists no tool that does not exist', () => {
    const real = new Set(TOOLS.map((t) => t.name));
    const phantom = [...LOCAL_ONLY_TOOLS, ...REMOTE_SAFE_TOOLS].filter((n) => !real.has(n));

    expect(phantom).toEqual([]);
  });

  it('never classifies a tool as both', () => {
    const remote = new Set(REMOTE_SAFE_TOOLS);
    expect(LOCAL_ONLY_TOOLS.filter((n) => remote.has(n))).toEqual([]);
  });

  // Named individually rather than as a count, because a count passes happily
  // if someone swaps one entry for another.
  it.each([
    'detect_git_repository',
    'get_current_project_context',
    'initialize_project_context',
    'manage_worktree',
    'list_project_worktrees',
    'rebuild_manifest',
  ])('refuses %s remotely', (tool) => {
    expect(isRemoteSafe(tool)).toBe(false);
  });

  // The worst of them: lib/git-helpers.js interpolates caller-supplied
  // branch names into execSync. Reachable over the internet that is arbitrary
  // command execution in the container.
  it('refuses the worktree tools, which shell out with caller-supplied arguments', () => {
    expect(isRemoteSafe('manage_worktree')).toBe(false);
    expect(isRemoteSafe('list_project_worktrees')).toBe(false);
  });

  // Guarding against an over-correction that would gut the connector.
  it.each([
    'manage_task',
    'get_task',
    'search_tasks',
    'manage_epic',
    'get_context',
    'resolve_concepts',
    'manage_document',
  ])('still serves %s remotely', (tool) => {
    expect(isRemoteSafe(tool)).toBe(true);
  });

  it('serves the great majority of tools remotely', () => {
    expect(REMOTE_SAFE_TOOLS.length).toBeGreaterThan(TOOLS.length * 0.9);
  });

  // Every excluded tool still has a handler — exclusion is a surface decision,
  // not a deletion. This is exactly why dispatch has to be filtered too.
  it('keeps handlers for excluded tools, which is why dispatch is also filtered', () => {
    for (const tool of LOCAL_ONLY_TOOLS) {
      expect(HANDLERS[tool]).toBeDefined();
    }
  });
});
