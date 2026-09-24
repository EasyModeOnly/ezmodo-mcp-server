import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { ACCESS_ENTITY_TYPES, ACCESS_ROLES } from '../tools/access-entity-types.js';
import { ACCESS_TOOLS } from '../tools/access.js';

const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { getAccess, manageAccess } = await import('../handlers/access.js');

const here = dirname(fileURLToPath(import.meta.url));
const GO_ACCESS_MODELS = join(here, '../../api/internal/core/access/models.go');

const BASE = { entityType: 'task', entityId: 'task-1', organizationId: 'org-1' };

describe('ACCESS_ENTITY_TYPES', () => {
  // The bug this tool descends from (#2168) was a parameter advertised on a
  // surface that never implemented it. The enum must therefore track what the
  // access service actually supports, in both directions.
  it("matches the Go API's access.EntityType constants", () => {
    const src = readFileSync(GO_ACCESS_MODELS, 'utf-8');

    const declared = [...src.matchAll(/EntityType(\w+)\s+EntityType = "([\w_]+)"/g)].map((m) => m[2]);
    expect(declared.length).toBeGreaterThan(0);

    expect([...ACCESS_ENTITY_TYPES].sort()).toEqual([...declared].sort());
  });

  it('matches the types IsValidEntityType accepts', () => {
    const src = readFileSync(GO_ACCESS_MODELS, 'utf-8');

    const fn = src.match(/func IsValidEntityType\(entityType string\) bool \{([\s\S]*?)\n\}/);
    expect(fn).not.toBeNull();

    const byConst = new Map(
      [...src.matchAll(/(EntityType\w+)\s+EntityType = "([\w_]+)"/g)].map((m) => [m[1], m[2]])
    );
    const accepted = [...fn[1].matchAll(/EntityType\w+/g)]
      .map((m) => byConst.get(m[0]))
      .filter(Boolean);

    expect([...new Set(accepted)].sort()).toEqual([...ACCESS_ENTITY_TYPES].sort());
  });

  it("matches the Go API's roles", () => {
    const src = readFileSync(GO_ACCESS_MODELS, 'utf-8');
    const declared = [...src.matchAll(/Role(\w+)\s+EntityRole = "(\w+)"/g)].map((m) => m[2]);

    expect([...ACCESS_ROLES].sort()).toEqual([...declared].sort());
  });
});

describe('access tool schemas', () => {
  const byName = Object.fromEntries(ACCESS_TOOLS.map((t) => [t.name, t]));

  it('exposes get_access and manage_access', () => {
    expect(Object.keys(byName).sort()).toEqual(['get_access', 'manage_access']);
  });

  // A hand-copied enum is how the two sides drift apart. Both tools must use
  // the shared constant, not their own literal list.
  it('uses the shared entity-type enum on both tools', () => {
    expect(byName.get_access.inputSchema.properties.entityType.enum).toBe(ACCESS_ENTITY_TYPES);
    expect(byName.manage_access.inputSchema.properties.entityType.enum).toBe(ACCESS_ENTITY_TYPES);
  });

  it('requires the target on every call', () => {
    expect(byName.get_access.inputSchema.required).toEqual(
      expect.arrayContaining(['entityType', 'entityId', 'organizationId'])
    );
    expect(byName.manage_access.inputSchema.required).toEqual(
      expect.arrayContaining(['action', 'entityType', 'entityId', 'organizationId'])
    );
  });

  it('advertises exactly the four supported actions', () => {
    expect(byName.manage_access.inputSchema.properties.action.enum).toEqual([
      'update_settings', 'add_entry', 'remove_entry', 'check',
    ]);
  });

  it('documents that mutations need the write:access scope', () => {
    expect(byName.manage_access.description).toContain('write:access');
  });
});

describe('getAccess', () => {
  afterEach(() => jest.clearAllMocks());

  it('forwards the target to the read endpoint', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ resolvedAccess: { entries: [] } });

    await getAccess(BASE);

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetAccess', BASE);
  });
});

