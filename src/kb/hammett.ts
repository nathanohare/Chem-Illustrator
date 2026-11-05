// Hammett substituent constants (σm, σp, σp⁺, σp⁻) and the field and resonance parameters F and R
// (modified Swain–Lupton) of substituents on a benzene ring: all of Table I (530 groups) and Table V
// (σp⁺ and σp⁻) of Hansch, Leo and Taft, Chem. Rev. 1991, 91, 165, each value credited to the paper
// it was measured in. The data and how it was checked are in src/kb/hammett-data.ts. Each group's
// SMILES ([*] where it joins the ring) is written here, for its drawing, for finding a group drawn
// on a ring (src/chem/hammett-match.ts) and for searching the table by structure. The Knowledge
// Base's table and the drawings are in src/kb/hammett-table.ts (kept apart, as the chemistry worker
// needs only the values).

import { COMMON_COUNT, REFS, TABLE_I, TABLE_V, TABLE_V_ONLY } from './hammett-data';

export type HammettValue = 'sm' | 'sp' | 'F' | 'R';

export interface Hammett {
  /** The group as chemists write it. */
  group: string;
  name: string;
  /** The group with [*] at the atom that joins the ring ('' when it has no plain SMILES). */
  smiles: string;
  /** null for a group with only σp⁺ or σp⁻ measured (Table V). */
  sm: number | null;
  sp: number | null;
  F: number | null;
  R: number | null;
  /** σp⁺ (for a para group conjugated with a positive centre) and σp⁻ (with a negative one). */
  spPlus?: number;
  spMinus?: number;
  /** Row in Hansch, Leo and Taft's Table I (null for a group only Table V has). */
  row: number | null;
  /** Row in their Table V (σp⁺, σp⁻). */
  vrow?: number;
  /** Values the paper brackets as suspected of being inaccurate. */
  uncertain?: HammettValue[];
  /** The papers (REFS numbers) σm and σp come from; empty for hydrogen (0 by definition). */
  refs: number[];
  plusRef?: number;
  minusRef?: number;
  /** One of the groups chemists use most (listed first). */
  common?: boolean;
}

const num = (s: string): number | null => (s === '' ? null : Number(s.replace(/[()]/g, '')));

function readTables(): Hammett[] {
  const out: Hammett[] = [];
  const byRow = new Map<number, Hammett>();
  TABLE_I.split('\n').forEach((line, i) => {
    const [row, group, name, sm, sp, F, R, refs, smiles] = line.split('|');
    const vals = { sm, sp, F, R };
    const uncertain = (Object.keys(vals) as HammettValue[]).filter((k) => vals[k].startsWith('('));
    const x: Hammett = {
      group, name, smiles, sm: num(sm), sp: num(sp), F: num(F), R: num(R), row: Number(row),
      refs: refs ? refs.split(',').map(Number) : [],
      ...(uncertain.length ? { uncertain } : {}),
      ...(i < COMMON_COUNT ? { common: true } : {}),
    };
    out.push(x);
    byRow.set(x.row!, x);
  });
  const only = new Map(TABLE_V_ONLY.split('\n').map((l) => { const [v, group, name, smiles] = l.split('|'); return [Number(v), { group, name, smiles }]; }));
  for (const line of TABLE_V.split('\n')) {
    const [v, row, plus, plusRef, minus, minusRef] = line.split('|');
    let x = row ? byRow.get(Number(row)) : undefined;
    if (!x) {
      const o = only.get(Number(v))!;
      x = { ...o, sm: null, sp: null, F: null, R: null, row: null, refs: [] };
      out.push(x);
    }
    x.vrow = Number(v);
    if (plus !== '') { x.spPlus = Number(plus); if (plusRef) x.plusRef = Number(plusRef); }
    if (minus !== '') { x.spMinus = Number(minus); if (minusRef) x.minusRef = Number(minusRef); }
  }
  return out;
}

export const HAMMETT: Hammett[] = readTables();

export const HANSCH_1991 = { label: 'Hansch, C.; Leo, A.; Taft, R. W. Chem. Rev. 1991, 91, 165–195, Tables I and V', url: 'https://doi.org/10.1021/cr00002a004' };

/** A group's key for its drawing: its Table I number, or V and its Table V number. */
export const hammettId = (x: Hammett): string => (x.row !== null ? String(x.row) : `V${x.vrow}`);

/** The group on benzene (PhX), so a SMILES search for nitrobenzene finds NO2. */
export function onBenzene(x: Hammett): string | null {
  if (!x.smiles || x.smiles.includes('.')) return null;
  if (x.group === 'H') return 'c1ccccc1';
  const two = x.smiles.split('[*]').length - 1;
  if (two === 2) return 'c1ccc2c(c1)' + x.smiles.replace(/^\[\*\]/, '').replace(/\[\*\]$/, '2');
  return x.smiles.replace('[*]', 'c1ccccc1');
}

/** Groups with no SMILES that don't join by carbon (carboranyls bonded through boron), or whose joining atom the paper leaves unclear. */
const JOINS_UNDRAWN: Record<number, string> = { 246: 'Boron', 247: 'Boron', 249: 'Boron', 473: 'Sulfur', 328: 'Other', 341: 'Other', 498: 'Other', 499: 'Other', 500: 'Other' };
const ELEMENT: Record<string, string> = {
  C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', S: 'Sulfur', F: 'Halogen', Cl: 'Halogen', Br: 'Halogen', I: 'Halogen', P: 'Phosphorus', Si: 'Silicon',
  Ge: 'Germanium', Sn: 'Tin', B: 'Boron', Se: 'Selenium', Te: 'Tellurium', Hg: 'Mercury', As: 'Arsenic', H: 'Hydrogen',
};

/** The element that joins the ring, for the "Joined by" filter ("Fused ring (3,4-)" for a group joined at two places). */
export function joinedBy(x: Hammett): string {
  if (!x.smiles) return (x.row !== null && JOINS_UNDRAWN[x.row]) || 'Carbon';
  if (x.smiles.split('[*]').length === 3) return 'Fused ring (3,4-)';
  const m = /^\[\*\](?:\[([A-Za-z][a-z]?)|(Cl|Br|[BCNOSPFI]|[cnos]))/.exec(x.smiles);
  const el = m ? (m[1] ?? m[2]) : '';
  return ELEMENT[el.length === 1 ? el.toUpperCase() : el] ?? 'Other';
}

const cite = (n: number) => REFS[n] ?? `ref. ${n}`;

/** The original papers for a group's values, in our short form ("Definition" for hydrogen). */
export function originalSources(x: Hammett): string {
  const main = x.row === null ? '' : x.refs.length ? x.refs.map(cite).join('; ') : 'Definition';
  const pm: string[] = [];
  if (x.spPlus !== undefined) pm.push(`σp⁺: ${x.plusRef ? cite(x.plusRef) : 'Definition'}`);
  if (x.spMinus !== undefined) pm.push(`σp⁻: ${x.minusRef ? cite(x.minusRef) : 'Definition'}`);
  if (!pm.length) return main;
  if (x.plusRef === undefined && x.minusRef === undefined && main === 'Definition') return main;
  return [...(main ? [`σm, σp: ${main}`] : []), ...pm].join('. ');
}
