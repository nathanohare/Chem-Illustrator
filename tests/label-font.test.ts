// @vitest-environment jsdom
//
// Atom labels' own font and size, structure by structure (Nate, 2026-11-05): set with atoms
// picked (Home ▸ Font, Style panel ▸ Label font and Label size), kept from a ChemDraw file whose
// labels are in another font than the drawing's, and saved back to ChemDraw in that font.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { readCdxml } from '../src/io/cdxml';
import { writeCdxml } from '../src/io/cdxml-write';
import { labelAtoms, labelLookOf, setLabelFont, setLabelSize, toggleLabelBold } from '../src/editor/label-font';

/** A ChemDraw file: methanol whose O is set in Times New Roman, in a drawing whose labels are Arial. */
const FILE = `<?xml version="1.0" encoding="UTF-8" ?>
<CDXML LabelFont="3" LabelSize="10" LabelFace="96" CaptionFont="3" CaptionSize="10" LineWidth="0.60" BondLength="14.40" BondSpacing="18">
<colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/></colortable>
<fonttable><font id="3" charset="iso-8859-1" name="Arial"/><font id="4" charset="iso-8859-1" name="Times New Roman"/></fonttable>
<page id="1"><fragment id="2">
<n id="5" p="100 100"/>
<n id="6" p="112.47 107.2" Element="8" NumHydrogens="1"><t p="109 111" LabelJustification="Left"><s font="4" size="12" face="96">OH</s></t></n>
<b id="7" B="5" E="6"/>
</fragment></page></CDXML>`;

function methanol(): { doc: Doc; c: number; o: number } {
  const doc = new Doc();
  let c = 0, o = 0;
  doc.edit('x', () => { c = doc.addAtom(0, 0).id; o = doc.addAtom(12.47, 7.2, 8).id; doc.addBond(c, o, 1); });
  return { doc, c, o };
}

describe('labels in a font of their own', () => {
  it('reads a ChemDraw label\'s own font and size', () => {
    const { doc } = readCdxml(FILE);
    const o = [...doc.atoms.values()].find((a) => a.z === 8)!;
    expect(o.font).toBe('Times New Roman');
    expect(o.s).toBeCloseTo(1.2, 5);
    const c = [...doc.atoms.values()].find((a) => a.z === 6)!;
    expect(c.font).toBeUndefined();
  });

  it('saves it back in that font, and a changed font in the new one', () => {
    const { doc } = readCdxml(FILE);
    const o = [...doc.atoms.values()].find((a) => a.z === 8)!;
    expect(writeCdxml(doc)).toMatch(/<s font="4" size="12"[^>]*>OH<\/s>/);
    doc.edit('Label font', () => setLabelFont(doc, [o], 'Courier New'));
    const out = writeCdxml(doc);
    const id = /<font id="(\d+)" charset="[^"]*" name="Courier New"\/>/.exec(out)?.[1];
    expect(id).toBeDefined();
    expect(out).toMatch(new RegExp(`<s font="${id}" size="12"[^>]*>OH</s>`));
    // back to the drawing's font: Arial, not the file's Times New Roman
    doc.edit('Label font', () => setLabelFont(doc, [doc.atoms.get(o.id)!], ''));
    expect(writeCdxml(doc)).toMatch(/<s font="3" size="12"[^>]*>OH<\/s>/);
  });

  it('round-trips a font set here through ChemDraw\'s file', () => {
    const { doc, o } = methanol();
    doc.edit('Label font', () => setLabelFont(doc, [doc.atoms.get(o)!], 'Georgia'));
    const back = readCdxml(writeCdxml(doc)).doc;
    expect([...back.atoms.values()].find((a) => a.z === 8)?.font).toBe('Georgia');
  });
});

describe('setting labels\' font, size and bold', () => {
  it('keeps no font of its own when given the drawing\'s or nothing', () => {
    const { doc, o } = methanol();
    const atoms = labelAtoms(doc, [o]);
    doc.edit('f', () => setLabelFont(doc, atoms, 'Times New Roman'));
    expect(doc.atoms.get(o)!.font).toBe('Times New Roman');
    doc.edit('f', () => setLabelFont(doc, labelAtoms(doc, [o]), 'arial'));
    expect(doc.atoms.get(o)!.font).toBeUndefined();
  });

  it('sets the size in points as the atom\'s scale', () => {
    const { doc, o } = methanol();
    doc.edit('s', () => setLabelSize(doc, labelAtoms(doc, [o]), 12));
    expect(doc.atoms.get(o)!.s).toBeCloseTo(12 / doc.style.labelSize, 6);
    expect(labelLookOf(doc, labelAtoms(doc, [o])).size).toBe(12);
    doc.edit('s', () => setLabelSize(doc, labelAtoms(doc, [o]), doc.style.labelSize));
    expect(doc.atoms.get(o)!.s).toBeUndefined();
  });

  it('shows the font the shown labels share, or none when they differ', () => {
    const { doc, c, o } = methanol();
    doc.edit('f', () => setLabelFont(doc, labelAtoms(doc, [o]), 'Georgia'));
    // the plain carbon shows no label, so the O's font is the structure's
    expect(labelLookOf(doc, labelAtoms(doc, [c, o])).font).toBe('Georgia');
    doc.edit('x', () => { const n = doc.addAtom(-12.47, 7.2, 7).id; doc.addBond(c, n, 1); });
    const all = labelAtoms(doc, doc.atoms.keys());
    const look = labelLookOf(doc, all);
    expect(look.font).toBeUndefined();
    expect(look.mixedFont).toBe(true);
  });

  it('turns bold on for every label, then off', () => {
    const { doc, o } = methanol();
    doc.edit('b', () => toggleLabelBold(doc, labelAtoms(doc, [o])));
    expect(doc.atoms.get(o)!.face! & 1).toBe(1);
    doc.edit('b', () => toggleLabelBold(doc, labelAtoms(doc, [o])));
    expect(doc.atoms.get(o)!.face).toBeUndefined();
  });
});
