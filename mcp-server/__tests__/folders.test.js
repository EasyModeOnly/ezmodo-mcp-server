import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageFolder, listFolders } = await import('../handlers/folders.js');

describe('Folder Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listFolders', () => {
    it('should list folders for a project', async () => {
      const folders = [
        { id: 'folder-1', name: 'Architecture', documentCount: 3 },
        { id: 'folder-2', name: 'Guides', documentCount: 5 },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folders, count: 2 });

      const args = { projectId: 'proj-1' };
      const result = await listFolders(args);

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListFolders', args);
      expect(result.success).toBe(true);
      expect(result.folders).toHaveLength(2);
      expect(result.folders[0].name).toBe('Architecture');
    });

    it('should return empty list for project with no folders', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folders: [], count: 0 });

      const result = await listFolders({ projectId: 'empty-proj' });

      expect(result.folders).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should handle project not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Project not found', 404));
      await expect(listFolders({ projectId: 'nonexistent' })).rejects.toThrow('Project not found');
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(listFolders({ projectId: 'proj-1' })).rejects.toThrow('Internal server error');
    });
  });

  describe('getFolderTree', () => {
    it('should get hierarchical folder tree', async () => {
      const tree = [
        {
          folder: { id: 'folder-1', name: 'Docs' },
          children: [
            { folder: { id: 'folder-2', name: 'API Docs' }, children: [] },
          ],
        },
      ];
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, tree });

      const args = { projectId: 'proj-1' };
      const result = await listFolders({ mode: 'tree', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGetFolderTree', args);
      expect(result.success).toBe(true);
      expect(result.tree).toHaveLength(1);
      expect(result.tree[0].children).toHaveLength(1);
    });

    it('should return empty tree for project with no folders', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, tree: [] });

      const result = await listFolders({ mode: 'tree', projectId: 'empty-proj' });

      expect(result.tree).toHaveLength(0);
    });

    it('should handle project not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Project not found', 404));
      await expect(listFolders({ mode: 'tree', projectId: 'nonexistent' })).rejects.toThrow('Project not found');
    });
  });

  describe('createFolder', () => {
    it('should create a folder with required fields', async () => {
      const mockResponse = { success: true, folderId: 'folder-new' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = { projectId: 'proj-1', name: 'New Folder' };
      const result = await manageFolder({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateFolder', args);
      expect(result.success).toBe(true);
      expect(result.folderId).toBe('folder-new');
    });

    it('should create a nested folder with parentFolderId mapped to parentId', async () => {
      const mockResponse = { success: true, folderId: 'folder-nested' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = { projectId: 'proj-1', name: 'Nested Folder', parentFolderId: 'folder-1' };
      const result = await manageFolder({ action: 'create', ...args });

      // parentFolderId should be mapped to parentId for the Go API
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateFolder', {
        projectId: 'proj-1',
        name: 'Nested Folder',
        parentId: 'folder-1',
      });
      expect(result.success).toBe(true);
    });

    it('should create a folder with color and icon', async () => {
      const mockResponse = { success: true, folderId: 'folder-styled' };
      mockCallEzmodoAPI.mockResolvedValueOnce(mockResponse);

      const args = { projectId: 'proj-1', name: 'Styled Folder', color: 'blue', icon: 'book' };
      const result = await manageFolder({ action: 'create', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateFolder', args);
      expect(result.success).toBe(true);
    });

    it('should propagate API errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('projectId and name are required', 400));
      await expect(manageFolder({ action: 'create', projectId: '' })).rejects.toThrow('projectId and name are required');
    });

    it('should handle network errors', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(new Error('Network error'));
      await expect(manageFolder({ action: 'create', projectId: 'proj-1', name: 'Folder' })).rejects.toThrow('Network error');
    });
  });

  describe('updateFolder', () => {
    it('should update a folder name', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1' });

      const args = { projectId: 'proj-1', folderId: 'folder-1', name: 'Updated Name' };
      const result = await manageFolder({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateFolder', args);
      expect(result.success).toBe(true);
      expect(result.folderId).toBe('folder-1');
    });

    it('should update folder color and icon', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1' });

      const args = { projectId: 'proj-1', folderId: 'folder-1', color: 'red', icon: 'star' };
      const result = await manageFolder({ action: 'update', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateFolder', args);
      expect(result.success).toBe(true);
    });

    it('should move folder when parentFolderId is provided with name update', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1' });
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1', status: 'moved' });

      const args = { projectId: 'proj-1', folderId: 'folder-1', name: 'Updated', parentFolderId: 'folder-parent' };
      const result = await manageFolder({ action: 'update', ...args });

      // First call: update (without parentFolderId)
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(1, 'mcpUpdateFolder', {
        projectId: 'proj-1', folderId: 'folder-1', name: 'Updated',
      });
      // Second call: move
      expect(mockCallEzmodoAPI).toHaveBeenNthCalledWith(2, 'mcpMoveFolder', {
        projectId: 'proj-1', folderId: 'folder-1', newParentId: 'folder-parent',
      });
      expect(result.success).toBe(true);
      expect(result.moved).toBe(true);
    });

    it('should move folder without calling update when only parentFolderId is provided', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1', status: 'moved' });

      const result = await manageFolder({ action: 'update', projectId: 'proj-1', folderId: 'folder-1', parentFolderId: 'folder-parent' });

      // Only one call: move (no update call since no fields to update)
      expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1);
      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpMoveFolder', {
        projectId: 'proj-1', folderId: 'folder-1', newParentId: 'folder-parent',
      });
      expect(result.moved).toBe(true);
    });

    it('should move folder to root when parentFolderId is "root"', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1', status: 'moved' });

      await manageFolder({ action: 'update', projectId: 'proj-1', folderId: 'folder-1', parentFolderId: 'root' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpMoveFolder', {
        projectId: 'proj-1', folderId: 'folder-1', newParentId: null,
      });
    });

    it('should throw clear error when no updates provided', async () => {
      await expect(
        manageFolder({ action: 'update', projectId: 'proj-1', folderId: 'folder-1' })
      ).rejects.toThrow('No updates provided. Specify at least one of: name, color, icon, or parentFolderId.');
    });

    it('should handle folder not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Folder not found', 404));
      await expect(manageFolder({ action: 'update', projectId: 'proj-1', folderId: 'nonexistent', name: 'x' })).rejects.toThrow('Folder not found');
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(manageFolder({ action: 'update', projectId: 'proj-1', folderId: 'folder-1', name: 'x' })).rejects.toThrow('Internal server error');
    });
  });

  describe('deleteFolder', () => {
    it('should delete a folder (default: move contents to root)', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1', status: 'deleted' });

      const args = { projectId: 'proj-1', folderId: 'folder-1' };
      const result = await manageFolder({ action: 'delete', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteFolder', args);
      expect(result.success).toBe(true);
      expect(result.status).toBe('deleted');
    });

    it('should delete a folder with cascade', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'folder-1', status: 'deleted' });

      const args = { projectId: 'proj-1', folderId: 'folder-1', cascade: true };
      const result = await manageFolder({ action: 'delete', ...args });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpDeleteFolder', args);
      expect(result.success).toBe(true);
    });

    it('should handle folder not found', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Folder not found', 404));
      await expect(manageFolder({ action: 'delete', projectId: 'proj-1', folderId: 'nonexistent' })).rejects.toThrow('Folder not found');
    });

    it('should handle server error', async () => {
      mockCallEzmodoAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(manageFolder({ action: 'delete', projectId: 'proj-1', folderId: 'folder-1' })).rejects.toThrow('Internal server error');
    });
  });
});

