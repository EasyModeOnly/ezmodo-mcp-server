/**
 * Git Context Handlers
 * Handler functions for git repository detection and project context management
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { calculateGitMatchConfidence } from '../lib/git-utils.js';
import { isCacheFresh } from '../lib/local-cache.js';
import {
  CURRENT_REPO_CONFIG_DIR,
  LEGACY_REPO_CONFIG_DIR,
  findRepoConfigPath,
  getWriteRepoConfigDirName,
} from '../lib/repo-config-dir.js';
// Re-export for backward compatibility (tests import from here)
export { isCacheFresh };
import { getProject } from './projects.js';
import { listRepositories } from './github.js';
import { getOrganization } from './organizations.js';
import { listComponents } from './components.js';
import { getLogger } from '../lib/logger.js';
import { listTags } from './tags.js';
import { CONFIG } from '../config/index.js';

/**
 * Idempotently add the project config directory to the repo's `.gitignore`.
 * Returns true if `.gitignore` was modified.
 */
async function ensureConfigDirGitignored(workingDirectory, configDirName, enabled) {
  if (!enabled) return false;
  try {
    const gitignorePath = path.join(workingDirectory, '.gitignore');
    let gitignoreContent = '';
    try {
      gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // .gitignore doesn't exist yet — will be created below.
    }

    if (gitignoreContent.includes(`${configDirName}/`)) return false;

    const newContent =
      gitignoreContent.trim() +
      `\n\n# ezmodo project context\n${configDirName}/\n`;
    await fs.writeFile(gitignorePath, newContent, 'utf-8');
    return true;
  } catch (err) {
    console.error('Warning: Failed to update .gitignore:', err);
    return false;
  }
}

/**
 * Build the response fields that report a leftover legacy config directory.
 *
 * We write `.ezmodo/` unconditionally, so a repo that had `.zephly/` now has
 * both. Readers prefer the new one, so nothing breaks — but silently leaving a
 * stale directory behind is how the transition never ends. Telling the caller
 * makes the cleanup a visible next step rather than a mystery.
 */
function legacyConfigNotice(legacyConfigPath) {
  if (!legacyConfigPath) return {};
  return {
    legacyConfigPath,
    legacyConfigWarning:
      `Wrote ${CURRENT_REPO_CONFIG_DIR}/config.json. This repo also still has a legacy `
      + `${LEGACY_REPO_CONFIG_DIR}/ directory at ${legacyConfigPath}, which is now unused. `
      + 'Run `ezmodo migrate-config` (or delete it) to finish moving off it.',
  };
}

/**
 * Fetch lightweight component summaries (id, name, description) for a project.
 * Filtered to kind='area' (E-168): this list is the coarse codebase-area set
 * agents use to pick a task's componentId, and it must match the web task
 * picker (which also filters to area). Without the filter, UI-inventory rows
 * (screen/page/component) would leak into task routing. Returns an empty array
 * on failure (non-fatal).
 */
async function fetchComponentSummaries(projectId) {
  try {
    const result = await listComponents({ projectId, kind: 'area' });
    if (!result?.components) return [];
    return result.components.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch lightweight tag summaries (id, name, color, category) for an organization.
 * Returns an empty array on failure (non-fatal).
 */
async function fetchTagSummaries(organizationId) {
  try {
    const result = await listTags({ organizationId });
    if (!result?.tags) return [];
    return result.tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color || '',
      category: t.category || 'custom',
      description: t.description || '',
    }));
  } catch {
    return [];
  }
}

/**
 * Generate the CLAUDE.md work tracking section with project-specific context
 */
