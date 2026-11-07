import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmp;
const mockFindConfigPath = jest.fn(async () => path.join(tmp, '.ezmodo', 'config.json'));
jest.unstable_mockModule('../lib/local-cache.js', () => ({ findConfigPath: mockFindConfigPath }));
const mockCall = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCall }));

const { getDocument, manageDocument } = await import('../handlers/documents.js');

const BASE = '# Guide\n\nFirst paragraph.\n\nSecond paragraph.';
const doc = (over = {}) => ({ id: 'doc-1', slug: 'guide', title: 'Guide', content: BASE, updatedAt: '2026-11-07T20:00:00.123456Z', ...over });
const file = () => path.join(tmp, '.ezmodo', 'docs', 'guide.md');
const read = (p) => fs.readFile(p, 'utf-8');

/** The API: GET returns `server`; update applies edits to it like the real one. */
let server;
function fakeApi() {
  mockCall.mockImplementation(async (op, params) => {
    if (op === 'mcpGetDocument') return { success: true, document: { ...server } };
    if (op === 'mcpUpdateDocument') {
      if (params.expectedUpdatedAt && params.expectedUpdatedAt !== server.updatedAt) {
        const e = new Error('document doc-1 changed since you read it');
        e.status = 409;
        throw e;
      }
      let content = server.content;
      for (const { oldString, newString } of params.edits ?? []) content = content.replace(oldString, newString);
      server = { ...server, content, updatedAt: '2026-11-07T21:00:00.000001Z' };
      return { documentId: 'doc-1', updatedAt: server.updatedAt };
    }
    throw new Error(`unexpected ${op}`);
  });
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-files-'));
  await fs.mkdir(path.join(tmp, '.ezmodo'));
  server = doc();
  mockCall.mockReset();
  fakeApi();
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('.ezmodo/docs download (E-304 #3453)', () => {
  it('writes the markdown and a sidecar with the version it was downloaded at', async () => {
    const r = await getDocument({ documentId: 'doc-1' });
    expect(r.localFilePath).toBe(file());
    expect(await read(file())).toBe(BASE);
    const meta = JSON.parse(await read(path.join(tmp, '.ezmodo', 'docs', 'guide.meta.json')));
    expect(meta).toMatchObject({ id: 'doc-1', updatedAt: server.updatedAt });
    expect(r.message).toMatch(/fromFile:true/);
  });

  it('does not overwrite edits that were never pushed, unless asked to', async () => {
    await getDocument({ documentId: 'doc-1' });
    await fs.writeFile(file(), BASE + '\n\nMy unpushed paragraph.');

    const r = await getDocument({ documentId: 'doc-1' });
    expect(r.localChanges).toBe(true);
    expect(r.message).toMatch(/NOT overwritten/);
    expect(await read(file())).toContain('My unpushed paragraph.');
    expect(mockCall).toHaveBeenCalledWith('mcpGetDocument', { documentId: 'doc-1' });

    await getDocument({ documentId: 'doc-1', overwriteLocal: true });
    expect(await read(file())).toBe(BASE);
  });
});

describe('manage_document update fromFile:true (E-304 #3453)', () => {
  it('sends only the change, conditional on the downloaded version, then refreshes the file', async () => {
    await getDocument({ documentId: 'doc-1' });
    const downloadedAt = server.updatedAt;
    await fs.writeFile(file(), BASE.replace('Second paragraph.', 'Second paragraph, reworded.'));

    const r = await manageDocument({ action: 'update', documentId: 'doc-1', fromFile: true });

    const update = mockCall.mock.calls.find(([op]) => op === 'mcpUpdateDocument')[1];
    expect(update).toEqual({
      documentId: 'doc-1',
      expectedUpdatedAt: downloadedAt,
      edits: [{ oldString: 'Second paragraph.', newString: 'Second paragraph, reworded.' }],
    });
    expect(update.content).toBeUndefined();
    expect(r.pushed).toBe(1);
    expect(await read(file())).toBe(server.content);
    const meta = JSON.parse(await read(path.join(tmp, '.ezmodo', 'docs', 'guide.meta.json')));
    expect(meta.updatedAt).toBe(server.updatedAt);
  });

  it('says so and sends nothing when the file is unchanged', async () => {
    await getDocument({ documentId: 'doc-1' });
    const r = await manageDocument({ action: 'update', documentId: 'doc-1', fromFile: true });
    expect(r.message).toBe('No local changes to push.');
    expect(mockCall.mock.calls.some(([op]) => op === 'mcpUpdateDocument')).toBe(false);
  });

  it('keeps the agent\'s text as .mine.md and refreshes the file when someone saved first', async () => {
    await getDocument({ documentId: 'doc-1' });
    await fs.writeFile(file(), BASE + '\n\nMine.');
    server = { ...server, content: BASE + '\n\nTheirs.', updatedAt: '2026-11-07T20:30:00.5Z' };

    await expect(manageDocument({ action: 'update', documentId: 'doc-1', fromFile: true }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/guide\.mine\.md/) });

    expect(mockCall.mock.calls.some(([op]) => op === 'mcpUpdateDocument')).toBe(false);
    expect(await read(path.join(tmp, '.ezmodo', 'docs', 'guide.mine.md'))).toBe(BASE + '\n\nMine.');
    expect(await read(file())).toBe(BASE + '\n\nTheirs.');
  });

  it('handles a save that lands between the check and the push the same way', async () => {
    await getDocument({ documentId: 'doc-1' });
    await fs.writeFile(file(), BASE + '\n\nMine.');
    const real = mockCall.getMockImplementation();
    mockCall.mockImplementation(async (op, params) => {
      if (op === 'mcpUpdateDocument') {
        server = { ...server, content: BASE + '\n\nRaced.', updatedAt: '2026-11-07T20:45:00Z' };
      }
      return real(op, params);
    });

    await expect(manageDocument({ action: 'update', documentId: 'doc-1', fromFile: true }))
      .rejects.toMatchObject({ status: 409 });
    expect(await read(file())).toBe(BASE + '\n\nRaced.');
    expect(await read(path.join(tmp, '.ezmodo', 'docs', 'guide.mine.md'))).toBe(BASE + '\n\nMine.');
  });

  it('refuses fromFile together with content or edits', async () => {
    await expect(manageDocument({ action: 'update', documentId: 'doc-1', fromFile: true, content: 'x' }))
      .rejects.toThrow(/do not also send content/);
  });

  it('explains when the document was never downloaded here', async () => {
    await expect(manageDocument({ action: 'update', documentId: 'doc-1', fromFile: true }))
      .rejects.toThrow(/has not been downloaded here/);
  });

  it('passes edits and expectedUpdatedAt straight through without fromFile', async () => {
    const edits = [{ oldString: 'First paragraph.', newString: 'First!' }];
    await manageDocument({ action: 'update', documentId: 'doc-1', edits, expectedUpdatedAt: server.updatedAt });
    expect(mockCall).toHaveBeenCalledWith('mcpUpdateDocument',
      { documentId: 'doc-1', edits, expectedUpdatedAt: '2026-11-07T20:00:00.123456Z' });
  });
});
