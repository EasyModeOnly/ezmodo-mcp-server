/**
 * The entity types that support access control, declared once.
 *
 * This mirrors `access.IsValidEntityType` in the Go API (api/internal/core/
 * access/models.go), which is the authority. The API side exposes the same list
 * via `handlers.SupportedAccessEntityTypes()` and a test
 * (TestSupportedAccessEntityTypes_MatchesService) fails if access.EntityType
 * gains or loses a member without that list being updated.
 *
 * Getting this wrong in either direction is the bug this tool exists downstream
 * of (#2168): advertising a type the service rejects turns a clear schema error
 * into a confusing 400 — or worse, reads as a capability that silently does
 * nothing — while omitting a supported type hides real capability from agents.
 *
 * Adding a type: add it to access.EntityType and IsValidEntityType in Go, to
 * SupportedAccessEntityTypes, then here.
 */
export const ACCESS_ENTITY_TYPES = [
  'goal',
  'project',
  'epic',
  'task',
  'document',
  'folder',
];

/** The roles an access entry can grant, most permissive first. */
export const ACCESS_ROLES = ['owner', 'admin', 'member', 'viewer'];
