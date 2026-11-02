// @vitest-environment jsdom
//
// The Ligand Library: its ligands and their drawings on a metal, typed abbreviations (dppf,
// dtbbpy, IPr*) read as the ligand, tooltips, Expand Label, electron counting, the search, and
// the window. Adding several hundred abbreviations must not change how other labels read.

import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import { LIGANDS, LIGAND_FAMILIES, bondingType, denticity, ligandByAbbr, searchLigands } from '../src/chem/ligands';
import { TEMPLATES, templateById, placeTemplate, freePlacement } from '../src/chem/templates';
import { labelGraph, parseSmiles, tokenize } from '../src/chem/labels';
import { labelTip } from '../src/chem/label-tip';
import { countElectrons } from '../src/chem/electrons';
import { expandInPlace, expandLigand, freeLigandFor, inPlaceSmiles, labelSmiles, ligandTemplateFor, loadFullLigands } from '../src/chem/expand';
import FULL from '../src/chem/ligand-library-full.json';
import { templateIcon } from '../src/ui/template-icons';
import { LigandLibraryWindow } from '../src/ui/ligand-library';

/** How each label read before the library's abbreviations were added: first atom : the rest : bonds. */
const BEFORE: Record<string, string | null> = {
  "OMe": "8:6:1",
  "OEt": "8:6,6:2",
  "OH": "8::0",
  "NH2": "7::0",
  "NHBoc": "7:6,6,6,6,6,8,8:7",
  "NHCbz": "7:6,6,6,6,6,6,6,6,8,8:11",
  "NHFmoc": "7:6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,8,8:20",
  "NHAc": "7:6,6,8:3",
  "NMe2": "7:6,6:2",
  "NEt2": "7:6,6,6,6:4",
  "CO2Me": "6:6,8,8:3",
  "CO2Et": "6:6,6,8,8:4",
  "CO2tBu": "6:6,6,6,6,8,8:6",
  "CO2H": "6:8,8:2",
  "COOH": "6:8,8:2",
  "CO2Bn": "6:6,6,6,6,6,6,6,8,8:10",
  "CHO": "6:8:1",
  "COMe": "6:6,8:2",
  "CONH2": "6:7,8:2",
  "CN": "6:7:1",
  "NO2": "7+1:8,8-1:2",
  "CF3": "6:9,9,9:3",
  "CCl3": "6:17,17,17:3",
  "N3": "7:7+1,7-1:2",
  "CH2OH": "6:8:1",
  "CH2OMe": "6:6,8:2",
  "CH2Cl": "6:17:1",
  "CH2Br": "6:35:1",
  "CH2NH2": "6:7:1",
  "CH2CH3": "6:6:1",
  "CH3": "6::0",
  "CH(CH3)2": "6:6,6:2",
  "C(CH3)3": "6:6,6,6:3",
  "(CH2)3OH": "6:6,6,8:3",
  "OTBS": "8:14,6,6,6,6,6,6:7",
  "OTIPS": "8:14,6,6,6,6,6,6,6,6,6:10",
  "OTES": "8:14,6,6,6,6,6,6:7",
  "OTMS": "8:14,6,6,6:4",
  "OTBDPS": "8:14,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6:19",
  "OBn": "8:6,6,6,6,6,6,6:8",
  "OPMB": "8:6,6,6,6,6,6,6,6,8:10",
  "OMOM": "8:6,6,8:3",
  "OBz": "8:6,6,6,6,6,6,6,8:9",
  "OPiv": "8:6,6,6,6,6,8:6",
  "OAc": "8:6,6,8:3",
  "OTf": "8:16,6,8,8,9,9,9:7",
  "OTs": "8:16,6,6,6,6,6,6,6,8,8:11",
  "OMs": "8:16,6,8,8:4",
  "SPh": "16:6,6,6,6,6,6:7",
  "SMe": "16:6:1",
  "SO2Ph": "16:6,6,6,6,6,6,8,8:9",
  "SO2Me": "16:6,8,8:3",
  "Ph": "6:6,6,6,6,6:6",
  "Bn": "6:6,6,6,6,6,6:7",
  "Bz": "6:6,6,6,6,6,6,8:8",
  "Ac": "6:6,8:2",
  "Boc": "6:6,6,6,6,8,8:6",
  "Cbz": "6:6,6,6,6,6,6,6,8,8:10",
  "Fmoc": "6:6,6,6,6,6,6,6,6,6,6,6,6,6,6,8,8:19",
  "Ts": "16:6,6,6,6,6,6,6,8,8:10",
  "Ms": "16:6,8,8:3",
  "Tf": "16:6,8,8,9,9,9:6",
  "TMS": "14:6,6,6:3",
  "TBS": "14:6,6,6,6,6,6:6",
  "TIPS": "14:6,6,6,6,6,6,6,6,6:9",
  "PMB": "6:6,6,6,6,6,6,6,8:9",
  "MOM": "6:6,8:2",
  "THP": "6:6,6,6,6,8:6",
  "Tr": "6:6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6:21",
  "Cy": "6:6,6,6,6,6:6",
  "Mes": "6:6,6,6,6,6,6,6,6:9",
  "Tol": "6:6,6,6,6,6,6:7",
  "iPr": "6:6,6:2",
  "tBu": "6:6,6,6:3",
  "t-Bu": "6:6,6,6:3",
  "n-Bu": "6:6,6,6:3",
  "Et": "6:6:1",
  "Me": "6::0",
  "Pr": "6:6,6:2",
  "Bpin": "5:6,6,6,6,6,6,8,8:9",
  "B(OH)2": "5:8,8:2",
  "SiMe3": "14:6,6,6:3",
  "SiEt3": "14:6,6,6,6,6,6:6",
  "SnBu3": "50:6,6,6,6,6,6,6,6,6,6,6,6:12",
  "SnMe3": "50:6,6,6:3",
  "PPh2": "15:6,6,6,6,6,6,6,6,6,6,6,6:14",
  "PPh3": "15:6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6:21",
  "PCy2": "15:6,6,6,6,6,6,6,6,6,6,6,6:14",
  "PCy3": "15:6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6:21",
  "P(t-Bu)2": "15:6,6,6,6,6,6,6,6:8",
  "PiPr2": "15:6,6,6,6,6,6:6",
  "PMe2": "15:6,6:2",
  "PMe3": "15:6,6,6:3",
  "P(o-Tol)2": "15:6,6,6,6,6,6,6,6,6,6,6,6,6,6:16",
  "POPh2": "15:6,6,6,6,6,6,6,6,6,6,6,6,8:15",
  "P(O)Ph2": "15:6,6,6,6,6,6,6,6,6,6,6,6,8:15",
  "P(OEt)2": "15:6,6,6,6,8,8:6",
  "PO(OEt)2": "15:6,6,6,6,8,8,8:7",
  "AsPh3": "33:6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6:21",
  "SbPh3": "51:6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6:21",
  "OPh": "8:6,6,6,6,6,6:7",
  "NPh2": "7:6,6,6,6,6,6,6,6,6,6,6,6:14",
  "NHPh": "7:6,6,6,6,6,6:7",
  "MgBr": "12:35:1",
  "Li": "3::0",
  "ZnCl": "30:17:1",
  "Cu": "29::0",
  "HN": "7::0",
  "HO": "8::0",
  "MeO": "8:6:1",
  "BocHN": "7:6,6,6,6,6,8,8:7",
  "F3C": "6:9,9,9:3",
  "O2N": "7+1:8,8-1:2",
  "HO2C": "6:8,8:2",
  "MeO2C": "6:6,8,8:3",
  "NC": "6:7:1",
  "Cp": "6:6,6,6,6:5",
  "Cp*": "6:6,6,6,6,6,6,6,6,6:10",
  "THF": "8:6,6,6,6:5",
  "DMF": "8:6,6,6,7:4",
  "DMSO": "8:16,6,6:3",
  "CO": "6:8:1",
  "acac": "8:6,6,6,6,6,8:6",
  "py": "7:6,6,6,6,6:6",
  "OCH2O": "8:6,8:2",
  "CO2": "6:8,8:2",
  "SO3H": "16:8,8,8:3",
  "SO2NH2": "16:7,8,8:3",
  "NHNH2": "7:7:1",
  "N=NPh": null,
  "C≡CH": null,
  "CH=CH2": null,
  "OCF3": "8:6,9,9,9:4",
  "SF5": "16:9,9,9,9,9:5",
  "NCO": "7:6,8:2",
  "NCS": "7:16,6:2",
  "SCN": "16:6,7:2",
  "OCN": "8:6,7:2",
  "CONMe2": "6:6,6,7,8:4",
  "NMe3+": "7+1:6,6,6:3",
  "N(CH3)2": "7:6,6:2",
  "Si(iPr)3": "14:6,6,6,6,6,6,6,6,6:9",
  "Ar": "0::0",
  "R": "0::0",
  "X": "0::0"
};

