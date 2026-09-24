/**
 * Manifest delta — turning a commit into the change it makes to the context
 * manifest.
 *
 * The API is the manifest's only source of truth. Nothing regenerates it on
 * push any more, so it stays current because every `link_commit` also sends the
 * commit's effect on it: deleted files leave, renamed files keep their summary
 * under the new path, and added or modified files are upserted (the server
 * creates missing entries with inferred defaults and keeps existing fields).
 *
 * Everything here except loadManifestScope is pure, so the whole mapping is
 * testable without git or a filesystem. The handler only wires it together.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { CURRENT_REPO_CONFIG_DIR } from './repo-config-dir.js';

/** How many already-summarised paths to ask the agent to re-check. */
export const REVIEW_SUMMARY_CAP = 15;

export const MANIFEST_FOLLOW_UP_INSTRUCTION =
  'Call update_manifest_entries with a summary of at most 200 words (intent, key behaviours, ' +
  'integrations, gotchas) for every path in needsSummary, and for a path in reviewSummary only ' +
  'if this commit changed what that file does.';

export const MANIFEST_MISSING_MESSAGE =
  'project has no manifest yet — generate one with the desktop app or rebuild_manifest';

// ============================================================================
// Scope: which paths belong in the manifest
// ============================================================================

const DEFAULT_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor', '__snapshots__',
]);

const DEFAULT_EXCLUDED_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock',
  'go.sum', 'Cargo.lock', 'pubspec.lock', 'Gemfile.lock', 'poetry.lock', 'composer.lock',
  '.DS_Store',
]);

const BINARY_EXTENSION = new RegExp(
  '\\.(png|jpe?g|gif|webp|ico|bmp|tiff?|svg|pdf|zip|gz|tgz|tar|7z|rar|jar|war|class|so|dylib|dll|exe|bin|' +
  'wasm|woff2?|ttf|otf|eot|mp[34]|mov|avi|webm|wav|ogg|psd|sketch|fig|map)$',
  'i'
);

/**
 * The fallback scope when a repo has no manifest config: anything that is not
 * obviously generated, vendored, a lockfile or a binary.
 *
 * @param {string} filePath - Repo-relative path
 * @returns {boolean}
 */
export function isLikelySourcePath(filePath) {
  if (!filePath) return false;
  const segments = filePath.split('/');
  const basename = segments[segments.length - 1];
  if (segments.slice(0, -1).some(segment => DEFAULT_EXCLUDED_DIRS.has(segment))) return false;
  if (DEFAULT_EXCLUDED_FILES.has(basename)) return false;
  if (/\.min\.(js|css)$/i.test(basename)) return false;
  return !BINARY_EXTENSION.test(basename);
}

function escapeRegExp(text) {
  return text.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

/**
 * Convert a manifest-config glob to a RegExp. Supports what those configs use:
 * `**` (any depth, including none), `*` and `?` within one segment, and
 * `{a,b}` alternation. Patterns are anchored to the repo root, so `*.md`
 * matches README.md but not docs/x.md — the same as the generator's globbing.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let pattern = '';
  let i = 0;
  let braceDepth = 0;
  while (i < glob.length) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        const atSegmentStart = i === 0 || glob[i - 1] === '/';
        if (glob[i + 2] === '/' && atSegmentStart) {
          pattern += '(?:.*/)?';
          i += 3;
          continue;
        }
        pattern += '.*';
        i += 2;
        continue;
      }
      pattern += '[^/]*';
    } else if (char === '?') {
      pattern += '[^/]';
    } else if (char === '{') {
      braceDepth++;
      pattern += '(?:';
    } else if (char === '}' && braceDepth > 0) {
      braceDepth--;
      pattern += ')';
    } else if (char === ',' && braceDepth > 0) {
      pattern += '|';
    } else {
      pattern += escapeRegExp(char);
    }
    i++;
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * Build a scope predicate from a manifest config's include/exclude globs.
 * With no include list at all, falls back to isLikelySourcePath (still minus
 * any configured excludes).
 *
 * @param {{include?: string[], exclude?: string[]}|null} config
 * @returns {(path: string) => boolean}
 */
