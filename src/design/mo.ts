// Molecular orbital diagrams (Chemistry ▸ Orbitals ▸ MO Diagram…): the atomic orbitals of two
// atoms (or fragments) at the sides, the molecular orbitals they make in the middle, each level
// drawn as one short line per orbital (two or three side by side when degenerate), filled with
// ↑ and ↓ electrons by Hund's rule, and joined to the atomic orbitals they come from by dashed
// lines. Energies only set the order and spacing; they are not to scale unless typed so.

import type { Caption, Doc, Shape } from '../model';
import type { Rect, Vec } from '../geom';
import type { Measure } from '../editor/arrange';
import { chemRuns } from '../text/chemtext';
import { orbitalShapes, type OrbitalLook, type OrbitalSpec } from '../chem/orbitals';

export type MoColumn = 'left' | 'middle' | 'right';

export interface MoLevel {
  column: MoColumn;
  /** The orbital's name (1s, 2p, σ, π*, HOMO…): rich text written as markup (see parseMarkup). */
  label: string;
  /** Its energy, which only sets the order and spacing (any units). */
  e: number;
  /** How many orbitals at this level (1 to 5). */
  n: number;
  /** Electrons in them (0 to 2n), put in by Hund's rule. */
  electrons: number;
  /** A molecular orbital: the names of the atomic orbitals it is made from, joined to it by dashed lines ("2p", or "1s, 2p" when the two sides differ). */
  from?: string;
  /** Made from one side's orbitals only (a nonbonding orbital, as HF's F 2p). */
  fromSide?: 'left' | 'right';
}

export interface MoSpec {
  levels: MoLevel[];
  /** The names under the three columns ("N", "N₂", "N"). */
  titles: [string, string, string];
  /** An energy arrow up the left side. */
  axis: boolean;
  /**
   * Names and titles are rich text kept as markup (parseMarkup), drawn exactly as written. Not set
   * in diagrams made before rich text: theirs went through chemical interpretation (chemRuns),
   * and the window turns them into markup when it opens them.
   */
  rich?: boolean;
  /** The ↑ and ↓ electrons: how tall, in points (not set: 80% of the caption size). */
  arrowSize?: number;
  /** Their line width, in points (not set: the drawing's). */
  arrowWidth?: number;
  /** How far above the level line they start, in points (not set: twice the drawing's line width). */
  arrowGap?: number;
  /** The dashed lines' color (not set: black) and how see-through they are, 0 to 1. */
  lineColor?: string;
  lineTransparency?: number;
  /** A white frame behind each name, so a dashed line under it doesn't cut through it: borderless or with a border. */
  labelBack?: 'white' | 'boxed';
  /** Move the molecular orbitals' names to the side, clear of the dashed lines. */
  labelClear?: boolean;
  /** Pictures of the orbitals mixing: each atomic orbital's shape beside it, and each molecular orbital's in-phase or out-of-phase combination beside it. */
  pictures?: boolean;
  /** The pictures' look, as Chemistry ▸ Orbital draws them. */
  pictureLook?: OrbitalLook;
}

/** A piece of rich text: plain, subscript or superscript. */
export interface MoPart { text: string; sub?: boolean; sup?: boolean }

/**
 * Rich text from markup: _{…} is a subscript and ^{…} a superscript (or _x and ^x for one
 * character), and a backslash makes the next character plain (\_, \^, \\, \} inside braces).
 */
export function parseMarkup(text: string): MoPart[] {
  const out: MoPart[] = [];
  const put = (t: string, pos?: 'sub' | 'sup') => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && !!last.sub === (pos === 'sub') && !!last.sup === (pos === 'sup')) { last.text += t; return; }
    out.push({ text: t, ...(pos ? { [pos]: true } : {}) });
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) { put(text[i + 1]); i += 2; continue; }
    if ((c === '_' || c === '^') && i + 1 < text.length && !/\s/.test(text[i + 1])) {
      const pos = c === '_' ? 'sub' : 'sup';
      if (text[i + 1] === '{') {
        let j = i + 2, t = '';
        while (j < text.length && text[j] !== '}') {
          if (text[j] === '\\' && j + 1 < text.length) { t += text[j + 1]; j += 2; } else t += text[j++];
        }
        put(t, pos);
        i = j + 1;
      } else {
        const ch = String.fromCodePoint(text.codePointAt(i + 1)!);
        put(ch, pos);
        i += 1 + ch.length;
      }
      continue;
    }
    put(c);
    i++;
  }
  return out;
}