const reading = (label: string): string | null => {
  const g = labelGraph(label);
  if (!g) return null;
  const zs = g.atoms.map((a) => `${a.z}${a.charge ? `${a.charge > 0 ? '+' : ''}${a.charge}` : ''}`);
  return `${zs[0]}:${zs.slice(1).sort().join(',')}:${g.bonds.length}`;
};

const heavy = (smiles: string) => parseSmiles(smiles).atoms.filter((a) => a.z > 1).length;

describe('the Ligand Library', () => {
  it('has several hundred ligands in families, each with a drawing on a metal', () => {
    expect(LIGANDS.length).toBeGreaterThanOrEqual(250);
    expect(LIGAND_FAMILIES.length).toBeGreaterThanOrEqual(15);
    const fams = new Set(LIGAND_FAMILIES.map((f) => f.id));
    for (const l of LIGANDS) {
      expect(fams.has(l.family), l.id).toBe(true);
      const t = templateById(l.tpl);
      expect(t, `${l.id}: ${l.tpl}`).toBeTruthy();
      // the metal is where the template goes on
      expect(t!.atoms[t!.attach][3 + 1] ?? t!.atoms[t!.attach][2], l.id).toMatch(/^(M|C|Fe)$/);
      expect(t!.onMetal, l.id).toBe(true);
      expect(l.l + l.x, l.id).toBeGreaterThan(0);
    }
  });

  it('keeps every abbreviation for one ligand only', () => {
    const seen = new Map<string, string>();
    for (const l of LIGANDS) for (const a of l.abbr) {
      expect(seen.get(a), `${a}: ${seen.get(a)} and ${l.id}`).toBeUndefined();
      seen.set(a, l.id);
    }
  });

  it('cites a PubChem record for nearly every ligand', () => {
    const cited = LIGANDS.filter((l) => l.cid).length;
    expect(cited / LIGANDS.length).toBeGreaterThan(0.9);
  });

  it('every drawing has a picture', () => {
    for (const l of LIGANDS) expect(templateIcon(templateById(l.tpl)!, 64), l.id).toMatch(/^<svg/);
  });

  it('every drawing goes onto a metal without stray atoms', () => {
    for (const id of new Set(LIGANDS.map((l) => l.tpl))) {
      const doc = new Doc();
      const t = templateById(id)!;
      const ids = doc.edit('t', () => placeTemplate(doc, t, freePlacement({ x: 100, y: 100 }, doc.style.bondLength), { noMerge: true }));
      expect(ids.length, id).toBe(t.atoms.length);
    }
  });

  it('keeps PPh2 and the like as labels on chelating diphosphines (BINAP, dppf, Josiphos)', () => {
    const labels = (id: string) => templateById(ligandByAbbr(id)!.tpl)!.atoms.map((a) => a[4]).filter(Boolean);
    expect(labels('BINAP').filter((x) => x === 'PPh2').length).toBe(2);
    expect(labels('dppf').filter((x) => x === 'PPh2').length).toBe(2);
    expect(labels('Josiphos')).toEqual(expect.arrayContaining(['PPh2', 'PCy2']));
    expect(labels('dtbpf').filter((x) => x === 'P(t-Bu)2').length).toBe(2);
    expect(labels('IPr*').filter((x) => x === 'CHPh2').length).toBe(4);
  });

  it('draws a chelate with the metal on the left of its donors', () => {
    for (const abbr of ['dtbbpy', 'DPEphos', 'Ph-BOX', 'TMEDA']) {
      const t = templateById(ligandByAbbr(abbr)!.tpl)!;
      const m = t.atoms[t.attach];
      const donors = t.bonds.filter((b) => b[0] === t.attach || b[1] === t.attach).map((b) => t.atoms[b[0] === t.attach ? b[1] : b[0]]);
      expect(donors.length, abbr).toBe(2);
      for (const d of donors) expect(d[0], abbr).toBeGreaterThan(m[0] + 0.3);
      // one above the other, the same distance from the metal's level
      expect(Math.abs(donors[0][1] + donors[1][1] - 2 * m[1]), abbr).toBeLessThan(0.1);
    }
  });
});

