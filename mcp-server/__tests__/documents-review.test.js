import { jest } from '@jest/globals';

const mockCall = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCall }));

const { manageDocument } = await import('../handlers/documents.js');
const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

describe('document review over MCP (E-304 #3454)', () => {
  beforeEach(() => mockCall.mockReset().mockResolvedValue({ documentId: 'd1', status: 'in_review' }));

  it('submits for review with a note', async () => {
    await manageDocument({ action: 'submit_for_review', documentId: 'd1', note: 'Reworded step two' });
    expect(mockCall).toHaveBeenCalledWith('mcpReviewDocument',
      { documentId: 'd1', action: 'submit', note: 'Reworded step two' });
  });

  it('withdraws, and sends no note with it', async () => {
    await manageDocument({ action: 'withdraw_review', documentId: 'd1', note: 'ignored' });
    expect(mockCall).toHaveBeenCalledWith('mcpReviewDocument', { documentId: 'd1', action: 'withdraw' });
  });

  it('needs a documentId', async () => {
    await expect(manageDocument({ action: 'submit_for_review' })).rejects.toThrow(/documentId is required/);
  });

  it('offers no publish or approve action', () => {
    const actions = DOCUMENT_TOOLS.find((t) => t.name === 'manage_document').inputSchema.properties.action.enum;
    expect(actions).toEqual(expect.arrayContaining(['submit_for_review', 'withdraw_review']));
    expect(actions.some((a) => /publish|approve/.test(a))).toBe(false);
  });

  it('maps to the API route', () => {
    expect(ENDPOINT_MAP.mcpReviewDocument).toEqual({ route: 'mcp/v1/document-review', method: 'POST' });
  });
});
