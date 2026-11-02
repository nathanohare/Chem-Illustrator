// Other programs' chemistry files, opened as drawings and written from them: MDL molfiles
// (V2000 and V3000), SD files, RXN reaction files (V2000 and V3000), Marvin documents (MRV),
// Ketcher's KET, Chemical Markup Language (CML) and ChemDoodle JSON.
//
// Each reader turns its file into a plain scene (molecules with their atoms and bonds, reaction
// arrows, + signs and text, in the file's own units) and sceneToDoc draws the scene at the
// drawing's bond length. Writing goes the other way: docToScene reads the drawing's structures
// (through the molfile writer, so labels like OMe are written out as atoms), its straight arrows,
// + signs and text, and each writer puts the scene in its format.
//
// Written from each format's published description:
// - molfiles, SD and RXN files: BIOVIA's "CTfile Formats" (the V2000 and V3000 connection tables,
//   M  CHG/ISO/RAD/STY/SAL/SMT lines, A alias lines, $RXN and $RXN V3000 headers);
// - MRV: ChemAxon's Marvin Documents format (cml/MDocument/MChemicalStruct, molecule with
//   atomArray in either form, bondArray with bondStereo W/H, reaction with reactantList,
//   agentList, productList and arrow, MReactionSign, MTextBox, MPolyline), checked against the
//   example files of RDKit's BSD-licensed Marvin reader tests;
// - KET: the JSON schema in EPAM's Apache-licensed Ketcher (root.nodes with $ref molecules,
//   arrow and plus nodes, y upwards, bond types 1–4 and stereo 1/4/6 as in molfiles);
// - CML: the CML schema at xml-cml.org (molecule, atomArray/atom with elementType, x2, y2,
//   formalCharge, isotopeNumber, hydrogenCount; bondArray/bond with atomRefs2, order and
//   bondStereo; reaction with reactantList and productList);
// - ChemDoodle JSON: iChemLabs' published ChemDoodle JSON format (m molecules with a atoms and b
//   bonds, s shapes with Line arrows; y downwards).
// ACD/ChemSketch's .sk2 has no published description, so it isn't read (ChemSketch saves MOL).

import { Doc, keepOnPage, shiftDrawing, type Arrow, type BondDisplay, type StepRoles } from '../model';
import type { DocStyle } from '../style';
import { elementNumber, SYMBOLS } from '../chem/elements';
import { toMolfile, v3000Ctab, v3000Molfile, type MAtom, type MBond } from '../chem/molfile';
import { plainMeasure, reactionSteps, schemeItems, itemFinder } from '../chem/reaction';
import { placeSpecies } from '../chem/species';
import { plainText } from '../richtext';
import { arialWidth } from '../text-metrics';

// ---------------------------------------------------------------- the plain scene

export interface FAtom {
  /** Element symbol, or the label of a group (Ph, OMe, R1, *). */
  sym: string;
  x: number;
  y: number;
  charge?: number;
  iso?: number;
  /** Molfile radical code: 1 singlet, 2 doublet, 3 triplet. */
  rad?: number;
  /** Atom-atom map number in a reaction. */
  map?: number;
}
export type FStereo = 'wedge' | 'hash' | 'wavy';
export interface FBond {
  a: number;
  b: number;
  /** 1, 2, 3, 1.5 (aromatic), 0.5 (partial). */
  order: number;
  stereo?: FStereo;
  dative?: boolean;
}
export type FRole = 'reactant' | 'agent' | 'product';
export interface FMol {
  atoms: FAtom[];
  bonds: FBond[];
  name?: string;
  role?: FRole;
}
export type FArrowKind = 'synthesis' | 'retro' | 'equilibrium' | 'resonance';
export interface FScene {
  mols: FMol[];
  arrows: { x1: number; y1: number; x2: number; y2: number; kind?: FArrowKind }[];
  pluses: { x: number; y: number }[];
  /** Text, centred on (x, y). */
  texts: { x: number; y: number; text: string }[];
  /** y grows downwards in the file (ChemDoodle); otherwise upwards, as in molfiles. */
  yDown?: boolean;
  /** The file's usual bond length, for a file whose structures have no bonds to measure. */
  unit?: number;
}

/** The kinds of chemistry file read here, by extension. */
export type ChemFormat = 'mol' | 'rxn' | 'mrv' | 'ket' | 'cml' | 'cdjson' | 'sdf';
export const FOREIGN_EXTENSIONS = ['mol', 'mdl', 'rxn', 'mrv', 'ket', 'cml', 'json'];

/** Which chemistry format a file is, from its extension and (for .json and unknown files) its contents; null for none of these. */
export function chemFormatOf(name: string, text: string): ChemFormat | null {
  const ext = (/\.([^.\\/]+)$/.exec(name)?.[1] ?? '').toLowerCase();
  const t = text.trimStart();
  if (ext === 'mol' || ext === 'mdl') return t.startsWith('$RXN') ? 'rxn' : 'mol';
  if (ext === 'rxn') return 'rxn';
  if (ext === 'mrv') return 'mrv';
  if (ext === 'ket') return 'ket';
  if (ext === 'cml') return 'cml';
  if (ext === 'sdf' || ext === 'sd') return 'sdf';
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      if (j && typeof j === 'object') {
        if (j.root && Array.isArray(j.root.nodes)) return 'ket';
        if (Array.isArray(j.m) || (Array.isArray(j.s) && j.s.some((s: { t?: string }) => s && s.t === 'Line'))) return 'cdjson';
      }
    } catch { /* not JSON */ }
    return null;
  }
  if (ext === 'json') return null;
  if (t.startsWith('$RXN')) return 'rxn';
  if (/^<\?xml[^>]*>\s*<cml\b[^>]*chemaxon/i.test(t) || /^<cml\b[^>]*chemaxon/i.test(t) || /<MDocument\b/.test(t.slice(0, 4000))) return 'mrv';
  if (/<(cml:)?(cml|molecule|reaction)\b/.test(t.slice(0, 2000)) && /xml-cml\.org/.test(t.slice(0, 4000))) return 'cml';
  return null;
}

// ---------------------------------------------------------------- molfiles

const RADICAL_OF = (rad: number | undefined) => rad === 1 ? 'singlet' as const : rad === 2 ? 'doublet' as const : rad === 3 ? 'triplet' as const : undefined;

/** The molecule of a molfile (V2000 or V3000), or null when it can't be read. */
export function readMolfile(text: string): FMol | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return molAt(lines, 0)?.mol ?? null;
}

