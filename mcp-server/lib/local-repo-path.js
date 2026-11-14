/**
 * Where in its repository the agent is working (E-328 #3694).
 *
 * get_design_system picks the theme that owns a repo-relative path: the
 * marketing theme for web/src/components/marketing/, the mobile one for
 * mobile/. The precise answer is the file the agent is about to write, and the
 * tool asks for it. When the agent passes none, the working directory relative
 * to the git root is the next best thing, as `.ezmodo/config.json` already
 * fills projectId (local-project.js).
 *
 * Returns undefined outside a git checkout (the remote connector), at the
 * repository root (which says nothing a default theme doesn't), and when the
 * directory somehow lies outside the root git reports.
 */
import fs from 'fs';
import path from 'path';
import { getRepositoryRoot } from './git-helpers.js';

export function localRepoPath(cwd = process.cwd()) {
  const root = getRepositoryRoot(cwd);
  if (!root) return undefined;
  let dir = cwd;
  let top = root;
  try {
    // git reports the resolved root; a cwd reached through a symlink would
    // otherwise come out as ../../somewhere.
    dir = fs.realpathSync(cwd);
    top = fs.realpathSync(root);
  } catch {
    // Keep the unresolved forms.
  }
  const rel = path.relative(top, dir).split(path.sep).join('/');
  if (!rel || rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)) return undefined;
  return rel;
}
