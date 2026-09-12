/**
 * The entity types a link can point at, declared once.
 *
 * This mirrors `links.allEntityTypes` in the Go API (api/internal/core/links/
 * service.go), which is the authority — an enum here that the API rejects just
 * turns a clear tool-schema error into a confusing 400, and an enum here that
 * is MISSING a type the API accepts hides a capability from agents entirely.
 *
 * Before this, six tool files each spelled the list out inline and every one of
 * them was frozen at the set of types that existed the day it was written:
 * decisions and designs stopped at `project`, features knew about design and
 * test_suite but not feature_flag or catalog, links.js knew feature_flag but
 * not milestone or goal. Adding a linkable type meant editing six lists and
 * forgetting one was invisible until an agent tried it.
 *
 * Adding a type: add it in the Go `allEntityTypes` list, then here.
 */
export const LINKABLE_TYPES = [
  'task',
  'epic',
  'project',
  'document',
  'component',
  'feature',
  'decision',
  'design',
  'test_suite',
  'feature_flag',
  'catalog',
  'catalog_item',
  'milestone',
  'goal',
  // One row of git_pull_requests (E-233). A PR is linked to the work it
  // implements, rather than the PR table carrying task/epic columns.
  'pull_request',
];