/** The molecule starting at `start` (its name line) and the line after its M  END. */
function molAt(lines: string[], start: number): { mol: FMol; end: number } | null {
  const counts = lines[start + 3] ?? '';
  if (/V3000/.test(counts)) return v3000At(lines, start + 4, lines[start]?.trim());
  const na = parseInt(counts.slice(0, 3), 10), nb = parseInt(counts.slice(3, 6), 10);
  if (!Number.isFinite(na) || !Number.isFinite(nb) || na < 0) return null;
  const atoms: FAtom[] = [];
  for (let i = 0; i < na; i++) {
    const l = lines[start + 4 + i];
    if (l === undefined) return null;
    const ccc = parseInt(l.slice(36, 39), 10) || 0;
    const a: FAtom = { sym: l.slice(31, 34).trim() || 'C', x: parseFloat(l.slice(0, 10)) || 0, y: parseFloat(l.slice(10, 20)) || 0 };
    // the old charge column: 1 = +3, 2 = +2, 3 = +1, 4 = doublet radical, 5 = −1, 6 = −2, 7 = −3
    if (ccc >= 1 && ccc <= 7 && ccc !== 4) a.charge = 4 - ccc;
    if (ccc === 4) a.rad = 2;
    const map = parseInt(l.slice(60, 63), 10);
    if (map > 0) a.map = map;
    atoms.push(a);
  }
  const bonds: FBond[] = [];
  for (let i = 0; i < nb; i++) {
    const l = lines[start + 4 + na + i];
    if (l === undefined) return null;
    const b = bondOf(parseInt(l.slice(0, 3), 10) - 1, parseInt(l.slice(3, 6), 10) - 1, parseInt(l.slice(6, 9), 10), parseInt(l.slice(9, 12), 10) || 0, false);
    if (b && atoms[b.a] && atoms[b.b]) bonds.push(b);
  }
  let i = start + 4 + na + nb;
  const sup = new Map<number, { atoms: number[]; label: string }>();
  let chgSeen = false;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('M  END')) { i++; break; }
    if (l.startsWith('$$$$')) break;
    // A  n / text: an atom's alias, shown as its label
    if (l.startsWith('A  ')) {
      const n = parseInt(l.slice(3), 10) - 1;
      const alias = (lines[i + 1] ?? '').trim();
      if (atoms[n] && alias) atoms[n].sym = alias;
      i++;
      continue;
    }
    const pairs = (field: 'charge' | 'iso' | 'rad') => {
      const n = parseInt(l.slice(6, 9), 10);
      for (let k = 0; k < n; k++) {
        const idx = parseInt(l.slice(10 + k * 8, 13 + k * 8), 10) - 1;
        const v = parseInt(l.slice(14 + k * 8, 17 + k * 8), 10);
        if (atoms[idx] && Number.isFinite(v)) atoms[idx][field] = v;
      }
    };
    if (l.startsWith('M  CHG')) {
      // M  CHG lines replace the old charge column for the whole molecule
      if (!chgSeen) { for (const a of atoms) { delete a.charge; } chgSeen = true; }
      pairs('charge');
    } else if (l.startsWith('M  ISO')) pairs('iso');
    else if (l.startsWith('M  RAD')) pairs('rad');
    else if (l.startsWith('M  STY')) {
      const n = parseInt(l.slice(6, 9), 10);
      for (let k = 0; k < n; k++) {
        const id = parseInt(l.slice(10 + k * 8, 13 + k * 8), 10);
        if (l.slice(14 + k * 8, 17 + k * 8).trim() === 'SUP') sup.set(id, { atoms: [], label: '' });
      }
    } else if (l.startsWith('M  SAL')) {
      const g = sup.get(parseInt(l.slice(6, 10), 10));
      const n = parseInt(l.slice(10, 13), 10);
      for (let k = 0; k < n && g; k++) g.atoms.push(parseInt(l.slice(14 + k * 4, 17 + k * 4), 10) - 1);
    } else if (l.startsWith('M  SMT')) {
      const g = sup.get(parseInt(l.slice(6, 10), 10));
      if (g) g.label = l.slice(11).trim();
    }
  }
  const mol: FMol = { atoms, bonds, ...(lines[start]?.trim() ? { name: lines[start].trim() } : {}) };
  for (const a of atoms) fixHydrogenIsotopes(a);
  return { mol: contract(mol, [...sup.values()]), end: i };
}

/** A bond from molfile numbers (order 1–4, 8 any, 9 dative; stereo 1 wedge, 6 hash, 4 either). */
function bondOf(a: number, b: number, order: number, stereo: number, v3000: boolean): FBond | null {
  if (!(a >= 0) || !(b >= 0)) return null;
  const f: FBond = { a, b, order: order === 2 ? 2 : order === 3 ? 3 : order === 4 ? 1.5 : order === 10 ? 0.5 : 1 };
  if (order === 9) f.dative = true;
  // V3000 CFG: 1 up, 2 either, 3 down
  const st = v3000 ? (stereo === 1 ? 'wedge' : stereo === 3 ? 'hash' : stereo === 2 ? 'wavy' : undefined)
    : (stereo === 1 ? 'wedge' : stereo === 6 ? 'hash' : stereo === 4 ? 'wavy' : undefined);
  if (st && f.order === 1) f.stereo = st;
  return f;
}

/** D and T as hydrogen isotopes. */
function fixHydrogenIsotopes(a: FAtom): void {
  if (a.sym === 'D' || a.sym === 'T') { a.iso = a.sym === 'D' ? 2 : 3; a.sym = 'H'; }
}

/** One V3000 field of an atom or bond line (CHG=1, CFG=3, MASS=13). */
function v3Field(parts: string[], key: string): string | undefined {
  const p = parts.find((x) => x.startsWith(key + '='));
  return p?.slice(key.length + 1);
}

/** The words of a V3000 line, with its continuation lines (ending in -) joined on and quoted words kept whole. */
function v3Lines(lines: string[], from: number): { words: string[][]; end: number } {
  const words: string[][] = [];
  let i = from, cur = '';
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (!l.startsWith('M  V30 ')) { if (l.startsWith('M  END')) break; continue; }
    const body = l.slice(7);
    // a connection table ends at END CTAB (in an RXN file the next one follows)
    if (body.trim() === 'END CTAB') break;
    if (body.endsWith('-')) { cur += body.slice(0, -1); continue; }
    cur += body;
    words.push(cur.match(/"[^"]*"|\([^)]*\)|\S+/g)?.map((w) => w.replace(/^"|"$/g, '')) ?? []);
    cur = '';
  }
  return { words, end: i };
}

