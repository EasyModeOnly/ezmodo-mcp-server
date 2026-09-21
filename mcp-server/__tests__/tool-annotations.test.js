import { describe, it, expect } from '@jest/globals';
import { InMemoryTransport } from '@modelcontextprotocol/server';

import { TOOLS } from '../tools/index.js';
import { READ_ONLY_TOOLS, annotate } from '../lib/tool-annotations.js';
import { createServer } from '../lib/create-server.js';

const names = new Set(TOOLS.map((tool) => tool.name));

describe('READ_ONLY_TOOLS', () => {
  it('names only tools that exist', () => {
    expect([...READ_ONLY_TOOLS].filter((name) => !names.has(name))).toEqual([]);
  });

  it('leaves no get_/list_/search_ tool unclassified', () => {
    // A read left out defaults to "may write", and a read-only tool policy then
    // blocks it: the failure #2808 exists to fix. If a new tool with one of these
    // prefixes really writes, name it here with the reason.
    const writesDespiteName = new Set([]);
    const unclassified = [...names].filter((name) =>
      /^(get_|list_|search_)/.test(name) && !READ_ONLY_TOOLS.has(name) && !writesDespiteName.has(name));
    expect(unclassified).toEqual([]);
  });

  it('never marks a tool whose name says it writes', () => {
    const writerNames = [...READ_ONLY_TOOLS].filter((name) =>
      /^(manage_|create_|update_|delete_|add_|accept_|reject_|run_|configure_|report_|rebuild_|initialize_|resolve_links|resolve_unmapped|resolve_link_suggestions|authenticate)/.test(name));
    expect(writerNames).toEqual([]);
  });
});

describe('annotate', () => {
  it('marks a read-only tool without touching the shared definition', () => {
    const tool = { name: 'get_task', description: 'd', inputSchema: { type: 'object' } };
    const out = annotate(tool);
    expect(out.annotations).toEqual({ readOnlyHint: true });
    expect(tool.annotations).toBeUndefined();
  });

  it('keeps annotations a tool already declares', () => {
    const out = annotate({ name: 'get_task', annotations: { title: 'Get task' } });
    expect(out.annotations).toEqual({ title: 'Get task', readOnlyHint: true });
  });

  it('returns a write tool unchanged', () => {
    const tool = { name: 'create_tasks' };
    expect(annotate(tool)).toBe(tool);
  });
});

/** tools/list over a real in-process connection, as a client receives it. */
async function listTools(server) {
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  const reply = new Promise((resolve) => { client.onmessage = resolve; });
  await server.connect(serverSide);
  await client.start();
  await client.send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const message = await reply;
  await server.close();
  return message.result.tools;
}

describe('tools/list', () => {
  it.each(['local', 'remote'])('carries readOnlyHint on the %s surface', async (surface) => {
    const tools = await listTools(createServer({ surface }));
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

    expect(byName.get_task.annotations).toEqual(expect.objectContaining({ readOnlyHint: true }));
    expect(byName.search_tasks.annotations).toEqual(expect.objectContaining({ readOnlyHint: true }));
    expect(byName.create_tasks.annotations?.readOnlyHint).toBeUndefined();
    expect(byName.manage_task.annotations?.readOnlyHint).toBeUndefined();

    const marked = tools.filter((tool) => tool.annotations?.readOnlyHint).map((tool) => tool.name);
    expect(marked.every((name) => READ_ONLY_TOOLS.has(name))).toBe(true);
  });
});
