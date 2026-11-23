/**
 * A folder's contents over MCP (E-343 #3958): the same filters, sort and
 * paging as the web's folder page, on GET mcp/v1/documents/contents. Used by
 * get_document's list mode and list_org_documents when any of these is given;
 * without them both keep their older behaviour.
 */

/** Arguments that ask for the contents list. */
export const CONTENTS_ARGS = [
  'folderId', 'q', 'statuses', 'types', 'ownerIds', 'tagIds', 'sort', 'dir', 'cursor', 'includeIndex',
];

const SORTS = new Set(['manual', 'updated', 'name', 'created']);
const DIRS = new Set(['asc', 'desc']);

/** Whether args ask for the contents list rather than the older list. */
export function wantsContents(args) {
  return CONTENTS_ARGS.some((k) => args[k] !== undefined && args[k] !== null && args[k] !== '');
}

function list(value) {
  if (value === undefined || value === null || value === '') return [];
  return (Array.isArray(value) ? value : [value]).map(String).filter(Boolean);
}

/**
 * The query for one contents call. scope is { projectId } or
 * { organizationId }. status and docType (get_document's older single-value
 * filters) fold into statuses and types. Refusals happen before the network.
 */
export function contentsRequest(scope, args) {
  if (!scope.projectId && !scope.organizationId) {
    throw new Error('Pass projectId (a project\'s docs) or organizationId (workspace docs).');
  }
  if (args.sort != null && !SORTS.has(args.sort)) {
    throw new Error('sort must be "manual", "updated", "name" or "created".');
  }
  if (args.dir != null && !DIRS.has(args.dir)) {
    throw new Error('dir must be "asc" or "desc".');
  }
  const params = scope.projectId ? { projectId: scope.projectId } : { organizationId: scope.organizationId };
  if (args.folderId) params.folderId = args.folderId;
  if (args.q) params.q = String(args.q);
  const statuses = [...list(args.statuses), ...list(args.status)];
  const types = [...list(args.types), ...list(args.docType)];
  if (statuses.length) params.status = statuses.join(',');
  if (types.length) params.type = types.join(',');
  if (list(args.ownerIds).length) params.ownerId = list(args.ownerIds).join(',');
  if (list(args.tagIds).length) params.tagId = list(args.tagIds).join(',');
  if (args.sort) params.sort = args.sort;
  if (args.dir) params.dir = args.dir;
  if (args.limit != null) params.limit = args.limit;
  if (args.cursor) params.cursor = args.cursor;
  if (args.includeIndex) params.includeIndex = 'true';
  return params;
}

/** One line telling the agent how to read on. */
export function contentsHint(result) {
  if (!result?.hasMore) return undefined;
  return `More documents match: call again with the same filters and cursor:"${result.nextCursor}". ` +
    'A page can hold fewer documents than the limit (some may be hidden from you); keep going until hasMore is false.';
}