export function createScopeMatcher(config) {
  const include = Array.isArray(config?.include) ? config.include.map(globToRegExp) : null;
  const exclude = Array.isArray(config?.exclude) ? config.exclude.map(globToRegExp) : [];
  return (filePath) => {
    if (!filePath) return false;
    if (exclude.some(re => re.test(filePath))) return false;
    if (include && include.length > 0) return include.some(re => re.test(filePath));
    return isLikelySourcePath(filePath);
  };
}

/**
 * Read the repo's manifest config (`.ezmodo/manifest/config.json`). Returns
 * null when there is none or it is unreadable —
 * the caller then uses the default scope.
 *
 * @param {string} repoRoot
 * @returns {{include?: string[], exclude?: string[]}|null}
 */
export function loadManifestScope(repoRoot) {
  if (!repoRoot) return null;
  try {
    const configPath = join(repoRoot, CURRENT_REPO_CONFIG_DIR, 'manifest', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
    return { include: parsed.include, exclude: parsed.exclude };
  } catch {
    return null; // missing or unreadable
  }
}

// ============================================================================
// Delta: name-status → apply-changes request body
// ============================================================================

/**
 * Map a commit's name-status onto a manifest change set.
 *
 * A rename is only a rename when both ends are in scope. Renaming a file INTO
 * scope makes it new to the manifest (upsert); renaming it OUT of scope makes
 * it gone (delete).
 *
 * @param {Array<{status: string, path: string, from?: string, similarity?: number}>} changes
 * @param {(path: string) => boolean} [inScope] - Defaults to everything
 * @returns {{upserts: Array<{path: string}>, deletes: string[], renames: Array<{from: string, to: string}>}}
 */
export function buildManifestDelta(changes, inScope = () => true) {
  const upserts = [];
  const deletes = [];
  const renames = [];
  const seenUpserts = new Set();

  const upsert = (path) => {
    if (seenUpserts.has(path)) return;
    seenUpserts.add(path);
    upserts.push({ path });
  };

  for (const change of changes || []) {
    if (!change?.path) continue;
    switch (change.status) {
    case 'A':
    case 'M':
      if (inScope(change.path)) upsert(change.path);
      break;
    case 'D':
      if (inScope(change.path)) deletes.push(change.path);
      break;
    case 'R': {
      const fromIn = Boolean(change.from) && inScope(change.from);
      const toIn = inScope(change.path);
      if (fromIn && toIn) {
        renames.push({ from: change.from, to: change.path });
        // A rename with edits (similarity < 100%) changed the content too.
        if (change.similarity !== 100) upsert(change.path);
      } else if (toIn) {
        upsert(change.path);
      } else if (fromIn) {
        deletes.push(change.from);
      }
      break;
    }
    default:
      break;
    }
  }

  return { upserts, deletes, renames };
}

/** Whether a delta would change anything. */
export function isEmptyDelta(delta) {
  return !delta || (delta.upserts.length === 0 && delta.deletes.length === 0 && delta.renames.length === 0);
}

// ============================================================================
// Result: apply-changes response → what link_commit tells the agent
// ============================================================================

/**
 * Shape the server's apply-changes result into the `manifest` field of a
 * link_commit response: what changed, and what the agent should now write.
 *
 * `reviewSummary` is the paths the commit modified that already carried a
 * summary — worth a look, but only rewritten if the file's behaviour changed.
 *
 * @param {object} result - apply-changes response
 * @returns {object}
 */
export function summarizeManifestResult(result) {
  if (result?.manifestMissing) {
    return { skipped: MANIFEST_MISSING_MESSAGE };
  }
  const needsSummary = result?.needsSummary || [];
  const needs = new Set(needsSummary);
  const reviewSummary = (result?.updated || [])
    .filter(path => !needs.has(path))
    .slice(0, REVIEW_SUMMARY_CAP);

  const shaped = {
    created: result?.created || [],
    deleted: result?.deleted || [],
    renamed: result?.renamed || [],
    needsSummary,
    reviewSummary,
  };
  if (needsSummary.length > 0 || reviewSummary.length > 0) {
    shaped.instruction = MANIFEST_FOLLOW_UP_INSTRUCTION;
  }
  return shaped;
}
