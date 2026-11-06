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
import { bestRotation, crystalShapes, shapesBounds, specAtoms, defaultView, labelText, type XView } from '../src/design/xray';
import { fromDataUrl } from '../src/render/images';
import { Deck } from '../src/deck/deck';
import { writePptx, type PptxOptions } from '../src/io/pptx-write';
import { readPptx } from '../src/io/pptx-read';
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

  it('grows a network (NaCl, Fm-3m, 192 operations) to its cap without holding up the app', () => {
    // (found in the 2026-11-03 review: this took about 1.5 s on the main thread)
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    const ops: string[] = [];
    for (const t of [['', '', ''], ['', '+1/2', '+1/2'], ['+1/2', '', '+1/2'], ['+1/2', '+1/2', '']])
      for (const p of perms) for (let s = 0; s < 8; s++) ops.push(`'${p.map((k, i) => `${s >> i & 1 ? '-' : ''}${'xyz'[k]}${t[i]}`).join(',')}'`);
    const [block] = readCif(`data_nacl
_cell_length_a 5.64
_cell_length_b 5.64
_cell_length_c 5.64
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_space_group_symop_operation_xyz
${ops.join('\n')}
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Na1 Na 0 0 0
Cl1 Cl 0.5 0 0
`);
    const s = structureFromCif(block);
    expect(s.symops.length).toBe(192);
    grow(s); // warm up
    const t = performance.now();
    const g = grow(s);
    const took = performance.now() - t;
    expect(g.complete).toBe(false);
    expect(g.atoms.length).toBeGreaterThan(1000);
    // each ion has its six neighbors at 2.82 Å, and no bond is longer
    const d = (i: number, j: number) => Math.hypot(...[0, 1, 2].map((k) => g.atoms[i].xyz[k] - g.atoms[j].xyz[k]));
    expect(g.bonds.length).toBeGreaterThan(g.atoms.length);
    expect(g.bonds.every(([i, j]) => Math.abs(d(i, j) - 2.82) < 0.01)).toBe(true);
    expect(took).toBeLessThan(600);
  });

  it('says plainly when a file has no atoms', () => {
    const [block] = readCif('data_empty\n_cell_length_a 5\n');
    expect(() => structureFromCif(block)).toThrow(CrystalError);
  });
});

