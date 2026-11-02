// The Ligand Library: several hundred ligands by family (phosphines, NHCs, bipyridines, salens,
// pincers, π-ligands…), each with its abbreviations, name, how it bonds to a metal (L and X),
// the SMILES a typed abbreviation stands for, its PubChem record, and a drawing of it on a
// metal M in the usual orientation. Made by scripts/make-ligand-library.mjs from
// scripts/ligands/ligand-data.mjs; only the structures and drawings are stored, and the
// program draws them.

import data from './ligand-library.json';

export interface LigandFamily {
  id: string;
  name: string;
  note: string;
}

export interface Ligand {
  id: string;
  family: string;
  /** Abbreviations, the usual one first (dppf, DPPF). Each works as a typed label. */
  abbr: string[];
  name: string;
  /** The free ligand as SMILES, starting at the atom where a typed abbreviation joins. */
  smiles: string;
  /** Its drawing on a metal M: a template's id. */
  tpl: string;
  /** How many electron pairs it gives the metal (L) and how many bonds it shares (X). */
  l: number;
  x: number;
  /** Atoms bonded side-on to the metal, for π ligands (η⁵ for Cp). */
  hapto?: number;
  /** PubChem compound record. */
  cid?: number;
  note?: string;
  /** On the Ligands palette as well. */
  palette?: boolean;
}

export const LIGAND_FAMILIES: LigandFamily[] = data.families;
export const LIGANDS: Ligand[] = data.ligands as Ligand[];

const BY_ABBR = new Map<string, Ligand>();
const BY_ID = new Map<string, Ligand>();
for (const l of LIGANDS) {
  BY_ID.set(l.id, l);
  for (const a of l.abbr) BY_ABBR.set(a, l);
}

/** The ligand a label (dppf, XPhos, Cp*) stands for, if it is one. */
export const ligandByAbbr = (label: string): Ligand | undefined => BY_ABBR.get(label);
export const ligandById = (id: string): Ligand | undefined => BY_ID.get(id);
export const familyOf = (l: Ligand): LigandFamily | undefined => LIGAND_FAMILIES.find((f) => f.id === l.family);

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n: number) => (n > 1 ? String(n).replace(/\d/g, (d) => SUBSCRIPT[Number(d)]) : '');

/** How it bonds, in the covalent bond classification: L, X, L₂, LX, L₂X… (η⁵ for π ligands). */
export function bondingType(l: Ligand): string {
  const t = (l.l ? 'L' + sub(l.l) : '') + (l.x ? 'X' + sub(l.x) : '');
  return l.hapto ? `η${'⁰¹²³⁴⁵⁶⁷⁸'[l.hapto] ?? l.hapto}, ${t}` : t;
}

/** How many donor atoms bond to the metal, in words. */
export function denticity(l: Ligand): string {
  if (l.hapto) return `π (η${'⁰¹²³⁴⁵⁶⁷⁸'[l.hapto] ?? l.hapto})`;
  const n = l.l + l.x;
  return ['', 'monodentate', 'bidentate', 'tridentate', 'tetradentate', 'pentadentate', 'hexadentate'][n] ?? `${n}-dentate`;
}

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[′'‘’`]/g, "'").replace(/[‐-―−]/g, '-');

/**
 * The ligands matching a search (an abbreviation, part of a name, a PubChem CID, or L₂X-style
 * bonding such as "LX"), best first: abbreviations that match exactly, then ones that start with
 * it, then names. An empty search gives them all in library order. `family` limits it to one.
 */
export function searchLigands(query: string, family = ''): Ligand[] {
  const list = family ? LIGANDS.filter((l) => l.family === family) : LIGANDS;
  const q = fold(query.trim());
  if (!q) return list;
  const words = q.split(/\s+/);
  const scored: { l: Ligand; s: number; i: number }[] = [];
  list.forEach((l, i) => {
    const abbr = l.abbr.map(fold);
    let s = 0;
    if (abbr.includes(q)) s = 100;
    else if (abbr.some((a) => a.startsWith(q))) s = 60;
    else if (abbr.some((a) => a.includes(q))) s = 40;
    const name = fold(l.name);
    const fam = fold(familyOf(l)?.name ?? '');
    const type = fold(bondingType(l).replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))));
    const hay = `${name} ${fam} ${l.note ? fold(l.note) : ''}`;
    if (!s && words.every((w) => hay.includes(w) || abbr.some((a) => a.includes(w)))) s = name.startsWith(q) ? 30 : 20;
    if (!s && l.cid && String(l.cid) === q) s = 90;
    if (!s && (type === q || type.endsWith(` ${q}`))) s = 10;
    if (s) scored.push({ l, s, i });
  });
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.l);
}
