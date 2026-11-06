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
  /** A molecular orbital: the names of the atomic orbitals it is made from, joined to it by dashed lines ("2p" or "1s"). */
  from?: string;
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
  /** How big the ↑ and ↓ electrons are, in points (their font size). Not set: 90% of the caption size. */
  arrowSize?: number;
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

export interface MoPreset { id: string; name: string; spec: MoSpec }

const lv = (column: MoColumn, label: string, e: number, n: number, electrons: number, from?: string): MoLevel => ({ column, label, e, n, electrons, ...(from ? { from } : {}) });

/** Starting points: qualitative orders from first-year MO theory; energies are only for spacing. */
export const MO_PRESETS: MoPreset[] = [
  { id: 'h2', name: 'H₂ (two 1s orbitals)', spec: { titles: ['H', 'H_{2}', 'H'], axis: true, rich: true, levels: [
    lv('left', '1s', 0, 1, 1), lv('right', '1s', 0, 1, 1), lv('middle', 'σ_{1s}', -1.2, 1, 2, '1s'), lv('middle', 'σ^{*}_{1s}', 1.4, 1, 0, '1s'),
  ] } },
  { id: 'n2', name: 'N₂ (s–p mixing: π below σ2p)', spec: { titles: ['N', 'N_{2}', 'N'], axis: true, rich: true, levels: [
    lv('left', '2s', -3, 1, 2), lv('left', '2p', 0, 3, 3), lv('right', '2s', -3, 1, 2), lv('right', '2p', 0, 3, 3),
    lv('middle', 'σ_{2s}', -4, 1, 2, '2s'), lv('middle', 'σ^{*}_{2s}', -2, 1, 2, '2s'), lv('middle', 'π_{2p}', -1.2, 2, 4, '2p'),
    lv('middle', 'σ_{2p}', -0.7, 1, 2, '2p'), lv('middle', 'π^{*}_{2p}', 1, 2, 0, '2p'), lv('middle', 'σ^{*}_{2p}', 2, 1, 0, '2p'),
  ] } },
  { id: 'o2', name: 'O₂ (σ2p below π; two unpaired electrons)', spec: { titles: ['O', 'O_{2}', 'O'], axis: true, rich: true, levels: [
    lv('left', '2s', -3, 1, 2), lv('left', '2p', 0, 3, 4), lv('right', '2s', -3, 1, 2), lv('right', '2p', 0, 3, 4),
    lv('middle', 'σ_{2s}', -4, 1, 2, '2s'), lv('middle', 'σ^{*}_{2s}', -2, 1, 2, '2s'), lv('middle', 'σ_{2p}', -1.4, 1, 2, '2p'),
    lv('middle', 'π_{2p}', -0.8, 2, 4, '2p'), lv('middle', 'π^{*}_{2p}', 1, 2, 2, '2p'), lv('middle', 'σ^{*}_{2p}', 2, 1, 0, '2p'),
  ] } },
  { id: 'co', name: 'CO (C higher, O lower)', spec: { titles: ['C', 'CO', 'O'], axis: true, rich: true, levels: [
    lv('left', '2s', -2.4, 1, 2), lv('left', '2p', 0.4, 3, 2), lv('right', '2s', -4, 1, 2), lv('right', '2p', -1, 3, 4),
    lv('middle', '1σ', -4.6, 1, 2, '2s'), lv('middle', '2σ^{*}', -2.6, 1, 2, '2s'), lv('middle', '1π', -1.6, 2, 4, '2p'),
    lv('middle', '3σ (HOMO)', -0.6, 1, 2, '2p'), lv('middle', '2π^{*} (LUMO)', 1, 2, 0, '2p'), lv('middle', '4σ^{*}', 2.4, 1, 0, '2p'),
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

/** The atomic orbitals a molecular orbital is joined to: the levels named in its `from`, on both sides. */
export function sources(levels: MoLevel[], mo: MoLevel): MoLevel[] {
  const names = (mo.from ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const plain = new Set(names.map(moPlain));
  return levels.filter((l) => l.column !== 'middle' && (names.includes(l.label.trim()) || plain.has(moPlain(l.label))));
}

/** What a molecular orbital's picture shows: two s or two p orbitals, end on (σ) or side by side (π), in phase or out of phase. */
export interface MoMix { ao: 's' | 'p'; sym: 'σ' | 'π'; bonding: boolean }

/**
 * How a molecular orbital is made, read from its name and the atomic orbitals it comes from: p
 * if they are p orbitals (a "p" in their names), π if its name has π, out of phase if it has a *
 * (or, with neither σ nor π in the name, if it lies above the orbitals it comes from).
 */
export function mixOf(levels: MoLevel[], mo: MoLevel): MoMix | null {
  const from = sources(levels, mo);
  if (!from.length) return null;
  const name = moPlain(mo.label);
  const ao = /p/i.test(moPlain(from[0].label)) ? 'p' : 's';
  const sym = ao === 'p' && name.includes('π') ? 'π' : 'σ';
  const mean = from.reduce((t, l) => t + l.e, 0) / from.length;
  const bonding = name.includes('*') ? false : /[σπ]/.test(name) ? true : mo.e <= mean;
  return { ao, sym, bonding };
}

type Piece = Omit<Shape, 'id'>;
const untag = (s: Piece): Piece => { const { orb: _o, ...rest } = s; return rest; };

/** One atomic orbital's picture centred on `at` (an s sphere, or a p orbital lying along the bond), lobes `u` long. */
function aoPicture(kind: 's' | 'p', at: Vec, u: number, look: OrbitalLook): Piece[] {
  const spec: OrbitalSpec = { kind, look, angle: 90, size: u };
  return orbitalShapes(spec, at).map(untag);
}

/** A molecular orbital's picture centred on `at`: its two atomic orbitals, in phase or out of phase. */
function moPicture(mix: MoMix, at: Vec, u: number, look: OrbitalLook): Piece[] {
  const one = (kind: 's' | 'p', c: Vec, angle: number, flip = false) => orbitalShapes({ kind, look, angle, size: u, ...(flip ? { flip } : {}) }, c).map(untag);
  if (mix.ao === 's') {
    if (mix.bonding) {
      // the two spheres run together into one
      const rx = u * 0.8, ry = u * 0.42;
      return [{ ...one('s', at, 0)[0], x1: at.x - rx, y1: at.y - ry, x2: at.x + rx, y2: at.y + ry }];
    }
    const d = u * 0.5;
    return [...one('s', { x: at.x - d, y: at.y }, 0), ...one('s', { x: at.x + d, y: at.y }, 0, true)];
  }
  if (mix.sym === 'σ') {
    // end on: the shaded lobes meet in the middle when in phase
    const d = u * 0.92;
    return [...one('p', { x: at.x - d, y: at.y }, 90), ...one('p', { x: at.x + d, y: at.y }, mix.bonding ? 270 : 90)];
  }
  // side by side: the shaded lobes both up when in phase
  const d = u * 0.36;
  return [...one('p', { x: at.x - d, y: at.y }, 0), ...one('p', { x: at.x + d, y: at.y }, mix.bonding ? 0 : 180)];
}

/** A picture's half width and half height. */
function half(kind: MoMix | 's' | 'p', u: number): { w: number; h: number } {
  if (kind === 's') return { w: u * 0.42, h: u * 0.42 };
  if (kind === 'p') return { w: u, h: u * 0.31 };
  if (kind.ao === 's') return kind.bonding ? { w: u * 0.8, h: u * 0.42 } : { w: u * 0.92, h: u * 0.42 };
  return kind.sym === 'σ' ? { w: u * 1.92, h: u * 0.31 } : { w: u * 0.67, h: u };
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

  // the dashed correlation lines first, so the levels sit on top of them
  for (const mo of levels.filter((l) => l.column === 'middle')) {
    const [m1, m2] = span(mo);
    for (const ao of sources(levels, mo)) {
      const [a1, a2] = span(ao);
      if (ao.column === 'left') line(a2, y(ao.e), m1, y(mo.e), { dashed: true, lineWidth: lw * 0.7 });
      else line(a1, y(ao.e), m2, y(mo.e), { dashed: true, lineWidth: lw * 0.7 });
    }
  }
  const small = spec.arrowSize && spec.arrowSize > 0 ? spec.arrowSize : Math.round(doc.style.captionSize * 0.9 * 10) / 10;
  /** Where each label ended up, for the pictures beside them. */
  const labelBox = new Map<MoLevel, Rect>();
  for (const l of levels) {
    const [x0] = span(l), yy = y(l.e);
    const fill = hund(l.n, l.electrons);
    fill.forEach((e, i) => {
      const xa = x0 + i * (one + gapX);
      line(xa, yy, xa + one, yy, { bold: true });
      // ↑ and ↓ over the line: one electron sits in the middle, a pair side by side
      const arrows = e === 2 ? '↑↓' : e === 1 ? '↑' : '';
      if (arrows) caption(arrows, { x: xa + one / 2, y: yy + lw * 2 }, 'above', { runs: [{ text: arrows, size: small }] });
    });
    const [, x1] = span(l);
    if (l.label.trim()) {
      if (l.column === 'left') labelBox.set(l, caption(l.label.trim(), { x: x0 - gap, y: yy }, 'left'));
      else labelBox.set(l, caption(l.label.trim(), { x: x1 + gap, y: yy }, 'right'));
    }
  }
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
        const kind = /p/i.test(moPlain(l.label)) ? 'p' : 's';
        const hw = half(kind, u).w, b = labelBox.get(l), [s0, s1] = span(l);
        const x = col === 'left' ? (b ? b.x1 : s0) - gap - hw : (b ? b.x2 : s1) + gap + hw;
        leftmost = Math.min(leftmost, x - hw);
        put(aoPicture(kind, { x, y: y(l.e) }, u, look));
      }
    };
    side('left');
    side('right');
    // molecular orbitals: beside their names, highest first, pushed down where they would overlap
    const mos = levels.filter((l) => l.column === 'middle').map((l) => ({ l, mix: mixOf(levels, l) })).filter((x): x is { l: MoLevel; mix: MoMix } => !!x.mix)
      .sort((a, b) => b.l.e - a.l.e);
    let floor = -Infinity;
    for (const { l, mix } of mos) {
      const hh = half(mix, u), b = labelBox.get(l), [, s1] = span(l);
      const cy = Math.max(y(l.e), floor + hh.h + lw * 2);
      floor = cy + hh.h;
      put(moPicture(mix, { x: (b ? b.x2 : s1) + gap + hh.w, y: cy }, u, look));
    }
  }
}
