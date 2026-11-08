/**
 * Document exports as local files (E-305 #3458).
 *
 * manage_document action:"export" asks the API for a .md, .zip or .pdf. In a
 * checkout the file is written to `.ezmodo/exports/<name>` and the path comes
 * back; over the remote connector (no `.ezmodo` directory) it comes back
 * inline as base64, up to MAX_INLINE_BYTES.
 *
 * The file name comes from the API and is attacker-influenced (a document
 * title), so it is reduced to a plain name before it touches the disk, and the
 * file is created with O_EXCL | O_NOFOLLOW: an existing file, or a symlink
 * planted where the export would go, is never written through. A name that is
 * taken gets a numeric suffix instead (E-297).
 */

import fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import path from 'path';
import { ezmodoSubdir, isInside } from './local-paths.js';

/** The largest export returned inline over the remote connector. */
export const MAX_INLINE_BYTES = 5 * 1024 * 1024;

const EXTENSIONS = new Set(['.md', '.zip', '.pdf']);
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const MAX_SUFFIX = 999;

/**
 * A plain file name for an export: no directories, no traversal, no control
 * or shell-awkward characters, and an extension the export can have. Falls
 * back to `export<ext>` (the extension from contentType) when nothing usable
 * is left.
 */
export function safeExportFilename(name, contentType) {
  const fallbackExt = extensionFor(contentType);
  let base = typeof name === 'string' ? name : '';
  // Keep only the last path component, whichever separator was used.
  base = base.split(/[\\/]/).pop() ?? '';
  base = [...base].filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f).join('')
    .replace(/[<>:"|?*`$;&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // A name that is only an extension (".pdf") has no stem; any other leading
  // dots would make a hidden file.
  base = /^\.+(md|zip|pdf)$/i.test(base) ? '' : base.replace(/^\.+/, '');
  if (base.length > 120) {
    const ext = path.extname(base);
    base = base.slice(0, 120 - ext.length) + ext;
  }
  const ext = path.extname(base).toLowerCase();
  if (!EXTENSIONS.has(ext)) {
    base = (base || 'export') + fallbackExt;
  } else if (base.length === ext.length) {
    base = 'export' + ext;
  }
  return base;
}

function extensionFor(contentType) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('pdf')) return '.pdf';
  if (type.includes('zip')) return '.zip';
  return '.md';
}

/** `.ezmodo/exports`, or null when this is not a tracked checkout. */
export async function exportsRoot() {
  return ezmodoSubdir('exports');
}

function candidateName(filename, n) {
  if (n === 0) return filename;
  const ext = path.extname(filename);
  return `${filename.slice(0, filename.length - ext.length)} (${n + 1})${ext}`;
}

/**
 * Write bytes to `<root>/<filename>`, or `<name> (2).<ext>` and so on when the
 * name is taken. Never overwrites and never follows a symlink.
 */
export async function writeExportFile(root, filename, bytes) {
  for (let n = 0; n <= MAX_SUFFIX; n++) {
    const file = path.resolve(root, candidateName(filename, n));
    if (!isInside(root, file)) throw new Error(`Refusing to write ${filename} outside ${root}`);
    let handle;
    try {
      handle = await fs.open(
        file,
        fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW,
        0o644,
      );
      await handle.writeFile(bytes);
      return file;
    } catch (err) {
      if (err.code === 'EEXIST' || err.code === 'ELOOP') continue;
      throw err;
    } finally {
      await handle?.close();
    }
  }
  throw new Error(`Too many exports named ${filename} in ${root}; clear some out of .ezmodo/exports.`);
}
