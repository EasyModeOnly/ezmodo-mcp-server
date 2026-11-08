/**
 * Markdown import for manage_document action:"import" (#3456).
 *
 * The agent hands over one .md/.markdown file or a .zip of them, either as a
 * file in the checkout or as base64 + name (over the remote connector). This
 * side only checks the arguments and reads the bytes; the API unpacks, plans
 * and writes, so the rules about what becomes a document live in one place.
 *
 * Everything here runs before any network call, so a bad argument or a file
 * outside the checkout never costs a large upload.
 */

import path from 'path';
import { findConfigPath } from './local-cache.js';
import { readBytesNoFollow, resolveInsideRoot } from './local-paths.js';

/**
 * The largest file one import can send. The API takes 30 MB, but this side
 * sends base64 in JSON (4/3 larger), and Cloud Run refuses request bodies over
 * 32 MiB, so 22 MB is the most that arrives.
 */
export const MAX_IMPORT_BYTES = 22 * 1024 * 1024;

export const IMPORT_EXTENSIONS = Object.freeze(['.md', '.markdown', '.zip']);

const present = (v) => v !== undefined && v !== null && v !== false && v !== '';

function checkExtension(name, label) {
  const ext = path.extname(name).toLowerCase();
  if (!IMPORT_EXTENSIONS.includes(ext)) {
    throw new Error(
      `${label} must be a .md, .markdown or .zip file; got ${ext ? `a ${ext} file` : 'no extension'}.`
    );
  }
}

function tooBig(source, size) {
  return new Error(
    `${source} is ${(size / (1024 * 1024)).toFixed(1)} MB; an import over MCP is limited to 22 MB (use the web for up to 30 MB). ` +
      'Split it into smaller zips.'
  );
}

/** Check the arguments' shape. Throws a message the agent can act on. */
export function validateImportArgs(args) {
  if (!present(args.projectId)) throw new Error('projectId is required for import.');
  if (args.dryRun !== undefined && typeof args.dryRun !== 'boolean') {
    throw new Error('dryRun must be true or false.');
  }
  const inputs = ['filePath', 'base64'].filter((k) => present(args[k]));
  if (inputs.length !== 1) {
    throw new Error(
      inputs.length === 0
        ? 'import needs the file: pass filePath (a .md, .markdown or .zip in this checkout) or base64 + name.'
        : 'import takes one file: pass filePath or base64 + name, not both.'
    );
  }
  if (inputs[0] === 'base64') {
    if (typeof args.name !== 'string' || args.name.trim() === '') {
      throw new Error('name is required with base64: the file\'s name, e.g. "handbook.zip" or "guide.md".');
    }
    checkExtension(args.name.trim(), 'name');
  }
}

/** The file's name and bytes, from filePath or base64 + name. */
export async function loadImportFile(args) {
  const loaded = present(args.filePath) ? await readLocalImport(args.filePath) : decodeBase64Import(args);
  if (loaded.bytes.length === 0) throw new Error(`${loaded.source} is empty.`);
  if (loaded.bytes.length > MAX_IMPORT_BYTES) throw tooBig(loaded.source, loaded.bytes.length);
  return { name: loaded.name, bytes: loaded.bytes };
}

function decodeBase64Import({ base64, name }) {
  if (typeof base64 !== 'string') throw new Error('base64 must be a string.');
  // Tolerate a data: URL and line breaks, nothing else: Buffer.from skips
  // characters it does not know, which would hide a truncated paste.
  const data = base64.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)) throw new Error('base64 is not valid base64.');
  const decodedSize = Math.floor((data.length * 3) / 4);
  if (decodedSize > MAX_IMPORT_BYTES + 2) throw tooBig('The base64 file', decodedSize);
  return { bytes: Buffer.from(data, 'base64'), name: path.basename(name.trim()), source: 'The base64 file' };
}

/**
 * A file inside the checkout, read without following a symlink. Relative
 * paths resolve against the checkout root (the directory holding .ezmodo).
 */
async function readLocalImport(filePath) {
  const configPath = await findConfigPath();
  if (!configPath) {
    throw new Error(
      'filePath needs a local checkout with a .ezmodo directory, and there is none here. ' +
        'Send the file as base64 with its name instead.'
    );
  }
  if (typeof filePath !== 'string' || filePath.includes('\0')) throw new Error('filePath must be a path.');
  const root = path.dirname(path.dirname(configPath));
  const lexical = path.resolve(root, filePath);
  checkExtension(lexical, 'filePath');

  try {
    // Follows links, so a link (or a linked directory) pointing outside the
    // checkout is refused here even though its own path is inside.
    await resolveInsideRoot(filePath, root);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`${filePath} does not exist.`);
    throw err;
  }

  let bytes;
  try {
    // O_NOFOLLOW: the file itself must not be a symlink, even one that
    // points inside the checkout.
    bytes = await readBytesNoFollow(lexical, { maxBytes: MAX_IMPORT_BYTES });
  } catch (err) {
    if (err.code === 'ETOOBIG') throw tooBig(filePath, err.size);
    throw err;
  }
  return { bytes, name: path.basename(lexical), source: filePath };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One line saying what the import did (or, for a dry run, would do). */
export function summarizeImport(report) {
  const c = report?.created || {};
  const counts = [
    plural(c.documents ?? 0, 'document'),
    plural(c.folders ?? 0, 'folder'),
    plural(c.images ?? 0, 'image'),
  ].join(', ');
  const extras = [];
  if (report?.linksRewritten) extras.push(`${plural(report.linksRewritten, 'link')} rewritten`);
  const renamed = (report?.documents || []).filter((d) => d.renamed).length +
    (report?.folders || []).filter((f) => f.renamed).length;
  if (renamed) extras.push(`${renamed} renamed to avoid a clash`);
  if (report?.skipped?.length) extras.push(`${report.skipped.length} skipped`);
  if (report?.notCarried?.length) extras.push(`${report.notCarried.length} not carried over (see notCarried)`);
  const tail = extras.length ? `; ${extras.join(', ')}` : '';
  return report?.dryRun
    ? `Dry run, nothing written: would create ${counts}${tail}. Call again without dryRun to import.`
    : `Imported ${counts} (documents are drafts)${tail}.`;
}
