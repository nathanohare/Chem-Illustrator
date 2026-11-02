// @vitest-environment jsdom
//
// Energy diagrams from DFT: reading Gaussian and ORCA output (energies, imaginary frequencies,
// level of theory, last geometry) and drawing what comes of it (‡, ΔG‡ and ΔG arrows, the
// structures, the level of theory).

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { plainMeasure } from '../src/chem/reaction';
import { plainText } from '../src/richtext';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { HARTREE, gaussianTheory, orcaTheory, pickEnergy, readQmOutput, speciesName } from '../src/chem/qm-output';
import { ENERGY_DEFAULTS, geomSpec, putEnergy, type EnergyData } from '../src/design/energy';

const geomBlock = (atoms: [number, number, number, number][]) => [
  '                         Standard orientation:',
  ' ---------------------------------------------------------------------',
  ' Center     Atomic      Atomic             Coordinates (Angstroms)',
  ' Number     Number       Type             X           Y           Z',
  ' ---------------------------------------------------------------------',
  ...atoms.map(([z, x, y, zz], i) => `      ${i + 1}          ${z}           0        ${x.toFixed(6)}    ${y.toFixed(6)}    ${zz.toFixed(6)}`),
  ' ---------------------------------------------------------------------',
].join('\n');

const WATER: [number, number, number, number][] = [[8, 0, 0, 0.117], [1, 0, 0.757, -0.469], [1, 0, -0.757, -0.469]];

function gaussian(opts: { free?: number; scf: number; freqs?: number[]; route?: string; done?: boolean }) {
  return [
    ' Entering Gaussian System, Link 0=g16',
    ' Gaussian, Inc.  All Rights Reserved.',
    ' ----------------------------------------------------------------------',
    ` ${opts.route ?? '#p opt freq b3lyp/6-31g(d) empiricaldispersion=gd3bj'}`,
    '  scrf=(smd,solvent=thf)',
    ' ----------------------------------------------------------------------',
    geomBlock(WATER.map(([z, x, y, zz]) => [z, x + 1, y, zz])),
    ` SCF Done:  E(RB3LYP) =  ${(opts.scf + 0.1).toFixed(6)}     A.U. after   12 cycles`,
    geomBlock(WATER),
    ` SCF Done:  E(RB3LYP) =  ${opts.scf.toFixed(6)}     A.U. after    8 cycles`,
    ...(opts.freqs ? [
      ' Harmonic frequencies (cm**-1), IR intensities (KM/Mole), Raman scattering',
      ` Frequencies --  ${opts.freqs.slice(0, 3).map((f) => f.toFixed(4)).join('   ')}`,
      ` Frequencies --  ${opts.freqs.slice(3).map((f) => f.toFixed(4)).join('   ')}`,
    ] : []),
    ...(opts.free !== undefined ? [` Sum of electronic and thermal Free Energies=          ${opts.free.toFixed(6)}`] : []),
    opts.done === false ? '' : ' Normal termination of Gaussian 16 at Mon Nov  2 06:00:00 2026.',
  ].join('\n');
}

const ORCA = [
  '                                 * O   R   C   A *',
  '================================================================================',
  '                                       INPUT FILE',
  '================================================================================',
  '|  1> ! r2SCAN-3c OptTS Freq CPCM(Toluene) TightSCF',
  '|  2> * xyz 0 1',
  '|  3> O 0 0 0',
  '|  4> *',
  '---------------------------------',
  'CARTESIAN COORDINATES (ANGSTROEM)',
  '---------------------------------',
  '  O      0.000000    0.000000    0.117000',
  '  H      0.000000    0.757000   -0.469000',
  '  H      0.000000   -0.757000   -0.469000',
  '',
  'FINAL SINGLE POINT ENERGY       -76.400000000',
  '-----------------------',
  'VIBRATIONAL FREQUENCIES',
  '-----------------------',
  '   6:      -412.33 cm**-1 ***imaginary mode***',
  '   7:      1600.00 cm**-1',
  'NORMAL MODES',
  'Final Gibbs free energy         ...    -76.390000 Eh',
  '                             ****ORCA TERMINATED NORMALLY****',
].join('\n');

