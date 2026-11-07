/**
 * Turn "the document as downloaded" and "the document as the agent left it"
 * into targeted edits for manage_document update (E-304 #3453).
 *
 * The API applies edits in order, and each oldString must occur exactly once
 * in the text at its turn (#3452). Only the blocks an edit touches are rebuilt
 * on the server, so the smaller the edits, the more of the document (and the
 * comments anchored to it) is left alone. computeEdits finds the changed line
 * ranges, widens each with surrounding lines until it is unambiguous, and
 * checks the whole sequence the way the server will before returning it.
 */

/** Past this many line pairs in the changed middle, skip the LCS: one hunk. */
const LCS_CELL_LIMIT = 4_000_000;

/** Count non-overlapping occurrences, as Go's strings.Count does. */
export function countOccurrences(text, needle) {
  if (!needle) return 0;
  let n = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) n++;
  return n;
}

/**
 * Apply edits the way the API does: in order, each oldString exactly once.
 * Returns the result, or null when a step would be refused.
 */
export function applyEdits(text, edits) {
  let out = text;
  for (const { oldString, newString } of edits) {
    if (!oldString || oldString === newString || countOccurrences(out, oldString) !== 1) return null;
    out = out.replace(oldString, () => newString);
  }
  return out;
}

/**
 * Changed line ranges between a and b (arrays of lines), as
 * [{aStart, aEnd, bStart, bEnd}] with end exclusive, in order.
 */
export function diffLines(a, b) {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const am = a.slice(pre, a.length - suf);
  const bm = b.slice(pre, b.length - suf);
  if (am.length === 0 && bm.length === 0) return [];
  if (am.length * bm.length > LCS_CELL_LIMIT || am.length === 0 || bm.length === 0) {
    return [{ aStart: pre, aEnd: pre + am.length, bStart: pre, bEnd: pre + bm.length }];
  }

  // LCS lengths, then walk to collect runs of differing lines.
  const n = am.length;
  const m = bm.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = am[i] === bm[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0;
  let j = 0;
  let open = null;
  const close = () => {
    if (open) {
      hunks.push({ aStart: pre + open.i, aEnd: pre + i, bStart: pre + open.j, bEnd: pre + j });
      open = null;
    }
  };
  while (i < n || j < m) {
    if (i < n && j < m && am[i] === bm[j]) {
      close();
      i++;
      j++;
    } else {
      if (!open) open = { i, j };
      if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) j++;
      else i++;
    }
  }
  close();
  return hunks;
}

/** Offset of each line's first character in lines.join("\n"), plus the end. */
function lineOffsets(lines) {
  const at = [0];
  for (const l of lines) at.push(at.at(-1) + l.length + 1);
  at[at.length - 1] -= 1; // no "\n" after the last line
  return at;
}

/**
 * The characters lines [s, e) cover, with one line break: the one after the
 * range, or before it when the range runs to the end. That way deleting or
 * inserting whole lines never leaves a blank line behind or glues two lines
 * together.
 */
function lineRegion(text, at, n, s, e) {
  if (e < n) return text.slice(at[s], at[e]);
  return text.slice(s > 0 ? at[s] - 1 : 0);
}

/**
 * One hunk as an edit, widened by `ctx` unchanged lines on each side. The
 * unchanged lines around a hunk are the same in both texts, so widening by
 * the same count on each side keeps the two regions aligned.
 */
function hunkEdit(t, h, ctx) {
  const { a, b, aText, bText, aAt, bAt } = t;
  const as = Math.max(0, h.aStart - ctx);
  const ae = Math.min(a.length, h.aEnd + ctx);
  const bs = h.bStart - (h.aStart - as);
  const be = h.bEnd + (ae - h.aEnd);
  let oldString = lineRegion(aText, aAt, a.length, as, ae);
  let newString = lineRegion(bText, bAt, b.length, bs, be);
  // A range running to the end borrows the line break before it, which only
  // matters when one side is empty (lines appended or removed at the end). A
  // replacement doesn't need it, and leaving it out keeps the edit readable.
  if (oldString.length > 1 && newString.length > 1 && oldString[0] === '\n' && newString[0] === '\n') {
    oldString = oldString.slice(1);
    newString = newString.slice(1);
  }
  return { oldString, newString };
}

/**
 * Edits that turn `base` into `local`, each unambiguous at its turn. Returns
 * [] when nothing changed. Always returns edits that applyEdits(base) turns
 * into exactly `local`: when the per-hunk edits cannot be made unambiguous it
 * falls back to a single edit spanning every change.
 */
export function computeEdits(base, local) {
  if (base === local) return [];
  const a = base.split('\n');
  const b = local.split('\n');
  const hunks = diffLines(a, b);
  if (hunks.length === 0) return [];

  const t = { a, b, aText: base, bText: local, aAt: lineOffsets(a), bAt: lineOffsets(b) };

  const perHunk = widenEach(t, hunks);
  if (perHunk && applyEdits(base, perHunk) === local) return perHunk;

  const all = { aStart: hunks[0].aStart, aEnd: hunks.at(-1).aEnd, bStart: hunks[0].bStart, bEnd: hunks.at(-1).bEnd };
  const one = widenEach(t, [all]);
  if (one && applyEdits(base, one) === local) return one;

  // The whole text as one edit always applies (it occurs exactly once).
  return [{ oldString: base, newString: local }];
}

/**
 * Widen each hunk until its oldString is non-empty and occurs once in the
 * text it will be applied to (earlier edits already applied).
 */
function widenEach(t, hunks) {
  const edits = [];
  let text = t.aText;
  for (const h of hunks) {
    let edit = null;
    for (let ctx = 0; ctx <= Math.max(t.a.length, t.b.length); ctx++) {
      const e = hunkEdit(t, h, ctx);
      if (e.oldString && e.oldString !== e.newString && countOccurrences(text, e.oldString) === 1) {
        edit = e;
        break;
      }
    }
    if (!edit) return null;
    edits.push(edit);
    text = text.replace(edit.oldString, () => edit.newString);
  }
  return edits;
}
