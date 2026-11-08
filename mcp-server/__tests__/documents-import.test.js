import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmp;
let hasCheckout = true;
const mockFindConfigPath = jest.fn(async () => (hasCheckout ? path.join(tmp, '.ezmodo', 'config.json') : null));
jest.unstable_mockModule('../lib/local-cache.js', () => ({ findConfigPath: mockFindConfigPath }));
const mockCall = jest.fn();
jest.unstable_mockModule('../lib/http-client.js', () => ({ callEzmodoAPI: mockCall }));

const { manageDocument } = await import('../handlers/documents.js');
const { MAX_IMPORT_BYTES, summarizeImport } = await import('../lib/doc-import.js');
const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { refusedRemoteArgs, remoteRefusalMessage } = await import('../lib/remote-tools.js');

const MD = '# Handbook\n\nSee [setup](setup.md).\n';
// A zip's local-file-header magic; the content is the API's business.
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]);

const REPORT = {
  dryRun: false,
  created: { documents: 2, folders: 1, images: 1 },
  linksRewritten: 3,
  documents: [
    { path: 'handbook/README.md', documentId: 'd1', title: 'Handbook', isIndex: true, images: 1, folderPath: 'handbook' },
    { path: 'handbook/setup.md', documentId: 'd2', title: 'Setup (imported)', renamed: true, originalTitle: 'Setup', images: 0, folderPath: 'handbook' },
  ],
  folders: [{ path: 'handbook', folderId: 'f1', name: 'handbook', topLevel: true }],
  skipped: [{ path: 'handbook/build.sh', reason: 'not markdown' }],
  notCarried: [{ path: 'handbook/setup.md', kind: 'link', target: '../x.md', what: 'x', reason: 'outside the import' }],
};

const importBody = () => mockCall.mock.calls.find(([op]) => op === 'mcpImportDocuments')?.[1];
const imp = (over) => manageDocument({ action: 'import', projectId: 'p1', ...over });

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'doc-import-')));
  await fs.mkdir(path.join(tmp, '.ezmodo'));
  await fs.mkdir(path.join(tmp, 'docs'));
  await fs.writeFile(path.join(tmp, 'docs', 'handbook.zip'), ZIP);
  await fs.writeFile(path.join(tmp, 'guide.md'), MD);
  hasCheckout = true;
  mockCall.mockReset();
  mockCall.mockImplementation(async (op, params) => {
    if (op === 'mcpImportDocuments') return { ...REPORT, dryRun: params.dryRun };
    throw new Error(`unexpected ${op}`);
  });
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('manage_document import (#3456): what is sent', () => {
  it('posts base64 + name to the import route and returns the report with a summary', async () => {
    const b64 = ZIP.toString('base64');
    const r = await imp({ base64: b64, name: 'handbook.zip', folderId: 'f0' });

    expect(importBody()).toEqual({
      projectId: 'p1', folderId: 'f0', name: 'handbook.zip', contentBase64: b64, dryRun: false,
    });
    expect(r).toMatchObject(REPORT);
    expect(r.summary).toBe(
      'Imported 2 documents, 1 folder, 1 image (documents are drafts); 3 links rewritten, ' +
        '1 renamed to avoid a clash, 1 skipped, 1 not carried over (see notCarried).'
    );
  });

  it('reads filePath inside the checkout and sends its bytes and basename', async () => {
    await imp({ filePath: 'docs/handbook.zip' });
    const body = importBody();
    expect(body.name).toBe('handbook.zip');
    expect(Buffer.compare(Buffer.from(body.contentBase64, 'base64'), ZIP)).toBe(0);
    expect(body.folderId).toBeUndefined();
  });

  it('accepts an absolute filePath inside the checkout, and .md', async () => {
    await imp({ filePath: path.join(tmp, 'guide.md') });
    expect(importBody().name).toBe('guide.md');
    expect(Buffer.from(importBody().contentBase64, 'base64').toString()).toBe(MD);
  });

  it('passes dryRun through and says nothing was written', async () => {
    const r = await imp({ filePath: 'guide.md', dryRun: true });
    expect(importBody().dryRun).toBe(true);
    expect(r.summary).toMatch(/^Dry run, nothing written: would create 2 documents/);
  });

  it('strips a data: URL prefix and directories from name', async () => {
    await imp({ base64: `data:application/zip;base64,${ZIP.toString('base64')}`, name: 'x/y/handbook.ZIP' });
    expect(importBody().name).toBe('handbook.ZIP');
    expect(importBody().contentBase64).toBe(ZIP.toString('base64'));
  });

  it('works without a checkout for base64', async () => {
    hasCheckout = false;
    await imp({ base64: Buffer.from(MD).toString('base64'), name: 'guide.markdown' });
    expect(importBody().name).toBe('guide.markdown');
  });
});