describe('reading Gaussian and ORCA output', () => {
  it('reads a Gaussian job: free energy, imaginary frequencies, theory and the last geometry', () => {
    const r = readQmOutput(gaussian({ scf: -100.5, free: -100.45, freqs: [-350.2, 120, 300, 900, 1200, 1600] }), 'C:\\jobs\\ts1.log')!;
    expect(r.program).toBe('Gaussian');
    expect(r.name).toBe('ts1');
    expect(r.scf).toBeCloseTo(-100.5, 6);
    expect(r.free).toBeCloseTo(-100.45, 6);
    expect(r.imaginary).toBe(1);
    expect(r.theory).toBe('B3LYP-D3(BJ)/6-31G(d), SMD(THF)');
    expect(r.atoms.map((a) => a.el)).toEqual(['O', 'H', 'H']);
    // the last orientation, not the first
    expect(r.atoms[0].x).toBe(0);
    expect(r.unfinished).toBe(false);
    expect(speciesName(r)).toBe('TS1‡');
  });

  it('a minimum has no imaginary frequency; a single point has no frequency job', () => {
    expect(readQmOutput(gaussian({ scf: -1, free: -0.9, freqs: [100, 200, 300, 400, 500, 600] }), 'int.log')!.imaginary).toBe(0);
    const sp = readQmOutput(gaussian({ scf: -1, done: false }), 'sm.out')!;
    expect(sp.imaginary).toBeNull();
    expect(sp.free).toBeNull();
    expect(sp.unfinished).toBe(true);
  });

  it('reads an ORCA job', () => {
    const r = readQmOutput(ORCA, 'TS-OA.out')!;
    expect(r.program).toBe('ORCA');
    expect(r.scf).toBeCloseTo(-76.4, 6);
    expect(r.free).toBeCloseTo(-76.39, 6);
    expect(r.imaginary).toBe(1);
    expect(r.theory).toBe('r²SCAN-3c, CPCM(toluene)');
    expect(r.atoms.length).toBe(3);
    expect(r.unfinished).toBe(false);
    expect(speciesName(r)).toBe('TS-OA‡');
  });

  it('writes the level of theory the way papers do', () => {
    expect(gaussianTheory('#p opt freq m062x/def2tzvp')).toBe('M06-2X/def2-TZVP');
    expect(gaussianTheory('# wb97xd/6-311+g(d,p) scrf=(pcm,solvent=dichloromethane)')).toBe('ωB97X-D/6-311+G(d,p), PCM(CH₂Cl₂)');
    expect(orcaTheory(['! B3LYP D3BJ def2-TZVP def2/J RIJCOSX Opt Freq'])).toBe('B3LYP-D3(BJ)/def2-TZVP');
    expect(orcaTheory(['! PBE0 D4 def2-SVP', '%cpcm smd true', ' SMDsolvent "water"', 'end'])).toBe('PBE0-D4/def2-SVP, SMD(water)');
  });

  it('is not fooled by other text', () => {
    expect(readQmOutput('just some notes about a reaction', 'notes.txt')).toBeNull();
  });

  it('uses free energies only when every file has one', () => {
    const a = readQmOutput(gaussian({ scf: -1, free: -0.9, freqs: [1, 2, 3, 4, 5, 6] }), 'a.log')!;
    const b = readQmOutput(gaussian({ scf: -1 }), 'b.log')!;
    expect(pickEnergy([a]).quantity).toBe('ΔG');
    expect(pickEnergy([a, b]).quantity).toBe('ΔE');
    expect(HARTREE['kcal/mol']).toBeCloseTo(627.5095, 3);
  });
});

describe('energy diagrams from DFT', () => {
  const water = readQmOutput(ORCA, 'w.out')!.atoms;
  const d = (more: Partial<EnergyData> = {}): EnergyData => ({
    ...ENERGY_DEFAULTS, quantity: 'ΔG', unit: 'kcal/mol', w: 240, h: 150,
    paths: [{ name: '', color: '#000000', points: [{ label: 'SM', g: 0, geom: water }, { label: 'TS1‡', g: 21.4, geom: water }, { label: 'P', g: -7.2, geom: water }] }],
    ...more,
  });
  const put = (data: EnergyData) => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    const id = doc.edit('e', () => putEnergy(doc, m, data, { x: 100, y: 100 }));
    return { doc, m, id };
  };
  const texts = (doc: Doc) => [...doc.captions.values()].map((c) => plainText(c.runs));

  it('marks the overall change with a double arrow and a dashed line back to the start', () => {
    const { doc } = put(d({ overall: true, barrier: true }));
    expect(texts(doc)).toContain('ΔG = −7.2');
    expect(texts(doc)).toContain('ΔG‡ = 21.4');
    const doubles = [...doc.arrows.values()].filter((r) => r.headStyle === 'full' && r.tailStyle === 'full');
    expect(doubles.length).toBe(2);
  });

  it('writes the level of theory', () => {
    const { doc } = put(d({ theory: 'B3LYP-D3(BJ)/def2-TZVP, SMD(THF)' }));
    expect(texts(doc)).toContain('B3LYP-D3(BJ)/def2-TZVP, SMD(THF)');
  });

  it('draws each structure as balls and sticks: over a transition state, under a minimum', () => {
    const { doc, m, id } = put(d({ structures: true }));
    const balls = [...doc.shapes.values()].filter((s) => s.kind === 'oval' && s.fill === 'shaded');
    expect(balls.length).toBe(9);
    const ts = doc.captions.get([...doc.captions.values()].find((c) => plainText(c.runs) === 'TS1‡')!.id)!;
    const tsBox = m.captionBox(ts);
    const midX = (tsBox.x1 + tsBox.x2) / 2;
    const over = balls.filter((b) => Math.abs((b.x1 + b.x2) / 2 - midX) < 40);
    expect(over.length).toBe(3);
    // the frame holds them, and drawing again replaces them rather than adding more
    expect(doc.shapes.get(id)!.frame!.shapes.length).toBeGreaterThan(9);
    doc.edit('again', () => putEnergy(doc, m, { ...doc.shapes.get(id)!.energy!, digits: 2 }, { x: 100, y: 100 }, id));
    expect([...doc.shapes.values()].filter((s) => s.kind === 'oval' && s.fill === 'shaded').length).toBe(9);
  });

  it('finds bonds from the covalent radii', () => {
    expect(geomSpec(water).bonds.length).toBe(2);
  });

  it('keeps the geometries and file energies through CDXML', () => {
    const data = d({ structures: true, overall: true, theory: 'PBE0/def2-SVP' });
    data.paths[0].points[1].eh = -76.39;
    const { doc } = put(data);
    const back = readCdxml(writeCdxml(doc)).doc;
    const f = [...back.shapes.values()].find((s) => s.energy)!;
    expect(f.energy!.overall).toBe(true);
    expect(f.energy!.theory).toBe('PBE0/def2-SVP');
    expect(f.energy!.paths[0].points[1].eh).toBe(-76.39);
    expect(f.energy!.paths[0].points[0].geom!.length).toBe(3);
  });
});
