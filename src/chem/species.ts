// Text boxes read as chemistry. A text box whose whole text is a formula (CH2Cl2, Cs2CO3,
// NaBF4), an ion (BF4−, Na+, NBu4+) or a reagent, solvent or ligand abbreviation (DMAP, THF,
// PPh3) is that species: it counts in the formula, mass and SMILES of what is selected with it,
// and can be expanded into a structure. Ordinary text ("Step 2", "rt, 12 h", "1a") is left as
// text; text above and below reaction arrows (the conditions) stays text too. Each text box can
// be set to Chemical or Plain text by hand (Caption.chem), which wins over the reading here.

import type { Caption, Doc } from '../model';
import { plainText } from '../richtext';
import { elementNumber, hasImplicitH, implicitHydrogens } from './elements';
import { graphSmiles } from './group-smiles';
import { groupFormula } from './label-tip';
import { NICKNAMES, kekulize, labelGraph, labelOverValent, parseSmiles, tokenize, type MiniGraph } from './labels';
import { SPECIES_BY_NAME, type SpeciesEntry, type SpeciesKind } from './species-list';
import { arrowTexts } from './arrow-text';
import { isReactionArrow, plainMeasure, schemeItems, type Item } from './reaction';
import type { Measure } from '../editor/arrange';

export interface Species {
  /** The text read, without its charge ("BF4", "Cs2CO3", "DMAP"). */
  body: string;
  /** The charge written after it (0 when none is). */
  written: number;
  /** The charge it is counted with: the written one, or a counterion's own when none is written. */
  charge: number;
  /** Its atoms and bonds as counted (several molecules for a salt). */
  graph: MiniGraph;
  /** What it is, for the panel and tooltips ("tetrafluoroborate"). */
  name?: string;
  kind: SpeciesKind | 'formula' | 'ion';
  /** An ion written without its charge (or with the wrong one): the charge it should carry. */
  expected?: number;
}

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

/** "+", "2−", "3+", "−2", "--": a charge written out, as a number (NaN when it isn't one). */
function chargeOf(text: string): number {
  const m = /^(\d*)([+-]+)(\d*)$/.exec(text);
  if (!m || (m[1] && m[3]) || (m[2].length > 1 && (m[1] || m[3])) || new Set(m[2]).size > 1) return NaN;
  const n = Number(m[1] || m[3] || m[2].length);
  return m[2][0] === '+' ? n : -n;
}

/** The text split into what is written and the charge after it. */
export function splitCharge(raw: string): { body: string; charge: number } | null {
  let t = raw.trim().replace(/[−–]/g, '-').replace(/[₀-₉]/g, (c) => SUB[c]);
  // superscript digits and signs at the end are the charge (SO₄²⁻)
  const sup = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+$/.exec(t);
  if (sup) {
    const q = chargeOf([...sup[0]].map((c) => SUP[c]).join(''));
    if (Number.isNaN(q)) return null;
    t = t.slice(0, sup.index).trim();
    return { body: unbracket(t), charge: q };
  }
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (c) => SUP[c]);
  // [BF4]−, [PPh4]+
  let m = /^\[([^\[\]]+)\]\s*(\d*[+-]+\d*)$/.exec(t);
  if (m) { const q = chargeOf(m[2]); return Number.isNaN(q) ? null : { body: m[1], charge: q }; }
  // SO4 2−, BF4 ^−, PF6(−)
  m = /^(.*?\S)(?:\s+\^?|\^|\()(\d*[+-]+\d*)\)?$/.exec(t);
  if (m && (!m[0].includes('(') || m[0].endsWith(')'))) { const q = chargeOf(m[2]); if (!Number.isNaN(q)) return { body: unbracket(m[1]), charge: q }; }
  // Fe3+, Cu2+: one element with its charge
  m = /^([A-Z][a-z]?)(\d+)([+-])$/.exec(t);
  if (m && elementNumber(m[1]) !== undefined && !SPECIES_BY_NAME.has(m[1] + m[2])) return { body: m[1], charge: (m[3] === '+' ? 1 : -1) * Number(m[2]) };
  // BF4−, NBu4+, N+ (a sign only; digits before it count atoms)
  m = /^(.*?)([+-]+)$/.exec(t);
  if (m && m[1]) { const q = chargeOf(m[2]); return Number.isNaN(q) ? null : { body: unbracket(m[1]), charge: q }; }
  return { body: unbracket(t), charge: 0 };
}

