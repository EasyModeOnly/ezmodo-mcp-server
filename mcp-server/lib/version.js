/**
 * MCP Server version — single source of truth.
 *
 * Kept as a plain constant so the CLI binary (compiled with Bun) can
 * bundle it without needing createRequire() to read package.json at runtime,
 * which fails inside the /$bunfs/ virtual filesystem.
 *
 * Update this when bumping the version in package.json.
 */
export const MCP_VERSION = '0.14.4';
