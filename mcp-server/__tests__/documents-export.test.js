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

const { manageDocument, exportRequest } = await import('../handlers/documents.js');
const { safeExportFilename, MAX_INLINE_BYTES } = await import('../lib/doc-exports.js');
const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');

const PDF = Buffer.from('%PDF-1.3\nhello export\n%%EOF\n');
let reply;

const exportDoc = (over) => manageDocument({ action: 'export', documentId: 'doc-1', format: 'pdf', ...over });
const exportsDir = () => path.join(tmp, '.ezmodo', 'exports');
const sentBody = () => mockCall.mock.calls.find(([op]) => op === 'mcpExportDocument')?.[1];

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'doc-export-')));
  await fs.mkdir(path.join(tmp, '.ezmodo'));
  hasCheckout = true;
  reply = {
    filename: 'Guide.pdf', contentType: 'application/pdf', sizeBytes: PDF.length,
    contentBase64: PDF.toString('base64'), documentCount: 1,
  };
  mockCall.mockReset();
  mockCall.mockImplementation(async (op) => {
    if (op === 'mcpExportDocument') return reply;
    throw new Error(`unexpected ${op}`);
  });
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('manage_document export (#3458): wiring', () => {
  it('is an action of manage_document with format, includeSubfolders and version', () => {
    const tool = DOCUMENT_TOOLS.find((t) => t.name === 'manage_document');
    const props = tool.inputSchema.properties;
    expect(props.action.enum).toContain('export');
    expect(props.format.enum).toEqual(['md', 'pdf']);
    expect(props.version.enum).toEqual(['current', 'published']);
    expect(props.includeSubfolders.type).toBe('boolean');
  });

  it('posts to the MCP export route', () => {
    expect(ENDPOINT_MAP.mcpExportDocument).toEqual({ route: 'mcp/v1/documents/export', method: 'POST' });
  });
});

describe('manage_document export: the request', () => {
  it('sends one document with its format only', async () => {
    await exportDoc({ format: 'md', projectId: 'proj-1' });
    expect(sentBody()).toEqual({ documentId: 'doc-1', format: 'md' });
  });

  it('sends a folder with subfolders and the current version by default', async () => {
    await manageDocument({ action: 'export', folderId: 'f-1', projectId: 'proj-1', format: 'md' });
    expect(sentBody()).toEqual({ folderId: 'f-1', format: 'md', includeSubfolders: true, version: 'current' });
  });

  it('sends projectId alone as the project root', async () => {
    await manageDocument({
      action: 'export', projectId: 'proj-1', format: 'pdf', includeSubfolders: false, version: 'published',
    });
    expect(sentBody()).toEqual({ projectId: 'proj-1', format: 'pdf', includeSubfolders: false, version: 'published' });
  });

  it.each([
    [{ documentId: 'd', folderId: 'f', format: 'md' }, /one thing at a time/],
    [{ format: 'md' }, /Pass what to export/],
    [{ documentId: 'd' }, /format must be/],
    [{ documentId: 'd', format: 'docx' }, /format must be/],
    [{ folderId: 'f', format: 'md', version: 'draft' }, /version must be/],
    [{ folderId: 'f', format: 'md', includeSubfolders: 'yes' }, /includeSubfolders/],
  ])('refuses %o before the network', async (args, message) => {
    expect(() => exportRequest(args)).toThrow(message);
    await expect(manageDocument({ action: 'export', ...args })).rejects.toThrow(message);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

describe('manage_document export: in a checkout', () => {
  it('writes the file under .ezmodo/exports and returns its path', async () => {
    const r = await exportDoc();
    expect(r.filePath).toBe(path.join(exportsDir(), 'Guide.pdf'));
    expect(await fs.readFile(r.filePath)).toEqual(PDF);
    expect(r).toMatchObject({ filename: 'Guide.pdf', contentType: 'application/pdf', sizeBytes: PDF.length, documentCount: 1 });
    expect(r.contentBase64).toBeUndefined();
  });

  it('never overwrites an earlier export: the next one gets a numeric suffix', async () => {
    await fs.mkdir(exportsDir(), { recursive: true });
    await fs.writeFile(path.join(exportsDir(), 'Guide.pdf'), 'mine');

    const second = await exportDoc();
    const third = await exportDoc();

    expect(await fs.readFile(path.join(exportsDir(), 'Guide.pdf'), 'utf8')).toBe('mine');
    expect(second.filePath).toBe(path.join(exportsDir(), 'Guide (2).pdf'));
    expect(third.filePath).toBe(path.join(exportsDir(), 'Guide (3).pdf'));
    expect(second.filename).toBe('Guide (2).pdf');
  });

  it('does not write through a symlink planted at the export name', async () => {
    await fs.mkdir(exportsDir(), { recursive: true });
    const target = path.join(tmp, 'outside.txt');
    await fs.writeFile(target, 'untouched');
    await fs.symlink(target, path.join(exportsDir(), 'Guide.pdf'));

    const r = await exportDoc();

    expect(await fs.readFile(target, 'utf8')).toBe('untouched');
    expect(r.filePath).toBe(path.join(exportsDir(), 'Guide (2).pdf'));
  });

  it('keeps a hostile server file name inside .ezmodo/exports', async () => {
    reply.filename = '../../../etc/passwd.pdf';
    const r = await exportDoc();
    expect(path.dirname(r.filePath)).toBe(exportsDir());
    expect(r.filename).toBe('passwd.pdf');
  });
});

describe('manage_document export: over the remote connector', () => {
  beforeEach(() => { hasCheckout = false; });

  it('returns the bytes inline as base64', async () => {
    const r = await exportDoc();
    expect(r.contentBase64).toBe(PDF.toString('base64'));
    expect(r).toMatchObject({ filename: 'Guide.pdf', contentType: 'application/pdf', sizeBytes: PDF.length });
    expect(r.filePath).toBeUndefined();
    await expect(fs.stat(exportsDir())).rejects.toThrow();
  });

  it('refuses a file over 5 MB and points at the web app', async () => {
    const big = Buffer.alloc(MAX_INLINE_BYTES + 1, 1);
    reply = { ...reply, filename: 'Docs.zip', contentType: 'application/zip', contentBase64: big.toString('base64') };
    await expect(manageDocument({ action: 'export', folderId: 'f-1', format: 'md' })).rejects.toThrow(/5 MB.*web app/s);
  });

  it('returns exactly 5 MB inline', async () => {
    const edge = Buffer.alloc(MAX_INLINE_BYTES, 1);
    reply = { ...reply, contentBase64: edge.toString('base64') };
    const r = await exportDoc();
    expect(r.sizeBytes).toBe(MAX_INLINE_BYTES);
  });
});

describe('safeExportFilename', () => {
  it.each([
    ['Guide.md', 'text/markdown', 'Guide.md'],
    ['a/b\\c.zip', 'application/zip', 'c.zip'],
    ['..', 'application/pdf', 'export.pdf'],
    ['.pdf', 'application/pdf', 'export.pdf'],
    ['notes.exe', 'application/zip', 'notes.exe.zip'],
    ['', 'text/markdown', 'export.md'],
    [undefined, 'application/pdf', 'export.pdf'],
    ['Q3 "plan"; $(rm).md', 'text/markdown', 'Q3 plan (rm).md'],
  ])('%p (%s) → %p', (name, type, expected) => {
    expect(safeExportFilename(name, type)).toBe(expected);
  });
});

it('reports an empty reply rather than writing an empty file', async () => {
  reply = { filename: 'x.pdf' };
  await expect(exportDoc()).rejects.toThrow(/empty/);
});