describe('typed abbreviations', () => {
  it('every abbreviation reads as its ligand', () => {
    for (const l of LIGANDS) for (const a of l.abbr) {
      const g = labelGraph(a, l.hapto ? 0 : 1);
      expect(g, `${l.id}: ${a}`).toBeTruthy();
      const n = g!.atoms.filter((x) => x.z > 1 && !x.dummy).length;
      // the free ligand's heavy atoms (Cp, CO and a few others already meant the same thing)
      expect(Math.abs(n - heavy(l.smiles)), `${l.id}: ${a} reads with ${n} heavy atoms, not ${heavy(l.smiles)}`).toBeLessThanOrEqual(1);
    }
  });

  it('reads dppf, dtbbpy, IPr* and 18-crown-6 as whole ligands', () => {
    expect(labelGraph('dppf')!.atoms.filter((a) => a.z === 15).length).toBe(2);
    expect(labelGraph('dppf')!.atoms.filter((a) => a.z === 26).length).toBe(1);
    expect(labelGraph('dtbbpy')!.atoms.filter((a) => a.z === 7).length).toBe(2);
    expect(labelGraph('IPr*')!.atoms.length).toBe(heavy(ligandByAbbr('IPr*')!.smiles));
    expect(labelGraph('18-crown-6')!.atoms.filter((a) => a.z === 8).length).toBe(6);
  });

  it('finds an abbreviation inside a longer label: Pd(dppf)Cl2', () => {
    expect(tokenize('Pd(dppf)Cl2').map((t) => t.text)).toEqual(['Pd', '(', 'dppf', ')', 'Cl']);
  });

  it('leaves the common labels reading as they did', () => {
    const changed: string[] = [];
    for (const [label, before] of Object.entries(BEFORE)) if (reading(label) !== before) changed.push(`${label}: ${before} → ${reading(label)}`);
    expect(changed).toEqual([]);
  });
});

