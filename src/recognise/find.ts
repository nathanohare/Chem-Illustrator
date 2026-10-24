// Finding the structures on a page (File > Import Structures from PDF): the page is drawn, the
// lines of prose are rubbed out (the PDF says where its text is), and what ink is left is grouped
// into blobs, each drawing on its own. Atom labels (O, N, OMe, CO2Et) are short and aren't prose,
// so they stay with their structure. Blobs too small, too thin (arrows, rules) or too big (a
// whole-page picture) are passed over; the reader then judges the rest, and pictures that turn
// out not to be structures are put aside on the review screen.

export interface Box { x: number; y: number; w: number; h: number }

/** Text the PDF holds that isn't part of a structure: prose (words), and compound numbers under one (12, 3a, (4)). Atom labels aren't. */
export function isProse(s: string): boolean {
  const t = s.trim();
  return /[a-z]{4,}/.test(t) || (/\S\s+\S/.test(t) && t.length > 6) || /^\(?\d+[a-z]?\)?[.,]?$/.test(t);
}

/**
 * The drawings on a page: `ink` is 1 where the page is dark (w × h), `prose` the boxes of its
 * prose. `gap` is how far apart two strokes can be and still be one drawing (pixels).
 */
export function findDrawings(ink: Uint8Array, w: number, h: number, prose: Box[], gap: number, labels: Box[] = []): Box[] {
  const m = ink.slice();
  // ink that is the PDF's own short text (atom labels, reagents written over an arrow)
  const lettered = new Uint8Array(w * h);
  for (const b of labels) {
    const x1 = Math.max(0, Math.floor(b.x)), y1 = Math.max(0, Math.floor(b.y)), x2 = Math.min(w, Math.ceil(b.x + b.w)), y2 = Math.min(h, Math.ceil(b.y + b.h));
    for (let y = y1; y < y2; y++) lettered.fill(1, y * w + x1, y * w + x2);
  }
  for (const b of prose) {
    const x1 = Math.max(0, Math.floor(b.x)), y1 = Math.max(0, Math.floor(b.y)), x2 = Math.min(w, Math.ceil(b.x + b.w)), y2 = Math.min(h, Math.ceil(b.y + b.h));
    for (let y = y1; y < y2; y++) m.fill(0, y * w + x1, y * w + x2);
  }
  // group on a coarse grid: a cell is inked if any pixel in it is; cells within `gap` join
  const c = Math.max(1, Math.round(gap / 2));
  const gw = Math.ceil(w / c), gh = Math.ceil(h / c);
  const grid = new Uint8Array(gw * gh);
  const count = new Uint32Array(gw * gh), text = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const row = y * w, grow = Math.floor(y / c) * gw;
    for (let x = 0; x < w; x++) if (m[row + x]) { const k = grow + Math.floor(x / c); grid[k] = 1; count[k]++; if (lettered[row + x]) text[k]++; }
  }
  const label = new Int32Array(gw * gh).fill(-1);
  const boxes: (Box & { ink: number; text: number })[] = [];
  const reach = 2;
  for (let s = 0; s < gw * gh; s++) {
    if (!grid[s] || label[s] >= 0) continue;
    const id = boxes.length;
    let x1 = gw, y1 = gh, x2 = -1, y2 = -1, inked = 0, texted = 0;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const k = stack.pop()!;
      const gx = k % gw, gy = (k - gx) / gw;
      if (gx < x1) x1 = gx;
      if (gx > x2) x2 = gx;
      if (gy < y1) y1 = gy;
      if (gy > y2) y2 = gy;
      inked += count[k];
      texted += text[k];
      for (let dy = -reach; dy <= reach; dy++) {
        const ny = gy + dy;
        if (ny < 0 || ny >= gh) continue;
        for (let dx = -reach; dx <= reach; dx++) {
          const nx = gx + dx;
          if (nx < 0 || nx >= gw) continue;
          const n = ny * gw + nx;
          if (grid[n] && label[n] < 0) { label[n] = id; stack.push(n); }
        }
      }
    }
    boxes.push({ x: x1 * c, y: y1 * c, w: Math.min(w, (x2 + 1) * c) - x1 * c, h: Math.min(h, (y2 + 1) * c) - y1 * c, ink: inked, text: texted });
  }
  const small = gap * 4;
  const big = (b: Box) => b.w >= small && b.h >= small * 0.6;
  const kept = boxes
    .filter(big)
    .filter((b) => Math.max(b.w / b.h, b.h / b.w) < 6)
    .filter((b) => b.w * b.h < w * h * 0.5)
    // a drawing is mostly paper: solid blocks (photos, filled panels) are not structures
    .filter((b) => b.ink / (b.w * b.h) < 0.35)
    // mostly letters (conditions, a table, a heading): a structure is mostly bonds
    .filter((b) => b.text < b.ink * 0.55)
    .map(({ x, y, w: bw, h: bh }) => ({ x, y, w: bw, h: bh }));
  // labels a little apart from their bonds (Me, H, OH, a charge) belong to the drawing beside them
  const bits = boxes.filter((b) => !big(b));
  const near = gap * 1.5;
  for (const k of kept) {
    for (let grew = true; grew;) {
      grew = false;
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        const dx = Math.max(0, k.x - (b.x + b.w), b.x - (k.x + k.w)), dy = Math.max(0, k.y - (b.y + b.h), b.y - (k.y + k.h));
        if (dx > near || dy > near) continue;
        const x1 = Math.min(k.x, b.x), y1 = Math.min(k.y, b.y);
        k.w = Math.max(k.x + k.w, b.x + b.w) - x1; k.h = Math.max(k.y + k.h, b.y + b.h) - y1; k.x = x1; k.y = y1;
        bits.splice(i, 1);
        grew = true;
      }
    }
  }
  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}
