/**
 * AI Intelligence Handlers
 * Handler functions for project insights and intelligent analysis
 *
 * Consolidated: getAiInsights dispatches by type param.
 */

import { callEzmodoAPI } from '../lib/http-client.js';

/**
 * Dispatch get_ai_insights by type to the appropriate handler
 */
export async function getAiInsights(args) {
  const { type, ...params } = args;
  switch (type) {
  case 'project_insights': return getProjectInsights(params);
  case 'suggest_next': return suggestNextActions(params);
  case 'dependency_graph': return analyzeDependencyGraph(params);
  case 'build_failure': return analyzeBuildFailure(params);
  case 'deployment_risk': return predictDeploymentRisk(params);
  default: throw new Error(`Unknown insight type: ${type}`);
  }
}

// --- Private helpers ---

async function getProjectInsights(args) {
  return callEzmodoAPI('mcpGetProjectInsights', args);
}

async function suggestNextActions(args) {
  return callEzmodoAPI('mcpSuggestNextActions', args);
}

async function analyzeDependencyGraph(args) {
  return callEzmodoAPI('mcpAnalyzeDependencyGraph', args);
}

async function analyzeBuildFailure(args) {
  return callEzmodoAPI('mcpAnalyzeBuildFailure', args);
}

async function predictDeploymentRisk(args) {
  return callEzmodoAPI('mcpPredictDeploymentRisk', args);
}

export async function estimateTask(args) {
  const { taskId } = args;
  return callEzmodoAPI('mcpEstimateTask', { taskId });
}

export async function inferDependencies(args) {
  const { projectId } = args;
  return callEzmodoAPI('mcpGetInferredDependencies', { projectId });
}
