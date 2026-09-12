import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Dynamic import so each test can get a fresh module
let createLogger, initLogger, getLogger;

let testDir;

beforeEach(async () => {
  testDir = join(tmpdir(), `ezmodo-mcp-logger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });

  // Fresh import (singleton state reset)
  const mod = await import('../lib/logger.js');
  createLogger = mod.createLogger;
  initLogger = mod.initLogger;
  getLogger = mod.getLogger;
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore
  }
  jest.restoreAllMocks();
});

// Helper to wait for async writes
const flush = () => new Promise((r) => setTimeout(r, 100));

describe('createLogger', () => {
  it('creates log file and writes JSON Lines entries', async () => {
    const logger = createLogger({ source: 'mcp', logsDir: testDir });
    logger.info('test message', { key: 'value' });

    await flush();

    const files = readdirSync(testDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^ezmodo-\d{4}-\d{2}-\d{2}\.log$/);

    const content = readFileSync(join(testDir, files[0]), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.level).toBe('info');
    expect(entry.source).toBe('mcp');
    expect(entry.msg).toBe('test message');
    expect(entry.key).toBe('value');
    expect(entry.ts).toBeDefined();
  });

  it('writes multiple log levels', async () => {
    const logger = createLogger({ source: 'mcp', logsDir: testDir });
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    await flush();

    const files = readdirSync(testDir);
    const content = readFileSync(join(testDir, files[0]), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(4);

    const entries = lines.map((l) => JSON.parse(l));
    const levels = entries.map((e) => e.level).sort();
    expect(levels).toEqual(['debug', 'error', 'info', 'warn']);
  });

  it('warn and error write to stderr', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger({ source: 'mcp', logsDir: testDir });
    logger.warn('warning');
    logger.error('error');

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toContain('warning');
    expect(spy.mock.calls[1][0]).toContain('error');
  });

  it('debug and info do NOT write to stderr without verbose', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger({ source: 'mcp', logsDir: testDir, verbose: false });
    logger.debug('debug');
    logger.info('info');

    expect(spy).not.toHaveBeenCalled();
  });

  it('debug and info write to stderr in verbose mode', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const logger = createLogger({ source: 'mcp', logsDir: testDir, verbose: true });
    logger.debug('debug');
    logger.info('info');

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('cleanup removes files older than 7 days', async () => {
    // Create an "old" log file
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);
    const oldFile = `ezmodo-${oldDate.toISOString().slice(0, 10)}.log`;
    writeFileSync(join(testDir, oldFile), '{"ts":"old"}\n');

    // Create a "recent" log file
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2);
    const recentFile = `ezmodo-${recentDate.toISOString().slice(0, 10)}.log`;
    writeFileSync(join(testDir, recentFile), '{"ts":"recent"}\n');

    const logger = createLogger({ source: 'mcp', logsDir: testDir });
    await logger.cleanup();

    const remaining = readdirSync(testDir);
    expect(remaining).not.toContain(oldFile);
    expect(remaining).toContain(recentFile);
  });

  it('entry format has correct JSON structure', async () => {
    const logger = createLogger({ source: 'test-src', logsDir: testDir });
    logger.info('hello', { extra: 123 });

    await flush();

    const files = readdirSync(testDir);
    const content = readFileSync(join(testDir, files[0]), 'utf-8');
    const entry = JSON.parse(content.trim());

    expect(entry).toHaveProperty('ts');
    expect(entry).toHaveProperty('level');
    expect(entry).toHaveProperty('source');
    expect(entry).toHaveProperty('msg');
    expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(entry.source).toBe('test-src');
    expect(entry.extra).toBe(123);
  });
});

describe('initLogger / getLogger', () => {
  it('getLogger returns a logger even without init', () => {
    const logger = getLogger();
    expect(logger).toBeDefined();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.info).toBe('function');
  });
});
