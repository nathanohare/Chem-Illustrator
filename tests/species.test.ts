// @vitest-environment jsdom
//
// Text boxes read as chemistry: the curated list of ions, reagents and ligands, condensed
// formulas and salts, what is left as plain text, and counting them with a drawing.

import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import { toMolfile } from '../src/chem/molfile';
import { allSpecies, captionChemWarning, captionReading, captionSpecies, groupedIons, readSpecies, speciesFormula, speciesSmiles } from '../src/chem/species';
import { plainMeasure } from '../src/chem/reaction';
import { setSideText } from '../src/chem/arrow-text';
import { writeCdxml } from '../src/io/cdxml-write';
import { readCdxml } from '../src/io/cdxml';
import { textRuns } from '../src/chem/arrow-text';
import { SPECIES_ENTRIES } from '../src/chem/species-list';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); }, 60000);

/** Canonical SMILES of what the chemistry engine reads from a species counted on its own. */
function engineSmiles(text: string): string | null {
  const sp = readSpecies(text);
  if (!sp) return null;
  const doc = new Doc();
  const { molblock } = toMolfile(doc, [], '', { species: [{ graph: sp.graph, x: 0, y: 0 }] });
  const mol = RDKit.get_mol(molblock);
  if (!mol?.is_valid()) return null;
  const s = mol.get_smiles();
  mol.delete();
  return s;
}

function canonical(smiles: string): string {
  const mol = RDKit.get_mol(smiles);
  expect(mol?.is_valid(), smiles).toBe(true);
  const s = mol.get_smiles();
  mol.delete();
  return s;
}

describe('the list of ions, reagents and ligands', () => {
  it('is read by the chemistry engine as the molecule each entry names', () => {
    for (const e of SPECIES_ENTRIES) {
      const name = e.names[0];
      const sign = e.needsSign ? (canonical(e.smiles).includes('+') && !canonical(e.smiles).includes('-') ? '+' : '−') : '';
      expect(engineSmiles(name + sign), name).toBe(canonical(e.smiles));
      // the SMILES written out again means the same
      expect(canonical(speciesSmiles(readSpecies(name + sign)!)), name).toBe(canonical(e.smiles));
    }
  });
  it('has no name twice with the same charge', () => {
    const seen = new Map<string, string>();
    for (const e of SPECIES_ENTRIES) for (const n of e.names) {
      const key = n + '|' + (e.needsSign ? 'sign' : 'plain');
      expect(seen.get(key), `${n} in ${e.name} and ${seen.get(key)}`).toBeUndefined();
      seen.set(key, e.name);
    }
  });
});

