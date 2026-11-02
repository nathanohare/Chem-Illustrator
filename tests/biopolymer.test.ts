// @vitest-environment jsdom
//
// Biopolymers: peptides from their sequence (src/chem/biopolymer.ts), and the Haworth sugar,
// nucleoside and nucleotide templates (scripts/make-templates.mjs checks each of those against
// its name read by OPSIN when it builds them; here they are checked once they are in a drawing).

import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Doc } from '../src/model';
import { TEMPLATES, freePlacement, placeTemplate, templateById, type Template } from '../src/chem/templates';
import { parsePeptide, peptideName, peptideTemplate, type Residue } from '../src/chem/biopolymer';
import { toMolfile } from '../src/chem/molfile';
import { StructureChecks } from '../src/chem/warnings';
import { templateIcon } from '../src/ui/template-icons';

// Each amino acid as SMILES, N first and the acid last, to build the expected peptide from.
const SMILES: Record<string, string> = {
  G: 'NCC(=O)O', A: 'N[C@@H](C)C(=O)O', V: 'N[C@@H](C(C)C)C(=O)O', L: 'N[C@@H](CC(C)C)C(=O)O', I: 'N[C@@H]([C@@H](C)CC)C(=O)O',
  P: 'N9CCC[C@H]9C(=O)O', F: 'N[C@@H](Cc9ccccc9)C(=O)O', W: 'N[C@@H](Cc9c[nH]c8ccccc89)C(=O)O', M: 'N[C@@H](CCSC)C(=O)O',
  S: 'N[C@@H](CO)C(=O)O', T: 'N[C@@H]([C@@H](C)O)C(=O)O', C: 'N[C@@H](CS)C(=O)O', Y: 'N[C@@H](Cc9ccc(O)cc9)C(=O)O',
  N: 'N[C@@H](CC(N)=O)C(=O)O', Q: 'N[C@@H](CCC(N)=O)C(=O)O', D: 'N[C@@H](CC(=O)O)C(=O)O', E: 'N[C@@H](CCC(=O)O)C(=O)O',
  K: 'N[C@@H](CCCCN)C(=O)O', R: 'N[C@@H](CCCNC(=N)N)C(=O)O', H: 'N[C@@H](Cc9c[nH]cn9)C(=O)O',
};
const N_END: Record<string, string> = { H: '', Ac: 'CC(=O)', Boc: 'CC(C)(C)OC(=O)', Fmoc: 'O=C(OCC9c8ccccc8-c8ccccc89)', Cbz: 'O=C(OCc9ccccc9)', Bz: 'O=C(c9ccccc9)' };
const C_END: Record<string, string> = { OH: 'O', NH2: 'N', OMe: 'OC', OEt: 'OCC', OtBu: 'OC(C)(C)C', OBn: 'OCc9ccccc9' };

/** The peptide written out as SMILES from its residues: each one's acid OH replaced by the next one's N. */
function expected(res: Residue[], n = 'H', c = 'OH'): string {
  let s = N_END[n];
  res.forEach((r, i) => {
    // a D-amino acid is the mirror image: every @ swapped; ring-closure digits made unique to the residue
    let a = SMILES[r.code].replace(/[89]/g, (m) => `%${(m === '9' ? 10 : 11) + 2 * i}`);
    if (r.d) a = a.replace(/@@|@/g, (m) => (m === '@@' ? '@' : '@@'));
    s += a.slice(0, -1); // the acid's OH
  });
  return s + C_END[c];
}

function place(t: Template) {
  const doc = new Doc();
  doc.edit('Template', () => placeTemplate(doc, t, freePlacement({ x: 300, y: 300 }, doc.style.bondLength), { noMerge: true }));
  return doc;
}

