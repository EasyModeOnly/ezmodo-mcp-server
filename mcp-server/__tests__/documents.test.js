import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

// Mock local-cache
const mockFindConfigPath = jest.fn();
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  findConfigPath: mockFindConfigPath,
}));

// Mock fs
const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('fs/promises', () => ({
  default: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  },
}));

// Mock logger
jest.unstable_mockModule('../lib/logger.js', () => ({
  getLogger: () => ({ warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

const { manageDocument, getDocument } = await import('../handlers/documents.js');

describe('Document Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDocument', () => {
    it('should save document content to local file and return path', async () => {
      const document = { id: 'doc-1', title: 'My Doc', content: '# Hello', slug: 'my-doc', projectId: 'proj-1' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, document });
      mockFindConfigPath.mockResolvedValueOnce('/project/.ezmodo/config.json');

      const result = await getDocument({ documentId: 'doc-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDocument', { documentId: 'doc-1' });
      expect(mockMkdir).toHaveBeenCalledWith('/project/.ezmodo/docs', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith('/project/.ezmodo/docs/my-doc.md', '# Hello', 'utf-8');
      expect(result.localFilePath).toBe('/project/.ezmodo/docs/my-doc.md');
      expect(result.document.title).toBe('My Doc');
      expect(result.document.content).toBeUndefined();
    });

    it('should use document ID as filename when slug is missing', async () => {
      const document = { id: 'doc-1', title: 'No Slug', content: '# Content', projectId: 'proj-1' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, document });
      mockFindConfigPath.mockResolvedValueOnce('/project/.ezmodo/config.json');

      const result = await getDocument({ documentId: 'doc-1' });

      expect(mockWriteFile).toHaveBeenCalledWith('/project/.ezmodo/docs/doc-1.md', '# Content', 'utf-8');
      expect(result.localFilePath).toBe('/project/.ezmodo/docs/doc-1.md');
    });

    it('should get a document by projectId and slug', async () => {
      const document = { id: 'doc-2', title: 'Slug Doc', content: '# Slug', slug: 'slug-doc', projectId: 'proj-1' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, document });
      mockFindConfigPath.mockResolvedValueOnce('/project/.ezmodo/config.json');

      const args = { projectId: 'proj-1', slug: 'slug-doc' };
      const result = await getDocument(args);

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDocument', args);
      expect(result.localFilePath).toBe('/project/.ezmodo/docs/slug-doc.md');
      expect(result.document.title).toBe('Slug Doc');
    });

    it('should return full response when no .ezmodo directory found', async () => {
      const document = { id: 'doc-1', title: 'My Doc', content: '# Hello', slug: 'my-doc', projectId: 'proj-1' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, document });
      mockFindConfigPath.mockResolvedValueOnce(null);

      const result = await getDocument({ documentId: 'doc-1' });

      expect(result.document.content).toBe('# Hello');
      expect(result.localFilePath).toBeUndefined();
    });

    it('should return full response when file write fails', async () => {
      const document = { id: 'doc-1', title: 'My Doc', content: '# Hello', slug: 'my-doc', projectId: 'proj-1' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, document });
      mockFindConfigPath.mockResolvedValueOnce('/project/.ezmodo/config.json');
      mockMkdir.mockRejectedValueOnce(new Error('Permission denied'));

      const result = await getDocument({ documentId: 'doc-1' });

      expect(result.document.content).toBe('# Hello');
      expect(result.localFilePath).toBeUndefined();
    });

    it('should handle document not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Document not found', 404));
      await expect(getDocument({ documentId: 'nonexistent' })).rejects.toThrow('Document not found');
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(getDocument({ documentId: 'doc-1' })).rejects.toThrow('Internal server error');
    });
  });

  describe('getDocumentation', () => {
    it('should get documentation for a project', async () => {
      const documents = [
        { id: 'doc-1', title: 'Getting Started', content: '# Getting Started\n...' },
        { id: 'doc-2', title: 'API Reference', content: '# API\n...' },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documents, count: 2 });

      const args = { projectId: 'proj-1' };
      const result = await getDocument(args);

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDocumentation', args);
      expect(result.success).toBe(true);
      expect(result.documents).toHaveLength(2);
      expect(result.documents[0].title).toBe('Getting Started');
    });

    it('should return empty list for project with no docs', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documents: [], count: 0 });

      const result = await getDocument({ projectId: 'empty-proj' });

      expect(result.documents).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should handle project not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Project not found', 404));
      await expect(getDocument({ projectId: 'nonexistent' })).rejects.toThrow('Project not found');
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(getDocument({ projectId: 'proj-1' })).rejects.toThrow('Internal server error');
    });
  });

  describe('createDocument', () => {
    it('should create a document with required fields', async () => {
      const mockResponse = { success: true, documentId: 'doc-new' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = { projectId: 'proj-1', title: 'New Doc', content: '# New Document\nContent here.' };
      const result = await manageDocument({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', args);
      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc-new');
    });

    it('should create a document with publicAccess setting', async () => {
      const mockResponse = { success: true, documentId: 'doc-public' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = {
        projectId: 'proj-1',
        title: 'Public Doc',
        content: 'Public content',
        publicAccess: true,
      };
      const result = await manageDocument({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', args);
      expect(result.success).toBe(true);
    });

    it('should nest top-level summary/keyPoints into aiContext', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documentId: 'doc-ai' });

      await manageDocument({ action: 'create',
        projectId: 'proj-1',
        title: 'AI Doc',
        content: 'Content',
        summary: 'A summary',
        keyPoints: ['point 1', 'point 2'],
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', {
        projectId: 'proj-1',
        title: 'AI Doc',
        content: 'Content',
        aiContext: { summary: 'A summary', keyPoints: ['point 1', 'point 2'] },
      });
    });

    it('should pass nested aiContext through to the API', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documentId: 'doc-ai2' });

      await manageDocument({ action: 'create',
        projectId: 'proj-1',
        title: 'AI Doc',
        content: 'Content',
        aiContext: { summary: 'Nested summary', keyPoints: ['kp1'], relatedTasks: ['task-1'] },
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', {
        projectId: 'proj-1',
        title: 'AI Doc',
        content: 'Content',
        aiContext: { summary: 'Nested summary', keyPoints: ['kp1'], relatedTasks: ['task-1'] },
      });
    });

    it('should merge top-level fields over nested aiContext', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documentId: 'doc-ai3' });

      await manageDocument({ action: 'create',
        projectId: 'proj-1',
        title: 'AI Doc',
        content: 'Content',
        aiContext: { summary: 'Old summary', relatedTasks: ['task-1'] },
        summary: 'New summary',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', {
        projectId: 'proj-1',
        title: 'AI Doc',
        content: 'Content',
        aiContext: { summary: 'New summary', relatedTasks: ['task-1'] },
      });
    });

    it('should propagate API errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Missing required field: title', 400));
      await expect(manageDocument({ action: 'create', projectId: 'proj-1', content: 'no title' })).rejects.toThrow('Missing required field: title');
    });

    it('should handle network errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(new Error('Network error'));
      await expect(manageDocument({ action: 'create', projectId: 'proj-1', title: 'Doc', content: 'c' })).rejects.toThrow('Network error');
    });
  });

  describe('updateDocument', () => {
    it('should update a document', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Document updated' });

      const args = { documentId: 'doc-1', title: 'Updated Title', content: '# Updated\nNew content.' };
      const result = await manageDocument({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDocument', args);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Document updated');
    });

    it('should update document content only', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Document updated' });

      const args = { documentId: 'doc-1', content: 'Only content changed' };
      const result = await manageDocument({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDocument', args);
      expect(result.success).toBe(true);
    });

    it('should nest top-level summary/keyPoints into aiContext', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Document updated' });

      await manageDocument({ action: 'update',
        documentId: 'doc-1',
        summary: 'Updated summary',
        keyPoints: ['new point'],
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDocument', {
        documentId: 'doc-1',
        aiContext: { summary: 'Updated summary', keyPoints: ['new point'] },
      });
    });

    it('should pass nested aiContext through to the API', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Document updated' });

      await manageDocument({ action: 'update',
        documentId: 'doc-1',
        aiContext: { summary: 'Nested summary', keyPoints: ['kp1'], relatedDocs: ['doc-2'] },
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDocument', {
        documentId: 'doc-1',
        aiContext: { summary: 'Nested summary', keyPoints: ['kp1'], relatedDocs: ['doc-2'] },
      });
    });

    it('should merge top-level fields over nested aiContext', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Document updated' });

      await manageDocument({ action: 'update',
        documentId: 'doc-1',
        aiContext: { summary: 'Old', relatedTasks: ['task-1'] },
        keyPoints: ['override point'],
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDocument', {
        documentId: 'doc-1',
        aiContext: { summary: 'Old', relatedTasks: ['task-1'], keyPoints: ['override point'] },
      });
    });

    it('should handle not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Document not found', 404));
      await expect(manageDocument({ action: 'update', documentId: 'nonexistent', content: 'x' })).rejects.toThrow('Document not found');
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(manageDocument({ action: 'update', documentId: 'doc-1', content: 'x' })).rejects.toThrow('Internal server error');
    });
  });

  // ===== Markdown is the whole content contract (E-192) =====

  describe('document content', () => {
    it('should save document content as .md', async () => {
      const document = { id: 'doc-1', title: 'MD Doc', content: '# Hello', slug: 'md-doc', projectId: 'proj-1' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ document });
      mockFindConfigPath.mockResolvedValueOnce('/project/.ezmodo/config.json');

      const result = await getDocument({ documentId: 'doc-1' });

      expect(mockWriteFile).toHaveBeenCalledWith('/project/.ezmodo/docs/md-doc.md', '# Hello', 'utf-8');
      expect(result.localFilePath).toBe('/project/.ezmodo/docs/md-doc.md');
    });

    it('should return as-is when the document has no content', async () => {
      const document = { id: 'doc-1', title: 'Empty', projectId: 'proj-1' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ document });

      const result = await getDocument({ documentId: 'doc-1' });

      expect(mockMkdir).not.toHaveBeenCalled();
      expect(result.document).toEqual(document);
    });

    it('should create with markdown content only', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ documentId: 'doc-md' });

      await manageDocument({ action: 'create', projectId: 'proj-1', title: 'MD Doc', content: '# Hello' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', {
        projectId: 'proj-1',
        title: 'MD Doc',
        content: '# Hello',
      });
    });

    it('should update with markdown content only', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ documentId: 'doc-1' });

      await manageDocument({ action: 'update', documentId: 'doc-1', title: 'New Title' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDocument', {
        documentId: 'doc-1',
        title: 'New Title',
      });
    });

    // The section model is gone and the tool no longer declares these params.
    // If an agent sends one anyway it is forwarded verbatim so the API can
    // answer with an explicit 400 — better than the handler stripping it and
    // reporting a success that changed nothing.
    it('should forward removed section params so the API can reject them', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(
        createMockError('Section operations were removed along with the legacy section model.', 400)
      );

      await expect(
        manageDocument({
          action: 'update',
          documentId: 'doc-1',
          updateSections: [{ sectionId: 's1', content: {} }],
        })
      ).rejects.toThrow('Section operations were removed');

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateDocument', {
        documentId: 'doc-1',
        updateSections: [{ sectionId: 's1', content: {} }],
      });
    });
  });

  // ===== Diagram document tests =====

  describe('diagram documents', () => {
    it('should pass type through when creating a diagram document', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documentId: 'doc-diagram' });

      const result = await manageDocument({
        action: 'create',
        projectId: 'proj-1',
        title: 'Architecture Diagram',
        type: 'diagram',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', {
        projectId: 'proj-1',
        title: 'Architecture Diagram',
        type: 'diagram',
      });
      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc-diagram');
    });

    it('should pass content when creating an excalidraw diagram', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documentId: 'doc-excalidraw' });

      const result = await manageDocument({
        action: 'create',
        projectId: 'proj-1',
        title: 'Whiteboard',
        type: 'diagram',
        content: 'excalidraw',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', {
        projectId: 'proj-1',
        title: 'Whiteboard',
        type: 'diagram',
        content: 'excalidraw',
      });
      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc-excalidraw');
    });

    it('should list documents with diagram type filter', async () => {
      const documents = [
        { id: 'doc-d1', title: 'System Diagram', type: 'diagram' },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documents, count: 1 });

      const result = await getDocument({ projectId: 'proj-1', docType: 'diagram' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetDocumentation', {
        projectId: 'proj-1',
        docType: 'diagram',
      });
      expect(result.success).toBe(true);
      expect(result.documents).toHaveLength(1);
    });

    it('should pass content when creating a sitemap diagram', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, documentId: 'doc-sitemap' });

      const result = await manageDocument({
        action: 'create',
        projectId: 'proj-1',
        title: 'Site Map',
        type: 'diagram',
        content: 'sitemap',
      });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateDocument', {
        projectId: 'proj-1',
        title: 'Site Map',
        type: 'diagram',
        content: 'sitemap',
      });
      expect(result.documentId).toBe('doc-sitemap');
    });
  });
});

