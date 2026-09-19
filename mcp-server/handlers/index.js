/**
 * Handler Functions Index
 * Aggregates all MCP handler functions
 *
 * Consolidated handler set matching the ~40-tool definitions.
 * Each manage_* handler dispatches to internal helpers based on action param.
 */

import * as organizationHandlers from './organizations.js';
import * as projectHandlers from './projects.js';
import * as epicHandlers from './epics.js';
import * as milestoneHandlers from './milestones.js';
import * as featureHandlers from './features.js';
import * as decisionHandlers from './decisions.js';
import * as designHandlers from './designs.js';
import * as catalogHandlers from './catalogs.js';
import * as unmappedPathHandlers from './unmapped-paths.js';
import * as featureFlagHandlers from './feature-flags.js';
import * as taskHandlers from './tasks.js';
import * as documentHandlers from './documents.js';
import * as folderHandlers from './folders.js';
import * as attachmentHandlers from './attachments.js';
import * as entityHandlers from './entities.js';
import * as linkHandlers from './links.js';
import * as accessHandlers from './access.js';
import * as graphHandlers from './graph.js';
import * as tagHandlers from './tags.js';
import * as watcherHandlers from './watchers.js';
import * as aiIntelligenceHandlers from './ai-intelligence.js';
import * as gitContextHandlers from './git-context.js';
import * as githubHandlers from './github.js';
import * as todoHandlers from './todos.js';
import * as testingHandlers from './testing.js';
import * as contextManifestHandlers from './context-manifest.js';
import * as activityHandlers from './activity.js';
import * as factHandlers from './facts.js';
import * as agentHandlers from './agents.js';
import * as recurringTaskHandlers from './recurring-tasks.js';
import * as workTemplateHandlers from './work-templates.js';
import { manageWorktree, listProjectWorktrees } from '../lib/worktree-tools.js';
import { authenticate } from './auth.js';

/**
 * Map of tool names to handler functions
 * Used by the MCP server to route tool calls
 */
