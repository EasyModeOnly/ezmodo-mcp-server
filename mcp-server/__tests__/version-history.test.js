import { jest } from '@jest/globals';

// Version history on get_document / get_design and the restore actions
// (E-300 #3387 #3409). The HTTP layer is mocked; the design file layer reports
// "no .ezmodo directory" so nothing is written into the checkout.
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const mockFindConfigPath = jest.fn(async () => null);
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  findConfigPath: mockFindConfigPath,
}));

const mockWriteDesignFiles = jest.fn(async () => null);
jest.unstable_mockModule('../lib/design-files.js', () => ({
  writeDesignFiles: mockWriteDesignFiles,
  readDesignFiles: jest.fn(),
  recordPushed: jest.fn(),
  setAsideAndRefresh: jest.fn(),
}));

jest.unstable_mockModule('../lib/web-url.js', () => ({
  buildDesignUrl: jest.fn(async () => null),
}));

const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { getDocument, manageDocument } = await import('../handlers/documents.js');
const { getDesign, manageDesign } = await import('../handlers/designs.js');
const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
const { DESIGN_TOOLS } = await import('../tools/designs.js');
const { historyMode, summarizeEntry } = await import('../lib/version-history.js');

afterEach(() => {
  jest.clearAllMocks();
});

describe('endpoint map (#3387)', () => {
  it('points document history at the document-history routes', () => {
    expect(ENDPOINT_MAP.mcpListDocumentHistory).toEqual({ route: 'mcp/v1/document-history', method: 'GET' });
    expect(ENDPOINT_MAP.mcpGetDocumentHistoryEntry).toEqual({ route: 'mcp/v1/document-history/entry', method: 'GET' });
    expect(ENDPOINT_MAP.mcpDiffDocumentHistory).toEqual({ route: 'mcp/v1/document-history/diff', method: 'GET' });
    expect(ENDPOINT_MAP.mcpRestoreDocumentHistory).toEqual({ route: 'mcp/v1/document-history/restore', method: 'POST' });
  });

  it('maps the design history routes', () => {
    expect(ENDPOINT_MAP.mcpListDesignHistory).toEqual({ route: 'mcp/v1/design-history', method: 'GET' });
    expect(ENDPOINT_MAP.mcpGetDesignHistoryEntry).toEqual({ route: 'mcp/v1/design-history/entry', method: 'GET' });
    expect(ENDPOINT_MAP.mcpDiffDesignHistory).toEqual({ route: 'mcp/v1/design-history/diff', method: 'GET' });
    expect(ENDPOINT_MAP.mcpRestoreDesignHistory).toEqual({ route: 'mcp/v1/design-history/restore', method: 'POST' });
  });

  it('no longer names the document-versions routes, which never existed', () => {
    const routes = Object.values(ENDPOINT_MAP).map((e) => e.route);
    expect(routes.some((r) => r.includes('document-versions'))).toBe(false);
  });
});

describe('historyMode', () => {
  it('picks diff, then entry, then nth, then list', () => {
    expect(historyMode({ diffFrom: 'a' })).toBe('diff');
    expect(historyMode({ historyEntryId: 'a' })).toBe('entry');
    expect(historyMode({ versionNumber: 2 })).toBe('nth');
    expect(historyMode({ includeHistory: true })).toBe('list');
    expect(historyMode({ includeVersions: true })).toBe('list');
    expect(historyMode({})).toBeNull();
  });

  it('refuses combinations that mean nothing', () => {
    expect(() => historyMode({ diffTo: 'b' })).toThrow(/diffTo needs diffFrom/);
    expect(() => historyMode({ diffFrom: 'a', historyEntryId: 'b' })).toThrow(/not both/);
    expect(() => historyMode({ historyEntryId: 'a', versionNumber: 1 })).toThrow(/not both/);
    expect(() => historyMode({ versionNumber: 0 })).toThrow(/1 or more/);
    expect(() => historyMode({ versionNumber: 1.5 })).toThrow(/whole number/);
  });

  it('summarizes an entry without its bodies', () => {
    expect(summarizeEntry({ id: 'e1', html: 'abc', css: 'de', name: 'x' }, ['html', 'css', 'description']))
      .toEqual({ id: 'e1', name: 'x', size: 5 });
  });
});