export function generateClaudeMdSection({
  projectName, projectId, orgSlug, organizationId, environment, projects,
}) {
  let projectContext;
  if (projects && projects.length > 0) {
    const projectLines = projects.map((p) => `  - ${p.name} (${p.projectId}): \`${p.path}/\``).join('\n');
    projectContext = `- Organization: ${orgSlug} (ID: ${organizationId})\n`
      + `- Projects:\n${projectLines}\n`
      + `- Environment: ${environment}`;
  } else {
    projectContext = `- Organization: ${orgSlug} (ID: ${organizationId})\n`
      + `- Project: ${projectName} (${projectId})\n`
      + `- Environment: ${environment}`;
  }

  return `## Work Tracking with ezmodo MCP

**IMPORTANT:** This repository uses EzModo to track development work. **Every piece of work MUST have an EzModo task.**

**Project Context:**
${projectContext}

### 1. Session Initialization

1. Check \`.ezmodo/config.json\` (or legacy \`.zephly/config.json\`) exists
2. Call \`get_current_project_context()\` to load project context — cache the \`projectId\` for the session
3. If the user specifies an existing task or epic to work on,
search for it (\`search_tasks\` / \`search_epics\`) and resume using the Context Recovery steps in section 3a
4. Otherwise, **always create an ezmodo task** before starting any work (see creation rules below)

### 2. Task & Epic Creation Rules

**Always create a task** for every piece of work —
no exceptions unless the user explicitly says to work on an existing task.

**Before creating any task or epic**, gather codebase context:
- Call \`get_context\` with a keyword query matching the work topic
  (e.g., \`query: "rate limiting manifest"\`)
- Review returned files to understand which files exist, what patterns
  are used, and what dependencies are involved
- Use this to write **specific** descriptions and steps that reference
  actual file paths, function names, and existing patterns

**What makes a good task:**
- Description explains **why** (the problem/goal), **where** (specific
  files/endpoints), and **how** (approach, referencing existing patterns)
- Steps reference specific files, not vague instructions
- Steps follow existing codebase patterns discovered from \`get_context\`

**Single-scope work** (bug fix, small feature, config change, docs update):
- Create a **task** with \`manage_task action:"create"\`:
  - \`projectId\` from cached context
  - \`componentId\` — pick the single most relevant component from the
    project context. Each task belongs to exactly one component.
    Get the list via \`get_current_project_context()\`.
  - Descriptive \`title\` and \`description\` (informed by \`get_context\`)
  - \`steps\` array with actionable steps referencing specific files
  - \`priority\` based on context (low / medium / high / urgent)
  - \`status: "in_progress"\` (since work starts immediately)

**Multi-scope work** (feature spanning multiple files/areas, large refactor):
- Call \`get_context\` for each area to understand the full scope
- Create an **epic** first with \`manage_epic action:"create"\`:
  - \`projectId\`, \`title\`, \`description\` (include which layers/services
    are affected based on context queries)
  - \`status: "active"\`
- Then create **child tasks** for each logical unit of work, each
  linked to the epic via \`epicId\`
  - Each child task should reference specific files from context queries
  - Order tasks by dependency (use \`get_context\` with
    \`entityType: "file"\` to understand dependency chains)

### 3. During Work

**Step tracking — update after each step completes:**
- After completing each implementation step, immediately call
\`manage_task action:"update"\` with \`toggleStep: {stepId: "step_0", completed: true}\`
- Do not batch step updates — toggle each step as soon as
the work for that step is done
- If you discover a step needs to be added, call \`manage_task action:"update"\`
with \`addStep\` before doing the work

**Knowledge capture — add knowledge frequently, not just at the end:**
- Call \`manage_task action:"update"\` with \`addKnowledge\` after any of these events:
  - **Root cause found:**
\`{type: "fact", content: "Bug caused by X in Y", tags: ["root-cause"]}\`
  - **Architecture/design decision:**
\`{type: "decision", content: "Chose A over B because...", tags: ["design"]}\`
  - **Key file or pattern discovered:**
\`{type: "reference", content: "Handlers in api/handlers/", tags: ["codebase"]}\`
  - **Before each commit:**
\`{type: "context", content: "Changed X, Y, Z to implement...", tags: ["progress"]}\`
  - **Unexpected blocker or workaround:**
\`{type: "fact", content: "Worked around X by doing Y", tags: ["blocker"]}\`
- Keep knowledge items concise but specific — include file paths,
function names, and error messages

**Context preservation — proactively save progress:**
- If the conversation is getting long (many tool calls, large code
reads), proactively call \`manage_task action:"update"\` with \`addKnowledge\` containing:
\`{type: "context", content: "Progress summary: completed steps 1-3,
working on step 4. Key files modified: ...",
tags: ["progress-checkpoint"]}\` so a new session can resume
- If new sub-work is discovered mid-task, create additional tasks
(linked to the epic if applicable)

### 3a. Context Recovery (Resuming a Task)

When resuming a task that was started in a previous session:
1. Call \`get_task\` with the \`taskId\` to load full task state
2. Review which steps are already completed (skip those)
3. Read all \`knowledge\` items to understand what was discovered and decided
4. Look for \`progress-checkpoint\` tagged knowledge for the latest status summary
5. Continue from where the previous session left off

### 4. Commit Linking

After every git commit, call \`manage_task action:"link_commit"\` with:
- \`taskId\` of the active task
- \`sha\` — the commit hash
- \`message\` — the commit message
- \`author\` — the commit author
- \`branch\` — the current branch name

### 5. Completion

After finishing work on a task:

1. **Check \`autoGenerateTestCases\`** from the project context
(returned by \`get_current_project_context\` during session init).
If \`false\`, skip to step 3.

2. **Create test cases** for the completed work:
   - You (the agent) write the test cases yourself — you have full context of the changes you just made
   - Call \`manage_test_case action:"create"\` for each test case with:
     - \`taskId\` — the task being worked on
     - \`title\` — concise test case name
     - \`description\` — what this test verifies
     - \`category\` — e.g., \`"functional"\`, \`"regression"\`, \`"edge-case"\`
     - \`priority\` — \`"critical"\`, \`"high"\`, \`"medium"\`, or \`"low"\`
     - \`steps\` — array of \`{instruction, expectedResult}\` objects
     - \`preconditions\` — any setup required (optional)
   - Aim for 3-6 test cases covering: happy path, edge cases, and error handling

3. **Submit for review** — Call \`manage_task action:"update"\` with \`status: "in_review"\`
and include \`completionNotes\` summarizing what was accomplished

4. **Do NOT call \`manage_task action:"complete"\`** — the human reviewer will complete the task after verifying test cases pass

5. If working under an epic, update epic status when all child tasks are complete
`;
}