describe('crystal structure figures', () => {
  const placed = () => {
    const doc = new Doc();
    doc.style = { ...ACS_1996 };
    const [block] = readCif(file('test-acid.cif'));
    const d = { ...newPlate('crystal', doc.style.bondLength), crystal: crystalFromBlock(block) };
    let id = 0;
    doc.edit('Crystal', () => { id = putPlate(doc, POINTS, d, { x: 0, y: 0 }); });
    return { doc, id, d };
  };
  const svgOf = (src: string) => new TextDecoder().decode(fromDataUrl(src).bytes);

  it('places a figure as one picture that keeps its data, saved in CDXML with a vector copy for ChemDraw', () => {
    const { doc, id } = placed();
    const pic = doc.shapes.get(id)!;
    expect(pic.kind).toBe('picture');
    expect(pic.plate?.kind).toBe('crystal');
    expect(pic.frame).toBeUndefined();
    const svg = svgOf(pic.src!);
    expect(svg.match(/<(ellipse|circle) /g)?.length).toBe(15);
    expect(svg.match(/<text /g)?.length).toBe(10);
    // one shape on the page, however many atoms
    expect(doc.shapes.size).toBe(1);
    expect(doc.captions.size).toBe(0);
    // drawn again in place: the same picture, nothing left behind
    doc.edit('Again', () => { putPlate(doc, POINTS, { ...pic.plate!, crystal: { ...pic.plate!.crystal!, view: { ...pic.plate!.crystal!.view, labels: false } } }, { x: 0, y: 0 }, id); });
    expect(doc.shapes.size).toBe(1);
    expect(svgOf(doc.shapes.get(id)!.src!)).not.toContain('<text ');

    const xml = writeCdxml(doc);
    expect(xml).toMatch(/EnhancedMetafile="[0-9A-F]{100,}"/);
    const back = readCdxml(xml).doc;
    const plates = [...back.shapes.values()].filter((s) => s.plate?.kind === 'crystal');
    expect(plates.length).toBe(1);
    expect(plates[0].kind).toBe('picture');
    expect(plates[0].plate!.crystal!.atoms.length).toBe(15);
    expect(plates[0].plate!.crystal!.table?.length).toBeGreaterThan(5);
    expect(svgOf(plates[0].src!).match(/<(ellipse|circle) /g)?.length).toBe(15);
  });

  it('keeps its data on a PowerPoint slide, so it opens in its window again', async () => {
    const deck = Deck.design(new Doc(), { w: 960, h: 540 });
    const d = deck.docOf(0);
    const [block] = readCif(file('test-acid.cif'));
    const plate = { ...newPlate('crystal', 14.4), crystal: crystalFromBlock(block) };
    d.edit('Crystal', () => { putPlate(d, POINTS, plate, { x: 100, y: 100 }); });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const opts: PptxOptions = { async picture() { return { png, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', box: { x1: 0, y1: 0, x2: 1, y2: 1 } }; }, async svgToPng() { return png; } };
    const bytes = await writePptx({ size: deck.size, master: deck.master, design: true, slides: [{ layout: 'blank', doc: d, notes: '' }] }, opts);
    const back = readPptx(bytes).slides[0].contents;
    const pic = [...back.shapes.values()].find((s) => s.kind === 'picture')!;
    expect(pic.plate?.crystal?.atoms.length).toBe(15);
    expect(svgOf(pic.src!).match(/<(ellipse|circle) /g)?.length).toBe(15);
  });

  it('turns a figure placed before (a frame round its shapes) into a picture when it is drawn again', () => {
    const { doc, id } = placed();
    const plate = doc.shapes.get(id)!.plate!;
    // an old figure: an invisible frame round an oval and a label
    let frameId = 0;
    doc.edit('Old', () => {
      doc.removeShape(id);
      const oval = doc.addShape({ kind: 'oval', x1: 10, y1: 10, x2: 20, y2: 16, filled: true, fillColor: '#cccccc', color: '#000000', lineWidth: 0.7 }).id;
      const cap = doc.addCaption({ x: 22, y: 14, runs: [{ text: 'C1' }], justify: 'left', chem: false }).id;
      frameId = doc.addShape({ kind: 'geo', geo: 'rect', x1: 0, y1: 0, x2: plate.w, y2: plate.h, filled: false, lineWidth: 0, color: '#000000', frame: { atoms: [], captions: [cap], arrows: [], shapes: [oval], padX: 4, padY: 4, fit: true }, plate }).id;
    });
    let now = 0;
    doc.edit('Again', () => { now = putPlate(doc, POINTS, plate, { x: 0, y: 0 }, frameId); });
    expect(doc.shapes.size).toBe(1);
    expect(doc.captions.size).toBe(0);
    expect(doc.shapes.get(now)!.kind).toBe('picture');
  });

  it('places labels clear of each other, as chosen, and only on the atoms checked', () => {
    const [block] = readCif(file('test-acid.cif'));
    const c = crystalFromBlock(block);
    const texts = (v: Partial<XView>) => crystalShapes(c, { ...c.view, ...v }).filter((s) => s.kind === 'text');
    const box = (s: ReturnType<typeof texts>[number]) => [s.centre![0], s.centre![1] - 0.72 * s.size!, s.centre![0] + 0.58 * s.size! * s.text!.length, s.centre![1]];
    const overlap = (list: ReturnType<typeof texts>) => {
      let n = 0;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = box(list[i]), b = box(list[j]);
        n += Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      }
      return n;
    };
    // a big label size crowds them: auto overlaps less than the open side alone
    const auto = texts({ labelPlace: 'auto', labelSize: 16 }), open = texts({ labelPlace: 'open', labelSize: 16 });
    expect(auto.length).toBe(open.length);
    expect(overlap(auto)).toBeLessThanOrEqual(overlap(open));
    // right of every atom: each label starts right of its atom
    for (const s of texts({ labelPlace: 'right' })) expect(s.centre![0]).toBeGreaterThan(s.anchor![0]);
    // one atom's own side wins
    const first = texts({})[0].key!;
    const left = texts({ labelPlace: 'right', labelSides: { [first]: 'left' } }).find((s) => s.key === first)!;
    expect(left.centre![0] + 0.58 * left.size! * left.text!.length).toBeLessThan(left.anchor![0]);
    // unchecked atoms have no label; a hydrogen checked has one
    const h = c.atoms.find((a) => a.el === 'H')!.label;
    const some = texts({ labelAtoms: { [first]: false, [h]: true } }).map((s) => s.key);
    expect(some).not.toContain(first);
    expect(some).toContain(h);
    // C(1) style
    expect(labelText('C12A', 'paren')).toBe('C(12A)');
    expect(labelText('Cl1', 'paren')).toBe('Cl(1)');
    expect(labelText('O1', 'plain')).toBe('O1');
    // leader lines where a label sits away from its atom (dragged off)
    const far = crystalShapes(c, { ...c.view, leaders: true, labelOffsets: { [first]: [60, 60] } });
    expect(far.some((s) => s.kind === 'polyline' && s.key === 'leader')).toBe(true);
  });
});