describe('ligands on a metal', () => {
  /** A metal with labelled ligands round it, each bonded once. */
  function complex(z: number, ligands: string[], charge = 0) {
    const doc = new Doc();
    const ids = doc.edit('m', () => {
      const metal = doc.addAtom(0, 0, z, { charge });
      const labs = ligands.map((label, i) => {
        const ang = (i / ligands.length) * 2 * Math.PI;
        const a = doc.addAtom(20 * Math.cos(ang), 20 * Math.sin(ang), 6, { label });
        doc.addBond(metal.id, a.id, 1);
        return a.id;
      });
      return { m: metal.id, labs };
    });
    return { doc, ...ids };
  }

  it('counts the electrons of Ni(dtbbpy)Cl2 (L2X2, Ni(II), 16 e) and Co(salen) (L2X2, Co(II), 15 e)', () => {
    const ni = complex(28, ['dtbbpy', 'Cl', 'Cl']);
    const c1 = countElectrons(ni.doc, ni.m)[0];
    expect([c1.l, c1.x, c1.oxidation, c1.electrons]).toEqual([2, 2, 2, 16]);
    const co = complex(27, ['salen']);
    const c2 = countElectrons(co.doc, co.m)[0];
    expect([c2.l, c2.x, c2.oxidation, c2.electrons]).toEqual([2, 2, 2, 15]);
  });

  it('expands a library abbreviation on a metal to its drawing: Pd(DPEphos) gets both P', () => {
    const { doc, m, labs } = complex(46, ['DPEphos', 'Cl', 'Cl']);
    expect(ligandTemplateFor(doc, doc.atoms.get(labs[0])!)).toBe(ligandByAbbr('DPEphos')!.tpl);
    doc.edit('Expand', () => expandLigand(doc, labs[0]));
    expect(doc.atoms.has(labs[0])).toBe(false);
    expect(doc.neighbors(m).filter((a) => a.z === 15).length).toBe(2);
  });

  it('shows the ligand drawing in the tooltip, with its name', () => {
    const tip = labelTip('dtbbpy')!;
    expect(tip.ligand).toBe(ligandByAbbr('dtbbpy')!.tpl);
    expect(tip.name).toMatch(/bipyridine/i);
    expect(labelTip('OMe')!.ligand).toBeUndefined();
  });
});

