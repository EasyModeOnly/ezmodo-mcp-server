/**
 * Where this server keeps per-user state on disk.
 *
 * Extracted so the credential reader and the OAuth token store cannot disagree
 * about where "the ezmodo config directory" is. They had better not: the two
 * files live side by side, and a writer that picks a different directory from
 * the reader produces a login that appears to succeed and then is never found
 * again.
 *
 * The pre-rebrand `.config/zephly` directory is no longer read (#2843).
 */

import { homedir } from 'os';
import { join } from 'path';

/**
 * The per-user config directory: `%APPDATA%/ezmodo` on Windows,
 * `~/.config/ezmodo` elsewhere.
 *
 * @returns {string}
 */
export function configDir() {
  const home = homedir();
  if (process.platform === 'win32') {
    return join(process.env.APPDATA || home, 'ezmodo');
  }
  return join(home, '.config', 'ezmodo');
}
