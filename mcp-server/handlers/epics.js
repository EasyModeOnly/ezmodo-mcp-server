/**
 * Epic Handlers
 * Handler functions for epic-related MCP tools
 *
 * Project-First Hierarchy: Epics belong to projects (required),
 * with optional milestone linking.
 *
 * Auto-assignment: When creating epics, automatically applies matching tags
 * based on content analysis against the local project cache.
 */

import { callZephlyAPI } from '../lib/http-client.js';
import { resolveEpicAutoAssign } from '../lib/auto-assign.js';
import { buildEpicUrl } from '../lib/web-url.js';
import { getLogger } from '../lib/logger.js';
import { attachLinks } from '../lib/links-at-create.js';
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
 * Flatten the nested-task result into the fields an agent acts on (#2247).
 *
 * Mutates `result` in place, mirroring create_tasks: failures are surfaced as
 * their own list because an agent scanning a 40-entry array can miss three error
 * fields, and re-running the create is the costly mistake — it would make a
 * second epic on top of duplicating the tasks that succeeded.
 */
function summarizeNestedTasks(result) {
  if (!result) return;
  const created = result.tasks?.created ?? 0;
  const failed = result.tasks?.failed ?? 0;
  const results = result.tasks?.results ?? [];

  if (result.tasksError) {
    result.message = `Epic created, but no tasks were: ${result.tasksError}. ` +
      'The epic exists — send the tasks with create_tasks rather than creating the epic again.';
    return;
  }

  result.message = failed === 0
    ? `Created the epic and ${created} task${created === 1 ? '' : 's'} in one request.`
    : `Epic created with ${created} of ${created + failed} tasks. ${failed} failed — the epic and the ` +
      'successful tasks exist, so retry ONLY the items listed in failures with create_tasks.';

  if (failed > 0) {
    result.failures = results
      .filter((r) => r.error)
      .map((r) => ({ index: r.index, title: r.title, error: r.error }));
  }
  if (created > 0) {
    result.taskNumbers = results.filter((r) => r.taskNumber).map((r) => r.taskNumber);
  }
}

/**
 * Dispatch manage_epic actions to the appropriate handler
 */
export async function manageEpic(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createEpic(params);
  case 'update': return updateEpic(params);
  case 'generate_how_it_works': return generateEpicHowItWorks(params);
  case 'apply_how_it_works': return applyEpicHowItWorks(params);
  default: throw new Error(
    `Unknown action: ${action}. Expected create, update, generate_how_it_works, or apply_how_it_works.`,
  );
  }
}

// (Re)generate the epic's grounded, source-attributed "how it works" living
// description (E-237 #2382). An epic's reality is its tasks — their status,
// captured decisions and linked commits — and its intent is the epic description
// plus the decisions reached by walking those tasks (settled model A, #2376).
// Server-side: one model call, AI-quota gated.
async function generateEpicHowItWorks({ epicId }) {
  return callZephlyAPI('mcpGenerateEpicHowItWorks', { epicId });
}

// Apply (persist) a LOCAL-agent-authored "how it works" for an epic (BYO-AI,
// E-190). Cited sources are validated server-side against the real grounded
// context before saving; no model call, so no AI quota is spent.
async function applyEpicHowItWorks({ epicId, markdown, sources }) {
  return callZephlyAPI('mcpApplyEpicHowItWorks', { epicId, markdown, sources });
}

