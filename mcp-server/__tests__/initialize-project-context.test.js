/**
 * Tests for initialize_project_context, getCurrentProjectContext, and isCacheFresh
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock fs/promises. `access` resolves for paths that end in
// `.ezmodo/config.json` (the current write location) and rejects for the
// legacy `.zephly/config.json` and everything else, so the dual-read
// helper in lib/repo-config-dir.js resolves to the .ezmodo path.
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const defaultAccess = async (p) => {
  if (typeof p === 'string' && p.endsWith('/.ezmodo/config.json')) return undefined;
  throw new Error('ENOENT');
};
const mockAccess = jest.fn(defaultAccess);

jest.unstable_mockModule('fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    access: mockAccess,
  },
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  access: mockAccess,
  appendFile: jest.fn(),
  readdir: jest.fn().mockResolvedValue([]),
  unlink: jest.fn(),
}));

// Mock child_process (not used in these tests but imported by the module).
// execFileSync belongs here even though nothing calls it: lib/cli-credential.js
// reads the macOS Keychain through it, and it is now in this module's import
// graph via the credential chain (#2631). A partial mock of a core module makes
// the missing export a load-time SyntaxError, not a runtime undefined.
jest.unstable_mockModule('child_process', () => ({
  execSync: jest.fn(),
  execFileSync: jest.fn(),
}));

// Mock dependencies
const mockListOrganizations = jest.fn();
const mockGetProjectContext = jest.fn();
const mockListProjects = jest.fn();
const mockListTags = jest.fn();

jest.unstable_mockModule('../handlers/organizations.js', () => ({
  getOrganization: mockListOrganizations,
}));

jest.unstable_mockModule('../handlers/projects.js', () => ({
  getProject: jest.fn((args) => {
    if (args?.projectId) return mockGetProjectContext(args);
    return mockListProjects(args);
  }),
}));

jest.unstable_mockModule('../handlers/tags.js', () => ({
  listTags: mockListTags,
}));

jest.unstable_mockModule('../lib/git-utils.js', () => ({
  calculateGitMatchConfidence: jest.fn(),
}));

// isCacheFresh is now in local-cache.js but re-exported from git-context.js
// We need to provide the real implementation since the test validates its behavior
jest.unstable_mockModule('../lib/local-cache.js', () => {
  function isCacheFresh(lastUpdatedAt, ttlDays = 1) {
    if (!lastUpdatedAt) return false;
    try {
      const updated = new Date(lastUpdatedAt);
      if (isNaN(updated.getTime())) return false;
      const ageMs = Date.now() - updated.getTime();
      return ageMs < ttlDays * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }
  return { isCacheFresh };
});

jest.unstable_mockModule('../config/index.js', () => ({
  CONFIG: { environment: 'production' },
}));

// Import after mocks
const { initializeProjectContext, getCurrentProjectContext, generateClaudeMdSection, isCacheFresh } =
  await import('../handlers/git-context.js');

describe('isCacheFresh', () => {
  it('should return true for a timestamp within TTL (default 1 day)', () => {
    const recent = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(); // 12 hours ago
    expect(isCacheFresh(recent)).toBe(true);
  });

  it('should return false for a timestamp older than TTL (default 1 day)', () => {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    expect(isCacheFresh(old)).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isCacheFresh(null)).toBe(false);
    expect(isCacheFresh(undefined)).toBe(false);
  });

  it('should return false for malformed timestamps', () => {
    expect(isCacheFresh('not-a-date')).toBe(false);
    expect(isCacheFresh('')).toBe(false);
  });

  it('should respect custom TTL', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(isCacheFresh(twoDaysAgo, 1)).toBe(false);
    expect(isCacheFresh(twoDaysAgo, 3)).toBe(true);
  });
});

describe('CLAUDE.md generation in initialize_project_context', () => {
  const WORKING_DIR = '/tmp/test-project';
  const CLAUDE_MD_PATH = '/tmp/test-project/CLAUDE.md';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no existing config, .gitignore, or CLAUDE.md
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    // Default org/project mocks
    mockListOrganizations.mockResolvedValue({
      organizations: [{ id: 'org-1', slug: 'test-org', name: 'Test Organization' }],
    });
    mockGetProjectContext.mockResolvedValue({
      project: { name: 'My Project', slug: 'my-project' },
      settings: { aiConfig: { enabled: true, autoGenerateTestCases: true } },
    });
    mockListTags.mockResolvedValue({
      tags: [
        { id: 'tag-1', name: 'bug', color: '#FF0000', category: 'type', description: '' },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateClaudeMdSection', () => {
    it('should generate single-project section', () => {
      const section = generateClaudeMdSection({
        projectName: 'My Project',
        projectId: 'proj-123',
        orgSlug: 'test-org',
        organizationId: 'org-1',
        environment: 'production',
      });

      expect(section).toContain('## Work Tracking with ezmodo MCP');
      expect(section).toContain('Organization: test-org (ID: org-1)');
      expect(section).toContain('Project: My Project (proj-123)');
      expect(section).toContain('Environment: production');
      expect(section).toContain('### 1. Session Initialization');
      expect(section).toContain('### 5. Completion');
    });

    it('should generate monorepo section with multiple projects', () => {
      const section = generateClaudeMdSection({
        orgSlug: 'test-org',
        organizationId: 'org-1',
        environment: 'production',
        projects: [
          { projectId: 'proj-1', name: 'Frontend', path: 'web' },
          { projectId: 'proj-2', name: 'API', path: 'api' },
        ],
      });

      expect(section).toContain('## Work Tracking with ezmodo MCP');
      expect(section).toContain('Organization: test-org (ID: org-1)');
      expect(section).toContain('Projects:');
      expect(section).toContain('Frontend (proj-1): `web/`');
      expect(section).toContain('API (proj-2): `api/`');
      expect(section).not.toContain('- Project:');
    });
  });

  // The tool used to reuse an existing `.zephly/` for writes, which meant an
  // agent running it on an un-migrated repo kept the old layout alive — it was
  // extending the very directory the rebrand retires.
  describe('legacy .zephly/ repo', () => {
    const LEGACY_CONFIG = '/tmp/test-project/.zephly/config.json';
    const CURRENT_CONFIG = '/tmp/test-project/.ezmodo/config.json';

    beforeEach(() => {
      // Only the legacy config exists on disk.
      mockAccess.mockImplementation(async (filePath) => {
        if (filePath === LEGACY_CONFIG) return undefined;
        throw new Error('ENOENT');
      });
      mockReadFile.mockImplementation(async (filePath) => {
        if (filePath === LEGACY_CONFIG) {
          return JSON.stringify({ projectId: 'proj-123', orgSlug: 'test-org' });
        }
        throw new Error('ENOENT');
      });
    });

    it('writes .ezmodo/ and never the legacy directory', async () => {
      await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        addClaudeMd: false,
      });

      expect(mockWriteFile.mock.calls.some((call) => call[0] === CURRENT_CONFIG)).toBe(true);
      expect(mockWriteFile.mock.calls.some((call) => call[0] === LEGACY_CONFIG)).toBe(false);
      expect(mockMkdir.mock.calls.some((call) => String(call[0]).includes('.zephly'))).toBe(false);
    });

    it('reports the leftover legacy directory instead of leaving it a mystery', async () => {
      const result = await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        addClaudeMd: false,
      });

      expect(result.configPath).toBe(CURRENT_CONFIG);
      expect(result.legacyConfigPath).toBe(LEGACY_CONFIG);
      expect(result.legacyConfigWarning).toContain('ezmodo migrate-config');
    });

    // Losing settings on migration would make the move a downgrade.
    it('seeds existingConfig from the legacy file', async () => {
      const result = await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        addClaudeMd: false,
      });

      expect(result.existingConfig).toEqual({ projectId: 'proj-123', orgSlug: 'test-org' });
    });

    // mockImplementation survives clearAllMocks, so leaving it set would make
    // every later describe see a repo with no .ezmodo/ config.
    afterEach(() => {
      mockAccess.mockImplementation(defaultAccess);
    });
  });

  describe('single-project initialization', () => {
    it('should create CLAUDE.md when it does not exist', async () => {
      const result = await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
      });

      expect(result.success).toBe(true);
      expect(result.claudeMdUpdated).toBe(true);

      // Find the CLAUDE.md writeFile call
      const claudeMdWrite = mockWriteFile.mock.calls.find(
        (call) => call[0] === CLAUDE_MD_PATH
      );
      expect(claudeMdWrite).toBeDefined();
      const content = claudeMdWrite[1];
      expect(content).toMatch(/^# My Project\n\n## Work Tracking with ezmodo MCP/);
      expect(content).toContain('Project: My Project (proj-123)');
      expect(content).toContain('Organization: test-org (ID: org-1)');
    });

    it('should include orgName, lastUpdatedAt and settings, and no components, in config.json', async () => {
      await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        addClaudeMd: false,
      });

      // Find the config.json writeFile call
      const configWrite = mockWriteFile.mock.calls.find(
        (call) => call[0] === '/tmp/test-project/.ezmodo/config.json'
      );
      expect(configWrite).toBeDefined();
      const config = JSON.parse(configWrite[1]);
      expect(config.orgName).toBe('Test Organization');
      expect(config.lastUpdatedAt).toBeDefined();
      expect(new Date(config.lastUpdatedAt).getTime()).not.toBeNaN();
      expect(config.settings).toBeDefined();
      expect(config.settings.aiConfig).toEqual({ enabled: true, autoGenerateTestCases: true });
      expect(config.components).toBeUndefined();
    });

    it('should append to existing CLAUDE.md without work tracking section', async () => {
      // Mock: config.json doesn't exist, .gitignore doesn't exist, CLAUDE.md exists
      mockReadFile.mockImplementation(async (filePath) => {
        if (filePath === CLAUDE_MD_PATH) {
          return '# My Project\n\nSome existing content.\n';
        }
        throw new Error('ENOENT');
      });

      const result = await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
      });

      expect(result.claudeMdUpdated).toBe(true);

      const claudeMdWrite = mockWriteFile.mock.calls.find(
        (call) => call[0] === CLAUDE_MD_PATH
      );
      expect(claudeMdWrite).toBeDefined();
      const content = claudeMdWrite[1];
      // Should start with existing content
      expect(content).toMatch(/^# My Project\n\nSome existing content.\n/);
      // Should have the appended section
      expect(content).toContain('## Work Tracking with ezmodo MCP');
    });

    // The heading was renamed with the product. A repo initialised before the
    // rename must still be recognised, or it gets a second section appended
    // that differs only in the product name.
    it.each([
      ['current', '## Work Tracking with ezmodo MCP'],
      ['pre-rebrand', '## Work Tracking with Zephly MCP'],
    ])('should skip CLAUDE.md when a %s section already exists (idempotent)', async (_label, heading) => {
      mockReadFile.mockImplementation(async (filePath) => {
        if (filePath === CLAUDE_MD_PATH) {
          return `# My Project\n\n${heading}\n\nExisting section.\n`;
        }
        throw new Error('ENOENT');
      });

      const result = await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
      });

      expect(result.claudeMdUpdated).toBe(false);

      // CLAUDE.md should not have been written
      const claudeMdWrite = mockWriteFile.mock.calls.find(
        (call) => call[0] === CLAUDE_MD_PATH
      );
      expect(claudeMdWrite).toBeUndefined();
    });

    it('should skip CLAUDE.md when addClaudeMd is false', async () => {
      const result = await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        addClaudeMd: false,
      });

      expect(result.claudeMdUpdated).toBe(false);

      const claudeMdWrite = mockWriteFile.mock.calls.find(
        (call) => call[0] === CLAUDE_MD_PATH
      );
      expect(claudeMdWrite).toBeUndefined();
    });

    it('should not fail initialization when CLAUDE.md write fails', async () => {
      // Make writeFile fail only for CLAUDE.md
      mockWriteFile.mockImplementation(async (filePath) => {
        if (filePath === CLAUDE_MD_PATH) {
          throw new Error('Permission denied');
        }
        return undefined;
      });

      const result = await initializeProjectContext({
        projectId: 'proj-123',
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
      });

      // Should still succeed — CLAUDE.md is non-fatal
      expect(result.success).toBe(true);
      expect(result.claudeMdUpdated).toBe(false);
    });
  });

  describe('monorepo initialization', () => {
    it('should create CLAUDE.md with multi-project context', async () => {
      const result = await initializeProjectContext({
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        monorepoProjects: [
          { projectId: 'proj-1', name: 'Frontend', path: 'web' },
          { projectId: 'proj-2', name: 'API', path: 'api' },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.claudeMdUpdated).toBe(true);

      const claudeMdWrite = mockWriteFile.mock.calls.find(
        (call) => call[0] === CLAUDE_MD_PATH
      );
      expect(claudeMdWrite).toBeDefined();
      const content = claudeMdWrite[1];
      expect(content).toContain('## Work Tracking with ezmodo MCP');
      expect(content).toContain('Projects:');
      expect(content).toContain('Frontend (proj-1): `web/`');
      expect(content).toContain('API (proj-2): `api/`');
    });

    it('should include orgName and lastUpdatedAt in monorepo config.json', async () => {
      await initializeProjectContext({
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        addClaudeMd: false,
        monorepoProjects: [
          { projectId: 'proj-1', name: 'Frontend', path: 'web' },
        ],
      });

      const configWrite = mockWriteFile.mock.calls.find(
        (call) => call[0] === '/tmp/test-project/.ezmodo/config.json'
      );
      expect(configWrite).toBeDefined();
      const config = JSON.parse(configWrite[1]);
      expect(config.orgName).toBe('Test Organization');
      expect(config.lastUpdatedAt).toBeDefined();
      expect(new Date(config.lastUpdatedAt).getTime()).not.toBeNaN();
    });

    it('should skip CLAUDE.md in monorepo when addClaudeMd is false', async () => {
      const result = await initializeProjectContext({
        organizationId: 'org-1',
        workingDirectory: WORKING_DIR,
        addToGitignore: false,
        addClaudeMd: false,
        monorepoProjects: [
          { projectId: 'proj-1', name: 'Frontend', path: 'web' },
        ],
      });

      expect(result.claudeMdUpdated).toBe(false);
    });
  });
});

describe('getCurrentProjectContext caching', () => {
  const WORKING_DIR = '/tmp/test-project';
  const CONFIG_PATH = '/tmp/test-project/.ezmodo/config.json';

  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockListTags.mockResolvedValue({ tags: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should use cached data when lastUpdatedAt is fresh (no API calls)', async () => {
    const freshConfig = {
      projectId: 'proj-123',
      organizationId: 'org-1',
      orgSlug: 'test-org',
      orgName: 'Test Organization',
      projectName: 'My Project',
      environment: 'production',
      lastUpdatedAt: new Date().toISOString(), // fresh
      components: [
        { id: 'comp-1', name: 'api', description: 'Go API service' },
      ],
      settings: {
        aiConfig: { enabled: true, autoGenerateTestCases: true },
      },
    };

    mockReadFile.mockResolvedValue(JSON.stringify(freshConfig));

    const result = await getCurrentProjectContext({ workingDirectory: WORKING_DIR });

    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.projectId).toBe('proj-123');
    expect(result.projectName).toBe('My Project');
    expect(result.autoGenerateTestCases).toBe(true);
    // Components were retired (E-258): a cached list is not surfaced.
    expect(result.components).toBeUndefined();
    expect(result.validation.cached).toBe(true);

    // No API calls should have been made
    expect(mockGetProjectContext).not.toHaveBeenCalled();
    expect(mockListOrganizations).not.toHaveBeenCalled();
  });

  it('should refresh when lastUpdatedAt is stale (older than 1 day)', async () => {
    const staleConfig = {
      projectId: 'proj-123',
      organizationId: 'org-1',
      orgSlug: 'test-org',
      projectName: 'My Project',
      environment: 'production',
      lastUpdatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      // Written by a server that predates E-258; the refresh must drop it.
      components: [{ id: 'comp-1', name: 'api', description: 'Go API service' }],
    };

    mockReadFile.mockResolvedValue(JSON.stringify(staleConfig));
    mockGetProjectContext.mockResolvedValue({
      settings: { aiConfig: { enabled: true, autoGenerateTestCases: false } },
    });
    mockListOrganizations.mockResolvedValue({
      organizations: [{ id: 'org-1', slug: 'test-org', name: 'Test Organization' }],
    });

    const result = await getCurrentProjectContext({ workingDirectory: WORKING_DIR });

    expect(result.success).toBe(true);
    expect(result.validation.cached).toBe(false);
    expect(result.autoGenerateTestCases).toBe(false);
    expect(result.components).toBeUndefined();

    // API calls should have been made
    expect(mockGetProjectContext).toHaveBeenCalledWith({ projectId: 'proj-123' });
    expect(mockListOrganizations).toHaveBeenCalled();

    // Config should have been updated on disk, without the retired components list
    const configWrite = mockWriteFile.mock.calls.find(
      (call) => call[0] === CONFIG_PATH
    );
    expect(configWrite).toBeDefined();
    const updatedConfig = JSON.parse(configWrite[1]);
    expect(updatedConfig.orgName).toBe('Test Organization');
    expect(updatedConfig.settings.aiConfig.autoGenerateTestCases).toBe(false);
    expect(updatedConfig.components).toBeUndefined();
    expect(new Date(updatedConfig.lastUpdatedAt).getTime()).toBeGreaterThan(
      new Date(staleConfig.lastUpdatedAt).getTime()
    );
  });

  it('should refresh when lastUpdatedAt is missing (backward compat)', async () => {
    const oldConfig = {
      projectId: 'proj-123',
      organizationId: 'org-1',
      orgSlug: 'test-org',
      projectName: 'My Project',
      environment: 'production',
      // no lastUpdatedAt, no settings, no orgName
    };

    mockReadFile.mockResolvedValue(JSON.stringify(oldConfig));
    mockGetProjectContext.mockResolvedValue({
      settings: { aiConfig: { enabled: true, autoGenerateTestCases: true } },
    });
    mockListOrganizations.mockResolvedValue({
      organizations: [{ id: 'org-1', slug: 'test-org', name: 'Test Organization' }],
    });

    const result = await getCurrentProjectContext({ workingDirectory: WORKING_DIR });

    expect(result.success).toBe(true);
    expect(result.validation.cached).toBe(false);

    // API calls should have been made
    expect(mockGetProjectContext).toHaveBeenCalled();
    expect(mockListOrganizations).toHaveBeenCalled();

    // Config should have been updated on disk with new fields
    const configWrite = mockWriteFile.mock.calls.find(
      (call) => call[0] === CONFIG_PATH
    );
    expect(configWrite).toBeDefined();
    const updatedConfig = JSON.parse(configWrite[1]);
    expect(updatedConfig.orgName).toBe('Test Organization');
    expect(updatedConfig.lastUpdatedAt).toBeDefined();
    expect(updatedConfig.settings.aiConfig.autoGenerateTestCases).toBe(true);
  });

  it('should not update config on disk when project does not exist', async () => {
    const staleConfig = {
      projectId: 'proj-gone',
      organizationId: 'org-1',
      orgSlug: 'test-org',
      projectName: 'Gone Project',
      environment: 'production',
      lastUpdatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };

    mockReadFile.mockResolvedValue(JSON.stringify(staleConfig));
    mockGetProjectContext.mockRejectedValue(new Error('404 not found'));
    mockListOrganizations.mockResolvedValue({
      organizations: [{ id: 'org-1', slug: 'test-org', name: 'Test Organization' }],
    });

    const result = await getCurrentProjectContext({ workingDirectory: WORKING_DIR });

    expect(result.validation.projectExists).toBe(false);

    // Config should NOT have been updated on disk (project doesn't exist)
    const configWrite = mockWriteFile.mock.calls.find(
      (call) => call[0] === CONFIG_PATH
    );
    expect(configWrite).toBeUndefined();
  });

  it('should not crash when config write fails during refresh', async () => {
    const staleConfig = {
      projectId: 'proj-123',
      organizationId: 'org-1',
      orgSlug: 'test-org',
      projectName: 'My Project',
      environment: 'production',
      // no lastUpdatedAt — triggers refresh
    };

    mockReadFile.mockResolvedValue(JSON.stringify(staleConfig));
    mockGetProjectContext.mockResolvedValue({
      settings: { aiConfig: { enabled: true, autoGenerateTestCases: true } },
    });
    mockListOrganizations.mockResolvedValue({
      organizations: [{ id: 'org-1', slug: 'test-org', name: 'Test Organization' }],
    });
    mockWriteFile.mockRejectedValue(new Error('Permission denied'));

    const result = await getCurrentProjectContext({ workingDirectory: WORKING_DIR });

    // Should still return successfully despite config write failure
    expect(result.success).toBe(true);
    expect(result.found).toBe(true);
    expect(result.projectId).toBe('proj-123');
  });
});
