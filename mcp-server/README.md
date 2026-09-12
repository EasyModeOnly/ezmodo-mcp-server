# EzModo MCP Server

Model Context Protocol (MCP) server for ezmodo - AI-first project management.

## Install

Point any MCP client at the package. There is nothing to configure:

```json
{
  "mcpServers": {
    "ezmodo": {
      "command": "npx",
      "args": ["-y", "-p", "@ezmodo/mcp-server", "ezmodo-mcp-server"]
    }
  }
}
```

The first tool call returns a sign-in URL. Open it, approve the access, and
retry — the server holds the token from then on and refreshes it itself. No API
key, no environment variable, no CLI.

That block is the same for Claude Desktop, Cursor, Windsurf, Zed, Codex and
anything else that speaks stdio MCP; only the file it goes in differs.

**Claude Code users should install the plugin instead**, which bundles this
server along with the work-tracking skills, slash commands and hooks:

```
/plugin marketplace add EasyModeOnly/ezmodo-plugins
/plugin install ezmodo@ezmodo
```

### Signing in

Sign-in happens through the `authenticate` tool rather than at startup, because
a server launched by an editor has no terminal to prompt in:

| Action | What it does |
| --- | --- |
| `authenticate` | Starts browser sign-in and returns the URL to open |
| `authenticate action:"status"` | Reports which credential is in use |
| `authenticate action:"sign_out"` | Forgets the stored tokens |

It returns the URL immediately rather than blocking until you finish in the
browser, so it cannot trip a client's tool-call timeout. Approve, then retry
whatever you were doing.

