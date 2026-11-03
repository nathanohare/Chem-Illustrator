// @vitest-environment jsdom
//
// Other programs' chemistry files: molfiles (V2000 and V3000), SD, RXN, Marvin (MRV), Ketcher
// (KET), CML and ChemDoodle JSON, read as drawings and written back.

import { describe, it, expect } from 'vitest';
import {
  chemFormatOf, readMolfile, readRxnFile, readMrv, readKet, readCmlFile, readChemDoodleJson, readScene, readSdfMols, sceneToDoc,
  writeMolFile, writeSdfFile, writeRxnFile, writeMrvFile, writeKetFile, writeCmlFile, writeChemDoodleJson, type ChemFormat, type FScene,
} from '../src/io/chem-formats';
import { Doc } from '../src/model';
import { ACS_1996 } from '../src/style';
import { plainMeasure, reactionSteps, schemeItems } from '../src/chem/reaction';
import { writeCml } from '../src/io/cml';

const ETHANOL_V2000 = `ethanol
  test

  3  2  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  1  0
M  END
`;

const ACETATE_V3000 = `acetate
  test

  0  0  0     0  0            999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 4 3 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0 0 0 0
M  V30 2 C 1.299 0.75 0 0
M  V30 3 O 2.598 0 0 0 CHG=-1
M  V30 4 O 1.299 2.25 0 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 1 2 CFG=1
M  V30 2 1 2 3
M  V30 3 2 2 4
M  V30 END BOND
M  V30 END CTAB
M  END
`;

// toluene with its methyl written out and marked as an abbreviation (Me)
const SUP_V2000 = `
  test

  8  8  0  0  0  0  0  0  0  0999 V2000
    0.0000    1.5000    0.0000 C   0  0
    1.2990    0.7500    0.0000 C   0  0
    1.2990   -0.7500    0.0000 C   0  0
    0.0000   -1.5000    0.0000 C   0  0
   -1.2990   -0.7500    0.0000 C   0  0
   -1.2990    0.7500    0.0000 C   0  0
    0.0000    3.0000    0.0000 C   0  0
    0.0000    3.5000    0.0000 H   0  0
  1  2  2  0
  2  3  1  0
  3  4  2  0
  4  5  1  0
  5  6  2  0
  6  1  1  0
  1  7  1  0
  7  8  1  0
M  STY  1   1 SUP
M  SAL   1  2   7   8
M  SMT   1 Me
M  END
`;

const rxnV2000 = (r: string[], p: string[]) => `$RXN\n\n  test\n\n${String(r.length).padStart(3)}${String(p.length).padStart(3)}\n` + [...r, ...p].map((m) => `$MOL\n${m}`).join('');

const ACETONE = `
  test

  4  3  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0
    1.2990    0.7500    0.0000 C   0  0
    2.5981    0.0000    0.0000 C   0  0
    1.2990    2.2500    0.0000 O   0  0
  1  2  1  0
  2  3  1  0
  2  4  2  0
M  END
`;
const ISOPROPANOL = ACETONE.replace('  2  4  2  0', '  2  4  1  0');

const MRV_RXN = `<cml xmlns="http://www.chemaxon.com"><MDocument><MChemicalStruct><reaction>
<reactantList><molecule molID="m1"><atomArray atomID="a1 a2 a3 a4" elementType="C C C O" x2="0 1.33 2.67 1.33" y2="0 0.77 0 2.31"/>
<bondArray><bond id="b1" atomRefs2="a1 a2" order="1"/><bond id="b2" atomRefs2="a2 a3" order="1"/><bond id="b3" atomRefs2="a2 a4" order="2"/></bondArray></molecule></reactantList>
<agentList/>
<productList><molecule molID="m2"><atomArray><atom id="a5" elementType="C" x2="8" y2="0"/><atom id="a6" elementType="C" x2="9.33" y2="0.77"/><atom id="a7" elementType="C" x2="10.67" y2="0"/><atom id="a8" elementType="O" x2="9.33" y2="2.31"/></atomArray>
<bondArray><bond id="b4" atomRefs2="a5 a6" order="1"/><bond id="b5" atomRefs2="a6 a7" order="1"/><bond id="b6" atomRefs2="a6 a8" order="1"><bondStereo>W</bondStereo></bond></bondArray></molecule></productList>
<arrow type="DEFAULT" x1="4" y1="0.5" x2="7" y2="0.5"/></reaction></MChemicalStruct>
<MTextBox id="o1"><Field name="text">{fg=#000000,font=Helvetica}NaBH4</Field><MPoint x="5" y="1.5"/><MPoint x="6" y="1.5"/><MPoint x="6" y="1"/><MPoint x="5" y="1"/></MTextBox>
</MDocument></cml>`;

