/**
 * MCP Server Logger - Structured JSON Lines logging to disk
 *
 * Writes to ~/.ezmodo/logs/ezmodo-YYYY-MM-DD.log
 *
 * Moved from ~/.zephly/logs/zephly-*.log (#2655), matching the CLI's
 * currentLogsDir() in cli/src/lib/user-paths.ts. The old directory is NOT
 * migrated or cleaned: these are diagnostics, safe to delete, and a server that
 * reaches into a directory it no longer owns to tidy it is a server that can
 * delete the wrong thing. Nothing is written under the old brand any more.
 * Daily rotation, 7-day auto-cleanup on init
 * Async fire-and-forget writes so logging never blocks tool execution
 */

import { mkdir, appendFile, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const RETENTION_DAYS = 7;
const DATE_PATTERN = /^ezmodo-(\d{4}-\d{2}-\d{2})\.log$/;

function getDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getLogFilePath(logsDir) {
  return join(logsDir, `ezmodo-${getDateString()}.log`);
}

/**
 * @param {object} [options]
 * @param {string} [options.source='mcp']
 * @param {boolean} [options.verbose=false]
 * @param {string} [options.logsDir]
 */
export function createLogger(options = {}) {
  const {
    source = 'mcp',
    verbose = false,
    logsDir = join(homedir(), '.ezmodo', 'logs'),
  } = options;

  // Ensure logs directory exists (fire-and-forget)
  let dirReady = mkdir(logsDir, { recursive: true }).catch(() => {});

  function write(level, msg, data) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      source,
      msg,
      ...data,
    };

    // Fire-and-forget write — wait for dir, then append
    dirReady.then(() => {
      const filePath = getLogFilePath(logsDir);
      return appendFile(filePath, JSON.stringify(entry) + '\n');
    }).catch(() => {});

    // stderr routing: warn/error always go to stderr; debug/info only if verbose
    if (level === 'warn' || level === 'error') {
      console.error(`[${source}] ${msg}`);
    } else if (verbose) {
      console.error(`[${source}] ${msg}`);
    }
  }

  async function cleanup() {
    try {
      await dirReady;
      const files = await readdir(logsDir);
      const now = Date.now();
      const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const match = file.match(DATE_PATTERN);
        if (!match) continue;

        const fileDate = new Date(match[1]);
        if (isNaN(fileDate.getTime())) continue;

        if (now - fileDate.getTime() > maxAge) {
          await unlink(join(logsDir, file)).catch(() => {});
        }
      }
    } catch {
      // Ignore cleanup failures
    }
  }

  return {
    debug: (msg, data) => write('debug', msg, data),
    info: (msg, data) => write('info', msg, data),
    warn: (msg, data) => write('warn', msg, data),
    error: (msg, data) => write('error', msg, data),
    cleanup,
  };
}

// Singleton
let _logger = null;

export function initLogger(verbose = false, logsDir) {
  _logger = createLogger({ source: 'mcp', verbose, logsDir });
  _logger.cleanup();
  return _logger;
}

export function getLogger() {
  if (!_logger) {
    _logger = createLogger({ source: 'mcp' });
  }
  return _logger;
}
