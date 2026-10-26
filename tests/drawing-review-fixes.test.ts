// @vitest-environment jsdom
//
// Drawing-core fixes from the code review: the "text is chemistry" marks during a drag.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { captionReading } from '../src/chem/species';
import { plainMeasure } from '../src/chem/reaction';

const L = new Doc().style.bondLength;

/** Rows of six rings joined by five arrows with "THF" over each, and a number under each ring. */
function scheme(rows: number) {
  const doc = new Doc();
  let mover = 0;
  const cap = (x: number, y: number, text: string) => doc.addCaption({ x, y, runs: [{ text }], justify: 'left' });
  doc.edit('scheme', () => {
    for (let row = 0; row < rows; row++) for (let col = 0; col < 6; col++) {
      const cx = col * 10 * L, cy = row * 8 * L;
      const ids: number[] = [];
      for (let k = 0; k < 6; k++) ids.push(doc.addAtom(cx + L * Math.cos((k * Math.PI) / 3), cy + L * Math.sin((k * Math.PI) / 3)).id);
      for (let k = 0; k < 6; k++) doc.addBond(ids[k], ids[(k + 1) % 6], k % 2 ? 2 : 1);
      if (!mover) mover = ids[0];
      cap(cx - L / 2, cy + 2.2 * L, `${row + 1}${'abcdef'[col]}`);
      if (col < 5) {
        doc.addArrow({ tail: { x: cx + 2 * L, y: cy }, head: { x: cx + 8 * L, y: cy }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 4, headWidth: 1.5 });
        cap(cx + 4 * L, cy - 0.6 * L, 'THF');
      }
    }
  });
  return { doc, mover };
}

describe('text read as chemistry, during a drag', () => {
  it('does not rescan the whole drawing once per arrow on every move', () => {
    const { doc, mover } = scheme(20); // 120 structures, 100 reaction arrows, 220 text boxes
    const m = plainMeasure(doc);
    const label = [...doc.captions.values()][0];
    let scans = 0;
    const fragments = doc.fragments.bind(doc);
    doc.fragments = () => { scans++; return fragments(); };
    const frag = [...doc.fragmentOf(mover)];
    doc.begin('Move');
    for (let i = 0; i < 10; i++) {
      doc.moveAtoms(frag, 0.3, 0.2);
      captionReading(doc, label, m); // what the renderer's chemistry mark asks for, per paint
    }
    doc.commit();
    expect(scans).toBeLessThanOrEqual(10);
    // once the step is done, worked out again (once) for where the structure is now
    const during = scans;
    captionReading(doc, label, m);
    captionReading(doc, label, m);
    expect(scans).toBe(during + 1);
  });

  it('still sees text moved away from an arrow during the drag, and structures once it ends', () => {
    const { doc, mover } = scheme(1);
    const m = plainMeasure(doc);
    const thf = [...doc.captions.values()].find((c) => c.runs[0].text === 'THF')!;
    expect(captionReading(doc, thf, m)).toMatchObject({ species: null, why: 'arrow' });
    // the THF box dragged far below everything: read as a species straight away
    doc.begin('Move');
    doc.updateCaption(thf.id, { y: thf.y + 40 * L });
    expect(captionReading(doc, doc.captions.get(thf.id)!, m).species).not.toBeNull();
    doc.commit();
    // put back over its arrow, then the arrow's structures moved: worked out again once the step is done
    doc.undo();
    expect(captionReading(doc, doc.captions.get(thf.id)!, m).species).toBeNull();
    const frag = [...doc.fragmentOf(mover)];
    doc.begin('Move');
    doc.moveAtoms(frag, 0, 0.5);
    doc.commit();
    expect(captionReading(doc, doc.captions.get(thf.id)!, m).species).toBeNull();
  });
});
