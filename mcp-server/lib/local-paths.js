/**
 * Confinement for paths a tool reads or writes on the machine running the
 * server (E-297). Tool arguments and API data are attacker-influenced — a
 * prompt-injected agent locally, any signed-in user over the connector — so a
 * path from either must be proved to stay inside the checkout before it is
 * touched. `path.resolve` alone proves nothing: it happily resolves
 * `../../.ssh/id_rsa` or an absolute path anywhere on disk.
 */
import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { findConfigPath } from './local-cache.js';

/** Whether `target` is `root` itself or below it. Both must be absolute. */
export function isInside(root, target) {
  const rel = path.relative(root, target);
  if (rel === '') return true;
  return !path.isAbsolute(rel) && rel.split(path.sep)[0] !== '..';
}

/**
 * The directory local tools may read from: the checkout that holds
 * `.ezmodo/config.json`, or the working directory when there is none.
 */
export async function localRoot() {
  const configPath = await findConfigPath();
  return configPath ? path.dirname(path.dirname(configPath)) : process.cwd();
}

/**
 * Resolve a caller-supplied path (relative to `root`, or absolute) to the real
 * file it names, following symlinks, and refuse it unless that file is inside
 * `root`. Following symlinks matters: a link inside the checkout pointing at
 * ~/.ssh passes a lexical check.
 */
export async function resolveInsideRoot(candidate, root, realpath = fs.realpath) {
  if (typeof candidate !== 'string' || candidate === '' || candidate.includes('\0')) {
    throw new Error('A file path is required');
  }
  const realRoot = await realpath(root);
  const real = await realpath(path.resolve(realRoot, candidate));
  if (!isInside(realRoot, real)) {
    throw new Error(
      `${candidate} is outside the project checkout (${realRoot}); ` +
        'only files inside it can be read. Pass the content inline instead.'
    );
  }
  return real;
}

// O_NOFOLLOW makes open() fail on a symlink in the LAST path component, with
// no window between checking and opening. Windows has no such flag (0 there);
// it also does not let an unprivileged user create symlinks by default.
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;

function symlinkRefusal(file, err) {
  if (err.code === 'ELOOP' || err.code === 'EMLINK') {
    return new Error(`${file} is a symlink; refusing to follow it`);
  }
  return err;
}

/** A file's text, null when it doesn't exist; refuses to read through a symlink. */
export async function readFileNoFollow(file) {
  let handle;
  try {
    handle = await fs.open(file, fsConstants.O_RDONLY | NOFOLLOW);
    return await handle.readFile('utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw symlinkRefusal(file, err);
  } finally {
    await handle?.close();
  }
}

/** Write text to a file, creating or truncating it; refuses to write through a symlink. */
export async function writeFileNoFollow(file, text) {
  let handle;
  try {
    handle = await fs.open(
      file,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC | NOFOLLOW,
      0o644,
    );
    await handle.writeFile(text, 'utf-8');
  } catch (err) {
    throw symlinkRefusal(file, err);
  } finally {
    await handle?.close();
  }
}

/**
 * Create `dir` if needed, then prove it is a real directory inside `root`.
 * A committed `.ezmodo/designs/x -> ~/.ssh` would otherwise turn every file
 * written "into x" into a write into ~/.ssh, and O_NOFOLLOW only guards the
 * last component.
 */
export async function ensureDirInside(dir, root) {
  await fs.mkdir(dir, { recursive: true });
  const [realDir, realRoot] = await Promise.all([fs.realpath(dir), fs.realpath(root)]);
  if (!isInside(realRoot, realDir)) {
    throw new Error(`${dir} resolves outside ${root}; refusing to use it`);
  }
  return realDir;
}

/**
 * `.ezmodo/<name>` for the current checkout, or null when there is none. The
 * directory must resolve inside the checkout itself: a committed
 * `.ezmodo/designs -> /somewhere` is refused rather than written into.
 */
export async function ezmodoSubdir(name) {
  const configPath = await findConfigPath();
  if (!configPath) return null;
  const dir = path.join(path.dirname(configPath), name);
  await ensureDirInside(dir, path.dirname(path.dirname(configPath)));
  return dir;
}
