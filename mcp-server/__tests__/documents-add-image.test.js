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

const { manageDocument, getDocument } = await import('../handlers/documents.js');
const { sniffImageType, MAX_IMAGE_BYTES } = await import('../lib/doc-images.js');
const { DOCUMENT_TOOLS } = await import('../tools/documents.js');
const { ENDPOINT_MAP } = await import('../config/endpoint-map.js');
const { refusedRemoteArgs } = await import('../lib/remote-tools.js');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const BASE = '# Guide\n\nFirst paragraph.';
const WITH_IMAGE = `${BASE}\n\n![A chart](https://cdn/x.png)`;
let server;
let fetchMock;
const realFetch = globalThis.fetch;
afterAll(() => { globalThis.fetch = realFetch; });

function fakeApi() {
  mockCall.mockImplementation(async (op, params) => {
    if (op === 'mcpGetDocument') return { success: true, document: { ...server } };
    if (op === 'mcpDocumentImageUploadURL') {
      return {
        uploadUrl: 'https://storage.example/signed?sig=secret',
        uploadMethod: 'PUT',
        objectPath: 'documents/doc-1/media/abc.png',
        contentType: params.contentType,
        maxBytes: MAX_IMAGE_BYTES,
      };
    }
    if (op === 'mcpInsertDocumentImage') {
      server = { ...server, content: WITH_IMAGE, updatedAt: '2026-11-07T21:00:00Z' };
      return {
        documentId: 'doc-1', objectPath: params.objectPath, imageUrl: 'https://cdn/x.png',
        updatedAt: server.updatedAt, status: 'draft', slug: 'guide', content: WITH_IMAGE,
      };
    }
    throw new Error(`unexpected ${op}`);
  });
}

const insertBody = () => mockCall.mock.calls.find(([op]) => op === 'mcpInsertDocumentImage')?.[1];
const uploadUrlBody = () => mockCall.mock.calls.find(([op]) => op === 'mcpDocumentImageUploadURL')?.[1];
const networkCalls = () => mockCall.mock.calls.filter(([op]) => op !== 'mcpGetDocument').length + fetchMock.mock.calls.length;
const add = (over) => manageDocument({ action: 'add_image', documentId: 'doc-1', alt: 'A chart', ...over });
const docFile = () => path.join(tmp, '.ezmodo', 'docs', 'guide.md');

beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'doc-image-')));
  await fs.mkdir(path.join(tmp, '.ezmodo'));
  await fs.writeFile(path.join(tmp, 'chart.png'), PNG);
  hasCheckout = true;
  server = { id: 'doc-1', slug: 'guide', title: 'Guide', content: BASE, updatedAt: '2026-11-07T20:00:00Z' };
  mockCall.mockReset();
  fakeApi();
  fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
  globalThis.fetch = fetchMock;
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('manage_document add_image (#3449): placement', () => {
  it('appends, uploading the file\'s bytes to the signed URL first', async () => {
    const r = await add({ filePath: 'chart.png', append: true });

    expect(uploadUrlBody()).toEqual({ documentId: 'doc-1', filename: 'chart.png', contentType: 'image/png' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://storage.example/signed?sig=secret');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/png' } });
    expect(Buffer.compare(init.body, PNG)).toBe(0);
    expect(insertBody()).toEqual({
      documentId: 'doc-1', objectPath: 'documents/doc-1/media/abc.png', alt: 'A chart', append: true,
    });
    expect(r).toEqual({
      documentId: 'doc-1', imageUrl: 'https://cdn/x.png', updatedAt: '2026-11-07T21:00:00Z', status: 'draft',
    });
    expect(r.content).toBeUndefined();
  });

  it('sends afterHeading, caption and expectedUpdatedAt', async () => {
    await add({ filePath: 'chart.png', afterHeading: 'Guide', caption: 'Q3', expectedUpdatedAt: 't0' });
    expect(insertBody()).toEqual({
      documentId: 'doc-1', objectPath: 'documents/doc-1/media/abc.png', alt: 'A chart',
      caption: 'Q3', afterHeading: 'Guide', expectedUpdatedAt: 't0',
    });
  });

  it('sends afterText', async () => {
    await add({ filePath: 'chart.png', afterText: 'First paragraph.' });
    expect(insertBody()).toMatchObject({ afterText: 'First paragraph.' });
    expect(insertBody().afterHeading).toBeUndefined();
    expect(insertBody().append).toBeUndefined();
  });

  it('uses POST when the API says so (the local GCS emulator)', async () => {
    const base = mockCall.getMockImplementation();
    mockCall.mockImplementation(async (op, params) => {
      const r = await base(op, params);
      return op === 'mcpDocumentImageUploadURL' ? { ...r, uploadMethod: 'POST' } : r;
    });
    await add({ filePath: 'chart.png', append: true });
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('passes the API message through when a published doc became a draft', async () => {
    const base = mockCall.getMockImplementation();
    mockCall.mockImplementation(async (op, params) => {
      const r = await base(op, params);
      return op === 'mcpInsertDocumentImage' ? { ...r, message: 'Now a draft.' } : r;
    });
    expect((await add({ filePath: 'chart.png', append: true })).message).toBe('Now a draft.');
  });

  it('surfaces a 409 with what to do', async () => {
    mockCall.mockImplementation(async (op, params) => {
      if (op === 'mcpInsertDocumentImage') {
        const e = new Error('document doc-1 changed since you read it');
        e.status = 409;
        throw e;
      }
      return { uploadUrl: 'u', objectPath: 'p', contentType: params.contentType };
    });
    await expect(add({ filePath: 'chart.png', append: true, expectedUpdatedAt: 'old' }))
      .rejects.toMatchObject({ status: 409, message: expect.stringMatching(/changed since.*get_document/s) });
  });

  it('reports a failed upload without placing anything or leaking the URL', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const err = await add({ filePath: 'chart.png', append: true }).catch((e) => e);
    expect(err.message).toMatch(/403/);
    expect(err.message).not.toMatch(/sig=secret/);
    expect(insertBody()).toBeUndefined();
  });
});

describe('manage_document add_image: input forms', () => {
  it('takes base64 with mimeType and names it image.<ext>', async () => {
    await add({ base64: JPEG.toString('base64'), mimeType: 'image/jpeg', append: true });
    expect(uploadUrlBody()).toEqual({ documentId: 'doc-1', filename: 'image.jpg', contentType: 'image/jpeg' });
    expect(Buffer.compare(fetchMock.mock.calls[0][1].body, JPEG)).toBe(0);
  });

  it('accepts a data: URL', async () => {
    await add({ base64: `data:image/gif;base64,${GIF.toString('base64')}`, mimeType: 'image/gif', append: true });
    expect(uploadUrlBody().contentType).toBe('image/gif');
  });

  it('works without a checkout for base64', async () => {
    hasCheckout = false;
    await add({ base64: WEBP.toString('base64'), mimeType: 'image/webp', append: true });
    expect(uploadUrlBody().filename).toBe('image.webp');
  });

  it.each([
    [{}, /filePath.*or base64/],
    [{ filePath: 'chart.png', base64: PNG.toString('base64'), mimeType: 'image/png' }, /not both/],
    [{ base64: PNG.toString('base64') }, /mimeType is required/],
  ])('refuses %o before any network call', async (input, message) => {
    await expect(add({ ...input, append: true })).rejects.toThrow(message);
    expect(networkCalls()).toBe(0);
  });

  it.each([
    [{}, /needs a place/],
    [{ afterHeading: 'Guide', append: true }, /one place/],
    [{ afterHeading: 'Guide', afterText: 'First' }, /one place/],
  ])('refuses placement %o before any network call', async (placement, message) => {
    await expect(add({ filePath: 'chart.png', ...placement })).rejects.toThrow(message);
    expect(networkCalls()).toBe(0);
  });

  it.each([undefined, '', '   '])('requires alt (%p)', async (alt) => {
    await expect(add({ filePath: 'chart.png', append: true, alt })).rejects.toThrow(/alt is required/);
    expect(networkCalls()).toBe(0);
  });

  it('refuses filePath without a checkout and points at base64', async () => {
    hasCheckout = false;
    await expect(add({ filePath: 'chart.png', append: true })).rejects.toThrow(/base64/);
    expect(networkCalls()).toBe(0);
  });

  it('is refused on the remote surface', () => {
    expect(refusedRemoteArgs('manage_document', { action: 'add_image', filePath: 'x.png' })).toEqual(['filePath']);
    expect(refusedRemoteArgs('manage_document', { action: 'add_image', base64: 'x' })).toEqual([]);
  });
});

describe('manage_document add_image: what the file may be', () => {
  it('refuses a path outside the checkout', async () => {
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.png`);
    await fs.writeFile(outside, PNG);
    try {
      await expect(add({ filePath: outside, append: true })).rejects.toThrow(/outside the project checkout/);
      await expect(add({ filePath: '../x.png', append: true })).rejects.toThrow(/outside|does not exist/);
    } finally {
      await fs.rm(outside, { force: true });
    }
    expect(networkCalls()).toBe(0);
  });

  it('refuses a symlink, even one pointing inside the checkout', async () => {
    await fs.symlink(path.join(tmp, 'chart.png'), path.join(tmp, 'link.png'));
    await expect(add({ filePath: 'link.png', append: true })).rejects.toThrow(/symlink/);
    expect(networkCalls()).toBe(0);
  });

  it('refuses a symlink pointing outside', async () => {
    await fs.symlink('/etc/hostname', path.join(tmp, 'host.png'));
    await expect(add({ filePath: 'host.png', append: true })).rejects.toThrow(/outside|symlink|does not exist/);
    expect(networkCalls()).toBe(0);
  });

  it('refuses a non-image and an SVG', async () => {
    await fs.writeFile(path.join(tmp, 'notes.png'), 'just text');
    await expect(add({ filePath: 'notes.png', append: true })).rejects.toThrow(/not a PNG, JPEG, GIF or WebP/);
    await fs.writeFile(path.join(tmp, 'logo.svg'), SVG);
    await expect(add({ filePath: 'logo.svg', append: true })).rejects.toThrow(/SVG/);
    await expect(add({ base64: SVG.toString('base64'), mimeType: 'image/svg+xml', append: true })).rejects.toThrow(/SVG/);
    await expect(add({ base64: SVG.toString('base64'), mimeType: 'image/png', append: true }))
      .rejects.toThrow(/not a PNG/);
    await fs.writeFile(path.join(tmp, 'doc.txt'), PNG);
    await expect(add({ filePath: 'doc.txt', append: true })).rejects.toThrow(/\.txt file/);
    expect(networkCalls()).toBe(0);
  });

  it('refuses a type that disagrees with the bytes', async () => {
    await fs.writeFile(path.join(tmp, 'photo.jpg'), PNG);
    await expect(add({ filePath: 'photo.jpg', append: true })).rejects.toThrow(/image\/jpeg but its bytes are image\/png/);
    await expect(add({ base64: PNG.toString('base64'), mimeType: 'image/gif', append: true }))
      .rejects.toThrow(/image\/gif but its bytes are image\/png/);
    expect(networkCalls()).toBe(0);
  });

  it('refuses an image over 10 MB and an empty one', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    await fs.writeFile(path.join(tmp, 'big.png'), big);
    await expect(add({ filePath: 'big.png', append: true })).rejects.toThrow(/10 MB/);
    await expect(add({ base64: big.toString('base64'), mimeType: 'image/png', append: true })).rejects.toThrow(/10 MB/);
    await fs.writeFile(path.join(tmp, 'empty.png'), '');
    await expect(add({ filePath: 'empty.png', append: true })).rejects.toThrow(/empty/);
    expect(networkCalls()).toBe(0);
  });

  it('sniffs each supported type', () => {
    expect([PNG, JPEG, GIF, WEBP, SVG].map(sniffImageType))
      .toEqual(['image/png', 'image/jpeg', 'image/gif', 'image/webp', null]);
  });
});

describe('manage_document add_image: the .ezmodo/docs copy', () => {
  it('refuses before uploading when the downloaded file has unpushed edits', async () => {
    await getDocument({ documentId: 'doc-1' });
    await fs.writeFile(docFile(), `${BASE}\n\nMy unpushed paragraph.`);
    mockCall.mockClear();

    await expect(add({ filePath: 'chart.png', append: true })).rejects.toThrow(/never pushed.*fromFile:true/s);
    expect(networkCalls()).toBe(0);
  });

  it('rewrites the file and sidecar from the response so the next push keeps the image', async () => {
    await getDocument({ documentId: 'doc-1' });

    const r = await add({ filePath: 'chart.png', append: true });

    expect(r.localFilePath).toBe(docFile());
    expect(await fs.readFile(docFile(), 'utf-8')).toBe(WITH_IMAGE);
    const meta = JSON.parse(await fs.readFile(path.join(tmp, '.ezmodo', 'docs', 'guide.meta.json'), 'utf-8'));
    expect(meta).toMatchObject({ id: 'doc-1', updatedAt: '2026-11-07T21:00:00Z' });

    mockCall.mockClear();
    const push = await manageDocument({ action: 'update', documentId: 'doc-1', fromFile: true });
    expect(push.message).toBe('No local changes to push.');
  });

  it('leaves no file when the document was never downloaded here', async () => {
    const r = await add({ filePath: 'chart.png', append: true });
    expect(r.localFilePath).toBeUndefined();
    await expect(fs.access(docFile())).rejects.toThrow();
  });
});

describe('manage_document add_image: schema and routes', () => {
  const props = DOCUMENT_TOOLS.find((t) => t.name === 'manage_document').inputSchema.properties;

  it('offers the action and its arguments', () => {
    expect(props.action.enum).toContain('add_image');
    for (const name of ['filePath', 'base64', 'mimeType', 'alt', 'caption', 'afterHeading', 'afterText', 'append']) {
      expect(props[name]).toBeDefined();
    }
    expect(props.alt.description).toMatch(/Required/);
    expect(props.afterText.description).toMatch(/exactly once/);
    expect(props.afterHeading.description).toMatch(/without the leading #s/);
    expect(props.filePath.description).toMatch(/remote connector/);
  });

  it('maps to the API routes', () => {
    expect(ENDPOINT_MAP.mcpDocumentImageUploadURL).toEqual({ route: 'mcp/v1/documents/media/upload-url', method: 'POST' });
    expect(ENDPOINT_MAP.mcpInsertDocumentImage).toEqual({ route: 'mcp/v1/documents/images', method: 'POST' });
  });
});
