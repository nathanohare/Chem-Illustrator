// Pictures in the Settings window of what a page's settings will look like: a sample drawing in
// the drawing style being edited (with an arrow in the arrow sizes chosen), the dot grid and tint,
// the page grid's boundaries and fixed edges, Reading Mode's colours, and small ones beside a
// single choice (bond ends, charges). Each is drawn again as the settings change.

import { Doc } from '../model';
import type { DocStyle } from '../style';
import { freeRing, placeRing, sprout } from '../chem/chemgeom';
import { recordPicture, pictureCanvas } from '../render/picture';
import { darkMatrix, type DarkPalette } from '../dark-page';
import type { PageLook } from '../page-grid';
import { SHADE_ALPHA } from '../page-grid';
import { GRID_ALPHA, GRID_SPACING, TINT_ALPHA, type OrientPrefs } from '../orientation-prefs';
import type { ArrowLook } from '../editor/editor';

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
 * The sample drawing: a Boc-protected amino ester on a benzene ring (a wedge, a hashed bond,
 * double bonds and labels), its compound number, and a reaction arrow with conditions.
 */
export function sampleDrawing(style: DocStyle, arrow?: ArrowLook): Doc {
  const doc = new Doc();
  doc.style = { ...style };
  const L = style.bondLength;
  doc.bulk(() => {
    const ring = placeRing(doc, freeRing({ x: 0, y: 0 }, 6, L), { aromatic: true });
    const a = doc.atoms.get(ring[1])!;
    const c = sprout(doc, a.id);
    const me = sprout(doc, c.id, 1, 'hashWedge');
    doc.updateAtom(me.id, { label: null });
    const n = sprout(doc, c.id, 1, 'wedge');
    doc.updateAtom(n.id, { z: 7 });
    const co = sprout(doc, n.id);
    sprout(doc, co.id, 2, 'solid', 8);
    const o = sprout(doc, co.id, 1, 'solid', 8);
    doc.updateAtom(o.id, { label: null });
    const tb = sprout(doc, o.id);
    doc.updateAtom(tb.id, { label: 'tBu' });
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const at of doc.atoms.values()) { minX = Math.min(minX, at.x); maxX = Math.max(maxX, at.x); minY = Math.min(minY, at.y); maxY = Math.max(maxY, at.y); }
    doc.addCaption({ x: (minX + maxX) / 2 - style.captionSize * 0.3, y: maxY + L * 1.1, runs: [{ text: '1', bold: true }], justify: 'left' });
    // a reaction arrow under it, in the arrow sizes chosen
    const lw = arrow?.width ?? style.lineWidth;
    const y = maxY + L * 2.2;
    doc.addArrow({
      tail: { x: minX, y }, head: { x: minX + L * 3.4, y }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0,
      headLength: arrow?.headLength ?? lw * 10, headWidth: arrow?.headWidth ?? lw * 2.5, ...(arrow?.width != null ? { lineWidth: arrow.width } : {}),
    });
    doc.addCaption({ x: minX + L * 0.6, y: y - L * 0.35, runs: [{ text: 'TFA, CH' }, { text: '2', sub: true }, { text: 'Cl' }, { text: '2', sub: true }], justify: 'left' });
  });
  return doc;
}

/** A drawing on a canvas, fitted into `w` × `h` CSS pixels on white (or not at all where the browser can't draw). */
export function drawingCanvas(doc: Doc, w: number, h: number, pad = 10): HTMLCanvasElement {
  const pic = recordPicture(doc, 2);
  const out = sized(w, h);
  if (!pic || !out.ctx) return out.canvas;
  const pw = pic.box.x2 - pic.box.x1, ph = pic.box.y2 - pic.box.y1;
  const fit = Math.min((w - 2 * pad) / pw, (h - 2 * pad) / ph, 3);
  const { canvas: src } = pictureCanvas(doc, pic, fit * dpr() * 72);
  const ctx = out.ctx;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  const dw = pw * fit, dh = ph * fit;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return out.canvas;
}

/** Drawing Style, with the arrow sizes from Settings ▸ Drawing. */
export function stylePreview(style: DocStyle, arrow?: ArrowLook): HTMLElement {
  const box = document.createElement('div');
  box.append(drawingCanvas(sampleDrawing(style, arrow), 232, 220));
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

/** "N⁺" or "N⊕", as the + key will put a charge. */
export function chargeSwatch(circled: boolean): HTMLElement {
  const s = document.createElement('span');
  s.className = 'ask-swatch';
  s.textContent = circled ? 'N⊕' : 'N⁺';
  return s;
}
