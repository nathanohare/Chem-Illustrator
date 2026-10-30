// Structure to name: the graph made from RDKit for OpenClatura, the italics of a name caption,
// the read-back check, and the whole chain as the app runs it (OpenClatura in Pyodide, names
// read back with OPSIN), on structures a chemist draws every day.

import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { loadPyodide } from 'pyodide';
import { namerGraph, type NamerGraph } from '../src/chem/namer-graph';
import { confirmedName, nameRuns, iupacEnclosures, type NameTools } from '../src/chem/namer';
import { load, parse } from '../src/vendor/opsin/opsin.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RDKit: any;
beforeAll(async () => {
  RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
});

function graphOf(smiles: string): NamerGraph {
  const mol = RDKit.get_mol(smiles);
  try {
    return namerGraph(mol);
  } finally {
    mol.delete();
  }
}

describe('the graph the namer reads', () => {
  it('carries Kekulé orders, aromatic atoms and hydrogens', () => {
    const g = graphOf('c1cc[nH]c1');
    expect(g.atoms.map((a) => a.el)).toEqual(['C', 'C', 'C', 'N', 'C']);
    expect(g.atoms.every((a) => a.arom)).toBe(true);
    expect(g.bonds.map((b) => b.o).sort()).toEqual([1, 1, 1, 2, 2]);
    expect(g.bonds.every((b) => b.ring)).toBe(true);
    const n = g.atoms[3];
    expect(n).toMatchObject({ h: 1, xh: 1, deg: 3 });
    expect(g.atoms[0]).toMatchObject({ h: 1, xh: 0 });
  });

  it('carries R/S, the drawn parity and E/Z', () => {
    const ala = graphOf('C[C@H](N)C(=O)O');
    expect(ala.atoms[1]).toMatchObject({ cip: 'S', legacy: 'S', tag: 'CCW', xh: 1 });
    const butene = graphOf('C/C=C\\C');
    expect(butene.bonds[1]).toMatchObject({ o: 2, ez: 'Z', ring: false });
  });

  it('marks charges, isotopes and big rings', () => {
    const g = graphOf('[13CH3][N+](C)(C)C.C1CCCCCCC1');
    expect(g.atoms[0].iso).toBe(13);
    expect(g.atoms[1].q).toBe(1);
    expect(g.bonds.filter((b) => b.ring)).toEqual([]);
  });
});

describe('a name as caption text', () => {
  const italics = (name: string) => nameRuns(name).filter((r) => r.italic).map((r) => r.text);

  it('italicises stereodescriptors but not locants', () => {
    expect(italics('(2S)-2-aminopropanoic acid')).toEqual(['S']);
    expect(italics('(1R,3aS,7S)-7-methyl-3a-ol')).toEqual(['R', 'S', 'S']);
    expect(italics('(2Z,4E)-hexa-2,4-dienal')).toEqual(['Z', 'E']);
    expect(nameRuns('(2S)-2-aminopropanoic acid').map((r) => r.text).join('')).toBe('(2S)-2-aminopropanoic acid');
  });

  it('italicises element locants, indicated hydrogen, tert and fusion letters', () => {
    expect(italics('N,N-diethylethanamine')).toEqual(['N', 'N']);
    expect(italics("N'-methyl")).toEqual(['N']);
    expect(italics('1H-pyrazole')).toEqual(['H']);
    expect(italics('4-(tert-butyl)phenol')).toEqual(['tert']);
    expect(italics('10H-thieno[2,3-b][1,5]benzodiazepine')).toEqual(['H', 'b']);
  });

  it('leaves plain names and von Baeyer brackets alone', () => {
    expect(italics('bicyclo[2.2.1]hept-2-ene')).toEqual([]);
    expect(italics('2-[methyl]-3-[1-ethyl]')).toEqual([]);
    expect(italics('ethanol')).toEqual([]);
    expect(italics('2,4,6-trichlorophenol')).toEqual([]);
  });
});

