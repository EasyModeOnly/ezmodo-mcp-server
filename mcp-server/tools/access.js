/**
 * Entity Access Tools (#2170)
 *
 * Polymorphic access control — one read tool and one write tool covering every
 * entity type the access service supports, mirroring the generic REST shape at
 * /api/v1/access/{entityType}/{id} and following manage_link's precedent.
 *
 * Deliberately NOT modelled as an `access` field on each manage_* tool: that
 * would duplicate the same object across a dozen schemas and invite exactly the
 * drift that produced #2168, where manage_folder advertised an `access`
 * parameter that no code path implemented.
 *
 * Permissions, twice over. Reading requires viewer access to the entity, so an
 * agent cannot enumerate permissions on something it cannot already see. Every
 * mutation requires admin on the entity AND an API key holding the dedicated
 * `write:access` scope — an ordinary write:tasks key cannot change who can see
 * a task, because granting visibility is a larger privilege than editing.
 */

import { ACCESS_ENTITY_TYPES, ACCESS_ROLES } from './access-entity-types.js';

const entityTypeProperty = {
  type: 'string',
  enum: ACCESS_ENTITY_TYPES,
  description:
    'The type of entity whose access is being read or changed. Only these ' +
    'types support access control; anything else is rejected rather than ' +
    'accepted and ignored.',
};

const entityIdProperty = {
  type: 'string',
  description: 'ID of the entity (required)',
};

const organizationIdProperty = {
  type: 'string',
  description:
    'Organization the entity belongs to (required). Also guards against ' +
    'cross-org lookups: an entity in a different org resolves to no access.',
};

export const ACCESS_TOOLS = [
  {
    name: 'get_access',
    description:
      'Read who can access an entity. Returns `resolvedAccess` — the effective ' +
      'entries after inheritance, with the source of each — plus `rawAccess`, the ' +
      'entity\'s own unresolved settings, which is included only when you hold ' +
      'admin on the entity. Requires at least viewer access to the entity itself. ' +
      'Supported entity types: ' + ACCESS_ENTITY_TYPES.join(', ') + '. ' +
      'To ask whether a specific role is held, use manage_access action:"check".',
    inputSchema: {
      type: 'object',
      properties: {
        entityType: entityTypeProperty,
        entityId: entityIdProperty,
        organizationId: organizationIdProperty,
      },
      required: ['entityType', 'entityId', 'organizationId'],
    },
  },
  {
    name: 'manage_access',
    description:
      'Change or test an entity\'s access control. Actions: ' +
      '"update_settings" replaces the access configuration wholesale ' +
      '(inheritFromParent / accessList / publicAccess); ' +
      '"add_entry" grants one user or team a role; ' +
      '"remove_entry" revokes a single entry by its id; ' +
      '"check" reports whether you currently hold a given role (a denial is a ' +
      'normal result, not an error). ' +
      'The three mutating actions require admin on the entity AND an API key ' +
      'with the `write:access` scope — a key that can edit an entity cannot ' +
      'change who may see it unless it was issued that scope explicitly. ' +
      'Note that some entities cannot carry their own access: projects do not ' +
      'support publicAccess, nested folders inherit from their root folder, and ' +
      'documents inside a folder inherit from that folder.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['update_settings', 'add_entry', 'remove_entry', 'check'],
          description: 'Action to perform',
        },
        entityType: entityTypeProperty,
        entityId: entityIdProperty,
        organizationId: organizationIdProperty,

        // --- update_settings ---
        inheritFromParent: {
          type: 'boolean',
          description:
            'If true the entity inherits access from its parent and accessList is ' +
            'ignored; if false it uses its own accessList. (update_settings only)',
        },
        accessList: {
          type: 'array',
          description:
            'The complete access list, replacing any existing one. Each entry sets ' +
            'exactly one of userId or teamId, plus a role. (update_settings only)',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', description: 'Grant to this user (mutually exclusive with teamId)' },
              teamId: { type: 'string', description: 'Grant to this team (mutually exclusive with userId)' },
              role: { type: 'string', enum: ACCESS_ROLES, description: 'Role granted to this user or team' },
            },
            required: ['role'],
          },
        },
        publicAccess: {
          type: 'boolean',
          description:
            'Enable public read-only access. Not supported for projects. (update_settings only)',
        },

        // --- add_entry ---
        userId: {
          type: 'string',
          description: 'User to grant a role to (mutually exclusive with teamId). (add_entry only)',
        },
        teamId: {
          type: 'string',
          description: 'Team to grant a role to (mutually exclusive with userId). (add_entry only)',
        },
        role: {
          type: 'string',
          enum: ACCESS_ROLES,
          description: 'Role to grant. (add_entry only)',
        },

        // --- remove_entry ---
        entryId: {
          type: 'string',
          description:
            'ID of the access entry to revoke, as returned in get_access rawAccess ' +
            'entries. (remove_entry only)',
        },

        // --- check ---
        requiredRole: {
          type: 'string',
          enum: ACCESS_ROLES,
          description: 'Role to test for; defaults to viewer. (check only)',
        },
      },
      required: ['action', 'entityType', 'entityId', 'organizationId'],
    },
  },
];