describe('searching the library', () => {
  it('puts an exact abbreviation first, then ones that start with it', () => {
    expect(searchLigands('dppf')[0].abbr[0]).toBe('dppf');
    expect(searchLigands('xphos')[0].abbr[0]).toBe('XPhos');
    expect(searchLigands('dpp').slice(0, 4).every((l) => l.abbr.some((a) => a.toLowerCase().startsWith('dpp')))).toBe(true);
  });

  it('finds by part of a name, a family and a PubChem number', () => {
    expect(searchLigands('bipyridine').map((l) => l.id)).toContain('bpy');
    const bpy = ligandByAbbr('bpy')!;
    expect(searchLigands(String(bpy.cid))[0]).toBe(bpy);
    expect(searchLigands('', 'nhc').every((l) => l.family === 'nhc')).toBe(true);
    expect(searchLigands('pincer').length).toBeGreaterThan(5);
  });

  it('finds by bonding type, and says how each bonds', () => {
    expect(bondingType(ligandByAbbr('acac')!)).toBe('LX');
    expect(bondingType(ligandByAbbr('Cp*')!)).toMatch(/^η⁵/);
    expect(denticity(ligandByAbbr('terpy')!)).toBe('tridentate');
    expect(searchLigands('L2X2').some((l) => l.id === 'salen')).toBe(true);
  });
});

describe('the Ligand Library window', () => {
  const proto = HTMLDialogElement.prototype as unknown as { show?: () => void; close?: () => void };
  proto.show ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  const realClose = HTMLDialogElement.prototype.close;
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (realClose) try { realClose.call(this); } catch { /* jsdom */ }
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };

  it('shows the ligands, filters them, and uses the one picked as the tool', () => {
    const used: string[] = [];
    const w = new LigandLibraryWindow({ useTemplate: (id) => used.push(id), openUrl: () => {}, copyText: () => {} });
    w.open();
    const d = document.querySelector('dialog.ligand-library')!;
    expect(d.querySelectorAll('.lig-card').length).toBe(LIGANDS.length);
    const search = d.querySelector<HTMLInputElement>('input[type=search]')!;
    search.value = 'dtbbpy';
    search.dispatchEvent(new Event('input'));
    const cards = d.querySelectorAll<HTMLElement>('.lig-card');
    expect(cards[0].dataset.id).toBe('dtbbpy');
    expect(d.querySelector('.lig-details h3')!.textContent).toBe('dtbbpy');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(used).toEqual([ligandByAbbr('dtbbpy')!.tpl]);
    // Enter uses it and closes the window
    expect(w.isOpen).toBe(false);
  });

  it('lists the families with their counts', () => {
    const w = new LigandLibraryWindow({ useTemplate: () => {}, openUrl: () => {}, copyText: () => {} });
    w.open();
    const tabs = [...document.querySelectorAll('dialog.ligand-library .kb-tab')];
    expect(tabs.length).toBe(LIGAND_FAMILIES.length + 1);
    (tabs[1] as HTMLElement).click();
    const fam = LIGAND_FAMILIES[0].id;
    expect([...document.querySelectorAll<HTMLElement>('dialog.ligand-library .lig-card')].every((c) => LIGANDS.find((l) => l.id === c.dataset.id)!.family === fam)).toBe(true);
    w.close();
  });
});

describe('templates', () => {
  it('the library drawings are kept off the palettes except the common ones', () => {
    const lib = TEMPLATES.filter((t) => t.group === 'ligand-lib');
    expect(lib.length).toBeGreaterThan(200);
    expect(TEMPLATES.filter((t) => t.group === 'ligands').length).toBeLessThan(50);
  });
});