// `access` was advertised in the manage_folder schema as a create+update field,
// but folders.CreateFolderRequest / UpdateFolderRequest carry no access field —
// the Go decoder threw it away on both paths. The capability is real, just on
// the generic entity-access API with no MCP surface, so the folder write still
// happens and the dropped part is reported instead of vanishing.
describe('manage_folder access is reported, not silently dropped', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not forward access to the create API', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'f1' });

    await manageFolder({
      action: 'create',
      projectId: 'proj-1',
      name: 'Specs',
      access: { publicAccess: true },
    });

    expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateFolder', {
      projectId: 'proj-1',
      name: 'Specs',
    });
  });

  it('still creates the folder, but warns that access was ignored', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'f1' });

    const result = await manageFolder({
      action: 'create',
      projectId: 'proj-1',
      name: 'Specs',
      access: { publicAccess: true },
    });

    expect(result.success).toBe(true);
    expect(result.warning).toMatch(/access/i);
  });

  it('does not warn when access is not passed', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true, folderId: 'f1' });

    const result = await manageFolder({ action: 'create', projectId: 'proj-1', name: 'Specs' });

    expect(result.warning).toBeUndefined();
  });

  // The worst shape: the move succeeded and returned success, so the caller had
  // every reason to believe the access change landed too.
  it('warns when access rides along with a move', async () => {
    mockCallEzmodoAPI.mockResolvedValueOnce({ success: true });

    const result = await manageFolder({
      action: 'update',
      projectId: 'proj-1',
      folderId: 'f1',
      parentFolderId: 'root',
      access: { publicAccess: true },
    });

    expect(result.moved).toBe(true);
    expect(result.warning).toMatch(/access/i);
    expect(mockCallEzmodoAPI).toHaveBeenCalledTimes(1); // move only, no field update
  });

  it('explains why an access-only update is not applicable', async () => {
    await expect(
      manageFolder({
        action: 'update',
        projectId: 'proj-1',
        folderId: 'f1',
        access: { publicAccess: true },
      })
    ).rejects.toThrow(/access/i);
  });

  it('keeps the plain no-updates error when nothing at all was passed', async () => {
    await expect(
      manageFolder({ action: 'update', projectId: 'proj-1', folderId: 'f1' })
    ).rejects.toThrow('No updates provided. Specify at least one of: name, color, icon, or parentFolderId.');
  });
});
