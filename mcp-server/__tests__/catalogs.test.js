import { jest } from '@jest/globals';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { manageCatalog, getCatalog, listCatalogs, listCatalogItems, getCatalogDiff } = await import('../handlers/catalogs.js');

describe('Catalog Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageCatalog', () => {
    it('should create a catalog', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ catalog: { id: 'cat-1', kind: 'notifications' } });

      const params = { organizationId: 'org-1', name: 'Notifications', kind: 'notifications' };
      const result = await manageCatalog({ action: 'create', ...params });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpCreateCatalog', params);
      expect(result.catalog.id).toBe('cat-1');
    });

    it('should update a catalog', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ catalog: { id: 'cat-1' } });

      const params = { catalogId: 'cat-1', name: 'Updated' };
      await manageCatalog({ action: 'update', ...params });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUpdateCatalog', params);
    });

    it('should delete a catalog', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({ action: 'delete', catalogId: 'cat-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpDeleteCatalog', { catalogId: 'cat-1' });
    });

    it('should link a document to a catalog', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({ action: 'link', catalogId: 'cat-1', targetType: 'document', targetId: 'doc-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpLinkCatalog', {
        catalogId: 'cat-1', targetType: 'document', targetId: 'doc-9',
      });
    });

    it('should unlink an artifact from a catalog', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({ action: 'unlink', catalogId: 'cat-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUnlinkCatalog', {
        catalogId: 'cat-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should snapshot a catalog (with source)', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ version: { version: 1 } });

      const snapshot = { columns: [{ key: 'trigger' }], items: [{ key: 'task_assigned' }] };
      const source = { sourcePaths: ['api/model/notification.go'], commitSha: 'abc' };
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', snapshot, source });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', { catalogId: 'cat-1', snapshot, source });
    });

    it('should omit source on snapshot when not provided', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ version: { version: 1 } });

      const snapshot = { items: [{ key: 'a' }] };
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', snapshot });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', { catalogId: 'cat-1', snapshot });
    });

    it('should forward patch-mode params on snapshot', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ version: { version: 4 } });

      const upsertItems = [{ key: 'orders', label: 'orders' }];
      const removeKeys = ['legacy_carts'];
      const source = { sourcePaths: ['api/migrations/000090_add_orders.up.sql'], commitSha: 'def' };
      await manageCatalog({
        action: 'snapshot', catalogId: 'cat-1', mode: 'patch', upsertItems, removeKeys, source,
      });

      // No `snapshot` key — a patch that only touches items must not send an
      // empty snapshot blob that would clobber columns/meta server-side.
      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', {
        catalogId: 'cat-1', mode: 'patch', upsertItems, removeKeys, source,
      });
    });

    it('should forward columns/meta alongside a patch when supplied', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ version: { version: 5 } });

      const snapshot = { columns: [{ key: 'columns' }, { key: 'indexes' }] };
      const upsertItems = [{ key: 'users' }];
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', mode: 'patch', snapshot, upsertItems });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', {
        catalogId: 'cat-1', mode: 'patch', snapshot, upsertItems,
      });
    });

    it('should omit mode on a plain replace snapshot', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ version: { version: 1 } });

      const snapshot = { items: [{ key: 'a' }] };
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', snapshot });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', { catalogId: 'cat-1', snapshot });
    });

    it('should reject an unknown action', async () => {
      await expect(manageCatalog({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
    });

    it('should link work to a single item when itemKey is present', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({
        action: 'link', catalogId: 'cat-1', itemKey: 'comment.mention',
        targetType: 'task', targetId: 'task-9',
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpLinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'comment.mention', targetType: 'task', targetId: 'task-9',
      });
    });

    it('should link an external url to an item when itemKey + url are present', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ url: { id: 'ext-1' } });

      await manageCatalog({
        action: 'link', catalogId: 'cat-1', itemKey: 'billing.failed',
        url: 'https://dashboard.stripe.com/x', label: 'Stripe',
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpLinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'billing.failed', url: 'https://dashboard.stripe.com/x', label: 'Stripe',
      });
    });

    it('should unlink an item work link when itemKey is present', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({
        action: 'unlink', catalogId: 'cat-1', itemKey: 'comment.mention',
        targetType: 'task', targetId: 'task-9',
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUnlinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'comment.mention', targetType: 'task', targetId: 'task-9',
      });
    });

    it('should unlink an item external url by url when itemKey + url are present', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({
        action: 'unlink', catalogId: 'cat-1', itemKey: 'billing.failed',
        url: 'https://dashboard.stripe.com/x',
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpUnlinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'billing.failed', url: 'https://dashboard.stripe.com/x',
      });
    });
  });

  describe('listCatalogItems', () => {
    it('should require catalogId', async () => {
      await expect(listCatalogItems({})).rejects.toThrow(/catalogId is required/);
    });

    it('should pass catalogId through', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ items: [] });

      await listCatalogItems({ catalogId: 'cat-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListCatalogItems', { catalogId: 'cat-1' });
    });
  });

  describe('getCatalog', () => {
    it('should require catalogId', async () => {
      await expect(getCatalog({})).rejects.toThrow(/catalogId is required/);
    });

    it('should fetch the current snapshot by default', async () => {
      mockCallZephlyAPI
        .mockResolvedValueOnce({ catalog: { id: 'cat-1' } })
        .mockResolvedValueOnce({ version: 3, snapshot: { items: [] } });

      const result = await getCatalog({ catalogId: 'cat-1' });

      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(1, 'mcpGetCatalog', { catalogId: 'cat-1' });
      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(2, 'mcpGetCurrentCatalog', { catalogId: 'cat-1' });
      expect(result.currentVersion.version).toBe(3);
    });

    it('should leave currentVersion null when no snapshot exists yet', async () => {
      mockCallZephlyAPI
        .mockResolvedValueOnce({ catalog: { id: 'cat-1' } })
        .mockRejectedValueOnce(new Error('404 not found'));

      const result = await getCatalog({ catalogId: 'cat-1' });

      expect(result.currentVersion).toBeNull();
    });

    it('should fetch a specific version when requested', async () => {
      mockCallZephlyAPI
        .mockResolvedValueOnce({ catalog: { id: 'cat-1' } })
        .mockResolvedValueOnce({ version: 2, snapshot: { items: [] } });

      await getCatalog({ catalogId: 'cat-1', version: 2 });

      expect(mockCallZephlyAPI).toHaveBeenNthCalledWith(2, 'mcpGetCatalogVersion', { catalogId: 'cat-1', version: 2 });
    });

    it('should skip the snapshot blob when metadataOnly', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ catalog: { id: 'cat-1' } });

      await getCatalog({ catalogId: 'cat-1', metadataOnly: true });

      expect(mockCallZephlyAPI).toHaveBeenCalledTimes(1);
    });
  });

  describe('listCatalogs', () => {
    it('should pass filters (incl. linked entity) through', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ catalogs: [] });

      await listCatalogs({
        organizationId: 'org-1', projectId: 'proj-1', kind: 'notifications',
        linkedType: 'feature', linkedId: 'feat-9', limit: 10,
      });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListCatalogs', {
        organizationId: 'org-1', projectId: 'proj-1', kind: 'notifications',
        linkedType: 'feature', linkedId: 'feat-9', limit: 10,
      });
    });

    it('should omit unspecified filters', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ catalogs: [] });

      await listCatalogs({ organizationId: 'org-1' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListCatalogs', { organizationId: 'org-1' });
    });
  });

  describe('getCatalogDiff', () => {
    it('should pass catalogId/from/to through', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ diff: {} });

      await getCatalogDiff({ catalogId: 'cat-1', from: 1, to: 2 });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpDiffCatalog', { catalogId: 'cat-1', from: 1, to: 2 });
    });
  });
});

/**
 * E-225: manage_catalog's targetType and list_catalogs' linkedType were
 * prose-only with no enum at all, so agents had to guess the spelling of a type
 * from a sentence. Both now carry the shared LINKABLE_TYPES list.
 */
describe('Catalog link enums (E-225)', () => {
  it('constrains targetType and linkedType to the shared linkable-type list', async () => {
    const { CATALOG_TOOLS } = await import('../tools/catalogs.js');
    const { LINKABLE_TYPES } = await import('../tools/linkable-types.js');

    const manage = CATALOG_TOOLS.find((t) => t.name === 'manage_catalog');
    const list = CATALOG_TOOLS.find((t) => t.name === 'list_catalogs');

    expect(manage.inputSchema.properties.targetType.enum).toBe(LINKABLE_TYPES);
    expect(list.inputSchema.properties.linkedType.enum).toBe(LINKABLE_TYPES);
  });
});
