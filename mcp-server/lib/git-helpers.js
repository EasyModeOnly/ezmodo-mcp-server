/**
 * Git Helper Functions
 * Utility functions for git operations used by worktree tools
 */

import { execFileSync } from 'child_process';

/**
 * Run git with an ARGUMENT ARRAY — never a command string, and never a shell.
 *
 * This used to be `execSync(command)`, with callers building the command by
 * interpolating branch names and paths into a template. #2614 stopped the
 * remote transport from reaching any of it, which removed the internet-facing
 * blast radius; this closes the hole itself, so the same mistake cannot be made
 * again by a future caller who is not thinking about shells.
 *
 * execFileSync spawns git directly, so the arguments are passed as-is: a value
 * containing `;`, a backtick or a quote is a literal branch name that git will
 * simply not find, rather than a second command. Nothing in this file quotes
 * anything any more, because there is no shell left to quote for.
 *
 * @param {string[]} args - Arguments to git, one element per argument
 * @param {string} cwd - Working directory
 * @returns {string} Command output, trimmed
 */
export function execGit(args, cwd) {
  if (!Array.isArray(args)) {
    throw new TypeError('execGit takes an argument array, not a command string');
  }
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
  } catch (error) {
    throw new Error(`Git command failed: git ${args.join(' ')}\n${error.message}`);
  }
}

/**
 * Reject a value that git would read as an OPTION rather than as a name.
 *
 * The residual risk after dropping the shell is not injection, it is option
 * injection: `--exec=...` in a branch-name position is still one argument, and
 * git still honours it. Callers pass user-supplied refs and paths, so the
 * values that land in those positions are checked here.
 *
 * @param {string} value - The candidate branch name, ref or path
 * @param {string} label - What it is, for the error message
 * @returns {string} The value, unchanged
 */
