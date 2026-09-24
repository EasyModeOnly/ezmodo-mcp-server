/**
 * GitHub Handlers
 * Handler functions for GitHub-related MCP tools
 *
 * Consolidated: managePullRequest dispatches create/update/merge/close/request_review.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/**
 * List the git repositories linked to a project, each with the `repoId` every
 * manage_pull_request action requires.
 *
 * This exists because that id was otherwise unknowable. It is
 * `installationId:owner/repo`, and no other tool exposes an installation id:
 * get_project returns `settings.integrations: null`, get_current_project_context
 * has no repo fields, and GitHub will not tell an agent either — the endpoints
 * that would (`/repos/{owner}/{repo}/installation`, `/user/installations`) need
 * an app JWT or an app-authorized token. ezmodo holds the fact, so ezmodo has
 * to hand it over.
 */
export async function listRepositories({ projectId }) {
  return callEzmodoAPI('mcpListRepositories', { projectId });
}

/**
 * Dispatch manage_pull_request actions to the appropriate handler
 */
export async function managePullRequest(args) {
  const { action, ...params } = args;
  switch (action) {
  case 'create': return createPullRequest(params);
  case 'update': return updatePullRequest(params);
  case 'merge': return mergePullRequest(params);
  case 'close': return closePullRequest(params);
  case 'request_review': return requestPRReview(params);
  case 'suggest_reviewers': return suggestReviewers(params);
  default: throw new Error(`Unknown action: ${action}`);
  }
}

// --- Private helpers ---

async function createPullRequest(args) {
  return callEzmodoAPI('mcpCreatePullRequest', args);
}

async function updatePullRequest(args) {
  return callEzmodoAPI('mcpUpdatePullRequest', args);
}

async function mergePullRequest(args) {
  return callEzmodoAPI('mcpMergePullRequest', args);
}

async function closePullRequest(args) {
  return callEzmodoAPI('mcpClosePullRequest', args);
}

async function requestPRReview(args) {
  return callEzmodoAPI('mcpRequestPRReview', args);
}

/**
 * Ranks reviewer candidates from CODEOWNERS and file history. Suggests only —
 * requesting the review is the separate 'request_review' action, because
 * pinging the wrong three people is a social cost a suggestion tool has no
 * business incurring on its own.
 */
async function suggestReviewers(args) {
  return callEzmodoAPI('mcpSuggestReviewers', args);
}