describe('get_document history', () => {
  it('lists history with includeHistory, without bodies', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ document: { id: 'doc-1', title: 'T' } })
      .mockResolvedValueOnce({ history: [{ id: 'h2', content: 'long body', changedAt: 't2' }, { id: 'h1', changedAt: 't1' }] });

    const result = await getDocument({ documentId: 'doc-1', includeHistory: true, historyLimit: 5 });

    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpListDocumentHistory', { documentId: 'doc-1', limit: 5 });
    expect(result.history).toEqual([{ id: 'h2', changedAt: 't2', size: 9 }, { id: 'h1', changedAt: 't1' }]);
  });

  it('treats includeVersions as an alias and versionLimit as the limit', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ document: { id: 'doc-1' } })
      .mockResolvedValueOnce({ history: [] });

    const result = await getDocument({ documentId: 'doc-1', includeVersions: true, versionLimit: 3 });

    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpListDocumentHistory', { documentId: 'doc-1', limit: 3 });
    expect(result.history).toEqual([]);
  });

  it('reads one version by historyEntryId', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'h1', content: 'old' });

    const result = await getDocument({ documentId: 'doc-1', historyEntryId: 'h1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDocumentHistoryEntry', { documentId: 'doc-1', entryId: 'h1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
    expect(result.content).toBe('old');
  });

  it('maps versionNumber N to the N-th newest entry', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ history: [{ id: 'h3' }, { id: 'h2' }] })
      .mockResolvedValueOnce({ id: 'h2' });

    await getDocument({ documentId: 'doc-1', versionNumber: 2 });

    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpListDocumentHistory', { documentId: 'doc-1', limit: 2 });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpGetDocumentHistoryEntry', { documentId: 'doc-1', entryId: 'h2' });
  });

  it('says so when versionNumber is past the end of the history', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ history: [{ id: 'h1' }] });

    await expect(getDocument({ documentId: 'doc-1', versionNumber: 4 })).rejects.toThrow(/1 version .*no version 4/);
  });

  it('diffs against the current version when diffTo is omitted', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ content: { hunks: [] } });

    await getDocument({ documentId: 'doc-1', diffFrom: 'h1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDiffDocumentHistory', { documentId: 'doc-1', from: 'h1' });
  });

  it('diffs two entries', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({});

    await getDocument({ documentId: 'doc-1', diffFrom: 'h1', diffTo: 'h2' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDiffDocumentHistory', { documentId: 'doc-1', from: 'h1', to: 'h2' });
  });

  it('resolves a slug to an id before reading history', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ document: { id: 'doc-9', content: 'x' } })
      .mockResolvedValueOnce({ id: 'h1' });

    await getDocument({ projectId: 'p1', slug: 'my-doc', historyEntryId: 'h1' });

    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpGetDocument', { projectId: 'p1', slug: 'my-doc' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpGetDocumentHistoryEntry', { documentId: 'doc-9', entryId: 'h1' });
  });

  it('refuses history params in list mode', async () => {
    await expect(getDocument({ projectId: 'p1', includeHistory: true })).rejects.toThrow(/single document/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });
});

describe('manage_document create_version (#3572)', () => {
  it('posts a named version to document-history', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

    await manageDocument({ action: 'create_version', documentId: 'doc-1', note: '  Before the pricing rewrite ' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocumentHistoryEntry', {
      documentId: 'doc-1',
      changeNote: 'Before the pricing rewrite',
    });
    expect(ENDPOINT_MAP.mcpCreateDocumentHistoryEntry).toEqual({ route: 'mcp/v1/document-history', method: 'POST' });
  });

  it('sends no note when none is given', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });
    await manageDocument({ action: 'create_version', documentId: 'doc-1' });
    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocumentHistoryEntry', { documentId: 'doc-1' });
  });

  it('needs a documentId', async () => {
    await expect(manageDocument({ action: 'create_version' })).rejects.toThrow(/documentId is required/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('is offered by the tool', () => {
    const tool = DOCUMENT_TOOLS.find((t) => t.name === 'manage_document');
    expect(tool.inputSchema.properties.action.enum).toContain('create_version');
    expect(tool.description).toMatch(/create_version/);
  });
});

describe('manage_document restore', () => {
  it('restores a history entry', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ document: { id: 'doc-1' } });

    await manageDocument({ action: 'restore', documentId: 'doc-1', historyEntryId: 'h1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpRestoreDocumentHistory', { documentId: 'doc-1', entryId: 'h1' });
  });

  it('requires documentId and historyEntryId', async () => {
    await expect(manageDocument({ action: 'restore', historyEntryId: 'h1' })).rejects.toThrow(/documentId/);
    await expect(manageDocument({ action: 'restore', documentId: 'doc-1' })).rejects.toThrow(/historyEntryId/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });
});