describe('manageAccess dispatch', () => {
  afterEach(() => jest.clearAllMocks());

  it('routes update_settings', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ updated: true });

    await manageAccess({ action: 'update_settings', ...BASE, inheritFromParent: true });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateAccess', {
      ...BASE,
      inheritFromParent: true,
    });
  });

  it('routes add_entry', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ entry: { id: 'e1' } });

    await manageAccess({ action: 'add_entry', ...BASE, userId: 'u2', role: 'viewer' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpAddAccessEntry', {
      ...BASE,
      userId: 'u2',
      role: 'viewer',
    });
  });

  it('routes remove_entry', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ removed: true });

    await manageAccess({ action: 'remove_entry', ...BASE, entryId: 'e1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpRemoveAccessEntry', {
      ...BASE,
      entryId: 'e1',
    });
  });

  it('routes check, defaulting requiredRole server-side', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ granted: true });

    await manageAccess({ action: 'check', ...BASE });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCheckAccess', BASE);
  });

  it('rejects an unknown action', async () => {
    await expect(manageAccess({ action: 'grant_everything', ...BASE })).rejects.toThrow(
      /Unknown action/
    );
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });
});

// The recurring failure in this codebase is a parameter that is advertised,
// accepted, and silently discarded. On a permissions surface that is worse than
// elsewhere: a dropped `role` on the wrong action reads as a successful grant.
describe('manageAccess rejects fields belonging to another action', () => {
  afterEach(() => jest.clearAllMocks());

  const cases = [
    ['remove_entry', { entryId: 'e1', role: 'admin' }, /role/],
    ['add_entry', { userId: 'u2', role: 'viewer', entryId: 'e1' }, /entryId/],
    ['check', { requiredRole: 'admin', publicAccess: true }, /publicAccess/],
    ['update_settings', { inheritFromParent: true, requiredRole: 'admin' }, /requiredRole/],
  ];

  it.each(cases)('rejects a foreign field on %s', async (action, extras, pattern) => {
    await expect(manageAccess({ action, ...BASE, ...extras })).rejects.toThrow(pattern);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('names the action the field actually belongs to', async () => {
    await expect(
      manageAccess({ action: 'remove_entry', ...BASE, entryId: 'e1', role: 'admin' })
    ).rejects.toThrow(/belongs to action "add_entry"/);
  });

  it('allows a call that uses only its own fields', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ removed: true });

    await expect(
      manageAccess({ action: 'remove_entry', ...BASE, entryId: 'e1' })
    ).resolves.toBeDefined();
  });
});

describe('manageAccess update_settings payload', () => {
  afterEach(() => jest.clearAllMocks());

  // These are tri-state server-side: absent means "leave alone". Forwarding an
  // explicit undefined/null would clear a setting the caller never mentioned.
  it('omits settings that were not provided', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ updated: true });

    await manageAccess({ action: 'update_settings', ...BASE, publicAccess: false });

    const [, body] = mockCallEzmodoAPI.mock.calls[0];
    expect(body).toEqual({ ...BASE, publicAccess: false });
    expect('inheritFromParent' in body).toBe(false);
    expect('accessList' in body).toBe(false);
  });

  it('forwards a false inheritFromParent rather than treating it as absent', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ updated: true });

    await manageAccess({ action: 'update_settings', ...BASE, inheritFromParent: false });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateAccess', {
      ...BASE,
      inheritFromParent: false,
    });
  });

  it('rejects an update that would change nothing', async () => {
    await expect(manageAccess({ action: 'update_settings', ...BASE })).rejects.toThrow(
      /at least one of/
    );
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('forwards an empty accessList, which revokes everyone', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ updated: true });

    await manageAccess({ action: 'update_settings', ...BASE, accessList: [] });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateAccess', { ...BASE, accessList: [] });
  });
});