async function createEpic(args) {
  // `links` is applied by the MCP layer after the epic exists (E-225).
  const { links, tasks, ...createArgs } = args;
  const { title, description } = createArgs;

  // Checked client-side too so an oversized breakdown fails immediately with
  // actionable advice rather than spending a request to be rejected.
  if (tasks?.length > 40) {
    throw new Error(
      `cannot create ${tasks.length} tasks with an epic in one call (limit 40) — ` +
      'create the epic with the first 40, then send the rest with create_tasks',
    );
  }

  // An epic with its breakdown goes to the composing endpoint (#2247) so the
  // whole thing is one request; without tasks nothing changes. Everything below
  // this line — auto-tags, links, web URL — acts on the EPIC and so is identical
  // either way.
  const result = tasks?.length
    ? await callZephlyAPI('mcpCreateEpicWithTasks', {
      ...createArgs,
      tasks: tasks.map(({ changedFiles, linkedFiles, ...rest }) => ({
        ...rest,
        // Accept the same two spellings as manage_task, matching create_tasks.
        linkedFiles: normalizeChangedFiles(changedFiles, linkedFiles),
      })),
    })
    : await callZephlyAPI('mcpCreateEpic', createArgs);

  if (tasks?.length) summarizeNestedTasks(result);

  // Auto-apply matching tags (non-fatal)
  const autoAssign = await resolveEpicAutoAssign(title, description);
  if (autoAssign?.matchedTags?.length && result?.epicId) {
    await applyAutoTags(
      autoAssign.organizationId,
      'epic',
      result.epicId,
      autoAssign.matchedTags.map((t) => t.id),
    );
    result.autoAssigned = {
      tags: autoAssign.matchedTags.map((t) => t.name),
    };
  }

  // Attach create-time links (E-225) — best effort, never fails the create.
  await attachLinks(result, { sourceType: 'epic', sourceId: result?.epicId, links });

  // Enrich with web URL
  const webUrl = await buildEpicUrl(result?.epicNumber);
  if (webUrl) result.webUrl = webUrl;

  return result;
}

async function updateEpic(args) {
  const result = await callZephlyAPI('mcpUpdateEpic', args);

  // If the milestone is frozen and the operation was blocked, return guidance
  if (result?.blocked) {
    return {
      blocked: true,
      freezeType: result.freezeType,
      milestoneId: result.milestoneId,
      milestoneName: result.milestoneName,
      message: `Milestone Frozen (${result.milestoneName || 'unknown'}, ${result.freezeType}): ${result.reason || 'No reason provided'}`,
      suggestion: result.suggestion,
    };
  }

  return result;
}

export async function searchEpics(args) {
  return callZephlyAPI('mcpSearchEpics', args);
}

export async function listEpics(args) {
  return callZephlyAPI('mcpListEpics', args);
}

export async function getEpic(args) {
  const result = await callZephlyAPI('mcpGetEpic', args);
  const webUrl = await buildEpicUrl(result?.epic?.epicNumber);
  if (webUrl && result?.epic) result.epic.webUrl = webUrl;
  return result;
}

/**
 * Read an epic's plan with its current revision (E-259).
 */
export async function getEpicPlan(args) {
  return callZephlyAPI('mcpGetEpicPlan', args);
}

/**
 * Save an epic's plan against the revision it was read at (E-259). A conflict
 * is returned as a result, not thrown: it is an expected outcome when several
 * people's AIs share a plan, and the agent needs the current plan and what
 * changed to redo its edit.
 */
export async function updateEpicPlan(args) {
  try {
    return await callZephlyAPI('mcpUpdateEpicPlan', args);
  } catch (err) {
    if (err?.code === 'PLAN_CONFLICT') {
      const details = err.details || {};
      return {
        saved: false,
        conflict: true,
        message: `Someone else changed this plan since revision ${details.baseRevision}. ` +
          'Nothing was saved. Apply your change to the current plan below and save again with ' +
          `baseRevision ${details.currentRevision}. Do not resend your old copy.`,
        currentRevision: details.currentRevision,
        changesSince: details.changesSince || [],
        currentPlan: details.current || null,
      };
    }
    throw err;
  }
}

/**
 * Read an epic's discussion (E-259).
 */
export async function listEpicComments(args) {
  return callZephlyAPI('mcpListEpicComments', args);
}

/**
 * Post to an epic's discussion, or reply in a thread (E-259).
 */
export async function addEpicComment(args) {
  return callZephlyAPI('mcpAddEpicComment', args);
}