/** A V3000 connection table starting at `from` (after the counts line). */
function v3000At(lines: string[], from: number, name?: string): { mol: FMol; end: number } | null {
  const { words, end } = v3Lines(lines, from);
  const atoms: FAtom[] = [];
  const bonds: FBond[] = [];
  const index = new Map<string, number>();
  const sup: { atoms: number[]; label: string }[] = [];
  let block = '';
  for (const w of words) {
    if (w[0] === 'BEGIN') { block = w[1]; continue; }
    if (w[0] === 'END') { block = ''; continue; }
    if (block === 'ATOM') {
      const [idx, sym, x, y] = w;
      let s = sym;
      // an atom list ([C,N]) is shown by its first element; R# is an R group
      if (s.startsWith('[')) s = s.slice(1).split(',')[0];
      const a: FAtom = { sym: s, x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
      const rest = w.slice(6);
      const chg = parseInt(v3Field(rest, 'CHG') ?? '', 10), mass = parseInt(v3Field(rest, 'MASS') ?? '', 10), rad = parseInt(v3Field(rest, 'RAD') ?? '', 10);
      const map = parseInt(w[5] ?? '', 10);
      if (chg) a.charge = chg;
      if (mass > 0) a.iso = mass;
      if (rad > 0) a.rad = rad;
      if (map > 0) a.map = map;
      const rg = v3Field(rest, 'RGROUPS');
      if (s === 'R#' && rg) { const n = /\(\d+\s+(\d+)/.exec(rg)?.[1]; a.sym = n ? 'R' + n : 'R'; }
      fixHydrogenIsotopes(a);
      index.set(idx, atoms.length);
      atoms.push(a);
    } else if (block === 'BOND') {
      const [, type, a1, a2] = w;
      const b = bondOf(index.get(a1) ?? -1, index.get(a2) ?? -1, parseInt(type, 10), parseInt(v3Field(w.slice(4), 'CFG') ?? '0', 10), true);
      if (b) bonds.push(b);
    } else if (block === 'SGROUP') {
      if (w[1] !== 'SUP') continue;
      const list = v3Field(w.slice(3), 'ATOMS');
      const label = v3Field(w.slice(3), 'LABEL') ?? '';
      const ids = list ? list.replace(/[()]/g, '').trim().split(/\s+/).slice(1) : [];
      sup.push({ atoms: ids.map((id) => index.get(id) ?? -1).filter((k) => k >= 0), label });
    }
  }
  const mol: FMol = { atoms, bonds, ...(name ? { name } : {}) };
  return { mol: contract(mol, sup), end: end + 1 };
}

/**
 * Superatom groups (ChemDraw and others write OMe, Boc and so on out as atoms and mark them as an
 * abbreviation) put back as one atom with the label, where the group joins the rest by one bond.
 */
function contract(mol: FMol, groups: { atoms: number[]; label: string }[]): FMol {
  const drop = new Set<number>();
  for (const g of groups) {
    if (!g.label || !g.atoms.length) continue;
    const inG = new Set(g.atoms);
    const crossing = mol.bonds.filter((b) => inG.has(b.a) !== inG.has(b.b));
    if (crossing.length !== 1) continue;
    const head = inG.has(crossing[0].a) ? crossing[0].a : crossing[0].b;
    mol.atoms[head] = { sym: g.label, x: mol.atoms[head].x, y: mol.atoms[head].y };
    for (const k of g.atoms) if (k !== head) drop.add(k);
  }
  if (!drop.size) return mol;
  const renum = new Map<number, number>();
  const atoms: FAtom[] = [];
  mol.atoms.forEach((a, i) => { if (!drop.has(i)) { renum.set(i, atoms.length); atoms.push(a); } });
  const bonds = mol.bonds.filter((b) => renum.has(b.a) && renum.has(b.b)).map((b) => ({ ...b, a: renum.get(b.a)!, b: renum.get(b.b)! }));
  return { ...mol, atoms, bonds };
}

/** The molecules of an SD file. */
export function readSdfMols(text: string): FMol[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: FMol[] = [];
  let i = 0;
  while (i < lines.length) {
    const got = molAt(lines, i);
    if (got) out.push(got.mol);
    // on to the line after the record's $$$$
    let j = got ? got.end : i;
    while (j < lines.length && !lines[j].startsWith('$$$$')) j++;
    i = j + 1;
  }
  return out;
}

/** An RXN file (V2000 or V3000) as a scene: the reactants, agents and products, to be laid out in a row. */
export function readRxnFile(text: string): FScene | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const head = lines.findIndex((l) => l.startsWith('$RXN'));
  if (head < 0) return null;
  const mols: FMol[] = [];
  if (lines[head].includes('V3000')) {
    let role: FRole | null = null;
    for (let i = head + 1; i < lines.length; i++) {
      const l = lines[i];
      const m = /^M {2}V30 BEGIN (REACTANT|PRODUCT|AGENT)/.exec(l);
      if (m) { role = m[1] === 'REACTANT' ? 'reactant' : m[1] === 'PRODUCT' ? 'product' : 'agent'; continue; }
      if (/^M {2}V30 END (REACTANT|PRODUCT|AGENT)/.test(l)) { role = null; continue; }
      if (role && l.startsWith('M  V30 BEGIN CTAB')) {
        const got = v3000At(lines, i, '');
        if (!got) return null;
        mols.push({ ...got.mol, role });
        i = got.end - 1;
      }
    }
  } else {
    const counts = lines[head + 4] ?? '';
    const nr = parseInt(counts.slice(0, 3), 10), np = parseInt(counts.slice(3, 6), 10);
    const na = parseInt(counts.slice(6, 9), 10) || 0;
    if (!Number.isFinite(nr) || !Number.isFinite(np)) return null;
    let i = head + 5, k = 0;
    while (i < lines.length) {
      if (!lines[i].startsWith('$MOL')) { i++; continue; }
      const got = molAt(lines, i + 1);
      if (!got) return null;
      const role: FRole = k < nr ? 'reactant' : k < nr + np ? 'product' : 'agent';
      if (k < nr + np + na) mols.push({ ...got.mol, role });
      k++;
      i = got.end;
    }
    if (k < nr + np) return null;
  }
  return { mols, arrows: [], pluses: [], texts: [] };
}

// ---------------------------------------------------------------- XML formats (MRV, CML)

function parseXml(text: string): Document | null {
  try {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    return doc;
  } catch {
    return null;
  }
}

/** Child elements by local name (any namespace). */
const kids = (el: Element, name: string): Element[] => Array.from(el.children).filter((c) => c.localName === name);
const below = (el: Element | Document, name: string): Element[] => Array.from(el.getElementsByTagNameNS('*', name));
const num = (s: string | null | undefined) => { const v = parseFloat(s ?? ''); return Number.isFinite(v) ? v : 0; };

/**
 * The atoms and bonds of a CML-style molecule element (MRV and CML share it): atomArray with
 * atom children or with space-separated arrays (atomID, elementType, x2, y2…), bondArray with
 * bond children. Superatom groups shown contracted (an atom R pointing at a SuperatomSgroup)
 * become an atom with the group's name; expanded ones are read as atoms.
 */
function cmlMolecule(m: Element, mrv: boolean): FMol {
  const atoms: FAtom[] = [];
  const bonds: FBond[] = [];
  const index = new Map<string, number>();
  const groupTitle = new Map<string, { title: string; el: Element }>();
  for (const s of kids(m, 'molecule')) if (s.getAttribute('role') === 'SuperatomSgroup') groupTitle.set(s.getAttribute('id') ?? '', { title: s.getAttribute('title') ?? '', el: s });
  const contracted = new Set<string>();
  const addAtoms = (owner: Element) => {
    for (const arr of kids(owner, 'atomArray')) {
      const list = kids(arr, 'atom');
      const rows: Record<string, string>[] = list.length
        ? list.map((a) => Object.fromEntries(Array.from(a.attributes).map((x) => [x.localName, x.value])))
        : arrayRows(arr);
      for (const r of rows) {
        const id = r.id ?? r.atomID ?? `a${atoms.length + 1}`;
        let sym = r.elementType ?? 'C';
        if (mrv && sym === 'R' && r.sgroupRef && r.sgroupRef !== '0' && groupTitle.has(r.sgroupRef)) {
          sym = groupTitle.get(r.sgroupRef)!.title || 'R';
          contracted.add(r.sgroupRef);
        } else if (sym === 'R' && r.rgroupRef && r.rgroupRef !== '0') sym = 'R' + r.rgroupRef;
        else if (sym === 'Du' || sym === 'R') sym = sym === 'Du' ? '*' : 'R';
        const a: FAtom = { sym, x: num(r.x2 ?? r.x3), y: num(r.y2 ?? r.y3) };
        const chg = parseInt(r.formalCharge ?? '', 10), iso = parseInt(r.isotopeNumber ?? r.isotope ?? '', 10), map = parseInt(r.mrvMap ?? '', 10);
        if (chg) a.charge = chg;
        if (iso > 0) a.iso = iso;
        if (map > 0) a.map = map;
        const rad = r.radical ?? r.spinMultiplicity;
        if (rad) a.rad = rad === 'monovalent' || rad === '2' ? 2 : rad === 'divalent1' || rad === 'divalent' || rad === '1' ? 1 : rad === 'divalent3' || rad === '3' ? 3 : undefined;
        if (!a.rad) delete a.rad;
        fixHydrogenIsotopes(a);
        index.set(id, atoms.length);
        atoms.push(a);
      }
    }
  };
  const addBonds = (owner: Element) => {
    for (const arr of kids(owner, 'bondArray')) {
      for (const b of kids(arr, 'bond')) {
        const [r1, r2] = (b.getAttribute('atomRefs2') ?? '').trim().split(/\s+/);
        const a = index.get(r1), c = index.get(r2);
        if (a === undefined || c === undefined) continue;
        const o = b.getAttribute('order') ?? '1';
        const f: FBond = { a, b: c, order: o === '2' || o === 'D' ? 2 : o === '3' || o === 'T' ? 3 : o === 'A' || o === '1.5' ? 1.5 : 1 };
        if (b.getAttribute('convention') === 'cxn:coord') f.dative = true;
        const st = kids(b, 'bondStereo')[0];
        const sv = (st?.textContent ?? '').trim() || st?.getAttribute('convention') || '';
        if (f.order === 1 && sv === 'W') f.stereo = 'wedge';
        else if (f.order === 1 && sv === 'H') f.stereo = 'hash';
        else if (f.order === 1 && (sv === 'S' || st?.getAttribute('convention') === 'MDL' && st.getAttribute('conventionValue') === '4')) f.stereo = 'wavy';
        bonds.push(f);
      }
    }
  };
  addAtoms(m);
  addBonds(m);
  // expanded superatom groups and other sub-groups keep their atoms in a molecule of their own
  for (const s of kids(m, 'molecule')) {
    const id = s.getAttribute('id') ?? '';
    if (contracted.has(id)) continue;
    addAtoms(s);
    addBonds(s);
  }
  return { atoms, bonds, ...(m.getAttribute('title') ? { name: m.getAttribute('title')! } : {}) };
}

/** An atomArray written as attribute arrays: one record per atom. */
function arrayRows(arr: Element): Record<string, string>[] {
  const cols = Array.from(arr.attributes).map((x) => [x.localName, x.value.trim().split(/\s+/)] as const);
  const n = Math.max(0, ...cols.map(([, v]) => v.length));
  const rows: Record<string, string>[] = [];
  for (let i = 0; i < n; i++) rows.push(Object.fromEntries(cols.map(([k, v]) => [k, v[i] ?? ''])));
  return rows;
}

/** MRV text with its formatting codes ({fg=#000000,font=Helvetica}) taken out. */
const mrvText = (s: string) => s.replace(/\{[^}]*\}/g, '').replace(/\r\n?/g, '\n').trim();

