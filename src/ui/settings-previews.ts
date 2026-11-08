// Pictures in the Settings window of what a page's settings will look like: a sample drawing in
// the drawing style being edited (two molecules and an arrow in its sizes), the dot grid and tint,
// the page grid's boundaries and fixed edges, Reading Mode's colours, and small ones beside a
// single choice (bond ends, charges). Each is drawn again as the settings change.

import { newTextLook } from '../chem/arrow-text';
import { labelPieces, styleLabel, type AlkylLook } from '../chem/labels';
import { Doc } from '../model';
import type { Vec } from '../geom';
import type { DocStyle } from '../style';
import { freeRing, placeRing, sprout } from '../chem/chemgeom';
import { recordPicture, pictureCanvas } from '../render/picture';
import { Renderer, type WarnLook } from '../render/renderer';
import { StructureChecks } from '../chem/warnings';
import { applySchemePlan, planCleanUp, schemePrefs, spacing, withSchemePrefs, type SchemePrefs } from '../chem/scheme-layout';
import { canvasWithLoupe, type Span } from './gap-loupe';
import type { Measure } from '../editor/arrange';
import { applyCharge } from '../editor/editor';
import { drawCursorAids, hintLines, type CursorAidPrefs } from '../editor/cursor-aids';
import { arrowGaps, pushArrow, SMALL_HEAD, symbolSpot } from '../chem/mechanism';
import { writeTerminalMethyls, type MethylStyle } from '../chem/hydrogens';
import { plainMeasure } from '../chem/reaction';

const noCanvas = { getContext: () => null } as unknown as HTMLCanvasElement;
import { darkMatrix, type DarkPalette } from '../dark-page';
import type { PageLook } from '../page-grid';
import { SHADE_ALPHA } from '../page-grid';
import { GRID_ALPHA, GRID_SPACING, TINT_ALPHA, type OrientPrefs } from '../orientation-prefs';

const dpr = () => (typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1);

/** A canvas `w` × `h` CSS pixels, sharp on the screen in use, with its context scaled to CSS pixels. */
function sized(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  const k = dpr();
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(k, 0, 0, k, 0, 0);
  return { canvas, ctx };
}

/**
 * The sample drawing: a Boc-protected amine on a benzene ring (a wedge, a hashed bond, double
 * bonds and labels) taken off with TFA, to the ammonium ion. The two compound numbers, and a
 * reaction arrow with text above and below it, laid out by Clean Up Reaction in the scheme
 * settings `scheme` (the arrow fitted to its text, the gaps, how the lines of text line up).
 */
export function sampleDrawing(style: DocStyle, scheme: Partial<SchemePrefs> = {}): Doc {
  const doc = new Doc();
  doc.style = { ...style };
  const L = style.bondLength;
  /** The 1-phenylethylamine part both share: ring, then C with a hashed methyl and a wedged N. */
  const amine = (x: number): number => {
    const ring = placeRing(doc, freeRing({ x, y: 0 }, 6, L), { aromatic: true });
    const c = sprout(doc, doc.atoms.get(ring[1])!.id);
    doc.updateAtom(sprout(doc, c.id, 1, 'hashWedge').id, { label: null });
    const n = sprout(doc, c.id, 1, 'wedge');
    doc.updateAtom(n.id, { z: 7 });
    return n.id;
  };
  const box = (from: number) => {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const a of doc.atoms.values()) if (a.id >= from) { x1 = Math.min(x1, a.x); x2 = Math.max(x2, a.x); y1 = Math.min(y1, a.y); y2 = Math.max(y2, a.y); }
    return { x1, y1, x2, y2 };
  };
  const number = (b: { x1: number; x2: number; y2: number }, text: string) =>
    doc.addCaption({ x: (b.x1 + b.x2) / 2 - style.captionSize * 0.3, y: b.y2 + L * 1.1, runs: [{ text, bold: true }], justify: 'left' });
  doc.bulk(() => {
    // the carbamate
    const n = amine(0);
    const co = sprout(doc, n);
    sprout(doc, co.id, 2, 'solid', 8);
    const o = sprout(doc, co.id, 1, 'solid', 8);
    doc.updateAtom(o.id, { label: null });
    doc.updateAtom(sprout(doc, o.id).id, { label: 'tBu' });
    const one = box(0);
    number(one, '1');
    // the arrow, roughly placed (Clean Up puts it right), with its text
    const y = (one.y1 + one.y2) / 2;
    const lw = style.arrowWidth ?? style.lineWidth;
    const x0 = one.x2 + L;
    doc.addArrow({
      tail: { x: x0, y }, head: { x: x0 + L * 4.6, y }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0,
      headLength: style.arrowHeadLength ?? lw * 10, headWidth: style.arrowHeadWidth ?? lw * 2.5, ...(style.arrowWidth !== undefined ? { lineWidth: style.arrowWidth } : {}),
    });
    const look = newTextLook(doc);
    doc.addCaption({ x: x0 + L * 0.3, y: y - L * 0.3, runs: [{ text: 'TFA', ...look }], justify: 'left' });
    doc.addCaption({ x: x0 + L * 0.3, y: y + L * 0.75, runs: [{ text: 'CH' }, { text: '2', sub: true }, { text: 'Cl' }, { text: '2', sub: true }, { text: ', 23 °C, 1 h' }].map((r) => ({ ...r, ...look })), justify: 'left' });
    // the ammonium ion after it
    const first = Math.max(...doc.atoms.keys()) + 1;
    const nh = amine(x0 + L * 6.6);
    doc.updateAtom(nh, { charge: 1 });
    number(box(first), '2');
  });
  laidOut(doc, scheme);
  return doc;
}