/**
 * E-225: a document can be born linked to the feature/epic it describes, and the
 * related-item enum is no longer frozen at the stale 4-type list.
 */
describe('Document links (E-225)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  function callsTo(endpoint) {
    return mockCallEzmodoAPI.mock.calls.filter((c) => c[0] === endpoint);
  }

  it('applies create-time links after the document exists', async () => {
    mockCallEzmodoAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpCreateDocument') return { success: true, documentId: 'doc-9' };
      return { success: true };
    });

    const result = await manageDocument({
      action: 'create',
      projectId: 'proj-1',
      title: 'Rate limiting design',
      links: [{ targetType: 'feature', targetId: 'feat-1' }],
    });

    expect(callsTo('mcpCreateDocument')[0][1]).not.toHaveProperty('links');
    expect(callsTo('mcpAddLink')[0][1]).toMatchObject({
      sourceType: 'document',
      sourceId: 'doc-9',
    });
    expect(result.links.applied).toHaveLength(1);
  });

  it('still returns the created document when linking fails', async () => {
    mockCallEzmodoAPI.mockImplementation(async (endpoint) => {
      if (endpoint === 'mcpCreateDocument') return { success: true, documentId: 'doc-9' };
      throw new Error('Target not found');
    });

    const result = await manageDocument({
      action: 'create',
      projectId: 'proj-1',
      title: 'Rate limiting design',
      links: [{ targetType: 'feature', targetId: 'nope' }],
    });

    expect(result.documentId).toBe('doc-9');
    expect(result.links.failed).toHaveLength(1);
  });

  it('uses the shared linkable-type list for related items', async () => {
    const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
    const { LINKABLE_TYPES } = await import('../tools/linkable-types.js');
    const props = DOCUMENT_TOOLS.find((t) => t.name === 'manage_document').inputSchema.properties;

    expect(props.addRelatedItem.properties.type.enum).toBe(LINKABLE_TYPES);
    expect(props.removeRelatedItem.properties.type.enum).toBe(LINKABLE_TYPES);
    expect(props.links.type).toBe('array');
  });
});
