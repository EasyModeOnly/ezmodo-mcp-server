/**
 * GitHub Tools
 * MCP tools for managing GitHub pull requests and integration
 *
 * Consolidated: manage_pull_request (create/update/merge/close/request_review)
 */

export const GITHUB_TOOLS = [
  {
    name: 'list_repositories',
    description: 'List the git repositories linked to a project, each with the ' +
      '`repoId` that every manage_pull_request action requires. Call this first ' +
      'when you need a repoId — it is the only way to get one. The id is ' +
      '"installationId:owner/repo" and the installation id is not derivable ' +
      'from anywhere else: no other ezmodo tool exposes it, and GitHub only ' +
      'answers for it with an app JWT or an app-authorized token. ' +
      '`installationStatus` tells a live link from one whose GitHub App was ' +
      'uninstalled or suspended; a repoId from a non-active installation will ' +
      'parse and then fail at the GitHub call.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Project whose linked repositories to list (required)',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'manage_pull_request',
    description: 'Create, update, merge, close, or request review on GitHub pull requests. ' +
      'Also suggests reviewers ("suggest_reviewers") ranked from CODEOWNERS and file history — ' +
      'that action only SUGGESTS; use "request_review" to actually request them.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'merge', 'close', 'request_review', 'suggest_reviewers'],
          description: 'Action to perform',
        },
        // --- Identifiers (used by all actions) ---
        repoId: {
          type: 'string',
          description: 'Repository ID in format "installationId:owner/repo" (e.g., "12345678:acme-corp/backend"). ' +
            'Get it from `list_repositories` (or from the `repositories` on a `detect_git_repository` match) — ' +
            'the installation id is not derivable from the repo, and GitHub will not tell you it.',
        },
        number: {
          type: 'number',
          description: 'PR number (required for update, merge, close, request_review)',
        },
        // --- Create fields ---
        title: {
          type: 'string',
          description: 'PR title (required for create, optional for update)',
        },
        body: {
          type: 'string',
          description: 'PR description in markdown format. Used by create and update.',
        },
        headBranch: {
          type: 'string',
          description: 'Source branch name without refs/heads/ (required for create)',
        },
        baseBranch: {
          type: 'string',
          description: 'Target branch name e.g. "main" (required for create, optional for update)',
        },
        draft: {
          type: 'boolean',
          description: 'Create as draft PR (create only, default: false)',
        },
        maintainerCanModify: {
          type: 'boolean',
          description: 'Allow maintainers to modify the PR. Used by create and update (default: true).',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub usernames to assign to the PR (create only)',
        },
        reviewers: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub usernames to request review from. Used by create and request_review.',
        },
        teamReviewers: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub team slugs to request review from (e.g., "backend-team"). Used by create and request_review.',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to add to the PR (create only)',
        },
        milestoneNumber: {
          type: 'number',
          description: 'Milestone number to associate with the PR (create only)',
        },
        // --- Work linkage (E-233) ---
        taskId: {
          type: 'string',
          description: 'ezmodo task this PR implements. Used by create and update. ' +
            'You already know which task you are on, so passing it here records the ' +
            'strongest possible link — better than relying on the resolver to infer ' +
            'one from the branch name or the PR body afterwards.',
        },
        epicId: {
          type: 'string',
          description: 'ezmodo epic this PR advances. Used by create and update. ' +
            'Usually unnecessary when taskId is set and the task already belongs to the epic.',
        },
        // --- Update-only fields ---
        state: {
          type: 'string',
          enum: ['open', 'closed'],
          description: 'Update PR state (update only)',
        },
        // --- Merge fields ---
        mergeMethod: {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          description: 'Merge method to use (merge only, default: "merge")',
        },
        commitTitle: {
          type: 'string',
          description: 'Custom merge commit title for squash/merge (merge only)',
        },
        commitMessage: {
          type: 'string',
          description: 'Custom merge commit message body (merge only)',
        },
        sha: {
          type: 'string',
          description: 'Head SHA to validate before merge — prevents race conditions (merge only)',
        },
        // --- suggest_reviewers fields ---
        projectId: {
          type: 'string',
          description: 'Project ID — required by every action. It scopes access, and on create/update it is ' +
            'what the PR is stored and linked against.',
        },
        changedPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Repo-relative paths this change touches (REQUIRED for suggest_reviewers). ' +
            'Without them there is nothing to reason from; guessing "the whole repo" would just ' +
            'suggest whoever commits most. Capped at 50 — file history is one API call per path.',
        },
        excludeLogins: {
          type: 'array',
          items: { type: 'string' },
          description: 'Logins to never suggest (suggest_reviewers only). Passing `number` also ' +
            'excludes the PR author automatically.',
        },
        limit: {
          type: 'number',
          description: 'Maximum suggestions to return (suggest_reviewers only, default 5, max 25). ' +
            'The response sets `truncated` when the list was capped.',
        },
      },
      // Every action's server handler rejects a missing projectId, so the schema
      // says so too. It used to be documented as "required for suggest_reviewers",
      // which read as optional everywhere else and was not.
      required: ['action', 'repoId', 'projectId'],
    },
  },
];