// anisole with its methoxy contracted, the way Marvin keeps an abbreviation
const MRV_SUP = `<cml xmlns="http://www.chemaxon.com"><MDocument><MChemicalStruct><molecule molID="m1">
<atomArray atomID="a1 a2 a3 a4 a5 a6 a7" elementType="C C C C C C R" sgroupRef="0 0 0 0 0 0 sg1" x2="0 1.33 1.33 0 -1.33 -1.33 0" y2="1.54 0.77 -0.77 -1.54 -0.77 0.77 3.08"/>
<bondArray><bond id="b1" atomRefs2="a1 a2" order="A"/><bond id="b2" atomRefs2="a2 a3" order="A"/><bond id="b3" atomRefs2="a3 a4" order="A"/><bond id="b4" atomRefs2="a4 a5" order="A"/><bond id="b5" atomRefs2="a5 a6" order="A"/><bond id="b6" atomRefs2="a6 a1" order="A"/><bond id="b7" atomRefs2="a1 a7" order="1"/></bondArray>
<molecule id="sg1" role="SuperatomSgroup" title="OMe" molID="m2"><atomArray atomID="a8 a9" elementType="O C" x2="0 1.33" y2="3.08 3.85"/><bondArray><bond id="b8" atomRefs2="a8 a9" order="1"/></bondArray></molecule>
</molecule></MChemicalStruct></MDocument></cml>`;

const KET = JSON.stringify({
  root: { nodes: [{ $ref: 'mol0' }, { $ref: 'mol1' }, { type: 'arrow', data: { mode: 'open-angle', pos: [{ x: 3, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }] } }] },
  mol0: { type: 'molecule', atoms: [{ label: 'C', location: [0, 0, 0] }, { label: 'N', location: [1, 0, 0], charge: 1 }], bonds: [{ type: 1, atoms: [0, 1] }] },
  mol1: { type: 'molecule', atoms: [{ label: 'C', location: [7, 0, 0] }, { label: 'C', location: [8, 0.5, 0] }, { label: 'O', location: [9, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1], stereo: 6 }, { type: 2, atoms: [1, 2] }] },
});

// the Diels–Alder example from ChemDoodle's description of its JSON format
const CDJSON = '{"m":[{"a":[{"x":37.5,"y":117.4},{"x":37.5,"y":137.4},{"x":54.820508075688764,"y":147.4},{"x":54.820508075688764,"y":107.4}],"b":[{"b":0,"e":1},{"b":1,"e":2,"o":2},{"b":0,"e":3,"o":2}]},{"a":[{"x":98,"y":139},{"x":98,"y":119},{"x":115.32050807568876,"y":109,"l":"O"}],"b":[{"b":0,"e":1,"o":2},{"b":1,"e":2}]},{"a":[{"x":260,"y":108},{"x":277.3205080756888,"y":118},{"x":277.3205080756888,"y":138},{"x":260.00000000000006,"y":148.00000000000003},{"x":242.67949192431126,"y":138.00000000000009},{"x":242.67949192431118,"y":118.00000000000009},{"x":294.6410161513776,"y":108,"l":"O"}],"b":[{"b":0,"e":1},{"b":1,"e":2},{"b":2,"e":3},{"b":3,"e":4},{"b":4,"e":5,"o":2},{"b":5,"e":0},{"b":1,"e":6}]}],"s":[{"t":"Line","x1":158,"y1":128,"x2":203.0111097397076,"y2":128,"a":"synthetic"}]}';