describe('reading a text box', () => {
  it('reads counterions with and without their charge', () => {
    for (const t of ['BF4−', 'BF4-', '[BF4]−', 'BF₄⁻', 'BF4 −']) {
      const sp = readSpecies(t)!;
      expect(sp.name, t).toBe('tetrafluoroborate');
      expect(sp.expected, t).toBeUndefined();
    }
    const bare = readSpecies('BF4')!;
    expect(bare.name).toBe('tetrafluoroborate');
    expect(bare.charge).toBe(-1);
    expect(bare.expected).toBe(-1);
    expect(speciesFormula(bare)).toBe('BF4−');
    expect(readSpecies('PF6−')!.name).toBe('hexafluorophosphate');
    expect(readSpecies('OTf')!.expected).toBe(-1);
    expect(readSpecies('OTf−')!.expected).toBeUndefined();
    for (const t of ['NTf2−', 'ClO4−', 'SbF6−', 'BArF−', 'OTs−', 'B(C6F5)4−', 'NBu4+', 'PPh4+', 'NH4+']) expect(readSpecies(t)?.expected, t).toBeUndefined();
    // the wrong charge is flagged too
    expect(readSpecies('BF4+')!.expected).toBe(-1);
    expect(readSpecies('SO4 2−')!.charge).toBe(-2);
    expect(readSpecies('SO₄²⁻')!.expected).toBeUndefined();
    expect(readSpecies('SO4')!.expected).toBe(-2);
  });
  it('reads one element with a charge, but not a lone element', () => {
    expect(readSpecies('Na+')!.charge).toBe(1);
    expect(readSpecies('Fe3+')!.charge).toBe(3);
    expect(readSpecies('Cl−')!.charge).toBe(-1);
    for (const t of ['Cl', 'A', 'B', 'C', 'N', 'I', 'K', 'H', 'In', 'No', 'He']) expect(readSpecies(t), t).toBeNull();
  });
  it('reads names that mean something else without a charge only with it', () => {
    expect(readSpecies('CN')).toBeNull();
    expect(readSpecies('CN−')!.name).toBe('cyanide');
    expect(readSpecies('OH')).toBeNull();
    expect(readSpecies('OH−')!.name).toBe('hydroxide');
    expect(readSpecies('NO2')).toBeNull();
    expect(readSpecies('NO2−')!.name).toBe('nitrite');
    expect(readSpecies('TFA')!.name).toBe('trifluoroacetic acid');
    expect(readSpecies('TFA−')!.name).toBe('trifluoroacetate');
  });
  it('reads reagents, solvents and ligands written as abbreviations', () => {
    for (const [t, f] of [['DMAP', 'C7H10N2'], ['THF', 'C4H8O'], ['mCPBA', 'C7H5ClO3'], ['DIPEA', 'C8H19N'], ['n-BuLi', 'C4H9Li'], ['PPh3', 'C18H15P'],
      ['dppe', 'C26H24P2'], ['COD', 'C8H12'], ['XPhos', 'C33H49P'], ['BINAP', 'C44H32P2'], ['9-BBN', 'C8H15B'], ['DMSO-d6', 'C2D6OS'], ['TBAF', 'C16H36FN']] as const) {
      expect(speciesFormula(readSpecies(t)!), t).toBe(f);
    }
  });
  it('reads condensed formulas that are whole molecules', () => {
    for (const [t, f] of [['CH2Cl2', 'CH2Cl2'], ['MeOH', 'CH4O'], ['H2O', 'H2O'], ['HCl', 'ClH'], ['CHCl3', 'CHCl3'], ['Pd(OAc)2', 'C4H6O4Pd'], ['CuI', 'CuI'],
      ['PdCl2', 'Cl2Pd'], ['NaH', 'HNa'], ['Et3N', 'C6H15N'], ['HNEt3+', 'C6H16N+'], ['PhCH2Br', 'C7H7Br'], ['Me3SiCl', 'C3H9ClSi']] as const) {
      expect(speciesFormula(readSpecies(t)!), t).toBe(f);
    }
  });
  it('reads salts written as one formula', () => {
    expect(speciesSmiles(readSpecies('NaBF4')!)).toBe('[Na+].F[B-](F)(F)F');
    expect(speciesFormula(readSpecies('Cs2CO3')!)).toBe('CCs2O3');
    expect(speciesFormula(readSpecies('K3PO4')!)).toBe('K3O4P');
    expect(speciesFormula(readSpecies('Mg(OTf)2')!)).toBe('C2F6MgO6S2');
    expect(speciesFormula(readSpecies('AgSbF6')!)).toBe('AgF6Sb');
    expect(speciesFormula(readSpecies('NBu4PF6')!)).toBe('C16H36F6NP');
    expect(speciesSmiles(readSpecies('NH4Cl')!)).toBe('[NH4+].[Cl-]');
    expect(speciesSmiles(readSpecies('LiCl')!)).toBe('[Li+].[Cl-]');
    expect(speciesFormula(readSpecies('BF3·OEt2')!)).toBe('C4H10BF3O');
  });
  it('leaves ordinary captions, groups and look-alike words as text', () => {
    for (const t of ['Step 2', 'rt, 12 h', '12 h', '1a', '2', '(±)-3', 'A', 'Ph', 'Me', 'Boc', 'OMe', 'OTBS', 'NHBoc', 'CO2Me', 'CF3', 'CHO', 'COOH',
      'PhD', 'TS1', 'TS', 'SN2', 'NMR', 'HPLC', 'IC50', 'Yes', 'No', 'OFF', 'Ar', 'R', 'R1', 'X', 'rt', 'hν', 'Δ', 'reflux', 'quant.', '85%', 'Scheme 1', 'Table S1',
      'BF4 and PF6', 'BF4\nPF6', 'Cl2 (g)']) {
      expect(readSpecies(t), JSON.stringify(t)).toBeNull();
    }
  });
});

