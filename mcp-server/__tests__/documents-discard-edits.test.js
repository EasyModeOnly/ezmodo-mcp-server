import { jest } from '@jest/globals';

const mockCall = jest.fn();
const mockFind = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCall }));
jest.unstable_mockModule('../lib/doc-files.js', () => ({
  findDownloadedDoc: mockFind,
  readDocFile: jest.fn(),
  refreshDocFile: jest.fn(),
  safeFileStem: jest.fn(),
  setAsideAndRefreshDoc: jest.fn(),
  writeDocFile: jest.fn(),
}));

const { manageDocument } = await import('../handlers/documents.js');
const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

describe('manage_document action:"discard_edits" (E-343 #3961)', () => {
  beforeEach(() => {
    mockCall.mockReset().mockResolvedValue({ documentId: 'd1', status: 'published' });
    mockFind.mockReset().mockResolvedValue(null);
  });

  it('sends the document and the updatedAt it was read at', async () => {
    const out = await manageDocument({ action: 'discard_edits', documentId: 'd1', expectedUpdatedAt: '2026-11-19T10:00:00Z' });
    expect(mockCall).toHaveBeenCalledWith('mcpDiscardDocumentEdits',
      { documentId: 'd1', expectedUpdatedAt: '2026-11-19T10:00:00Z' });
    expect(out.status).toBe('published');
  });

  it('refuses without expectedUpdatedAt, before the network', async () => {
    await expect(manageDocument({ action: 'discard_edits', documentId: 'd1' })).rejects.toThrow(/expectedUpdatedAt is required/);
    expect(mockCall).not.toHaveBeenCalled();
  });

  it('needs a documentId', async () => {
    await expect(manageDocument({ action: 'discard_edits', expectedUpdatedAt: 'x' })).rejects.toThrow(/documentId is required/);
  });

  it('warns that a downloaded copy still holds the discarded edits', async () => {
    mockFind.mockResolvedValue({ file: '.ezmodo/docs/runbook.md', changed: false });
    const out = await manageDocument({ action: 'discard_edits', documentId: 'd1', expectedUpdatedAt: 'x' });
    expect(out.localFile).toBe('.ezmodo/docs/runbook.md');
    expect(out.note).toMatch(/overwriteLocal:true/);
  });

  it('is in the tool schema and maps to the API route', () => {
    const actions = DOCUMENT_TOOLS.find((t) => t.name === 'manage_document').inputSchema.properties.action.enum;
    expect(actions).toContain('discard_edits');
    expect(ENDPOINT_MAP.mcpDiscardDocumentEdits).toEqual({ route: 'mcp/v1/documents/discard-edits', method: 'POST' });
  });
});
