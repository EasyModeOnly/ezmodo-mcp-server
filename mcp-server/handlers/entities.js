/**
 * Entity Handlers
 * Handler functions for goals, teams, and labels
 *
 * Consolidated: manageGoal dispatches create/update/delete.
 * manageTeam dispatches create.
 * getGoal unifies get (by ID or number) and list.
 */

import { callEzmodoAPI } from '../lib/http-client.js';
import { buildGoalUrl } from '../lib/web-url.js';

/**
 * Dispatch manage_goal actions to the appropriate handler
 */
export async function manageGoal(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createGoal(params);
  case 'update': return updateGoal(params);
  case 'delete': return deleteGoal(params);
  case 'generate_how_it_works': return generateGoalHowItWorks(params);
  case 'apply_how_it_works': return applyGoalHowItWorks(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Dispatch manage_team actions to the appropriate handler
 */
export async function manageTeam(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createTeam(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified get/list handler for goals
 */
export async function getGoal(args) {
  // Single goal lookup by ID or number
  if (args.goalId || args.goalNumber) {
    const result = await callEzmodoAPI('mcpGetGoal', args);
    const goalId = result?.goal?.id || result?.goal?.goalId;
    const webUrl = await buildGoalUrl(goalId);
    if (webUrl && result?.goal) result.goal.webUrl = webUrl;
    return result;
  }

  // List mode
  return callEzmodoAPI('mcpListGoals', args);
}

// --- Private helpers ---

async function createGoal(args) {
  const result = await callEzmodoAPI('mcpCreateGoal', args);
  const webUrl = await buildGoalUrl(result?.goalId);
  if (webUrl) result.webUrl = webUrl;
  return result;
}

async function updateGoal(args) {
  return callEzmodoAPI('mcpUpdateGoal', args);
}

async function deleteGoal(args) {
  return callEzmodoAPI('mcpDeleteGoal', args);
}

// Generate (and persist) the goal's grounded "how it works" living description
// via the model. AI-quota gated server-side (mirrors features.generateHowItWorks).
async function generateGoalHowItWorks({ goalId }) {
  const result = await callEzmodoAPI('mcpGenerateGoalHowItWorks', { goalId });
  const id = result?.goal?.id || result?.goal?.goalId || goalId;
  const webUrl = await buildGoalUrl(id);
  if (webUrl && result?.goal) result.goal.webUrl = webUrl;
  return result;
}

// Apply (persist) a LOCAL-agent-authored "how it works" for a goal (BYO-AI,
// E-190). Cited sources are validated server-side before saving; no model call.
async function applyGoalHowItWorks({ goalId, markdown, sources }) {
  const result = await callEzmodoAPI('mcpApplyGoalHowItWorks', { goalId, markdown, sources });
  const id = result?.goal?.id || result?.goal?.goalId || goalId;
  const webUrl = await buildGoalUrl(id);
  if (webUrl && result?.goal) result.goal.webUrl = webUrl;
  return result;
}

async function createTeam(args) {
  return callEzmodoAPI('mcpCreateTeam', args);
}