const unbracket = (s: string) => (/^\[[^\[\]]+\]$/.test(s) ? s.slice(1, -1) : s);

const netCharge = (g: MiniGraph) => g.atoms.reduce((s, a) => s + a.charge, 0);

/** Entries for an ion or a reagent, with their graphs parsed once. */
const graphs = new Map<string, MiniGraph>();
function entryGraph(e: SpeciesEntry): MiniGraph {
  let g = graphs.get(e.smiles);
  if (!g) { g = parseSmiles(e.smiles); graphs.set(e.smiles, g); }
  return g;
}

/** Graphs side by side as one (the molecules of a salt). */
function joined(parts: MiniGraph[]): MiniGraph {
  const out: MiniGraph = { atoms: [], bonds: [] };
  for (const p of parts) {
    const off = out.atoms.length;
    out.atoms.push(...p.atoms.map((a) => ({ ...a })));
    out.bonds.push(...p.bonds.map((b) => ({ ...b, a: b.a + off, b: b.b + off })));
  }
  return out;
}

/** The one curated entry this text names, with that charge written. */
function lookUp(body: string, written: number): SpeciesEntry | null {
  const list = SPECIES_BY_NAME.get(body);
  if (!list) return null;
  // with a charge written, the reading that has it (TFA− is trifluoroacetate, TFA the acid)
  if (written) return list.find((e) => netCharge(entryGraph(e)) === written) ?? list.find((e) => netCharge(entryGraph(e)) !== 0) ?? null;
  return list.find((e) => !e.needsSign) ?? null;
}

/** A curated entry read as a species. */
function fromEntry(e: SpeciesEntry, body: string, written: number): Species {
  const g = entryGraph(e);
  const natural = netCharge(g);
  const sp: Species = { body, written, charge: natural, graph: g, name: e.name, kind: e.kind };
  if (natural && written !== natural) sp.expected = natural;
  return sp;
}

/** Metals whose cation always has one charge, for salts written as one formula (NaBF4, Cs2CO3, Mg(OTf)2). */
const FIXED_CATIONS: Record<string, number> = { Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, Ag: 1, Tl: 1, Be: 2, Mg: 2, Ca: 2, Sr: 2, Ba: 2, Zn: 2 };
const HALIDES = new Set(['F', 'Cl', 'Br', 'I']);
const CATION_ENTRIES = ['NH4', 'NBu4', 'Bu4N', 'NEt4', 'Et4N', 'NMe4', 'Me4N', 'PPh4', 'Ph4P', 'HNEt3', 'Et3NH', 'pyH', 'PyH', 'BMIM', 'EMIM', 'PPN'];

