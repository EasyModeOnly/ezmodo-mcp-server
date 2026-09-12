/**
 * Git Worktree Tools for MCP Server
 * Implements worktree management operations for AI agents
 */

import path from 'path';
import { callZephlyAPI } from './http-client.js';
import { getLogger } from './logger.js';
import {
  isGitRepository,
  getRepositoryRoot,
  branchExists,
  createBranch,
  createWorktree,
  listWorktrees,
  removeWorktree,
  getWorktreeStatus,
  getAheadBehindCounts,
  checkForConflicts,
  deleteBranch,
  isBranchMerged,
  getLastCommit,
  generateBranchName,
  generateEpicBranchName,
  getCurrentBranch,
  getCommitsSince,
  getCommitUrlBase,
  getMergeBase,
  getDefaultBranch,
} from './git-helpers.js';

/**
 * Tool Definitions for MCP Server
 */
export const WORKTREE_TOOLS = [
  {
    name: 'manage_worktree',
    description: 'Create, sync, or clean up git worktrees for tasks and epics. ' +
      'Worktrees enable parallel development by creating isolated workspaces.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_epic', 'create_task', 'sync_status', 'link_branch_commits', 'cleanup'],
          description: 'Action to perform',
        },
        // --- Identifiers ---
        epicId: {
          type: 'string',
          description: 'Epic ID (required for create_epic)',
        },
        taskId: {
          type: 'string',
          description: 'Task ID (required for create_task, sync_status, link_branch_commits)',
        },
        projectId: {
          type: 'string',
          description: 'Project ID (required for cleanup)',
        },
        // --- Shared creation fields ---
        repositoryPath: {
          type: 'string',
          description: 'Path to the git repository root (create_epic, create_task)',
        },
        worktreePath: {
          type: 'string',
          description: 'Path where the worktree should be created (create_epic, create_task) or synced from (sync_status)',
        },
        baseBranch: {
          type: 'string',
          description: 'Base branch to branch from (create_epic, create_task, link_branch_commits)',
        },
        branchName: {
          type: 'string',
          description: 'Custom branch name. Auto-generated if not provided (create_epic, create_task)',
        },
        // --- create_epic specific ---
        updateTasks: {
          type: 'boolean',
          description: 'Update all tasks in the epic to reference the epic branch (create_epic only). Default: true',
          default: true,
        },
        // --- sync_status specific ---
        autoLinkCommits: {
          type: 'boolean',
          description: 'Automatically detect and link new commits (sync_status only). Default: true',
          default: true,
        },
        // --- link_branch_commits specific ---
        repoPath: {
          type: 'string',
          description: 'Path to the git repository (link_branch_commits only). Defaults to cwd.',
        },
        branch: {
          type: 'string',
          description: 'Branch to get commits from (link_branch_commits only). Defaults to current.',
        },
        sinceCommit: {
          type: 'string',
          description: 'Only link commits after this SHA (link_branch_commits only)',
        },
        maxCommits: {
          type: 'number',
          description: 'Max commits to link (link_branch_commits only). Default: 100',
          default: 100,
        },
        // --- cleanup specific ---
        taskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific task IDs to clean up (cleanup only). Omit for all completed/cancelled.',
        },
        dryRun: {
          type: 'boolean',
          description: 'Preview cleanup without making changes (cleanup only)',
          default: false,
        },
        deleteBranches: {
          type: 'boolean',
          description: 'Also delete merged branches (cleanup only)',
          default: false,
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'list_project_worktrees',
    description: 'List all worktrees for a project with their associated tasks and status.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID to list worktrees for',
        },
        repositoryPath: {
          type: 'string',
          description: 'Path to the git repository. If not provided, attempts to detect from project metadata.',
        },
      },
      required: ['projectId'],
    },
  },
];

/**
 * Dispatch manage_worktree actions to the appropriate handler
 */