describe('counting text boxes with a drawing', () => {
  it('adds each one as its own molecule', () => {
    const doc = new Doc();
    doc.edit('n', () => { doc.addAtom(0, 0, 7, { charge: 1 }); });
    const n = [...doc.atoms.keys()];
    const bf4 = readSpecies('BF4−')!;
    const { molblock, map } = toMolfile(doc, n, '', { species: [{ graph: bf4.graph, x: 30, y: 0 }] });
    expect(map.filter((m) => m === -1).length).toBe(5);
    const mol = RDKit.get_mol(molblock);
    expect(mol.get_smiles()).toBe(canonical('[NH4+].F[B-](F)(F)F'));
    mol.delete();
  });
  it('keeps a radical or a free carbene as one', () => {
    expect(engineSmiles('TEMPO')).toBe(canonical('CC1(C)CCCC(C)(C)N1[O]'));
    expect(engineSmiles('IMes')).toBe(canonical('[C]1N(c2c(C)cc(C)cc2C)C=CN1c1c(C)cc(C)cc1C'));
  });
});

const text = (doc: Doc, t: string, x = 100, y = 100, extra = {}) => doc.edit('t', () => doc.addCaption({ x, y, runs: textRuns(t), justify: 'left', ...extra }));

describe('text boxes in a drawing', () => {
  it('reads a free text box as chemistry, and leaves the text above and below arrows as text', () => {
    const doc = new Doc();
    const m = plainMeasure(doc);
    const r = doc.edit('arrow', () => doc.addArrow({ tail: { x: 100, y: 200 }, head: { x: 160, y: 200 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 1.5 }));
    doc.edit('t', () => setSideText(doc, m, r, 'above', 'DMAP'));
    doc.edit('t', () => setSideText(doc, m, doc.arrows.get(r.id)!, 'below', 'CH2Cl2'));
    const free = text(doc, 'DMAP', 300, 40);
    const above = [...doc.captions.values()].find((c) => c.id !== free.id && c.runs.map((x) => x.text).join('') === 'DMAP')!;
    expect(captionSpecies(doc, free, m)?.name).toBe('4-(dimethylamino)pyridine');
    expect(captionReading(doc, above, m)).toMatchObject({ species: null, why: 'arrow' });
    // set to Chemical by hand, it counts
    doc.edit('c', () => doc.updateCaption(above.id, { chem: true }));
    expect(captionSpecies(doc, doc.captions.get(above.id)!, m)?.name).toBe('4-(dimethylamino)pyridine');
    // and a free one set to Plain text doesn't
    doc.edit('c', () => doc.updateCaption(free.id, { chem: false }));
    expect(captionReading(doc, doc.captions.get(free.id)!, m)).toMatchObject({ species: null, why: 'plain' });
  });
  it('leaves text tied to a structure and ordinary captions alone', () => {
    const doc = new Doc();
    const a = doc.edit('a', () => doc.addAtom(0, 0, 6));
    const tied = text(doc, 'C6H6', 0, 20, { attach: { atoms: [a.id], side: 'below', gap: 4, shift: 0, role: 'descriptors' } });
    const step = text(doc, 'Step 2', 0, 60);
    expect(captionReading(doc, tied)).toMatchObject({ species: null, why: 'tied' });
    expect(captionReading(doc, step)).toMatchObject({ species: null, why: 'unread' });
    expect(captionChemWarning(doc, step)).toBeNull();
  });
  it('flags a counterion without its charge, and text set to Chemical that cannot be read', () => {
    const doc = new Doc();
    const bf4 = text(doc, 'BF4');
    expect(captionChemWarning(doc, bf4)).toMatch(/Invalid valence.*tetrafluoroborate carries a − charge/i);
    const ok = text(doc, 'BF4−', 200);
    expect(captionChemWarning(doc, ok)).toBeNull();
    const odd = text(doc, 'Step 2', 300, 100, { chem: true });
    expect(captionChemWarning(doc, odd)).toMatch(/can't be read as chemistry/);
  });
  it('counts an ion grouped with a structure as one salt', async () => {
    const doc = new Doc();
    const n = doc.edit('n', () => doc.addAtom(0, 0, 7, { charge: 1, label: 'NMe4' }));
    const bf4 = text(doc, 'BF4−', 30, 0);
    expect(groupedIons(doc, [n.id])).toEqual([]);
    doc.edit('g', () => { doc.updateAtom(n.id, { grp: 1 }); doc.updateCaption(bf4.id, { grp: 1 }); });
    const ions = groupedIons(doc, [n.id]);
    expect(ions.map((c) => c.id)).toEqual([bf4.id]);
    const sp = allSpecies(doc).map((p) => p);
    const { molblock } = toMolfile(doc, [n.id], '', { species: sp });
    const mol = RDKit.get_mol(molblock);
    expect(mol.get_smiles()).toBe(canonical('C[N+](C)(C)C.F[B-](F)(F)F'));
    mol.delete();
  });
  it('keeps the choice of Chemical or Plain text in CDXML, and marks chemistry for ChemDraw', () => {
    const doc = new Doc();
    text(doc, 'BF4−', 0, 0);
    text(doc, 'DMAP', 100, 0, { chem: false });
    text(doc, 'Step 2', 200, 0, { chem: true });
    text(doc, 'rt, 12 h', 300, 0);
    const xml = writeCdxml(doc, { name: 't' });
    expect((xml.match(/InterpretChemically="yes"/g) ?? []).length).toBe(1);
    const back = readCdxml(xml).doc;
    const by = (t: string) => [...back.captions.values()].find((c) => c.runs.map((r) => r.text).join('') === t)!;
    expect(by('BF4−').chem).toBeUndefined();
    expect(by('DMAP').chem).toBe(false);
    expect(by('Step 2').chem).toBe(true);
    expect(by('rt, 12 h').chem).toBeUndefined();
  });
});

describe('text boxes after a ChemDraw save', () => {
  // ChemDraw 25 turns text it interprets into lone labels on saving: BF4- as a nickname with the
  // charge on one F of its inner fragment, DMAP as an Unspecified label of D, M, A and P
  const saved = `<?xml version="1.0" encoding="UTF-8" ?><CDXML CreationProgram="ChemDraw 25.0.2.14" BondLength="14.40"><page id="1">`
    + `<fragment id="10"><n id="11" p="112.36 395.87" NodeType="Fragment" NeedsClean="yes"><fragment id="12">`
    + `<n id="13" p="141.14 399.46" Element="5" NumHydrogens="0"/><n id="14" p="128.71 406.63" Element="9" NumHydrogens="0"/>`
    + `<n id="15" p="153.57 406.63" Element="9" NumHydrogens="0"/><n id="16" p="141.14 385.11" Element="9" NumHydrogens="0"/>`
    + `<n id="17" p="114.36 395.87" Element="9" NumHydrogens="0" Charge="-1"/><b id="18" B="13" E="14"/><b id="19" B="13" E="15"/><b id="20" B="13" E="16"/></fragment>`
    + `<t id="21" p="109.03 399.77" BoundingBox="109.03 391.43 128.48 401.97" LabelJustification="Left"><s font="3" size="10" color="0" face="96">BF4-</s></t></n></fragment>`
    + `<fragment id="30"><n id="31" p="253.80 395.87" Warning="An atom in this label has an invalid valence." NodeType="Unspecified" NeedsClean="yes"><fragment id="32">`
    + `<n id="33" p="235.91 392.28" Element="1" Isotope="2"/><n id="34" p="248.34 399.46" NodeType="GenericNickname" GenericNickname="M"/></fragment>`
    + `<t id="35" p="250.19 399.77" BoundingBox="250.19 391.43 279.08 399.77"><s font="3" size="10" color="0" face="96">DMAP</s></t></n></fragment>`
    + `</page></CDXML>`;

  it('reads them back as text boxes read as chemistry, with no false valence warnings', () => {
    const doc = readCdxml(saved).doc;
    expect(doc.atoms.size).toBe(0);
    const caps = [...doc.captions.values()];
    expect(caps.map((c) => c.runs.map((r) => r.text).join(''))).toEqual(['BF4-', 'DMAP']);
    for (const c of caps) expect(captionSpecies(doc, c)).toBeTruthy();
  });

  it('takes a label\'s charge from its inner fragment when the label has none of its own', () => {
    const bonded = saved.replace('<fragment id="10"><n id="11"', '<fragment id="10"><n id="9" p="90 395.87" Element="6"/><b id="8" B="9" E="11"/><n id="11"');
    const a = [...readCdxml(bonded).doc.atoms.values()].find((x) => x.label);
    expect(a?.charge).toBe(-1);
  });
});