/**
 * Update or create CLAUDE.md with the work tracking section.
 * Returns true if the file was updated, false if skipped (already has section).
 * Non-fatal — logs warnings on error.
 */
async function updateClaudeMd(workingDirectory, sectionContent, projectName) {
  const claudeMdPath = path.join(workingDirectory, 'CLAUDE.md');
  try {
    let content = '';
    try {
      content = await fs.readFile(claudeMdPath, 'utf-8');
    } catch {
      // File doesn't exist — will create new
    }

    // Idempotency has to recognise the pre-rebrand heading too: a repo
    // initialised before the rename would otherwise get a SECOND section
    // appended, differing only in the product name.
    if (
      content.includes('## Work Tracking with ezmodo MCP')
      || content.includes('## Work Tracking with Zephly MCP')
    ) {
      return false; // Already has section, skip (idempotent)
    }

    if (content) {
      // Append to existing file
      const newLine = content.endsWith('\n') ? '' : '\n';
      await fs.writeFile(claudeMdPath, content + newLine + '\n' + sectionContent, 'utf-8');
    } else {
      // Create new file
      await fs.writeFile(claudeMdPath, `# ${projectName || 'Project'}\n\n${sectionContent}`, 'utf-8');
    }
    return true;
  } catch (err) {
    getLogger().warn('Failed to update CLAUDE.md', { error: err.message || String(err) });
    return false;
  }
}

/**
 * Read a project's git remote from the fields the API actually returns.
 *
 * The Go model serializes `gitUrl` and `gitContext.repositoryUrl`
 * (api/internal/core/projects/models.go). This used to read `gitRepositoryUrl`,
 * a Firestore-era name that exists nowhere in the API — so the match loop never
 * had a URL to compare and every project fell through it. That was invisible
 * while the response-envelope guard above returned first: the function had two
 * independent reasons to find nothing, and fixing one only uncovered the other.
 *
 * `gitRepositoryUrl` is kept last as a courtesy to any caller still passing the
 * old shape, not because anything produces it.
 */
function projectRepositoryUrl(project) {
  return project?.gitUrl
    || project?.gitContext?.repositoryUrl
    || project?.gitRepositoryUrl
    || null;
}

/**
 * Fetch a project's linked git repositories, each carrying the `repoId` that
 * manage_pull_request needs.
 *
 * Attached to every match so the hop from "I am in this checkout" to "here is
 * the id I open a PR against" is one call. It was previously no calls at all:
 * detect_git_repository resolved a project and stopped, and the id lives
 * nowhere else an agent can reach. Non-fatal — a project with no GitHub
 * integration is the normal case, not an error.
 */
