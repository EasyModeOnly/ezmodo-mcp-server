/**
 * Task Handlers
 * Handler functions for task-related MCP tools
 *
 * Project-First Hierarchy: Tasks belong to projects (required), with optional epic grouping
 *
 * Code links are derived: the files a task touches (changedFiles / linkedFiles)
 * resolve to the features that own those paths (E-258). Agents name the feature
 * the work advances through `links`.
 * Tags are auto-assigned based on content analysis against the local project cache.
 */

import { previewEntityLinks, partitionProposals, attachSuggestionIds } from '../lib/autolink.js';
import { callZephlyAPI } from '../lib/http-client.js';
import { resolveTaskAutoAssign } from '../lib/auto-assign.js';
import { buildTaskUrl } from '../lib/web-url.js';
import { getLogger } from '../lib/logger.js';
import { writeActiveSession, clearActiveSession } from '../lib/active-session.js';
import { attachLinks } from '../lib/links-at-create.js';
import { getContext } from './context-manifest.js';
import { getCommitFiles, getRepositoryRoot } from '../lib/git-helpers.js';
import { normalizeChangedFiles } from '../lib/changed-files.js';

/**
 * Apply tags to a newly created entity via bulkTagEntities.
 * Non-fatal — logs errors but doesn't throw.
 */
async function applyAutoTags(organizationId, entityType, entityId, tagIds) {
  if (!organizationId || !tagIds?.length || !entityId) return;
  try {
    await callZephlyAPI('mcpBulkTagEntities', {
      organizationId,
      tagIds,
      entities: [{ entityType, entityId }],
      operation: 'add',
    });
  } catch (err) {
    getLogger().warn('Auto-tag failed', { entityType, entityId, error: err.message });
  }
}

/**
 * Dispatch manage_task actions to the appropriate handler
 */
