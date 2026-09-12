/**
 * Where this server keeps per-user state on disk.
 *
 * Extracted so the credential reader and the OAuth token store cannot disagree
 * about where "the ezmodo config directory" is. They had better not: the two
 * files live side by side, and a writer that picks a different directory from
 * the reader produces a login that appears to succeed and then is never found
 * again.
 *
 * `.config/ezmodo` is current, `.config/zephly` the pre-rebrand name still
 * present in older installs. Current always wins; legacy is READ-ONLY. Nothing
 * here ever writes to the legacy directory — migrating it is the CLI's job
 * (cli/src/lib/user-paths.ts owns that), and a second migrator racing the first
 * over the same files is worse than not migrating at all.
 */

import { homedir } from 'os';
import { join } from 'path';

/**
 * Every directory to SEARCH, current first.
 *
 * @returns {string[]}
 */
export function configDirs() {
  const home = homedir();
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || home;
    return [join(base, 'ezmodo'), join(base, 'zephly')];
  }
  return [join(home, '.config', 'ezmodo'), join(home, '.config', 'zephly')];
}

/**
 * The single directory to WRITE to. Always the current name.
 *
 * @returns {string}
 */
export function configDir() {
  return configDirs()[0];
}
