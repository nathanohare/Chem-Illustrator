// @vitest-environment jsdom
//
// Deleting a charge sign takes its charge with it (issue #253): the + of a C=OH⁺ dragged off the
// label and deleted leaves a neutral C=O, not an "OH" with a hidden charge that comes back each
// time the label is typed.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Editor, freeCharge, removeShapeAndCharge, applyCharge } from '../src/editor/editor';
import { Renderer } from '../src/render/renderer';

window.requestAnimationFrame = () => 0;
import { implicitHydrogens } from '../src/chem/elements';

function oxonium() {
  const doc = new Doc();
  let o = 0;
  doc.edit('Build', () => {
    const c = doc.addAtom(100, 100);
    const a = doc.addAtom(100, 80, 8, { charge: 1 });
    doc.addBond(c.id, a.id, 2);
    o = a.id;
  });
  return { doc, o };
}

const hOf = (doc: Doc, id: number) => { const a = doc.atoms.get(id)!; return implicitHydrogens(a.z, doc.valenceSum(id), a.charge); };

describe('deleting a charge sign', () => {
  it('a + moved off the label takes the charge, and the hydrogen, with it', () => {
    const { doc, o } = oxonium();
    expect(hOf(doc, o)).toBe(1);
    let sign = 0;
    doc.edit('Move Charge', () => { sign = freeCharge(doc, o, { x1: 108, y1: 72, x2: 112, y2: 76 }); });
    doc.edit('Delete', () => removeShapeAndCharge(doc, sign));
    const a = doc.atoms.get(o)!;
    expect(a.charge).toBe(0);
    expect(a.hideCharge).toBeFalsy();
    expect(hOf(doc, o)).toBe(0);
    // and Undo brings the sign and the charge back together
    doc.undo();
    expect(doc.shapes.has(sign)).toBe(true);
    expect(doc.atoms.get(o)!.charge).toBe(1);
  });

  it('a circled ⊕ does the same', () => {
    const { doc, o } = oxonium();
    doc.edit('Charge', () => applyCharge(doc, o, 1, true, (a) => ({ x: a.x + 8, y: a.y - 8 })));
    const sign = [...doc.shapes.values()].find((s) => s.symbol === 'CirclePlus')!;
    doc.edit('Delete', () => removeShapeAndCharge(doc, sign.id));
    expect(doc.atoms.get(o)!.charge).toBe(0);
  });

  it('other symbols leave the atom alone', () => {
    const { doc, o } = oxonium();
    let id = 0;
    doc.edit('Dot', () => { id = doc.addShape({ kind: 'symbol', symbol: 'Electron', x1: 104, y1: 76, x2: 104, y2: 76 }).id; });
    doc.edit('Delete', () => removeShapeAndCharge(doc, id));
    expect(doc.atoms.get(o)!.charge).toBe(1);
  });

  it('typing O on an atom whose sign was deleted earlier makes it neutral (drawings from before the fix)', () => {
    const { doc, o } = oxonium();
    doc.edit('Old delete', () => { doc.updateAtom(o, { hideCharge: true }); });
    const scene = document.createElement('canvas'), overlay = document.createElement('canvas');
    const host = document.createElement('div');
    host.append(scene, overlay);
    document.body.append(host);
    const ed = new Editor(doc, new Renderer(scene, overlay), host);
    doc.edit('Label', () => ed.applyLabel(o, 'O'));
    ed.paused = true;
    expect(doc.atoms.get(o)!.charge).toBe(0);
    expect(hOf(doc, o)).toBe(0);
  });
});