describe('get_design history', () => {
  it('adds the history, without markup, to a single lookup', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ design: { id: 'des-1', html: '<b/>' } })
      .mockResolvedValueOnce({
        history: [{ id: 'h2', html: '<b/>', css: '', description: 'd', changedAt: '2026-11-02T00:00:00Z' }],
        hasMore: true,
      });

    const result = await getDesign({ designId: 'des-1', includeHistory: true, historyLimit: 1, historyBefore: '2026-11-03T00:00:00Z' });

    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpListDesignHistory', {
      designId: 'des-1', limit: 1, before: '2026-11-03T00:00:00Z',
    });
    expect(result.design.id).toBe('des-1');
    expect(result.history).toEqual([{ id: 'h2', changedAt: '2026-11-02T00:00:00Z', size: 5 }]);
    expect(result.historyHasMore).toBe(true);
    expect(result.historyNextBefore).toBe('2026-11-02T00:00:00Z');
  });

  it('returns one past version inline and never writes it to local files', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ id: 'h1', designId: 'des-1', html: '<i/>' });

    const result = await getDesign({ designId: 'des-1', historyEntryId: 'h1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDesignHistoryEntry', { designId: 'des-1', entryId: 'h1' });
    expect(mockWriteDesignFiles).not.toHaveBeenCalled();
    expect(result.html).toBe('<i/>');
    expect(result.message).toMatch(/read-only/);
  });

  it('diffs, defaulting diffTo to the current version', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ html: { hunks: [] } });

    await getDesign({ designId: 'des-1', diffFrom: 'h1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDiffDesignHistory', { designId: 'des-1', from: 'h1' });
  });

  it('resolves a slug when organizationId is given', async () => {
    mockCallEzmodoAPI
      .mockResolvedValueOnce({ design: { id: 'des-7' } })
      .mockResolvedValueOnce({});

    await getDesign({ designId: 'primary-button', organizationId: 'org-1', diffFrom: 'h1', diffTo: 'h2' });

    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpGetDesign', { designId: 'primary-button', organizationId: 'org-1' });
    expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpDiffDesignHistory', { designId: 'des-7', from: 'h1', to: 'h2' });
  });

  it('needs designId for history', async () => {
    await expect(getDesign({ designIds: ['a'], historyEntryId: 'h1' })).rejects.toThrow(/single design/);
  });
});

describe('manage_design restore', () => {
  it('restores conditionally on expectedUpdatedAt', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ design: { id: 'des-1', updatedAt: 't2' } });

    const result = await manageDesign({ action: 'restore', designId: 'des-1', historyEntryId: 'h1', expectedUpdatedAt: 't1' });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpRestoreDesignHistory', {
      designId: 'des-1', entryId: 'h1', expectedUpdatedAt: 't1',
    });
    expect(result.design.updatedAt).toBe('t2');
    expect(result.message).toMatch(/get_design/);
  });

  it('requires historyEntryId and expectedUpdatedAt', async () => {
    await expect(manageDesign({ action: 'restore', designId: 'des-1', expectedUpdatedAt: 't1' })).rejects.toThrow(/historyEntryId/);
    await expect(manageDesign({ action: 'restore', designId: 'des-1', historyEntryId: 'h1' })).rejects.toThrow(/expectedUpdatedAt/);
    expect(mockCallEzmodoAPI).not.toHaveBeenCalled();
  });

  it('tells the agent to re-read and retry on a 409', async () => {
    const conflict = Object.assign(new Error('design changed since expectedUpdatedAt'), { status: 409 });
    mockCallEzmodoAPI.mockRejectedValueOnce(conflict);

    const err = await manageDesign({ action: 'restore', designId: 'des-1', historyEntryId: 'h1', expectedUpdatedAt: 't0' })
      .catch((e) => e);

    expect(err.status).toBe(409);
    expect(err.message).toMatch(/Nothing was restored/);
    expect(err.message).toMatch(/get_design designId:"des-1"/);
    expect(err.message).toMatch(/retry/);
  });

  it('passes other errors through unchanged', async () => {
    const notFound = Object.assign(new Error('not found'), { status: 404 });
    mockCallEzmodoAPI.mockRejectedValueOnce(notFound);

    await expect(manageDesign({ action: 'restore', designId: 'des-1', historyEntryId: 'h1', expectedUpdatedAt: 't0' }))
      .rejects.toBe(notFound);
  });
});

describe('tool schemas', () => {
  const tool = (list, name) => list.find((t) => t.name === name).inputSchema;

  it('exposes the history params on get_document and get_design', () => {
    for (const p of ['includeHistory', 'includeVersions', 'historyEntryId', 'diffFrom', 'diffTo', 'versionNumber']) {
      expect(tool(DOCUMENT_TOOLS, 'get_document').properties[p]).toBeDefined();
    }
    for (const p of ['includeHistory', 'historyEntryId', 'diffFrom', 'diffTo', 'historyBefore']) {
      expect(tool(DESIGN_TOOLS, 'get_design').properties[p]).toBeDefined();
    }
  });

  it('adds restore to manage_document and manage_design', () => {
    expect(tool(DOCUMENT_TOOLS, 'manage_document').properties.action.enum).toContain('restore');
    expect(tool(DOCUMENT_TOOLS, 'manage_document').properties.historyEntryId).toBeDefined();
    expect(tool(DESIGN_TOOLS, 'manage_design').properties.action.enum).toContain('restore');
    expect(tool(DESIGN_TOOLS, 'manage_design').properties.historyEntryId).toBeDefined();
  });

  it('documents versionNumber as the N-th newest entry', () => {
    expect(tool(DOCUMENT_TOOLS, 'get_document').properties.versionNumber.description).toMatch(/N-th newest/);
  });
});
