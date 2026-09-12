#!/usr/bin/env node

/**
 * EzModo MCP Server
 *
 * Provides Model Context Protocol tools for AI agents to interact with EzModo
 * projects, tasks, and documentation via HTTP API.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Import configuration
import { CONFIG } from './config/index.js';

// The tool surface, shared with the HTTP entry point (http.js).
import { createServer } from './lib/create-server.js';
import { initLogger, getLogger } from './lib/logger.js';
import { describeCredentialSync } from './lib/credentials.js';

// ============================================================
// Configuration Validation
// ============================================================

// Initialize logger early (before any logging)
initLogger();
const log = getLogger();

// The credential is REPORTED here, not required here.
//
// This used to exit(1) when it found no API key, which was right when a key
// was the only way in: a server that cannot authenticate can do nothing, so
// failing loudly beat failing on every tool call. OAuth changes that (#2631) —
// signing in happens through the browser AFTER startup, so a server with no
// credential yet is not broken, it is waiting. Exiting would make the one case
// we now want to support impossible.
//
// Nothing is resolved asynchronously here either: a stale token would make the
// server block on Keycloak before it ever spoke MCP. The refresh happens on
// the first call that needs one.
const credential = describeCredentialSync();

log.info('MCP server starting', {
  environment: CONFIG.environment,
  apiUrl: CONFIG.apiUrl,
  credentialSource: credential?.source ?? 'none',
});
console.error('🔧 ezmodo MCP Server Configuration:');
console.error(`   Environment: ${CONFIG.environment} (build-time)`);
console.error(`   API URL: ${CONFIG.apiUrl}`);
if (credential) {
  // Name the source. A server that silently authenticates as whoever the CLI
  // happens to be logged in as, with no way to tell, is worse than one that fails.
  console.error(`   Credential: ${credential.detail ?? ''} (from ${credential.source})`);
} else {
  console.error('   Credential: none yet — sign in with the `authenticate` tool');
  console.error(`   Or set EZMODO_API_KEY. Generate a key at: ${CONFIG.settingsUrl}`);
}
console.error('');

// ============================================================
// Start Server (stdio)
// ============================================================
//
// This file is the STDIO entry point. The HTTP entry point is http.js; both
// build the same server through lib/create-server.js, so the tool surface
// cannot differ between them.

const server = createServer();

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('MCP server running on stdio');
  console.error('✅ ezmodo MCP Server running on stdio');
}

main().catch((error) => {
  log.error('Fatal error in main()', { error: error.message || String(error) });
  console.error('Fatal error in main():', error);
  process.exit(1);
});
