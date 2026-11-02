// @vitest-environment jsdom
// Crystal structures from CIF files: reading, growing the molecule by symmetry, the drawing's
// shapes and the crystal data table. The expected numbers come from Chem SI Assistant's Python
// code (si_assistant/core/crystal.py and xray_draw.py), which this is ported from, run on the
// same two test files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cifMarked, cifNumber, cifPlain, cifUncertainty, readCif } from '../src/chem/cif';
import { CrystalError, crystalTable, elementOf, grow, parseSymop, structureFromCif } from '../src/chem/crystal';
import { bestRotation, crystalShapes, shapesBounds, specAtoms, defaultView } from '../src/design/xray';
import { crystalFromBlock } from '../src/ui/crystal-dialog';
import { putPlate, newPlate } from '../src/design/plates';
import { Doc } from '../src/model';
import { ACS_1996 } from '../src/style';
import { POINTS } from '../src/editor/arrange';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';

const file = (name: string) => readFileSync(join(__dirname, 'crystal', name), 'utf8');
const kinds = (items: { kind: string }[]) => items.reduce<Record<string, number>>((m, s) => ((m[s.kind] = (m[s.kind] ?? 0) + 1), m), {});

describe('CIF reading', () => {
  it('reads items, quoted values, text fields and loops', () => {
    const [b] = readCif(`data_x
_cell_length_a 12.345(6)
_symmetry_space_group_name_H-M 'P 21/c'
_chemical_name_systematic
;
 4-bromobenzoic acid
;
_note "it's fine" # a comment
loop_
_atom_site_label _atom_site_fract_x
C1 0.1  C2 0.2
`);
    expect(b.name).toBe('x');
    expect(b.get('_cell_length_a')).toBe('12.345(6)');
    expect(b.get('_symmetry_space_group_name_h-m')).toBe('P 21/c');
    expect(b.get('_chemical_name_systematic')).toBe('4-bromobenzoic acid');
    expect(b.get('_note')).toBe("it's fine");
    expect(b.rows('_atom_site_label').map((r) => r.get('_atom_site_fract_x'))).toEqual(['0.1', '0.2']);
  });

  it('reads numbers with uncertainties and CIF text codes', () => {
    expect(cifNumber('12.345(6)')).toBe(12.345);
    expect(cifNumber('?')).toBeNull();
    expect(cifUncertainty('12.345(6)')).toBeCloseTo(0.006, 10);
    expect(cifUncertainty('98.5(12)')).toBeCloseTo(1.2, 10);
    expect(cifPlain('Mo K\\a')).toBe('Mo Kα');
    expect(cifMarked('R~int~ \\%A^3^')).toBe('R_{int} Å^{3}');
  });

  it('reads symmetry operations and element symbols', () => {
    const [rot, t] = parseSymop('-x+1/2, y+1/2, -z+1/2');
    expect(rot).toEqual([[-1, 0, 0], [0, 1, 0], [0, 0, -1]]);
    expect(t).toEqual([0.5, 0.5, 0.5]);
    expect(() => parseSymop('x, y')).toThrow(CrystalError);
    expect(elementOf('CL1', null)).toBe('Cl');
    expect(elementOf('C12A', null)).toBe('C');
    expect(elementOf('X1', 'O2-')).toBe('O');
    expect(elementOf('Br1', null)).toBe('Br');
  });
});