export async function manageWorktree(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create_epic': return createEpicWorktree(params);
  case 'create_task': return createTaskWorktree(params);
  case 'sync_status': return syncTaskWorktreeStatus(params);
  case 'link_branch_commits': return linkBranchCommitsToTask(params);
  case 'cleanup': return cleanupTaskWorktrees(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Create a worktree for an epic
 * @param {object} args - Arguments from MCP tool call
 * @returns {object} Result with worktree info
 */
async function createEpicWorktree(args) {
  const { epicId, repositoryPath, worktreePath, baseBranch, branchName, updateTasks = true } = args;

  try {
    // Get epic details
    // Note: callZephlyAPI unwraps Go API responses, so we get {epic} directly
    const epicData = await callZephlyAPI('mcpGetEpic', { epicId });
    if (!epicData || !epicData.epic) {
      throw new Error('Epic not found');
    }

    const epic = epicData.epic;

    // Get project context to determine repository path and base branch
    // Project-First: epics belong to projects (required)
    let projectResult = null;
    if (epic.projectId) {
      try {
        projectResult = await callZephlyAPI('mcpGetProjectContext', {
          projectId: epic.projectId,
        });
      } catch (err) {
        // Project context is optional, continue with defaults
        getLogger().warn('Could not get project context for worktree', { error: err.message });
      }
    }

    // Determine repository path
    let repoPath = repositoryPath;
    if (!repoPath && projectResult?.project?.gitContext?.repositoryPath) {
      repoPath = projectResult.project.gitContext.repositoryPath;
    }
    if (!repoPath) {
      repoPath = process.cwd();
    }

    // Verify it's a git repository
    if (!isGitRepository(repoPath)) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }

    // Get repository root
    const repoRoot = getRepositoryRoot(repoPath);
    if (!repoRoot) {
      throw new Error('Could not determine repository root');
    }

    // Determine base branch
    let baseRef = baseBranch;
    if (!baseRef && projectResult?.project?.gitContext?.defaultBranch) {
      baseRef = projectResult.project.gitContext.defaultBranch;
    }
    if (!baseRef) {
      baseRef = getCurrentBranch(repoRoot) || 'main';
    }

    // Generate or use provided branch name
    const newBranchName = branchName || generateEpicBranchName(epic);

    // Check if branch already exists
    const exists = branchExists(repoRoot, newBranchName);
    if (exists.local) {
      throw new Error(`Branch ${newBranchName} already exists locally`);
    }

    // Determine worktree path
    let wtPath = worktreePath;
    if (!wtPath && projectResult?.project?.gitContext?.defaultWorktreePath) {
      wtPath = path.join(repoRoot, projectResult.project.gitContext.defaultWorktreePath, `epic-${epicId}`);
    }
    if (!wtPath) {
      wtPath = path.join(path.dirname(repoRoot), 'worktrees', `epic-${epicId}`);
    }

    // Create branch
    const baseCommit = createBranch(repoRoot, newBranchName, baseRef);

    // Create worktree
    createWorktree(repoRoot, wtPath, newBranchName, false);

    // Update epic with git context
    const epicGitContext = {
      branchName: newBranchName,
      baseBranch: baseRef,
      baseCommit,
      lastSyncedAt: new Date(),
      isDirty: false,
      aheadBy: 0,
      behindBy: 0,
    };

    await callZephlyAPI('mcpUpdateEpic', {
      epicId,
      gitContext: epicGitContext,
    });

    // Optionally update all tasks in the epic to reference the epic branch
    let updatedTaskCount = 0;
    if (updateTasks) {
      // Get all tasks in the epic
      // Project-First: tasks belong to projects with optional epic grouping
      const searchParams = { epicId };
      if (epic.projectId) {
        searchParams.projectId = epic.projectId;
      }
      const tasksData = await callZephlyAPI('mcpSearchTasks', searchParams);

      if (tasksData?.tasks) {
        for (const task of tasksData.tasks) {
          await callZephlyAPI('mcpUpdateTask', {
            taskId: task.id,
            gitContext: {
              branchName: newBranchName,
              baseBranch: baseRef,
              baseCommit,
              lastSyncedAt: new Date(),
              isDirty: false,
              aheadBy: 0,
              behindBy: 0,
              isEpicBranch: true, // Flag to indicate this is shared via epic
              epicId, // Reference back to epic
            },
          });
          updatedTaskCount++;
        }
      }
    }

    return {
      success: true,
      worktreePath: wtPath,
      branchName: newBranchName,
      baseBranch: baseRef,
      baseCommit,
      updatedTaskCount,
      message: `Created epic worktree at ${wtPath} on branch ` +
        `${newBranchName}` +
        `${updatedTaskCount > 0
          ? ` (updated ${updatedTaskCount} tasks)` : ''}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Create a worktree for a task
 * @param {object} args - Arguments from MCP tool call
 * @returns {object} Result with worktree info
 */
async function createTaskWorktree(args) {
  const { taskId, repositoryPath, worktreePath, baseBranch, branchName } = args;

  try {
    // Get task details
    // Note: callZephlyAPI unwraps Go API responses, so we get {task} directly
    const taskData = await callZephlyAPI('mcpGetTask', { taskId });
    if (!taskData || !taskData.task) {
      throw new Error('Task not found');
    }

    const task = taskData.task;

    // Get project context to determine repository path and base branch
    const projectResult = await callZephlyAPI('mcpGetProjectContext', {
      projectId: task.projectId,
    });

    // Determine repository path
    let repoPath = repositoryPath;
    if (!repoPath && projectResult?.project?.gitContext?.repositoryPath) {
      repoPath = projectResult.project.gitContext.repositoryPath;
    }
    if (!repoPath) {
      repoPath = process.cwd();
    }

    // Verify it's a git repository
    if (!isGitRepository(repoPath)) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }

    // Get repository root
    const repoRoot = getRepositoryRoot(repoPath);
    if (!repoRoot) {
      throw new Error('Could not determine repository root');
    }

    // Determine base branch
    let baseRef = baseBranch;
    if (!baseRef && projectResult?.project?.gitContext?.defaultBranch) {
      baseRef = projectResult.project.gitContext.defaultBranch;
    }
    if (!baseRef) {
      baseRef = getCurrentBranch(repoRoot) || 'main';
    }

    // Generate or use provided branch name
    const newBranchName = branchName || generateBranchName(task);

    // Check if branch already exists
    const exists = branchExists(repoRoot, newBranchName);
    if (exists.local) {
      throw new Error(`Branch ${newBranchName} already exists locally`);
    }

    // Determine worktree path
    let wtPath = worktreePath;
    if (!wtPath && projectResult?.project?.gitContext?.defaultWorktreePath) {
      wtPath = path.join(repoRoot, projectResult.project.gitContext.defaultWorktreePath, taskId);
    }
    if (!wtPath) {
      wtPath = path.join(path.dirname(repoRoot), 'worktrees', taskId);
    }

    // Create branch
    const baseCommit = createBranch(repoRoot, newBranchName, baseRef);

    // Create worktree
    createWorktree(repoRoot, wtPath, newBranchName, false);

    // Update task with git context
    const gitContext = {
      branchName: newBranchName,
      baseBranch: baseRef,
      baseCommit,
      lastSyncedAt: new Date(),
      isDirty: false,
      aheadBy: 0,
      behindBy: 0,
    };

    await callZephlyAPI('mcpUpdateTask', {
      taskId,
      gitContext,
    });

    return {
      success: true,
      worktreePath: wtPath,
      branchName: newBranchName,
      baseBranch: baseRef,
      baseCommit,
      message: `Created worktree at ${wtPath} on branch ${newBranchName}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Sync worktree status to task
 * @param {object} args - Arguments from MCP tool call
 * @param {string} args.taskId - Task ID
 * @param {string} [args.worktreePath] - Path to worktree (optional if stored in task)
 * @param {boolean} [args.autoLinkCommits=true] - Automatically link new commits
 * @returns {object} Result with status info
 */
async function syncTaskWorktreeStatus(args) {
  const { taskId, worktreePath, autoLinkCommits = true } = args;

  try {
    // Get task details
    // Note: callZephlyAPI unwraps Go API responses, so we get {task} directly
    const taskData = await callZephlyAPI('mcpGetTask', { taskId });
    if (!taskData || !taskData.task) {
      throw new Error('Task not found');
    }

    const task = taskData.task;

    if (!task.gitContext || !task.gitContext.branchName) {
      throw new Error('Task has no git context');
    }

    // Determine worktree path
    let wtPath = worktreePath;
    if (!wtPath && task.gitContext.worktreePath) {
      wtPath = task.gitContext.worktreePath;
    }
    if (!wtPath) {
      throw new Error('Worktree path not specified and not found in task');
    }

    // Verify worktree exists
    if (!isGitRepository(wtPath)) {
      throw new Error(`Worktree not found or not a git repository: ${wtPath}`);
    }

    // Get status
    const status = getWorktreeStatus(wtPath);

    // Get ahead/behind counts
    const { ahead, behind } = getAheadBehindCounts(
      wtPath,
      task.gitContext.branchName,
      `origin/${task.gitContext.baseBranch}`
    );

    // Check for conflicts
    const conflicts = checkForConflicts(wtPath);

    // Get last commit info
    const lastCommit = getLastCommit(wtPath, task.gitContext.branchName);

    // Auto-link new commits if enabled
    let newlyLinkedCommits = [];
    if (autoLinkCommits) {
      // Determine the starting point for detecting new commits
      // Use lastLinkedCommitSha if available, otherwise fall back to baseCommit
      const sinceCommit = task.gitContext.lastLinkedCommitSha || task.gitContext.baseCommit;

      // Get all commits since the last linked commit
      const commits = getCommitsSince(wtPath, sinceCommit, task.gitContext.branchName);

      // Get existing linked commit SHAs to avoid duplicates
      const existingCommitShas = new Set(
        (task.linkedCommits || []).map(c => c.sha)
      );

      // Filter to only new commits
      const newCommits = commits.filter(c => !existingCommitShas.has(c.sha));

      // Get commit URL base for generating links
      const commitUrlBase = getCommitUrlBase(wtPath);

      // Link each new commit
      for (const commit of newCommits) {
        try {
          const commitUrl = commitUrlBase ? `${commitUrlBase}/commit/${commit.sha}` : undefined;

          await callZephlyAPI('mcpLinkCommitToTask', {
            taskId,
            sha: commit.sha,
            message: commit.message,
            author: commit.author,
            email: commit.email,
            timestamp: commit.timestamp.toISOString(),
            url: commitUrl,
            branch: task.gitContext.branchName,
          });

          newlyLinkedCommits.push(commit);
        } catch (linkError) {
          // Log but don't fail the sync if a single commit link fails
          getLogger().warn('Failed to link commit', { sha: commit.shortSha, error: linkError.message });
        }
      }
    }

    // Update task git context
    const updatedGitContext = {
      ...task.gitContext,
      isDirty: status.isDirty,
      aheadBy: ahead,
      behindBy: behind,
      hasConflicts: conflicts.hasConflicts,
      conflictFiles: conflicts.files,
      lastSyncedAt: new Date(),
    };

    if (lastCommit) {
      updatedGitContext.lastPushedBy = lastCommit.author;
      updatedGitContext.lastPushedAt = lastCommit.date;
      // Track the last commit we've linked to avoid re-linking on next sync
      if (autoLinkCommits && newlyLinkedCommits.length > 0) {
        updatedGitContext.lastLinkedCommitSha = lastCommit.hash;
      }
    }

    await callZephlyAPI('mcpUpdateTask', {
      taskId,
      gitContext: updatedGitContext,
    });

    return {
      success: true,
      status: {
        isDirty: status.isDirty,
        aheadBy: ahead,
        behindBy: behind,
        hasConflicts: conflicts.hasConflicts,
        conflictFiles: conflicts.files,
        files: status.files,
        lastCommit,
      },
      linkedCommits: newlyLinkedCommits.length > 0 ? {
        count: newlyLinkedCommits.length,
        commits: newlyLinkedCommits.map(c => ({ sha: c.shortSha, message: c.message })),
      } : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Link commits from a branch to a task (works without worktree)
 * @param {object} args - Arguments from MCP tool call
 * @param {string} args.taskId - Task ID to link commits to
 * @param {string} [args.repoPath] - Path to git repository (defaults to cwd)
 * @param {string} [args.branch] - Branch to get commits from (defaults to current branch)
 * @param {string} [args.sinceCommit] - Only link commits after this SHA
 * @param {string} [args.baseBranch] - Base branch to compare against (defaults to main/master)
 * @param {number} [args.maxCommits=100] - Maximum number of commits to link
 * @returns {object} Result with linked commits info
 */
async function linkBranchCommitsToTask(args) {
  const { taskId, repoPath, branch, sinceCommit, baseBranch, maxCommits = 100 } = args;

  try {
    // Determine repo path
    const gitRepoPath = repoPath || process.cwd();

    // Verify it's a git repository
    if (!isGitRepository(gitRepoPath)) {
      throw new Error(`Not a git repository: ${gitRepoPath}`);
    }

    // Get current branch if not specified
    const targetBranch = branch || getCurrentBranch(gitRepoPath);
    if (!targetBranch) {
      throw new Error('Could not determine current branch');
    }

    // Get task to check for existing linked commits
    const taskData = await callZephlyAPI('mcpGetTask', { taskId });
    if (!taskData || !taskData.task) {
      throw new Error('Task not found');
    }
    const task = taskData.task;

    // Determine starting point for commits
    let startCommit = sinceCommit;
    if (!startCommit) {
      // Check if task has gitContext with tracking info
      if (task.gitContext?.lastLinkedCommitSha) {
        startCommit = task.gitContext.lastLinkedCommitSha;
      } else if (task.gitContext?.baseCommit) {
        startCommit = task.gitContext.baseCommit;
      } else {
        // Find merge base with main/master
        const defaultBase = baseBranch || getDefaultBranch(gitRepoPath);
        startCommit = getMergeBase(gitRepoPath, targetBranch, defaultBase);
      }
    }

    // Get commits since start point
    let commits = getCommitsSince(gitRepoPath, startCommit, targetBranch);

    // Limit commits
    if (commits.length > maxCommits) {
      commits = commits.slice(0, maxCommits);
    }

    // Get existing linked commit SHAs to avoid duplicates
    const existingCommitShas = new Set(
      (task.linkedCommits || []).map(c => c.sha)
    );

    // Filter to only new commits
    const newCommits = commits.filter(c => !existingCommitShas.has(c.sha));

    if (newCommits.length === 0) {
      return {
        success: true,
        message: 'No new commits to link',
        branch: targetBranch,
        existingCommitCount: existingCommitShas.size,
      };
    }

    // Get commit URL base for generating links
    const commitUrlBase = getCommitUrlBase(gitRepoPath);

    // Link each new commit
    const linkedCommits = [];
    const errors = [];

    for (const commit of newCommits) {
      try {
        const commitUrl = commitUrlBase ? `${commitUrlBase}/commit/${commit.sha}` : undefined;

        await callZephlyAPI('mcpLinkCommitToTask', {
          taskId,
          sha: commit.sha,
          message: commit.message,
          author: commit.author,
          email: commit.email,
          timestamp: commit.timestamp.toISOString(),
          url: commitUrl,
          branch: targetBranch,
        });

        linkedCommits.push(commit);
      } catch (linkError) {
        errors.push({ sha: commit.shortSha, error: linkError.message });
      }
    }

    // Update task gitContext with tracking info if not already set
    if (!task.gitContext || !task.gitContext.branchName) {
      const lastCommit = getLastCommit(gitRepoPath, targetBranch);
      const defaultBase = baseBranch || getDefaultBranch(gitRepoPath);

      await callZephlyAPI('mcpUpdateTask', {
        taskId,
        gitContext: {
          ...task.gitContext,
          branchName: targetBranch,
          baseBranch: defaultBase,
          baseCommit: startCommit || getMergeBase(gitRepoPath, targetBranch, defaultBase),
          lastLinkedCommitSha: lastCommit?.hash,
          lastSyncedAt: new Date(),
        },
      });
    } else if (linkedCommits.length > 0) {
      // Just update the last linked commit SHA
      const lastCommit = getLastCommit(gitRepoPath, targetBranch);
      await callZephlyAPI('mcpUpdateTask', {
        taskId,
        gitContext: {
          ...task.gitContext,
          lastLinkedCommitSha: lastCommit?.hash,
          lastSyncedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      branch: targetBranch,
      linkedCommits: {
        count: linkedCommits.length,
        commits: linkedCommits.map(c => ({ sha: c.shortSha, message: c.message })),
      },
      errors: errors.length > 0 ? errors : undefined,
      skipped: commits.length - newCommits.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Clean up worktrees for completed/cancelled tasks
 * @param {object} args - Arguments from MCP tool call
 * @returns {object} Result with cleanup info
 */
async function cleanupTaskWorktrees(args) {
  const { projectId, taskIds, dryRun = false, deleteBranches = false } = args;

  try {
    // Get project context
    const projectData = await callZephlyAPI('mcpGetProjectContext', { projectId });
    if (!projectData?.project) {
      throw new Error('Failed to get project context');
    }

    // Determine repository path
    const repoPath = projectData.project?.gitContext?.repositoryPath || process.cwd();

    if (!isGitRepository(repoPath)) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }

    const repoRoot = getRepositoryRoot(repoPath);

    // Get tasks to clean up
    let tasksToCleanup = [];
    if (taskIds && taskIds.length > 0) {
      // Specific tasks
      for (const taskId of taskIds) {
        const taskData = await callZephlyAPI('mcpGetTask', { taskId });
        if (taskData?.task) {
          tasksToCleanup.push(taskData.task);
        }
      }
    } else {
      // Find all completed/cancelled tasks with worktrees
      const completedData = await callZephlyAPI('mcpSearchTasks', {
        projectId,
        status: 'completed',
      });

      const cancelledData = await callZephlyAPI('mcpSearchTasks', {
        projectId,
        status: 'cancelled',
      });

      if (completedData?.tasks) {
        tasksToCleanup.push(...completedData.tasks);
      }
      if (cancelledData?.tasks) {
        tasksToCleanup.push(...cancelledData.tasks);
      }

      // Filter to only tasks with git context
      tasksToCleanup = tasksToCleanup.filter(t => t.gitContext && t.gitContext.branchName);
    }

    // Clean up each worktree
    const results = [];
    const existingWorktrees = listWorktrees(repoRoot);

    for (const task of tasksToCleanup) {
      const result = {
        taskId: task.id,
        taskTitle: task.title,
        branchName: task.gitContext.branchName,
        action: 'skipped',
        reason: '',
      };

      // Find matching worktree
      const worktree = existingWorktrees.find(
        wt => wt.branch === task.gitContext.branchName
      );

      if (!worktree) {
        result.reason = 'Worktree not found';
        results.push(result);
        continue;
      }

      if (dryRun) {
        result.action = 'would-remove';
        result.worktreePath = worktree.path;

        if (deleteBranches) {
          const merged = isBranchMerged(
            repoRoot,
            task.gitContext.branchName,
            task.gitContext.baseBranch
          );
          if (merged) {
            result.branchAction = 'would-delete';
            result.reason = 'Branch is merged';
          } else {
            result.branchAction = 'would-keep';
            result.reason = 'Branch not merged';
          }
        }
      } else {
        try {
          // Remove worktree
          removeWorktree(repoRoot, worktree.path, true);
          result.action = 'removed';
          result.worktreePath = worktree.path;

          // Delete branch if requested and merged
          if (deleteBranches) {
            const merged = isBranchMerged(
              repoRoot,
              task.gitContext.branchName,
              task.gitContext.baseBranch
            );

            if (merged) {
              deleteBranch(repoRoot, task.gitContext.branchName, false);
              result.branchAction = 'deleted';
              result.reason = 'Branch was merged';
            } else {
              result.branchAction = 'kept';
              result.reason = 'Branch not merged (kept for safety)';
            }
          }

          // Clear git context from task
          await callZephlyAPI('mcpUpdateTask', {
            taskId: task.id,
            gitContext: null,
          });
        } catch (error) {
          result.action = 'failed';
          result.reason = error.message;
        }
      }

      results.push(result);
    }

    return {
      success: true,
      dryRun,
      cleaned: results.filter(r => r.action === 'removed').length,
      wouldClean: results.filter(r => r.action === 'would-remove').length,
      results,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * List all worktrees for a project
 * @param {object} args - Arguments from MCP tool call
 * @returns {object} Result with worktree list
 */
export async function listProjectWorktrees(args) {
  const { projectId, repositoryPath } = args;

  try {
    // Get project context
    const projectData = await callZephlyAPI('mcpGetProjectContext', { projectId });
    if (!projectData?.project) {
      throw new Error('Failed to get project context');
    }

    // Determine repository path
    const repoPath = repositoryPath || projectData.project?.gitContext?.repositoryPath || process.cwd();

    if (!isGitRepository(repoPath)) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }

    const repoRoot = getRepositoryRoot(repoPath);

    // List all worktrees
    const worktrees = listWorktrees(repoRoot);

    // Get all tasks with git context
    const tasksData = await callZephlyAPI('mcpSearchTasks', { projectId });
    const tasks = tasksData?.tasks || [];
    const tasksWithGit = tasks.filter(t => t.gitContext && t.gitContext.branchName);

    // Match worktrees with tasks
    const worktreeList = worktrees.map(wt => {
      const task = tasksWithGit.find(t => t.gitContext.branchName === wt.branch);

      const info = {
        path: wt.path,
        branch: wt.branch,
        commit: wt.commit,
        taskId: task?.id || null,
        taskTitle: task?.title || null,
        taskStatus: task?.status || null,
        assignee: task?.assignee || null,
      };

      if (task && task.gitContext) {
        info.isDirty = task.gitContext.isDirty;
        info.aheadBy = task.gitContext.aheadBy;
        info.behindBy = task.gitContext.behindBy;
        info.hasConflicts = task.gitContext.hasConflicts;
        info.lastSyncedAt = task.gitContext.lastSyncedAt;
      }

      return info;
    });

    // Find orphaned worktrees (no matching task)
    const orphaned = worktreeList.filter(wt => !wt.taskId);

    return {
      success: true,
      worktrees: worktreeList,
      totalCount: worktreeList.length,
      orphanedCount: orphaned.length,
      orphaned,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