/** A salt written as one formula: a cation (with a count) and an anion from the list (NaBF4, K2CO3, Ca(OTf)2, NBu4PF6). */
function readSalt(body: string): Species | null {
  const cations = [...Object.keys(FIXED_CATIONS), ...CATION_ENTRIES].sort((a, b) => b.length - a.length);
  for (const c of cations) {
    if (!body.startsWith(c)) continue;
    let rest = body.slice(c.length);
    let n = 1;
    const cm = /^(\d+)/.exec(rest);
    if (cm) { n = Number(cm[1]); rest = rest.slice(cm[1].length); }
    let m = 1;
    const bm = /^\(([^()]+)\)(\d+)$/.exec(rest);
    if (bm) { rest = bm[1]; m = Number(bm[2]); }
    if (!rest) continue;
    const halide = HALIDES.has(rest) ? { names: [rest], smiles: `[${rest}-]`, name: `${rest === 'F' ? 'fluor' : rest === 'Cl' ? 'chlor' : rest === 'Br' ? 'brom' : 'iod'}ide`, kind: 'anion' as const } : null;
    const anion = halide ?? lookUp(rest, 0) ?? lookUp(rest, -1);
    const cat = FIXED_CATIONS[c] ? null : lookUp(c, 1);
    if (!anion || anion.kind !== 'anion' || (!FIXED_CATIONS[c] && !cat)) continue;
    const ga = entryGraph(anion);
    const qa = netCharge(ga);
    const gc: MiniGraph = cat ? entryGraph(cat) : { atoms: [{ z: elementNumber(c)!, charge: FIXED_CATIONS[c], aromatic: false, dummy: false, hCount: 0 }], bonds: [] };
    const qc = netCharge(gc);
    if (n * qc + m * qa !== 0) continue;
    const parts = [...Array(n).fill(gc), ...Array(m).fill(ga)];
    return { body, written: 0, charge: 0, graph: joined(parts), name: cat ? `${cat.name} ${anion.name}` : `${elementName(c)} ${anion.name}`, kind: 'reagent' };
  }
  return null;
}

const ELEMENT_NAMES: Record<string, string> = { Li: 'lithium', Na: 'sodium', K: 'potassium', Rb: 'rubidium', Cs: 'caesium', Ag: 'silver', Tl: 'thallium', Be: 'beryllium', Mg: 'magnesium', Ca: 'calcium', Sr: 'strontium', Ba: 'barium', Zn: 'zinc' };
const elementName = (s: string) => ELEMENT_NAMES[s] ?? s;

