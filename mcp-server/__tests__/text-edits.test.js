import { applyEdits, computeEdits, countOccurrences, diffLines } from '../lib/text-edits.js';

const doc = ['# Title', '', 'First paragraph.', '', 'Second paragraph.', '', '- one', '- two'].join('\n');

describe('computeEdits (E-304 #3453)', () => {
  it('returns nothing when nothing changed', () => {
    expect(computeEdits(doc, doc)).toEqual([]);
  });

  it('sends only the changed line, not the document', () => {
    const local = doc.replace('Second paragraph.', 'Second paragraph, reworded.');
    const edits = computeEdits(doc, local);
    expect(edits).toEqual([{ oldString: 'Second paragraph.\n', newString: 'Second paragraph, reworded.\n' }]);
    expect(applyEdits(doc, edits)).toBe(local);
  });

  it('makes one edit per separate change', () => {
    const local = doc.replace('First paragraph.', 'First!').replace('- two', '- two\n- three');
    const edits = computeEdits(doc, local);
    expect(edits).toHaveLength(2);
    expect(applyEdits(doc, edits)).toBe(local);
  });

  it('widens an ambiguous line with context until it matches once', () => {
    const base = 'A\n\nsame\n\nB\n\nsame\n\nC';
    const local = 'A\n\nsame\n\nB\n\nchanged\n\nC';
    const edits = computeEdits(base, local);
    expect(edits).toHaveLength(1);
    expect(countOccurrences(base, edits[0].oldString)).toBe(1);
    expect(applyEdits(base, edits)).toBe(local);
  });

  it('handles insertions, deletions at the end, and a whole rewrite', () => {
    for (const local of [
      doc + '\n\nNew last paragraph.',
      doc.split('\n').slice(0, -2).join('\n'),
      'Completely different.',
      '',
      'Prefix line\n' + doc,
    ]) {
      expect(applyEdits(doc, computeEdits(doc, local))).toBe(local);
    }
  });

  it('always reproduces the local text exactly (random edits)', () => {
    let seed = 7;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const words = ['alpha', 'beta', 'gamma', '', 'beta', '- item', '# Head', 'alpha'];
    for (let run = 0; run < 400; run++) {
      const base = Array.from({ length: 1 + rnd(12) }, () => words[rnd(words.length)]);
      const local = [...base];
      for (let k = 0; k < 1 + rnd(4); k++) {
        const op = rnd(3);
        const at = rnd(local.length + 1);
        if (op === 0) local.splice(at, 0, words[rnd(words.length)]);
        else if (op === 1 && local.length > 0) local.splice(Math.min(at, local.length - 1), 1);
        else if (local.length > 0) local[Math.min(at, local.length - 1)] = words[rnd(words.length)] + rnd(9);
      }
      const b = base.join('\n');
      const l = local.join('\n');
      const edits = computeEdits(b, l);
      expect(applyEdits(b, edits)).toBe(l);
    }
  });
});

describe('diffLines', () => {
  it('finds separate changed ranges', () => {
    expect(diffLines(['a', 'b', 'c', 'd'], ['a', 'B', 'c', 'D'])).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
      { aStart: 3, aEnd: 4, bStart: 3, bEnd: 4 },
    ]);
  });
});

describe('applyEdits', () => {
  it('refuses an edit that matches twice, like the API', () => {
    expect(applyEdits('x y x', [{ oldString: 'x', newString: 'z' }])).toBeNull();
  });
});
