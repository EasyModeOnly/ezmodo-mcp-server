/**
 * MCP Server Logger - Structured JSON Lines logging to disk
 *
 * Writes to ~/.ezmodo/logs/ezmodo-YYYY-MM-DD.log
 *
 * Moved from ~/.zephly/logs/zephly-*.log (#2655), matching the CLI's
 * getLogsDir() in cli/src/lib/user-paths.ts. The old directory is NOT
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

// Cloud Logging's LogSeverity names. `warn` must become WARNING: an
// unrecognised severity is stored as DEFAULT, which a severity>=WARNING filter
// never matches.
const CLOUD_SEVERITY = { debug: 'DEBUG', info: 'INFO', warn: 'WARNING', error: 'ERROR' };

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
 * @param {boolean} [options.structured=false] write stderr lines as one JSON
 *   object each — see stderrLine
 */
export function createLogger(options = {}) {
  const {
    source = 'mcp',
    verbose = false,
    logsDir = join(homedir(), '.ezmodo', 'logs'),
    structured = false,
  } = options;

  // Over stdio a person reads stderr in a terminal, so it stays a short line.
  // Over HTTP it is read by Cloud Logging, which parses a JSON line into
  // jsonPayload and maps `severity`; and the log FILE is on an ephemeral
  // container disk nobody ever sees. Plain lines there meant the connector's
  // warnings reached production as a bare message, with every field
  // (requestId, error, what was rejected) lost.
  function stderrLine(level, msg, data) {
    if (!structured) return `[${source}] ${msg}`;
    return JSON.stringify({ severity: CLOUD_SEVERITY[level], message: msg, source, ...data });
  }

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
    if (level === 'warn' || level === 'error' || verbose) {
      console.error(stderrLine(level, msg, data));
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

export function initLogger(verbose = false, logsDir, { structured = false } = {}) {
  _logger = createLogger({ source: 'mcp', verbose, logsDir, structured });
  _logger.cleanup();
  return _logger;
}

export function getLogger() {
  if (!_logger) {
    _logger = createLogger({ source: 'mcp' });
  }
  return _logger;
}
