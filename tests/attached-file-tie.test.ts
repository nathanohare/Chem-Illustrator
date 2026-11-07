// @vitest-environment jsdom
//
// A label tied to a structure keeps that structure when the file is opened again (issue #573).
// The file now names one of the structure's atoms; before, the structure was guessed as the one
// nearest the label, and in a figure packed tight that could be the next row's, so the label
// jumped there at the next change (Number Compounds, a move).

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { POINTS } from '../src/editor/arrange';
import { refitAttached, placeAttached, attachTag, attachedNode, attachFromTag } from '../src/editor/attached';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';

/** Two structures one above the other, and a label well below the top one: nearer the bottom one. */
function figure() {
  const doc = new Doc();
  doc.beforeCommit = (before) => refitAttached(doc, before, POINTS);
  let top: number[] = [], bottom: number[] = [];
  doc.edit('Draw', () => {
    const chain = (y: number) => {
      const a = doc.addAtom(0, y), b = doc.addAtom(20, y), c = doc.addAtom(20, y + 10);
      doc.addBond(a.id, b.id);
      doc.addBond(b.id, c.id);
      return [a.id, b.id, c.id];
    };
    top = chain(0);
    bottom = chain(30);
  });
  doc.edit('Label', () => {
    const c = doc.addCaption({ x: 0, y: 0, runs: [{ text: '3a' }], justify: 'center', attach: { atoms: [...top], side: 'below', gap: 14, shift: 0, role: 'label' } });
    placeAttached(doc, c, POINTS);
  });
  return { doc, top, bottom };
}

const label = (d: Doc) => [...d.captions.values()].find((c) => c.attach)!;

describe('a tied label saved in CDXML', () => {
  it('names an atom of its structure', () => {
    const tag = attachTag({ atoms: [1, 2], side: 'below', gap: 3, shift: 0, role: 'label' }, '17');
    expect(attachedNode(tag)).toBe('17');
    expect(attachFromTag(tag)).toEqual({ atoms: [], side: 'below', gap: 3, shift: 0, role: 'label' });
    expect(attachedNode('{"side":"below"}')).toBeUndefined();
    expect(attachedNode('not json')).toBeUndefined();
  });

  it('is tied to the same structure when opened again, though it sits nearer another', () => {
    const { doc, top } = figure();
    const back = readCdxml(writeCdxml(doc)).doc;
    expect(new Set(label(back).attach!.atoms)).toEqual(new Set(top));
  });

  it('stays in place when the drawing changes after opening', () => {
    const { doc } = figure();
    const back = readCdxml(writeCdxml(doc)).doc;
    back.beforeCommit = (before) => refitAttached(back, before, POINTS);
    const { x, y } = label(back);
    back.edit('Number', () => back.updateCaption(label(back).id, { runs: [{ text: '3b' }] }));
    expect([label(back).x, label(back).y]).toEqual([x, y]);
  });

  it('finds its structure by its saved place in a file written before atoms were named', () => {
    const { doc, top } = figure();
    const old = writeCdxml(doc).replace(/,&quot;on&quot;:&quot;[^&]*&quot;/, '');
    expect(old).not.toContain('&quot;on&quot;');
    expect(new Set(label(readCdxml(old).doc).attach!.atoms)).toEqual(new Set(top));
  });
});
