import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageCatalog, getCatalog, listCatalogs, listCatalogItems, getCatalogDiff } = await import('../handlers/catalogs.js');

describe('Catalog Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageCatalog', () => {
    it('should create a catalog', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ catalog: { id: 'cat-1', kind: 'notifications' } });

      const params = { organizationId: 'org-1', name: 'Notifications', kind: 'notifications' };
      const result = await manageCatalog({ action: 'create', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateCatalog', params);
      expect(result.catalog.id).toBe('cat-1');
    });

    it('should discover screens for a project (E-258)', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ screens: [{ name: 'HomeScreen', sourcePath: 'mobile/lib/home.dart' }] });

      const result = await manageCatalog({ action: 'discover_screens', projectId: 'p1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDiscoverScreens', { projectId: 'p1' });
      expect(result.screens).toHaveLength(1);
    });

    it('should import screens, passing the feature only when given', async () => {
      mockCallEzmodoAPI.mockResolvedValue({ screens: [] });
      const screens = [{ name: 'HomeScreen', sourcePath: 'mobile/lib/home.dart' }];

      await manageCatalog({ action: 'import_screens', projectId: 'p1', screens, featureId: 'f1' });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpImportScreens', { projectId: 'p1', screens, featureId: 'f1' });

      await manageCatalog({ action: 'import_screens', projectId: 'p1', screens });
      expect(mockCallEzmodoAPI).toHaveBeenLastCalledWith('mcpImportScreens', { projectId: 'p1', screens });
    });

    it('should sync screens for a project', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ screens: {}, navigation: { derived: 2 } });

      const result = await manageCatalog({ action: 'sync_screens', projectId: 'p1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSyncScreens', { projectId: 'p1' });
      expect(result.navigation.derived).toBe(2);
      await expect(manageCatalog({ action: 'sync_screens' })).rejects.toThrow(/projectId/);
    });

    it('should validate screens arguments before calling the API', async () => {
      await expect(manageCatalog({ action: 'discover_screens' })).rejects.toThrow(/projectId/);
      await expect(manageCatalog({ action: 'import_screens', projectId: 'p1', screens: [] })).rejects.toThrow(/screens/);
      expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
    });

    it('should update a catalog', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ catalog: { id: 'cat-1' } });

      const params = { catalogId: 'cat-1', name: 'Updated' };
      await manageCatalog({ action: 'update', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateCatalog', params);
    });

    it('should delete a catalog', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({ action: 'delete', catalogId: 'cat-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteCatalog', { catalogId: 'cat-1' });
    });

    it('should link a document to a catalog', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({ action: 'link', catalogId: 'cat-1', targetType: 'document', targetId: 'doc-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpLinkCatalog', {
        catalogId: 'cat-1', targetType: 'document', targetId: 'doc-9',
      });
    });

    it('should unlink an artifact from a catalog', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({ action: 'unlink', catalogId: 'cat-1', targetType: 'feature', targetId: 'feat-9' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUnlinkCatalog', {
        catalogId: 'cat-1', targetType: 'feature', targetId: 'feat-9',
      });
    });

    it('should snapshot a catalog (with source)', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ version: { version: 1 } });

      const snapshot = { columns: [{ key: 'trigger' }], items: [{ key: 'task_assigned' }] };
      const source = { sourcePaths: ['api/model/notification.go'], commitSha: 'abc' };
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', snapshot, source });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', { catalogId: 'cat-1', snapshot, source });
    });

    it('should omit source on snapshot when not provided', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ version: { version: 1 } });

      const snapshot = { items: [{ key: 'a' }] };
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', snapshot });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', { catalogId: 'cat-1', snapshot });
    });

    it('should forward patch-mode params on snapshot', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ version: { version: 4 } });

      const upsertItems = [{ key: 'orders', label: 'orders' }];
      const removeKeys = ['legacy_carts'];
      const source = { sourcePaths: ['api/migrations/000090_add_orders.up.sql'], commitSha: 'def' };
      await manageCatalog({
        action: 'snapshot', catalogId: 'cat-1', mode: 'patch', upsertItems, removeKeys, source,
      });

      // No `snapshot` key — a patch that only touches items must not send an
      // empty snapshot blob that would clobber columns/meta server-side.
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', {
        catalogId: 'cat-1', mode: 'patch', upsertItems, removeKeys, source,
      });
    });

    it('should forward columns/meta alongside a patch when supplied', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ version: { version: 5 } });

      const snapshot = { columns: [{ key: 'columns' }, { key: 'indexes' }] };
      const upsertItems = [{ key: 'users' }];
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', mode: 'patch', snapshot, upsertItems });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', {
        catalogId: 'cat-1', mode: 'patch', snapshot, upsertItems,
      });
    });

    it('should omit mode on a plain replace snapshot', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ version: { version: 1 } });

      const snapshot = { items: [{ key: 'a' }] };
      await manageCatalog({ action: 'snapshot', catalogId: 'cat-1', snapshot });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSnapshotCatalog', { catalogId: 'cat-1', snapshot });
    });

    it('should reject an unknown action', async () => {
      await expect(manageCatalog({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
    });

    it('should link work to a single item when itemKey is present', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({
        action: 'link', catalogId: 'cat-1', itemKey: 'comment.mention',
        targetType: 'task', targetId: 'task-9',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpLinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'comment.mention', targetType: 'task', targetId: 'task-9',
      });
    });

    it('should link an external url to an item when itemKey + url are present', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ url: { id: 'ext-1' } });

      await manageCatalog({
        action: 'link', catalogId: 'cat-1', itemKey: 'billing.failed',
        url: 'https://dashboard.stripe.com/x', label: 'Stripe',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpLinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'billing.failed', url: 'https://dashboard.stripe.com/x', label: 'Stripe',
      });
    });

    it('should unlink an item work link when itemKey is present', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({
        action: 'unlink', catalogId: 'cat-1', itemKey: 'comment.mention',
        targetType: 'task', targetId: 'task-9',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUnlinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'comment.mention', targetType: 'task', targetId: 'task-9',
      });
    });

    it('should unlink an item external url by url when itemKey + url are present', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

      await manageCatalog({
        action: 'unlink', catalogId: 'cat-1', itemKey: 'billing.failed',
        url: 'https://dashboard.stripe.com/x',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUnlinkCatalogItem', {
        catalogId: 'cat-1', itemKey: 'billing.failed', url: 'https://dashboard.stripe.com/x',
      });
    });
  });

  describe('listCatalogItems', () => {
    it('should require catalogId', async () => {
      await expect(listCatalogItems({})).rejects.toThrow(/catalogId is required/);
    });

    it('should pass catalogId through', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ items: [] });

      await listCatalogItems({ catalogId: 'cat-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListCatalogItems', { catalogId: 'cat-1' });
    });
  });

  describe('getCatalog', () => {
    it('should require catalogId', async () => {
      await expect(getCatalog({})).rejects.toThrow(/catalogId is required/);
    });

    it('should fetch the current snapshot by default', async () => {
      mockCallEzmodoAPI
        .mockResolvedValueOnce({ catalog: { id: 'cat-1' } })
        .mockResolvedValueOnce({ version: 3, snapshot: { items: [] } });

      const result = await getCatalog({ catalogId: 'cat-1' });

      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpGetCatalog', { catalogId: 'cat-1' });
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpGetCurrentCatalog', { catalogId: 'cat-1' });
      expect(result.currentVersion.version).toBe(3);
    });

    it('should leave currentVersion null when no snapshot exists yet', async () => {
      mockCallEzmodoAPI
        .mockResolvedValueOnce({ catalog: { id: 'cat-1' } })
        .mockRejectedValueOnce(new Error('404 not found'));

      const result = await getCatalog({ catalogId: 'cat-1' });

      expect(result.currentVersion).toBeNull();
    });

    it('should fetch a specific version when requested', async () => {
      mockCallEzmodoAPI
        .mockResolvedValueOnce({ catalog: { id: 'cat-1' } })
        .mockResolvedValueOnce({ version: 2, snapshot: { items: [] } });

      await getCatalog({ catalogId: 'cat-1', version: 2 });

      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpGetCatalogVersion', { catalogId: 'cat-1', version: 2 });
    });

    it('should skip the snapshot blob when metadataOnly', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ catalog: { id: 'cat-1' } });

      await getCatalog({ catalogId: 'cat-1', metadataOnly: true });

      expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
    });
  });

  describe('listCatalogs', () => {
    it('should pass filters (incl. linked entity) through', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ catalogs: [] });

      await listCatalogs({
        organizationId: 'org-1', projectId: 'proj-1', kind: 'notifications',
        linkedType: 'feature', linkedId: 'feat-9', limit: 10,
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListCatalogs', {
        organizationId: 'org-1', projectId: 'proj-1', kind: 'notifications',
        linkedType: 'feature', linkedId: 'feat-9', limit: 10,
      });
    });

    it('should omit unspecified filters', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ catalogs: [] });

      await listCatalogs({ organizationId: 'org-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListCatalogs', { organizationId: 'org-1' });
    });
  });

  describe('getCatalogDiff', () => {
    it('should pass catalogId/from/to through', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ diff: {} });

      await getCatalogDiff({ catalogId: 'cat-1', from: 1, to: 2 });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDiffCatalog', { catalogId: 'cat-1', from: 1, to: 2 });
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
