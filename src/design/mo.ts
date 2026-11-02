// Molecular orbital diagrams (Chemistry ▸ Orbitals ▸ MO Diagram…): the atomic orbitals of two
// atoms (or fragments) at the sides, the molecular orbitals they make in the middle, each level
// drawn as one short line per orbital (two or three side by side when degenerate), filled with
// ↑ and ↓ electrons by Hund's rule, and joined to the atomic orbitals they come from by dashed
// lines. Energies only set the order and spacing; they are not to scale unless typed so.

import type { Caption, Doc, Shape } from '../model';
import type { Rect, Vec } from '../geom';
import type { Measure } from '../editor/arrange';
import { chemRuns } from '../text/chemtext';

export type MoColumn = 'left' | 'middle' | 'right';

export interface MoLevel {
  column: MoColumn;
  /** The orbital's name (1s, 2p, σ, π*, HOMO…); _ and ^ for sub- and superscripts. */
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
}

export interface MoPreset { id: string; name: string; spec: MoSpec }

const lv = (column: MoColumn, label: string, e: number, n: number, electrons: number, from?: string): MoLevel => ({ column, label, e, n, electrons, ...(from ? { from } : {}) });

/** Starting points: qualitative orders from first-year MO theory; energies are only for spacing. */
export const MO_PRESETS: MoPreset[] = [
  { id: 'h2', name: 'H₂ (two 1s orbitals)', spec: { titles: ['H', 'H_2', 'H'], axis: true, levels: [
    lv('left', '1s', 0, 1, 1), lv('right', '1s', 0, 1, 1), lv('middle', 'σ_{1s}', -1.2, 1, 2, '1s'), lv('middle', 'σ*_{1s}', 1.4, 1, 0, '1s'),
  ] } },
  { id: 'n2', name: 'N₂ (s–p mixing: π below σ2p)', spec: { titles: ['N', 'N_2', 'N'], axis: true, levels: [
    lv('left', '2s', -3, 1, 2), lv('left', '2p', 0, 3, 3), lv('right', '2s', -3, 1, 2), lv('right', '2p', 0, 3, 3),
    lv('middle', 'σ_{2s}', -4, 1, 2, '2s'), lv('middle', 'σ*_{2s}', -2, 1, 2, '2s'), lv('middle', 'π_{2p}', -1.2, 2, 4, '2p'),
    lv('middle', 'σ_{2p}', -0.7, 1, 2, '2p'), lv('middle', 'π*_{2p}', 1, 2, 0, '2p'), lv('middle', 'σ*_{2p}', 2, 1, 0, '2p'),
  ] } },
  { id: 'o2', name: 'O₂ (σ2p below π; two unpaired electrons)', spec: { titles: ['O', 'O_2', 'O'], axis: true, levels: [
    lv('left', '2s', -3, 1, 2), lv('left', '2p', 0, 3, 4), lv('right', '2s', -3, 1, 2), lv('right', '2p', 0, 3, 4),
    lv('middle', 'σ_{2s}', -4, 1, 2, '2s'), lv('middle', 'σ*_{2s}', -2, 1, 2, '2s'), lv('middle', 'σ_{2p}', -1.4, 1, 2, '2p'),
    lv('middle', 'π_{2p}', -0.8, 2, 4, '2p'), lv('middle', 'π*_{2p}', 1, 2, 2, '2p'), lv('middle', 'σ*_{2p}', 2, 1, 0, '2p'),
  ] } },
  { id: 'co', name: 'CO (C higher, O lower)', spec: { titles: ['C', 'CO', 'O'], axis: true, levels: [
    lv('left', '2s', -2.4, 1, 2), lv('left', '2p', 0.4, 3, 2), lv('right', '2s', -4, 1, 2), lv('right', '2p', -1, 3, 4),
    lv('middle', '1σ', -4.6, 1, 2, '2s'), lv('middle', '2σ*', -2.6, 1, 2, '2s'), lv('middle', '1π', -1.6, 2, 4, '2p'),
    lv('middle', '3σ (HOMO)', -0.6, 1, 2, '2p'), lv('middle', '2π* (LUMO)', 1, 2, 0, '2p'), lv('middle', '4σ*', 2.4, 1, 0, '2p'),
  ] } },
  { id: 'ethylene', name: 'Ethylene π bond (two p orbitals)', spec: { titles: ['C', 'C=C π', 'C'], axis: true, levels: [
    lv('left', '2p', 0, 1, 1), lv('right', '2p', 0, 1, 1), lv('middle', 'π (HOMO)', -1, 1, 2, '2p'), lv('middle', 'π* (LUMO)', 1, 1, 0, '2p'),
  ] } },
  { id: 'blank', name: 'Blank (two orbitals making two)', spec: { titles: ['A', 'AB', 'B'], axis: true, levels: [
    lv('left', 'φ_A', 0.4, 1, 1), lv('right', 'φ_B', -0.4, 1, 1), lv('middle', 'ψ_1', -1.2, 1, 2, 'φ_A, φ_B'), lv('middle', 'ψ_2', 1.4, 1, 0, 'φ_A, φ_B'),
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
  return levels.filter((l) => l.column !== 'middle' && names.includes(l.label.trim()));
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
  const colX: Record<MoColumn, number> = { left: at.x + w * 0.14, middle: at.x + w * 0.5, right: at.x + w * 0.86 };
  const one = Math.min(w * 0.09, 1.3 * L), gapX = one * 0.3;
  const gap = 0.25 * L;
  /** A level's ends (from the first orbital's left to the last one's right). */
  const span = (l: MoLevel): [number, number] => {
    const k = hund(l.n, 0).length, total = k * one + (k - 1) * gapX;
    return [colX[l.column] - total / 2, colX[l.column] + total / 2];
  };
  const caption = (text: string, target: Vec, anchor: 'above' | 'below' | 'left' | 'right', extra: Partial<Caption> = {}): Rect => {
    const c = doc.addCaption({ x: 0, y: 0, runs: chemRuns(text), justify: 'left', chem: false, ...extra });
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
  const small = Math.round(doc.style.captionSize * 0.9 * 10) / 10;
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
      if (l.column === 'left') caption(l.label.trim(), { x: x0 - gap, y: yy }, 'left');
      else caption(l.label.trim(), { x: x1 + gap, y: yy }, 'right');
    }
  }
  const bottom = at.y + h + 1.2 * L;
  (['left', 'middle', 'right'] as const).forEach((c, i) => { if (spec.titles[i]?.trim()) caption(spec.titles[i].trim(), { x: colX[c], y: bottom }, 'below'); });
  if (spec.axis) {
    const ax = at.x - 0.4 * L;
    out.arrows.push(doc.addArrow({
      tail: { x: ax, y: at.y + h + 0.6 * L }, head: { x: ax, y: at.y - 0.8 * L }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid',
      noGo: false, equilibrium: false, sweep: 0, headLength: lw * 8, headWidth: lw * 2.2,
    }).id);
    caption('E', { x: ax - gap, y: at.y - 0.4 * L }, 'left', { runs: [{ text: 'E', italic: true }] });
  }
  return out;
}