function assertNotOption(value, label) {
  if (typeof value !== 'string' || value.startsWith('-')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

/**
 * Check if directory is a git repository
 * @param {string} dir - Directory path
 * @returns {boolean}
 */
export function isGitRepository(dir) {
  try {
    execGit(['rev-parse', '--git-dir'], dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get repository root directory
 * @param {string} dir - Directory path
 * @returns {string|null} Repository root path or null
 */
export function getRepositoryRoot(dir) {
  try {
    return execGit(['rev-parse', '--show-toplevel'], dir);
  } catch {
    return null;
  }
}

/**
 * Get remote URL for repository
 * @param {string} repoPath - Repository path
 * @returns {string|null} Remote URL or null
 */
export function getRemoteUrl(repoPath) {
  try {
    return execGit(['config', '--get', 'remote.origin.url'], repoPath);
  } catch {
    return null;
  }
}

/**
 * Get current branch name
 * @param {string} repoPath - Repository path
 * @returns {string|null} Branch name or null
 */
export function getCurrentBranch(repoPath) {
  try {
    return execGit(['branch', '--show-current'], repoPath);
  } catch {
    return null;
  }
}

/**
 * Check if branch exists (local or remote)
 * @param {string} repoPath - Repository path
 * @param {string} branchName - Branch name
 * @returns {object} { local: boolean, remote: boolean }
 */
export function branchExists(repoPath, branchName) {
  const result = { local: false, remote: false };

  assertNotOption(branchName, 'branch name');

  try {
    execGit(['show-ref', '--verify', `refs/heads/${branchName}`], repoPath);
    result.local = true;
  } catch {
    // Branch doesn't exist locally
  }

  try {
    execGit(['show-ref', '--verify', `refs/remotes/origin/${branchName}`], repoPath);
    result.remote = true;
  } catch {
    // Branch doesn't exist remotely
  }

  return result;
}

/**
 * Create a new branch from base branch
 * @param {string} repoPath - Repository path
 * @param {string} branchName - New branch name
 * @param {string} baseBranch - Base branch to branch from
 * @returns {string} Commit hash
 */
export function createBranch(repoPath, branchName, baseBranch) {
  assertNotOption(branchName, 'branch name');
  assertNotOption(baseBranch, 'base branch');

  // Ensure base branch is up to date
  try {
    execGit(['fetch', 'origin', baseBranch], repoPath);
  } catch {
    // Fetch might fail if no remote, that's ok
  }

  // Create branch
  execGit(['branch', branchName, baseBranch], repoPath);

  // Get commit hash
  return execGit(['rev-parse', branchName], repoPath);
}

/**
 * Create a worktree
 * @param {string} repoPath - Repository path
 * @param {string} worktreePath - Path for new worktree
 * @param {string} branchName - Branch name
 * @param {boolean} createBranch - Whether to create the branch
 * @returns {void}
 */
export function createWorktree(repoPath, worktreePath, branchName, createBranch = false) {
  assertNotOption(worktreePath, 'worktree path');
  assertNotOption(branchName, 'branch name');

  // `git worktree add -b <new-branch> <path>` — the branch name comes FIRST
  // after -b. The string-building version had it the other way round
  // (`add -b "<path>" <branch>`), so git read the path as the branch name and
  // refused it. Nothing caught that because every caller in worktree-tools.js
  // passes createBranch = false, having created the branch already; this path
  // has never worked. Corrected here rather than left as a trap, since the
  // whole point of moving to an argument array is that the arguments are now
  // legible.
  execGit(
    createBranch
      ? ['worktree', 'add', '-b', branchName, worktreePath]
      : ['worktree', 'add', worktreePath, branchName],
    repoPath
  );
}

/**
 * List all worktrees
 * @param {string} repoPath - Repository path
 * @returns {Array<{path: string, branch: string, commit: string}>}
 */
export function listWorktrees(repoPath) {
  try {
    const output = execGit(['worktree', 'list', '--porcelain'], repoPath);
    const worktrees = [];
    const lines = output.split('\n');

    let current = {};
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) {
          worktrees.push(current);
        }
        current = { path: line.substring(9) };
      } else if (line.startsWith('HEAD ')) {
        current.commit = line.substring(5);
      } else if (line.startsWith('branch ')) {
        current.branch = line.substring(7).replace('refs/heads/', '');
      } else if (line.startsWith('detached')) {
        current.branch = null;
      }
    }

    if (current.path) {
      worktrees.push(current);
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Remove a worktree
 * @param {string} repoPath - Repository path
 * @param {string} worktreePath - Worktree path to remove
 * @param {boolean} force - Force removal even with uncommitted changes
 * @returns {void}
 */
export function removeWorktree(repoPath, worktreePath, force = false) {
  assertNotOption(worktreePath, 'worktree path');

  execGit(['worktree', 'remove', ...(force ? ['--force'] : []), worktreePath], repoPath);
}

/**
 * Get git status for a worktree
 * @param {string} worktreePath - Worktree path
 * @returns {object} Status information
 */
export function getWorktreeStatus(worktreePath) {
  const status = {
    isDirty: false,
    hasUntracked: false,
    hasStaged: false,
    hasUnstaged: false,
    files: [],
  };

  try {
    const output = execGit(['status', '--porcelain'], worktreePath);

    if (output) {
      status.isDirty = true;
      const lines = output.split('\n').filter(l => l);

      for (const line of lines) {
        const statusCode = line.substring(0, 2);
        const file = line.substring(3);

        status.files.push({ status: statusCode, file });

        if (statusCode.trim().startsWith('?')) {
          status.hasUntracked = true;
        } else if (statusCode[0] !== ' ') {
          status.hasStaged = true;
        } else if (statusCode[1] !== ' ') {
          status.hasUnstaged = true;
        }
      }
    }
  } catch {
    // Error getting status
  }

  return status;
}

/**
 * Get commits ahead/behind counts
 * @param {string} worktreePath - Worktree path
 * @param {string} localBranch - Local branch name
 * @param {string} remoteBranch - Remote branch name (e.g., 'origin/main')
 * @returns {object} { ahead: number, behind: number }
 */
export function getAheadBehindCounts(worktreePath, localBranch, remoteBranch) {
  const counts = { ahead: 0, behind: 0 };

  try {
    assertNotOption(localBranch, 'local branch');
    assertNotOption(remoteBranch, 'remote branch');

    // Fetch latest
    execGit(['fetch', 'origin'], worktreePath);

    // Get ahead count
    const aheadOutput = execGit(
      ['rev-list', '--count', `${remoteBranch}..${localBranch}`],
      worktreePath
    );
    counts.ahead = parseInt(aheadOutput, 10) || 0;

    // Get behind count
    const behindOutput = execGit(
      ['rev-list', '--count', `${localBranch}..${remoteBranch}`],
      worktreePath
    );
    counts.behind = parseInt(behindOutput, 10) || 0;
  } catch {
    // Can't determine ahead/behind, remote might not exist
  }

  return counts;
}

/**
 * Check if branch has conflicts
 * @param {string} worktreePath - Worktree path
 * @returns {object} { hasConflicts: boolean, files: string[] }
 */
export function checkForConflicts(worktreePath) {
  const result = { hasConflicts: false, files: [] };

  try {
    const output = execGit(['status', '--porcelain'], worktreePath);
    const lines = output.split('\n').filter(l => l);

    for (const line of lines) {
      const statusCode = line.substring(0, 2);
      const file = line.substring(3);

      // UU = both modified (unmerged)
      // AA = both added
      // DD = both deleted
      if (statusCode === 'UU' || statusCode === 'AA' || statusCode === 'DD') {
        result.hasConflicts = true;
        result.files.push(file);
      }
    }
  } catch {
    // Error checking conflicts
  }

  return result;
}

/**
 * Delete a branch
 * @param {string} repoPath - Repository path
 * @param {string} branchName - Branch name to delete
 * @param {boolean} force - Force deletion
 * @returns {void}
 */
export function deleteBranch(repoPath, branchName, force = false) {
  assertNotOption(branchName, 'branch name');

  execGit(['branch', force ? '-D' : '-d', branchName], repoPath);
}

/**
 * Check if branch is merged into base branch
 * @param {string} repoPath - Repository path
 * @param {string} branchName - Branch to check
 * @param {string} baseBranch - Base branch
 * @returns {boolean}
 */
export function isBranchMerged(repoPath, branchName, baseBranch) {
  try {
    assertNotOption(baseBranch, 'base branch');

    const output = execGit(['branch', '--merged', baseBranch], repoPath);
    return output.includes(branchName);
  } catch {
    return false;
  }
}

/**
 * Get last commit info for a branch
 * @param {string} repoPath - Repository path
 * @param {string} branchName - Branch name
 * @returns {object|null} { hash, author, date, message }
 */
export function getLastCommit(repoPath, branchName) {
  try {
    assertNotOption(branchName, 'branch name');

    const hash = execGit(['rev-parse', branchName], repoPath);
    const author = execGit(['log', '-1', '--format=%an', branchName], repoPath);
    const timestamp = execGit(['log', '-1', '--format=%ct', branchName], repoPath);
    const message = execGit(['log', '-1', '--format=%s', branchName], repoPath);

    return {
      hash,
      author,
      date: new Date(parseInt(timestamp, 10) * 1000),
      message,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a branch name from task metadata
 * @param {object} task - Task object
 * @param {string} defaultPrefix - Default prefix if can't determine from labels
 * @returns {string} Branch name
 */
export function generateBranchName(task, defaultPrefix = 'feature') {
  // Determine prefix from labels
  let prefix = defaultPrefix;
  if (task.labels && task.labels.length > 0) {
    const labels = task.labels.map(l => l.toLowerCase());
    if (labels.includes('bug') || labels.includes('fix')) {
      prefix = 'fix';
    } else if (labels.includes('refactor') || labels.includes('refactoring')) {
      prefix = 'refactor';
    } else if (labels.includes('docs') || labels.includes('documentation')) {
      prefix = 'docs';
    } else if (labels.includes('feature')) {
      prefix = 'feature';
    }
  }

  // Slugify title (max 50 chars)
  const slug = task.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
    .replace(/-+$/, ''); // Remove trailing dashes

  // Format: {prefix}/{task-id}-{slug}
  return `${prefix}/${task.id}-${slug}`;
}

/**
 * Find the merge base between two branches (where they diverged)
 * @param {string} repoPath - Repository path
 * @param {string} branch1 - First branch
 * @param {string} branch2 - Second branch
 * @returns {string|null} Merge base commit hash or null
 */
export function getMergeBase(repoPath, branch1, branch2) {
  try {
    assertNotOption(branch1, 'branch');
    assertNotOption(branch2, 'branch');

    return execGit(['merge-base', branch1, branch2], repoPath);
  } catch {
    return null;
  }
}

/**
 * Detect the default branch (main or master)
 * @param {string} repoPath - Repository path
 * @returns {string} Default branch name
 */
export function getDefaultBranch(repoPath) {
  // Try to get from remote HEAD
  try {
    const ref = execGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoPath);
    return ref.replace('refs/remotes/origin/', '');
  } catch {
    // Fall back to checking if main or master exists
    try {
      execGit(['show-ref', '--verify', 'refs/heads/main'], repoPath);
      return 'main';
    } catch {
      try {
        execGit(['show-ref', '--verify', 'refs/heads/master'], repoPath);
        return 'master';
      } catch {
        return 'main'; // Default fallback
      }
    }
  }
}

/**
 * Get commits since a specific commit hash
 * @param {string} repoPath - Repository path
 * @param {string} sinceCommit - Commit hash to start from (exclusive)
 * @param {string} branchName - Branch name to get commits from
 * @returns {Array<{sha: string, shortSha: string, author: string, email: string, timestamp: Date, message: string}>}
 */
export function getCommitsSince(repoPath, sinceCommit, branchName) {
  try {
    // Format: hash|short|author|email|timestamp|subject
    assertNotOption(branchName, 'branch name');
    if (sinceCommit) {
      assertNotOption(sinceCommit, 'commit');
    }

    // No quotes around the format: there is no shell to strip them, so a
    // quoted format string would reach git verbatim and appear in the output.
    const format = '%H|%h|%an|%ae|%ct|%s';
    const range = sinceCommit ? `${sinceCommit}..${branchName}` : branchName;

    const output = execGit(['log', `--format=${format}`, range], repoPath);

    if (!output) {
      return [];
    }

    return output.split('\n').filter(line => line).map(line => {
      const [sha, shortSha, author, email, timestamp, message] = line.split('|');
      return {
        sha,
        shortSha,
        author,
        email,
        timestamp: new Date(parseInt(timestamp, 10) * 1000),
        message,
      };
    });
  } catch {
    // If the sinceCommit doesn't exist (maybe it was force-pushed away), return empty
    return [];
  }
}

/**
 * A commit SHA, and nothing else. Kept after execGit stopped using a shell
 * (#2614 step 5): it is still the cheapest way to tell a real hash from a ref
 * that would make diff-tree mean something other than "this commit".
 */
const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

/**
 * Get the files a commit changed.
 *
 * This is what makes auto-linking work without anyone remembering to pass a
 * file list: the commit's file set is a FACT recorded in the repository, not
 * something a caller should have to supply. The API cannot read it — it has no
 * clone and, measured on 2026-07-27, zero git installations — but the MCP
 * server runs in the working tree where the commit was just made, so here it is
 * one command away.
 *
 * Merge commits report no files (diff-tree without -m is empty for them), which
 * is the honest answer: a merge introduces no changes of its own.
 *
 * @param {string} repoPath - Repository path
 * @param {string} sha - Full or abbreviated commit hash
 * @returns {string[]} Repo-relative paths, or [] if anything at all went wrong
 */
export function getCommitFiles(repoPath, sha) {
  if (!repoPath || !sha || !SHA_PATTERN.test(sha)) {
    return [];
  }
  try {
    const output = execGit(
      ['diff-tree', '--no-commit-id', '--name-only', '-r', sha],
      repoPath
    );
    return output ? output.split('\n').map(line => line.trim()).filter(Boolean) : [];
  } catch {
    // Unknown SHA, shallow clone, not a repo — all mean "cannot derive", never
    // "fail the commit link".
    return [];
  }
}

/**
 * Get the remote URL formatted for commit links
 * @param {string} repoPath - Repository path
 * @returns {string|null} Base URL for commit links (e.g., "https://github.com/org/repo")
 */
export function getCommitUrlBase(repoPath) {
  try {
    const remoteUrl = getRemoteUrl(repoPath);
    if (!remoteUrl) return null;

    // Convert git URLs to HTTPS
    // git@github.com:org/repo.git -> https://github.com/org/repo
    // https://github.com/org/repo.git -> https://github.com/org/repo
    let url = remoteUrl
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');

    return url;
  } catch {
    return null;
  }
}

/**
 * Generate a branch name from epic metadata
 * @param {object} epic - Epic object
 * @returns {string} Branch name
 */
export function generateEpicBranchName(epic) {
  // Always use 'feature' prefix for epics
  const prefix = 'feature';

  // Slugify title (max 50 chars)
  const slug = epic.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
    .replace(/-+$/, ''); // Remove trailing dashes

  // Format: feature/epic-{epic-id}-{slug}
  return `${prefix}/epic-${epic.id}-${slug}`;
}