/** A sample scheme laid out as the scheme settings say, by the same Clean Up Reaction the canvas uses. */
function laidOut(doc: Doc, scheme: Partial<SchemePrefs>): void {
  try {
    const r = new Renderer(noCanvas, noCanvas);
    r.showWarnings = false;
    const m: Measure = { atomBoxes: (a) => r.atomInfo(doc, a).boxes, captionBox: (c) => r.captionBox(c) };
    withSchemePrefs(scheme, () => {
      const plan = planCleanUp(doc, m);
      if (plan) applySchemePlan(doc, m, plan);
    });
  } catch { /* (no text measuring here: left roughly placed) */ }
}

/**
 * A generic scheme for Settings ▸ Schemes: two starting materials (a + between them), an arrow with
 * a catalyst above and conditions below, and the product, laid out by Clean Up Reaction in the
 * scheme settings `scheme`, `w` CSS pixels wide.
 */
export function schemePreview(style: DocStyle, scheme: Partial<SchemePrefs>, w = 460, /** The setting being hovered or typed in: its distance shown in a magnifier. */ focus?: string): HTMLElement {
  const doc = new Doc();
  // (the settings being edited, not a drawing style's own scheme spacing)
  doc.style = { ...style, scheme: undefined };
  const L = style.bondLength;
  /** A benzene ring at x with one group on it, written as `label`. */
  const aryl = (x: number, label: string) => {
    const ring = placeRing(doc, freeRing({ x, y: 0 }, 6, L), { aromatic: true });
    doc.updateAtom(sprout(doc, ring[1]).id, { label });
  };
  doc.bulk(() => {
    aryl(0, 'Br');
    doc.addCaption({ x: L * 2.2, y: L * 0.2, runs: [{ text: '+', ...newTextLook(doc) }], justify: 'left' });
    aryl(L * 4, 'B(OH)2');
    const x0 = L * 7.5, lw = style.arrowWidth ?? style.lineWidth;
    doc.addArrow({
      tail: { x: x0, y: 0 }, head: { x: x0 + L * 4, y: 0 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0,
      headLength: style.arrowHeadLength ?? lw * 10, headWidth: style.arrowHeadWidth ?? lw * 2.5, ...(style.arrowWidth !== undefined ? { lineWidth: style.arrowWidth } : {}),
    });
    const look = newTextLook(doc);
    doc.addCaption({ x: x0 + L * 0.3, y: -L * 0.3, runs: [{ text: 'Pd(PPh' }, { text: '3', sub: true }, { text: ')' }, { text: '4', sub: true }].map((r) => ({ ...r, ...look })), justify: 'left' });
    doc.addCaption({ x: x0 + L * 0.3, y: L * 0.75, runs: [{ text: 'K' }, { text: '2', sub: true }, { text: 'CO' }, { text: '3', sub: true }, { text: ', 80 °C' }].map((r) => ({ ...r, ...look })), justify: 'left' });
    aryl(x0 + L * 6, 'Ph');
  });
  laidOut(doc, scheme);
  const span = focus ? schemeSpan(doc, focus, scheme) : null;
  // (the magnifier beside the drawing, so the page below doesn't move)
  return canvasWithLoupe(doc, w, Math.round(w * 0.22), 6, 3, span, { band: 'right' });
}

/** A drawing on a canvas, fitted into `w` × `h` CSS pixels on white (or not at all where the browser can't draw). */
export function drawingCanvas(doc: Doc, w: number, h: number, pad = 10, maxScale = 3, setup?: (r: Renderer) => void): HTMLCanvasElement {
  const pic = recordPicture(doc, 2, setup);
  const out = sized(w, h);
  if (!pic || !out.ctx) return out.canvas;
  const pw = pic.box.x2 - pic.box.x1, ph = pic.box.y2 - pic.box.y1;
  const fit = Math.min((w - 2 * pad) / pw, (h - 2 * pad) / ph, maxScale);
  const { canvas: src } = pictureCanvas(doc, pic, fit * dpr() * 72, setup);
  const ctx = out.ctx;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const dw = pw * fit, dh = ph * fit;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return out.canvas;
}

/** Drawing Style: a sample drawn in it, `w` CSS pixels wide (the wide preview column). */
export function stylePreview(style: DocStyle, scheme: Partial<SchemePrefs> = {}, w = 352, /** The box being hovered or typed in: its distance shown in a magnifier. */ focus?: string): HTMLElement {
  const box = document.createElement('div');
  const sch = { ...style.scheme, ...scheme };
  const doc = sampleDrawing(style, sch);
  const span = focus ? schemeSpan(doc, focus, sch) ?? structureSpan(doc, focus) : null;
  box.append(canvasWithLoupe(doc, w, Math.round(w * 0.42), 6, 3, null));
  // a close-up under it, with the magnifier in it (so the drawing above stays put): of the arrow
  // and its text, where its gaps show, or of the part of a structure a structure setting measures
  const arrowView = arrowCloseUp(doc);
  const pts = span ? [span.from, span.to, ...(span.anchors ?? [])] : [];
  const inside = (v: Box) => pts.every((q) => q.x >= v.x1 && q.x <= v.x2 && q.y >= v.y1 && q.y <= v.y2);
  const ch = Math.round(w * 0.36);
  let view = arrowView, inline = false;
  if (span && (!view || !inside(view))) {
    // close up on what is measured (a structure setting), enlarged enough to see a line width,
    // with the dimension drawn on it
    const x1 = Math.min(...pts.map((q) => q.x)), x2 = Math.max(...pts.map((q) => q.x));
    const y1 = Math.min(...pts.map((q) => q.y)), y2 = Math.max(...pts.map((q) => q.y));
    const vw = Math.max(1.6 * style.bondLength, (x2 - x1) * 1.6, ((y2 - y1) * 1.6 * w) / ch);
    const vh = (vw * ch) / w;
    view = { x1: (x1 + x2) / 2 - vw / 2, y1: (y1 + y2) / 2 - vh / 2, x2: (x1 + x2) / 2 + vw / 2, y2: (y1 + y2) / 2 + vh / 2 };
    inline = true;
  }
  if (view) {
    const crop = canvasWithLoupe(doc, w, ch, 0, 40, span, { view, inline, band: 'none' });
    crop.classList.add('sw-zoom');
    box.append(crop);
  }
  const p = document.createElement('p');
  p.className = 'muted sw-cap';
  p.textContent = `Bond ${+style.bondLength.toFixed(2)} pt · line ${+style.lineWidth.toFixed(2)} pt · ${style.labelFont} ${style.labelSize} pt`;
  box.append(p);
  return box;
}

type Box = { x1: number; y1: number; x2: number; y2: number };

/**
 * The part of a sample drawing round its first reaction arrow: the arrow, its text above and
 * below (however far out the gaps put it) and a little of the structures either side.
 */
function arrowCloseUp(doc: Doc): Box | null {
  const r = [...doc.arrows.values()][0];
  if (!r) return null;
  const L = doc.style.bondLength;
  const m = measureOf(doc);
  const x1 = Math.min(r.tail.x, r.head.x), x2 = Math.max(r.tail.x, r.head.x), y = r.tail.y;
  let top = y - 1.3 * L, bottom = y + 1.3 * L;
  for (const c of doc.captions.values()) {
    const b = m.captionBox(c);
    if (b.x2 < x1 - 1 || b.x1 > x2 + 1) continue;
    top = Math.min(top, b.y1 - 0.3 * L);
    bottom = Math.max(bottom, b.y2 + 0.3 * L);
  }
  // (level about the arrow, so it stays in the middle)
  const half = Math.max(y - top, bottom - y);
  return { x1: x1 - 1.6 * L, y1: y - half, x2: x2 + 1.6 * L, y2: y + half };
}

/** The structure distances Drawing Style sets, as they show in its sample drawing. */
export const STRUCTURE_SPANS = ['bondLength', 'lineWidth', 'boldWidth', 'marginWidth', 'hashSpacing', 'bondSpacing'] as const;

/**
 * Where a structure setting shows in sampleDrawing's first structure: a bond's length and line
 * width, the width of a wedge's wide end (1.5 bold widths), the clearance a bond keeps from a
 * label, the spacing of a hashed wedge's hashes and the distance between a double bond's lines.
 */
export function structureSpan(doc: Doc, key: string): Span | null {
  if (!(STRUCTURE_SPANS as readonly string[]).includes(key)) return null;
  let r: Renderer;
  try { r = new Renderer(noCanvas, noCanvas); r.showWarnings = false; } catch { return null; }
  const st = doc.style;
  const pt = (v: number) => `${+v.toFixed(2)} pt`;
  const bonds = [...doc.bonds.values()];
  const atom = (id: number) => doc.atoms.get(id)!;
  const dirOf = (s: Vec, e: Vec) => { const l = Math.hypot(e.x - s.x, e.y - s.y) || 1; return { x: (e.x - s.x) / l, y: (e.y - s.y) / l }; };
  const at = (p: Vec, d: Vec, t: number): Vec => ({ x: p.x + d.x * t, y: p.y + d.y * t });
  // the stereocentre: the atom with the hashed and the wedged bond
  const hashed = bonds.find((b) => b.display === 'hashWedge');
  const wedge = bonds.find((b) => b.display === 'wedge');
  switch (key as (typeof STRUCTURE_SPANS)[number]) {
    case 'bondLength':
    case 'lineWidth': {
      // the plain bond from the stereocentre to the ring
      const c = hashed?.a1;
      const b = bonds.find((x) => c !== undefined && (x.a1 === c || x.a2 === c) && (x.display ?? 'solid') === 'solid' && x.order === 1);
      if (!b) return null;
      const p = atom(b.a1), q = atom(b.a2), d = dirOf(p, q), n = { x: -d.y, y: d.x };
      if (key === 'bondLength') return { from: p, to: q, label: pt(Math.hypot(q.x - p.x, q.y - p.y)) };
      const mid = at(p, d, Math.hypot(q.x - p.x, q.y - p.y) / 2), lw = st.lineWidth;
      return { from: at(mid, n, -lw / 2), to: at(mid, n, lw / 2), label: pt(lw), side: d };
    }
    case 'boldWidth': {
      if (!wedge) return null;
      // across the wide end, where the wedge stops at its atom (or its label)
      const [s, e] = r.bondEnds(doc, atom(wedge.a1), atom(wedge.a2));
      const d = dirOf(s, e), n = { x: -d.y, y: d.x }, he = (1.5 * st.boldWidth) / 2;
      return { from: at(e, n, -he), to: at(e, n, he), label: `1.5 × ${pt(st.boldWidth)}`, side: { x: -d.x, y: -d.y } };
    }
    case 'hashSpacing': {
      if (!hashed) return null;
      // the last two hashes, at the wide end, placed as the renderer places them
      const p = atom(hashed.a1), q = atom(hashed.a2);
      const [s, e] = r.bondEnds(doc, p, q);
      const l = Math.hypot(e.x - s.x, e.y - s.y), d = dirOf(s, e), n = { x: -d.y, y: d.x };
      const lw = st.lineWidth, hs = st.hashSpacing, w = (1.5 * st.boldWidth) / 2;
      const short = (a: { id: number; x: number; y: number }, end: Vec) => (doc.degree(a.id) > 1 && Math.hypot(end.x - a.x, end.y - a.y) < 1e-6 ? hs : 0);
      const h0 = Math.min(short(p, s), l / 3), h1 = Math.min(short(q, e), l / 3);
      const run = Math.max(0, l - h0 - h1 - lw);
      const k = Math.max(2, Math.floor(run / hs) + 1);
      const hash = (i: number) => { const t = h0 + lw / 2 + (run * i) / (k - 1); return { c: at(s, d, t), hw: lw / 2 + (w - lw / 2) * (t / l) }; };
      const a = hash(k - 2), b = hash(k - 1);
      return { from: at(a.c, n, b.hw + lw), to: at(b.c, n, b.hw + lw), label: pt(hs), side: n, anchors: [at(a.c, n, a.hw), at(b.c, n, b.hw)] };
    }
    case 'bondSpacing': {
      // the C=O: across its two lines, at the carbon's end
      const b = bonds.find((x) => x.order === 2 && (atom(x.a1).z === 8 || atom(x.a2).z === 8));
      if (!b) return null;
      const oFirst = atom(b.a1).z === 8;
      const p = atom(b.a1), q = atom(b.a2), n = (() => { const d = dirOf(p, q); return { x: -d.y, y: d.x }; })();
      const gap = (st.bondSpacing / 100) * st.bondLength, side = r.doubleSide(doc, b);
      const [o1, o2] = side ? [0, side * gap] : [-gap / 2, gap / 2];
      const [s, e] = r.bondEnds(doc, p, q);
      const end = oFirst ? e : s, away = oFirst ? dirOf(s, e) : dirOf(e, s);
      return { from: at(end, n, o1), to: at(end, n, o2), label: `${+st.bondSpacing.toFixed(1)}% · ${pt(gap)}`, side: away };
    }
    case 'marginWidth': {
      // the bond into the carbamate's N, from where it stops to the letter
      const nAtom = [...doc.atoms.values()].find((a) => a.z === 7 && !a.charge);
      const b = nAtom && bonds.find((x) => (x.a1 === nAtom.id || x.a2 === nAtom.id) && (x.display ?? 'solid') === 'solid' && x.order === 1);
      if (!nAtom || !b) return null;
      const other = atom(b.a1 === nAtom.id ? b.a2 : b.a1);
      const [, e] = r.bondEnds(doc, other, nAtom);
      const boxes = r.atomInfo(doc, nAtom).boxes;
      if (!boxes.length) return null;
      // the side of the label's box the bond stops at, and the letter that far inside it
      let best = { dist: Infinity, n: { x: 0, y: 0 } };
      for (const bx of boxes) {
        for (const [dist, nn] of [[Math.abs(e.x - bx.x1), { x: -1, y: 0 }], [Math.abs(e.x - bx.x2), { x: 1, y: 0 }], [Math.abs(e.y - bx.y1), { x: 0, y: -1 }], [Math.abs(e.y - bx.y2), { x: 0, y: 1 }]] as const) {
          if (dist < best.dist) best = { dist, n: nn };
        }
      }
      const mw = st.marginWidth, inward = { x: -best.n.x, y: -best.n.y };
      return { from: e, to: at(e, inward, mw), label: pt(mw), side: { x: best.n.y, y: -best.n.x } };
    }
  }
}

/** The dot grid and the tint beyond the drawing (Settings ▸ Navigation), at 100 %. */
export function navigationPreview(o: Pick<OrientPrefs, 'dotGrid' | 'gridSpacing' | 'gridStrength' | 'tint' | 'tintStrength'>, dark = false): HTMLElement {
  const W = 232, H = 170;
  const { canvas, ctx } = sized(W, H);
  if (!ctx) return canvas;
  ctx.fillStyle = dark ? '#1e1e1e' : '#fff';
  ctx.fillRect(0, 0, W, H);
  // what is drawn: a small ring in the middle; the tint covers the space beyond it
  const drawn = { x1: 70, y1: 45, x2: 165, y2: 125 };
  if (o.tint) {
    ctx.fillStyle = `rgba(47, 111, 223, ${TINT_ALPHA[o.tintStrength] * (dark ? 2 : 1)})`;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(drawn.x1, drawn.y1, drawn.x2 - drawn.x1, drawn.y2 - drawn.y1);
    ctx.fill('evenodd');
  }
  if (o.dotGrid) {
    const step = GRID_SPACING[o.gridSpacing] * (96 / 72) * 0.5;
    ctx.fillStyle = dark ? `rgba(255,255,255,${GRID_ALPHA[o.gridStrength]})` : `rgba(60, 72, 90, ${GRID_ALPHA[o.gridStrength]})`;
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.strokeStyle = dark ? '#ddd' : '#111';
  ctx.lineWidth = 1.4;
  const cx = 117, cy = 85, r = 26;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) { const t = Math.PI / 6 + (i * Math.PI) / 3; const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke();
  const wrap = document.createElement('div');
  wrap.append(canvas);
  const p = document.createElement('p');
  p.className = 'muted sw-cap';
  p.textContent = 'At 50 % zoom; the dots spread out as you zoom out.';
  wrap.append(p);
  return wrap;
}

/** Two pages across and two down, with their boundaries, a hatched fixed edge on the left and top, and empty pages shaded (Settings ▸ Page Grid). */
export function pageGridPreview(o: PageLook): HTMLElement {
  const W = 232, H = 200;
  const { canvas, ctx } = sized(W, H);
  if (!ctx) return canvas;
  // the space round the pages
  ctx.fillStyle = '#e9ebef';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(0,0,0,${SHADE_ALPHA[o.outsideShade]})`;
  ctx.fillRect(0, 0, W, H);
  const x0 = 26, y0 = 22, pw = 92, ph = 78;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0, y0, pw * 2, ph * 2);
  // empty pages (all but the first)
  ctx.fillStyle = `rgba(0,0,0,${SHADE_ALPHA[o.emptyShade]})`;
  ctx.fillRect(x0 + pw, y0, pw, ph);
  ctx.fillRect(x0, y0 + ph, pw * 2, ph);
  // something drawn on the first page
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) { const t = Math.PI / 6 + (i * Math.PI) / 3; const x = x0 + 46 + 18 * Math.cos(t), y = y0 + 40 + 18 * Math.sin(t); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.stroke();
  // page boundaries
  if (o.grid) {
    ctx.save();
    ctx.strokeStyle = o.lineColour;
    ctx.globalAlpha = o.lineOpacity;
    ctx.lineWidth = o.lineWidth;
    ctx.setLineDash(o.lineStyle === 'dashed' ? [6, 4] : o.lineStyle === 'dotted' ? [1.2, 3] : []);
    ctx.beginPath();
    ctx.moveTo(x0 + pw, y0); ctx.lineTo(x0 + pw, y0 + 2 * ph);
    ctx.moveTo(x0, y0 + ph); ctx.lineTo(x0 + 2 * pw, y0 + ph);
    ctx.moveTo(x0 + 2 * pw, y0); ctx.lineTo(x0 + 2 * pw, y0 + 2 * ph); ctx.lineTo(x0, y0 + 2 * ph);
    ctx.stroke();
    ctx.restore();
    if (o.ghost) {
      ctx.save();
      ctx.strokeStyle = o.lineColour;
      ctx.globalAlpha = o.lineOpacity * 0.4;
      ctx.setLineDash([3, 4]);
      ctx.strokeRect(x0 + 2 * pw, y0, pw, ph * 2);
      ctx.restore();
    }
  }
  // fixed edges on the left and top
  ctx.save();
  ctx.strokeStyle = '#3b4250';
  ctx.lineWidth = o.wallWidth;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + 2 * ph); ctx.lineTo(x0, y0); ctx.lineTo(x0 + 2 * pw, y0);
  ctx.stroke();
  if (o.wallStyle === 'hatch') {
    ctx.lineWidth = o.hatchWidth;
    const a = (o.hatchAngle * Math.PI) / 180;
    // along the top the strokes lean out (up) at the slant; down the left they carry on round the corner, or lean the other way
    const top = { x: Math.cos(a) * o.hatchLength, y: -Math.abs(Math.sin(a)) * o.hatchLength };
    const left = o.hatchCorner === 'mirror' ? { x: top.y, y: top.x } : { x: top.y, y: -top.x };
    ctx.beginPath();
    for (let x = x0; x <= x0 + 2 * pw; x += o.hatchSpacing) { ctx.moveTo(x, y0); ctx.lineTo(x + top.x, y0 + top.y); }
    for (let y = y0; y <= y0 + 2 * ph; y += o.hatchSpacing) { ctx.moveTo(x0, y); ctx.lineTo(x0 + left.x, y + left.y); }
    ctx.stroke();
  }
  ctx.restore();
  return canvas;
}

/** The sample drawing as Reading Mode shows it in a palette (only the screen changes). */
export function readingPreview(p: DarkPalette, style: DocStyle): HTMLElement {
  const doc = sampleDrawing(style);
  // a coloured ring fill and highlight show how colours keep their hue
  const ring = [...doc.bonds.values()].slice(0, 6);
  doc.bulk(() => { for (const b of ring) doc.updateBond(b.id, { highlight: '#ffd54f' }); });
  const c = drawingCanvas(doc, 232, 200);
  const ctx = c.getContext('2d');
  if (!ctx || !c.width) return c;
  try {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const m = darkMatrix(p), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round(255 * (m[k * 5] * r + m[k * 5 + 1] * g + m[k * 5 + 2] * b + m[k * 5 + 4]))));
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* a canvas that can't be read back keeps its light look */ }
  return c;
}

/** A short bond with its free ends as round as `round` says (Settings ▸ Drawing ▸ Ends of bond lines), large enough to see. */
export function bondEndSwatch(round: number): HTMLElement {
  const { canvas, ctx } = sized(54, 20);
  if (!ctx) return canvas;
  const w = 7, x1 = 10, x2 = 44, y = 10;
  ctx.fillStyle = getComputedStyle(document.body).color || '#111';
  const r = (round * w) / 2, ext = (round * w) / 2;
  ctx.beginPath();
  ctx.roundRect(x1 - ext, y - w / 2, x2 - x1 + 2 * ext, w, Math.min(w / 2, Math.max(0, r)));
  ctx.fill();
  return canvas;
}

/** OtBu written in an alkyl look (Settings ▸ Preferences), beside the list of looks. */
export function alkylSwatch(look: AlkylLook): HTMLElement {
  const s = document.createElement('span');
  s.className = 'ask-swatch alkyl-swatch';
  const { label, marks } = styleLabel('OtBu', undefined, look);
  for (const p of labelPieces(label, false, marks)) {
    let el: HTMLElement = document.createElement(p.sub ? 'sub' : p.sup ? 'sup' : 'span');
    el.textContent = p.text;
    if (p.italic) { const i = document.createElement('i'); i.append(el); el = i; }
    s.append(el);
  }
  return s;
}

/** How the drawing's labels are measured, as the canvas measures them (or roughly, where text can't be measured here). */
function measureOf(doc: Doc): Measure {
  try {
    const r = new Renderer(noCanvas, noCanvas);
    r.showWarnings = false;
    return { atomBoxes: (a) => r.atomInfo(doc, a).boxes, captionBox: (c) => r.captionBox(c) };
  } catch { return plainMeasure(doc); }
}

/** A small drawing beside a single choice, drawn as the canvas draws it. */
function thumb(doc: Doc, w: number, h: number, scale = 1.5, setup?: (r: Renderer) => void): HTMLElement {
  // (at one scale, so each choice's picture is drawn the same size)
  const c = drawingCanvas(doc, w, h, 2, scale, setup);
  c.classList.add('ask-thumb');
  return c;
}

/** NH₄⁺ drawn with its charge as the + key puts one: in the label, or in a circle beside it (Settings ▸ Drawing). */
export function chargeSwatch(circled: boolean, style?: DocStyle): HTMLElement {
  const doc = new Doc();
  if (style) doc.style = { ...style };
  doc.bulk(() => {
    const n = doc.addAtom(0, 0, 7);
    applyCharge(doc, n.id, 1, circled, (a, size) => symbolSpot(doc, measureOf(doc), a.id, [], size).at);
  });
  // (larger than the other thumbnails: the circled charge is small beside its label)
  return thumb(doc, 72, 40, 2.6);
}

/** A counterion typed as text, with the charge it gets when typed (BF₄ → BF₄⁻), or as typed (Settings ▸ Preferences). */
export function counterionSwatch(charged: boolean, style?: DocStyle): HTMLElement {
  const doc = new Doc();
  if (style) doc.style = { ...style };
  const look = newTextLook(doc);
  doc.bulk(() => doc.addCaption({ x: 0, y: 0, runs: [{ text: 'BF' }, { text: '4', sub: true }, ...(charged ? [{ text: '−', sup: true }] : [])].map((r) => ({ ...r, ...look })), justify: 'left' }));
  return thumb(doc, 60, 30, 1.6);
}

/**
 * A salt typed as two text boxes (NBu₄⁺ and BF₄⁻), outlined in grey as one group when counterions
 * are grouped with their partner (as the canvas outlines a group), or apart (Settings ▸ Preferences).
 */
export function saltSwatch(grouped: boolean, style?: DocStyle): HTMLElement {
  const doc = new Doc();
  if (style) doc.style = { ...style };
  const look = newTextLook(doc);
  const L = doc.style.bondLength;
  doc.bulk(() => {
    const cation = doc.addCaption({ x: 0, y: 0, runs: [{ text: 'NBu' }, { text: '4', sub: true }, { text: '+', sup: true }].map((r) => ({ ...r, ...look })), justify: 'left' });
    // (the anion a little way after the cation, as typed beside it)
    doc.addCaption({ x: measureOf(doc).captionBox(cation).x2 + L * 0.35, y: 0, runs: [{ text: 'BF' }, { text: '4', sub: true }, { text: '−', sup: true }].map((r) => ({ ...r, ...look })), justify: 'left' });
  });
  const W = 112, H = 30, pad = 5;
  const out = sized(W, H);
  out.canvas.classList.add('ask-thumb');
  const pic = recordPicture(doc, 2);
  if (!pic || !out.ctx) return out.canvas;
  const ctx = out.ctx;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const pw = pic.box.x2 - pic.box.x1, ph = pic.box.y2 - pic.box.y1;
  const fit = Math.min((W - 2 * pad) / pw, (H - 2 * pad) / ph, 1.6);
  const { canvas: src } = pictureCanvas(doc, pic, fit * dpr() * 72);
  const dw = pw * fit, dh = ph * fit, x = (W - dw) / 2, y = (H - dh) / 2;
  ctx.drawImage(src, x, y, dw, dh);
  if (grouped) {
    ctx.strokeStyle = 'rgba(110, 110, 110, 0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(x - 2.5, y - 2.5, dw + 5, dh + 5);
  }
  return out.canvas;
}

/** A lone single bond (which Warnings flags: it reads as ethane), marked as problems are marked on the drawing (Settings ▸ Preferences). */
export function problemSwatch(look: WarnLook, style?: DocStyle): HTMLElement {
  const doc = new Doc();
  if (style) doc.style = { ...style };
  const L = doc.style.bondLength;
  // (watching from the start, so the checks see the atoms come)
  const checks = new StructureChecks(doc);
  doc.bulk(() => {
    const a = doc.addAtom(0, 0), b = doc.addAtom(L * 0.866, -L / 2);
    doc.addBond(a.id, b.id);
  });
  checks.update();
  return thumb(doc, 54, 30, 1.5, (r) => { r.showWarnings = true; r.checks = checks; r.warnLook = look; });
}

/** A short chain whose end is written as the terminal methyls will be (Me or CH₃), as Show Terminal Methyls writes it. */
export function methylSwatch(how: MethylStyle, style?: DocStyle): HTMLElement {
  const doc = new Doc();
  if (style) doc.style = { ...style };
  const L = doc.style.bondLength;
  doc.bulk(() => {
    const a = doc.addAtom(0, 0), b = doc.addAtom(L * 0.866, -L / 2), c = doc.addAtom(L * 1.732, 0);
    doc.addBond(a.id, b.id);
    doc.addBond(b.id, c.id);
    writeTerminalMethyls(doc, [c.id], how);
  });
  return thumb(doc, 64, 26);
}

/** The angle readout and a key's hint beside the pointer, as they look while drawing (Settings ▸ Drawing). */
export function cursorAidSwatch(look: CursorAidPrefs['look']): HTMLElement {
  const W = 84, H = 30;
  const { canvas, ctx } = sized(W, H);
  if (!ctx) return canvas;
  canvas.classList.add('ask-thumb');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const px = 0.8;
  drawCursorAids(ctx, { x: 6 - 18 * px + 5 * px, y: 2 - 24 * px + 3 * px }, px, '30°', hintLines([{ key: 'Alt', text: 'any angle', on: false }]), { dark: false, look });
  return canvas;
}

/**
 * A generic mechanism (hydroxide adding to acetone's carbonyl, the C=O's electrons going to the
 * oxygen) with its curved arrows drawn with the gaps given, in points, or the usual ones for null
 * (Settings ▸ Drawing).
 */
export function mechanismPreview(gaps: { start: number | null; end: number | null }, style?: DocStyle, w = 232, /** The gap box in use ('startGap' or 'endGap'): shown in a magnifier. */ focus?: string): HTMLElement {
  const box = document.createElement('div');
  const doc = mechanismDoc(gaps, style);
  box.append(canvasWithLoupe(doc, w, Math.round(w * 0.5), 6, 3, focus === 'startGap' || focus === 'endGap' ? mechanismSpan(doc, focus, focus === 'startGap' ? gaps.start : gaps.end) : null));
  return box;
}

/** The gap a mechanism arrow's tail ('startGap') or head ('endGap') leaves in mechanismDoc's drawing: from the label's edge to the arrow's end. */
function mechanismSpan(doc: Doc, which: 'startGap' | 'endGap', value: number | null): Span | null {
  const atoms = [...doc.atoms.values()];
  const arrows = [...doc.arrows.values()];
  const a = which === 'startGap' ? atoms.find((x) => x.charge === -1) : atoms.find((x) => x.z === 8 && !x.charge);
  const r = arrows[which === 'startGap' ? 0 : 1];
  if (!a || !r) return null;
  const end = which === 'startGap' ? r.tail : r.head;
  const edge = nearestOnBoxes(measureOf(doc).atomBoxes(a), end) ?? a;
  const measured = Math.hypot(end.x - edge.x, end.y - edge.y);
  return { from: edge, to: end, label: `${(value ?? measured).toFixed(1)} pt` };
}

/** The point of these boxes nearest p. */
function nearestOnBoxes(boxes: { x1: number; y1: number; x2: number; y2: number }[], p: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (const b of boxes) {
    const q = { x: Math.max(b.x1, Math.min(p.x, b.x2)), y: Math.max(b.y1, Math.min(p.y, b.y2)) };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/** The scheme distances a settings box sets, as they come out in a laid-out sample scheme. */
export const SCHEME_SPANS = ['structGap', 'plusGap', 'textGap', 'textGapBelow', 'lead', 'headGap', 'arrowWidth', 'headLength', 'headWidth'] as const;
export type SchemeSpanKey = (typeof SCHEME_SPANS)[number];

/**
 * Where `key` shows in a laid-out scheme (its first reaction arrow): the gap from the structures
 * before the arrow to its tail, from a structure to the + after it, from the text above to the
 * arrow, from the tail to where the text starts, from where it ends to the arrowhead, and the
 * arrow's own line width, head length and head width. Labelled with the value in use.
 */
function schemeSpan(doc: Doc, key: string, scheme: Partial<SchemePrefs>): Span | null {
  const r = [...doc.arrows.values()][0];
  if (!r || !(SCHEME_SPANS as readonly string[]).includes(key)) return null;
  const m = measureOf(doc);
  const L = doc.style.bondLength;
  const sp = spacing(L, { ...schemePrefs, ...scheme });
  const pt = (v: number) => `${+v.toFixed(1)} pt`;
  const y = r.tail.y;
  const x0 = Math.min(r.tail.x, r.head.x), x1 = Math.max(r.tail.x, r.head.x);
  const lw = r.lineWidth ?? doc.style.arrowWidth ?? doc.style.lineWidth;
  const caps = [...doc.captions.values()].map((c) => ({ c, b: m.captionBox(c) }));
  const plus = caps.find((x) => x.c.runs.map((t) => t.text).join('').trim() === '+');
  const texts = caps.filter((x) => x !== plus && x.b.x1 >= x0 - 1 && x.b.x2 <= x1 + 1);
  const above = texts.filter((x) => x.b.y2 <= y).sort((p, q) => q.b.y2 - p.b.y2)[0];
  /** The right edge of the structures before x: its x, and the point there nearest height `at`. */
  const edgeBefore = (x: number, at: number) => {
    let best = { x: -Infinity, y: at };
    for (const a of doc.atoms.values()) {
      if (a.x >= x) continue;
      const boxes = m.atomBoxes(a);
      for (const b of boxes.length ? boxes : [{ x1: a.x, y1: a.y, x2: a.x, y2: a.y }]) {
        if (b.x2 > best.x) best = { x: b.x2, y: Math.max(b.y1, Math.min(at, b.y2)) };
      }
    }
    return best;
  };
  /** The text over the arrow (else under it) nearest the tail ('start') or the head ('end'), and its corner away from the line. */
  const textCorner = (which: 'start' | 'end') => {
    const pick = (list: typeof texts) => list.sort((p, q) => (which === 'start' ? p.b.x1 - q.b.x1 : q.b.x2 - p.b.x2))[0];
    const over = pick(texts.filter((t) => t.b.y2 <= y + 0.5)), t = over ?? pick([...texts]);
    if (!t) return null;
    return { x: which === 'start' ? t.b.x1 : t.b.x2, y: over ? t.b.y1 : t.b.y2, up: !!over };
  };
  switch (key as SchemeSpanKey) {
    case 'structGap': {
      const e = edgeBefore(x0, y);
      return isFinite(e.x) ? { from: { x: e.x, y }, to: { x: x0, y }, label: pt(sp.gap), side: { x: 0, y: e.y < y ? -1 : 1 }, anchors: [e, { x: x0, y }] } : null;
    }
    case 'plusGap': {
      if (!plus) return null;
      const py = (plus.b.y1 + plus.b.y2) / 2, e = edgeBefore(plus.b.x1, py);
      return isFinite(e.x) ? { from: { x: e.x, y: py }, to: { x: plus.b.x1, y: py }, label: pt(sp.plus), side: { x: 0, y: e.y < py ? -1 : 1 }, anchors: [e, { x: plus.b.x1, y: py }] } : null;
    }
    case 'textGap': {
      if (!above) return null;
      const x = (above.b.x1 + above.b.x2) / 2;
      return { from: { x, y: above.b.y2 }, to: { x, y: y - lw / 2 }, label: pt(sp.conditions), side: { x: 1, y: 0 } };
    }
    case 'textGapBelow': {
      const below = texts.filter((x) => x.b.y1 >= y).sort((p, q) => p.b.y1 - q.b.y1)[0];
      if (!below) return null;
      const x = (below.b.x1 + below.b.x2) / 2;
      return { from: { x, y: y + lw / 2 }, to: { x, y: below.b.y1 }, label: pt(sp.conditionsBelow), side: { x: 1, y: 0 } };
    }
    case 'lead': {
      const c = textCorner('start');
      if (!c) return null;
      return { from: { x: x0, y }, to: { x: c.x, y }, label: pt(sp.lead), side: { x: 0, y: c.up ? -1 : 1 }, anchors: [{ x: x0, y }, c] };
    }
    case 'headGap': {
      const c = textCorner('end');
      if (!c) return null;
      const base = x1 - (r.headLength ?? lw * 10);
      return { from: { x: c.x, y }, to: { x: base, y }, label: pt(sp.headGap), side: { x: 0, y: c.up ? -1 : 1 }, anchors: [c, { x: base, y }] };
    }
    case 'arrowWidth':
      return { from: { x: (x0 + x1) / 2, y: y - lw / 2 }, to: { x: (x0 + x1) / 2, y: y + lw / 2 }, label: pt(lw), side: { x: 1, y: 0 } };
    case 'headLength': {
      const hl = r.headLength ?? lw * 10, hw = r.headWidth ?? lw * 2.5;
      return { from: { x: x1 - hl, y: y + hw }, to: { x: x1, y: y + hw }, label: pt(hl), side: { x: 0, y: 1 }, anchors: [{ x: x1 - hl, y: y + hw }, { x: x1, y }] };
    }
    case 'headWidth': {
      const hl = r.headLength ?? lw * 10, hw = r.headWidth ?? lw * 2.5;
      return { from: { x: x1 - hl, y: y - hw }, to: { x: x1 - hl, y: y + hw }, label: pt(hw), side: { x: -1, y: 0 } };
    }
  }
}

/** The drawing mechanismPreview shows: hydroxide, acetone and the two curved arrows, drawn with these gaps. */
export function mechanismDoc(gaps: { start: number | null; end: number | null }, style?: DocStyle): Doc {
  const doc = new Doc();
  if (style) doc.style = { ...style };
  const L = doc.style.bondLength;
  const was = { ...arrowGaps };
  Object.assign(arrowGaps, gaps);
  try {
    doc.bulk(() => {
      const c = doc.addAtom(0, 0), o = doc.addAtom(0, -L, 8);
      const co = doc.addBond(c.id, o.id, 2);
      doc.addBond(c.id, doc.addAtom(-L * 0.866, L / 2).id);
      doc.addBond(c.id, doc.addAtom(L * 0.866, L / 2).id);
      const oh = doc.addAtom(-L * 3.2, -L * 1.1, 8, { charge: -1 });
      const m = measureOf(doc);
      const lw = doc.style.arrowWidth ?? doc.style.lineWidth;
      for (const [from, to] of [[{ kind: 'atom', id: oh.id }, { kind: 'atom', id: c.id }], [{ kind: 'bond', id: co.id }, { kind: 'atom', id: o.id }]] as const) {
        const push = pushArrow(doc, m, from, to);
        if (!push) continue;
        doc.addArrow({
          tail: push.tail, head: push.head, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false,
          sweep: push.bez ? 0 : push.sweep, ...(push.bez ? { bez: push.bez } : {}),
          headLength: push.small ? lw * SMALL_HEAD.length : doc.style.arrowHeadLength ?? lw * 10, headWidth: push.small ? lw * SMALL_HEAD.width : doc.style.arrowHeadWidth ?? lw * 2.5,
          ...(doc.style.arrowWidth !== undefined ? { lineWidth: doc.style.arrowWidth } : {}),
        });
      }
    });
  } finally { Object.assign(arrowGaps, was); }
  return doc;
}