/** Markup for rich text (parseMarkup reads it back the same). */
export function toMarkup(parts: MoPart[]): string {
  return parts.map((p) => {
    if (p.sub || p.sup) return `${p.sub ? '_' : '^'}{${p.text.replace(/[\\}]/g, (c) => `\\${c}`)}}`;
    return p.text.replace(/[\\_^]/g, (c) => `\\${c}`);
  }).join('');
}

/** A name or title as rich text, however the diagram keeps it. */
export const moParts = (spec: Pick<MoSpec, 'rich'>, text: string): MoPart[] => (spec.rich ? parseMarkup(text) : chemRuns(text));

/** A name as plain text (σ2s for σ_{2s}): what "Made from" names it by. */
export const moPlain = (text: string): string => parseMarkup(text).map((p) => p.text).join('').trim();

/** A diagram made before rich text, with its names and titles turned into markup that draws the same. */
export function toRich(spec: MoSpec): MoSpec {
  if (spec.rich) return spec;
  const conv = (t: string) => toMarkup(chemRuns(t));
  return {
    ...spec, rich: true,
    titles: spec.titles.map(conv) as [string, string, string],
    levels: spec.levels.map((l) => ({ ...l, label: conv(l.label), ...(l.from ? { from: l.from.split(',').map((x) => moPlain(x)).filter(Boolean).join(', ') } : {}) })),
  };
}

export interface MoPreset { id: string; name: string; spec: MoSpec; /** An ion's charge: the molecular orbitals hold that many fewer electrons than the atoms gave. */ charge?: number }

const lv = (column: MoColumn, label: string, e: number, n: number, electrons: number, from?: string, fromSide?: 'left' | 'right'): MoLevel =>
  ({ column, label, e, n, electrons, ...(from ? { from } : {}), ...(fromSide ? { fromSide } : {}) });

/** One atom's valence orbitals for Autofill, with their potential energies in eV (approximate, as tabulated in inorganic chemistry texts). */
export interface MoAtom { id: string; name: string; symbol: string; orbitals: { label: string; e: number; n: number; electrons: number }[] }

export const MO_ATOMS: MoAtom[] = [
  { id: 'H', name: 'Hydrogen', symbol: 'H', orbitals: [{ label: '1s', e: -13.6, n: 1, electrons: 1 }] },
  { id: 'He', name: 'Helium', symbol: 'He', orbitals: [{ label: '1s', e: -24.6, n: 1, electrons: 2 }] },
  { id: 'Li', name: 'Lithium', symbol: 'Li', orbitals: [{ label: '2s', e: -5.4, n: 1, electrons: 1 }, { label: '2p', e: -3.5, n: 3, electrons: 0 }] },
  { id: 'Be', name: 'Beryllium', symbol: 'Be', orbitals: [{ label: '2s', e: -9.3, n: 1, electrons: 2 }, { label: '2p', e: -6.0, n: 3, electrons: 0 }] },
  { id: 'B', name: 'Boron', symbol: 'B', orbitals: [{ label: '2s', e: -14.0, n: 1, electrons: 2 }, { label: '2p', e: -8.3, n: 3, electrons: 1 }] },
  { id: 'C', name: 'Carbon', symbol: 'C', orbitals: [{ label: '2s', e: -19.4, n: 1, electrons: 2 }, { label: '2p', e: -10.7, n: 3, electrons: 2 }] },
  { id: 'N', name: 'Nitrogen', symbol: 'N', orbitals: [{ label: '2s', e: -25.6, n: 1, electrons: 2 }, { label: '2p', e: -13.2, n: 3, electrons: 3 }] },
  { id: 'O', name: 'Oxygen', symbol: 'O', orbitals: [{ label: '2s', e: -32.4, n: 1, electrons: 2 }, { label: '2p', e: -15.9, n: 3, electrons: 4 }] },
  { id: 'F', name: 'Fluorine', symbol: 'F', orbitals: [{ label: '2s', e: -40.2, n: 1, electrons: 2 }, { label: '2p', e: -18.7, n: 3, electrons: 5 }] },
  { id: 'Ne', name: 'Neon', symbol: 'Ne', orbitals: [{ label: '2s', e: -48.5, n: 1, electrons: 2 }, { label: '2p', e: -21.6, n: 3, electrons: 6 }] },
  { id: 'Cl', name: 'Chlorine', symbol: 'Cl', orbitals: [{ label: '3s', e: -25.3, n: 1, electrons: 2 }, { label: '3p', e: -13.7, n: 3, electrons: 5 }] },
  { id: 'Csp3', name: 'Carbon, sp³ hybrid (one bond)', symbol: 'C', orbitals: [{ label: 'sp^{3}', e: -12.9, n: 1, electrons: 1 }] },
  { id: 'Csp2', name: 'Carbon, sp² hybrid (one bond)', symbol: 'C', orbitals: [{ label: 'sp^{2}', e: -13.5, n: 1, electrons: 1 }] },
  { id: 'Csp', name: 'Carbon, sp hybrid (one bond)', symbol: 'C', orbitals: [{ label: 'sp', e: -15.1, n: 1, electrons: 1 }] },
];