const CML = `<?xml version="1.0"?><cml xmlns="http://www.xml-cml.org/schema"><molecule id="m1"><atomArray>
<atom id="a1" elementType="C" x2="0" y2="0"/><atom id="a2" elementType="N" x2="1.5" y2="0" formalCharge="1"/><atom id="a3" elementType="C" x2="2.25" y2="1.3" isotopeNumber="13"/>
</atomArray><bondArray><bond atomRefs2="a1 a2" order="1"/><bond atomRefs2="a2 a3" order="D"/></bondArray></molecule></cml>`;

/** Elements of a drawing as a sorted string ("C C N O"), labels as written. */
const elements = (d: Doc) => [...d.atoms.values()].map((a) => a.label ?? String(a.z)).sort().join(' ');
const draw = (s: FScene | null) => { expect(s).not.toBeNull(); return sceneToDoc(s!, ACS_1996).doc; };
const bondLengths = (d: Doc) => [...d.bonds.values()].map((b) => { const p = d.atoms.get(b.a1)!, q = d.atoms.get(b.a2)!; return Math.hypot(p.x - q.x, p.y - q.y); });

describe('reading other programs\' chemistry files', () => {
  it('tells the formats apart by extension and contents', () => {
    expect(chemFormatOf('a.mol', ETHANOL_V2000)).toBe('mol');
    expect(chemFormatOf('a.mol', rxnV2000([ACETONE], [ISOPROPANOL]))).toBe('rxn');
    expect(chemFormatOf('a.rxn', '')).toBe('rxn');
    expect(chemFormatOf('a.mrv', MRV_RXN)).toBe('mrv');
    expect(chemFormatOf('a.xml', MRV_RXN)).toBe('mrv');
    expect(chemFormatOf('a.ket', KET)).toBe('ket');
    expect(chemFormatOf('a.json', KET)).toBe('ket');
    expect(chemFormatOf('a.json', CDJSON)).toBe('cdjson');
    expect(chemFormatOf('a.json', '{"theme":"dark"}')).toBeNull();
    expect(chemFormatOf('a.cml', CML)).toBe('cml');
    expect(chemFormatOf('a.xml', CML)).toBe('cml');
    expect(chemFormatOf('a.cdxml', '<CDXML></CDXML>')).toBeNull();
  });

  it('reads a V2000 molfile at the drawing\'s bond length, upright', () => {
    const d = draw(readScene('mol', ETHANOL_V2000));
    expect(elements(d)).toBe('6 6 8');
    for (const l of bondLengths(d)) expect(l).toBeCloseTo(ACS_1996.bondLength, 2);
    // the oxygen is lower right of the middle carbon in the file (y up), so lower on the page (y down)
    const [, c2, o] = [...d.atoms.values()];
    expect(o.y).toBeGreaterThan(c2.y);
  });

  it('reads a V3000 molfile with charges and wedges', () => {
    const m = readMolfile(ACETATE_V3000)!;
    expect(m.atoms.map((a) => a.sym)).toEqual(['C', 'C', 'O', 'O']);
    expect(m.atoms[2].charge).toBe(-1);
    expect(m.bonds[0].stereo).toBe('wedge');
    expect(m.bonds[2].order).toBe(2);
  });

  it('puts an abbreviation written out as atoms back as its label', () => {
    const m = readMolfile(SUP_V2000)!;
    expect(m.atoms).toHaveLength(7);
    expect(m.atoms[6].sym).toBe('Me');
    const d = draw(readScene('mol', SUP_V2000));
    expect([...d.atoms.values()].filter((a) => a.label === 'Me')).toHaveLength(1);
  });

  it('puts a V3000 abbreviation (SGROUP SUP, ATOMS=(…)) back as its label, and keeps R-group numbers', () => {
    // (found in the 2026-11-03 review: a bracketed list was cut at its first space)
    const v3 = ACETATE_V3000.replace('COUNTS 4 3 0 0 0', 'COUNTS 6 5 1 0 0')
      .replace('M  V30 4 O 1.299 2.25 0 0\n', 'M  V30 4 O 1.299 2.25 0 0\nM  V30 5 O 0 -1.5 0 0\nM  V30 6 C 1.3 -2.25 0 0\n')
      .replace('M  V30 3 2 2 4\n', 'M  V30 3 2 2 4\nM  V30 4 1 1 5\nM  V30 5 1 5 6\n')
      .replace('M  V30 END BOND\n', 'M  V30 END BOND\nM  V30 BEGIN SGROUP\nM  V30 1 SUP 0 ATOMS=(2 5 6) LABEL="OMe"\nM  V30 END SGROUP\n');
    const m = readMolfile(v3)!;
    expect(m.atoms.map((a) => a.sym)).toEqual(['C', 'C', 'O', 'O', 'OMe']);
    const r = readMolfile(ACETATE_V3000.replace('M  V30 4 O 1.299 2.25 0 0', 'M  V30 4 R# 1.299 2.25 0 0 RGROUPS=(1 2)'))!;
    expect(r.atoms[3].sym).toBe('R2');
  });

  it('reads an SD file\'s records', () => {
    const sdf = `${ETHANOL_V2000}> <NAME>\nethanol\n\n$$$$\n${ACETATE_V3000}$$$$\n`;
    expect(readSdfMols(sdf).map((m) => m.atoms.length)).toEqual([3, 4]);
  });

  it('lays out an RXN file as starting material, arrow and product, with the step stored', () => {
    const s = readRxnFile(rxnV2000([ACETONE], [ISOPROPANOL]))!;
    expect(s.mols.map((m) => m.role)).toEqual(['reactant', 'product']);
    const d = draw(s);
    expect(d.arrows.size).toBe(1);
    const arrow = [...d.arrows.values()][0];
    expect(arrow.step?.reactants).toHaveLength(1);
    expect(arrow.step?.products).toHaveLength(1);
    // starting material left of the arrow, product right of it
    const xs = [...d.atoms.values()].map((a) => a.x);
    expect(Math.min(...xs)).toBeLessThan(arrow.tail.x);
    expect(Math.max(...xs)).toBeGreaterThan(arrow.head.x);
  });

  it('reads a V3000 RXN file', () => {
    const ctab = (src: string) => src.split('\n').filter((l) => l.startsWith('M  V30')).join('\n');
    const rxn = `$RXN V3000\n\n  test\n\nM  V30 COUNTS 1 1\nM  V30 BEGIN REACTANT\n${ctab(ACETATE_V3000)}\nM  V30 END REACTANT\nM  V30 BEGIN PRODUCT\n${ctab(ACETATE_V3000)}\nM  V30 END PRODUCT\nM  END\n`;
    const s = readRxnFile(rxn)!;
    expect(s.mols.map((m) => [m.role, m.atoms.length])).toEqual([['reactant', 4], ['product', 4]]);
  });

  it('reads a Marvin reaction with its arrow, roles and text', () => {
    const s = readMrv(MRV_RXN)!;
    expect(s.mols.map((m) => m.role)).toEqual(['reactant', 'product']);
    expect(s.arrows).toHaveLength(1);
    expect(s.texts[0].text).toBe('NaBH4');
    expect(s.mols[1].bonds[2].stereo).toBe('wedge');
    const d = draw(s);
    expect([...d.arrows.values()][0].step?.reactants).toHaveLength(1);
    expect([...d.captions.values()].some((c) => c.runs[0].text === 'NaBH4')).toBe(true);
  });

  it('shows a contracted Marvin abbreviation by its name', () => {
    const s = readMrv(MRV_SUP)!;
    expect(s.mols[0].atoms.map((a) => a.sym)).toContain('OMe');
    expect(s.mols[0].atoms).toHaveLength(7);
    expect(s.mols[0].bonds.filter((b) => b.order === 1.5)).toHaveLength(6);
  });

  it('reads a Ketcher file', () => {
    const s = readKet(KET)!;
    expect(s.mols).toHaveLength(2);
    expect(s.mols[0].atoms[1].charge).toBe(1);
    expect(s.mols[1].bonds[0].stereo).toBe('hash');
    expect(s.arrows).toHaveLength(1);
    const d = draw(s);
    expect([...d.bonds.values()].some((b) => b.display === 'hashWedge')).toBe(true);
  });

  it('reads ChemDoodle JSON (y downwards) the right way up', () => {
    const s = readChemDoodleJson(CDJSON)!;
    expect(s.mols).toHaveLength(3);
    expect(s.arrows).toHaveLength(1);
    const d = draw(s);
    for (const l of bondLengths(d)) expect(l).toBeCloseTo(ACS_1996.bondLength, 1);
    // pyridine's example puts the first atom (y 108) above its neighbour (y 118): the same on the page
    const ring = [...d.atoms.values()].slice(7);
    expect(ring[0].y).toBeLessThan(ring[1].y);
  });

  it('reads CML', () => {
    const s = readCmlFile(CML)!;
    expect(s.mols[0].atoms.map((a) => [a.sym, a.charge ?? 0, a.iso ?? 0])).toEqual([['C', 0, 0], ['N', 1, 0], ['C', 0, 13]]);
    expect(s.mols[0].bonds[1].order).toBe(2);
  });
});

