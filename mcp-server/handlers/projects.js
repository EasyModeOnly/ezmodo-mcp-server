/**
 * Project Handlers
 * Handler functions for project-related MCP tools
 */

import { callZephlyAPI } from '../lib/http-client.js';

/**
 * Dispatch manage_project actions
 */
export async function manageProject(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createProject(params);
  case 'update': return updateProject(params);
  case 'generate_how_it_works': return generateProjectHowItWorks(params);
  case 'apply_how_it_works': return applyProjectHowItWorks(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Unified get_project handler — by ID (context), search, or list all
 */
export async function getProject(args) {
  const { projectId, query } = args;

  // Mode 1: get project context by ID
  if (projectId) {
    return callZephlyAPI('mcpGetProjectContext', { projectId });
  }

  // Mode 2: search by query text, or list all
  if (query || args.type || args.organizationId) {
    return searchProjects(args);
  }

  // Mode 3: list all
  return callZephlyAPI('mcpListProjects', {});
}

async function createProject(args) {
  return callZephlyAPI('mcpCreateProject', args);
}

// Update an existing project. Only the fields present in `args` are changed —
// the server leaves anything unmentioned alone. This is the path that lets an
// agent set gitUrl/gitProvider after creation, which is what commit-to-task
// linking and feature link resolution key off.
async function updateProject(args) {
  return callZephlyAPI('mcpUpdateProject', args);
}

// Generate (and persist) the project's grounded "how it works" living description
// via the model. AI-quota gated server-side (mirrors entities.generateGoalHowItWorks).
async function generateProjectHowItWorks({ projectId }) {
  return callZephlyAPI('mcpGenerateProjectHowItWorks', { projectId });
}

// Apply (persist) a LOCAL-agent-authored "how it works" for a project (BYO-AI,
// E-190). Cited sources are validated server-side before saving; no model call.
async function applyProjectHowItWorks({ projectId, markdown, sources }) {
  return callZephlyAPI('mcpApplyProjectHowItWorks', { projectId, markdown, sources });
}

// Project Story (E-208): a grounded, source-attributed narrative of what has
// happened to a project since it began. Returns a fresh cached story when
// available, otherwise generates one (AI-quota gated server-side).
export async function getProjectStory({ projectId, window, from, to }) {
  return callZephlyAPI('mcpGetProjectStory', { projectId, window, from, to });
}

async function searchProjects(args) {
  const {
    query: searchText,
    type,
    organizationId,
    limit = 50,
  } = args;

  try {
    const allProjects = await callZephlyAPI('mcpListProjects', {});

    // callZephlyAPI already unwrapped the {success, data} envelope, so what
    // arrives is `{projects: [...]}` with no `success` flag. Testing for one
    // sent every search down this branch and returned the whole unfiltered
    // list -- a `query` that matched nothing was indistinguishable from one
    // that matched everything.
    if (!Array.isArray(allProjects?.projects)) {
      return allProjects;
    }

    let filtered = allProjects.projects;

    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter((project) =>
        project.name.toLowerCase().includes(searchLower) ||
        (project.description && project.description.toLowerCase().includes(searchLower))
      );
    }

    if (type) {
      filtered = filtered.filter((project) => project.type === type);
    }

    if (organizationId) {
      filtered = filtered.filter((project) => project.organizationId === organizationId);
    }

    filtered = filtered.slice(0, limit);

    return {
      success: true,
      projects: filtered,
      count: filtered.length,
      totalBeforeLimit: allProjects.projects.length,
    };
  } catch (error) {
    throw new Error(`Failed to search projects: ${error.message}`);
  }
}
