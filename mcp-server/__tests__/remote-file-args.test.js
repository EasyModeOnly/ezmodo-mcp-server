import { jest, beforeEach } from '@jest/globals';

/**
 * E-297: manage_test_suite is remote-safe, but its import_results filePath
 * names a file on the machine running the server, which over the connector is
 * our container. The remote surface must neither list it nor accept it.
 */

const mockHandler = jest.fn().mockResolvedValue({ success: true });

jest.unstable_mockModule('../handlers/index.js', () => ({
  HANDLERS: { manage_test_suite: mockHandler },
}));

jest.unstable_mockModule('../tools/index.js', () => ({
  TOOLS: [{
    name: 'manage_test_suite',
    description: 'x',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string' }, filePath: { type: 'string' }, content: { type: 'string' } },
      required: ['action'],
    },
  }],
}));

const { createServer } = await import('../lib/create-server.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/server');

function dispatcher(server) {
  let connecting;
  let nextId = 0;
  const pending = new Map();
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  client.onmessage = (message) => {
    const settle = pending.get(message.id);
    if (!settle) return;
    pending.delete(message.id);
    settle(message);
  };
  const connect = async () => {
    await server.connect(serverSide);
    await client.start();
  };

  const request = async (method, params) => {
    connecting ??= connect();
    await connecting;
    const id = ++nextId;
    const reply = new Promise((resolve) => pending.set(id, resolve));
    await client.send({ jsonrpc: '2.0', id, method, params });
    const message = await reply;
    if (message.error) throw Object.assign(new Error(message.error.message), message.error);
    return message.result;
  };
  return request;
}


const errorText = (outcome) => (outcome.error ? outcome.error.message : outcome.result?.content?.[0]?.text) || '';

async function attempt(promise) {
  try {
    return { result: await promise };
  } catch (error) {
    return { error };
  }
}

beforeEach(() => mockHandler.mockClear());

describe('local-file arguments over the connector (E-297)', () => {
  it('lists manage_test_suite without filePath on the remote surface', async () => {
    const call = dispatcher(createServer({ surface: 'remote' }));
    const { tools } = await call('tools/list', {});
    expect(tools[0].inputSchema.properties.filePath).toBeUndefined();
    expect(tools[0].inputSchema.properties.content).toBeDefined();
  });

  it('refuses a remote call that passes filePath, before the handler runs', async () => {
    const call = dispatcher(createServer({ surface: 'remote' }));
    const outcome = await attempt(call('tools/call', {
      name: 'manage_test_suite',
      arguments: { action: 'import_results', projectId: 'p1', filePath: '/proc/self/environ' },
    }));
    expect(errorText(outcome)).toContain('not accepted over this connection');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('still serves content-only imports remotely', async () => {
    const call = dispatcher(createServer({ surface: 'remote' }));
    await call('tools/call', {
      name: 'manage_test_suite', arguments: { action: 'import_results', projectId: 'p1', content: '<x/>' },
    });
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('keeps filePath on the local surface', async () => {
    const call = dispatcher(createServer({ surface: 'local' }));
    const { tools } = await call('tools/list', {});
    expect(tools[0].inputSchema.properties.filePath).toBeDefined();
    await call('tools/call', {
      name: 'manage_test_suite', arguments: { action: 'import_results', projectId: 'p1', filePath: 'out/j.xml' },
    });
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });
});
