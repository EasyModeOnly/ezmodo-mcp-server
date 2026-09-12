import { jest } from '@jest/globals';
import { createMockError } from './test-utils.js';

// Mock the http client
const mockCallZephlyAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callZephlyAPI: mockCallZephlyAPI,
}));

const { getOrganization } = await import('../handlers/organizations.js');

describe('Organization Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listOrganizations (mode=list)', () => {
    it('should list all organizations', async () => {
      const organizations = [
        { id: 'org-1', name: 'Acme Corp', slug: 'acme-corp' },
        { id: 'org-2', name: 'Personal', slug: 'personal' },
      ];
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, organizations, count: 2 });

      const result = await getOrganization({ mode: 'list' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListOrganizations', {});
      expect(result.success).toBe(true);
      expect(result.organizations).toHaveLength(2);
      expect(result.organizations[0].slug).toBe('acme-corp');
    });

    it('should return empty list when user has no organizations', async () => {
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, organizations: [], count: 0 });

      const result = await getOrganization({ mode: 'list' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpListOrganizations', {});
      expect(result.organizations).toHaveLength(0);
    });

    it('should handle authentication error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Unauthorized', 401));
      await expect(getOrganization({ mode: 'list' })).rejects.toThrow('Unauthorized');
    });

    it('should handle server error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Internal server error', 500));
      await expect(getOrganization({ mode: 'list' })).rejects.toThrow('Internal server error');
    });
  });

  describe('getDefaultOrganization (mode=default)', () => {
    it('should get the default organization', async () => {
      const organization = { id: 'org-1', name: 'Personal', slug: 'personal', isDefault: true };
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, organization });

      const result = await getOrganization({ mode: 'default' });

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetDefaultOrganization', {});
      expect(result.success).toBe(true);
      expect(result.organization.isDefault).toBe(true);
      expect(result.organization.slug).toBe('personal');
    });

    it('should default to default mode when no mode specified', async () => {
      const organization = { id: 'org-1', name: 'Personal', slug: 'personal', isDefault: true };
      mockCallZephlyAPI.mockResolvedValueOnce({ success: true, organization });

      const result = await getOrganization({});

      expect(mockCallZephlyAPI).toHaveBeenCalledWith('mcpGetDefaultOrganization', {});
      expect(result.success).toBe(true);
    });

    it('should handle no default organization', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('No default organization found', 404));
      await expect(getOrganization({ mode: 'default' })).rejects.toThrow('No default organization found');
    });

    it('should handle authentication error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(createMockError('Unauthorized', 401));
      await expect(getOrganization({ mode: 'default' })).rejects.toThrow('Unauthorized');
    });

    it('should handle network error', async () => {
      mockCallZephlyAPI.mockRejectedValueOnce(new Error('Network error'));
      await expect(getOrganization({ mode: 'default' })).rejects.toThrow('Network error');
    });
  });
});
