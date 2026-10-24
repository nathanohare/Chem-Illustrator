// Getting a picture ready for the structure reader, the way it was trained: white margins cut
// off, 5 pixels of white put back, then stretched to a square (OpenCV's bilinear resize, which is
// what the reader saw while it learnt).

export interface Pixels { width: number; height: number; data: Uint8ClampedArray }

/** The part of the picture that isn't white (all of it when it's blank). */
export function inkBox(p: Pixels): { x: number; y: number; w: number; h: number } {
  let x1 = p.width, y1 = p.height, x2 = -1, y2 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      const d = p.data;
      // transparent is paper too
      if (d[i + 3] === 0 || (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255)) continue;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }
  if (x2 < 0) return { x: 0, y: 0, w: p.width, h: p.height };
  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

/** The inked part with a white margin of `pad` pixels. */
export function cropWhite(p: Pixels, pad = 5): Pixels {
  const b = inkBox(p);
  const w = b.w + 2 * pad, h = b.h + 2 * pad;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const s = ((b.y + y) * p.width + b.x + x) * 4, t = ((y + pad) * w + x + pad) * 4;
      const a = p.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) data[t + c] = p.data[s + c] * a + 255 * (1 - a);
    }
  }
  return { width: w, height: h, data };
}

/** Bilinear resize to w × h, sampling at pixel centres as OpenCV's INTER_LINEAR does. */
export function resize(p: Pixels, w: number, h: number): Pixels {
  const out = new Uint8ClampedArray(w * h * 4);
  const sx = p.width / w, sy = p.height / h;
  for (let y = 0; y < h; y++) {
    let fy = (y + 0.5) * sy - 0.5;
    if (fy < 0) fy = 0;
    let y0 = Math.floor(fy);
    if (y0 >= p.height - 1) { y0 = p.height - 1; fy = y0; }
    const y1 = Math.min(y0 + 1, p.height - 1), wy = fy - y0;
    for (let x = 0; x < w; x++) {
      let fx = (x + 0.5) * sx - 0.5;
      if (fx < 0) fx = 0;
      let x0 = Math.floor(fx);
      if (x0 >= p.width - 1) { x0 = p.width - 1; fx = x0; }
      const x1 = Math.min(x0 + 1, p.width - 1), wx = fx - x0;
      const a = (y0 * p.width + x0) * 4, b = (y0 * p.width + x1) * 4, c = (y1 * p.width + x0) * 4, d = (y1 * p.width + x1) * 4;
      const o = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) {
        const top = p.data[a + k] * (1 - wx) + p.data[b + k] * wx;
        const bot = p.data[c + k] * (1 - wx) + p.data[d + k] * wx;
        out[o + k] = Math.round(top * (1 - wy) + bot * wy);
      }
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * A photo or scan of a drawing made to look like a clean drawing: uneven light and grey paper
 * evened out to white, and the lines kept dark. Pictures that are already on white (copied from a
 * drawing program or a PDF) are left as they are.
 */
export function cleanPhoto(p: Pixels): Pixels {
  const n = p.width * p.height;
  const grey = new Float32Array(n);
  let white = 0;
  for (let i = 0; i < n; i++) {
    const a = p.data[i * 4 + 3] / 255;
    const g = (0.299 * p.data[i * 4] + 0.587 * p.data[i * 4 + 1] + 0.114 * p.data[i * 4 + 2]) * a + 255 * (1 - a);
    grey[i] = g;
    if (g >= 250) white++;
  }
  if (white > n * 0.5) return p;
  // the paper's brightness: the brightest in each tile, smoothed over its neighbours
  const T = Math.max(8, Math.round(Math.max(p.width, p.height) / 40));
  const tw = Math.ceil(p.width / T), th = Math.ceil(p.height / T);
  const tile = new Float32Array(tw * th);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const k = Math.floor(y / T) * tw + Math.floor(x / T);
      if (grey[y * p.width + x] > tile[k]) tile[k] = grey[y * p.width + x];
    }
  }
  const smooth = new Float32Array(tw * th);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x >= 0 && y >= 0 && x < tw && y < th) { s += tile[y * tw + x]; c++; }
      }
      smooth[ty * tw + tx] = s / c;
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      // paper brightness here, between tile centres
      const fx = Math.min(tw - 1, Math.max(0, (x + 0.5) / T - 0.5)), fy = Math.min(th - 1, Math.max(0, (y + 0.5) / T - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(tw - 1, x0 + 1), y1 = Math.min(th - 1, y0 + 1);
      const wx = fx - x0, wy = fy - y0;
      const bg = (smooth[y0 * tw + x0] * (1 - wx) + smooth[y0 * tw + x1] * wx) * (1 - wy) + (smooth[y1 * tw + x0] * (1 - wx) + smooth[y1 * tw + x1] * wx) * wy;
      const r = grey[y * p.width + x] / Math.max(1, bg);
      // paper (within 20% of its brightness) is white; ink darkens towards black
      const v = r > 0.8 ? 255 : Math.max(0, Math.round(255 * ((r - 0.35) / 0.45)));
      const i = (y * p.width + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return { width: p.width, height: p.height, data: out };
}

/** A picture no bigger than `most` pixels on its longer side (photos from phones are huge). */
export function shrinkTo(p: Pixels, most: number): Pixels {
  const k = most / Math.max(p.width, p.height);
  if (k >= 1) return p;
  // halve first, so thin pen lines aren't lost between samples
  let q = p;
  while (Math.max(q.width, q.height) * 0.5 >= most) q = resize(q, Math.max(1, Math.round(q.width / 2)), Math.max(1, Math.round(q.height / 2)));
  return resize(q, Math.max(1, Math.round(p.width * k)), Math.max(1, Math.round(p.height * k)));
}
