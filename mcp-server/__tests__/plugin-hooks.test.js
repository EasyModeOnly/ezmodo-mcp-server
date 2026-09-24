/**
 * The Claude Code plugin's commit hook (plugins/ezmodo/hooks), tested here
 * because this is the suite CI runs; the plugin directory has no test runner of
 * its own.
 *
 * #2658: the hook used to report the SESSION repo's HEAD and active task for a
 * commit made elsewhere (`cd ../infra && git commit`). The reminder exists so the
 * model does not question the SHA, which makes a wrong one worse than none.
 */

import { execFileSync, spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, realpathSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  findConfigDir,
  resolveCommitDir,
  splitCommands,
} from '../../plugins/ezmodo/hooks/lib.js';

const HOOK = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../plugins/ezmodo/hooks/link-commit-reminder.js'
);

// #2843: only .ezmodo/ marks a tracked repo; a pre-rebrand .zephly/ is ignored.
describe('findConfigDir', () => {
  let root;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ezmodo-hooks-cfg-')));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds .ezmodo/ walking up', () => {
    mkdirSync(join(root, '.ezmodo'));
    writeFileSync(join(root, '.ezmodo', 'config.json'), '{}');
    mkdirSync(join(root, 'sub'));
    expect(findConfigDir(join(root, 'sub'))).toBe(join(root, '.ezmodo'));
  });

  it('ignores a pre-rebrand .zephly/ directory', () => {
    mkdirSync(join(root, '.zephly'));
    writeFileSync(join(root, '.zephly', 'config.json'), '{}');
    expect(findConfigDir(root)).toBeNull();
  });
});

describe('splitCommands', () => {
  it('does not split on separators inside quotes', () => {
    expect(splitCommands('git commit -m "a && b; c"')).toEqual(['git commit -m "a && b; c"']);
  });

  it('drops heredoc bodies, which routinely mention cd and git commit', () => {
    const command = [
      "git commit -F - <<'EOF'",
      'fix: cd ../elsewhere && git commit is now handled',
      'EOF',
    ].join('\n');
    expect(splitCommands(command)).toEqual(['git commit -F -']);
  });

  it('unwraps a subshell', () => {
    expect(splitCommands('(cd infra && git commit -m x)')).toEqual(['cd infra', 'git commit -m x']);
  });
});

describe('resolveCommitDir', () => {
  const cwd = '/work/ezmodo';

  it('uses the session cwd for a plain commit', () => {
    expect(resolveCommitDir('git commit -m "x"', cwd)).toBe(cwd);
  });

  it('follows a cd before the commit', () => {
    expect(resolveCommitDir('cd ../emo-infra && git add -A && git commit -m x', cwd)).toBe(
      '/work/emo-infra'
    );
  });

  it('follows git -C, relative to any cd before it', () => {
    expect(resolveCommitDir('cd /work && git -C emo-infra commit -m x', cwd)).toBe('/work/emo-infra');
  });

  it('expands ~ and $HOME', () => {
    expect(resolveCommitDir('cd ~/dev/emo-infra && git commit -m x', cwd)).toBe(
      join(homedir(), 'dev/emo-infra')
    );
    expect(resolveCommitDir('cd $HOME/dev/x; git commit -m x', cwd)).toBe(join(homedir(), 'dev/x'));
  });

  it('ignores "cd" and "git commit" inside a commit message', () => {
    expect(resolveCommitDir('git commit -m "then cd /tmp && git commit again"', cwd)).toBe(cwd);
  });

  it('is null when there is no commit at all', () => {
    expect(resolveCommitDir('git log --grep commit', cwd)).toBeNull();
    expect(resolveCommitDir('echo "git commit"', cwd)).toBeNull();
  });

  it.each([
    ['command substitution', 'cd "$(git rev-parse --show-toplevel)" && git commit -m x'],
    ['an unknown variable', 'cd $REPO && git commit -m x'],
    ['cd -', 'cd - && git commit -m x'],
    ['--git-dir', 'git --git-dir=/x/.git commit -m x'],
  ])('is null for %s — cannot be known without a shell', (_, command) => {
    expect(resolveCommitDir(command, cwd)).toBeNull();
  });

  it('takes the LAST commit when there are several', () => {
    expect(resolveCommitDir('git commit -m a && cd ../b && git commit -m b', cwd)).toBe('/work/b');
  });
});

describe('link-commit-reminder, end to end', () => {
  let root;

  /** A git repo with one commit, an EzModo config and an active task. */
  function repo(name, taskNumber) {
    const dir = join(root, name);
    mkdirSync(join(dir, '.ezmodo'), { recursive: true });
    writeFileSync(join(dir, '.ezmodo', 'config.json'), '{}');
    writeFileSync(
      join(dir, '.ezmodo', 'active-session.json'),
      JSON.stringify({ taskId: `task-${name}`, taskNumber, title: `${name} work` })
    );
    const git = (...args) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    git('init', '-q', '-b', `branch-${name}`);
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', `${name} subject`);
    return { dir, sha: git('rev-parse', 'HEAD') };
  }

  function runHook(command, cwd) {
    const result = spawnSync('node', [HOOK], {
      input: JSON.stringify({ cwd, tool_input: { command }, tool_response: {} }),
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : '';
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ezmodo-hook-')));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reports the repo the commit ran in, not the session repo (#2658)', () => {
    const session = repo('ezmodo', 1);
    const other = repo('infra', 2);

    const text = runHook(`cd ${other.dir} && git commit -m "x"`, session.dir);

    expect(text).toContain(other.sha);
    expect(text).toContain('branch-infra');
    expect(text).toContain('task-infra');
    expect(text).not.toContain(session.sha);
    expect(text).not.toContain('task-ezmodo');
  });

  it('still reports the session repo for a plain commit', () => {
    const session = repo('ezmodo', 1);

    const text = runHook('git commit -m "x"', session.dir);

    expect(text).toContain(session.sha);
    expect(text).toContain('task-ezmodo');
  });

  it('stays silent rather than guess when the target cannot be resolved', () => {
    const session = repo('ezmodo', 1);

    expect(runHook('cd "$(mktemp -d)" && git commit -m x', session.dir)).toBe('');
  });
});