describe('nesting enclosing marks', () => {
  it('puts parentheses inside square brackets inside braces', () => {
    expect(iupacEnclosures('2-(4-(2-methylpropyl)phenyl)propanoic acid')).toBe('2-[4-(2-methylpropyl)phenyl]propanoic acid');
    expect(iupacEnclosures('2-(((benzyloxy)carbonyl)amino)acetic acid')).toBe('2-{[(benzyloxy)carbonyl]amino}acetic acid');
    expect(iupacEnclosures('1-((2R)-6-methylheptan-2-yl)')).toBe('1-[(2R)-6-methylheptan-2-yl]');
    expect(iupacEnclosures('(2S)-2-(4-((((x)y)z)w)v)u')).toBe('(2S)-2-[4-({[(x)y]z}w)v]u');
  });

  it('leaves single levels, compound locants and fusion brackets alone', () => {
    expect(iupacEnclosures('N-(4-hydroxyphenyl)acetamide')).toBe('N-(4-hydroxyphenyl)acetamide');
    expect(iupacEnclosures('2,5-diazabicyclo[5.4.0]undeca-1(7),5,8,10-tetraen-3-one')).toBe('2,5-diazabicyclo[5.4.0]undeca-1(7),5,8,10-tetraen-3-one');
    expect(iupacEnclosures('4-(cyclopenta[a]phenanthren-3-yl)')).toBe('4-(cyclopenta[a]phenanthren-3-yl)');
    expect(iupacEnclosures('2-((x)y')).toBe('2-((x)y');
    expect(iupacEnclosures('2-[(x)y]')).toBe('2-[(x)y]');
  });
});

