/**
 * Git Context Tools
 * MCP tools for git repository detection and project context management
 *
 * Project-First Hierarchy: Projects are the primary container.
 * Use these tools to auto-detect which Zephly project you're working on.
 */

export const GIT_CONTEXT_TOOLS = [
  {
    name: 'detect_git_repository',
    description: 'Detect if current directory is a git repository and match it ' +
      'against accessible ezmodo projects by git URL. Returns matching ' +
      'projects with confidence scores, and for each match the git ' +
      'repositories linked to that project — including the `repoId` that ' +
      'manage_pull_request requires. Use this to auto-suggest which ezmodo ' +
      'project corresponds to a git repo, and to get from a checkout to a ' +
      'repoId in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        workingDirectory: {
          type: 'string',
          description: 'Directory to check for git repository (defaults to current directory)',
        },
      },
    },
  },
  {
    name: 'get_current_project_context',
    description: 'Detect and read existing .ezmodo/config.json (or legacy ' +
      '.zephly/config.json) from current directory or parent directories. ' +
      'Returns project context if found, ' +
      'or null if not configured. Use this BEFORE other MCP tools to ' +
      'auto-detect which project you\'re working on. Project-First: ' +
      'Returns projectId, components, and tags that can be used ' +
      'directly with task/epic creation tools. Caches tags and ' +
      'components locally with 1-day TTL for fast access. ' +
      'Also returns `projectType` and `terminology` — the words this project ' +
      'uses for epics, tasks and components and for their statuses (E-107). ' +
      'Write anything a person reads in those words: a marketing project calls ' +
      'an epic a "Campaign" and a component a "Channel". Keep the API field ' +
      'names (epicId, taskId) as they are. A null `terminology` means plain ' +
      'English, not an error.',
    inputSchema: {
      type: 'object',
      properties: {
        workingDirectory: {
          type: 'string',
          description: 'Starting directory to search from (defaults to current directory)',
        },
      },
    },
  },
  {
    name: 'initialize_project_context',
    description: 'Create .ezmodo/config.json for project context. Helps AI ' +
      'agents understand which ezmodo project they\'re working on. ' +
      'Supports single projects and monorepos. Usage: (1) Single ' +
      'project: provide projectId + organizationId. (2) Monorepo: ' +
      'provide organizationId + monorepoProjects array (no projectId ' +
      'needed). (3) Interactive: omit projectId to get available ' +
      'projects list.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project ID for single-project setup. Not needed ' +
            'for monorepo setup (use monorepoProjects instead).',
        },
        organizationId: {
          type: 'string',
          description: 'Organization ID (required for both single project and monorepo setup)',
        },
        workingDirectory: {
          type: 'string',
          description: 'Directory to create .ezmodo/config.json in (defaults to current directory). If a legacy .zephly/ directory already exists in the repo, the existing location is reused for writes.',
        },
        addToGitignore: {
          type: 'boolean',
          description: 'Whether to add the config directory (.ezmodo/ or legacy .zephly/) to .gitignore (default: true)',
          default: true,
        },
        addClaudeMd: {
          type: 'boolean',
          description: 'Whether to generate/update CLAUDE.md with work tracking instructions (default: true)',
          default: true,
        },
        monorepoProjects: {
          type: 'array',
          description: 'For monorepos: Array of {projectId, name, path} ' +
            'objects mapping subdirectories to projects. When provided ' +
            'with organizationId (without projectId), writes monorepo ' +
            'config directly.',
          items: {
            type: 'object',
            properties: {
              projectId: { type: 'string' },
              name: { type: 'string' },
              path: { type: 'string' },
            },
            required: ['projectId', 'name', 'path'],
          },
        },
      },
    },
  },
];