/** A Marvin document (MRV) as a scene. */
export function readMrv(text: string): FScene | null {
  const doc = parseXml(text);
  if (!doc) return null;
  const scene: FScene = { mols: [], arrows: [], pluses: [], texts: [], unit: 1.54 };
  for (const cs of below(doc, 'MChemicalStruct')) {
    for (const el of Array.from(cs.children)) {
      if (el.localName === 'molecule') scene.mols.push(cmlMolecule(el, true));
      else if (el.localName === 'reaction') {
        const lists: [string, FRole][] = [['reactantList', 'reactant'], ['agentList', 'agent'], ['productList', 'product']];
        for (const [list, role] of lists) for (const l of kids(el, list)) for (const m of kids(l, 'molecule')) scene.mols.push({ ...cmlMolecule(m, true), role });
        for (const a of kids(el, 'arrow')) {
          const type = a.getAttribute('type') ?? 'DEFAULT';
          scene.arrows.push({ x1: num(a.getAttribute('x1')), y1: num(a.getAttribute('y1')), x2: num(a.getAttribute('x2')), y2: num(a.getAttribute('y2')),
            kind: type === 'RETROSYNTHETIC' ? 'retro' : type === 'EQUILIBRIUM' ? 'equilibrium' : type === 'RESONANCE' ? 'resonance' : 'synthesis' });
        }
      }
    }
  }
  const pts = (el: Element) => kids(el, 'MPoint').map((p) => ({ x: num(p.getAttribute('x')), y: num(p.getAttribute('y')) }));
  for (const s of below(doc, 'MReactionSign')) {
    const p = pts(s);
    if (p.length) scene.pluses.push({ x: p.reduce((t, q) => t + q.x, 0) / p.length, y: p.reduce((t, q) => t + q.y, 0) / p.length });
  }
  for (const t of below(doc, 'MTextBox')) {
    const field = kids(t, 'Field').find((f) => f.getAttribute('name') === 'text');
    const p = pts(t);
    const s = mrvText(field?.textContent ?? '');
    if (!s || !p.length) continue;
    scene.texts.push({ x: p.reduce((u, q) => u + q.x, 0) / p.length, y: p.reduce((u, q) => u + q.y, 0) / p.length, text: s });
  }
  for (const pl of below(doc, 'MPolyline')) {
    const p = pts(pl);
    // a two-point line with a head is an arrow
    if (p.length === 2 && pl.getAttribute('headLength') !== null) scene.arrows.push({ x1: p[0].x, y1: p[0].y, x2: p[1].x, y2: p[1].y, kind: 'synthesis' });
  }
  return scene;
}

/** A CML file as a scene: its molecules and reactions. */
export function readCmlFile(text: string): FScene | null {
  const doc = parseXml(text);
  if (!doc) return null;
  const scene: FScene = { mols: [], arrows: [], pluses: [], texts: [], unit: 1.54 };
  const inReaction = new Set<Element>();
  for (const r of below(doc, 'reaction')) {
    const lists: [string, string, FRole][] = [['reactantList', 'reactant', 'reactant'], ['spectatorList', 'spectator', 'agent'], ['productList', 'product', 'product']];
    for (const [list, item, role] of lists) {
      for (const l of kids(r, list)) {
        for (const it of kids(l, item)) {
          for (const m of below(it, 'molecule')) {
            if (inReaction.has(m)) continue;
            for (const inner of below(m, 'molecule')) inReaction.add(inner);
            inReaction.add(m);
            scene.mols.push({ ...cmlMolecule(m, false), role });
          }
        }
      }
    }
  }
  for (const m of below(doc, 'molecule')) {
    if (inReaction.has(m)) continue;
    // a molecule inside another is one of its parts (read with it)
    if (m.parentElement?.localName === 'molecule') continue;
    const mol = cmlMolecule(m, false);
    // a molecule made of molecules (Chem4Word's way): its parts
    if (!mol.atoms.length) {
      for (const part of kids(m, 'molecule')) scene.mols.push(cmlMolecule(part, false));
      continue;
    }
    scene.mols.push(mol);
  }
  return scene;
}

// ---------------------------------------------------------------- JSON formats (KET, ChemDoodle)

interface KetPoint { x?: number; y?: number }

/** Plain text of a KET text node (old draft.js content, or the newer paragraphs). */
function ketText(n: Record<string, unknown>): { text: string; x: number; y: number } | null {
  const data = n.data as { content?: string; position?: KetPoint; pos?: KetPoint[] } | undefined;
  if (data?.content) {
    let text = '';
    try { text = ((JSON.parse(data.content) as { blocks?: { text?: string }[] }).blocks ?? []).map((b) => b.text ?? '').join('\n'); } catch { text = ''; }
    const p = data.pos?.length ? { x: data.pos.reduce((t, q) => t + (q.x ?? 0), 0) / data.pos.length, y: data.pos.reduce((t, q) => t + (q.y ?? 0), 0) / data.pos.length } : { x: data.position?.x ?? 0, y: data.position?.y ?? 0 };
    return text.trim() ? { text: text.trim(), ...p } : null;
  }
  const paras = n.paragraphs as { parts?: { text?: string }[] }[] | undefined;
  const box = n.boundingBox as { x?: number; y?: number; width?: number; height?: number } | undefined;
  if (paras && box) {
    const text = paras.map((p) => (p.parts ?? []).map((q) => q.text ?? '').join('')).join('\n').trim();
    // the box's corner is its top left, y upwards
    return text ? { text, x: (box.x ?? 0) + (box.width ?? 0) / 2, y: (box.y ?? 0) - (box.height ?? 0) / 2 } : null;
  }
  return null;
}

/** A Ketcher KET file as a scene. */
export function readKet(text: string): FScene | null {
  let j: Record<string, unknown>;
  try { j = JSON.parse(text); } catch { return null; }
  const root = j?.root as { nodes?: Record<string, unknown>[] } | undefined;
  if (!root || !Array.isArray(root.nodes)) return null;
  const scene: FScene = { mols: [], arrows: [], pluses: [], texts: [], unit: 1 };
  for (const n of root.nodes) {
    const ref = n.$ref as string | undefined;
    if (ref) {
      const m = j[ref] as { type?: string; atoms?: Record<string, unknown>[]; bonds?: Record<string, unknown>[]; sgroups?: Record<string, unknown>[] } | undefined;
      if (!m || m.type !== 'molecule') continue;
      const atoms: FAtom[] = (m.atoms ?? []).map((a) => {
        const loc = (a.location as number[] | undefined) ?? [0, 0, 0];
        let sym = (a.label as string | undefined) ?? 'C';
        if (a.type === 'rg-label') { const refs = (a.$refs as string[] | undefined) ?? []; sym = refs.length ? 'R' + refs[0].replace(/^rg-?/, '') : 'R'; }
        else if (a.type === 'atom-list') sym = ((a.elements as string[] | undefined) ?? ['A'])[0];
        if (typeof a.alias === 'string' && a.alias) sym = a.alias;
        const f: FAtom = { sym, x: loc[0] ?? 0, y: loc[1] ?? 0 };
        if (typeof a.charge === 'number' && a.charge) f.charge = a.charge;
        if (typeof a.isotope === 'number' && a.isotope) f.iso = a.isotope;
        if (typeof a.radical === 'number' && a.radical) f.rad = a.radical;
        if (typeof a.mapping === 'number' && a.mapping) f.map = a.mapping;
        fixHydrogenIsotopes(f);
        return f;
      });
      const bonds: FBond[] = [];
      for (const b of m.bonds ?? []) {
        const [p, q] = (b.atoms as number[] | undefined) ?? [];
        const f = bondOf(p, q, (b.type as number | undefined) ?? 1, (b.stereo as number | undefined) ?? 0, false);
        if (f && atoms[f.a] && atoms[f.b]) bonds.push(f);
      }
      const sup = (m.sgroups ?? []).filter((s) => s.type === 'SUP').map((s) => ({ atoms: (s.atoms as number[] | undefined) ?? [], label: (s.name as string | undefined) ?? '' }));
      scene.mols.push(contract({ atoms, bonds }, sup));
    } else if (n.type === 'arrow') {
      const d = n.data as { mode?: string; pos?: KetPoint[] } | undefined;
      const [p, q] = d?.pos ?? [];
      if (!p || !q) continue;
      const mode = d?.mode ?? '';
      scene.arrows.push({ x1: p.x ?? 0, y1: p.y ?? 0, x2: q.x ?? 0, y2: q.y ?? 0,
        kind: mode === 'retrosynthetic' ? 'retro' : mode.startsWith('equilibrium') || mode.startsWith('unbalanced-equilibrium') ? 'equilibrium' : mode === 'both-ends-filled-triangle' ? 'resonance' : 'synthesis' });
    } else if (n.type === 'plus') {
      const loc = (n.location as number[] | undefined) ?? [0, 0];
      scene.pluses.push({ x: loc[0] ?? 0, y: loc[1] ?? 0 });
    } else if (n.type === 'text') {
      const t = ketText(n);
      if (t) scene.texts.push(t);
    }
  }
  return scene;
}

