/**
 * Endpoint Mapping: Cloud Functions → Go API
 * Maps Cloud Functions endpoint names to Go API routes and HTTP methods
 *
 * Unified Hierarchy (Phase 6 - Simplified Data Model):
 * - Projects - long-lived containers (primary)
 * - Epics - related tasks grouped (project-scoped milestones)
 */

export const ENDPOINT_MAP = {
  // Organizations
  'mcpListOrganizations': { route: 'mcp/v1/organizations', method: 'GET' },
  'mcpGetDefaultOrganization': { route: 'mcp/v1/organizations/default', method: 'GET' },

  // Projects (primary)
  'mcpListProjects': { route: 'mcp/v1/projects', method: 'GET' },
  'mcpSearchProjects': { route: 'mcp/v1/projects/search', method: 'POST' },
  'mcpGetProjectContext': { route: 'mcp/v1/projects/context', method: 'GET' },
  'mcpGetProjectStory': { route: 'mcp/v1/projects/story', method: 'POST' },
  'mcpCreateProject': { route: 'mcp/v1/projects', method: 'POST' },
  'mcpUpdateProject': { route: 'mcp/v1/projects', method: 'PUT' },
  'mcpGenerateProjectHowItWorks': { route: 'mcp/v1/projects/generate-how-it-works', method: 'POST' },
  'mcpApplyProjectHowItWorks': { route: 'mcp/v1/projects/apply-how-it-works', method: 'POST' },

  // Epics (project-scoped milestones)
  'mcpCreateEpic': { route: 'mcp/v1/epics', method: 'POST' },
  'mcpCreateEpicWithTasks': { route: 'mcp/v1/epics/with-tasks', method: 'POST' },
  'mcpUpdateEpic': { route: 'mcp/v1/epics', method: 'PUT' },
  'mcpSearchEpics': { route: 'mcp/v1/epics/search', method: 'POST' },
  'mcpListEpics': { route: 'mcp/v1/epics', method: 'GET' },
  'mcpGetEpic': { route: 'mcp/v1/epics/by-id', method: 'GET' },
  // E-259: epic plan with revisions.
  'mcpGetEpicPlan': { route: 'mcp/v1/epics/plan', method: 'GET' },
  'mcpUpdateEpicPlan': { route: 'mcp/v1/epics/plan', method: 'PUT' },
  'mcpListEpicComments': { route: 'mcp/v1/epics/comments', method: 'GET' },
  // Catch me up (E-259 #2746).
  'mcpGetEpicActivity': { route: 'mcp/v1/epics/activity', method: 'GET' },
  // Plan proposals (E-259 #2745): suggest a change to a plan you cannot save.
  'mcpListPlanProposals': { route: 'mcp/v1/epics/proposals', method: 'GET' },
  'mcpProposePlanChange': { route: 'mcp/v1/epics/proposals', method: 'POST' },
  'mcpReviewPlanProposal': { route: 'mcp/v1/epics/proposals/review', method: 'POST' },
  'mcpAddEpicComment': { route: 'mcp/v1/epics/comments', method: 'POST' },
  // Editors (E-259 #2802): who the owner lets change the plan.
  'mcpManageEpicEditors': { route: 'mcp/v1/epics/editors', method: 'POST' },
  // E-237 #2382: the epic is the fifth consumer of the grounding engine.
  'mcpGenerateEpicHowItWorks': { route: 'mcp/v1/epics/generate-how-it-works', method: 'POST' },
  'mcpApplyEpicHowItWorks': { route: 'mcp/v1/epics/apply-how-it-works', method: 'POST' },

  // Tasks
  'mcpCreateTask': { route: 'mcp/v1/tasks', method: 'POST' },
  // Claims (E-259 #2747): manage_task action "claim" / "release".
  'mcpClaimTask': { route: 'mcp/v1/tasks/claim', method: 'POST' },
  // Suggested edits on someone else's claimed task (E-259 #2809).
  'mcpTaskSuggestedEdits': { route: 'mcp/v1/tasks/suggested-edits', method: 'POST' },
  'mcpBulkCreateTasks': { route: 'mcp/v1/tasks/bulk', method: 'POST' },
  'mcpUpdateTask': { route: 'mcp/v1/tasks', method: 'PUT' },
  'mcpCompleteTask': { route: 'mcp/v1/tasks/complete', method: 'POST' },
  'mcpDeferTask': { route: 'mcp/v1/tasks/defer', method: 'POST' },
  'mcpSearchTasks': { route: 'mcp/v1/tasks/search', method: 'POST' },
  'mcpSemanticTaskSearch': { route: 'mcp/v1/tasks/semantic-search', method: 'POST' },
  'mcpGetTask': { route: 'mcp/v1/tasks/by-id', method: 'GET' },
  'mcpAddTaskContext': { route: 'mcp/v1/tasks/context', method: 'POST' },
  'mcpLinkCommitToTask': { route: 'mcp/v1/tasks/link-commit', method: 'POST' },
  'mcpUnlinkCommitFromTask': { route: 'mcp/v1/tasks/unlink-commit', method: 'POST' },
  'mcpGetTaskCommits': { route: 'mcp/v1/tasks/commits', method: 'GET' },
  'mcpGenerateTaskHowItWorks': { route: 'mcp/v1/tasks/generate-how-it-works', method: 'POST' },
  'mcpApplyTaskHowItWorks': { route: 'mcp/v1/tasks/apply-how-it-works', method: 'POST' },

  // Watching / subscriptions and the notification inbox (E-41)
  'mcpManageWatch': { route: 'mcp/v1/watch', method: 'POST' },
  'mcpListWatched': { route: 'mcp/v1/watching', method: 'GET' },
  'mcpListNotifications': { route: 'mcp/v1/notifications', method: 'GET' },

  // Documentation
  'mcpGetDocumentation': { route: 'mcp/v1/documents', method: 'GET' },
  'mcpGetDocument': { route: 'mcp/v1/documents/by-id', method: 'GET' },
  'mcpCreateDocument': { route: 'mcp/v1/documents', method: 'POST' },
  'mcpUpdateDocument': { route: 'mcp/v1/documents', method: 'PUT' },
  // Org-scoped (project-less) document listing (E-195)
  'mcpListOrgDocuments': { route: 'mcp/v1/org-documents', method: 'GET' },

  // Document Versions (list/get only — create not yet implemented in Go API)
  'mcpListDocumentVersions': { route: 'mcp/v1/document-versions', method: 'GET' },
  'mcpGetDocumentVersion': { route: 'mcp/v1/document-versions/by-number', method: 'GET' },

  // Document Templates
  'mcpListDocumentTemplates': { route: 'mcp/v1/document-templates', method: 'GET' },
  'mcpGetDocumentTemplate': { route: 'mcp/v1/document-templates/by-id', method: 'GET' },
  'mcpCreateDocumentTemplate': { route: 'mcp/v1/document-templates', method: 'POST' },
  'mcpDeleteDocumentTemplate': { route: 'mcp/v1/document-templates', method: 'DELETE' },

  // Attachments (read/manage only — E-21 #158)
  'mcpListAttachments': { route: 'mcp/v1/attachments', method: 'GET' },
  'mcpGetAttachmentUrl': { route: 'mcp/v1/attachments/download-url', method: 'POST' },
  'mcpDeleteAttachment': { route: 'mcp/v1/attachments', method: 'DELETE' },

  // Document Folders
  'mcpListFolders': { route: 'mcp/v1/folders', method: 'GET' },
  'mcpGetFolderTree': { route: 'mcp/v1/folders/tree', method: 'GET' },
  'mcpCreateFolder': { route: 'mcp/v1/folders', method: 'POST' },
  'mcpUpdateFolder': { route: 'mcp/v1/folders', method: 'PUT' },
  'mcpMoveFolder': { route: 'mcp/v1/folders/move', method: 'POST' },
  'mcpDeleteFolder': { route: 'mcp/v1/folders', method: 'DELETE' },
  // Org reserved areas (Goals, Features, ADRs, How it works) — ensures + lists (E-195)
  'mcpGetOrgAreas': { route: 'mcp/v1/org-areas', method: 'GET' },

  // Goals
  'mcpCreateGoal': { route: 'mcp/v1/goals', method: 'POST' },
  'mcpGetGoal': { route: 'mcp/v1/goals/by-id', method: 'GET' },
  'mcpUpdateGoal': { route: 'mcp/v1/goals', method: 'PUT' },
  'mcpListGoals': { route: 'mcp/v1/goals', method: 'GET' },
  'mcpDeleteGoal': { route: 'mcp/v1/goals', method: 'DELETE' },
  'mcpGenerateGoalHowItWorks': { route: 'mcp/v1/goals/generate-how-it-works', method: 'POST' },
  'mcpApplyGoalHowItWorks': { route: 'mcp/v1/goals/apply-how-it-works', method: 'POST' },

  // Tags (organization-scoped categorization)
  'mcpCreateTag': { route: 'mcp/v1/tags', method: 'POST' },
  'mcpListTags': { route: 'mcp/v1/tags', method: 'GET' },
  'mcpGetTag': { route: 'mcp/v1/tags/by-id', method: 'GET' },
  'mcpUpdateTag': { route: 'mcp/v1/tags', method: 'PUT' },
  'mcpDeleteTag': { route: 'mcp/v1/tags', method: 'DELETE' },
  'mcpMergeTags': { route: 'mcp/v1/tags/merge', method: 'POST' },
  'mcpBulkTagEntities': { route: 'mcp/v1/tags/bulk', method: 'POST' },
  'mcpFindEntitiesByTags': { route: 'mcp/v1/tags/find-entities', method: 'POST' },
  'mcpSuggestTags': { route: 'mcp/v1/tags/suggest', method: 'POST' }, // AI-powered semantic tag suggestions

  // Teams
  'mcpCreateTeam': { route: 'mcp/v1/teams', method: 'POST' },

  // Organization analysis
  'mcpAnalyzeProjectOrganization': { route: 'mcp/v1/organization/analyze', method: 'POST' },

  // AI Intelligence endpoints
  'mcpGetProjectInsights': { route: 'mcp/v1/insights/project', method: 'POST' },
  'mcpSuggestNextActions': { route: 'mcp/v1/insights/suggest-next', method: 'POST' },
  'mcpAnalyzeDependencyGraph': { route: 'mcp/v1/insights/dependency-graph', method: 'POST' },
  'mcpAnalyzeBuildFailure': { route: 'mcp/v1/insights/build-failure', method: 'POST' },
  'mcpPredictDeploymentRisk': { route: 'mcp/v1/insights/deployment-risk', method: 'POST' },

  'mcpEstimateTask': { route: 'mcp/v1/intelligence/estimate', method: 'GET' },
  'mcpGetInferredDependencies': { route: 'mcp/v1/intelligence/inferred-dependencies', method: 'GET' },

  // Entity access control (#2170). Reads take the optional read:access scope;
  // the three mutations require the dedicated write:access scope server-side.
  'mcpGetAccess': { route: 'mcp/v1/access', method: 'GET' },
  'mcpUpdateAccess': { route: 'mcp/v1/access', method: 'PUT' },
  'mcpAddAccessEntry': { route: 'mcp/v1/access/entries', method: 'POST' },
  'mcpRemoveAccessEntry': { route: 'mcp/v1/access/entries', method: 'DELETE' },
  'mcpCheckAccess': { route: 'mcp/v1/access/check', method: 'POST' },

  // Polymorphic links — single CRUD surface for any entity_links row
  // (blocked_by, relates_to) across tasks, epics, projects, documents.
  'mcpAddLink':    { route: 'mcp/v1/links', method: 'POST' },
  'mcpRemoveLink': { route: 'mcp/v1/links', method: 'DELETE' },
  'mcpListLinks':  { route: 'mcp/v1/links', method: 'GET' },
  'mcpVerifyLink': { route: 'mcp/v1/links/verify', method: 'POST' },
  // E-225 read-only autolink surfaces. POST rather than GET because both take a
  // list of paths: a query string flattens an array to a comma-joined value,
  // and file paths may legitimately contain commas.
  'mcpResolvePaths': { route: 'mcp/v1/links/resolve-paths', method: 'POST' },
  'mcpPreviewLinks': { route: 'mcp/v1/links/preview', method: 'POST' },
  // No 'mcpLinkSuggestions' here on purpose: mcp/v1/links/suggestions reads the
  // same agent_suggestions rows as mcpListAgentSuggestions below, which already
  // has a tool. Two ways to read one queue is how they drift apart (#2297).

  // E-150 background-agent control plane. Suggestions live in
  // agent_suggestions; accept/reject mutate state via core/agents.Dispatcher.
  'mcpListAgentSuggestions':   { route: 'mcp/v1/agent-suggestions', method: 'GET' },
  'mcpAcceptAgentSuggestion':  { route: 'mcp/v1/agent-suggestions/accept', method: 'POST' },
  'mcpRejectAgentSuggestion':  { route: 'mcp/v1/agent-suggestions/reject', method: 'POST' },
  'mcpRunAgentNow':            { route: 'mcp/v1/agent-runs', method: 'POST' },
  'mcpConfigureAgent':         { route: 'mcp/v1/agent-settings', method: 'PUT' },

  // Project facts — long-lived knowledge entries (decisions, conventions,
  // reference info). The MCP handlers in handlers/facts.js were already
  // calling these aliases; adding the route mappings here so they don't
  // hit "Unknown endpoint".
  'mcpCreateFact': { route: 'mcp/v1/facts', method: 'POST' },
  'mcpListFacts':  { route: 'mcp/v1/facts', method: 'GET' },
  'mcpUpdateFact': { route: 'mcp/v1/facts', method: 'PUT' },
  'mcpDeleteFact': { route: 'mcp/v1/facts', method: 'DELETE' },

  // Milestones (version releases and initiatives)
  'mcpCreateMilestone': { route: 'mcp/v1/milestones', method: 'POST' },
  'mcpGetMilestone': { route: 'mcp/v1/milestones/by-id', method: 'GET' },
  'mcpUpdateMilestone': { route: 'mcp/v1/milestones', method: 'PUT' },
  'mcpListMilestones': { route: 'mcp/v1/milestones', method: 'GET' },
  'mcpDeleteMilestone': { route: 'mcp/v1/milestones', method: 'DELETE' },
  // Epic-to-milestone linking
  'mcpLinkEpicToMilestone': { route: 'mcp/v1/milestones/link-epic', method: 'POST' },
  'mcpUnlinkEpicFromMilestone': { route: 'mcp/v1/milestones/unlink-epic', method: 'POST' },
  'mcpGenerateMilestoneChangelog': { route: 'mcp/v1/milestones/generate-changelog', method: 'POST' },
  'mcpGetMilestoneProgress': { route: 'mcp/v1/milestones/progress', method: 'GET' },
  'mcpReorderMilestoneEpics': { route: 'mcp/v1/milestones/reorder-epics', method: 'POST' },
  // Suite-to-milestone linking
  'mcpLinkSuiteToMilestone': { route: 'mcp/v1/milestones/link-suite', method: 'POST' },
  'mcpUnlinkSuiteFromMilestone': { route: 'mcp/v1/milestones/unlink-suite', method: 'POST' },

  // Features (Feature Compendium, E-162) — org-level product capabilities
  'mcpCreateFeature': { route: 'mcp/v1/features', method: 'POST' },
  'mcpGetFeature': { route: 'mcp/v1/features/by-id', method: 'GET' },
  'mcpListFeatures': { route: 'mcp/v1/features', method: 'GET' },
  'mcpUpdateFeature': { route: 'mcp/v1/features', method: 'PUT' },
  'mcpDeleteFeature': { route: 'mcp/v1/features', method: 'DELETE' },
  'mcpListFeatureLinks': { route: 'mcp/v1/features/links', method: 'GET' },
  'mcpGetFeatureDetail': { route: 'mcp/v1/features/detail', method: 'GET' },
  'mcpSearchFeatures': { route: 'mcp/v1/features/search', method: 'GET' },
  'mcpLinkFeatureArtifact': { route: 'mcp/v1/features/link', method: 'POST' },
  'mcpUnlinkFeatureArtifact': { route: 'mcp/v1/features/link', method: 'DELETE' },
  'mcpListFeaturePaths': { route: 'mcp/v1/features/paths', method: 'GET' },
  'mcpSetFeaturePaths': { route: 'mcp/v1/features/paths', method: 'PUT' },
  'mcpPromoteEpicToFeature': { route: 'mcp/v1/features/promote-epic', method: 'POST' },
  'mcpGenerateHowItWorks': { route: 'mcp/v1/features/generate-how-it-works', method: 'POST' },
  'mcpApplyHowItWorks': { route: 'mcp/v1/features/apply-how-it-works', method: 'POST' },
  'mcpApplyFeatureInit': { route: 'mcp/v1/features/init-apply', method: 'POST' },

  // Decisions / ADRs (E-170) — org-level durable decision records that link to
  // features and other artifacts via the generic link graph.
  'mcpCreateDecision': { route: 'mcp/v1/decisions', method: 'POST' },
  'mcpListDecisions': { route: 'mcp/v1/decisions', method: 'GET' },
  'mcpGetDecision': { route: 'mcp/v1/decisions/by-id', method: 'GET' },
  'mcpListDecisionLinks': { route: 'mcp/v1/decisions/links', method: 'GET' },
  'mcpUpdateDecision': { route: 'mcp/v1/decisions', method: 'PUT' },
  'mcpDeleteDecision': { route: 'mcp/v1/decisions', method: 'DELETE' },
  'mcpSupersedeDecision': { route: 'mcp/v1/decisions/supersede', method: 'POST' },
  'mcpPromoteDecisionFromKnowledge': { route: 'mcp/v1/decisions/promote-from-knowledge', method: 'POST' },
  'mcpLinkDecisionArtifact': { route: 'mcp/v1/decisions/link', method: 'POST' },
  'mcpUnlinkDecisionArtifact': { route: 'mcp/v1/decisions/link', method: 'DELETE' },
  // Decisions to make on an epic (E-259).
  'mcpAddDecisionInput': { route: 'mcp/v1/decisions/inputs', method: 'POST' },
  'mcpDecideDecision': { route: 'mcp/v1/decisions/decide', method: 'POST' },
  'mcpHoldTaskForDecision': { route: 'mcp/v1/decisions/holds', method: 'POST' },
  'mcpReleaseTaskFromDecision': { route: 'mcp/v1/decisions/holds', method: 'DELETE' },

  // Recurring task schedules (E-211) — "what task to create, on what cadence".
  'mcpCreateRecurringTask': { route: 'mcp/v1/recurring-tasks', method: 'POST' },
  'mcpListRecurringTasks': { route: 'mcp/v1/recurring-tasks', method: 'GET' },
  'mcpGetRecurringTask': { route: 'mcp/v1/recurring-tasks/by-id', method: 'GET' },
  'mcpUpdateRecurringTask': { route: 'mcp/v1/recurring-tasks', method: 'PUT' },
  'mcpPauseRecurringTask': { route: 'mcp/v1/recurring-tasks/pause', method: 'POST' },
  'mcpResumeRecurringTask': { route: 'mcp/v1/recurring-tasks/resume', method: 'POST' },
  'mcpDeleteRecurringTask': { route: 'mcp/v1/recurring-tasks', method: 'DELETE' },

  // Work templates (E-211) — reusable task/epic blueprints + instantiate.
  'mcpCreateWorkTemplate': { route: 'mcp/v1/work-templates', method: 'POST' },
  'mcpListWorkTemplates': { route: 'mcp/v1/work-templates', method: 'GET' },
  'mcpGetWorkTemplate': { route: 'mcp/v1/work-templates/by-id', method: 'GET' },
  'mcpUpdateWorkTemplate': { route: 'mcp/v1/work-templates', method: 'PUT' },
  'mcpDeleteWorkTemplate': { route: 'mcp/v1/work-templates', method: 'DELETE' },
  'mcpInstantiateWorkTemplate': { route: 'mcp/v1/work-templates/instantiate', method: 'POST' },

  // Designs (the in-product living design system) — org-level AI-authored HTML/CSS
  // artifacts (kind theme|component|page) that link to features and other artifacts.
  'mcpCreateDesign': { route: 'mcp/v1/designs', method: 'POST' },
  'mcpListDesigns': { route: 'mcp/v1/designs', method: 'GET' },
  'mcpGetDesign': { route: 'mcp/v1/designs/by-id', method: 'GET' },
  'mcpGetDesignSystem': { route: 'mcp/v1/designs/system', method: 'GET' },
  'mcpListDesignLinks': { route: 'mcp/v1/designs/links', method: 'GET' },
  'mcpUpdateDesign': { route: 'mcp/v1/designs', method: 'PUT' },
  'mcpDeleteDesign': { route: 'mcp/v1/designs', method: 'DELETE' },
  'mcpLinkDesign': { route: 'mcp/v1/designs/link', method: 'POST' },
  'mcpUnlinkDesign': { route: 'mcp/v1/designs/link', method: 'DELETE' },

  // Catalogs (E-215) — org-level generalized code-derived catalogs, each versioned
  'mcpCreateCatalog': { route: 'mcp/v1/catalogs', method: 'POST' },
  'mcpListCatalogs': { route: 'mcp/v1/catalogs', method: 'GET' },
  'mcpGetCatalog': { route: 'mcp/v1/catalogs/by-id', method: 'GET' },
  'mcpGetCurrentCatalog': { route: 'mcp/v1/catalogs/current', method: 'GET' },
  'mcpListCatalogVersions': { route: 'mcp/v1/catalogs/versions', method: 'GET' },
  'mcpGetCatalogVersion': { route: 'mcp/v1/catalogs/version', method: 'GET' },
  'mcpDiffCatalog': { route: 'mcp/v1/catalogs/diff', method: 'GET' },
  'mcpListCatalogLinks': { route: 'mcp/v1/catalogs/links', method: 'GET' },
  'mcpUpdateCatalog': { route: 'mcp/v1/catalogs', method: 'PUT' },
  'mcpDeleteCatalog': { route: 'mcp/v1/catalogs', method: 'DELETE' },
  'mcpSnapshotCatalog': { route: 'mcp/v1/catalogs/snapshot', method: 'POST' },
  'mcpDiscoverScreens': { route: 'mcp/v1/screens/discover', method: 'GET' },
  'mcpImportScreens': { route: 'mcp/v1/screens/import', method: 'POST' },
  'mcpSyncScreens': { route: 'mcp/v1/screens/sync', method: 'POST' },
  'mcpListUnmappedPaths': { route: 'mcp/v1/unmapped-paths', method: 'GET' },
  'mcpAssignUnmappedPath': { route: 'mcp/v1/unmapped-paths/assign', method: 'POST' },
  'mcpDismissUnmappedPath': { route: 'mcp/v1/unmapped-paths/dismiss', method: 'POST' },
  'mcpReconcileUnmappedPaths': { route: 'mcp/v1/unmapped-paths/reconcile', method: 'POST' },
  'mcpLinkCatalog': { route: 'mcp/v1/catalogs/link', method: 'POST' },
  'mcpUnlinkCatalog': { route: 'mcp/v1/catalogs/link', method: 'DELETE' },
  // Item-level links (E-218) — attach work or an external URL to one catalog entry
  'mcpListCatalogItems': { route: 'mcp/v1/catalogs/items', method: 'GET' },
  'mcpLinkCatalogItem': { route: 'mcp/v1/catalogs/items/link', method: 'POST' },
  'mcpUnlinkCatalogItem': { route: 'mcp/v1/catalogs/items/link', method: 'DELETE' },

  // Feature Flags (E-149) — org-level PM-aware runtime gates that link to the
  // feature(s) they gate. /evaluate runs the deterministic, prerequisite-aware
  // evaluator through the in-process cache.
  'mcpCreateFeatureFlag': { route: 'mcp/v1/feature-flags', method: 'POST' },
  'mcpListFeatureFlags': { route: 'mcp/v1/feature-flags', method: 'GET' },
  'mcpGetFeatureFlag': { route: 'mcp/v1/feature-flags/by-id', method: 'GET' },
  'mcpListFeatureFlagLinks': { route: 'mcp/v1/feature-flags/links', method: 'GET' },
  'mcpEvaluateFeatureFlag': { route: 'mcp/v1/feature-flags/evaluate', method: 'POST' },
  'mcpUpdateFeatureFlag': { route: 'mcp/v1/feature-flags', method: 'PUT' },
  'mcpDeleteFeatureFlag': { route: 'mcp/v1/feature-flags', method: 'DELETE' },
  'mcpTransitionFeatureFlag': { route: 'mcp/v1/feature-flags/transition', method: 'POST' },
  'mcpLinkFeatureFlag': { route: 'mcp/v1/feature-flags/link', method: 'POST' },
  'mcpUnlinkFeatureFlag': { route: 'mcp/v1/feature-flags/link', method: 'DELETE' },
  // Environment registry + per-env flag config (E-186).
  'mcpListEnvironments': { route: 'mcp/v1/feature-flags/environments', method: 'GET' },
  'mcpCreateEnvironment': { route: 'mcp/v1/feature-flags/environments', method: 'POST' },
  'mcpUpdateEnvironment': { route: 'mcp/v1/feature-flags/environments', method: 'PUT' },
  'mcpDeleteEnvironment': { route: 'mcp/v1/feature-flags/environments', method: 'DELETE' },
  'mcpSetDefaultEnvironment': { route: 'mcp/v1/feature-flags/environments/default', method: 'POST' },
  'mcpSetFlagEnvironmentConfig': { route: 'mcp/v1/feature-flags/flag-environment', method: 'PUT' },

  // Activity Timeline
  'mcpGetProjectChanges': { route: 'mcp/v1/projects/activity', method: 'GET' },

  // Context Manifest (cloud-backed project context)
  'mcpSearchManifest': { route: 'mcp/v1/manifest/search', method: 'POST' },
  'mcpGetRelatedFiles': { route: 'mcp/v1/manifest/related', method: 'GET' },
  'mcpGetManifestOverview': { route: 'mcp/v1/manifest/overview', method: 'GET' },
  'mcpGetCriticalFiles': { route: 'mcp/v1/manifest/critical-files', method: 'GET' },
  'mcpUpdateManifestEntries': { route: 'mcp/v1/manifest/update-entries', method: 'POST' },
  'mcpApplyManifestChanges': { route: 'mcp/v1/manifest/apply-changes', method: 'POST' },
  'mcpRebuildManifest': { route: 'mcp/v1/manifest/rebuild', method: 'POST' },

  // Knowledge Graph (graph query tools)
  'mcpQueryProjectGraph': { route: 'mcp/v1/graph/query', method: 'POST' },
  'mcpAnalyzeImpact': { route: 'mcp/v1/graph/impact', method: 'POST' },
  'mcpGetGraphStats': { route: 'mcp/v1/graph/stats', method: 'GET' },
  // Navigation-graph projection over entity_links (E-209) — agent traversal
  'mcpTraverseGraph': { route: 'mcp/v1/graph/traverse', method: 'POST' },

  // GitHub endpoints
  'mcpCreatePullRequest': { route: 'mcp/v1/github/pull-request', method: 'POST' },
  'mcpUpdatePullRequest': { route: 'mcp/v1/github/pull-request', method: 'PUT' },
  'mcpMergePullRequest': { route: 'mcp/v1/github/pull-request/merge', method: 'POST' },
  'mcpClosePullRequest': { route: 'mcp/v1/github/pull-request/close', method: 'POST' },
  'mcpRequestPRReview': { route: 'mcp/v1/github/pull-request/review', method: 'POST' },
  'mcpSuggestReviewers': { route: 'mcp/v1/github/pull-request/suggest-reviewers', method: 'POST' },
  'mcpListRepositories': { route: 'mcp/v1/github/repositories', method: 'GET' },

  // Todos (personal todo list)
  'mcpCreateTodo': { route: 'mcp/v1/todos', method: 'POST' },
  'mcpListTodos': { route: 'mcp/v1/todos', method: 'GET' },
  'mcpCompleteTodo': { route: 'mcp/v1/todos/complete', method: 'POST' },
  'mcpMoveTodo': { route: 'mcp/v1/todos/move', method: 'POST' },

  // Personal notes (E-204). Private to the calling user, cross-org; content is
  // markdown over MCP. `{param}` placeholders are filled by the http client.
  'mcpListNotes': { route: 'mcp/v1/notes', method: 'GET' },
  'mcpGetNote': { route: 'mcp/v1/notes/{noteId}', method: 'GET' },
  'mcpCreateNote': { route: 'mcp/v1/notes', method: 'POST' },
  'mcpUpdateNote': { route: 'mcp/v1/notes/{noteId}', method: 'PUT' },
  'mcpDeleteNote': { route: 'mcp/v1/notes/{noteId}', method: 'DELETE' },
  'mcpPromoteNote': { route: 'mcp/v1/notes/{noteId}/promote', method: 'POST' },
  'mcpListNoteFolders': { route: 'mcp/v1/notes/folders', method: 'GET' },
  'mcpCreateNoteFolder': { route: 'mcp/v1/notes/folders', method: 'POST' },
  'mcpUpdateNoteFolder': { route: 'mcp/v1/notes/folders/{folderId}', method: 'PATCH' },
  'mcpDeleteNoteFolder': { route: 'mcp/v1/notes/folders/{folderId}', method: 'DELETE' },

  // Testing (project test cases)
  'mcpListTestCases': { route: 'mcp/v1/testing/cases', method: 'GET' },
  'mcpGetTestCase': { route: 'mcp/v1/testing/case', method: 'GET' },
  'mcpCreateTestCase': { route: 'mcp/v1/testing/cases', method: 'POST' },
  'mcpUpdateTestCase': { route: 'mcp/v1/testing/cases', method: 'PUT' },
  'mcpDeleteTestCase': { route: 'mcp/v1/testing/cases', method: 'DELETE' },
  'mcpRecordTestRun': { route: 'mcp/v1/testing/runs', method: 'POST' },
  'mcpGetTestingSummary': { route: 'mcp/v1/testing/summary', method: 'GET' },

  // Test Suites (project-level test case grouping)
  'mcpListTestSuites': { route: 'mcp/v1/testing/suites', method: 'GET' },
  'mcpGetTestSuite': { route: 'mcp/v1/testing/suites/by-id', method: 'GET' },
  'mcpCreateTestSuite': { route: 'mcp/v1/testing/suites', method: 'POST' },
  'mcpUpdateTestSuite': { route: 'mcp/v1/testing/suites', method: 'PUT' },
  'mcpDeleteTestSuite': { route: 'mcp/v1/testing/suites', method: 'DELETE' },
  'mcpAddCasesToSuite': { route: 'mcp/v1/testing/suites/add-cases', method: 'POST' },
  'mcpRemoveCasesFromSuite': { route: 'mcp/v1/testing/suites/remove-cases', method: 'POST' },
};
