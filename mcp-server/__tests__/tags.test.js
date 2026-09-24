import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

// Mock local cache — return no cached data so all calls go through API
jest.unstable_mockModule('../lib/local-cache.js', () => ({
  getCachedTags: jest.fn().mockResolvedValue(null),
  updateCacheSections: jest.fn().mockResolvedValue(undefined),
  invalidateCacheSection: jest.fn().mockResolvedValue(undefined),
}));

const { manageTag, listTags } = await import('../handlers/tags.js');

describe('Tag Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createTag', () => {
    it('should create a tag with required fields', async () => {
      const mockResponse = { success: true, tagId: 'tag-new' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = { organizationId: 'org-1', name: 'frontend' };
      const result = await manageTag({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateTag', args);
      expect(result.success).toBe(true);
      expect(result.tagId).toBe('tag-new');
    });

    it('should create a tag with category and color', async () => {
      const mockResponse = { success: true, tagId: 'tag-full' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = { organizationId: 'org-1', name: 'critical', category: 'priority', color: '#ff0000' };
      const result = await manageTag({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateTag', args);
      expect(result.success).toBe(true);
    });

    it('should propagate API errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Tag already exists', 409));
      await expect(manageTag({ action: 'create', organizationId: 'org-1', name: 'duplicate' })).rejects.toThrow('Tag already exists');
    });
  });

  describe('listTags', () => {
    it('should list tags for an organization', async () => {
      const tags = [
        { id: 'tag-1', name: 'frontend' },
        { id: 'tag-2', name: 'backend' },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, tags, count: 2 });

      const args = { organizationId: 'org-1' };
      const result = await listTags(args);

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListTags', args);
      expect(result.tags).toHaveLength(2);
      expect(result.count).toBe(2);
    });

    it('should return empty list when no tags exist', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, tags: [], count: 0 });

      const result = await listTags({ organizationId: 'org-empty' });

      expect(result.tags).toHaveLength(0);
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(listTags({ organizationId: 'org-1' })).rejects.toThrow('Internal server error');
    });
  });

  describe('getTag', () => {
    it('should get a tag by ID', async () => {
      const mockTag = { id: 'tag-1', name: 'frontend', category: 'area' };
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, tag: mockTag });

      const args = { tagId: 'tag-1' };
      const result = await listTags(args);

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetTag', args);
      expect(result.tag.name).toBe('frontend');
    });

    it('should handle not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Tag not found', 404));
      await expect(listTags({ tagId: 'nonexistent' })).rejects.toThrow('Tag not found');
    });
  });

  describe('updateTag', () => {
    it('should update a tag', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Tag updated' });

      const args = { tagId: 'tag-1', name: 'updated-name', color: '#00ff00' };
      const result = await manageTag({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateTag', args);
      expect(result.success).toBe(true);
    });

    it('should handle update error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Tag not found', 404));
      await expect(manageTag({ action: 'update', tagId: 'bad' })).rejects.toThrow('Tag not found');
    });
  });

  describe('deleteTag', () => {
    it('should delete a tag', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Tag deleted' });

      const args = { tagId: 'tag-1' };
      const result = await manageTag({ action: 'delete', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteTag', args);
      expect(result.success).toBe(true);
    });

    it('should handle delete error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Tag not found', 404));
      await expect(manageTag({ action: 'delete', tagId: 'nonexistent' })).rejects.toThrow('Tag not found');
    });
  });

  describe('mergeTags', () => {
    it('should merge tags', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Tags merged', mergedCount: 3 });

      const args = { sourceTagIds: ['tag-1', 'tag-2'], targetTagId: 'tag-3' };
      const result = await manageTag({ action: 'merge', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpMergeTags', args);
      expect(result.success).toBe(true);
      expect(result.mergedCount).toBe(3);
    });

    it('should handle merge error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Target tag not found', 404));
      await expect(manageTag({ action: 'merge', sourceTagIds: ['tag-1'], targetTagId: 'bad' })).rejects.toThrow('Target tag not found');
    });
  });

  describe('bulkTagEntities', () => {
    it('should tag multiple entities', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, message: 'Entities tagged', taggedCount: 5 });

      const args = { tagIds: ['tag-1', 'tag-2'], entityIds: ['task-1', 'task-2', 'task-3'], entityType: 'task' };
      const result = await manageTag({ action: 'bulk_tag', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpBulkTagEntities', args);
      expect(result.success).toBe(true);
      expect(result.taggedCount).toBe(5);
    });

    it('should handle errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Invalid entity type', 400));
      await expect(manageTag({ action: 'bulk_tag', tagIds: ['tag-1'], entityIds: ['e1'], entityType: 'invalid' })).rejects.toThrow('Invalid entity type');
    });
  });

  describe('findEntitiesByTags', () => {
    it('should find entities by tags', async () => {
      const entities = [
        { id: 'task-1', type: 'task', title: 'Task One' },
        { id: 'task-2', type: 'task', title: 'Task Two' },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, entities, count: 2 });

      const args = { tagIds: ['tag-1'], entityType: 'task' };
      const result = await listTags({ findEntities: true, ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpFindEntitiesByTags', args);
      expect(result.entities).toHaveLength(2);
    });

    it('should return empty when no matches', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, entities: [], count: 0 });

      const result = await listTags({ findEntities: true, tagIds: ['tag-unknown'] });

      expect(result.entities).toHaveLength(0);
    });

    it('should handle errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(listTags({ findEntities: true, tagIds: ['tag-1'] })).rejects.toThrow('Internal server error');
    });
  });

  describe('suggestTags', () => {
    it('should suggest tags for content', async () => {
      const suggestions = [
        { tagId: 'tag-1', name: 'frontend', confidence: 0.9 },
        { tagId: 'tag-2', name: 'react', confidence: 0.8 },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, suggestions });

      const args = { content: 'Build a React component for the dashboard', organizationId: 'org-1' };
      const result = await listTags({ suggest: true, ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpSuggestTags', args);
      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0].confidence).toBe(0.9);
    });

    it('should handle errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('AI service unavailable', 503));
      await expect(listTags({ suggest: true, content: 'test', organizationId: 'org-1' })).rejects.toThrow('AI service unavailable');
    });
  });

});