/** A ChemDoodle JSON file as a scene. */
export function readChemDoodleJson(text: string): FScene | null {
  let j: { m?: { a?: Record<string, unknown>[]; b?: Record<string, unknown>[] }[]; s?: Record<string, unknown>[] };
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== 'object') return null;
  const scene: FScene = { mols: [], arrows: [], pluses: [], texts: [], yDown: true, unit: 20 };
  for (const m of j.m ?? []) {
    const atoms: FAtom[] = (m.a ?? []).map((a) => {
      const f: FAtom = { sym: typeof a.l === 'string' ? a.l : typeof a.l === 'number' ? SYMBOLS[a.l] || 'C' : 'C', x: Number(a.x) || 0, y: Number(a.y) || 0 };
      if (typeof a.c === 'number' && a.c) f.charge = a.c;
      if (typeof a.m === 'number' && a.m > 0) f.iso = a.m;
      if (typeof a.r === 'number' && a.r) f.rad = a.r === 1 ? 2 : a.r === 2 ? 3 : undefined;
      if (!f.rad) delete f.rad;
      fixHydrogenIsotopes(f);
      return f;
    });
    const bonds: FBond[] = [];
    for (const b of m.b ?? []) {
      const p = Number(b.b), q = Number(b.e);
      if (!atoms[p] || !atoms[q]) continue;
      const o = typeof b.o === 'number' ? b.o : 1;
      const f: FBond = { a: p, b: q, order: o === 2 ? 2 : o === 3 ? 3 : o === 1.5 ? 1.5 : o === 0.5 ? 0.5 : 1 };
      if (o === 0) f.dative = true;
      if (f.order === 1) f.stereo = b.s === 'protruding' ? 'wedge' : b.s === 'recessed' ? 'hash' : b.s === 'ambiguous' ? 'wavy' : undefined;
      if (!f.stereo) delete f.stereo;
      bonds.push(f);
    }
    scene.mols.push({ atoms, bonds });
  }
  for (const s of j.s ?? []) {
    if (s.t !== 'Line' || !s.a) continue;
    const a = String(s.a);
    scene.arrows.push({ x1: Number(s.x1) || 0, y1: Number(s.y1) || 0, x2: Number(s.x2) || 0, y2: Number(s.y2) || 0,
      kind: a === 'retrosynthetic' ? 'retro' : a === 'equilibrium' ? 'equilibrium' : a === 'resonance' ? 'resonance' : 'synthesis' });
  }
  return scene;
}

/** Any of the files above as a scene, or null when it can't be read. */
export function readScene(format: ChemFormat, text: string): FScene | null {
  switch (format) {
    case 'mol': { const m = readMolfile(text); return m ? { mols: [m], arrows: [], pluses: [], texts: [], unit: 1.5 } : null; }
    case 'sdf': { const ms = readSdfMols(text); return ms.length ? { mols: ms, arrows: [], pluses: [], texts: [], unit: 1.5 } : null; }
    case 'rxn': return readRxnFile(text);
    case 'mrv': return readMrv(text);
    case 'ket': return readKet(text);
    case 'cml': return readCmlFile(text);
    case 'cdjson': return readChemDoodleJson(text);
  }
}

// ---------------------------------------------------------------- scene → drawing

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

/** A molecule's box in its own units. */
function molBox(m: FMol): { x1: number; y1: number; x2: number; y2: number } {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const a of m.atoms) { x1 = Math.min(x1, a.x); y1 = Math.min(y1, a.y); x2 = Math.max(x2, a.x); y2 = Math.max(y2, a.y); }
  return m.atoms.length ? { x1, y1, x2, y2 } : { x1: 0, y1: 0, x2: 0, y2: 0 };
}

/**
 * A reaction with no arrow of its own (an RXN file): its starting materials in a row with + signs,
 * an arrow with the agents over it, then the products, in the file's units with y upwards.
 */
function layOutReaction(scene: FScene, unit: number): void {
  const gap = unit * 1.2;
  const moveTo = (m: FMol, left: number, midY: number) => {
    const b = molBox(m);
    const dx = left - b.x1, dy = midY - (b.y1 + b.y2) / 2;
    for (const a of m.atoms) { a.x += dx; a.y += dy; }
    return b.x2 - b.x1;
  };
  let x = 0;
  const row = (role: FRole) => {
    scene.mols.filter((m) => m.role === role).forEach((m, i) => {
      if (i) { x += gap * 0.6; scene.pluses.push({ x, y: 0 }); x += gap * 0.6; }
      x += moveTo(m, x, 0) + (m.atoms.length === 1 ? unit * 0.6 : 0);
    });
  };
  row('reactant');
  x += gap;
  const tail = x;
  let ax = tail + gap * 0.5;
  for (const m of scene.mols.filter((q) => q.role === 'agent')) {
    const b = molBox(m);
    const h = b.y2 - b.y1;
    ax += moveTo(m, ax, unit * 0.8 + h / 2) + gap * 0.5;
  }
  const head = Math.max(tail + unit * 3, ax);
  scene.arrows.push({ x1: tail, y1: 0, x2: head, y2: 0, kind: 'synthesis' });
  x = head + gap;
  row('product');
}

const DISPLAY: Record<FStereo, BondDisplay> = { wedge: 'wedge', hash: 'hashWedge', wavy: 'wavy' };

/** What sceneToDoc says about the file it drew. */
export interface SceneStats { atoms: number; bonds: number; arrows: number; texts: number }

/**
 * Draw a scene as a new drawing in `style`, scaled so its bonds are the style's length and put at
 * the page's top left (or round the origin when there's no page).
 */