describe('writing drawings in other programs\' formats', () => {
  /** acetone → isopropanol, drawn from an RXN file (so the step is stored with the arrow). */
  const reaction = () => draw(readRxnFile(rxnV2000([ACETONE], [ISOPROPANOL])));

  const roundTrip = (fmt: ChemFormat, text: string) => draw(readScene(fmt, text));

  it('keeps a label it can\'t read as chemistry as that label, in every format (found in the 2026-11-03 review: it became R or *)', () => {
    const d = new Doc();
    d.bulk(() => { const a = d.addAtom(0, 0); const b = d.addAtom(14, 0); d.addBond(a.id, b.id); d.updateAtom(b.id, { label: 'Xyz' }); });
    const files: [string, string][] = [
      ['a.mol', writeMolFile(d).text], ['b.mol', writeMolFile(d, '', { v3000: true }).text], ['a.sdf', writeSdfFile(d).text],
      ['a.mrv', writeMrvFile(d).text], ['a.ket', writeKetFile(d).text], ['a.cml', writeCmlFile(d).text], ['a.json', writeChemDoodleJson(d).text],
    ];
    for (const [name, text] of files) {
      const scene = readScene(chemFormatOf(name, text)!, text)!;
      expect(scene.mols.flatMap((m) => m.atoms.map((a) => a.sym)), name).toEqual(['C', 'Xyz']);
    }
    // other programs see an alias: a V2000 A line, Marvin's mrvAlias, Ketcher's alias
    expect(files[0][1]).toMatch(/^A {2} {2}2\nXyz$/m);
    expect(files[3][1]).toContain('mrvAlias="Xyz"');
    expect(files[4][1]).toContain('"alias": "Xyz"');
  });

  it('writes a molfile of everything drawn', () => {
    const d = draw(readScene('mol', ACETATE_V3000));
    const back = roundTrip('mol', writeMolFile(d).text);
    expect(elements(back)).toBe(elements(d));
    expect([...back.atoms.values()].find((a) => a.z === 8 && a.charge === -1)).toBeTruthy();
    expect([...back.bonds.values()].filter((b) => b.display === 'wedge')).toHaveLength(1);
  });

  it('writes each structure as an SD record', () => {
    const d = reaction();
    const text = writeSdfFile(d).text;
    expect(text.match(/\$\$\$\$/g)).toHaveLength(2);
    expect(readSdfMols(text).map((m) => m.atoms.length)).toEqual([4, 4]);
  });

  it('writes the reaction step as an RXN file, and refuses a drawing without one', () => {
    const back = readRxnFile(writeRxnFile(reaction()).text)!;
    expect(back.mols.map((m) => [m.role, m.bonds.filter((b) => b.order === 2).length])).toEqual([['reactant', 1], ['product', 0]]);
    expect(() => writeRxnFile(draw(readScene('mol', ETHANOL_V2000)))).toThrow(/no reaction/);
  });

  it('writes V3000 molfiles, SD and RXN files when asked, and reads them back the same', () => {
    const d = draw(readScene('mol', ACETATE_V3000));
    const text = writeMolFile(d, 'acetate', { v3000: true }).text;
    expect(text).toMatch(/V3000\nM {2}V30 BEGIN CTAB\nM {2}V30 COUNTS \d+ \d+ 0 0 0/);
    expect(text).toMatch(/CHG=-1/);
    expect(text).toMatch(/CFG=[13]/);
    expect(text.split('\n').every((l) => l.length <= 80)).toBe(true);
    const back = roundTrip('mol', text);
    expect(elements(back)).toBe(elements(d));
    expect([...back.bonds.values()].filter((b) => b.display === 'wedge')).toHaveLength(1);
    const sdf = writeSdfFile(reaction(), { v3000: true }).text;
    expect(sdf.match(/V3000/g)).toHaveLength(2);
    expect(readSdfMols(sdf).map((m) => m.atoms.length)).toEqual([4, 4]);
    const rxn = writeRxnFile(reaction(), '', { v3000: true }).text;
    expect(rxn.startsWith('$RXN V3000')).toBe(true);
    expect(readRxnFile(rxn)!.mols.map((m) => [m.role, m.bonds.filter((b) => b.order === 2).length])).toEqual([['reactant', 1], ['product', 0]]);
  });

  it('switches to V3000 by itself for a structure too big for V2000', () => {
    const chain = { mols: [{ atoms: Array.from({ length: 1200 }, (_, i) => ({ sym: 'C', x: i * 0.87, y: i % 2 ? 0.5 : 0 })), bonds: Array.from({ length: 1199 }, (_, i) => ({ a: i, b: i + 1, order: 1 })) }], arrows: [], pluses: [], texts: [] } as FScene;
    const text = writeMolFile(draw(chain)).text;
    expect(text).toMatch(/V3000/);
    expect(readMolfile(text)!.atoms).toHaveLength(1200);
    expect(readMolfile(text)!.bonds).toHaveLength(1199);
  });

  for (const [fmt, write] of [['mrv', writeMrvFile], ['ket', writeKetFile], ['cml', writeCmlFile], ['cdjson', writeChemDoodleJson]] as const) {
    it(`keeps a reaction step through ${fmt}`, () => {
      const d = reaction();
      const back = roundTrip(fmt, write(d).text);
      expect(elements(back)).toBe(elements(d));
      expect(back.bonds.size).toBe(d.bonds.size);
      for (const l of bondLengths(back)) expect(l).toBeCloseTo(ACS_1996.bondLength, 1);
      const steps = reactionSteps(back, schemeItems(back, plainMeasure(back)));
      expect(steps).toHaveLength(1);
      expect(steps[0].roles.reactants).toHaveLength(1);
      expect(steps[0].roles.products).toHaveLength(1);
    });
  }

  it('keeps wedges, charges and isotopes through every format', () => {
    const d = draw(readScene('cml', CML));
    // a wedge too
    d.bulk(() => { const a = [...d.atoms.values()]; const o = d.addAtom(a[0].x - 10, a[0].y - 8, 8); d.addBond(a[0].id, o.id, 1, 'wedge'); });
    for (const [fmt, write] of [['mol', writeMolFile], ['mrv', writeMrvFile], ['ket', writeKetFile], ['cml', writeCmlFile], ['cdjson', writeChemDoodleJson]] as const) {
      const back = roundTrip(fmt, write(d).text);
      const atoms = [...back.atoms.values()];
      expect(atoms.find((a) => a.z === 7)?.charge, fmt).toBe(1);
      expect(atoms.find((a) => a.isotope === 13), fmt).toBeTruthy();
      expect([...back.bonds.values()].filter((b) => b.display === 'wedge'), fmt).toHaveLength(1);
    }
  });

  it('keeps atom-atom map numbers through RXN, molfile, Marvin and Ketcher files', () => {
    // (found in the 2026-11-03 review: saving left the map numbers out)
    const d = draw(readRxnFile(rxnV2000([ACETONE], [ISOPROPANOL])));
    let n = 0;
    d.bulk(() => { for (const a of d.atoms.values()) d.updateAtom(a.id, { mapNo: (n++ % 4) + 1 }); });
    const maps = (doc: Doc) => [...doc.atoms.values()].map((a) => a.mapNo ?? 0).sort().join(' ');
    expect(maps(d)).toBe('1 1 2 2 3 3 4 4');
    expect(maps(draw(readRxnFile(writeRxnFile(d).text)))).toBe('1 1 2 2 3 3 4 4');
    expect(maps(draw(readRxnFile(writeRxnFile(d, '', { v3000: true }).text)))).toBe('1 1 2 2 3 3 4 4');
    expect(maps(roundTrip('mol', writeMolFile(d).text))).toBe('1 1 2 2 3 3 4 4');
    expect(maps(roundTrip('mrv', writeMrvFile(d).text))).toBe('1 1 2 2 3 3 4 4');
    expect(maps(roundTrip('ket', writeKetFile(d).text))).toBe('1 1 2 2 3 3 4 4');
  });

  it('reads a Chem4Word CML file the way Word shows it (Chem4Word keeps y downwards), so wedges keep their meaning', () => {
    // (found in the 2026-11-03 review: opened as a .cml file it came in upside down, the mirror image)
    const contents = { atoms: [
      { id: 1, x: 0, y: 0, z: 6, label: null, charge: 0, isotope: 0, just: 'auto' as const },
      { id: 2, x: 14.4, y: 0, z: 6, label: null, charge: 0, isotope: 0, just: 'auto' as const },
      { id: 3, x: 21.6, y: 12.5, z: 8, label: null, charge: 0, isotope: 0, just: 'auto' as const },
    ], bonds: [{ id: 4, a1: 1, a2: 2, order: 1, display: 'solid' as const, dpos: 'auto' as const }, { id: 5, a1: 2, a2: 3, order: 1, display: 'wedge' as const, dpos: 'auto' as const }], captions: [], arrows: [], shapes: [] };
    const text = writeCml(contents, 'guid-1');
    const d = draw(readCmlFile(text));
    const o = [...d.atoms.values()].find((a) => a.z === 8)!;
    const c = [...d.atoms.values()].filter((a) => a.z === 6).sort((p, q) => q.x - p.x)[0];
    // in Word the O sits below the carbon it is on (y grows downwards on the page)
    expect(o.y).toBeGreaterThan(c.y);
    // plain CML stays y upwards
    const plain = draw(readScene('cml', CML));
    const n = [...plain.atoms.values()].find((a) => a.z === 7)!, c13 = [...plain.atoms.values()].find((a) => a.isotope === 13)!;
    expect(c13.y).toBeLessThan(n.y);
  });

  it('keeps the conditions over the arrow as text in Marvin and Ketcher files, and leaves them out of RXN', () => {
    const d = draw(readMrv(MRV_RXN));
    for (const write of [writeMrvFile, writeKetFile]) {
      const back = draw(readScene(write === writeMrvFile ? 'mrv' : 'ket', write(d).text));
      expect([...back.captions.values()].map((c) => c.runs.map((r) => r.text).join(''))).toContain('NaBH4');
      expect(reactionSteps(back, schemeItems(back, plainMeasure(back)))[0].roles.above).toHaveLength(1);
    }
    // as Copy As RXN does: text conditions aren't species
    expect(readRxnFile(writeRxnFile(d).text)!.mols.filter((m) => m.role === 'agent')).toHaveLength(0);
  });
});