Tokens are stored at `~/.config/ezmodo/mcp-oauth.json` (`%APPDATA%\ezmodo\` on
Windows), mode `0600`.

The sign-in asks for `ezmodo:read` and `ezmodo:write`. It deliberately does not
ask for `ezmodo:delete`: consent is accept-or-decline over the whole set, and
"permanently delete your projects" should not be a condition of installing an
MCP server. Set `EZMODO_OAUTH_SCOPES` if you want a different set.

## Using an API key instead

For CI, containers and anything headless where no browser exists, set
`EZMODO_API_KEY` and skip sign-in entirely:

```json
{
  "mcpServers": {
    "ezmodo": {
      "command": "npx",
      "args": ["-y", "-p", "@ezmodo/mcp-server", "ezmodo-mcp-server"],
      "env": {
        "EZMODO_API_KEY": "ezm_sk_your_key_here"
      }
    }
  }
}
```

Generate one at **Settings → API Keys** on [ezmodo.com](https://ezmodo.com).
Keys start with `ezm_sk_` and are shown once. Pre-rename `zeph_sk_` keys remain
valid indefinitely.

### Which credential wins

Resolved per call, in this order:

1. `EZMODO_API_KEY` (or legacy `ZEPHLY_API_KEY`) — an explicit credential beats
   an implicit one, which is what keeps CI predictable.
2. The OAuth token this server obtained for itself.
3. The credential `ezmodo auth login` stored, if you happen to have the CLI.

`authenticate action:"status"` reports which of these is actually in use.

### Other environment variables

- `EZMODO_API_URL` (optional): custom API URL. Defaults to production
  (`https://ezmodo.com/api`).
- `EZMODO_OAUTH_SCOPES` (optional): space-separated scopes to request at
  sign-in.

## What the server provides besides tools

**Instructions.** The initialize result carries the work-tracking contract —
create the task before you edit, tick steps off, capture knowledge, link the
commit, finish at `in_review`. Most clients inject it into system context, so
the discipline travels with the tools rather than needing a per-editor plugin.

**Prompts.** `start`, `resume`, `submit` and `untracked`, which clients surface
as slash commands. `submit` is local-only, since it reads git SHAs.

## Running from source

```bash
export EZMODO_API_KEY="ezm_sk_your_key_here"
export EZMODO_API_URL="http://localhost:8787/api"  # Local Go API
npm run dev
```

## Available Tools

The MCP server provides these tools for AI agents:

### 1. `create_task`
Create a new task in a project with AI context.

**Parameters:**
- `projectId` (required): Project ID
- `title` (required): Task title
- `description` (required): Task description (markdown supported)
- `priority` (optional): `low`, `medium`, `high`, `urgent` (default: `medium`)
- `assigneeType` (optional): `human` or `ai` (default: `ai`)
- `assigneeId` (optional): Assignee identifier (default: `claude`)
- `assigneeName` (optional): Assignee name (default: `Claude`)
- `knowledge` (optional): Array of structured KnowledgeItem objects with `type`, `content`, and optional `tags`

### 2. `update_task`
Update an existing task.

**Parameters:**
- `taskId` (required): Task ID
- `status` (optional): Task status
- `priority` (optional): Task priority
- `description` (optional): Updated description
- `addKnowledge` (optional): Array of structured KnowledgeItem objects to add

### 3. `complete_task`
Mark a task as completed.

**Parameters:**
- `taskId` (required): Task ID
- `completionNotes` (optional): Completion notes

### 4. `get_project_context`
Retrieve project context, configuration, and metadata.

**Parameters:**
- `projectId` (required): Project ID

### 5. `add_task_context`
Add knowledge or memory to a task for AI continuity.

**Parameters:**
- `taskId` (required): Task ID
- `knowledge` (optional): Knowledge snippets to add
- `memory` (optional): Memory data to store

### 6. `search_tasks`
Search for tasks with filters.

**Parameters:**
- `projectId` (optional): Filter by project
- `status` (optional): Filter by status
- `assignedToAI` (optional): Filter for AI-assigned tasks
- `searchText` (optional): Text search in title/description
- `limit` (optional): Max results (default: 50)

### 7. `get_documentation`
Retrieve project documentation.

**Parameters:**
- `projectId` (required): Project ID
- `docType` (optional): Filter by type (`guide`, `api`, `process`, `context`)
- `tags` (optional): Filter by tags

### 8. `manage_watch`
Watch or unwatch a task, subscribing **you** (the API key's owner) to
notifications about its status changes and comments.

You are subscribed automatically to tasks you're assigned, own, create or
comment on, so this is for following work that isn't yours.

**Parameters:**
- `action` (required): `watch` or `unwatch`
- `taskId` (required): The task to (un)watch

Both actions are idempotent. There is deliberately no `userId` parameter — the
acting user is always the key's owner, so an agent cannot subscribe someone else.

### 9. `list_watched`
List the tasks you're watching, with status, priority, project and when each
last changed — enough to answer "what's happening on the work I follow?" without
a `get_task` per row. Each result carries `reason` (`manual`, `assignee`,
`owner` or `commenter`), why you're subscribed.

**Parameters:**
- `organizationId` (required): Organization to list for
- `limit` (optional): Max results (default: 200)

### 10. `list_notifications`
Your in-app notifications — mentions, replies, assignments, and activity on
watched tasks.

**Parameters:**
- `unreadOnly` (optional): Only unread (default: `true`)
- `limit` (optional): Max results (default: 20, max: 100)

## Usage Example

Once configured in Claude Desktop, you can use natural language:

```
"Create a task in project abc123 titled 'Implement user authentication'
with high priority and assign it to me"

"Show me all in-progress tasks in my current project"

"Mark task xyz789 as completed with notes about the implementation"

"Watch task xyz789 for me"

"What's changed on the tasks I'm watching?"
```

## AI Agent Guidelines

### Providing URLs to Users

When providing ezmodo URLs to users, **always use the actual orgSlug value** from the project context, never use placeholders.

**❌ Wrong:**
```
View in ezmodo: https://ezmodo.com/{orgSlug}/projects/zephly/epics
```

**✅ Correct:**
```
View in ezmodo: https://ezmodo.com/emo/projects/zephly/epics
```

**How to get the orgSlug:**
1. Call `get_current_project_context()` or `list_projects()` to get project data
2. Extract the `orgSlug` field from the response
3. Use that actual value in any URLs you provide to users

**Example:**
```javascript
// Response from get_current_project_context():
{
  "projectId": "axFzraDA4yCLgVyVBFoG",
  "projectName": "zephly",
  "orgSlug": "emo",  // <-- Use this actual value!
  "organizationId": "VByHaD78P7B8ky7X4NZf"
}

// Then provide URL like:
"View your epic at: https://ezmodo.com/emo/projects/zephly/epics"
```

This ensures users can click the link and go directly to the correct resource.

### Project-First Hierarchy

ezmodo uses a project-first hierarchy: **Organization → Projects → Epics → Tasks**

- **Project**: Primary work container - blue theme
- **Epic**: Project-scoped milestone - orange theme
- **Task**: Individual work item within a project
- **Goal**: Organization-wide strategic objective (optional, links to epics)

When working with the MCP tools:
- Use `create_epic`, `get_epic`, `update_epic` for project milestones
- Use `create_task`, `get_task`, `update_task` for work items
- Tasks belong to projects (required) and optionally to epics

## Security

- **API Keys**: Your API key authenticates with the ezmodo Go API
- **Revocable**: You can revoke API keys anytime in your ezmodo settings
- **Rate Limiting**: API keys have rate limits to prevent abuse
- **Audit Trail**: All API usage is logged in your ezmodo account

## Troubleshooting

### "Not authenticated with EzModo"
Nobody has signed in and no `EZMODO_API_KEY` is set. Call `authenticate`, open
the URL it returns, then retry. Tool calls return this as guidance rather than a
bare error, so the agent can act on it.

### A 403 after signing in successfully
Signing in worked; the account just does not belong to any EzModo organization
yet, so there is nothing for tools to return. Signing in again will not change
it — no credential substitutes for belonging to a workspace.

Tool calls answer this one themselves: the result carries an `onboardingUrl`,
and opening it lets you create a personal workspace, create a team, or ask to
join an organization your verified email already matches. If you expected to be
a member of one already, you are probably signed in as a different identity than
you think — check which email that page shows, and ask an administrator to
invite that exact address.

### "This email address already belongs to a different EzModo account"
Sign-in worked, but no account could be created for the identity you signed in
with, because that address is already registered under a different one — most
often a password account and a Google/Microsoft/GitHub/Apple sign-in for the
same person. Creating a workspace will not help; the same collision happens
there. Sign in the way you originally did, or contact support to have the two
linked.

### Sign-in never completes
The flow needs a browser — this client cannot take a username and password
directly, because skipping the browser would skip the consent screen. If no
browser can open (over SSH, or in a container), the URL is still in the tool
result; open it anywhere and approve. Or set `EZMODO_API_KEY` instead, which is
the right answer for a headless machine.

### "Invalid or revoked API key"
Regenerate the key in ezmodo settings. Check it has not been revoked, and that
it has not passed an expiry date if you set one.

### "Failed to connect to API"
- Check your `EZMODO_API_URL` configuration
- Verify your internet connection

### The client doesn't see the server
- Restart it after updating config — MCP servers are read at startup
- Check the config file path is correct
- Verify the JSON syntax

## Development

### Building from Source

For contributors with repository access:

```bash
cd mcp-server
npm install
npm run dev
```

### Testing Locally

1. Start the Go API locally:
   ```bash
   cd ../api && go run cmd/api/main.go
   ```

2. Set local API URL:
   ```bash
   export EZMODO_API_URL="http://localhost:8787/api"
   export EZMODO_API_KEY="your_api_key"
   ```

3. Run MCP server:
   ```bash
   npm run dev
   ```

## Support

- **Documentation**: [ezmodo.com/mcp/docs](https://ezmodo.com/mcp/docs)
- **Support**: [ezmodo.com/support](https://ezmodo.com/support)
- **Email**: support@ezmodo.com

## License

MIT