export function sceneToDoc(scene: FScene, style: DocStyle, page: Doc['page'] = null): { doc: Doc; stats: SceneStats } {
  const doc = new Doc();
  doc.style = { ...style };
  doc.page = page;
  const lengths = scene.mols.flatMap((m) => m.bonds.map((b) => Math.hypot(m.atoms[b.a].x - m.atoms[b.b].x, m.atoms[b.a].y - m.atoms[b.b].y))).filter((l) => l > 1e-6);
  const unit = median(lengths) || scene.unit || 1;
  if (!scene.arrows.length && scene.mols.some((m) => m.role)) layOutReaction(scene, unit);
  const k = style.bondLength / unit, sy = scene.yDown ? k : -k;
  const P = (x: number, y: number) => ({ x: x * k, y: y * sy });
  const stats: SceneStats = { atoms: 0, bonds: 0, arrows: 0, texts: 0 };
  const firstAtom: number[] = [];
  const lw = style.lineWidth;
  doc.bulk(() => {
    for (const m of scene.mols) {
      const ids: number[] = [];
      for (const a of m.atoms) {
        const z = elementNumber(a.sym);
        const p = P(a.x, a.y);
        const radical = RADICAL_OF(a.rad);
        const label = z === undefined ? (a.sym === 'R#' ? 'R' : a.sym) : null;
        const atom = doc.addAtom(p.x, p.y, z ?? 6, {
          charge: a.charge ?? 0, label, ...(a.iso ? { isotope: a.iso } : {}), ...(radical ? { radical } : {}),
          ...(a.map ? { mapNo: a.map, atomNumber: String(a.map), showNumber: true } : {}),
        });
        ids.push(atom.id);
      }
      for (const b of m.bonds) {
        if (ids[b.a] === undefined || ids[b.b] === undefined || b.a === b.b) continue;
        doc.addBond(ids[b.a], ids[b.b], b.order, b.dative ? 'dative' : b.stereo ? DISPLAY[b.stereo] : 'solid');
        stats.bonds++;
      }
      stats.atoms += ids.length;
      firstAtom.push(ids.length ? Math.min(...ids) : -1);
    }
    const arrowIds: number[] = [];
    for (const r of scene.arrows) {
      const t = P(r.x1, r.y1), h = P(r.x2, r.y2);
      if (Math.hypot(h.x - t.x, h.y - t.y) < 1e-3) continue;
      const a: Omit<Arrow, 'id'> = { tail: t, head: h, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: lw * 10, headWidth: lw * 2.5 };
      if (r.kind === 'retro') Object.assign(a, { headType: 'angle', shaftSpacing: lw * 6, headLength: lw * 6, headWidth: lw * 1.5 });
      else if (r.kind === 'equilibrium') { a.equilibrium = true; a.headStyle = 'halfLeft'; a.tailStyle = 'halfLeft'; }
      else if (r.kind === 'resonance') a.tailStyle = 'full';
      arrowIds.push(doc.addArrow(a).id);
      stats.arrows++;
    }
    const size = style.captionSize || 10;
    const caption = (cx: number, cy: number, text: string) => {
      const lines = text.split('\n');
      const w = Math.max(...lines.map((l) => arialWidth(l, size)));
      const top = cy - (lines.length * size * 1.15) / 2;
      return doc.addCaption({ x: cx - w / 2, y: top + size * 0.85, runs: [{ text }], justify: 'left' });
    };
    const plusIds: number[] = [];
    for (const p of scene.pluses) { const q = P(p.x, p.y); plusIds.push(caption(q.x, q.y, '+').id); }
    const textAt: { id: number; x: number; y: number }[] = [];
    for (const t of scene.texts) { const q = P(t.x, t.y); textAt.push({ id: caption(q.x, q.y, t.text).id, ...q }); stats.texts++; }
    // one reaction arrow and molecules whose roles the file says: the step is stored with the arrow
    if (arrowIds.length === 1 && scene.mols.some((m) => m.role)) {
      const refs = (role: FRole) => scene.mols.map((m, i) => (m.role === role && firstAtom[i] >= 0 ? 'a' + firstAtom[i] : '')).filter(Boolean);
      const step: StepRoles = { reactants: refs('reactant'), products: refs('product'), above: refs('agent'), below: [], ...(plusIds.length ? { plusses: plusIds.map((id) => 'c' + id) } : {}) };
      // text over or under a left-to-right arrow (the conditions) belongs to the step too
      const r = doc.arrows.get(arrowIds[0])!;
      if (Math.abs(r.head.y - r.tail.y) < Math.abs(r.head.x - r.tail.x) / 4) {
        const ay = (r.head.y + r.tail.y) / 2, lo = Math.min(r.tail.x, r.head.x), hi = Math.max(r.tail.x, r.head.x);
        for (const t of textAt) {
          if (t.x < lo || t.x > hi || Math.abs(t.y - ay) > style.bondLength * 4) continue;
          (t.y < ay ? step.above : step.below).push('c' + t.id);
        }
      }
      if (step.reactants.length && step.products.length) doc.updateArrow(arrowIds[0], { step });
    }
    // to the page's top left, a little in
    const b = doc.bounds();
    if (b) {
      const margin = page ? Math.min(36, page.w / 10) : 0;
      shiftDrawing(doc, (page ? margin : -(b.x1 + b.x2) / 2) - (page ? b.x1 : 0), (page ? margin : -(b.y1 + b.y2) / 2) - (page ? b.y1 : 0));
    }
  });
  if (page) keepOnPage(doc);
  return { doc, stats };
}

// ---------------------------------------------------------------- drawing → scene

/** The drawing's structures, straight arrows, + signs and text, in bond-length units with y upwards. */
export function docToScene(doc: Doc): { scene: FScene; unknown: string[]; step: boolean } {
  const scene: FScene = { mols: [], arrows: [], pluses: [], texts: [], unit: 1 };
  const unknown = new Set<string>();
  const m = plainMeasure(doc);
  const items = schemeItems(doc, m);
  const steps = reactionSteps(doc, items);
  const find = itemFinder(items);
  // a structure's role in the first step it is in
  const roleOf = new Map<string, FRole>();
  const used = new Set<number>();
  const L = doc.style.bondLength || 14.4;
  const textMol = (capId: number, role?: FRole) => {
    const cap = doc.captions.get(capId);
    if (!cap) return null;
    const species = placeSpecies(doc, [cap], m);
    if (!species.length) return null;
    const ex = toMolfile(doc, [], plainText(cap.runs).trim(), { species });
    const mol = readMolfile(ex.molblock);
    return mol ? { ...mol, ...(role ? { role } : {}) } : null;
  };
  const step = steps[0];
  if (step) {
    const put = (refs: string[], role: FRole) => {
      for (const r of refs) {
        const it = find(r);
        if (!it || it.plus) continue;
        if (it.atoms.length) roleOf.set(it.ref, role);
        else if (it.caption !== undefined) {
          const mol = textMol(it.caption, role);
          if (mol) { scene.mols.push(mol); used.add(it.caption); }
        }
      }
    };
    put(step.roles.reactants, 'reactant');
    put([...step.roles.above, ...step.roles.below], 'agent');
    put(step.roles.products, 'product');
  }
  for (const it of items) {
    if (!it.atoms.length) continue;
    const ex = toMolfile(doc, it.atoms);
    for (const u of ex.unknownLabels) unknown.add(u);
    const mol = readMolfile(ex.molblock);
    if (!mol || !mol.atoms.length) continue;
    const role = roleOf.get(it.ref);
    scene.mols.push(role ? { ...mol, role } : mol);
  }
  for (const r of doc.arrows.values()) {
    if (r.sweep || r.bez?.length || r.from || r.to) continue;
    scene.arrows.push({ x1: r.tail.x / L, y1: -r.tail.y / L, x2: r.head.x / L, y2: -r.head.y / L,
      kind: r.shaftSpacing ? 'retro' : r.equilibrium ? 'equilibrium' : r.tailStyle === 'full' ? 'resonance' : 'synthesis' });
  }
  for (const it of items) {
    if (it.caption === undefined || used.has(it.caption)) continue;
    const c = doc.captions.get(it.caption)!;
    const cx = (it.box.x1 + it.box.x2) / 2 / L, cy = -(it.box.y1 + it.box.y2) / 2 / L;
    if (it.plus) scene.pluses.push({ x: cx, y: cy });
    else scene.texts.push({ x: cx, y: cy, text: plainText(c.runs).trim() });
  }
  return { scene, unknown: [...unknown], step: !!step };
}

// ---------------------------------------------------------------- writers

const fx = (v: number, d = 4) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(d);

/** Molecules as molfile atoms and bonds (atoms counted from 0 across them all). */
function ctabOf(mols: FMol[]): [MAtom[], MBond[]] {
  const atoms: MAtom[] = [];
  const bonds: MBond[] = [];
  for (const m of mols) {
    const o = atoms.length;
    for (const a of m.atoms) {
      const z = elementNumber(a.sym);
      const sym = z === undefined ? (/^R\d*$/.test(a.sym) ? 'R#' : a.sym === '*' ? '*' : 'R') : a.sym;
      atoms.push({ sym, x: a.x, y: a.y, charge: a.charge ?? 0, iso: a.iso ?? 0, rad: a.rad ?? 0, map: a.map ?? 0, ...(z === undefined && sym === 'R' ? { alias: a.sym } : {}) });
    }
    for (const b of m.bonds) {
      bonds.push({ a: b.a + o, b: b.b + o, order: b.dative ? 9 : b.order === 1.5 ? 4 : b.order === 0.5 ? 1 : b.order,
        stereo: b.stereo === 'wedge' ? 1 : b.stereo === 'hash' ? 6 : b.stereo === 'wavy' ? 4 : 0 });
    }
  }
  return [atoms, bonds];
}

/** Molecules → one molfile: V2000, or V3000 when asked or when there are more than 999 atoms or bonds. */
function molblockOf(mols: FMol[], name = '', v3000 = false): string {
  const [atoms, bonds] = ctabOf(mols);
  const head = [name.slice(0, 80), '  Chem Illustrator', ''];
  if (v3000 || atoms.length > 999 || bonds.length > 999) return v3000Molfile(head, atoms, bonds);
  const i3 = (n: number) => String(n).padStart(3);
  const f10 = (v: number) => fx(v).padStart(10);
  const lines = [...head, `${i3(atoms.length)}${i3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`];
  const aliases: string[] = [];
  atoms.forEach((a, i) => {
    if (a.alias) aliases.push(`A  ${i3(i + 1)}`, a.alias);
    lines.push(`${f10(a.x)}${f10(a.y)}${f10(0)} ${a.sym.padEnd(3)} 0  0  0  0  0  0  0  0  0${i3(a.map ?? 0)}  0  0`);
  });
  for (const b of bonds) lines.push(`${i3(b.a + 1)}${i3(b.b + 1)}${i3(b.order)}${i3(b.stereo)}`);
  lines.push(...aliases);
  const prop = (tag: string, vals: [number, number][]) => {
    for (let k = 0; k < vals.length; k += 8) {
      const part = vals.slice(k, k + 8);
      lines.push(`M  ${tag}${i3(part.length)}` + part.map(([i, v]) => ` ${i3(i + 1)} ${i3(v)}`).join(''));
    }
  };
  prop('CHG', atoms.map((a, i) => [i, a.charge] as [number, number]).filter(([, v]) => v));
  prop('ISO', atoms.map((a, i) => [i, a.iso] as [number, number]).filter(([, v]) => v));
  prop('RAD', atoms.map((a, i) => [i, a.rad ?? 0] as [number, number]).filter(([, v]) => v));
  lines.push('M  END');
  return lines.join('\n') + '\n';
}