async function fetchLinkedRepositories(projectId) {
  try {
    const result = await listRepositories({ projectId });
    return Array.isArray(result?.repositories) ? result.repositories : [];
  } catch {
    return [];
  }
}

export async function detectGitRepository(args) {
  const { workingDirectory = process.cwd() } = args;

  try {
    // Check if directory is a git repo
    try {
      execSync('git rev-parse --is-inside-work-tree', {
        cwd: workingDirectory,
        stdio: 'pipe',
      });
    } catch {
      // Not a git repo
      return {
        success: true,
        isGitRepository: false,
        message: 'Not a git repository',
      };
    }

    // Get git remote URL
    let remoteUrl = null;
    try {
      remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: workingDirectory,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
    } catch {
      // No remote configured
      return {
        success: true,
        isGitRepository: true,
        hasRemote: false,
        message: 'Git repository has no remote configured',
      };
    }

    // Get current branch
    let currentBranch = null;
    try {
      currentBranch = execSync('git branch --show-current', {
        cwd: workingDirectory,
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim();
    } catch {
      // Could not get branch
    }

    // Get all accessible projects.
    //
    // callZephlyAPI unwraps the Go API's {success, data} envelope and hands back
    // `data` alone, so the response here is `{projects: [...]}` with no `success`
    // flag. This used to test `projectsResult.success`, which is therefore always
    // undefined -- every call took the failure branch and reported "Failed to
    // fetch accessible projects" while holding the projects it had just fetched.
    // Test the shape that actually arrives, and let a genuine API failure throw
    // so its own message reaches the caller instead of a generic one.
    let projects;
    try {
      const projectsResult = await getProject({});
      projects = projectsResult?.projects;
    } catch (err) {
      return {
        success: true,
        isGitRepository: true,
        hasRemote: true,
        remoteUrl,
        currentBranch,
        matches: [],
        message: `Failed to fetch accessible projects: ${err.message}`,
      };
    }

    if (!Array.isArray(projects)) {
      return {
        success: true,
        isGitRepository: true,
        hasRemote: true,
        remoteUrl,
        currentBranch,
        matches: [],
        message: 'Failed to fetch accessible projects',
      };
    }

    // Match against project git URLs
    const matches = [];
    for (const project of projects) {
      const projectGitUrl = projectRepositoryUrl(project);
      if (projectGitUrl) {
        const confidence = calculateGitMatchConfidence(remoteUrl, projectGitUrl);

        if (confidence > 0.4) {
          matches.push({
            project: {
              id: project.id,
              name: project.name,
              slug: project.slug,
              organizationId: project.organizationId,
              orgSlug: project.orgSlug,
              orgName: project.orgName,
              gitRepositoryUrl: projectGitUrl,
              gitBranch: project.gitContext?.defaultBranch || project.gitBranch,
            },
            confidence,
            reason: confidence === 1.0 ? 'Exact URL match' :
              confidence >= 0.9 ? 'Same repository, different protocol' :
                confidence >= 0.5 ? 'Same repository name' :
                  'Partial match',
          });
        }
      }
    }

    // Sort by confidence (highest first)
    matches.sort((a, b) => b.confidence - a.confidence);

    // Attach each matched project's linked repositories, so the caller leaves
    // with the repoId rather than a project id and a dead end.
    await Promise.all(matches.map(async (match) => {
      match.repositories = await fetchLinkedRepositories(match.project.id);
    }));

    return {
      success: true,
      isGitRepository: true,
      hasRemote: true,
      remoteUrl,
      currentBranch,
      matches,
      matchCount: matches.length,
    };
  } catch (error) {
    throw new Error(`Failed to detect git repository: ${error.message}`);
  }
}

export async function getCurrentProjectContext(args) {
  const { workingDirectory = process.cwd() } = args;

  try {
    // Walk up directory tree looking for a project config file
    // (`.ezmodo/config.json` preferred, `.zephly/config.json` legacy).
    const configPath = await findRepoConfigPath(workingDirectory);
    if (configPath) {
      const currentDir = path.dirname(path.dirname(configPath));

      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content);

        // For monorepos, determine which project based on relative path
        let activeProject = null;
        if (config.projects && config.projects.length > 0) {
          // Find which project path matches
          const relativePath = path.relative(currentDir, workingDirectory);
          for (const project of config.projects) {
            if (relativePath.startsWith(project.path)) {
              activeProject = project;
              break;
            }
          }

          // If no match, default to first project
          if (!activeProject) {
            activeProject = {
              id: config.projectId,
              name: config.projectName,
              path: '.',
            };
          }
        } else {
          activeProject = {
            id: config.projectId,
            name: config.projectName,
            path: '.',
          };
        }

        const isMonorepo = !!(config.projects && config.projects.length > 0);

        // Cached path: if config data is fresh, skip API calls
        if (isCacheFresh(config.lastUpdatedAt)) {
          const validation = {
            projectExists: true,
            userHasAccess: true,
            organizationExists: true,
            cached: true,
            warnings: [],
          };

          return {
            success: true,
            found: true,
            projectId: activeProject.id,
            projectName: activeProject.name,
            orgSlug: config.orgSlug,
            organizationId: config.organizationId,
            isMonorepo,
            workingDirectory: currentDir,
            configPath,
            allProjects: config.projects || null,
            components: config.components || [],
            tags: config.tags || [],
            autoGenerateTestCases: config.settings?.aiConfig?.autoGenerateTestCases || false,
            organizeResponseMode: config.settings?.aiConfig?.organizeResponseMode || 'raw_snapshot',
            // The words this project's type uses (E-107). Cached alongside
            // components and tags because it changes about as often, and an
            // agent needs it on every session, not on a second round trip.
            // Absent means plain English — a project type with no template.
            projectType: config.projectType || null,
            terminology: config.terminology || null,
            validation,
          };
        }

        // Stale/missing cache — refresh from server
        const validation = {
          projectExists: true,
          userHasAccess: true,
          organizationExists: true,
          cached: false,
          warnings: [],
        };

        let projectSettings = null;
        let projectType = null;
        let terminology = null;
        try {
          // Check if project exists and user has access
          const ctx = await getProject({ projectId: activeProject.id });
          projectSettings = ctx?.settings || null;
          // E-107: the project's type and the vocabulary it speaks, so an agent
          // writes "Campaign" on a marketing project. Both may be absent — an
          // unrecognised type has no template, which means plain English.
          projectType = ctx?.type || null;
          terminology = ctx?.terminology || null;
        } catch (error) {
          const errorMsg = error.message || String(error);
          if (errorMsg.includes('404') || errorMsg.includes('not found')) {
            validation.projectExists = false;
            validation.warnings.push('Project no longer exists');
          } else if (errorMsg.includes('403') || errorMsg.includes('access') || errorMsg.includes('permission')) {
            validation.userHasAccess = false;
            validation.warnings.push('You no longer have access to this project');
          } else {
            validation.warnings.push('Could not validate project access');
          }
        }

        // Check if organization exists
        let orgName = config.orgName || null;
        try {
          const orgs = await getOrganization({ mode: 'list' });
          const org = orgs.organizations?.find((o) => o.id === config.organizationId);
          if (!org) {
            validation.organizationExists = false;
            validation.warnings.push('Organization no longer accessible');
          } else {
            orgName = org.name;
          }
        } catch {
          validation.warnings.push('Could not validate organization access');
        }

        // Refresh components and tags lists
        const [components, tags] = await Promise.all([
          fetchComponentSummaries(activeProject.id),
          fetchTagSummaries(config.organizationId),
        ]);

        // Update config on disk with fresh data (non-fatal)
        if (validation.projectExists && validation.organizationExists) {
          try {
            config.orgName = orgName;
            config.lastUpdatedAt = new Date().toISOString();
            config.components = components;
            config.tags = tags;
            config.projectType = projectType;
            config.terminology = terminology;
            config.settings = {
              ...config.settings,
              aiConfig: projectSettings?.aiConfig || config.settings?.aiConfig || null,
            };
            await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
          } catch {
            // Non-fatal — config update failed, will refresh next time
          }
        }

        return {
          success: true,
          found: true,
          projectId: activeProject.id,
          projectName: activeProject.name,
          orgSlug: config.orgSlug,
          organizationId: config.organizationId,
          isMonorepo,
          workingDirectory: currentDir,
          configPath,
          allProjects: config.projects || null,
          components,
          tags,
          autoGenerateTestCases: projectSettings?.aiConfig?.autoGenerateTestCases || false,
          organizeResponseMode: projectSettings?.aiConfig?.organizeResponseMode || 'raw_snapshot',
          projectType,
          terminology,
          validation,
        };
      } catch {
        // Config file resolved but unreadable/malformed — treat as not found.
      }
    }

    // No config found
    return {
      success: true,
      found: false,
      message: `No ${CURRENT_REPO_CONFIG_DIR}/config.json (or legacy ${LEGACY_REPO_CONFIG_DIR}/config.json) found. Use initialize_project_context to create one.`,
    };
  } catch (error) {
    throw new Error(`Failed to get current project context: ${error.message}`);
  }
}

