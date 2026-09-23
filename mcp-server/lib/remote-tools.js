/**
 * Which tools may be served over the REMOTE transport (#2614).
 *
 * The HTTP entry point and the stdio entry point deliberately build the same
 * server (lib/create-server.js) so their tool surfaces cannot drift. That is
 * right for almost everything — and wrong for the handful of tools that are
 * not network operations at all.
 *
 * `detect_git_repository`, `manage_worktree`, `rebuild_manifest` and friends
 * read and write the LOCAL machine: the working directory, `.ezmodo/`, the git
 * repository. Over stdio that is the whole point — the server runs inside the
 * user's checkout, at their request, as them. On a hosted server there is no
 * checkout, so at best they fail confusingly.
 *
 * At worst they are dangerous. lib/git-helpers.js `execGit` passes its command
 * to `execSync` — a shell — and callers interpolate tool arguments into it:
 *
 *     execGit(`git branch ${branchName} ${baseBranch}`, repoPath)
 *
 * On a user's own machine the blast radius is their own shell, which is why
 * this has been tolerable. Reachable over the internet it is arbitrary command
 * execution in the container. So these tools are not hardened for remote use —
 * they are not served remotely at all, because they have no meaning there and
 * hardening would leave a shell-executing surface exposed for no benefit.
 *
 * ── The list is an ALLOWLIST, deliberately ───────────────────────────────────
 *
 * A denylist would mean every tool added from now on is exposed remotely by
 * default, and the mistake would be invisible: the tool simply works, until one
 * of them turns out to touch the filesystem. Listing what is safe means a new
 * tool is refused remotely until someone decides otherwise, and
 * remote-tools.test.js fails loudly when a tool is unclassified rather than
 * letting it through.
 *
 * Note some tools do local work as a SIDE EFFECT and are still fine here:
 * manage_task writes `.ezmodo/active-session.json`, and lib/active-session.js
 * already skips that when no config directory exists — which is exactly the
 * case in a container. Likewise get_context and resolve_concepts read a local
 * manifest when there is one and fall back to the API when there is not.
 */

/** Tools that operate on the local machine and are never served remotely. */
export const LOCAL_ONLY_TOOLS = Object.freeze([
  // Not a filesystem tool, but local for the same reason: over the connector
  // Claude completes its own OAuth before any tool call, so a second sign-in
  // offered there would be inert and confusing (#2632). It also opens a
  // browser and binds a loopback port, neither of which means anything in a
  // container.
  'authenticate',
  'detect_git_repository',
  'get_current_project_context',
  'initialize_project_context',
  'list_project_worktrees',
  'manage_worktree',
  'rebuild_manifest',
]);

/** Tools safe to serve over the remote transport. */
export const REMOTE_SAFE_TOOLS = Object.freeze([
  'accept_agent_suggestion',
  'add_epic_comment',
  'configure_agent',
  'create_tasks',
  'delete_attachment',
  'estimate_task',
  'evaluate_feature_flag',
  'get_access',
  'get_ai_insights',
  'get_attachment_url',
  'get_catalog',
  'get_catalog_diff',
  'get_context',
  'get_decision',
  'get_design',
  'get_design_system',
  'get_document',
  'get_document_template',
  'get_epic',
  'get_epic_activity',
  'get_epic_plan',
  'get_feature',
  'get_feature_flag',
  'get_goal',
  'get_graph',
  'get_manifest_schema',
  'get_milestone',
  'get_note',
  'get_org_areas',
  'get_organization',
  'get_project',
  'get_project_changes',
  'get_project_story',
  'get_task',
  'get_testing_summary',
  'infer_dependencies',
  'list_agent_suggestions',
  'list_attachments',
  'list_catalog_items',
  'list_catalogs',
  'list_unmapped_paths',
  'list_designs',
  'list_epic_comments',
  'list_epics',
  'list_facts',
  'list_feature_flags',
  'list_folders',
  'list_links',
  'list_notes',
  'list_notifications',
  'list_org_documents',
  'list_repositories',
  'list_tags',
  'list_test_cases',
  'list_test_suites',
  'list_todos',
  'list_watched',
  'manage_access',
  'manage_catalog',
  'manage_decision',
  'manage_design',
  'manage_document',
  'manage_document_template',
  'manage_environment',
  'manage_epic',
  'manage_fact',
  'manage_feature',
  'manage_feature_flag',
  'manage_folder',
  'manage_goal',
  'manage_link',
  'manage_milestone',
  'manage_note',
  'manage_note_folder',
  'manage_project',
  'manage_pull_request',
  'manage_recurring_task',
  'manage_tag',
  'manage_task',
  'manage_team',
  'manage_test_case',
  'manage_test_suite',
  'manage_todo',
  'manage_watch',
  'manage_work_template',
  'preview_links',
  'reject_agent_suggestion',
  'report_untracked_work',
  'resolve_concepts',
  'resolve_link_suggestions',
  'resolve_links',
  'resolve_unmapped',
  'manage_plan_proposal',
  'run_agent_now',
  'search_epics',
  'search_features',
  'search_tasks',
  'update_epic_plan',
  'update_manifest_entries',
  'validate_manifest',
]);

const remoteSafe = new Set(REMOTE_SAFE_TOOLS);

/** Whether a tool may be served over the remote transport. */
export function isRemoteSafe(toolName) {
  return remoteSafe.has(toolName);
}