describe('checking a name by reading it back', () => {
  const tools = (proposal: string, back: string | null): NameTools => ({
    graph: async (mb) => (mb === 'bad' ? { graph: null, smiles: null } : { graph: graphOf(mb), smiles: RDKit.get_mol(mb).get_smiles() }),
    propose: async () => proposal,
    read: async () => back,
    canonical: async (s) => RDKit.get_mol(s)?.get_smiles() ?? null,
  });

  it('gives the name when it reads back as the structure', async () => {
    expect(await confirmedName('OCC', tools('ethanol', 'CCO'))).toEqual({ ok: true, name: 'ethanol' });
  });

  it('withholds a name that reads back as something else, or not at all', async () => {
    expect((await confirmedName('Cc1ccccc1C', tools('benzene', 'c1ccccc1'))).ok).toBe(false);
    expect((await confirmedName('C[C@H](N)C(=O)O', tools('2-aminopropanoic acid', 'CC(N)C(=O)O'))).ok).toBe(false);
    expect((await confirmedName('CCO', tools('ethanol', null))).ok).toBe(false);
    expect((await confirmedName('CCO', tools('', null))).ok).toBe(false);
  });

  it('says why when there is no name', async () => {
    expect(await confirmedName('bad', tools('x', null))).toMatchObject({ ok: false, message: expect.stringMatching(/can't be read/) });
    expect(await confirmedName('*CC', tools('x', null))).toMatchObject({ ok: false, message: expect.stringMatching(/R groups/) });
  });
});

describe('the namer as the app runs it', () => {
  let nameGraph: (json: string) => string;
  let tools: NameTools;

  beforeAll(async () => {
    const py = await loadPyodide();
    py.unpackArchive(new Uint8Array(fs.readFileSync('public/namer/openclatura-0.4.3-py3-none-any.whl')), 'wheel');
    py.runPython(fs.readFileSync('src/worker/namer_bridge.py', 'utf8'));
    const fn = py.globals.get('name_graph');
    nameGraph = (json) => String(fn(json));
    const raw = zlib.gunzipSync(fs.readFileSync('public/opsin/opsin-data.dat'));
    expect(load(new Int8Array(raw.buffer, raw.byteOffset, raw.byteLength))).toBe('');
    tools = {
      graph: async (smiles) => { const mol = RDKit.get_mol(smiles); try { return { graph: namerGraph(mol), smiles: mol.get_smiles() }; } finally { mol.delete(); } },
      propose: async (graph) => nameGraph(JSON.stringify(graph)),
      read: async (name) => { const r = JSON.parse(parse(name)); return r.ok ? r.smiles : null; },
      canonical: async (s) => { const mol = RDKit.get_mol(s); try { return mol?.is_valid() ? mol.get_smiles() : null; } finally { mol?.delete(); } },
    };
  }, 120000);

  // the names OpenClatura gives (checked with OPSIN); a change in either shows up here
  const CASES: [string, string][] = [
    ['CC(C)(C)C', '2,2-dimethylpropane'],
    ['C/C=C\\C', '(2Z)-but-2-ene'],
    ['CC(C)O', 'propan-2-ol'],
    ['CC(=O)CC(C)=O', 'pentane-2,4-dione'],
    ['CC(=O)Cl', 'acetyl chloride'],
    ['CCN(CC)CC', 'N,N-diethylethanamine'],
    ['ClCCl', 'dichloromethane'],
    ['Oc1ccc(Cl)cc1', '4-chlorophenol'],
    ['Cc1ccccn1', '2-methylpyridine'],
    ['c1cn[nH]c1', '1H-pyrazole'],
    ['C[C@H](N)C(=O)O', '(2S)-2-aminopropanoic acid'],
    ['O[C@@H]1CCCC[C@H]1O', '(1R,2R)-cyclohexane-1,2-diol'],
    ['CC(=O)Nc1ccc(O)cc1', 'N-(4-hydroxyphenyl)acetamide'],
    ['CCCCCCCC/C=C\\CCCCCCCC(=O)O', '(9Z)-octadec-9-enoic acid'],
    ['C1CC2CC1C=C2', 'bicyclo[2.2.1]hept-2-ene'],
    ['CC(=O)Oc1ccccc1C(=O)O', '2-(acetyloxy)benzoic acid'],
    ['C1CC1N2C=C(C(=O)C3=CC(=C(C=C32)N4CCNCC4)F)C(=O)O', '1-cyclopropyl-6-fluoro-4-oxo-7-(piperazin-1-yl)-1,4-dihydroquinoline-3-carboxylic acid'],
    ['CC(=O)[O-].[Na+]', 'sodium acetate'],
    ['CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O', '(2R)-2-[4-(2-methylpropyl)phenyl]propanoic acid'],
    ['O=C(OCc1ccccc1)NCC(=O)O', '2-{[(benzyloxy)carbonyl]amino}acetic acid'],
  ];

  it.each(CASES)('names %s as %s, and the name reads back', async (smiles, expected) => {
    expect(await confirmedName(smiles, tools)).toEqual({ ok: true, name: expected });
  });

  it('names the steroids, penicillins and alkaloids it is checked on', async () => {
    const hard = [
      'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C', // cholesterol
      'CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O', // morphine
      'CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)CC3=CC=CC=C3)C(=O)O)C', // penicillin G
      'CN1CCC[C@H]1c1cccnc1', // nicotine
    ];
    for (const s of hard) expect((await confirmedName(s, tools)).ok, s).toBe(true);
  });

  it('gives nothing, rather than a wrong name, when it has no rule', async () => {
    expect(nameGraph('{"atoms":[{"el":"Fe","q":0,"iso":0,"legacy":null,"cip":null,"tag":null,"arom":false,"xh":0,"h":0,"rad":0,"deg":1},{"el":"C","q":0,"iso":0,"legacy":null,"cip":null,"tag":null,"arom":false,"xh":0,"h":3,"rad":0,"deg":4}],"bonds":[{"u":0,"v":1,"o":1,"ez":null,"ring":false}]}')).toBe('');
    expect(nameGraph('not json')).toBe('');
  });
});