export async function initializeProjectContext(args) {
  const {
    projectId,
    organizationId,
    workingDirectory = process.cwd(),
    addToGitignore = true,
    addClaudeMd = true,
    monorepoProjects = null,
  } = args;

  try {
    // Step 1: Check if config already exists. Writes ALWAYS go to `.ezmodo/`.
    //
    // This used to reuse a legacy `.zephly/` when the repo had one, which meant
    // an agent running this tool on an un-migrated repo kept the old directory
    // alive instead of moving off it — the tool was extending the very layout
    // the rebrand is retiring. We read whatever exists (readers dual-check, new
    // wins) and write the new location, leaving the legacy directory in place
    // for `ezmodo migrate-config` to clean up.
    const existingConfigPath = await findRepoConfigPath(workingDirectory);
    const configDirName = getWriteRepoConfigDirName();
    const configDir = path.join(workingDirectory, configDirName);
    const configPath = path.join(configDir, 'config.json');

    const legacyConfigPath =
      existingConfigPath && existingConfigPath !== configPath ? existingConfigPath : null;

    let existingConfig = null;
    try {
      // Seed from the legacy config when that's the only one there, so a repo
      // being moved over keeps its settings instead of starting from scratch.
      const readFrom = existingConfigPath ?? configPath;
      const existingContent = await fs.readFile(readFrom, 'utf-8');
      existingConfig = JSON.parse(existingContent);
    } catch {
      // Config doesn't exist, which is fine
    }

    // Step 2: Handle monorepo initialization (no projectId needed, just organizationId + monorepoProjects)
    if (!projectId && monorepoProjects && monorepoProjects.length > 0 && organizationId) {
      // Monorepo mode: write config directly without requiring a single projectId
      const orgs = await getOrganization({ mode: 'list' });

      if (!orgs || !orgs.organizations) {
        throw new Error('Failed to fetch organizations. Please check your API key permissions.');
      }

      const org = orgs.organizations.find((o) => o.id === organizationId);
      if (!org) {
        throw new Error(`Organization ${organizationId} not found or not accessible`);
      }

      // Build monorepo config
      const config = {
        organizationId,
        orgSlug: org.slug,
        orgName: org.name,
        isMonorepo: true,
        projects: monorepoProjects.map((p) => ({
          projectId: p.projectId,
          name: p.name,
          path: p.path,
        })),
        environment: CONFIG.environment,
        lastUpdatedAt: new Date().toISOString(),
      };

      // Create config directory and write config
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      // Update .gitignore if requested
      let gitignoreUpdated = await ensureConfigDirGitignored(workingDirectory, configDirName, addToGitignore);

      // Update CLAUDE.md if requested
      let claudeMdUpdated = false;
      if (addClaudeMd) {
        const section = generateClaudeMdSection({
          orgSlug: org.slug,
          organizationId,
          environment: CONFIG.environment,
          projects: config.projects,
        });
        claudeMdUpdated = await updateClaudeMd(workingDirectory, section, null);
      }

      return {
        success: true,
        configPath,
        isMonorepo: true,
        projectCount: monorepoProjects.length,
        projects: config.projects,
        orgSlug: org.slug,
        organizationId,
        gitignoreUpdated,
        claudeMdUpdated,
        existingConfig,
        ...legacyConfigNotice(legacyConfigPath),
      };
    }

    // Step 3: If no projectId provided, try git detection then fetch available projects (interactive mode)
    if (!projectId) {
      // Try to detect git repository and match to projects
      const gitDetection = await detectGitRepository({ workingDirectory });

      // Get all available projects
      const projectsResult = await getProject({});
      const orgs = await getOrganization({ mode: 'list' });

      if (!orgs || !orgs.organizations) {
        throw new Error('Failed to fetch organizations. Please check your API key permissions.');
      }

      const response = {
        success: true,
        mode: 'interactive',
        existingConfig,
        organizations: orgs.organizations,
        projects: projectsResult.projects || [],
      };

      // If we found git matches, include them as suggestions
      if (gitDetection.isGitRepository && gitDetection.matches && gitDetection.matches.length > 0) {
        response.gitDetected = true;
        response.gitRemoteUrl = gitDetection.remoteUrl;
        response.gitMatches = gitDetection.matches;
        response.message = `Found ${gitDetection.matchCount} project(s) `
          + 'matching this git repository. Select one or choose from all projects.';
      } else if (gitDetection.isGitRepository) {
        response.gitDetected = true;
        response.gitRemoteUrl = gitDetection.remoteUrl;
        response.gitMatches = [];
        response.message = 'Git repository detected but no matching ezmodo projects found.'
          + ' Select from available projects.';
      } else {
        response.gitDetected = false;
        response.message = 'No projectId provided. Select a project from the list.';
      }

      response.nextStep = 'Call initialize_project_context with projectId'
        + ' and organizationId, or with organizationId and'
        + ' monorepoProjects for monorepo setup';
      return response;
    }

    // Step 3: Fetch project details
    const projectContext = await getProject({ projectId });

    // Step 4: Get organization details
    const orgs = await getOrganization({ mode: 'list' });

    if (!orgs || !orgs.organizations) {
      throw new Error('Failed to fetch organizations. Please check your API key permissions.');
    }

    const org = orgs.organizations.find((o) => o.id === organizationId);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found or not accessible`);
    }

    // Step 5: Fetch components and tags
    const [components, tags] = await Promise.all([
      fetchComponentSummaries(projectId),
      fetchTagSummaries(organizationId),
    ]);

    // Step 6: Build config
    const config = {
      projectId,
      organizationId,
      orgSlug: org.slug,
      orgName: org.name,
      // Use slug if available, fallback to ID
      projectSlug: projectContext.project?.slug || projectContext.slug || projectId,
      projectName: projectContext.project?.name || projectContext.name || 'Unknown Project',
      environment: CONFIG.environment, // staging, production, or dev
      lastUpdatedAt: new Date().toISOString(),
      components,
      tags,
      settings: {
        aiConfig: projectContext.settings?.aiConfig || projectContext.project?.settings?.aiConfig || null,
      },
    };

    // Add monorepo config if provided
    if (monorepoProjects && monorepoProjects.length > 0) {
      config.projects = monorepoProjects.map((p) => ({
        id: p.projectId,
        name: p.name,
        path: p.path,
      }));
    }

    // Step 6: Create config directory
    await fs.mkdir(configDir, { recursive: true });

    // Step 7: Write config file
    await fs.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    // Step 8: Update .gitignore if requested
    let gitignoreUpdated = await ensureConfigDirGitignored(workingDirectory, configDirName, addToGitignore);

    // Step 9: Update CLAUDE.md if requested
    let claudeMdUpdated = false;
    if (addClaudeMd) {
      // Extract autoGenerateTestCases from project settings
      const section = generateClaudeMdSection({
        projectName: config.projectName,
        projectId: config.projectId,
        orgSlug: config.orgSlug,
        organizationId: config.organizationId,
        environment: config.environment,
      });
      claudeMdUpdated = await updateClaudeMd(workingDirectory, section, config.projectName);
    }

    return {
      success: true,
      configPath,
      projectInfo: {
        projectId: config.projectId,
        projectName: config.projectName,
        orgSlug: config.orgSlug,
        organizationId: config.organizationId,
      },
      isMonorepo: !!monorepoProjects && monorepoProjects.length > 0,
      gitignoreUpdated,
      claudeMdUpdated,
      existingConfig,
      ...legacyConfigNotice(legacyConfigPath),
    };
  } catch (error) {
    throw new Error(`Failed to initialize project context: ${error.message}`);
  }
}