export async function manageTask(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createTask(params);
  case 'update': return updateTask(params);
  case 'complete': return completeTask(params);
  case 'defer': return deferTask(params);
  case 'link_commit': return linkCommitToTask(params);
  case 'unlink_commit': return unlinkCommitFromTask(params);
  case 'get_commits': return getTaskCommits(params);
  case 'generate_how_it_works': return generateTaskHowItWorks(params);
  case 'apply_how_it_works': return applyTaskHowItWorks(params);
  case 'claim': return claimTask(params, false);
  case 'release': return claimTask(params, true);
  case 'list_suggested_edits': return suggestedEdits(params, false);
  case 'answer_suggested_edit': return suggestedEdits(params, true);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Claim a task, or give it back (E-259 #2747). The server decides who may and
 * words the answer; a task someone else holds comes back as an error naming
 * them, which is the agent's cue to pick other work rather than retry.
 */
async function claimTask({ taskId, claimNote }, release) {
  if (!taskId) throw new Error(`taskId is required to ${release ? 'release' : 'claim'} a task`);
  return callZephlyAPI('mcpClaimTask', release ? { taskId, release: true } : { taskId, note: claimNote });
}

/**
 * Suggested edits on a claimed task (E-259 #2809): list what is waiting, or
 * answer one. The server decides who may accept, reject or withdraw.
 */
async function suggestedEdits({ taskId, editId, answer, note }, answering) {
  if (!taskId) throw new Error('taskId is required');
  if (!answering) return callZephlyAPI('mcpTaskSuggestedEdits', { taskId });
  if (!editId || !answer) throw new Error('editId and answer (accept, reject or withdraw) are required');
  return callZephlyAPI('mcpTaskSuggestedEdits', { taskId, editId, answer, note });
}

/**
 * Bridge user terminology ("dashboard") to code locations by searching the
 * manifest for the task's own words. Best-effort: returns null when there is
 * too little to go on or the search fails.
 */
async function resolveCodeContext({ projectId, title, description }) {
  const searchQuery = [title, description].filter(Boolean).join(' ');
  if (searchQuery.length <= 5) return null;
  try {
    const contextResult = await getContext({ projectId, query: searchQuery, limit: 10 });
    const topFiles = (contextResult?.topResults || []).slice(0, 5);
    if (topFiles.length === 0) return null;
    return {
      files: topFiles.map((f) => f.path),
      summary: topFiles.map((f) => `- ${f.path}: ${f.summary || ''}`).join('\n'),
    };
  } catch {
    return null;
  }
}

async function createTask(args) {
  // `links` is applied by the MCP layer after the task exists (E-225), so it is
  // kept out of the create payload.
  const { links, changedFiles, autolink = true, ...createArgs } = args;
  const { projectId, title, description } = createArgs;

  // Resolve the task's code context BEFORE creating it, so the files go in with
  // the create rather than being patched on afterwards (E-225).
  //
  // This used to run after create as one getContext plus up to six sequential
  // mcpUpdateTask calls — one for knowledge, one per file. Beyond the round
  // trips, each addLinkedFile independently triggered the autolink engine, so a
  // single task create fanned out into five redundant derivations. Folding the
  // files into the create means one trigger with the complete set, which is
  // also what lets the engine's fan-out collapse see the whole change at once.
  let autoContext = null;
  const explicitFiles = normalizeChangedFiles(changedFiles, createArgs.linkedFiles);
  if (explicitFiles.length > 0) {
    createArgs.linkedFiles = explicitFiles;
  } else if (autolink && projectId) {
    autoContext = await resolveCodeContext({ projectId, title, description });
    if (autoContext) {
      createArgs.linkedFiles = autoContext.files.map((path) => ({ path, source: 'mcp' }));
      createArgs.knowledge = [
        ...(createArgs.knowledge || []),
        {
          type: 'reference',
          content: `Auto-resolved code context:\n${autoContext.summary}`,
          tags: ['auto-context', 'code-reference'],
        },
      ];
    }
  }

  // Create the task
  const result = await callZephlyAPI('mcpCreateTask', createArgs);

  // If the milestone is frozen and the operation was blocked, return guidance
  if (result?.blocked) {
    return {
      blocked: true,
      freezeType: result.freezeType,
      milestoneId: result.milestoneId,
      milestoneName: result.milestoneName,
      message: `Milestone Frozen (${result.milestoneName || 'unknown'}, ${result.freezeType}): ${result.reason || 'No reason provided'}`,
      allowedTaskTypes: result.allowedTaskTypes || [],
      suggestion: result.suggestion,
    };
  }

  // Auto-apply tags (non-fatal)
  const autoAssign = await resolveTaskAutoAssign(projectId, title, description);
  if (autoAssign?.matchedTags?.length && result?.taskId) {
    await applyAutoTags(
      autoAssign.organizationId,
      'task',
      result.taskId,
      autoAssign.matchedTags.map((t) => t.id),
    );
    result.autoAssigned = {
      tags: autoAssign.matchedTags.map((t) => t.name),
    };
  }

  if (autoContext) {
    result.autoContext = {
      filesFound: autoContext.files.length,
      topFiles: autoContext.files,
    };
  }

  // Surface what the engine did and what it wants confirmed, in the SAME
  // response that created the task — so an agent can resolve its suggestions in
  // the same turn instead of discovering them on a later read it may never do.
  let previewed = [];
  if (autolink && result?.taskId && projectId) {
    const { proposals } = await previewEntityLinks({
      projectId,
      subjectType: 'task',
      subjectId: result.taskId,
      paths: (createArgs.linkedFiles || []).map((f) => f.path),
      epicId: createArgs.epicId,
    });
    const { autoLinked, linkSuggestions } = partitionProposals(proposals);
    if (autoLinked.length > 0) result.autoLinked = autoLinked;
    previewed = linkSuggestions;
  }

  // Suggestions need the id resolve_link_suggestions takes; the preview is
  // read-only so its proposals have none. Read them back off the queue the
  // engine writes to (#2297).
  //
  // Deliberately outside the `autolink` guard above: that flag turns off the
  // codebase search this handler does, not the server's own linking. Rows get
  // queued either way, and a task created with autolink:false would otherwise
  // never learn it had suggestions waiting.
  if (result?.taskId) {
    const resolved = await attachSuggestionIds({
      subjectType: 'task',
      subjectId: result.taskId,
      linkSuggestions: previewed,
    });
    if (resolved.linkSuggestions.length > 0) {
      result.linkSuggestions = resolved.linkSuggestions;
      result.linkSuggestionsNote = resolved.partial
        ? 'Resolve these with resolve_link_suggestions using each suggestionId. Some have no '
          + 'suggestionId yet and more may still be queued — call list_agent_suggestions '
          + `action:"link" entityType:"task" entityId:"${result.taskId}" for the authoritative set.`
        : 'Resolve these with resolve_link_suggestions using each suggestionId.';
    }
  }

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, {
    sourceType: 'task',
    sourceId: result?.taskId,
    links: args.links,
  });

  // Enrich with web URL
  const webUrl = await buildTaskUrl(result?.taskNumber);
  if (webUrl) result.webUrl = webUrl;

  // Write active session file if task starts in_progress
  if (args.status === 'in_progress' && result?.taskId) {
    await writeActiveSession({
      taskId: result.taskId,
      taskNumber: result.taskNumber,
      title: args.title,
      epicId: args.epicId,
    });
  }

  return result;
}

/**
 * Build a task description enriched with drift evidence (branch + changed
 * files), mirroring the desktop quick-create dialog so retroactively-captured
 * untracked work carries the same context.
 */
function buildUntrackedDescription({ description, branch, changedFiles }) {
  const parts = [];
  if (description && description.trim()) parts.push(description.trim());

  const evidence = [];
  if (branch) evidence.push(`**Branch:** ${branch}`);
  if (Array.isArray(changedFiles) && changedFiles.length > 0) {
    evidence.push(`**Changed files (${changedFiles.length}):**`);
    for (const f of changedFiles) evidence.push(`- ${f}`);
  }
  if (evidence.length > 0) {
    parts.push(`_Captured as untracked work._\n\n${evidence.join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * Retroactively report work done without a task (E-200 #958). This is the
 * agent-side counterpart to the desktop quick-create dialog (#955): when Claude
 * realizes mid-conversation that it made changes without a tracked task (e.g. a
 * "just fix this real quick" request), it calls this to capture the work.
 *
 * Creates a task classified by `origin` (default "untracked"), enriches the
 * description with the branch + changed files, links the discovery chain when
 * provided, and starts it in_progress so it becomes the active task — which
 * also writes active-session.json for the desktop app to pick up (via the
 * shared createTask path). Returns the created task so the agent can continue
 * tracking against it.
 */
/**
 * Create many tasks in one API call (E-227 #2225).
 *
 * The win is per-REQUEST cost, not per-task work: N individual creates pay N
 * bcrypt compares, key lookups, plan checks, rate-limit counts and RLS
 * connection acquires. One call pays each once. A burst of individual creates is
 * what took the app down for 45 minutes on 2026-07-28.
 *
 * Deliberately thinner than createTask. The single-create path also resolves code
 * context (a getContext call), applies links, and previews autolink proposals —
 * all per task. Doing that here would reintroduce the per-item round trips this
 * exists to remove, and turn one call into 3N. So this creates the tasks and
 * reports what happened; enrich individually afterwards if a task needs it.
 *
 * Never throws on a partial failure — per-item outcomes come back in `results`
 * so the caller can retry precisely the failures instead of re-sending a batch
 * that would duplicate everything already created.
 */
export async function bulkCreateTasks(args) {
  const { projectId, epicId, tasks = [] } = args;

  if (!projectId) throw new Error('projectId is required');
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('tasks must be a non-empty array');
  }
  // Checked client-side too so an oversized batch fails immediately with
  // actionable advice rather than spending a request to be rejected.
  if (tasks.length > 40) {
    throw new Error(
      `cannot create ${tasks.length} tasks in one call (limit 40) — ` +
      'split into batches of 40 or fewer',
    );
  }

  const result = await callZephlyAPI('mcpBulkCreateTasks', {
    projectId,
    epicId,
    tasks: tasks.map(({ changedFiles, linkedFiles, ...rest }) => ({
      ...rest,
      // Accept the same two spellings as manage_task so callers do not have to
      // remember which shape this tool wants.
      linkedFiles: normalizeChangedFiles(changedFiles, linkedFiles),
    })),
  });

  const created = result?.created ?? 0;
  const failed = result?.failed ?? 0;
  const results = result?.results ?? [];

  const out = {
    created,
    failed,
    results,
    message: failed === 0
      ? `Created ${created} task${created === 1 ? '' : 's'} in one request.`
      : `Created ${created} of ${created + failed}. ${failed} failed — retry ONLY the ` +
        'items listed in failures; the successful tasks already exist.',
  };

  // Surface failures separately: an agent scanning a 40-entry array can miss
  // three error fields, and re-running the whole batch is the costly mistake.
  if (failed > 0) {
    out.failures = results
      .filter((r) => r.error)
      .map((r) => ({ index: r.index, title: r.title, error: r.error }));
  }

  if (created > 0) {
    out.taskNumbers = results.filter((r) => r.taskNumber).map((r) => r.taskNumber);
  }

  return out;
}

export async function reportUntrackedWork(args) {
  const {
    projectId,
    title,
    description,
    origin = 'untracked',
    discoveredDuringTaskId,
    branch,
    changedFiles,
    epicId,
    featureId,
    links,
  } = args;

  if (!projectId) throw new Error('projectId is required');
  if (!title) throw new Error('title is required');

  // A featureId is just a link to the feature the work advanced — fold it into
  // the links array so untracked work still lands on the capability map.
  const allLinks = [
    ...(Array.isArray(links) ? links : []),
    ...(featureId ? [{ targetType: 'feature', targetId: featureId }] : []),
  ];

  const createArgs = {
    projectId,
    title,
    description: buildUntrackedDescription({ description, branch, changedFiles }),
    status: 'in_progress',
    origin,
    ...(discoveredDuringTaskId ? { discoveredDuringTaskId } : {}),
    ...(epicId ? { epicId } : {}),
    ...(allLinks.length > 0 ? { links: allLinks } : {}),
    ...(Array.isArray(changedFiles) && changedFiles.length > 0
      ? { linkedFiles: changedFiles.map((path) => ({ path, source: 'mcp' })) }
      : {}),
  };

  return createTask(createArgs);
}

async function updateTask(args) {
  const result = await callZephlyAPI('mcpUpdateTask', args);

  // If the milestone is frozen and the operation was blocked, return guidance
  if (result?.blocked) {
    return {
      blocked: true,
      freezeType: result.freezeType,
      milestoneId: result.milestoneId,
      milestoneName: result.milestoneName,
      message: `Milestone Frozen (${result.milestoneName || 'unknown'}, ${result.freezeType}): ${result.reason || 'No reason provided'}`,
      allowedTaskTypes: result.allowedTaskTypes || [],
      suggestion: result.suggestion,
    };
  }

  // Manage active session file based on status transitions
  if (args.status) {
    const endStatuses = ['completed', 'cancelled', 'in_review'];
    if (args.status === 'in_progress') {
      // Fetch full task data to populate session file
      try {
        const taskResult = await callZephlyAPI('mcpGetTask', { taskId: args.taskId });
        if (taskResult?.task) {
          await writeActiveSession({
            taskId: taskResult.task.id,
            taskNumber: taskResult.task.taskNumber,
            title: taskResult.task.title,
            epicId: taskResult.task.epicId,
          });
        }
      } catch (err) {
        getLogger().warn('Failed to fetch task for session file', { error: err.message });
      }
    } else if (endStatuses.includes(args.status)) {
      await clearActiveSession();
    }
  }

  return result;
}

async function completeTask(args) {
  const result = await callZephlyAPI('mcpCompleteTask', args);
  await clearActiveSession();
  return result;
}

async function deferTask(args) {
  // Required: taskId + reason. The API rejects on missing values but a JS-side
  // guard surfaces a clearer error to MCP callers without a round trip.
  if (!args.taskId) {
    throw new Error('taskId is required for defer');
  }
  if (!args.reason || !args.reason.trim()) {
    throw new Error('reason is required for defer');
  }
  return callZephlyAPI('mcpDeferTask', {
    taskId: args.taskId,
    reason: args.reason,
    stepId: args.stepId,
    unblockedBy: args.unblockedBy,
    targetMilestoneId: args.targetMilestoneId,
  });
}

export async function searchTasks(args) {
  // Use semantic search if searchText is provided and projectId is available
  if (args.searchText && args.projectId) {
    try {
      // Transform args for semantic search API
      const semanticArgs = {
        projectId: args.projectId,
        query: args.searchText,
        entityType: 'task',
        minSimilarity: args.minSimilarity || 0.3,
        limit: args.limit || 10,
        // Pass through filter params
        status: args.status,
        priority: args.priority,
        labels: args.labels,
        assignees: args.assignees,
        epicId: args.epicId,
      };

      const result = await callZephlyAPI('mcpSemanticTaskSearch', semanticArgs);

      // Fall back to basic search if semantic returns no results (e.g., no embeddings)
      if (!result.results || result.results.length === 0) {
        getLogger().info('Semantic search empty, falling back to basic search', { projectId: args.projectId });
        return callZephlyAPI('mcpSearchTasks', args);
      }

      // Transform semantic search response to match expected format
      return {
        success: true,
        tasks: result.results,
        count: result.totalCount || result.results.length,
        searchType: 'semantic',
        query: args.searchText,
      };
    } catch (error) {
      // Fall back to basic search if semantic search fails
      getLogger().warn('Semantic search failed, falling back to basic search', { error: error.message });
      return callZephlyAPI('mcpSearchTasks', args);
    }
  }

  // Use basic filter-based search when no searchText or projectId
  return callZephlyAPI('mcpSearchTasks', args);
}

export async function getTask(args) {
  const result = await callZephlyAPI('mcpGetTask', args);
  const webUrl = await buildTaskUrl(result?.task?.taskNumber);
  if (webUrl && result?.task) result.task.webUrl = webUrl;
  return result;
}

// Link a commit to a task, deriving its changed files when the caller did not
// supply them.
//
// `files` has always been optional and callers routinely omit it, which costs
// more than it looks: without paths the task is invisible to auto-linking
// forever, since the engine has nothing to resolve against the paths features
// own. Measured on saltpig, 359 of 1224 tasks carrying a commit had no
// linked files at all.
//
// The fix is derivation rather than discipline. The commit SHA is already
// required, and the MCP server runs in the working tree where the commit was
// made, so the file list is a fact one command away — the agent still just
// passes a SHA. Best-effort throughout: a commit link must never fail because
// the files could not be read.
async function linkCommitToTask(args) {
  if (Array.isArray(args.files) && args.files.length > 0) {
    return callZephlyAPI('mcpLinkCommitToTask', args);
  }

  let files = [];
  try {
    const repoRoot = getRepositoryRoot(args.workingDirectory || process.cwd());
    if (repoRoot) {
      files = getCommitFiles(repoRoot, args.sha);
    }
  } catch (error) {
    getLogger().warn('Could not derive commit files', { sha: args.sha, error: error.message });
  }

  if (files.length === 0) {
    return callZephlyAPI('mcpLinkCommitToTask', args);
  }
  getLogger().info('Derived commit files for link_commit', { sha: args.sha, count: files.length });
  return callZephlyAPI('mcpLinkCommitToTask', { ...args, files });
}

async function unlinkCommitFromTask(args) {
  return callZephlyAPI('mcpUnlinkCommitFromTask', args);
}

async function getTaskCommits(args) {
  return callZephlyAPI('mcpGetTaskCommits', args);
}

// Generate (and persist) the task's grounded "how it works" living description
// via the model. AI-quota gated server-side (mirrors projects.generateProjectHowItWorks).
async function generateTaskHowItWorks({ taskId }) {
  return callZephlyAPI('mcpGenerateTaskHowItWorks', { taskId });
}

// Apply (persist) a LOCAL-agent-authored "how it works" for a task (BYO-AI,
// E-190). The agent writes { markdown, sources }; the server validates the cited
// sources against the real grounded context before saving. No server model call.
async function applyTaskHowItWorks({ taskId, markdown, sources }) {
  return callZephlyAPI('mcpApplyTaskHowItWorks', { taskId, markdown, sources });
}