/** Put electrons into the molecular orbitals lowest first (two to an orbital); Hund's rule spreads them within a level. */
export function aufbau(levels: MoLevel[], total: number): MoLevel[] {
  let left = total;
  const order = levels.map((l, i) => ({ l, i })).filter((x) => x.l.column === 'middle').sort((a, b) => a.l.e - b.l.e);
  const out = levels.map((l) => ({ ...l }));
  for (const { i } of order) { const k = Math.min(left, 2 * out[i].n); out[i].electrons = k; left -= k; }
  return out;
}

/** The atomic orbitals on one side from an atom. */
export const atomLevels = (atom: MoAtom, column: 'left' | 'right'): MoLevel[] => atom.orbitals.map((o) => lv(column, o.label, o.e, o.n, o.electrons));

const atom = (id: string) => MO_ATOMS.find((a) => a.id === id)!;

/**
 * A diatomic of second-row atoms: σ2s, σ*2s, then the 2p set, with π below σ2p when the s and p
 * orbitals mix (B₂, C₂, N₂; CN⁻) and above it when they don't (O₂, F₂). `charge` adds or takes electrons.
 */
function diatomic(a: string, b: string, mixing: boolean, charge = 0): MoSpec {
  const A = atom(a), B = atom(b);
  const s = (A.orbitals[0].e + B.orbitals[0].e) / 2, p = (A.orbitals[1].e + B.orbitals[1].e) / 2, g = p - s;
  const r = (x: number) => Math.round(x * 10) / 10;
  const twoP = mixing
    ? [lv('middle', 'π_{2p}', r(p - 0.32 * g), 2, 0, '2p'), lv('middle', 'σ_{2p}', r(p - 0.15 * g), 1, 0, '2p')]
    : [lv('middle', 'σ_{2p}', r(p - 0.38 * g), 1, 0, '2p'), lv('middle', 'π_{2p}', r(p - 0.2 * g), 2, 0, '2p')];
  const levels = [...atomLevels(A, 'left'), ...atomLevels(B, 'right'),
    lv('middle', 'σ_{2s}', r(s - 0.22 * g), 1, 0, '2s'), lv('middle', 'σ^{*}_{2s}', r(s + 0.18 * g), 1, 0, '2s'),
    ...twoP, lv('middle', 'π^{*}_{2p}', r(p + 0.22 * g), 2, 0, '2p'), lv('middle', 'σ^{*}_{2p}', r(p + 0.45 * g), 1, 0, '2p')];
  const total = levels.filter((l) => l.column !== 'middle').reduce((t, l) => t + l.electrons, 0) - charge;
  return { titles: [A.symbol, a === b ? `${A.symbol}_{2}` : `${A.symbol}${B.symbol}`, B.symbol], axis: true, rich: true, levels: aufbau(levels, total) };
}

/** Two s orbitals (H₂, He₂). */
function sOnly(a: string): MoSpec {
  const A = atom(a), e = A.orbitals[0].e, d = a === 'H' ? 0.6 : 0.4;
  const levels = [...atomLevels(A, 'left'), ...atomLevels(A, 'right'),
    lv('middle', `σ_{${A.orbitals[0].label}}`, e - 8 * d, 1, 0, A.orbitals[0].label), lv('middle', `σ^{*}_{${A.orbitals[0].label}}`, e + 10 * d, 1, 0, A.orbitals[0].label)];
  return { titles: [A.symbol, `${A.symbol}_{2}`, A.symbol], axis: true, rich: true, levels: aufbau(levels, 2 * A.orbitals[0].electrons) };
}

const withTitle = (spec: MoSpec, middle: string): MoSpec => ({ ...spec, titles: [spec.titles[0], middle, spec.titles[2]] });