/** How molfiles, SD and RXN files are written: V2000 (the most widely read) unless asked for V3000 or too big for it. */
export interface CtabOptions { v3000?: boolean }

/** A drawing as a molfile: all its structures (and text read as chemistry) in one. */
export function writeMolFile(doc: Doc, name = '', o: CtabOptions = {}): { text: string; unknown: string[] } {
  const ids = [...doc.atoms.keys()];
  const species = placeSpecies(doc, doc.captions.values(), plainMeasure(doc));
  // V2000 can't count past 999 atoms or bonds
  const v3000 = o.v3000 || ids.length > 999 || doc.bonds.size > 999;
  const ex = toMolfile(doc, ids, name, { species, v3000 });
  return { text: ex.molblock, unknown: ex.unknownLabels };
}

/** A drawing as an SD file: each structure a record of its own. */
export function writeSdfFile(doc: Doc, o: CtabOptions = {}): { text: string; unknown: string[] } {
  const { scene, unknown } = docToScene(doc);
  return { text: scene.mols.map((m, i) => molblockOf([m], m.name ?? `Structure ${i + 1}`, o.v3000) + '$$$$\n').join(''), unknown };
}

/** A drawing's first reaction step as an RXN file; throws when there is none. */
export function writeRxnFile(doc: Doc, name = '', o: CtabOptions = {}): { text: string; unknown: string[] } {
  const { scene, unknown, step } = docToScene(doc);
  if (!step) throw new Error('There is no reaction to save as RXN: draw the starting materials, an arrow and the products.');
  const of = (role: FRole) => scene.mols.filter((m) => m.role === role);
  const r = of('reactant'), p = of('product'), a = of('agent');
  const i3 = (n: number) => String(n).padStart(3);
  if (o.v3000 || [...r, ...p, ...a].some((m) => m.atoms.length > 999 || m.bonds.length > 999)) {
    // $RXN V3000: the molecules' connection tables inside REACTANT, PRODUCT and AGENT blocks
    const block = (tag: string, ms: FMol[]) => ms.length ? [`M  V30 BEGIN ${tag}`, ...ms.flatMap((m) => v3000Ctab(...ctabOf([m]))), `M  V30 END ${tag}`] : [];
    const text = [`$RXN V3000`, name, '  Chem Illustrator', '', `M  V30 COUNTS ${r.length} ${p.length}${a.length ? ` ${a.length}` : ''}`,
      ...block('REACTANT', r), ...block('PRODUCT', p), ...block('AGENT', a), 'M  END', ''].join('\n');
    return { text, unknown };
  }
  const text = `$RXN\n${name}\n  Chem Illustrator\n\n${i3(r.length)}${i3(p.length)}${a.length ? i3(a.length) : ''}\n` + [...r, ...p, ...a].map((m) => '$MOL\n' + molblockOf([m], m.name ?? '')).join('');
  return { text, unknown };
}

/** Scales a bond-length-1 scene to a format's bond length (and flips y for y-down formats). */
function scaled(scene: FScene, bond: number, yDown = false): FScene {
  const s = (y: number) => (yDown ? -y : y) * bond;
  return {
    ...scene,
    mols: scene.mols.map((m) => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, x: a.x * bond, y: s(a.y) })) })),
    arrows: scene.arrows.map((r) => ({ ...r, x1: r.x1 * bond, y1: s(r.y1), x2: r.x2 * bond, y2: s(r.y2) })),
    pluses: scene.pluses.map((p) => ({ x: p.x * bond, y: s(p.y) })),
    texts: scene.texts.map((t) => ({ ...t, x: t.x * bond, y: s(t.y) })),
  };
}

const att = (v: string | number) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** CML-style molecule XML (MRV and CML both use it), atoms numbered from `first`. */
function cmlMoleculeXml(m: FMol, id: string, first: number, indent: string, mrv: boolean): string {
  const aid = (i: number) => `a${first + i}`;
  const lines = [`${indent}<molecule ${mrv ? 'molID' : 'id'}="${id}"${m.name && !mrv ? ` title="${att(m.name)}"` : ''}>`, `${indent}  <atomArray>`];
  m.atoms.forEach((a, i) => {
    const z = elementNumber(a.sym);
    const r = /^R(\d+)$/.exec(a.sym);
    const el = z !== undefined ? a.sym : r || a.sym === 'R' ? 'R' : mrv ? 'R' : 'Du';
    const extra = [
      a.charge ? ` formalCharge="${a.charge}"` : '',
      a.iso ? ` isotope${mrv ? '' : 'Number'}="${a.iso}"` : '',
      a.rad ? ` ${mrv ? 'radical' : 'spinMultiplicity'}="${mrv ? (a.rad === 2 ? 'monovalent' : a.rad === 1 ? 'divalent1' : 'divalent3') : a.rad === 2 ? 2 : a.rad === 1 ? 1 : 3}"` : '',
      r ? ` rgroupRef="${r[1]}"` : '',
      a.map && mrv ? ` mrvMap="${a.map}"` : '',
      z === undefined && !r && a.sym !== 'R' && mrv ? ` mrvAlias="${att(a.sym)}"` : '',
    ].join('');
    lines.push(`${indent}    <atom id="${aid(i)}" elementType="${el}"${extra} x2="${fx(a.x)}" y2="${fx(a.y)}"/>`);
  });
  lines.push(`${indent}  </atomArray>`);
  if (m.bonds.length) {
    lines.push(`${indent}  <bondArray>`);
    m.bonds.forEach((b, i) => {
      const order = b.order === 1.5 ? 'A' : b.order === 2 ? '2' : b.order === 3 ? '3' : '1';
      const conv = b.dative && mrv ? ' convention="cxn:coord"' : '';
      const st = b.stereo === 'wedge' ? 'W' : b.stereo === 'hash' ? 'H' : '';
      const open = `${indent}    <bond id="b${first + i}" atomRefs2="${aid(b.a)} ${aid(b.b)}"${conv ? conv : ` order="${order}"`}`;
      lines.push(st ? `${open}><bondStereo>${st}</bondStereo></bond>` : `${open}/>`);
    });
    lines.push(`${indent}  </bondArray>`);
  }
  lines.push(`${indent}</molecule>`);
  return lines.join('\n');
}

