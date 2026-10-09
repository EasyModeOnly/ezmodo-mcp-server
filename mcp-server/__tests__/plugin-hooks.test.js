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
import { dirname, join, posix, resolve, win32 } from 'path';
import { fileURLToPath } from 'url';
import {
  findConfigDir,
  isConfigDirPath,
  repoRelativePath,
  resolveCommitDir,
  splitCommands,
} from '../../plugins/ezmodo/hooks/lib.js';

const HOOKS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../plugins/ezmodo/hooks');
const HOOK = join(HOOKS_DIR, 'link-commit-reminder.js');
const EDIT_HOOK = join(HOOKS_DIR, 'untracked-edit-reminder.js');

// The rules are path-module-specific, so each describe pins one: these run the
// same on every OS, and CI runs the file on Windows too (#3128).
const POSIX = { path: posix, home: '/home/dev' };
const WIN = { path: win32, home: 'C:\\Users\\dev' };

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

  it('splits on a lone & (cmd.exe sequencing, PowerShell call) but not on redirections', () => {
    expect(splitCommands('cd /d D:\\infra & git commit -m x')).toEqual(['cd /d D:\\infra', 'git commit -m x']);
    expect(splitCommands('& git commit -m x')).toEqual(['git commit -m x']);
    expect(splitCommands('git commit -m x 2>&1')).toEqual(['git commit -m x 2>&1']);
    expect(splitCommands('git commit -m x &>/dev/null')).toEqual(['git commit -m x &>/dev/null']);
  });
});

describe('resolveCommitDir (POSIX shells)', () => {
  const cwd = '/work/ezmodo';
  const resolveCommitDirPosix = (command, dir) => resolveCommitDir(command, dir, POSIX);

  it('uses the session cwd for a plain commit', () => {
    expect(resolveCommitDirPosix('git commit -m "x"', cwd)).toBe(cwd);
  });

  it('follows a cd before the commit', () => {
    expect(resolveCommitDirPosix('cd ../emo-infra && git add -A && git commit -m x', cwd)).toBe(
      '/work/emo-infra'
    );
  });

  it('follows git -C, relative to any cd before it', () => {
    expect(resolveCommitDirPosix('cd /work && git -C emo-infra commit -m x', cwd)).toBe('/work/emo-infra');
  });

  it('expands ~ and $HOME', () => {
    expect(resolveCommitDirPosix('cd ~/dev/emo-infra && git commit -m x', cwd)).toBe(
      '/home/dev/dev/emo-infra'
    );
    expect(resolveCommitDirPosix('cd $HOME/dev/x; git commit -m x', cwd)).toBe('/home/dev/dev/x');
    expect(resolveCommitDirPosix('cd ${HOME}/dev/x; git commit -m x', cwd)).toBe('/home/dev/dev/x');
  });

  it('defaults to the real home directory', () => {
    expect(resolveCommitDir('cd ~ && git commit -m x', cwd)).toBe(homedir());
  });

  it('treats /d as a directory, not a cmd.exe switch', () => {
    expect(resolveCommitDirPosix('cd /d && git commit -m x', cwd)).toBe('/d');
  });

  it('ignores "cd" and "git commit" inside a commit message', () => {
    expect(resolveCommitDirPosix('git commit -m "then cd /tmp && git commit again"', cwd)).toBe(cwd);
  });

  it('is null when there is no commit at all', () => {
    expect(resolveCommitDirPosix('git log --grep commit', cwd)).toBeNull();
    expect(resolveCommitDirPosix('echo "git commit"', cwd)).toBeNull();
  });

  it.each([
    ['command substitution', 'cd "$(git rev-parse --show-toplevel)" && git commit -m x'],
    ['an unknown variable', 'cd $REPO && git commit -m x'],
    ['cd -', 'cd - && git commit -m x'],
    ['--git-dir', 'git --git-dir=/x/.git commit -m x'],
  ])('is null for %s — cannot be known without a shell', (_, command) => {
    expect(resolveCommitDirPosix(command, cwd)).toBeNull();
  });

  it('takes the LAST commit when there are several', () => {
    expect(resolveCommitDirPosix('git commit -m a && cd ../b && git commit -m b', cwd)).toBe('/work/b');
  });
});

