/**
 * Images for manage_document action:"add_image" (#3449).
 *
 * The agent hands over an image as a local file (in a checkout) or as base64
 * (over the remote connector). Everything here runs before any network call,
 * so a bad argument, a file outside the checkout or bytes that are not an
 * image never cost an upload: the API refuses the same types, but by then the
 * agent has already been handed a signed URL for nothing.
 *
 * The type sent to the API is the one the bytes say, never the one the
 * caller claims: a `.png` that is really an SVG is exactly the case the
 * allow-list exists to stop (SVG can carry script).
 */

import path from 'path';
import { findConfigPath } from './local-cache.js';
import { readBytesNoFollow, resolveInsideRoot } from './local-paths.js';

/** The API's limit for document images. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXTENSION_BY_TYPE = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
});

const TYPE_BY_EXTENSION = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
});

const SUPPORTED = 'PNG, JPEG, GIF or WebP';

/** The image type the bytes start with, or null when they are none we accept. */
export function sniffImageType(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

const present = (v) => v !== undefined && v !== null && v !== false && v !== '';

/**
 * Check the arguments' shape: exactly one input form, exactly one placement,
 * a non-empty alt. Throws a message the agent can act on.
 */
export function validateAddImageArgs(args) {
  if (!args.documentId) throw new Error('documentId is required for add_image');

  const inputs = ['filePath', 'base64'].filter((k) => present(args[k]));
  if (inputs.length !== 1) {
    throw new Error(
      inputs.length === 0
        ? 'add_image needs the image: pass filePath (a file in this checkout) or base64 (with mimeType).'
        : 'add_image takes one image: pass filePath or base64, not both.'
    );
  }
  if (inputs[0] === 'base64' && !present(args.mimeType)) {
    throw new Error(`mimeType is required with base64 (${SUPPORTED}: image/png, image/jpeg, image/gif, image/webp).`);
  }

  const placements = ['afterHeading', 'afterText', 'append'].filter((k) => present(args[k]));
  if (placements.length !== 1) {
    throw new Error(
      placements.length === 0
        ? 'add_image needs a place: pass afterHeading, afterText, or append:true.'
        : `add_image takes one place; got ${placements.join(' and ')}. ` +
          'Pass only one of afterHeading, afterText, append.'
    );
  }
  if (args.append !== undefined && args.append !== true && placements[0] === 'append') {
    throw new Error('append must be true.');
  }

  if (typeof args.alt !== 'string' || args.alt.trim() === '') {
    throw new Error('alt is required: describe what the image shows, for readers who cannot see it.');
  }
}

/**
 * The image's bytes, filename and sniffed content type, from filePath or
 * base64. Refuses anything that is not a supported image, is empty or too
 * big, or (for filePath) is outside the checkout or a symlink.
 */
export async function loadImage(args) {
  const loaded = present(args.filePath) ? await readLocalImage(args.filePath) : decodeBase64Image(args);
  const { bytes, claimedType, source } = loaded;

  if (bytes.length === 0) throw new Error(`${source} is empty.`);
  if (bytes.length > MAX_IMAGE_BYTES) throw tooBig(source, bytes.length);

  const contentType = sniffImageType(bytes);
  if (!contentType) {
    throw new Error(`${source} is not a ${SUPPORTED} image. Only those types can be placed in a document (no SVG).`);
  }
  if (claimedType && claimedType !== contentType) {
    throw new Error(
      `${source} says ${claimedType} but its bytes are ${contentType}. ` +
        'Fix the mimeType or file extension to match the image.'
    );
  }
  const filename = loaded.filename ?? `image.${EXTENSION_BY_TYPE[contentType]}`;
  return { bytes, contentType, filename };
}

function tooBig(source, size) {
  return new Error(
    `${source} is ${(size / (1024 * 1024)).toFixed(1)} MB; document images are limited to 10 MB.`
  );
}

/** The type a caller names: a mimeType or a file extension. Throws on an unsupported one. */
function claimedTypeFromMime(mimeType) {
  const t = String(mimeType).trim().toLowerCase();
  const normalized = t === 'image/jpg' ? 'image/jpeg' : t;
  if (normalized === 'image/svg+xml') {
    throw new Error('SVG images are not accepted (they can carry script). Convert it to PNG first.');
  }
  if (!EXTENSION_BY_TYPE[normalized]) {
    throw new Error(`mimeType ${mimeType} is not supported; send ${SUPPORTED}.`);
  }
  return normalized;
}

function claimedTypeFromName(name) {
  const ext = path.extname(name).slice(1).toLowerCase();
  if (ext === '') return null;
  if (ext === 'svg') {
    throw new Error('SVG images are not accepted (they can carry script). Convert it to PNG first.');
  }
  const type = TYPE_BY_EXTENSION[ext];
  if (!type) throw new Error(`${name} is a .${ext} file; only ${SUPPORTED} images can be placed in a document.`);
  return type;
}

function decodeBase64Image({ base64, mimeType }) {
  const claimedType = claimedTypeFromMime(mimeType);
  if (typeof base64 !== 'string') throw new Error('base64 must be a string.');
  // Tolerate a data: URL and line breaks, nothing else: Buffer.from skips
  // characters it does not know, which would hide a truncated paste.
  const data = base64.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)) throw new Error('base64 is not valid base64.');
  if (Math.floor((data.length * 3) / 4) > MAX_IMAGE_BYTES + 2) {
    throw tooBig('The image', Math.floor((data.length * 3) / 4));
  }
  return { bytes: Buffer.from(data, 'base64'), claimedType, source: 'The base64 image' };
}

/**
 * A file inside the checkout, read without following a symlink. Relative
 * paths resolve against the checkout root (the directory holding .ezmodo).
 */
async function readLocalImage(filePath) {
  const configPath = await findConfigPath();
  if (!configPath) {
    throw new Error(
      'filePath needs a local checkout with a .ezmodo directory, and there is none here. ' +
        'Send the image as base64 (with mimeType) instead.'
    );
  }
  if (typeof filePath !== 'string' || filePath.includes('\0')) throw new Error('filePath must be a path.');
  const root = path.dirname(path.dirname(configPath));
  const lexical = path.resolve(root, filePath);
  const claimedType = claimedTypeFromName(lexical);

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
    bytes = await readBytesNoFollow(lexical, { maxBytes: MAX_IMAGE_BYTES });
  } catch (err) {
    if (err.code === 'ETOOBIG') throw tooBig(filePath, err.size);
    throw err;
  }
  return { bytes, claimedType, source: filePath, filename: path.basename(lexical) };
}

/**
 * Upload the bytes to the signed URL the API handed out. PUT for GCS; the
 * local GCS emulator takes a POST with the bytes as the body (see
 * uploadToSignedUrl in web/src/services/storage.service.ts). The URL is a
 * credential, so it is never put in an error.
 */
export async function uploadImageBytes({ uploadUrl, uploadMethod, contentType }, bytes, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(uploadUrl, {
    method: uploadMethod || 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  });
  if (!response.ok) {
    throw new Error(`Image upload failed with status ${response.status}. Nothing was placed in the document.`);
  }
}
