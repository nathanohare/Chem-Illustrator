// @vitest-environment jsdom
//
// Check Data drawn in the Spectrum window after the structure's rows changed (issue #546): the
// CH2 protons split in two once the accurate gaps arrive, so the rows the check matched are no
// longer at the same places. The drawing uses the rows the check matched, not the current ones.

import { describe, expect, it } from 'vitest';
import { checkData, parsePeakLists, type PredictedRow } from '../src/chem/nmr/check';
import { measuredOverlay } from '../src/ui/nmr-panel';

const pred: PredictedRow[] = [
  { shift: 7.28, spread: 0.09, n: 2, mult: 'd', j: [7.9], label: 'C8, C9' },
  { shift: 4.15, spread: 0.09, n: 2, mult: 'q', j: [7.1], label: 'C2' },
  { shift: 1.25, spread: 0.09, n: 3, mult: 't', j: [7.1], label: 'C1' },
];

describe('the measured list drawn against the prediction', () => {
  it('links each peak to the predicted shift it was matched with', () => {
    const [list] = parsePeakLists('1H NMR (400 MHz, CDCl3) δ 7.30 (d, J = 8.7 Hz, 2H), 4.17 (s, 2H), 1.27 (t, J = 7.1 Hz, 3H), 2.17 (s, 3H)');
    const res = checkData(list, pred);
    // the structure's rows at the time (a quaternary carbon's row, with no H, between them) …
    const basis = [{ h1: { value: 7.28 } }, { h1: null }, { h1: { value: 4.15 } }, { h1: { value: 1.25 } }];
    const r = { list, res, pred, rowIdx: [0, 2, 3], basis };
    // … which have since changed: before, the drawing read the current rows by these places and failed on a null shift
    const o = measuredOverlay(r, '1H', 400);
    expect(o.links.map((l) => [l.m, l.p])).toEqual([[7.3, 7.28], [4.17, 4.15], [1.27, 1.25]]);
    expect(o.marks.some((m) => m.text === 's vs q')).toBe(true);
    expect(o.marks.some((m) => m.text.startsWith('extra'))).toBe(true);
  });
});
