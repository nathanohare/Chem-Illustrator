// Pictures in the Settings window of what a page's settings will look like: a sample drawing in
// the drawing style being edited (two molecules and an arrow in its sizes), the dot grid and tint,
// the page grid's boundaries and fixed edges, Reading Mode's colours, and small ones beside a
// single choice (bond ends, charges). Each is drawn again as the settings change.

import { newTextLook } from '../chem/arrow-text';
import { labelPieces, styleLabel, type AlkylLook } from '../chem/labels';
import { Doc } from '../model';
import type { DocStyle } from '../style';
import { freeRing, placeRing, sprout } from '../chem/chemgeom';
import { recordPicture, pictureCanvas } from '../render/picture';
import { Renderer } from '../render/renderer';
import { applySchemePlan, planCleanUp, withSchemePrefs, type SchemePrefs } from '../chem/scheme-layout';
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
  // laid out as the scheme settings say, by the same Clean Up Reaction the canvas uses
  try {
    const r = new Renderer(noCanvas, noCanvas);
    r.showWarnings = false;
    const m: Measure = { atomBoxes: (a) => r.atomInfo(doc, a).boxes, captionBox: (c) => r.captionBox(c) };
    withSchemePrefs(scheme, () => {
      const plan = planCleanUp(doc, m);
      if (plan) applySchemePlan(doc, m, plan);
    });
  } catch { /* (no text measuring here: left roughly placed) */ }
  return doc;
}

/** A drawing on a canvas, fitted into `w` × `h` CSS pixels on white (or not at all where the browser can't draw). */
export function drawingCanvas(doc: Doc, w: number, h: number, pad = 10, maxScale = 3): HTMLCanvasElement {
  const pic = recordPicture(doc, 2);
  const out = sized(w, h);
  if (!pic || !out.ctx) return out.canvas;
  const pw = pic.box.x2 - pic.box.x1, ph = pic.box.y2 - pic.box.y1;
  const fit = Math.min((w - 2 * pad) / pw, (h - 2 * pad) / ph, maxScale);
  const { canvas: src } = pictureCanvas(doc, pic, fit * dpr() * 72);
  const ctx = out.ctx;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const dw = pw * fit, dh = ph * fit;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return out.canvas;
}

/** Part of a drawing (`view`, in its points) on a canvas `w` × `h` CSS pixels, on white. */
export function drawingCrop(doc: Doc, view: { x1: number; y1: number; x2: number; y2: number }, w: number, h: number): HTMLCanvasElement {
  const pic = recordPicture(doc, 2);
  const out = sized(w, h);
  if (!pic || !out.ctx) return out.canvas;
  const vw = view.x2 - view.x1, vh = view.y2 - view.y1;
  const fit = Math.min(w / vw, h / vh, 4);
  const { canvas: src, dpi } = pictureCanvas(doc, pic, fit * dpr() * 72);
  const k = dpi / 72;
  const ctx = out.ctx;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const dw = vw * fit, dh = vh * fit;
  ctx.drawImage(src, (view.x1 - pic.box.x1) * k, (view.y1 - pic.box.y1) * k, vw * k, vh * k, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return out.canvas;
}

/** Drawing Style: a sample drawn in it, `w` CSS pixels wide (the wide preview column). */
export function stylePreview(style: DocStyle, scheme: Partial<SchemePrefs> = {}, w = 352): HTMLElement {
  const box = document.createElement('div');
  const doc = sampleDrawing(style, { ...style.scheme, ...scheme });
  box.append(drawingCanvas(doc, w, Math.round(w * 0.42), 6));
  // the arrow close up, where its gaps and the text's place show
  const r = [...doc.arrows.values()][0];
  if (r) {
    const L = style.bondLength;
    const x1 = Math.min(r.tail.x, r.head.x), x2 = Math.max(r.tail.x, r.head.x);
    const crop = drawingCrop(doc, { x1: x1 - 1.6 * L, y1: r.tail.y - 1.3 * L, x2: x2 + 1.6 * L, y2: r.tail.y + 1.3 * L }, w, Math.round(w * 0.36));
    crop.classList.add('sw-zoom');
    box.append(crop);
  }
  const p = document.createElement('p');
  p.className = 'muted sw-cap';
  p.textContent = `Bond ${+style.bondLength.toFixed(2)} pt · line ${+style.lineWidth.toFixed(2)} pt · ${style.labelFont} ${style.labelSize} pt`;
  box.append(p);
  return box;
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

/**
 * Sample labels in an alkyl look (italic t, a dash or none), as atom labels show them, counts
 * lowered: typed as tBu, iPr…, and one typed with a dash.
 */
export function alkylPreview(look: AlkylLook): HTMLElement {
  const box = document.createElement('div');
  box.className = 'alkyl-preview';
  for (const typed of ['OtBu', 'N(iPr)2', 'Si(iPr)3', 'nBu', 'sBu', 'P(t-Bu)2']) {
    const s = document.createElement('span');
    s.className = 'ask-swatch';
    const { label, marks } = styleLabel(typed, undefined, look);
    for (const p of labelPieces(label, false, marks)) {
      const el = document.createElement(p.italic ? 'i' : p.sub ? 'sub' : 'span');
      el.textContent = p.text;
      s.append(el);
    }
    box.append(s);
  }
  return box;
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
function thumb(doc: Doc, w: number, h: number): HTMLElement {
  // (at one scale, so each choice's picture is drawn the same size)
  const c = drawingCanvas(doc, w, h, 2, 1.5);
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
  return thumb(doc, 64, 26);
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
export function mechanismPreview(gaps: { start: number | null; end: number | null }, style?: DocStyle, w = 232): HTMLElement {
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
  const box = document.createElement('div');
  box.append(drawingCanvas(doc, w, Math.round(w * 0.5), 6));
  return box;
}
