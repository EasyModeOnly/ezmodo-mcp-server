/**
 * MCP tool annotations: which tools only read (#2808).
 *
 * Without annotations a client must assume any tool may write or destroy data,
 * which is what the MCP spec says an unannotated tool means. Claude uses the
 * hint to sort a connector's tools into read-only and write/delete categories,
 * so a policy that allows only read-only tools (Claude Team/Enterprise tool
 * permissions) blocked EVERY tool here, reads included, while
 * every tool was unannotated.
 *
 * A hint, not a control: the API enforces scopes and permissions whatever a
 * client believes. So the list errs toward leaving a tool OUT. A write wrongly
 * marked read-only would let it through a read-only policy, while a read left
 * unmarked only costs the user an approval prompt.
 *
 * Membership was verified by tracing each handler to the endpoints it calls
 * (config/endpoint-map.js): all GETs, or POSTs to query routes the API mounts
 * behind OptionalReadScopeMiddleware (projects/story, organization/analyze,
 * graph/*, tags/suggest, links/preview, attachments/download-url). Some have
 * local side effects that change no EzModo data, and those count as reads:
 * get_document caches the content into .ezmodo/docs, get_current_project_context
 * and list_tags cache tags, and detect_git_repository and list_project_worktrees
 * run read-only git commands.
 *
 * Adding a tool? If it only reads, add it here.
 * __tests__/tool-annotations.test.js fails when a get_/list_/search_ tool is
 * left unclassified, so a new read cannot silently default to "may write".
 */

export const READ_ONLY_TOOLS = new Set([
  'detect_git_repository',
  'estimate_task',
  'evaluate_feature_flag',
  'get_access',
  'get_ai_insights',
  'get_attachment_url',
  'get_catalog',
  'get_catalog_diff',
  'get_context',
  'get_current_project_context',
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
  'get_release_readiness',
  'get_task',
  'get_testing_summary',
  'infer_dependencies',
  'list_agent_suggestions',
  'list_attachments',
  'list_catalog_items',
  'list_catalogs',
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
  'list_project_worktrees',
  'list_repositories',
  'list_tags',
  'list_test_cases',
  'list_test_suites',
  'list_todos',
  'list_unmapped_paths',
  'list_watched',
  'preview_links',
  'resolve_concepts',
  'search_epics',
  'search_features',
  'search_tasks',
  'validate_manifest',
]);

/**
 * The tool definition as a client should see it: read-only tools carry
 * `annotations.readOnlyHint: true`; everything else is returned unchanged.
 * Never mutates the shared definition in tools/.
 *
 * @template {{ name: string, annotations?: object }} T
 * @param {T} tool
 * @returns {T}
 */
export function annotate(tool) {
  if (!READ_ONLY_TOOLS.has(tool.name)) return tool;
  return { ...tool, annotations: { ...tool.annotations, readOnlyHint: true } };
}
