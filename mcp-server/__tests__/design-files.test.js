import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

let tmp;
const mockFindConfigPath = jest.fn(async () => path.join(tmp, '.ezmodo', 'config.json'));
jest.unstable_mockModule('../lib/local-cache.js', () => ({ findConfigPath: mockFindConfigPath }));

const { writeDesignFiles, readDesignFiles, recordPushed, setAsideAndRefresh } =
  await import('../lib/design-files.js');

const design = (over = {}) => ({
  id: 'des-12345678-aaaa', organizationId: 'org', kind: 'component', name: 'Button', slug: 'button',
  status: 'draft', html: '<button>Go</button>', css: '.b{}', description: 'A button', updatedAt: 'v1',
  ...over,
});

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'design-files-'));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('design files (E-279 #3051)', () => {
  it('writes each field to its file under .ezmodo/designs/<slug>', async () => {
    const w = await writeDesignFiles(design());
    expect(w.dir).toBe(path.join(tmp, '.ezmodo', 'designs', 'button'));
    expect(await fs.readFile(w.files.html, 'utf-8')).toBe('<button>Go</button>');
    expect(await fs.readFile(w.files.css, 'utf-8')).toBe('.b{}');
    expect(await fs.readFile(w.files.description, 'utf-8')).toBe('A button');
  });

  it('returns null with no .ezmodo directory', async () => {
    mockFindConfigPath.mockResolvedValueOnce(null);
    expect(await writeDesignFiles(design())).toBeNull();
  });

  it('gives a second design with the same slug its own directory', async () => {
    const a = await writeDesignFiles(design());
    const b = await writeDesignFiles(design({ id: 'des-87654321-bbbb' }));
    expect(b.dir).not.toBe(a.dir);
    expect(path.basename(b.dir)).toBe('button-des-8765');
  });

  it('reads back only what was edited, and never overwrites unpushed edits', async () => {
    const w = await writeDesignFiles(design());
    await fs.writeFile(w.files.html, '<button>Stop</button>');

    const local = await readDesignFiles('des-12345678-aaaa');
    expect(local.changed).toEqual(['html']);
    expect(local.meta.updatedAt).toBe('v1');

    const again = await writeDesignFiles(design({ html: '<button>Server</button>', updatedAt: 'v2' }));
    expect(again.localChanges).toEqual(['html']);
    expect(await fs.readFile(w.files.html, 'utf-8')).toBe('<button>Stop</button>');

    await writeDesignFiles(design({ html: '<button>Server</button>' }), { overwriteLocal: true });
    expect(await fs.readFile(w.files.html, 'utf-8')).toBe('<button>Server</button>');
  });

  it('after a push, the files count as unchanged at the new version', async () => {
    const w = await writeDesignFiles(design());
    await fs.writeFile(w.files.css, '.b{color:red}');
    const local = await readDesignFiles('des-12345678-aaaa');
    await recordPushed(local.dir, local.meta, local.fields, 'v2');

    const after = await readDesignFiles('des-12345678-aaaa');
    expect(after.changed).toEqual([]);
    expect(after.meta.updatedAt).toBe('v2');
  });

  it('on a conflict, sets the agent\'s version aside and writes the latest', async () => {
    const w = await writeDesignFiles(design());
    await fs.writeFile(w.files.css, '.mine{}');
    const mine = await setAsideAndRefresh(w.dir, design({ css: '.theirs{}', updatedAt: 'v3' }));

    expect(await fs.readFile(mine.css, 'utf-8')).toBe('.mine{}');
    expect(path.basename(mine.css)).toBe('styles.mine.css');
    expect(await fs.readFile(w.files.css, 'utf-8')).toBe('.theirs{}');
    const after = await readDesignFiles('des-12345678-aaaa');
    expect(after.changed).toEqual([]);
    expect(after.meta.updatedAt).toBe('v3');
  });

  it('explains what to do when the design was never downloaded', async () => {
    await expect(readDesignFiles('nope')).rejects.toThrow(/get_design designId:"nope"/);
  });
});

// E-297 #3351: a cloned repo can commit files under .ezmodo/designs. None of
// them may be followed out of the checkout, in either direction.
describe('design files never follow symlinks (E-297)', () => {
  let outside;
  beforeEach(async () => {
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'design-outside-'));
    await fs.writeFile(path.join(outside, 'id_ed25519'), 'PRIVATE KEY');
  });
  afterEach(async () => {
    await fs.rm(outside, { recursive: true, force: true });
  });

  async function plant(files) {
    const dir = path.join(tmp, '.ezmodo', 'designs', 'planted');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'design.json'), JSON.stringify({ id: 'des-victim', hashes: {} }));
    for (const [name, target] of Object.entries(files)) await fs.symlink(target, path.join(dir, name));
    return dir;
  }

  it('refuses to read a planted index.html that links to a private key', async () => {
    await plant({ 'index.html': path.join(outside, 'id_ed25519') });
    await expect(readDesignFiles('des-victim')).rejects.toThrow('symlink');
  });

  it('refuses to write through a planted link, leaving its target untouched', async () => {
    await plant({ 'index.html': path.join(outside, 'id_ed25519') });
    await expect(writeDesignFiles(design({ id: 'des-victim' }), { overwriteLocal: true })).rejects.toThrow('symlink');
    expect(await fs.readFile(path.join(outside, 'id_ed25519'), 'utf-8')).toBe('PRIVATE KEY');
  });

  it('refuses a design directory that is a link out of the checkout', async () => {
    await fs.mkdir(path.join(tmp, '.ezmodo', 'designs'), { recursive: true });
    await fs.symlink(outside, path.join(tmp, '.ezmodo', 'designs', 'button'));
    await expect(writeDesignFiles(design())).rejects.toThrow('outside');
    expect(await fs.readdir(outside)).toEqual(['id_ed25519']);
  });

  it('refuses a .ezmodo/designs that is itself a link out of the checkout', async () => {
    await fs.mkdir(path.join(tmp, '.ezmodo'), { recursive: true });
    await fs.symlink(outside, path.join(tmp, '.ezmodo', 'designs'));
    await expect(writeDesignFiles(design())).rejects.toThrow('outside');
    expect(await fs.readdir(outside)).toEqual(['id_ed25519']);
  });
});
