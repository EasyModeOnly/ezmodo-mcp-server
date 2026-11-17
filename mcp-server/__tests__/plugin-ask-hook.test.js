/**
 * The plugin's Stop hook (plugins/ezmodo/hooks/ask-on-task-reminder.js,
 * E-333 #3832): a final message with "still on you" / "you'll need to" in a
 * session that asked no questions is sent back once, with a reminder to ask
 * them on the task. Tested here because this is the suite CI runs.
 */

import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  askReminder,
  defersToPerson,
  isAsk,
  readTranscript,
} from '../../plugins/ezmodo/hooks/ask-check.js';

const HOOK = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../plugins/ezmodo/hooks'),
  'ask-on-task-reminder.js'
);

const said = (text) => ({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
const called = (name, input) => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id: 'x', name, input }] },
});
const result = () => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } });
const jsonl = (...entries) => entries.map((e) => JSON.stringify(e)).join('\n');

describe('defersToPerson', () => {
  it.each([
    'Still on you:\n- rotate the key',
    "You'll need to remove the empty assignee in the UI.",
    'You’ll need to approve the PR.',
    'you will need to restart the server',
  ])('flags %j', (text) => {
    expect(defersToPerson(text)).toBe(true);
  });

  it.each(['Done. Asked you 2 questions.', 'Nothing is left for you.', '', null])('passes %j', (text) => {
    expect(defersToPerson(text)).toBe(false);
  });
});

describe('isAsk', () => {
  it('counts a question or a decision created under any server name', () => {
    expect(isAsk({ type: 'tool_use', name: 'mcp__plugin_ezmodo_ezmodo__manage_question', input: { action: 'create' } })).toBe(true);
    expect(isAsk({ type: 'tool_use', name: 'mcp__claude_ai_ezmodo__manage_decision', input: { action: 'create' } })).toBe(true);
    expect(isAsk({ type: 'tool_use', name: 'manage_question', input: { action: 'create' } })).toBe(true);
  });

  it('does not count reading, withdrawing or other tools', () => {
    expect(isAsk({ type: 'tool_use', name: 'mcp__x__manage_question', input: { action: 'withdraw' } })).toBe(false);
    expect(isAsk({ type: 'tool_use', name: 'mcp__x__list_questions', input: {} })).toBe(false);
    expect(isAsk({ type: 'tool_use', name: 'mcp__x__not_manage_question', input: { action: 'create' } })).toBe(false);
    expect(isAsk({ type: 'text', text: 'manage_question' })).toBe(false);
  });
});

describe('readTranscript', () => {
  it('returns the text written after the last tool ran', () => {
    const t = jsonl(said('Starting.'), called('Bash', {}), result(), said('All done.'), said('Second block.'));
    expect(readTranscript(t)).toEqual({ asked: false, lastText: 'All done.\nSecond block.' });
  });

  it('notices a question asked anywhere in the session', () => {
    const t = jsonl(called('mcp__plugin_ezmodo_ezmodo__manage_question', { action: 'create' }), result(), said('x'));
    expect(readTranscript(t).asked).toBe(true);
  });

  it('skips lines that are not JSON, such as a half-written last line', () => {
    expect(readTranscript(`${jsonl(said('ok'))}\n{"type":"assis`)).toEqual({ asked: false, lastText: 'ok' });
  });
});

describe('askReminder', () => {
  it('reminds when the last message defers and nothing was asked', () => {
    const text = askReminder({ transcript: jsonl(said("Done. You'll need to rotate the key.")) });
    expect(text).toMatch(/manage_question/);
    expect(text).toMatch(/manage_decision/);
    expect(text).toMatch(/inbox/);
  });

  it('is silent when the session asked', () => {
    const t = jsonl(called('manage_decision', { action: 'create' }), result(), said('Still on you: pick one.'));
    expect(askReminder({ transcript: t })).toBeNull();
  });

  it('is silent when only an earlier message deferred', () => {
    const t = jsonl(said('Still on you: x'), { type: 'user', message: { content: 'ok, done' } }, said('Thanks.'));
    expect(askReminder({ transcript: t })).toBeNull();
  });

  it('prefers the last message the harness passes', () => {
    expect(askReminder({ transcript: jsonl(said('Done.')), lastMessage: 'Still on you: x' })).not.toBeNull();
  });
});

describe('ask-on-task-reminder hook', () => {
  let root;
  let runtime;
  let sessionId;

  function runHook(payload) {
    const out = spawnSync('node', [HOOK], {
      input: JSON.stringify({ cwd: root, session_id: sessionId, ...payload }),
      encoding: 'utf-8',
      env: { ...process.env, XDG_RUNTIME_DIR: runtime, HOME: runtime, USERPROFILE: runtime },
    });
    expect(out.status).toBe(0);
    return out.stdout ? JSON.parse(out.stdout) : null;
  }

  function transcript(...entries) {
    const file = join(runtime, `t-${Math.random().toString(36).slice(2)}.jsonl`);
    writeFileSync(file, jsonl(...entries));
    return file;
  }

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ezmodo-ask-hook-')));
    runtime = realpathSync(mkdtempSync(join(tmpdir(), 'ezmodo-ask-runtime-')));
    mkdirSync(join(root, '.ezmodo'));
    writeFileSync(join(root, '.ezmodo', 'config.json'), '{}');
    sessionId = `test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(runtime, { recursive: true, force: true });
  });

  it('sends a still-on-you ending back once per session', () => {
    const path = transcript(said('Done.\n\nStill on you:\n- remove the empty assignee'));
    const first = runHook({ transcript_path: path });
    expect(first.decision).toBe('block');
    expect(first.reason).toMatch(/manage_question/);
    expect(runHook({ transcript_path: path })).toBeNull();
  });

  it('is silent on the continuation it caused', () => {
    expect(runHook({ transcript_path: transcript(said('Still on you: x')), stop_hook_active: true })).toBeNull();
  });

  it('is silent outside an EzModo repo', () => {
    rmSync(join(root, '.ezmodo'), { recursive: true, force: true });
    expect(runHook({ transcript_path: transcript(said('Still on you: x')) })).toBeNull();
  });

  it('is silent with no readable transcript', () => {
    expect(runHook({ transcript_path: join(runtime, 'missing.jsonl') })).toBeNull();
    expect(runHook({})).toBeNull();
  });
});
