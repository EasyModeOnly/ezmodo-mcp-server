import { jest } from '@jest/globals';

const mockCall = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCall }));

const { getDocument, listOrgDocuments } = await import('../handlers/documents.js');
const { contentsRequest, wantsContents } = await import('../lib/doc-contents.js');
const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

describe('folder contents over MCP (E-343 #3958)', () => {
  beforeEach(() => mockCall.mockReset().mockResolvedValue({ documents: [], folders: [], total: 0, hasMore: false }));

  it('get_document list mode with a folder and filters asks for the contents list', async () => {
    await getDocument({
      projectId: 'p1', folderId: 'f1', q: 'billing', statuses: ['in_review'], status: 'draft',
      docType: 'guide', ownerIds: ['u1'], tagIds: ['t1', 't2'], sort: 'updated', limit: 20,
    });
    expect(mockCall).toHaveBeenCalledWith('mcpListDocumentContents', {
      projectId: 'p1', folderId: 'f1', q: 'billing', status: 'in_review,draft', type: 'guide',
      ownerId: 'u1', tagId: 't1,t2', sort: 'updated', limit: 20,
    });
  });

  it('get_document list mode without them keeps the older list', async () => {
    await getDocument({ projectId: 'p1', status: 'published' });
    expect(mockCall).toHaveBeenCalledWith('mcpGetDocumentation', { projectId: 'p1', status: 'published' });
  });

  it('list_org_documents with a search lists the workspace folder, and says how to read on', async () => {
    mockCall.mockResolvedValue({ documents: [], hasMore: true, nextCursor: 'abc' });
    const out = await listOrgDocuments({ organizationId: 'o1', folderId: 'adrs', q: 'auth', cursor: 'x' });
    expect(mockCall).toHaveBeenCalledWith('mcpListDocumentContents',
      { organizationId: 'o1', folderId: 'adrs', q: 'auth', cursor: 'x' });
    expect(out.hint).toMatch(/cursor:"abc"/);
  });

  it('list_org_documents with only a folder keeps the flat list', async () => {
    await listOrgDocuments({ organizationId: 'o1', folderId: 'adrs', limit: 10 });
    expect(mockCall).toHaveBeenCalledWith('mcpListOrgDocuments', { organizationId: 'o1', folderId: 'adrs', limit: 10 });
  });

  it('refuses a bad sort before the network', () => {
    expect(() => contentsRequest({ projectId: 'p' }, { sort: 'random' })).toThrow(/sort must be/);
    expect(() => contentsRequest({}, {})).toThrow(/projectId/);
    expect(wantsContents({ limit: 5 })).toBe(false);
  });

  it('exposes the filters on both tools and maps the route', () => {
    for (const name of ['get_document', 'list_org_documents']) {
      const props = DOCUMENT_TOOLS.find((t) => t.name === name).inputSchema.properties;
      expect(props).toEqual(expect.objectContaining({ q: expect.any(Object), cursor: expect.any(Object), sort: expect.any(Object) }));
    }
    expect(ENDPOINT_MAP.mcpListDocumentContents).toEqual({ route: 'mcp/v1/documents/contents', method: 'GET' });
  });
});