describe('resolveCommitDir (Windows shells, #3128)', () => {
  const cwd = 'C:\\work\\ezmodo';
  const resolveWin = (command) => resolveCommitDir(command, cwd, WIN);

  it('uses the session cwd for a plain commit', () => {
    expect(resolveWin('git commit -m "x"')).toBe(cwd);
  });

  it.each([
    ['a relative cd with forward slashes (Git Bash)', 'cd ../emo-infra && git commit -m x'],
    ['a relative cd with backslashes', 'cd ..\\emo-infra && git commit -m x'],
    ['an absolute drive path', 'cd C:\\work\\emo-infra && git commit -m x'],
    ['a quoted drive path', 'cd "C:\\work\\emo-infra" && git commit -m x'],
    ['a forward-slash drive path', 'cd C:/work/emo-infra && git commit -m x'],
    ['a Git Bash /c/ path', 'cd /c/work/emo-infra && git commit -m x'],
    ['cmd.exe cd /d and &', 'cd /d C:\\work\\emo-infra & git commit -m x'],
    ['PowerShell Set-Location', 'Set-Location C:\\work\\emo-infra; git commit -m x'],
    ['PowerShell Set-Location -Path', 'Set-Location -Path ..\\emo-infra; git commit -m x'],
    ['PowerShell Push-Location and the call operator', 'Push-Location ..\\emo-infra; & git commit -m x'],
    ['git.exe by full path', '& "C:\\Program Files\\Git\\cmd\\git.exe" -C ..\\emo-infra commit -m x'],
    ['git -C with backslashes', 'git -C ..\\emo-infra commit -m x'],
  ])('follows %s', (_, command) => {
    expect(resolveWin(command)).toBe('C:\\work\\emo-infra');
  });

  it('follows a change of drive', () => {
    expect(resolveWin('cd /d D:\\src\\infra & git commit -m x')).toBe('D:\\src\\infra');
    expect(resolveWin('cd /d/src/infra && git commit -m x')).toBe('D:\\src\\infra');
  });

  it.each([
    ['~', 'cd ~\\dev\\infra; git commit -m x'],
    ['~/ (Git Bash)', 'cd ~/dev/infra && git commit -m x'],
    ['$HOME', 'cd $HOME/dev/infra && git commit -m x'],
    ['$env:USERPROFILE', 'Set-Location $env:USERPROFILE\\dev\\infra; git commit -m x'],
    ['%USERPROFILE%', 'cd /d %USERPROFILE%\\dev\\infra & git commit -m x'],
  ])('expands %s to the home directory', (_, command) => {
    expect(resolveWin(command)).toBe('C:\\Users\\dev\\dev\\infra');
  });

  it.each([
    ['a PowerShell variable', 'Set-Location $env:REPO; git commit -m x'],
    ['a cmd.exe variable', 'cd /d %REPO% & git commit -m x'],
    ['a PowerShell escape', 'Set-Location C:\\work`\\infra; git commit -m x'],
    ['cd -', 'Set-Location -; git commit -m x'],
  ])('is null for %s', (_, command) => {
    expect(resolveWin(command)).toBeNull();
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

// #3128: the edit hook matched `.ezmodo/` against path.relative()'s output with
// a forward-slash pattern, and on Windows that output uses backslashes.
describe('repoRelativePath / isConfigDirPath', () => {
  it.each([
    ['POSIX absolute', posix, '/work/repo', '/work/repo/.ezmodo/config.json', '.ezmodo/config.json'],
    ['POSIX relative', posix, '/work/repo', 'web/src/a.ts', 'web/src/a.ts'],
    ['Windows absolute', win32, 'C:\\work\\repo', 'C:\\work\\repo\\.ezmodo\\config.json', '.ezmodo/config.json'],
    ['Windows forward slashes', win32, 'C:\\work\\repo', 'C:/work/repo/web/src/a.ts', 'web/src/a.ts'],
    ['Windows relative', win32, 'C:\\work\\repo', '.ezmodo\\active-session.json', '.ezmodo/active-session.json'],
    ['Windows drive-letter case', win32, 'C:\\work\\repo', 'c:\\work\\repo\\api\\main.go', 'api/main.go'],
  ])('normalises %s paths to forward slashes', (_, p, cwd, file, expected) => {
    expect(repoRelativePath(file, cwd, p)).toBe(expected);
  });

  it.each([
    ['POSIX parent', posix, '/work/repo', '/work/other/a.ts'],
    ['Windows parent', win32, 'C:\\work\\repo', 'C:\\work\\other\\a.ts'],
    ['Windows other drive', win32, 'C:\\work\\repo', 'D:\\work\\repo\\a.ts'],
  ])('is null outside the repo (%s)', (_, p, cwd, file) => {
    expect(repoRelativePath(file, cwd, p)).toBeNull();
  });

  it('does not mistake a "..name" directory for the parent', () => {
    expect(repoRelativePath('/work/repo/..cache/a', '/work/repo', posix)).toBe('..cache/a');
  });

  it('recognises the config dir at the root and nested, and nothing else', () => {
    expect(isConfigDirPath('.ezmodo/config.json')).toBe(true);
    expect(isConfigDirPath('sub/.ezmodo/active-session.json')).toBe(true);
    expect(isConfigDirPath('.ezmodo')).toBe(true);
    expect(isConfigDirPath('docs/ezmodo/notes.md')).toBe(false);
    expect(isConfigDirPath('.ezmodo-old/x')).toBe(false);
  });
});

// Runs the real hook with this OS's paths, so on Windows CI it exercises the
// backslash case end to end.
describe('untracked-edit-reminder, end to end', () => {
  let root;
  let sessionId;

  function runEditHook(filePath) {
    const result = spawnSync('node', [EDIT_HOOK], {
      input: JSON.stringify({ cwd: root, session_id: sessionId, tool_input: { file_path: filePath } }),
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : '';
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ezmodo-edit-hook-')));
    mkdirSync(join(root, '.ezmodo'));
    writeFileSync(join(root, '.ezmodo', 'config.json'), '{}');
    sessionId = `test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(join(tmpdir(), 'ezmodo-plugin-hooks', `untracked-${sessionId}`), { force: true });
  });

  it('stays silent for an edit inside .ezmodo/', () => {
    expect(runEditHook(join(root, '.ezmodo', 'config.json'))).toBe('');
  });

  it('stays silent for an edit outside the repo', () => {
    expect(runEditHook(join(dirname(root), 'elsewhere.txt'))).toBe('');
  });

  it('reminds once about an untracked edit to code', () => {
    expect(runEditHook(join(root, 'src', 'a.js'))).toContain('no task is active');
    expect(runEditHook(join(root, 'src', 'b.js'))).toBe('');
  });

  it('stays silent while a task is active', () => {
    writeFileSync(join(root, '.ezmodo', 'active-session.json'), JSON.stringify({ taskId: 't' }));
    expect(runEditHook(join(root, 'src', 'a.js'))).toBe('');
  });
});