describe('manage_document import: refusals before any network call', () => {
  afterEach(() => expect(mockCall).not.toHaveBeenCalled());

  it.each([
    [{ projectId: undefined, filePath: 'guide.md' }, /projectId is required/],
    [{}, /filePath.*or base64 \+ name/],
    [{ filePath: 'guide.md', base64: 'eA==', name: 'a.md' }, /not both/],
    [{ base64: 'eA==' }, /name is required/],
    [{ base64: 'eA==', name: 'notes.txt' }, /\.md, \.markdown or \.zip/],
    [{ base64: 'not base64!', name: 'a.md' }, /not valid base64/],
    [{ base64: '', name: 'a.md' }, /needs the file/],
    [{ filePath: 'guide.md', dryRun: 'yes' }, /dryRun must be/],
  ])('refuses %o', async (input, message) => {
    await expect(imp(input)).rejects.toThrow(message);
  });

  it('refuses a wrong extension for filePath', async () => {
    await fs.writeFile(path.join(tmp, 'notes.txt'), MD);
    await expect(imp({ filePath: 'notes.txt' })).rejects.toThrow(/filePath must be a \.md, \.markdown or \.zip file; got a \.txt file/);
    await fs.writeFile(path.join(tmp, 'README'), MD);
    await expect(imp({ filePath: 'README' })).rejects.toThrow(/no extension/);
  });

  it('refuses a path outside the checkout', async () => {
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.md`);
    await fs.writeFile(outside, MD);
    try {
      await expect(imp({ filePath: outside })).rejects.toThrow(/outside the project checkout/);
      await expect(imp({ filePath: `../${path.basename(outside)}` })).rejects.toThrow(/outside the project checkout/);
    } finally {
      await fs.rm(outside, { force: true });
    }
  });

  it('refuses a symlink, even one pointing inside the checkout', async () => {
    await fs.symlink(path.join(tmp, 'guide.md'), path.join(tmp, 'link.md'));
    await expect(imp({ filePath: 'link.md' })).rejects.toThrow(/symlink/);
  });

  it('refuses a missing file and an empty one', async () => {
    await expect(imp({ filePath: 'nope.md' })).rejects.toThrow(/does not exist/);
    await fs.writeFile(path.join(tmp, 'empty.md'), '');
    await expect(imp({ filePath: 'empty.md' })).rejects.toThrow(/empty/);
  });

  it('refuses a file over 22 MB', async () => {
    const big = path.join(tmp, 'big.zip');
    const handle = await fs.open(big, 'w');
    await handle.truncate(MAX_IMPORT_BYTES + 1);
    await handle.close();
    await expect(imp({ filePath: 'big.zip' })).rejects.toThrow(/22 MB/);
  });

  it('refuses filePath without a checkout and points at base64 + name', async () => {
    hasCheckout = false;
    await expect(imp({ filePath: 'guide.md' })).rejects.toThrow(/base64 with its name/);
  });
});

describe('manage_document import: remote connector', () => {
  it('refuses filePath and tells the agent to send base64 + name', () => {
    const args = { action: 'import', projectId: 'p1', filePath: 'docs/handbook.zip' };
    const refused = refusedRemoteArgs('manage_document', args);
    expect(refused).toEqual(['filePath']);
    expect(remoteRefusalMessage('manage_document', args, refused))
      .toMatch(/not accepted over this connection\. For action:"import", pass base64 .* and name/);
    expect(refusedRemoteArgs('manage_document', { action: 'import', base64: 'eA==', name: 'a.md' })).toEqual([]);
  });

  it('keeps the generic hint for other tools', () => {
    expect(remoteRefusalMessage('manage_test_suite', { action: 'import_results' }, ['filePath']))
      .toMatch(/Send the file's content instead\.$/);
  });
});

describe('manage_document import: schema, route, summary', () => {
  const tool = DOCUMENT_TOOLS.find((t) => t.name === 'manage_document');
  const props = tool.inputSchema.properties;

  it('offers the action and its arguments', () => {
    expect(props.action.enum).toContain('import');
    for (const n of ['projectId', 'folderId', 'filePath', 'base64', 'name', 'dryRun']) {
      expect(props[n]).toBeDefined();
    }
    expect(props.dryRun.type).toBe('boolean');
    expect(props.filePath.description).toMatch(/\.zip/);
    expect(props.name.description).toMatch(/required with base64/);
    expect(tool.description).toMatch(/dryRun:true first/);
    expect(tool.description).toMatch(/\(imported\)/);
    expect(tool.description).toMatch(/notCarried/);
  });

  it('maps to the API route', () => {
    expect(ENDPOINT_MAP.mcpImportDocuments).toEqual({ route: 'mcp/v1/documents/import', method: 'POST' });
  });

  it('summarizes an empty report', () => {
    expect(summarizeImport({ dryRun: false, created: { documents: 1, folders: 0, images: 0 } }))
      .toBe('Imported 1 document, 0 folders, 0 images (documents are drafts).');
  });
});