describe('a ligand drawn out on its own (review item 28)', () => {
  let RDKit: any;
  beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); });
  const molblock = (smiles: string) => { const m = RDKit.get_mol(smiles); try { m.set_new_coords(true); return m.get_molblock(); } finally { m.delete(); } };
  const labels = (doc: Doc) => [...doc.atoms.values()].map((a) => a.label).filter(Boolean).sort();

  it('BINAP on its own expands to the usual drawing, PPh2 groups kept, no metal', () => {
    const doc = new Doc();
    const a = doc.edit('a', () => doc.addAtom(100, 100, 6, { label: 'BINAP' }));
    doc.edit('x', () => expandLigand(doc, a.id));
    expect(doc.atoms.size).toBe(22);
    expect(labels(doc)).toEqual(['PPh2', 'PPh2']);
    expect([...doc.atoms.values()].some((x) => x.label === 'M')).toBe(false);
    // the two PPh2 groups side by side on the left, the naphthyls to the right
    const p = [...doc.atoms.values()].filter((x) => x.label === 'PPh2');
    const cx = [...doc.atoms.values()].reduce((s, x) => s + x.x, 0) / doc.atoms.size;
    expect(p.every((x) => x.x < cx)).toBe(true);
    expect(Math.abs(p[0].x - p[1].x)).toBeLessThan(5);
  });

  it('every chelating library ligand has a free drawing; π-ligands and one-atom ligands do not', () => {
    expect(freeLigandFor('Cp')).toBeNull();
    expect(freeLigandFor('COD')).toBeNull();
    expect(freeLigandFor('CO')).toBeNull();
    for (const ab of ['dppf', 'Xantphos', 'salen', 'dtbbpy', 'XPhos', 'tBuXPhos', 'iPr-PyBOX', 'IPr']) {
      const t = freeLigandFor(ab);
      expect(t, ab).not.toBeNull();
      expect(t!.atoms.some((x) => x[4] === 'M'), ab).toBe(false);
    }
    const onPi = (id: string) => { const t = templateById(id)!; return !!t.hapto?.some(([m]) => m === t.attach); };
    const chelates = LIGANDS.filter((l) => l.l + l.x >= 2 && !onPi(l.tpl));
    const missing = chelates.filter((l) => !freeLigandFor(l.abbr[0])).map((l) => l.abbr[0]);
    expect(missing).toEqual([]);
  });

  it('PPh2 in BINAP on a metal reads as P with two phenyls kept on that P', () => {
    const doc = new Doc();
    const l = doc.edit('a', () => {
      const pd = doc.addAtom(0, 0, 46);
      const x = doc.addAtom(30, 0, 6, { label: 'BINAP' });
      doc.addBond(pd.id, x.id, 1);
      return x;
    });
    doc.edit('x', () => expandLigand(doc, l.id));
    const p = [...doc.atoms.values()].filter((x) => x.label === 'PPh2');
    expect(p.length).toBe(2);
    expect(inPlaceSmiles(doc, p[0])).toBe(labelSmiles(p[0], 2));
    const before = doc.atoms.size;
    doc.edit('y', () => { for (const x of p) expandInPlace(doc, x.id, molblock(inPlaceSmiles(doc, x)!)); });
    expect(doc.atoms.size).toBe(before + 24);
    expect(labels(doc)).toEqual([]);
    for (const x of p) {
      expect(doc.atoms.get(x.id)!.z).toBe(15);
      expect(doc.degree(x.id)).toBe(4);
    }
    // the phenyls go into the room round each P: none on top of another atom
    const atoms = [...doc.atoms.values()];
    let close = 0;
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) if (Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y) < doc.style.bondLength * 0.35) close++;
    expect(close).toBe(0);
  });

  it('Expand Label Fully draws BINAP with every phenyl, the same way round, on its own or on a metal', async () => {
    await loadFullLigands();
    const doc = new Doc();
    const [f, l] = doc.edit('a', () => {
      const f = doc.addAtom(0, 0, 6, { label: 'BINAP' });
      const pd = doc.addAtom(300, 0, 46);
      const x = doc.addAtom(330, 0, 6, { label: 'BINAP' });
      doc.addBond(pd.id, x.id, 1);
      return [f, x];
    });
    doc.edit('x', () => { expandLigand(doc, f.id, true); expandLigand(doc, l.id, true); });
    expect(labels(doc)).toEqual([]);
    const count = (z: number) => [...doc.atoms.values()].filter((a) => a.z === z).length;
    // two BINAPs, C44H32P2 each, and the Pd
    expect(count(15)).toBe(4);
    expect(count(6)).toBe(88);
    expect(count(46)).toBe(1);
    // the free one: its two P on the left, the binaphthyl to the right, as in the usual drawing
    const free = [...doc.atoms.values()].filter((a) => a.x < 150);
    const ps = free.filter((a) => a.z === 15);
    const cx = free.reduce((t, a) => t + a.x, 0) / free.length;
    expect(ps.every((p) => p.x < cx)).toBe(true);
  });

  it('every ligand drawn in full is the same ligand as its usual drawing, labels drawn out', () => {
    const heavy = (t: { atoms: unknown[][] }) => t.atoms.length - 1;
    for (const t of FULL as unknown as { id: string; atoms: unknown[][] }[]) {
      const base = templateById(t.id.replace(/-full$/, ''))!;
      expect(base, t.id).toBeDefined();
      expect(t.atoms.every((a, i) => i === 0 || !a[4]), t.id).toBe(true);
      expect(heavy(t), t.id).toBeGreaterThan(heavy(base));
    }
    expect(FULL.length).toBeGreaterThan(70);
  });

  it('a chain label with two bonds is not drawn out on its first atom', () => {
    const doc = new Doc();
    const c = doc.edit('a', () => {
      const a = doc.addAtom(0, 0, 6), b = doc.addAtom(60, 0, 6), x = doc.addAtom(30, 0, 6, { label: 'CH2CH2' });
      doc.addBond(a.id, x.id, 1);
      doc.addBond(x.id, b.id, 1);
      return x;
    });
    expect(inPlaceSmiles(doc, c)).toBeNull();
  });

  it('C6F5, C6H5 and C6H11 read as rings, not chains', () => {
    expect(labelGraph('C6F5')!.atoms.filter((x) => x.z === 9).length).toBe(5);
    expect(labelGraph('C6F5')!.bonds.length).toBe(11);
    expect(labelGraph('C6H5')!.bonds.length).toBe(6);
    expect(labelGraph('C6H11')!.bonds.length).toBe(6);
  });

  describe('groups written short (Nate, 2026-11-02)', () => {
    type T = { atoms: [number, number, string, number?, string?][]; bonds: [number, number, number, string?][]; attach: number };
    const drawing = (abbr: string) => templateById(ligandByAbbr(abbr)!.tpl) as unknown as T;
    const labels = (abbr: string) => drawing(abbr).atoms.map((a) => a[4]).filter(Boolean);
    const lib = LIGANDS.map((l) => [l.abbr[0], templateById(l.tpl) as unknown as T] as const);
    const degree = (t: T, i: number) => t.bonds.filter((b) => b[0] === i || b[1] === i).length;
    const nbrs = (t: T, i: number) => t.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
    const bare = (t: T, i: number) => t.atoms[i][2] === 'C' && !t.atoms[i][4] && i !== t.attach;

    it('methyls on N and O as NMe2, NMe and OMe', () => {
      expect(labels('TMEDA').filter((l) => l === 'NMe2').length).toBe(2);
      expect(labels('SPhos').filter((l) => l === 'OMe').length).toBe(2);
      expect(labels('IMe').filter((l) => l === 'NMe').length).toBe(2);
      expect(labels('DMAP')).toContain('NMe2');
      for (const [abbr, t] of lib) t.atoms.forEach((a, i) => {
        if ((a[2] !== 'N' && a[2] !== 'O') || a[4]) return;
        expect(nbrs(t, i).some((j) => bare(t, j) && degree(t, j) === 1), `${abbr}: a methyl drawn on ${a[2]}`).toBe(false);
      });
    });

    it('isopropyl, tert-butyl and CF3 named wherever they are', () => {
      expect(labels('XPhos').filter((l) => l === 'i-Pr').length).toBe(3);
      expect(labels('dtbbpy').filter((l) => l === 't-Bu').length).toBe(2);
      expect(labels('dCF3bpy').filter((l) => l === 'CF3').length).toBe(2);
      expect(labels('RuPhos').filter((l) => l === 'Oi-Pr').length).toBe(2);
      for (const [abbr, t] of lib) t.atoms.forEach((a, i) => {
        if (!bare(t, i)) return;
        const ends = nbrs(t, i).filter((j) => bare(t, j) && degree(t, j) === 1).length;
        const fs = nbrs(t, i).filter((j) => t.atoms[j][2] === 'F').length;
        const d = degree(t, i);
        expect(d === 3 && ends === 2 || d === 4 && ends === 3 || fs === 3, `${abbr}: an i-Pr, t-Bu or CF3 drawn out`).toBe(false);
      });
    });

    it('phenyls as Ph, but a biaryl backbone stays drawn', () => {
      expect(labels('PPh3').filter((l) => l === 'Ph').length).toBe(3);
      expect(labels('BPhen').filter((l) => l === 'Ph').length).toBe(2);
      expect(labels('JohnPhos')).not.toContain('Ph');
      expect(drawing('JohnPhos').atoms.length).toBeGreaterThan(12);
    });

    it('never a label that reads as a metal (Ni-Pr, Pt-Bu)', () => {
      for (const [abbr, t] of lib) for (const a of t.atoms) {
        if (a[4]) expect(/^(N|P|As)[it]-/.test(a[4]) || a[4] === 'PiPr2', `${abbr}: ${a[4]}`).toBe(false);
      }
      expect(labels('TangPhos')).not.toContain('Pt-Bu');
    });

    it('the η⁴-butadiene and allyl icons draw an arc, their bonds single', () => {
      for (const abbr of ['allyl', 'C4H6']) {
        const svg = templateIcon(drawing(abbr) as never, 120, 26);
        expect(svg, abbr).toMatch(/<path d="M[^"]*Q/);
      }
    });

    it('a ring double bond has its second line inside the ring, whatever hangs off it', () => {
      // a benzene whose double bond C0=C1 carries two groups outside (RuPhos's biaryl carbon and
      // its Oi-Pr): the neighbours outside outnumber the ring's, the line still goes in
      const ring = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3)]);
      // straight out from the bond (along its normal), so they outweigh the ring's own neighbours
      const out = (k: number) => [ring[k][0] + Math.cos(Math.PI / 6), ring[k][1] + Math.sin(Math.PI / 6)];
      const t = {
        id: 'x', name: 'x', group: 'ligand-lib', attach: 8,
        atoms: [...ring, out(0), out(1), [out(1)[0] - 1, out(1)[1]]].map(([x, y]) => [x, y, 'C']),
        bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1], [0, 6, 1], [1, 7, 1], [7, 8, 1]],
      };
      const svg = templateIcon(t as never, 300, 26);
      const lines = [...svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)].map((m) => m.slice(1).map(Number));
      // the picture's ring centre: the middle of the ring's six atoms, found from the longest lines
      const len = (l: number[]) => Math.hypot(l[2] - l[0], l[3] - l[1]);
      const mid = (l: number[]) => [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2];
      const full = Math.max(...lines.map(len));
      const bonds = lines.filter((l) => len(l) > 0.9 * full);
      const cx = bonds.slice(0, 6).reduce((s, l) => s + mid(l)[0], 0) / 6, cy = bonds.slice(0, 6).reduce((s, l) => s + mid(l)[1], 0) / 6;
      const inners = lines.filter((l) => len(l) < 0.85 * full && len(l) > 0.3 * full);
      expect(inners.length).toBe(3);
      // each inner line is nearer the centre than the bond it goes with
      for (const l of inners) {
        const near = bonds.reduce((b, m) => (Math.hypot(mid(m)[0] - mid(l)[0], mid(m)[1] - mid(l)[1]) < Math.hypot(mid(b)[0] - mid(l)[0], mid(b)[1] - mid(l)[1]) ? m : b));
        expect(Math.hypot(mid(l)[0] - cx, mid(l)[1] - cy)).toBeLessThan(Math.hypot(mid(near)[0] - cx, mid(near)[1] - cy));
      }
    });
  });
});
