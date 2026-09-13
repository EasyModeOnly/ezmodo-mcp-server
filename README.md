# EzModo MCP server

The source of [`@ezmodo/mcp-server`](https://www.npmjs.com/package/@ezmodo/mcp-server):
the Model Context Protocol server that gives an AI agent EzModo's work-tracking
tools — tasks, epics, knowledge, commit links, features and the rest.

The code is in [`mcp-server/`](mcp-server/). The same tool definitions serve both
transports: `index.js` (stdio, what you run locally) and `http.js` (Streamable
HTTP, behind the hosted connector at `https://ezmodo.com/mcp`).

## Using it

You probably do not need to run this yourself.

- **Claude Code:** install the plugin, which launches this server for you.
  ```
  /plugin marketplace add EasyModeOnly/ezmodo-plugins
  /plugin install ezmodo@ezmodo
  ```
- **Claude Desktop, claude.ai, mobile:** add `https://ezmodo.com/mcp` as a custom
  connector. Nothing to install.
- **Any other MCP client:**
  ```json
  { "command": "npx", "args": ["-y", "-p", "@ezmodo/mcp-server", "ezmodo-mcp-server"] }
  ```

No key is needed. The first tool call hands back a sign-in link; approve it in a
browser and retry. For CI or anything headless, set `EZMODO_API_KEY` to a key from
https://ezmodo.com/settings/api-keys instead.

Docs: https://ezmodo.com/docs/emo/ezmodo/help/cli-mcp

## Releases are published from here

`@ezmodo/mcp-server` is published to npm **from this repository**, by
`.github/workflows/publish.yml`, with [npm provenance](https://docs.npmjs.com/generating-provenance-statements):
each version on npm links to the exact commit and workflow run here that built
it. The tests and a first approval run upstream; this repo's workflow only packs
the release and **stages** it (`npm stage publish`). Nothing becomes installable
until a maintainer approves the staged version on npm with 2FA.

## Not in this mirror

The hosted connector's container build (`Dockerfile`, `cloudbuild.yaml`) is left
out: it builds from the monorepo root against a lockfile that is not here, so it
would not work from this repo. The tests in `mcp-server/__tests__` are included.

---

## This repository is generated

**Do not edit it, and do not open pull requests against it.** Every file is
copied from the EzModo monorepo by CI on each change, so anything committed here
is overwritten by the next sync without warning.

Report bugs at https://ezmodo.com/support, or open an issue here describing the
problem and it will be carried across — just expect the fix to arrive as a sync
commit rather than a merge.
