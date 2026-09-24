/**
 * Read the API key the `ezmodo` CLI already stored, when EZMODO_API_KEY is not
 * set.
 *
 * Why this exists: the Claude Code plugin launches this server through npx and
 * passes `${EZMODO_API_KEY:-}` from the environment. A user who has run
 * `ezmodo auth login` has a perfectly good key on disk and no idea they must
 * also export it, so their first run dies and Claude Code reports
 * `CONNECTION_CLOSED` — the server's own clear message goes to a stderr log
 * nobody opens (#2611).
 *
 * This is a FALLBACK, never a requirement. The CLI does not have to be
 * installed, nothing here throws, and an explicit EZMODO_API_KEY always wins:
 * an explicit credential must beat an implicit one, or overriding the key for
 * one project becomes impossible to reason about.
 *
 * It deliberately re-implements the CLI's read rather than importing it — this
 * package is published to npm and must not depend on the CLI being present.
 * The formats it reads are owned by cli/src/lib/auth-store.ts and
 * cli/src/lib/user-paths.ts; if those move, this goes stale and simply stops
 * finding anything, which is the safe direction to fail in.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
// Shared with lib/token-store.js so the two cannot disagree about where the
// ezmodo config directory is — they write files side by side there.
import { configDir } from './user-paths.js';

/** The Linux/Windows path: a 0600 JSON file written by `ezmodo auth login`. */
function fromCredentialsFile() {
  const path = join(configDir(), 'credentials');
  if (!existsSync(path)) return null;
  try {
    const key = JSON.parse(readFileSync(path, 'utf-8'))?.apiKey;
    if (typeof key === 'string' && key.trim()) return key.trim();
  } catch {
    // Unreadable or malformed — give up.
  }
  return null;
}

/**
 * The macOS path: the CLI stores in the login Keychain via the `security`
 * binary, so there is no file to read.
 *
 * Bounded by a timeout on purpose. Keychain items carry an ACL, and a read the
 * ACL does not allow can raise a GUI prompt — which, from a server started
 * headlessly by an editor, would be a worse failure than the one this whole
 * module exists to fix. The timeout means the worst case is a dialog that
 * disappears within two seconds and a fall through to "no key found", i.e.
 * exactly today's behaviour.
 */
function fromMacKeychain() {
  if (process.platform !== 'darwin') return null;
  try {
    const key = execFileSync(
      'security',
      ['find-generic-password', '-s', 'ezmodo-cli', '-a', 'api-key', '-w'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }
    ).trim();
    if (key) return key;
  } catch {
    // Not stored, no `security` binary, denied, or timed out. All of them
    // mean the same thing here: no key.
  }
  return null;
}

/**
 * The CLI's stored key, or null. Never throws.
 *
 * Returns `{ key, source }` so the caller can tell the user WHERE the
 * credential came from. A server that silently authenticates as someone the
 * user did not choose is worse than one that fails.
 */
export function readCliCredential() {
  try {
    const fileKey = fromCredentialsFile();
    if (fileKey) return { key: fileKey, source: 'ezmodo CLI credentials file' };

    const keychainKey = fromMacKeychain();
    if (keychainKey) return { key: keychainKey, source: 'macOS Keychain (ezmodo CLI)' };
  } catch {
    // Belt and braces. Nothing above should throw, and if something does, a
    // missing fallback must not take down the server.
  }
  return null;
}