describe('peptide sequences', () => {
  it('reads one-letter codes, ignoring spaces, numbers and a FASTA header', () => {
    const p = parsePeptide('>sp|P01275|GLUC\n  1 HSQGTFTSDY SKYLDSRRAQ  21\n');
    expect(p.problems).toEqual([]);
    expect(p.residues.map((r) => r.code).join('')).toBe('HSQGTFTSDYSKYLDSRRAQ');
    expect(p.residues.every((r) => !r.d)).toBe(true);
  });

  it('reads small letters as D-amino acids, or as L when that is turned off', () => {
    expect(parsePeptide('AfG').residues).toEqual([{ code: 'A', d: false }, { code: 'F', d: true }, { code: 'G', d: false }]);
    expect(parsePeptide('afg', false).residues.every((r) => !r.d)).toBe(true);
    // glycine has no D form
    expect(parsePeptide('g').residues).toEqual([{ code: 'G', d: false }]);
  });

  it('reads three-letter codes with their ends and D- prefixes', () => {
    const p = parsePeptide('Boc-Ala-D-Phe-Gly-OMe');
    expect(p.problems).toEqual([]);
    expect(p.nTerm).toBe('Boc');
    expect(p.cTerm).toBe('OMe');
    expect(p.residues).toEqual([{ code: 'A', d: false }, { code: 'F', d: true }, { code: 'G', d: false }]);
    expect(parsePeptide('H-Gly-Pro-Hyp-OH').problems[0]).toMatch(/"Hyp" is not a three-letter/);
    expect(parsePeptide('ALA GLY TRP').residues.map((r) => r.code).join('')).toBe('AGW');
    expect(peptideName(p.residues, { nTerm: p.nTerm, cTerm: p.cTerm })).toBe('Boc-Ala-D-Phe-Gly-OMe');
  });

  it('says which letters it could not draw, and where', () => {
    const p = parsePeptide('AXGUB1');
    expect(p.problems.join(' ')).toMatch(/X \(any amino acid\) at 2/);
    expect(p.problems.join(' ')).toMatch(/U \(selenocysteine\) at 4/);
    expect(parsePeptide('').problems.length).toBe(1);
    expect(parsePeptide('A'.repeat(101)).problems.join(' ')).toMatch(/up to 100/);
  });

  describe('drawn', () => {
    let RDKit: any;
    beforeAll(async () => { RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')(); });
    const canon = (s: string) => { const m = RDKit.get_mol(s); try { return m?.is_valid() ? m.get_smiles() : null; } finally { m?.delete(); } };
    const drawn = (doc: Doc) => canon(toMolfile(doc, [...doc.atoms.keys()], '', { stereo: true }).molblock);

    it('all twenty amino acids, L and D, with their stereocentres', () => {
      for (const d of [false, true]) {
        const res = [...'ACDEFGHIKLMNPQRSTVWY'].map((code) => ({ code, d: d && code !== 'G' }));
        const doc = place(peptideTemplate(res));
        expect(drawn(doc)).toBe(canon(expected(res)));
      }
    });

    it('every residue in either place along the chain (side chain up or down)', () => {
      for (const code of Object.keys(SMILES)) {
        for (const res of [[{ code, d: false }, { code: 'G', d: false }], [{ code: 'G', d: false }, { code, d: false }], [{ code: 'A', d: true }, { code, d: true }]]) {
          expect([code, drawn(place(peptideTemplate(res)))]).toEqual([code, canon(expected(res))]);
        }
      }
    });

    it('with each N- and C-terminal group', () => {
      for (const n of Object.keys(N_END)) {
        for (const c of Object.keys(C_END)) {
          for (const first of ['A', 'P']) {
            const res = [{ code: first, d: false }, { code: 'G', d: false }];
            const doc = place(peptideTemplate(res, { nTerm: n as never, cTerm: c as never }));
            expect([n, c, first, drawn(doc)]).toEqual([n, c, first, canon(expected(res, n, c))]);
          }
        }
      }
    });

    it('as a zig-zag along the page, side chains in turn up and down, no atoms on top of each other', () => {
      const t = peptideTemplate([...'WYFRKH'].map((code) => ({ code, d: false })));
      const xs = t.atoms.map((a) => a[0]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(15);
      for (let i = 0; i < t.atoms.length; i++) {
        for (let j = i + 1; j < t.atoms.length; j++) {
          expect(Math.hypot(t.atoms[i][0] - t.atoms[j][0], t.atoms[i][1] - t.atoms[j][1])).toBeGreaterThan(0.5);
        }
      }
      for (const [a, b] of t.bonds) expect(Math.hypot(t.atoms[a][0] - t.atoms[b][0], t.atoms[a][1] - t.atoms[b][1])).toBeCloseTo(1, 1);
      const doc = place(t);
      const checks = new StructureChecks(doc);
      checks.update();
      expect(checks.list()).toEqual([]);
    });
  });
});

describe('Haworth sugars and nucleic acid templates', () => {
  const SUGARS = TEMPLATES.filter((t) => t.group === 'sugars');
  const NUCLEIC = TEMPLATES.filter((t) => t.group === 'nucleic');

  it('cover the common sugars, both anomers, and the nucleosides and nucleotides of DNA and RNA', () => {
    const ids = new Set([...SUGARS, ...NUCLEIC].map((t) => t.id));
    for (const id of ['a-glc', 'b-glc', 'a-gal', 'b-gal', 'a-man', 'b-man', 'b-glcnac', 'b-galnac', 'a-fuc', 'b-fru', 'b-rib', 'b-drib',
      'base-a', 'base-g', 'base-c', 'base-t', 'base-u', 'adenosine', 'thymidine', 'amp', 'dtmp', 'atp']) expect(ids).toContain(id);
  });

  it('go into a drawing without a chemistry warning, and each has a picture', () => {
    for (const t of [...SUGARS, ...NUCLEIC]) {
      const doc = place(t);
      const checks = new StructureChecks(doc);
      checks.update();
      expect([t.id, checks.list()]).toEqual([t.id, []]);
      expect(templateIcon(t, 64)).toMatch(/^<svg/);
      expect(templateIcon(t, 24)).toMatch(/^<svg/);
    }
  });

  it('a base joins a sugar by a new bond from its ring nitrogen', () => {
    const a = templateById('base-a')!;
    expect(a.join).toBe('bond');
    expect(a.atoms[a.attach][2]).toBe('N');
    const bonds = a.bonds.filter(([i, j]) => i === a.attach || j === a.attach);
    expect(bonds.length).toBe(2); // N9: in both rings of the purine, its H to give up
  });
});
