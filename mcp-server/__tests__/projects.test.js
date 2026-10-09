import { jest } from '@jest/globals';

// Mock the http client
const mockCallEzmodoAPI = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({
  callEzmodoAPI: mockCallEzmodoAPI,
}));

const { manageProject, getProject } = await import('../handlers/projects.js');

describe('Project Operations', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('manageProject', () => {
    it('should create a project', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ projectId: 'proj-1', name: 'My Project' });

      const params = { organizationId: 'org-1', name: 'My Project' };
      const result = await manageProject({ action: 'create', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpCreateProject', params);
      expect(result.projectId).toBe('proj-1');
    });

    it('should update a project', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ project: { id: 'proj-1', name: 'My Project' } });

      const params = { projectId: 'proj-1', name: 'Renamed' };
      const result = await manageProject({ action: 'update', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateProject', params);
      expect(result.project.id).toBe('proj-1');
    });

    it('should pass gitUrl and gitProvider through on update', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ project: { id: 'proj-1' } });

      const params = {
        projectId: 'proj-1',
        gitUrl: 'https://github.com/EasyModeOnly/ezmodo',
        gitProvider: 'github',
      };
      await manageProject({ action: 'update', ...params });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpUpdateProject', params);
    });

    it('should generate the how-it-works summary', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ project: { id: 'proj-1', howItWorks: '## How it works' } });

      const result = await manageProject({ action: 'generate_how_it_works', projectId: 'proj-1' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpGenerateProjectHowItWorks', { projectId: 'proj-1' });
      expect(result.project.howItWorks).toBe('## How it works');
    });

    it('should reject an unknown action', async () => {
      await expect(manageProject({ action: 'frobnicate' })).rejects.toThrow(/Unknown action/);
    });
  });

  // callEzmodoAPI unwraps the Go API's {success, data} envelope, so the list
  // arrives as `{projects: [...]}` with no `success` flag. The filter branch
  // used to test for one and bail, returning the whole list unfiltered — a
  // query that matched nothing looked identical to one that matched everything.
  describe('getProject search', () => {
    it('should filter the unwrapped list by query text', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({
        projects: [
          { id: 'p1', name: 'Ezmodo', description: 'the tracker' },
          { id: 'p2', name: 'Saltpig', description: 'something else' },
        ],
      });

      const result = await getProject({ query: 'ezmodo' });

      expect(mockCallEzmodoAPI).toHaveBeenCalledWith('mcpListProjects', {});
      expect(result.projects.map((p) => p.id)).toEqual(['p1']);
      expect(result.count).toBe(1);
      expect(result.totalBeforeLimit).toBe(2);
    });

    it('should filter by organizationId', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({
        projects: [
          { id: 'p1', name: 'A', organizationId: 'org-1' },
          { id: 'p2', name: 'B', organizationId: 'org-2' },
        ],
      });

      const result = await getProject({ organizationId: 'org-2' });

      expect(result.projects.map((p) => p.id)).toEqual(['p2']);
    });

    it('should pass a malformed list straight back', async () => {
      mockCallEzmodoAPI.mockResolvedValueOnce({ unexpected: true });

      const result = await getProject({ query: 'anything' });

      expect(result).toEqual({ unexpected: true });
    });
  });
});