// Words written like formulas that are not ones: mechanisms, transition states, assay and cell names.
const NOT_FORMULAS = /^(?:S[NE][12]'?|E[12]|TS\d*|IC\d+|EC\d+|LD\d+|ED\d+|CC\d+|PS[12]|OD\d+|SI\d*|NMR|HPLC|HRMS|ESI|MS|IR|UV|CD|NOE|COSY|HSQC|HMBC|NOESY|DFT|TLC|GC|LC|LCMS|EE|ER|DR|RT)$/i;

/** An atom with its hydrogens written that still has a bond free (the N of NHBoc on its own). */
function openValence(g: MiniGraph): boolean {
  const bonds = kekulize(g);
  return g.atoms.some((a, i) => {
    if (a.dummy || a.hCount === undefined || !hasImplicitH(a.z)) return false;
    const used = bonds.reduce((s, b) => s + (b.a === i || b.b === i ? b.order : 0), 0);
    return implicitHydrogens(a.z, used, a.charge) > a.hCount;
  });
}

/** How many H a Hill formula has. */
const hydrogens = (f: string) => { const m = /H(?![a-z])(\d*)/.exec(f); return m ? Number(m[1] || 1) : 0; };

/** H in a written formula, counting each abbreviation's own (so MeOH has 4, OMe 3). */
function writtenH(body: string): number | null {
  const toks = tokenize(body);
  const stack: number[] = [0];
  for (const t of toks) {
    if (t.kind === 'other' && t.text === '(') { stack.push(0); continue; }
    if (t.kind === 'other' && t.text === ')') {
      if (stack.length < 2) return null;
      const inner = stack.pop()!;
      stack[stack.length - 1] += inner * (t.explicit ? t.count : 1);
      continue;
    }
    if (t.kind === 'other' || t.kind === 'generic') return null;
    let h = 0;
    if (t.kind === 'el') h = t.text === 'H' ? 1 : 0;
    else {
      h = hydrogens(groupFormula(parseSmiles(NICKNAMES[t.text]), 1));
    }
    stack[stack.length - 1] += h * Math.max(1, t.count);
  }
  return stack.length === 1 ? stack[0] : null;
}

/**
 * A condensed formula read on its own (CH2Cl2, MeOH, Pd(OAc)2, NaH, HNEt3+): every part an
 * element or an abbreviation, nothing left open (OMe and NHBoc are groups, not molecules), at
 * least two parts or a count, and no atom with too many bonds.
 */
function readFormula(body: string, written: number): Species | null {
  if (NOT_FORMULAS.test(body) || !/^[A-Z(\[]/.test(body)) return null;
  const toks = tokenize(body);
  const parts = toks.filter((t) => t.kind !== 'other');
  if (!parts.length || toks.some((t) => t.kind === 'generic' || (t.kind === 'other' && !/^[()]$/.test(t.text)))) return null;
  // D and T read as isotopes would make words of formulas (PhD, TS): only the listed solvents have them
  if (parts.some((t) => t.kind === 'el' && (t.text === 'D' || t.text === 'T'))) return null;
  // one abbreviation or one element on its own is a group or an atom label, not a molecule
  if (parts.length === 1 && parts[0].count <= 1) return null;
  // a group's own abbreviation (CO2H, CF3, NO2) is part of a molecule, not one
  if (NICKNAMES[body]) return null;
  if (Math.abs(written) > 1) return null;
  const label = body + (written > 0 ? '+' : written < 0 ? '-' : '');
  const g = labelGraph(label, 0);
  if (!g || g.atoms.some((a) => a.dummy) || labelOverValent(label, 0).length || openValence(g)) return null;
  const h = writtenH(body);
  if (h === null || h !== hydrogens(groupFormula(g, 0))) return null;
  return { body, written, charge: netCharge(g), graph: g, kind: 'formula' };
}

/**
 * What a text box's whole text is, as chemistry, or null when it is ordinary text. One line,
 * one species; BF4 without its charge is still tetrafluoroborate (with `expected` set).
 */
export function readSpecies(text: string): Species | null {
  const raw = text.trim();
  if (!raw || raw.length > 40 || /[\n\r\t]/.test(raw)) return null;
  const split = splitCharge(raw);
  if (!split) return null;
  const { body, charge: written } = split;
  if (!body || /\s/.test(body) || !/^[A-Za-z0-9()[\]·•.*'′,\-]+$/.test(body) || /^\d/.test(body.replace(/^\d,\d-|^\d-/, 'x'))) return null;
  const entry = lookUp(body, written);
  if (entry) return fromEntry(entry, body, written);
  // Na+, Fe3+, Cl−: one element with its charge
  const z = elementNumber(body);
  if (z !== undefined && body !== 'D' && body !== 'T') {
    if (!written) return null;
    return { body, written, charge: written, graph: { atoms: [{ z, charge: written, aromatic: false, dummy: false, hCount: 0 }], bonds: [] }, kind: 'ion' };
  }
  // adducts: BF3·OEt2, CuBr·SMe2, Pd2(dba)3·CHCl3
  const pieces = body.split(/[·•]/);
  if (pieces.length > 1) {
    const read = pieces.map((p) => readSpecies(p));
    if (read.some((r) => !r || r.expected) || written) return null;
    const parts = read as Species[];
    return { body, written: 0, charge: parts.reduce((s, p) => s + p.charge, 0), graph: joined(parts.map((p) => p.graph)), kind: 'reagent', name: parts.map((p) => p.name ?? p.body).join(' · ') };
  }
  if (!written) {
    const salt = readSalt(body);
    if (salt) return salt;
  }
  return readFormula(body, written);
}

/** A species' SMILES, molecules joined by dots. */
export function speciesSmiles(sp: Species): string {
  const g = sp.graph;
  const comp = g.atoms.map(() => -1);
  let n = 0;
  for (let i = 0; i < g.atoms.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i];
    comp[i] = n;
    while (stack.length) {
      const x = stack.pop()!;
      for (const b of g.bonds) {
        const y = b.a === x ? b.b : b.b === x ? b.a : -1;
        if (y >= 0 && comp[y] < 0) { comp[y] = n; stack.push(y); }
      }
    }
    n++;
  }
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const ids = comp.map((c, i) => (c === k ? i : -1)).filter((i) => i >= 0);
    const at = new Map(ids.map((old, i) => [old, i]));
    out.push(graphSmiles({ atoms: ids.map((i) => g.atoms[i]), bonds: g.bonds.filter((b) => at.has(b.a)).map((b) => ({ ...b, a: at.get(b.a)!, b: at.get(b.b)! })) }));
  }
  return out.join('.');
}

/** "BF₄⁻ (tetrafluoroborate)": what the box is read as, for the panel. */
export function speciesSummary(sp: Species): string {
  const f = speciesFormula(sp);
  return sp.name ? `${sp.name}, ${f}` : f;
}

/** The species' formula, in Hill order with its charge (BF4−, C7H10N2). */
export function speciesFormula(sp: Species): string {
  return groupFormula(sp.graph, 0);
}

/** The ion's charge as it would be written after it: "−", "2−", "+". */
export function chargeSign(q: number): string {
  return (Math.abs(q) > 1 ? String(Math.abs(q)) : '') + (q > 0 ? '+' : '−');
}

// ------------------------------------------------------------------ text boxes in a drawing

/** Why a text box is or isn't read as chemistry. */
export type CaptionReading =
  | { species: Species; forced: boolean }
  | { species: null; why: 'plain' | 'arrow' | 'unread' | 'tied'; forced: boolean };

/** Whether a text box is one that may hold a species: one line, not a placeholder, not tied to a structure. */
function mayHold(c: Caption): boolean {
  return !c.ph && !c.attach && !c.hidden && c.runs.length > 0 && !(c.paras && c.paras.length > 1);
}

interface Memo {
  version: number;
  /** Kept through structures moving in a step still being made: worked out again once it is done. */
  moved: boolean;
  /** What the arrows' text was worked out from, besides where the structures are. */
  atoms: number; bonds: number; style: Doc['style']; things: readonly object[];
  arrowText: Set<number>;
  read: Map<number, CaptionReading>;
}
const memo = new WeakMap<Doc, Memo>();

/** The captions, arrows and shapes (each replaced, never changed in place, when edited). */
const thingsOf = (doc: Doc): object[] => [...doc.captions.values(), ...doc.arrows.values(), ...doc.shapes.values()];

/**
 * Whether the drawing has changed only in where its structures are, during a step still being
 * made (a drag): what is text over an arrow is then worked out again when the step is done, not
 * on every move.
 */
function onlyMoved(doc: Doc, s: Memo): boolean {
  if (!doc.editing || doc.atoms.size !== s.atoms || doc.bonds.size !== s.bonds || doc.style !== s.style) return false;
  let i = 0;
  for (const map of [doc.captions, doc.arrows, doc.shapes] as Map<number, object>[]) for (const x of map.values()) if (s.things[i++] !== x) return false;
  return i === s.things.length;
}

/** The text above and below the reaction arrows (conditions), which stays text. */
function arrowCaptions(doc: Doc, m: Measure): Set<number> {
  const out = new Set<number>();
  if (!doc.arrows.size) return out;
  let items: Item[] | null = null;
  for (const r of doc.arrows.values()) {
    if (!isReactionArrow(r)) continue;
    // one pass over the drawing for all the arrows
    const t = arrowTexts(doc, m, r, items ??= schemeItems(doc, m));
    for (const c of [...t.above, ...t.below]) out.add(c.id);
  }
  return out;
}

/** How a text box in this drawing is read. */
export function captionReading(doc: Doc, c: Caption, m?: Measure): CaptionReading {
  let s = memo.get(doc);
  if (s && s.version !== doc.version && onlyMoved(doc, s)) { s.version = doc.version; s.moved = true; }
  if (!s || s.version !== doc.version || (s.moved && !doc.editing)) {
    s = {
      version: doc.version, moved: false, atoms: doc.atoms.size, bonds: doc.bonds.size, style: doc.style, things: thingsOf(doc),
      arrowText: arrowCaptions(doc, m ?? plainMeasure(doc)), read: new Map(),
    };
    memo.set(doc, s);
  }
  const known = s.read.get(c.id);
  if (known) return known;
  let r: CaptionReading;
  const forced = c.chem !== undefined;
  if (c.chem === false) r = { species: null, why: 'plain', forced };
  else if (!forced && !mayHold(c)) r = { species: null, why: 'tied', forced };
  else if (!forced && s.arrowText.has(c.id)) r = { species: null, why: 'arrow', forced };
  else {
    const sp = readSpecies(plainText(c.runs));
    r = sp ? { species: sp, forced } : { species: null, why: 'unread', forced };
  }
  s.read.set(c.id, r);
  return r;
}

/** The species a text box stands for in this drawing, or null when it is text. */
export function captionSpecies(doc: Doc, c: Caption, m?: Measure): Species | null {
  return captionReading(doc, c, m).species;
}

/** Every text box read as chemistry, by id. */
export function chemicalCaptions(doc: Doc, m?: Measure): Map<number, Species> {
  const out = new Map<number, Species>();
  for (const c of doc.captions.values()) {
    const sp = captionSpecies(doc, c, m);
    if (sp) out.set(c.id, sp);
  }
  return out;
}

/** The warning a text box gets: an ion without its charge, or text set to Chemical that can't be read. */
export function captionChemWarning(doc: Doc, c: Caption, m?: Measure): string | null {
  const r = captionReading(doc, c, m);
  const sp = r.species;
  if (sp?.expected !== undefined) {
    const what = sp.name ? sp.name[0].toUpperCase() + sp.name.slice(1) : sp.body;
    const has = sp.written ? `is written ${chargeSign(sp.written)}` : 'has no charge written';
    return `Invalid valence: “${sp.body}” ${has}. ${what} carries a ${chargeSign(sp.expected)} charge: add it, or turn on Settings ▸ Drawing ▸ Add charges to common counterions.`;
  }
  if (!r.species && r.forced && c.chem && r.why === 'unread') return `“${plainText(c.runs).trim()}” is set to Chemical but can't be read as chemistry, so it's left out of the formula and mass.`;
  return null;
}

/** The species' atoms placed around a point, for counting with the rest of a drawing. */
export interface PlacedSpecies { graph: MiniGraph; x: number; y: number }

/** These text boxes' species, each at the middle of its box (text boxes that aren't chemistry are left out). */
export function placeSpecies(doc: Doc, caps: Iterable<Caption>, m: Measure = plainMeasure(doc)): PlacedSpecies[] {
  const out: PlacedSpecies[] = [];
  for (const c of caps) {
    const sp = captionSpecies(doc, c, m);
    if (!sp) continue;
    const b = m.captionBox(c);
    out.push({ graph: sp.graph, x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });
  }
  return out;
}

/** Every text box in a drawing read as chemistry, placed (for a whole drawing's SMILES or molfile). */
export function allSpecies(doc: Doc, m: Measure = plainMeasure(doc)): PlacedSpecies[] {
  return placeSpecies(doc, doc.captions.values(), m);
}

/**
 * Text boxes read as ions, grouped (Format > Group) with these atoms: their counterions,
 * counted with the structure as one salt.
 */
export function groupedIons(doc: Doc, atoms: Iterable<number>, m?: Measure): Caption[] {
  const groups = new Set<number>();
  for (const id of atoms) { const g = doc.atoms.get(id)?.grp; if (g !== undefined) groups.add(g); }
  if (!groups.size) return [];
  const out: Caption[] = [];
  for (const c of doc.captions.values()) {
    if (c.grp === undefined || !groups.has(c.grp)) continue;
    const sp = captionSpecies(doc, c, m);
    if (sp && sp.charge) out.push(c);
  }
  return out;
}
