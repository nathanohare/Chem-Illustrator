// The Knowledge Base's Hammett table (Hansch, Leo and Taft, Chem. Rev. 1991, Tables I and V, with
// each value's original paper), and the drawing of each group with a wavy line where it joins the
// ring. The values themselves are in src/kb/hammett.ts and src/kb/hammett-data.ts.

import type { Template, TemplateAtom, TemplateBond } from '../chem/templates';
import type { Cell, KbTable } from './tables';
import PICS from './hammett-pics.json';
import { CORRECTED } from './hammett-data';
import { HAMMETT, HANSCH_1991, hammettId, joinedBy, onBenzene, originalSources, type Hammett, type HammettValue } from './hammett';

type Pic = { atoms: TemplateAtom[]; bonds: TemplateBond[]; stubs: number[] };
const BY_GROUP = new Map(HAMMETT.map((x) => [x.group, x]));

/** A group's drawing (scripts/kb/build-hammett-pics.mjs), with a wavy line where it joins the ring: by its group ("CF3") or id. */
export function groupPicture(key: string): Template | null {
  const x = BY_GROUP.get(key);
  const id = x ? hammettId(x) : key;
  const p = (PICS as unknown as Record<string, Pic>)[id];
  return p ? { id: `hammett-${id}`, name: x?.group ?? key, group: 'own', atoms: p.atoms, bonds: p.bonds, attach: p.stubs[0], stubs: p.stubs } : null;
}

/** What the constants mean (the "i" by their headings). */
const SIGMA_INFO = 'Hammett substituent constant: how much the group pulls electrons from (positive) or pushes them into (negative) a benzene ring, measured from the acidity of the substituted benzoic acid in water at 25 °C (σm with the group meta to the reaction site, σp para). An electronic effect, not a safety or green score. Source: the paper in each row\'s Original source column, as compiled by Hansch, Leo and Taft, Chem. Rev. 1991, Table I.';
const PLUS_INFO = 'σp⁺ (Brown and Okamoto): σp for a para group that can give electrons straight to a positive centre on the ring\'s other end (a benzylic cation, an electrophilic attack), from the solvolysis of cumyl chlorides. Use it for reactions that build up positive charge in conjugation with the group. Source: the paper named after "σp⁺" in the Original source column, as compiled by Hansch, Leo and Taft, Chem. Rev. 1991, Table V.';
const MINUS_INFO = 'σp⁻: σp for a para group that can take electrons straight from a negative centre on the ring\'s other end (a phenoxide, an anilide), from the acidity of substituted phenols and anilines. Use it for reactions that build up negative charge in conjugation with the group. Source: the paper named after "σp⁻" in the Original source column, as compiled by Hansch, Leo and Taft, Chem. Rev. 1991, Table V.';
const FR_INFO = 'The field/inductive (F) and resonance (R) parts of the group\'s electronic effect (Swain–Lupton, as modified by Hansch, Leo and Taft; σp ≈ F + R). Positive pulls electrons, negative pushes them. Worked out by Hansch, Leo and Taft from σm and σp (Chem. Rev. 1991, eq 8, Table I), not taken from the original papers. R⁺ and R⁻ are σp⁺ − F and σp⁻ − F.';

// a plain minus sign, so the values sort and paste into Excel as numbers
const fmt = (n: number) => (n === 0 ? '0.00' : n.toFixed(2));

function rowOf(x: Hammett): Record<string, Cell> {
  const v = (k: HammettValue) => { const n = x[k]; return n === null ? null : x.uncertain?.includes(k) ? `(${fmt(n)})` : fmt(n); };
  return {
    id: hammettId(x), group: x.group, name: x.name, sm: v('sm'), sp: v('sp'),
    spPlus: x.spPlus === undefined ? null : fmt(x.spPlus), spMinus: x.spMinus === undefined ? null : fmt(x.spMinus),
    F: v('F'), R: v('R'), refs: originalSources(x) + (x.row !== null && CORRECTED[x.row] ? `. ${CORRECTED[x.row]}` : ''), row: x.row, joins: joinedBy(x), smiles: onBenzene(x),
  };
}

export const HAMMETT_TABLE: KbTable = {
  id: 'hammett',
  title: 'Hammett Constants',
  about: 'Hammett σm, σp, σp⁺ and σp⁻, and the field (F) and resonance (R) parameters (Swain–Lupton, as modified by Hansch, Leo and Taft; σp ≈ F + R), of substituents on a benzene ring: every group in Tables I and V of Hansch, Leo and Taft (Chem. Rev. 1991), the most used ones first. Search by group (NO2, OMe), name or structure, or filter by the atom it is attached through. Values in brackets are ones the paper marks as less certain. Each row names the original paper each value was measured in.',
  columns: [
    { key: 'pic', label: 'Structure', picture: true },
    { key: 'group', label: 'Group' },
    { key: 'name', label: 'Name' },
    { key: 'sm', label: 'σm', numeric: true, info: SIGMA_INFO },
    { key: 'sp', label: 'σp', numeric: true, info: SIGMA_INFO },
    { key: 'spPlus', label: 'σp⁺', numeric: true, info: PLUS_INFO },
    { key: 'spMinus', label: 'σp⁻', numeric: true, info: MINUS_INFO },
    { key: 'F', label: 'F', numeric: true, info: FR_INFO },
    { key: 'R', label: 'R', numeric: true, info: FR_INFO },
    { key: 'refs', label: 'Original source', prose: true, info: 'The paper(s) each value was measured or first reported in, as Hansch, Leo and Taft cite them (Table I for σm and σp, Table V for σp⁺ and σp⁻). Hydrogen is 0 by definition.' },
    { key: 'row', label: 'Table I no.', numeric: true, narrow: true },
    { key: 'joins', label: 'Attached through', filter: true, hidden: true, info: 'The atom that bonds the group to the benzene ring: carbon for CF₃, oxygen for OMe, nitrogen for NO₂. Pick one to compare only groups attached the same way. Halogen is F, Cl, Br or I itself; Fused ring (3,4-) is a ring joined to the benzene at two places.' },
  ],
  picture: (row: Record<string, Cell>) => groupPicture(String(row.id)),
  drawOn: 'c1ccccc1',
  rows: HAMMETT.map(rowOf),
  sources: [HANSCH_1991, { label: 'Original papers for each value: the Original source column (as cited in Tables I and V)' }, { label: 'Names, SMILES, drawings and order by Chemweave' }],
};
