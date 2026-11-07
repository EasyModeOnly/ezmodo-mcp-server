/**
 * Version history params shared by get_document and get_design (E-300 #3409).
 *
 * Both tools take the same four ways in: list the history, read one entry,
 * diff two entries (or one entry against the current version), and for
 * documents only the legacy `versionNumber`. This module decides which one a
 * call asked for and checks the combination, so the two handlers cannot drift
 * apart on what is allowed. The HTTP calls stay in the handlers.
 */

/**
 * Which history read the args ask for, or null when they ask for none.
 * Precedence: diff, then one entry, then the N-th newest, then the list.
 * Throws when the combination cannot mean anything.
 */
export function historyMode(args) {
  const { includeHistory, includeVersions, historyEntryId, versionNumber, diffFrom, diffTo } = args;
  if (diffTo != null && diffFrom == null) {
    throw new Error('diffTo needs diffFrom: pass the older historyEntryId as diffFrom (diffTo omitted = current).');
  }
  if (diffFrom != null) {
    if (historyEntryId != null || versionNumber != null) {
      throw new Error('Pass either diffFrom/diffTo or historyEntryId/versionNumber, not both.');
    }
    return 'diff';
  }
  if (historyEntryId != null) {
    if (versionNumber != null) throw new Error('Pass either historyEntryId or versionNumber, not both.');
    return 'entry';
  }
  if (versionNumber != null) {
    if (!Number.isInteger(versionNumber) || versionNumber < 1) {
      throw new Error('versionNumber must be a whole number, 1 or more (1 = the newest version).');
    }
    return 'nth';
  }
  if (includeHistory || includeVersions) return 'list';
  return null;
}

/**
 * A history entry without its bodies, plus their combined size, so a list of
 * fifty versions does not carry fifty copies of the content.
 */
export function summarizeEntry(entry, contentFields) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  let size = 0;
  let had = false;
  for (const field of contentFields) {
    if (field in out) {
      had = true;
      size += typeof out[field] === 'string' ? out[field].length : 0;
      delete out[field];
    }
  }
  if (had) out.size = size;
  return out;
}

/** Message for a restore refused because the target changed since it was read. */
export function staleRestoreMessage(kind, id, cause) {
  return (
    `${cause ? `${cause}. ` : ''}Nothing was restored: the ${kind} changed since you read it. ` +
    `Re-read it (get_${kind} ${kind}Id:"${id}"), check the version you want is still the right one, ` +
    'then retry the restore with the new updatedAt as expectedUpdatedAt.'
  );
}
