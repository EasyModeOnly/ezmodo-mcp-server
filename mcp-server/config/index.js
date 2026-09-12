/**
 * Environment Configuration Loader
 *
 * Imports the appropriate config based on BUILD_ENV at build time.
 * This file is used during the build process to bake in the environment.
 *
 * BUILD_ENV should be set when building:
 * - BUILD_ENV=production (for production builds - the default)
 * - BUILD_ENV=staging (for staging builds)
 * - BUILD_ENV=development (for local dev)
 *
 * The default is PRODUCTION, not development. Every in-repo consumer sets
 * BUILD_ENV explicitly -- `npm run dev`, the test scripts, and the CLI's
 * embedded server (cli/src/lib/mcp-server.ts assigns process.env.BUILD_ENV
 * from BUILD_ENVIRONMENT before importing a handler). So the ONLY caller that
 * arrives here with it unset is an installed copy: `npx @ezmodo/mcp-server`,
 * or the Claude Code plugin that launches it (E-252 #2593). Defaulting those
 * to development pointed a real user's tools at http://localhost:8080/api and
 * failed with a connection error that says nothing about why.
 */

const BUILD_ENV = process.env.BUILD_ENV || 'production';

let config;

if (BUILD_ENV === 'production') {
  config = await import('./production.js');
} else if (BUILD_ENV === 'staging') {
  config = await import('./staging.js');
} else {
  config = await import('./development.js');
}

export const CONFIG = config.CONFIG;