/** Starting points for teaching: qualitative orders from MO theory, energies near the atoms' orbital potential energies (eV). */
export const MO_PRESETS: MoPreset[] = [
  { id: 'h2', name: 'H₂ (two 1s orbitals)', spec: sOnly('H') },
  { id: 'he2', name: 'He₂ (bond order 0)', spec: sOnly('He') },
  { id: 'li2', name: 'Li₂ (2s only)', spec: (() => {
    const L = atom('Li'), e = L.orbitals[0].e;
    const levels = [lv('left', '2s', e, 1, 1), lv('right', '2s', e, 1, 1), lv('middle', 'σ_{2s}', e - 1.6, 1, 2, '2s'), lv('middle', 'σ^{*}_{2s}', e + 1.9, 1, 0, '2s')];
    return { titles: ['Li', 'Li_{2}', 'Li'], axis: true, rich: true, levels };
  })() },
  { id: 'b2', name: 'B₂ (π below σ2p; two unpaired)', spec: diatomic('B', 'B', true) },
  { id: 'c2', name: 'C₂ (π below σ2p)', spec: diatomic('C', 'C', true) },
  { id: 'n2', name: 'N₂ (s–p mixing: π below σ2p)', spec: diatomic('N', 'N', true) },
  { id: 'o2', name: 'O₂ (σ2p below π; two unpaired electrons)', spec: diatomic('O', 'O', false) },
  { id: 'o2-', name: 'O₂⁻ (superoxide)', spec: withTitle(diatomic('O', 'O', false, -1), 'O_{2}^{−}'), charge: -1 },
  { id: 'o22-', name: 'O₂²⁻ (peroxide)', spec: withTitle(diatomic('O', 'O', false, -2), 'O_{2}^{2−}'), charge: -2 },
  { id: 'f2', name: 'F₂', spec: diatomic('F', 'F', false) },
  { id: 'cn-', name: 'CN⁻ (like N₂)', spec: withTitle(diatomic('C', 'N', true, -1), 'CN^{−}'), charge: -1 },
  { id: 'co', name: 'CO (C higher, O lower)', spec: { titles: ['C', 'CO', 'O'], axis: true, rich: true, levels: [
    ...atomLevels(atom('C'), 'left'), ...atomLevels(atom('O'), 'right'),
    lv('middle', '1σ', -34.5, 1, 2, '2s'), lv('middle', '2σ^{*}', -20.8, 1, 2, '2s'), lv('middle', '1π', -17.2, 2, 4, '2p'),
    lv('middle', '3σ (HOMO)', -14.0, 1, 2, '2p'), lv('middle', '2π^{*} (LUMO)', -8.5, 2, 0, '2p'), lv('middle', '4σ^{*}', -4.5, 1, 0, '2p'),
  ] } },
  { id: 'hf', name: 'HF (nonbonding F orbitals)', spec: { titles: ['H', 'HF', 'F'], axis: true, rich: true, levels: [
    ...atomLevels(atom('H'), 'left'), ...atomLevels(atom('F'), 'right'),
    lv('middle', '1σ', -40.2, 1, 2, '2s', 'right'), lv('middle', '2σ', -20.6, 1, 2, '1s, 2p'),
    lv('middle', '1π', -18.7, 2, 4, '2p', 'right'), lv('middle', '3σ^{*}', -9.5, 1, 0, '1s, 2p'),
  ] } },
  { id: 'cf', name: 'C–F σ bond (sp³ C with F 2p)', spec: { titles: ['C', 'C–F', 'F'], axis: true, rich: true, levels: [
    lv('left', 'sp^{3}', -12.9, 1, 1), lv('right', '2p', -18.7, 1, 1),
    lv('middle', 'σ_{C–F}', -20.4, 1, 2, 'sp^{3}, 2p'), lv('middle', 'σ^{*}_{C–F}', -9.8, 1, 0, 'sp^{3}, 2p'),
  ] } },
  { id: 'ethylene', name: 'Ethylene π bond (two p orbitals)', spec: { titles: ['C', 'C=C π', 'C'], axis: true, rich: true, levels: [
    lv('left', '2p', 0, 1, 1), lv('right', '2p', 0, 1, 1), lv('middle', 'π (HOMO)', -1, 1, 2, '2p'), lv('middle', 'π^{*} (LUMO)', 1, 1, 0, '2p'),
  ] } },
  { id: 'blank', name: 'Blank (two orbitals making two)', spec: { titles: ['A', 'AB', 'B'], axis: true, rich: true, levels: [
    lv('left', 'φ_{A}', 0.4, 1, 1), lv('right', 'φ_{B}', -0.4, 1, 1), lv('middle', 'ψ_{1}', -1.2, 1, 2, 'φA, φB'), lv('middle', 'ψ_{2}', 1.4, 1, 0, 'φA, φB'),
  ] } },
];