/** A drawing as a Marvin document (MRV). */
export function writeMrvFile(doc: Doc): { text: string; unknown: string[] } {
  const got = docToScene(doc);
  const scene = scaled(got.scene, 1.54);
  let next = 1, mid = 1;
  const molXml = (m: FMol, ind: string) => { const s = cmlMoleculeXml(m, `m${mid++}`, next, ind, true); next += Math.max(m.atoms.length, m.bonds.length); return s; };
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<cml xmlns="http://www.chemaxon.com" version="ChemAxon file format v20.20.0, generated by Chem Illustrator">', '<MDocument>'];
  const inStep = scene.mols.filter((m) => m.role);
  const rest = scene.mols.filter((m) => !m.role);
  const stepArrow = got.step ? scene.arrows[0] : undefined;
  if (inStep.length && stepArrow) {
    out.push('  <MChemicalStruct>', '    <reaction>');
    for (const [list, role] of [['reactantList', 'reactant'], ['agentList', 'agent'], ['productList', 'product']] as const) {
      const ms = inStep.filter((m) => m.role === role);
      if (!ms.length) { out.push(`      <${list}/>`); continue; }
      out.push(`      <${list}>`, ...ms.map((m) => molXml(m, '        ')), `      </${list}>`);
    }
    out.push(`      <arrow type="${stepArrow.kind === 'retro' ? 'RETROSYNTHETIC' : stepArrow.kind === 'equilibrium' ? 'EQUILIBRIUM' : stepArrow.kind === 'resonance' ? 'RESONANCE' : 'DEFAULT'}" x1="${fx(stepArrow.x1)}" y1="${fx(stepArrow.y1)}" x2="${fx(stepArrow.x2)}" y2="${fx(stepArrow.y2)}"/>`);
    out.push('    </reaction>', '  </MChemicalStruct>');
  } else rest.unshift(...inStep);
  for (const m of rest) out.push('  <MChemicalStruct>', molXml(m, '    '), '  </MChemicalStruct>');
  let oid = 1;
  for (const r of scene.arrows) {
    if (r === stepArrow) continue;
    out.push(`  <MPolyline id="o${oid++}" headLength="0.8" headWidth="0.5"><MPoint x="${fx(r.x1)}" y="${fx(r.y1)}"/><MPoint x="${fx(r.x2)}" y="${fx(r.y2)}"/></MPolyline>`);
  }
  for (const p of scene.pluses) out.push(`  <MReactionSign id="o${oid++}" toptions="NOROT" fontScale="14.0" halign="CENTER" valign="CENTER" autoSize="true"><Field name="text">+</Field><MPoint x="${fx(p.x - 0.3)}" y="${fx(p.y + 0.3)}"/><MPoint x="${fx(p.x + 0.3)}" y="${fx(p.y + 0.3)}"/><MPoint x="${fx(p.x + 0.3)}" y="${fx(p.y - 0.3)}"/><MPoint x="${fx(p.x - 0.3)}" y="${fx(p.y - 0.3)}"/></MReactionSign>`);
  for (const t of scene.texts) {
    const lines = t.text.split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * 0.3 + 0.2, h = lines.length * 0.5 + 0.1;
    out.push(`  <MTextBox id="o${oid++}" fontScale="10.0" halign="CENTER" valign="TOP" autoSize="true"><Field name="text"><![CDATA[${t.text.replace(/]]>/g, ']] >')}]]></Field><MPoint x="${fx(t.x - w / 2)}" y="${fx(t.y + h / 2)}"/><MPoint x="${fx(t.x + w / 2)}" y="${fx(t.y + h / 2)}"/><MPoint x="${fx(t.x + w / 2)}" y="${fx(t.y - h / 2)}"/><MPoint x="${fx(t.x - w / 2)}" y="${fx(t.y - h / 2)}"/></MTextBox>`);
  }
  out.push('</MDocument>', '</cml>');
  return { text: out.join('\n') + '\n', unknown: got.unknown };
}

/** A drawing as a CML file. */
export function writeCmlFile(doc: Doc): { text: string; unknown: string[] } {
  const got = docToScene(doc);
  const scene = scaled(got.scene, 1.54);
  let next = 1, mid = 1;
  const molXml = (m: FMol, ind: string) => { const s = cmlMoleculeXml(m, `m${mid++}`, next, ind, false); next += Math.max(m.atoms.length, m.bonds.length); return s; };
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<cml xmlns="http://www.xml-cml.org/schema">'];
  const inStep = scene.mols.filter((m) => m.role);
  if (got.step && inStep.length) {
    out.push('  <reaction id="r1">');
    for (const [list, item, role] of [['reactantList', 'reactant', 'reactant'], ['spectatorList', 'spectator', 'agent'], ['productList', 'product', 'product']] as const) {
      const ms = inStep.filter((m) => m.role === role);
      if (!ms.length) continue;
      out.push(`    <${list}>`, ...ms.map((m) => `      <${item}>\n${molXml(m, '        ')}\n      </${item}>`), `    </${list}>`);
    }
    out.push('  </reaction>');
  }
  for (const m of scene.mols.filter((q) => !q.role || !got.step)) out.push(molXml(m, '  '));
  out.push('</cml>');
  return { text: out.join('\n') + '\n', unknown: got.unknown };
}

/** A drawing as a Ketcher KET file. */
export function writeKetFile(doc: Doc): { text: string; unknown: string[] } {
  const got = docToScene(doc);
  const scene = got.scene;
  const out: Record<string, unknown> = {};
  const nodes: Record<string, unknown>[] = [];
  scene.mols.forEach((m, i) => {
    const key = `mol${i}`;
    nodes.push({ $ref: key });
    out[key] = {
      type: 'molecule',
      atoms: m.atoms.map((a) => {
        const z = elementNumber(a.sym);
        const r = /^R(\d+)$/.exec(a.sym);
        if (r) return { type: 'rg-label', location: [+fx(a.x), +fx(a.y), 0], $refs: [`rg-${r[1]}`] };
        return {
          label: z !== undefined ? a.sym : 'C', location: [+fx(a.x), +fx(a.y), 0],
          ...(z === undefined ? { alias: a.sym } : {}),
          ...(a.charge ? { charge: a.charge } : {}), ...(a.iso ? { isotope: a.iso } : {}), ...(a.rad ? { radical: a.rad } : {}), ...(a.map ? { mapping: a.map } : {}),
        };
      }),
      bonds: m.bonds.map((b) => ({ type: b.dative ? 9 : b.order === 1.5 ? 4 : b.order === 0.5 ? 1 : b.order, atoms: [b.a, b.b], ...(b.stereo ? { stereo: b.stereo === 'wedge' ? 1 : b.stereo === 'hash' ? 6 : 4 } : {}) })),
    };
  });
  for (const r of scene.arrows) {
    const mode = r.kind === 'retro' ? 'retrosynthetic' : r.kind === 'equilibrium' ? 'equilibrium-filled-half-bow' : r.kind === 'resonance' ? 'both-ends-filled-triangle' : 'open-angle';
    nodes.push({ type: 'arrow', data: { mode, pos: [{ x: +fx(r.x1), y: +fx(r.y1), z: 0 }, { x: +fx(r.x2), y: +fx(r.y2), z: 0 }] } });
  }
  for (const p of scene.pluses) nodes.push({ type: 'plus', location: [+fx(p.x), +fx(p.y), 0] });
  for (const t of scene.texts) {
    const content = JSON.stringify({ blocks: t.text.split('\n').map((line, i) => ({ key: `b${i}`, text: line, type: 'unstyled', depth: 0, inlineStyleRanges: [], entityRanges: [], data: {} })), entityMap: {} });
    const lines = t.text.split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * 0.25, h = lines.length * 0.4;
    const x1 = +fx(t.x - w / 2), y1 = +fx(t.y + h / 2), x2 = +fx(t.x + w / 2), y2 = +fx(t.y - h / 2);
    nodes.push({ type: 'text', data: { content, position: { x: x1, y: y1, z: 0 }, pos: [{ x: x1, y: y1, z: 0 }, { x: x1, y: y2, z: 0 }, { x: x2, y: y2, z: 0 }, { x: x2, y: y1, z: 0 }] } });
  }
  return { text: JSON.stringify({ root: { nodes }, ...out }, null, 2) + '\n', unknown: got.unknown };
}

/** A drawing as ChemDoodle JSON. Text isn't part of the format, so it is left out. */
export function writeChemDoodleJson(doc: Doc): { text: string; unknown: string[]; leftOut: number } {
  const got = docToScene(doc);
  const scene = scaled(got.scene, 20, true);
  const j = {
    m: scene.mols.map((m) => ({
      a: m.atoms.map((a) => ({ x: +fx(a.x, 3), y: +fx(a.y, 3), ...(a.sym !== 'C' ? { l: a.sym } : {}), ...(a.charge ? { c: a.charge } : {}), ...(a.iso ? { m: a.iso } : {}), ...(a.rad === 2 ? { r: 1 } : a.rad ? { r: 2 } : {}) })),
      b: m.bonds.map((b) => ({ b: b.a, e: b.b, ...(b.dative ? { o: 0 } : b.order !== 1 ? { o: b.order } : {}), ...(b.stereo ? { s: b.stereo === 'wedge' ? 'protruding' : b.stereo === 'hash' ? 'recessed' : 'ambiguous' } : {}) })),
    })),
    ...(scene.arrows.length ? { s: scene.arrows.map((r) => ({ t: 'Line', x1: +fx(r.x1, 3), y1: +fx(r.y1, 3), x2: +fx(r.x2, 3), y2: +fx(r.y2, 3), a: r.kind === 'retro' ? 'retrosynthetic' : r.kind === 'equilibrium' ? 'equilibrium' : r.kind === 'resonance' ? 'resonance' : 'synthetic' })) } : {}),
  };
  return { text: JSON.stringify(j) + '\n', unknown: got.unknown, leftOut: scene.texts.length + scene.pluses.length };
}