export const HANDLERS = {
  authenticate,
  // Organizations
  get_organization: organizationHandlers.getOrganization,

  // Projects
  manage_project: projectHandlers.manageProject,
  get_project: projectHandlers.getProject,
  get_project_story: projectHandlers.getProjectStory,

  // Epics
  manage_epic: epicHandlers.manageEpic,
  search_epics: epicHandlers.searchEpics,
  list_epics: epicHandlers.listEpics,
  get_epic: epicHandlers.getEpic,
  get_epic_plan: epicHandlers.getEpicPlan,
  update_epic_plan: epicHandlers.updateEpicPlan,
  list_epic_comments: epicHandlers.listEpicComments,
  get_epic_activity: epicHandlers.getEpicActivity,
  add_epic_comment: epicHandlers.addEpicComment,

  // Milestones
  manage_milestone: milestoneHandlers.manageMilestone,
  get_milestone: milestoneHandlers.getMilestone,

  // Features (Feature Compendium, E-162)
  manage_feature: featureHandlers.manageFeature,
  get_feature: featureHandlers.getFeature,
  search_features: featureHandlers.searchFeatures,

  // Decisions / ADRs (E-170)
  manage_decision: decisionHandlers.manageDecision,
  get_decision: decisionHandlers.getDecision,

  // Recurring task schedules + work templates (E-211)
  manage_recurring_task: recurringTaskHandlers.manageRecurringTask,
  manage_work_template: workTemplateHandlers.manageWorkTemplate,

  // Designs (living design system)
  manage_design: designHandlers.manageDesign,
  get_design: designHandlers.getDesign,
  list_designs: designHandlers.listDesigns,
  get_design_system: designHandlers.getDesignSystem,

  // Catalogs (generalized code-derived catalogs, E-215)
  manage_catalog: catalogHandlers.manageCatalog,
  get_catalog: catalogHandlers.getCatalog,
  list_catalogs: catalogHandlers.listCatalogs,
  list_unmapped_paths: unmappedPathHandlers.listUnmappedPaths,
  resolve_unmapped: unmappedPathHandlers.resolveUnmapped,
  list_catalog_items: catalogHandlers.listCatalogItems,
  get_catalog_diff: catalogHandlers.getCatalogDiff,

  // Feature Flags (E-149)
  manage_feature_flag: featureFlagHandlers.manageFeatureFlag,
  get_feature_flag: featureFlagHandlers.getFeatureFlag,
  list_feature_flags: featureFlagHandlers.listFeatureFlags,
  evaluate_feature_flag: featureFlagHandlers.evaluateFeatureFlag,
  manage_environment: featureFlagHandlers.manageEnvironment,

  // Tasks
  manage_task: taskHandlers.manageTask,
  create_tasks: taskHandlers.bulkCreateTasks,
  search_tasks: taskHandlers.searchTasks,
  get_task: taskHandlers.getTask,
  report_untracked_work: taskHandlers.reportUntrackedWork,

  // Documents
  manage_document: documentHandlers.manageDocument,
  manage_document_template: documentHandlers.manageDocumentTemplate,
  get_document: documentHandlers.getDocument,
  get_document_template: documentHandlers.getDocumentTemplate,
  list_org_documents: documentHandlers.listOrgDocuments,

  // Folders
  manage_folder: folderHandlers.manageFolder,
  list_folders: folderHandlers.listFolders,
  get_org_areas: folderHandlers.getOrgAreas,

  // Attachments (read/manage only — E-21 #158)
  list_attachments: attachmentHandlers.listAttachments,
  get_attachment_url: attachmentHandlers.getAttachmentUrl,
  delete_attachment: attachmentHandlers.deleteAttachment,

  // Entities (goals, teams)
  manage_goal: entityHandlers.manageGoal,
  manage_team: entityHandlers.manageTeam,
  get_goal: entityHandlers.getGoal,

  // Tags
  manage_tag: tagHandlers.manageTag,
  list_tags: tagHandlers.listTags,

  // Watching / subscriptions (E-41)
  manage_watch: watcherHandlers.manageWatch,
  list_watched: watcherHandlers.listWatched,
  list_notifications: watcherHandlers.listNotifications,

  // Links (polymorphic entity_links — task/epic/project/document)
  manage_link: linkHandlers.manageLink,
  list_links: linkHandlers.listLinks,
  resolve_links: linkHandlers.resolveLinks,
  preview_links: linkHandlers.previewLinks,

  // Entity access control (#2170) — polymorphic over the types the access
  // service supports. Mutations need an API key with the write:access scope.
  get_access: accessHandlers.getAccess,
  manage_access: accessHandlers.manageAccess,

  // Navigation graph (E-209) — walk the compendium from a root node
  get_graph: graphHandlers.getGraph,

  // Background agents (E-150)
  list_agent_suggestions: agentHandlers.listAgentSuggestions,
  resolve_link_suggestions: agentHandlers.resolveLinkSuggestions,
  accept_agent_suggestion: agentHandlers.acceptAgentSuggestion,
  reject_agent_suggestion: agentHandlers.rejectAgentSuggestion,
  run_agent_now: agentHandlers.runAgentNow,
  configure_agent: agentHandlers.configureAgent,

  // AI Intelligence
  get_ai_insights: aiIntelligenceHandlers.getAiInsights,
  estimate_task: aiIntelligenceHandlers.estimateTask,
  infer_dependencies: aiIntelligenceHandlers.inferDependencies,

  // Git Context
  detect_git_repository: gitContextHandlers.detectGitRepository,
  get_current_project_context: gitContextHandlers.getCurrentProjectContext,
  initialize_project_context: gitContextHandlers.initializeProjectContext,

  // Worktrees
  manage_worktree: manageWorktree,
  list_project_worktrees: listProjectWorktrees,

  // GitHub
  manage_pull_request: githubHandlers.managePullRequest,
  list_repositories: githubHandlers.listRepositories,

  // Todos
  manage_todo: todoHandlers.manageTodo,
  list_todos: todoHandlers.listTodos,

  // Testing
  manage_test_case: testingHandlers.manageTestCase,
  manage_test_suite: testingHandlers.manageTestSuite,
  list_test_cases: testingHandlers.listTestCases,
  list_test_suites: testingHandlers.listTestSuites,
  get_testing_summary: testingHandlers.getTestingSummary,

  // Activity Timeline
  get_project_changes: activityHandlers.getProjectChanges,

  // Facts
  manage_fact: factHandlers.manageFact,
  list_facts: factHandlers.listFacts,

  // Context Manifest
  get_context: contextManifestHandlers.getContext,
  rebuild_manifest: contextManifestHandlers.rebuildManifest,
  update_manifest_entries: contextManifestHandlers.updateManifestEntriesHandler,
  get_manifest_schema: contextManifestHandlers.getManifestSchema,
  validate_manifest: contextManifestHandlers.validateManifest,
  resolve_concepts: contextManifestHandlers.resolveConcepts,
};