/** Electrons in each of a level's n orbitals, by Hund's rule: one in each first, then pairs. */
export function hund(n: number, electrons: number): number[] {
  const k = Math.max(1, Math.min(5, Math.round(n)));
  const e = Math.max(0, Math.min(2 * k, Math.round(electrons)));
  return Array.from({ length: k }, (_, i) => (e >= k + i + 1 ? 2 : e > i ? 1 : 0));
}

/** The atomic orbitals a molecular orbital is joined to: the levels named in its `from`, on both sides (or one, with `fromSide`). */
export function sources(levels: MoLevel[], mo: MoLevel): MoLevel[] {
  const names = (mo.from ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const plain = new Set(names.map(moPlain));
  return levels.filter((l) => l.column !== 'middle' && (!mo.fromSide || l.column === mo.fromSide) && (names.includes(l.label.trim()) || plain.has(moPlain(l.label))));
}

/** The shapes an atomic orbital can be drawn as. */
export type MoAo = 's' | 'p' | 'sp' | 'sp2' | 'sp3';

/** What an atomic orbital is, from its name: an sp, sp² or sp³ hybrid, a p orbital (a "p" in its name), or else s-like. */
export function aoKind(label: string): MoAo {
  const t = moPlain(label).toLowerCase();
  if (/sp(3|³)/.test(t)) return 'sp3';
  if (/sp(2|²)/.test(t)) return 'sp2';
  if (/sp(?![0-9²³])/.test(t)) return 'sp';
  return /p/.test(t) ? 'p' : 's';
}

/** What a molecular orbital's picture shows: its left and right atomic orbitals, end on (σ) or side by side (π), in phase or out of phase. */
export interface MoMix { left: MoAo | null; right: MoAo | null; sym: 'σ' | 'π'; bonding: boolean }

/**
 * How a molecular orbital is made, read from its name and the atomic orbitals it comes from: π
 * if its name has π (and they are p orbitals), out of phase if it has a * (or, with neither σ nor
 * π in the name, if it lies above the orbitals it comes from). A nonbonding orbital made from one
 * side's orbitals shows that orbital alone.
 */
export function mixOf(levels: MoLevel[], mo: MoLevel): MoMix | null {
  const from = sources(levels, mo);
  if (!from.length) return null;
  const name = moPlain(mo.label);
  const l = from.find((x) => x.column === 'left'), r = from.find((x) => x.column === 'right');
  const left = l ? aoKind(l.label) : null, right = r ? aoKind(r.label) : null;
  const sym = name.includes('π') && left !== 's' && right !== 's' && (left === 'p' || right === 'p') ? 'π' : 'σ';
  const mean = from.reduce((t, x) => t + x.e, 0) / from.length;
  const bonding = name.includes('*') ? false : /[σπ]/.test(name) ? true : mo.e <= mean;
  return { left, right, sym, bonding };
}

type Piece = Omit<Shape, 'id'>;
const untag = (s: Piece): Piece => { const { orb: _o, ...rest } = s; return rest; };

/** How far an orbital reaches along the bond from its centre: towards the other atom (its big lobe) and away. */
const reach = (k: MoAo, u: number): { front: number; back: number; half: number } => {
  const back = { s: 0.42, p: 1, sp: 0.42, sp2: 0.36, sp3: 0.3 }[k];
  return { front: k === 's' ? 0.42 * u : u, back: back * u, half: k === 's' ? 0.42 * u : 0.31 * u };
};

/** One orbital centred at `c`, its big (shaded) lobe pointing `angle` degrees clockwise from up; `flip` swaps the phases. */
const orbital = (k: MoAo, c: Vec, u: number, look: OrbitalLook, angle: number, flip = false): Piece[] =>
  orbitalShapes({ kind: k, look, angle, size: u, ...(flip ? { flip } : {}) } as OrbitalSpec, c).map(untag);

/** An atomic orbital's picture: an s sphere, or a p orbital or hybrid pointing along the bond towards the other atom. */
function aoPicture(k: MoAo, side: 'left' | 'right', u: number, look: OrbitalLook): { w: number; h: number; draw(at: Vec): Piece[] } {
  const r = reach(k, u), towards = side === 'left' ? 90 : 270;
  const w = (r.front + r.back) / 2, shift = (r.front - r.back) / 2;
  return { w, h: r.half, draw: (at) => orbital(k, { x: at.x + (side === 'left' ? -shift : shift), y: at.y }, u, look, towards) };
}

/** A molecular orbital's picture: its two atomic orbitals meeting in the middle, in phase or out of phase (or one, for a nonbonding orbital). */
function moPicture(mix: MoMix, u: number, look: OrbitalLook): { w: number; h: number; draw(at: Vec): Piece[] } {
  const { left, right } = mix;
  if (!left || !right) {
    const k = (left ?? right)!;
    return { w: k === 's' ? 0.42 * u : u, h: reach(k, u).half, draw: (at) => orbital(k, at, u, look, k === 's' ? 0 : 90) };
  }
  if (left === 's' && right === 's' && mix.bonding) {
    // the two spheres run together into one
    const rx = u * 0.8, ry = u * 0.42;
    return { w: rx, h: ry, draw: (at) => [{ ...orbital('s', at, u, look, 0)[0], x1: at.x - rx, y1: at.y - ry, x2: at.x + rx, y2: at.y + ry }] };
  }
  if (mix.sym === 'π') {
    // side by side: the shaded lobes both up when in phase
    const d = u * 0.36;
    return { w: d + 0.31 * u, h: u, draw: (at) => [...orbital('p', { x: at.x - d, y: at.y }, u, look, 0), ...orbital('p', { x: at.x + d, y: at.y }, u, look, mix.bonding ? 0 : 180)] };
  }
  // end on: the big lobes meet in the middle, the same phase when in phase
  const a = reach(left, u), b = reach(right, u);
  const sep = mix.bonding ? 0.9 : 1.05;
  const lc = -a.front * sep, rc = b.front * sep;
  const x1 = lc - a.back, x2 = rc + b.back, mid = (x1 + x2) / 2;
  return {
    w: (x2 - x1) / 2, h: Math.max(a.half, b.half),
    draw: (at) => [...orbital(left, { x: at.x + lc - mid, y: at.y }, u, look, 90), ...orbital(right, { x: at.x + rc - mid, y: at.y }, u, look, 270, !mix.bonding)],
  };
}

/** A color faded towards white by `t` (0 none, 1 white): how see-through looks on the page. */
function fade(color: string, t: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  const k = Math.max(0, Math.min(1, t));
  if (!m || !k) return color;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Where the line from p to q runs through the box, as parts of its length [t0, t1] (null: it misses it). */
function through(p: Vec, q: Vec, b: Rect): [number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  for (const [pp, qq] of [[-dx, p.x - b.x1], [dx, b.x2 - p.x], [-dy, p.y - b.y1], [dy, b.y2 - p.y]] as const) {
    if (pp === 0) { if (qq < 0) return null; continue; }
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return t0 < t1 ? [t0, t1] : null;
}

/** The pieces of the line from p to q outside every box. */
function outside(p: Vec, q: Vec, boxes: Rect[]): [Vec, Vec][] {
  const cuts = boxes.map((b) => through(p, q, b)).filter((x): x is [number, number] => !!x).sort((a, b) => a[0] - b[0]);
  const at = (t: number): Vec => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const out: [Vec, Vec][] = [];
  let from = 0;
  for (const [a, b] of cuts) { if (a > from + 1e-3) out.push([at(from), at(a)]); from = Math.max(from, b); }
  if (from < 1 - 1e-3) out.push([at(from), at(1)]);
  return out;
}

export interface MoParts { captions: number[]; arrows: number[]; shapes: number[] }

/** Draw the diagram in the box w × h with its top left at `at`. Call inside an edit. */
export function drawMo(doc: Doc, m: Measure, spec: MoSpec, at: Vec, w: number, h: number): MoParts {
  const out: MoParts = { captions: [], arrows: [], shapes: [] };
  const lw = doc.style.lineWidth, L = doc.style.bondLength;
  const levels = spec.levels.filter((l) => Number.isFinite(l.e));
  if (!levels.length) return out;
  const hi = Math.max(...levels.map((l) => l.e)), lo = Math.min(...levels.map((l) => l.e));
  const y = (e: number) => (hi === lo ? at.y + h / 2 : at.y + ((hi - e) / (hi - lo)) * h);
  const pics = !!spec.pictures;
  const colX: Record<MoColumn, number> = pics
    ? { left: at.x + w * 0.24, middle: at.x + w * 0.5, right: at.x + w * 0.76 }
    : { left: at.x + w * 0.14, middle: at.x + w * 0.5, right: at.x + w * 0.86 };
  const one = Math.min(w * 0.09, 1.3 * L), gapX = one * 0.3;
  const gap = 0.25 * L;
  /** A level's ends (from the first orbital's left to the last one's right). */
  const span = (l: MoLevel): [number, number] => {
    const k = hund(l.n, 0).length, total = k * one + (k - 1) * gapX;
    return [colX[l.column] - total / 2, colX[l.column] + total / 2];
  };
  const caption = (text: string, target: Vec, anchor: 'above' | 'below' | 'left' | 'right', extra: Partial<Caption> = {}): Rect => {
    const c = doc.addCaption({ x: 0, y: 0, runs: moParts(spec, text), justify: 'left', chem: false, ...extra });
    const b = m.captionBox(c);
    const bw = b.x2 - b.x1, bh = b.y2 - b.y1;
    const want = anchor === 'above' ? { x: target.x - bw / 2, y: target.y - bh } : anchor === 'below' ? { x: target.x - bw / 2, y: target.y }
      : anchor === 'left' ? { x: target.x - bw, y: target.y - bh / 2 } : { x: target.x, y: target.y - bh / 2 };
    doc.updateCaption(c.id, { x: want.x - b.x1, y: want.y - b.y1 });
    out.captions.push(c.id);
    return m.captionBox(doc.captions.get(c.id)!);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, more: Partial<Shape> = {}) =>
    out.shapes.push(doc.addShape({ kind: 'line', x1, y1, x2, y2, color: '#000000', ...more }).id);

  // the dashed correlation lines first, so the levels sit on top of them; see-through is drawn as
  // the color faded towards the white page, which reads the same and saves to every format
  const dashColor = fade(spec.lineColor ?? '#000000', spec.lineTransparency ?? 0);
  const dashes: [Vec, Vec][] = [];
  /** Which side of a molecular orbital its name goes: away from its atomic orbitals when they are all on the right (a nonbonding orbital). */
  const nameLeft = new Set<MoLevel>();
  for (const mo of levels.filter((l) => l.column === 'middle')) {
    const [m1, m2] = span(mo);
    const from = sources(levels, mo);
    if (from.length && from.every((ao) => ao.column === 'right')) nameLeft.add(mo);
    for (const ao of from) {
      const [a1, a2] = span(ao);
      dashes.push(ao.column === 'left' ? [{ x: a2, y: y(ao.e) }, { x: m1, y: y(mo.e) }] : [{ x: a1, y: y(ao.e) }, { x: m2, y: y(mo.e) }]);
    }
  }
  // the levels' lines go on top of the dashed lines (drawn after the names, so they can stop at a name's frame)
  const levelLines: Shape['id'][] = [];
  const tall = spec.arrowSize && spec.arrowSize > 0 ? spec.arrowSize : Math.round(doc.style.captionSize * 0.8 * 10) / 10;
  const thick = spec.arrowWidth && spec.arrowWidth > 0 ? spec.arrowWidth : lw;
  const lift = spec.arrowGap !== undefined && spec.arrowGap >= 0 ? spec.arrowGap : lw * 2;
  /** An electron: an arrow `tall` high, starting `lift` above the level line, up or down. */
  const electron = (x: number, yy: number, up: boolean) => {
    const lo = { x, y: yy - lift }, hi = { x, y: yy - lift - tall };
    out.arrows.push(doc.addArrow({
      tail: up ? lo : hi, head: up ? hi : lo, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid',
      noGo: false, equilibrium: false, sweep: 0, headLength: Math.max(tall * 0.32, thick * 3), headWidth: Math.max(tall * 0.12, thick * 1.4),
      ...(thick !== lw ? { lineWidth: thick } : {}),
    }).id);
  };
  /** Where each label ended up, for the pictures beside them. */
  const labelBox = new Map<MoLevel, Rect>();
  const pad = 0.08 * L;
  for (const l of levels) {
    const [x0] = span(l), yy = y(l.e);
    const fill = hund(l.n, l.electrons);
    const apart = Math.max(tall * 0.2, thick * 2.5);
    fill.forEach((e, i) => {
      const xa = x0 + i * (one + gapX);
      levelLines.push(doc.addShape({ kind: 'line', x1: xa, y1: yy, x2: xa + one, y2: yy, color: '#000000', bold: true }).id);
      // ↑ and ↓ over the line: one electron sits in the middle, a pair side by side
      const cx = xa + one / 2;
      if (e === 1) electron(cx, yy, true);
      if (e === 2) { electron(cx - apart, yy, true); electron(cx + apart, yy, false); }
    });
    const [, x1] = span(l);
    if (!l.label.trim()) continue;
    const left = l.column === 'left' || nameLeft.has(l);
    let box = left ? caption(l.label.trim(), { x: x0 - gap, y: yy }, 'left') : caption(l.label.trim(), { x: x1 + gap, y: yy }, 'right');
    if (spec.labelClear && l.column === 'middle') {
      // move the name outwards, a little at a time, until no dashed line runs through it
      const id = out.captions[out.captions.length - 1];
      const way = left ? -1 : 1;
      let dx = 0;
      const grow = (b: Rect, d: number): Rect => ({ x1: b.x1 + way * d - pad, y1: b.y1 - pad, x2: b.x2 + way * d + pad, y2: b.y2 + pad });
      while (dx < 3 * L && dashes.some(([p, q]) => through(p, q, grow(box, dx)))) dx += 0.1 * L;
      if (dx >= 3 * L) dx = 0;
      if (dx) { const c = doc.captions.get(id)!; doc.updateCaption(id, { x: c.x + way * dx }); box = m.captionBox(doc.captions.get(id)!); }
    }
    labelBox.set(l, box);
  }
  // the dashed lines, stopping at the names' frames when they have them
  const frames = spec.labelBack ? [...labelBox.values()].map((b) => ({ x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad })) : [];
  for (const [p, q] of dashes) for (const [a, b] of outside(p, q, frames)) line(a.x, a.y, b.x, b.y, { dashed: true, lineWidth: lw * 0.7, color: dashColor });
  if (spec.labelBack === 'boxed') for (const f of frames) out.shapes.push(doc.addShape({ kind: 'rect', ...f, filled: false, color: '#000000', lineWidth: lw * 0.6 }).id);
  out.shapes.push(...levelLines);
  let leftmost = Infinity;
  if (pics) drawPictures();
  const bottom = at.y + h + 1.2 * L;
  (['left', 'middle', 'right'] as const).forEach((c, i) => { if (spec.titles[i]?.trim()) caption(spec.titles[i].trim(), { x: colX[c], y: bottom }, 'below'); });
  if (spec.axis) {
    // left of everything (the left atom's pictures can reach past the box)
    const ax = Math.min(at.x, leftmost) - 0.4 * L;
    out.arrows.push(doc.addArrow({
      tail: { x: ax, y: at.y + h + 0.6 * L }, head: { x: ax, y: at.y - 0.8 * L }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid',
      noGo: false, equilibrium: false, sweep: 0, headLength: lw * 8, headWidth: lw * 2.2,
    }).id);
    caption('E', { x: ax - gap, y: at.y - 0.4 * L }, 'left', { runs: [{ text: 'E', italic: true }] });
  }
  return out;

  /**
   * Each atomic orbital's picture outside its name, and each molecular orbital's beside its name,
   * moved apart up and down where two would overlap.
   */
  function drawPictures(): void {
    const look = spec.pictureLook ?? 'shaded';
    const u = Math.min(0.42 * L, w * 0.035);
    const put = (pieces: Piece[]) => { for (const p of pieces) out.shapes.push(doc.addShape(p).id); };
    const side = (col: 'left' | 'right') => {
      // atomic orbitals: one picture per name, outside it (the degenerate p orbitals share one)
      for (const l of levels.filter((x) => x.column === col)) {
        const pic = aoPicture(aoKind(l.label), col, u, look);
        const b = labelBox.get(l), [s0, s1] = span(l);
        const x = col === 'left' ? (b ? b.x1 : s0) - gap - pic.w : (b ? b.x2 : s1) + gap + pic.w;
        leftmost = Math.min(leftmost, x - pic.w);
        put(pic.draw({ x, y: y(l.e) }));
      }
    };
    side('left');
    side('right');
    // molecular orbitals: beside their names, highest first, pushed down where they would overlap
    const mos = levels.filter((l) => l.column === 'middle').map((l) => ({ l, mix: mixOf(levels, l) })).filter((x): x is { l: MoLevel; mix: MoMix } => !!x.mix)
      .sort((a, b) => b.l.e - a.l.e);
    let floor = -Infinity;
    for (const { l, mix } of mos) {
      const pic = moPicture(mix, u, look), b = labelBox.get(l), [s0, s1] = span(l);
      const cy = Math.max(y(l.e), floor + pic.h + lw * 2);
      floor = cy + pic.h;
      const x = nameLeft.has(l) ? (b ? b.x1 : s0) - gap - pic.w : (b ? b.x2 : s1) + gap + pic.w;
      put(pic.draw({ x, y: cy }));
    }
  }
}