describe('crystal structures (matching Chem SI Assistant)', () => {
  it('grows an asymmetric unit that is a whole molecule, with anisotropic U in Å²', () => {
    const [block] = readCif(file('test-acid.cif'));
    const s = structureFromCif(block);
    expect(s.atoms.length).toBe(15);
    const g = grow(s);
    expect(g.atoms.length).toBe(15);
    expect(g.bonds.length).toBe(15);
    expect(g.molecules).toBe(1);
    expect(g.complete).toBe(true);
    const u = g.atoms[0].u;
    const want = [[0.032992, -0.003658, -0.002958], [-0.003658, 0.0304, 0.0008], [-0.002958, 0.0008, 0.0455]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(u[i][j]).toBeCloseTo(want[i][j], 5);
  });

  it('draws the same shapes as the original viewer', () => {
    const [block] = readCif(file('test-acid.cif'));
    const g = grow(structureFromCif(block));
    const atoms = specAtoms(g.atoms);
    const v = { ...defaultView(), rotation: bestRotation(atoms.filter((a) => a.el !== 'H').map((a) => a.xyz)) };
    const items = crystalShapes({ name: 'x', atoms, bonds: g.bonds, view: v }, v);
    // 15 bonds and the principal ellipses' arcs: an arc may be split where its curve starts, which
    // depends on the sign of an eigenvector, so the arcs' points less their number are compared
    const bonds = items.filter((s) => s.kind === 'polyline' && s.points!.length === 2);
    const arcs = items.filter((s) => s.kind === 'polyline' && s.points!.length > 2);
    expect(bonds.length).toBe(15);
    expect(arcs.reduce((n, s) => n + s.points!.length - 1, 0)).toBe(1100 - 50);
    expect(kinds(items.filter((s) => s.kind !== 'polyline'))).toEqual({ ball: 5, ellipse: 10, text: 10 });
    // the view's direction may differ in sign, so compare the drawing's size
    const b = shapesBounds(items);
    expect(b[2] - b[0]).toBeCloseTo(104.21 + 139.49, 0);
    expect(b[3] - b[1]).toBeCloseTo(57.09 + 64.37, 0);
  });

  it('fills the crystal data table', () => {
    const [block] = readCif(file('test-acid.cif'));
    const table = new Map(crystalTable(block).map(([key, , value]) => [key, value]));
    expect(table.get('space_group')).toBe('*P*2_{1}/*c*');
    expect(table.get('radiation')).toBe('Mo Kα (λ = 0.71073)');
    expect(table.get('two_theta')).toBe('4.90 to 55.00');
    expect(table.get('r_gt')).toBe('*R*_{1} = 0.0312, w*R*_{2} = 0.0755');
    expect(table.get('density')).toBe('0.946');
    expect(table.get('volume')).toBe('1412.1(5)');
  });

  it('completes a molecule that sits on an inversion centre', () => {
    const [block] = readCif(file('test-centro.cif'));
    const s = structureFromCif(block);
    expect(s.atoms.length).toBe(6);
    const g = grow(s);
    expect(g.atoms.length).toBe(12);
    expect(g.bonds.length).toBe(12);
    expect(g.molecules).toBe(1);
    const atoms = specAtoms(g.atoms);
    const v = { ...defaultView(), rotation: bestRotation(atoms.filter((a) => a.el !== 'H').map((a) => a.xyz)) };
    const items = crystalShapes({ name: 'x', atoms, bonds: g.bonds, view: v }, v);
    expect(kinds(items)).toEqual({ polyline: 12, ball: 4, ellipse: 8, text: 4 });
    const b = shapesBounds(items);
    expect(b[2] - b[0]).toBeCloseTo(118.28 + 99.58, 0);
    expect(b[3] - b[1]).toBeCloseTo(2 * 60.66, 0);
    const table = new Map(crystalTable(block).map(([key, , value]) => [key, value]));
    expect(table.get('space_group')).toBe('*P*2_{1}/*c*');
  });

  it('says plainly when a file has no atoms', () => {
    const [block] = readCif('data_empty\n_cell_length_a 5\n');
    expect(() => structureFromCif(block)).toThrow(CrystalError);
  });
});

describe('crystal structure figures', () => {
  it('places a figure in a frame that is saved in CDXML and comes back', () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const [block] = readCif(file('test-acid.cif'));
    const d = { ...newPlate('crystal', doc.style.bondLength), crystal: crystalFromBlock(block) };
    let id = 0;
    doc.edit('Crystal', () => { id = putPlate(doc, POINTS, d, { x: 0, y: 0 }); });
    const frame = doc.shapes.get(id)!;
    expect(frame.plate?.kind).toBe('crystal');
    const ovals = frame.frame!.shapes.filter((s) => doc.shapes.get(s)?.kind === 'oval');
    expect(ovals.length).toBe(15);
    expect(frame.frame!.captions.length).toBe(10);
    // drawn again in place: no shapes left behind
    const before = doc.shapes.size;
    doc.edit('Again', () => { putPlate(doc, POINTS, { ...frame.plate!, crystal: { ...frame.plate!.crystal!, view: { ...frame.plate!.crystal!.view, labels: false } } }, { x: 0, y: 0 }, id); });
    expect(doc.shapes.get(id)!.frame!.captions.length).toBe(0);
    expect(doc.shapes.size).toBe(before);

    const back = readCdxml(writeCdxml(doc)).doc;
    const plates = [...back.shapes.values()].filter((s) => s.plate?.kind === 'crystal');
    expect(plates.length).toBe(1);
    expect(plates[0].plate!.crystal!.atoms.length).toBe(15);
    expect(plates[0].plate!.crystal!.table?.length).toBeGreaterThan(5);
    // the ellipsoids keep their turn (ChemDraw reads the turned axes)
    const turned = (d: Doc) => [...d.shapes.values()].filter((s) => s.kind === 'oval' && s.rot).map((s) => +s.rot!.toFixed(1)).sort();
    expect(turned(back).length).toBeGreaterThan(5);
    const want = turned(doc).map((r) => ((r % 180) + 180) % 180).sort((a, b) => a - b);
    turned(back).sort((a, b) => a - b).forEach((r, k) => expect(r).toBeCloseTo(want[k], 0));
  });
});
