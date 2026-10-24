// Reading a structure from a picture on this computer, with MolScribe (Qian et al., J. Chem. Inf.
// Model. 2023, 63, 1925; MIT licence), converted to ONNX by scripts/recognition/export.py. Three
// parts: the picture's encoder, one step of the decoder (which writes the structure as SMILES
// characters, each atom followed by its place in the picture), and the bond reader, which says
// how each pair of atoms is joined. This file is the decoding logic only; the runtime that runs
// the parts is passed in, so the same code runs in the app's worker and in tests.

/** The decoder's words, written by the export script beside the models. */
export interface Vocab {
  itos: string[];
  /** Token ids from here on are x places (maxx of them), then y places (maxy). */
  offset: number;
  maxx: number;
  maxy: number;
  /** <pad>, <sos>, <eos>, <unk>, <mask>, ... come first. */
  special: number;
  layers: number;
  heads: number;
  dk: number;
  maxLen: number;
  size: number;
}

const PAD = 0, SOS = 1, EOS = 2, UNK = 3;

/** A tensor as the runtime gives it (enough of onnxruntime's Tensor for here). */
export interface T { data: Float32Array | BigInt64Array | Int32Array; dims: readonly number[] }

/** Runs the three parts. */
export interface Runner {
  encode(image: Float32Array): Promise<{ ck: T; cv: T }>;
  step(token: number, pos: number, pk: T, pv: T, ck: T, cv: T): Promise<{ logp: Float32Array; hidden: Float32Array; nk: T; nv: T }>;
  /** Bond probabilities for k atoms: k × k × 7 (none, single, double, triple, aromatic, wedge, hash). */
  edges(hidden: Float32Array, k: number): Promise<Float32Array>;
  /** An empty key/value cache. */
  empty(): T;
}

/** What was read: atoms (as written, such as C, c, [NH+], [OMe], Cl), where they are (0 to 1 across the picture), and the bonds. */
export interface ReadGraph {
  smiles: string;
  symbols: string[];
  coords: [number, number][];
  /** Bond type between each pair: 0 none, 1 single, 2 double, 3 triple, 4 aromatic, 5 wedge (narrow end at the first atom), 6 hash. */
  edges: number[][];
  /** How sure the reader is of each atom, and of the whole (0 to 1). */
  atomScores: number[];
  confidence: number;
}

/** ImageNet grey: the picture as the encoder wants it (3 × size × size). `rgba` is the picture already cropped and resized to size × size. */
export function imageTensor(rgba: Uint8ClampedArray, size: number): Float32Array {
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  const n = size * size;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3] / 255;
    // transparent counts as white paper; grey as OpenCV makes it
    const grey = ((0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a)) / 255;
    for (let c = 0; c < 3; c++) out[c * n + i] = (grey - mean[c]) / std[c];
  }
  return out;
}

export async function readStructure(run: Runner, v: Vocab, image: Float32Array): Promise<ReadGraph> {
  const isX = (t: number) => t >= v.offset && t < v.offset + v.maxx;
  const isY = (t: number) => t >= v.offset + v.maxx;
  const { ck, cv } = await run.encode(image);
  let pk = run.empty(), pv = run.empty();
  let tok = SOS;
  const seq: number[] = [], scores: number[] = [], hidden: Float32Array[] = [];
  for (let pos = 0; pos < v.maxLen; pos++) {
    const r = await run.step(tok, pos, pk, pv, ck, cv);
    pk = r.nk; pv = r.nv;
    const logp = r.logp;
    // after an x place only a y place; after a y place no place
    let lo = 0, hi = logp.length;
    if (isX(tok)) lo = v.offset + v.maxx;
    else if (isY(tok)) hi = v.offset;
    let best = -1, bestP = -Infinity;
    for (let i = lo; i < hi; i++) {
      if (pos === 0 && i === EOS) continue;
      if (logp[i] > bestP) { bestP = logp[i]; best = i; }
    }
    hidden.push(r.hidden);
    seq.push(best);
    scores.push(bestP);
    tok = best;
    if (best === EOS) break;
  }
  const g = parseSequence(v, seq);
  const tokenScore = Math.exp(scores.reduce((s, x) => s + x, 0) / Math.max(1, scores.length));
  const atomScores = g.indices.map((ix, i) => {
    const len = g.symbols[i].length;
    let p = 1;
    for (let k = ix - 3 - len + 1; k <= ix - 3; k++) p *= Math.exp(scores[k] ?? 0);
    return p ** (1 / len);
  });
  const k = g.symbols.length;
  if (!k) return { smiles: g.smiles, symbols: [], coords: [], edges: [], atomScores: [], confidence: 0 };
  const dim = hidden[0].length;
  const h = new Float32Array(k * dim);
  g.indices.forEach((ix, i) => h.set(hidden[ix], i * dim));
  const P = await run.edges(h, k);
  const { edges, edgeScores } = bondsFrom(P, k);
  let prod = 1;
  for (const row of edgeScores) for (const s of row) prod *= s;
  return { smiles: g.smiles, symbols: g.symbols, coords: g.coords, edges, atomScores, confidence: tokenScore * Math.sqrt(prod) };
}

/** The decoder's tokens as SMILES, atoms, their places, and where each atom's hidden state is. */
export function parseSequence(v: Vocab, seq: number[]): { smiles: string; symbols: string[]; coords: [number, number][]; indices: number[] } {
  const isX = (t: number) => t >= v.offset && t < v.offset + v.maxx;
  const isY = (t: number) => t >= v.offset + v.maxx;
  const isSym = (t: number) => (t >= v.special && t < v.offset) || t === UNK;
  const str = (t: number) => v.itos[t] ?? '';
  const isAtom = (t: number) => {
    if (t >= v.offset) return false;
    const s = str(t);
    return /^[A-Za-z]+$/.test(s) || s.startsWith('[') || s === '*' || s === '<unk>';
  };
  let smiles = '';
  const symbols: string[] = [], coords: [number, number][] = [], indices: number[] = [];
  let i = 0;
  while (i < seq.length) {
    const t = seq[i];
    if (t === EOS || t === PAD) break;
    if (isX(t) || isY(t)) { i++; continue; }
    if (!isAtom(t)) { smiles += str(t); i++; continue; }
    let j: number;
    if (str(t) === '[') {
      j = i + 1;
      while (j < seq.length) {
        if (!isSym(seq[j])) break;
        if (str(seq[j]) === ']') { j++; break; }
        j++;
      }
    } else if (i + 1 < seq.length && isSym(seq[i + 1]) && ((str(t) === 'C' && str(seq[i + 1]) === 'l') || (str(t) === 'B' && str(seq[i + 1]) === 'r'))) j = i + 2;
    else j = i + 1;
    let token = '';
    for (let k = i; k < j; k++) token += str(seq[k]);
    smiles += token;
    if (j + 2 < seq.length && isX(seq[j]) && isY(seq[j + 1])) {
      coords.push([(seq[j] - v.offset) / (v.maxx - 1), (seq[j + 1] - v.offset - v.maxx) / (v.maxy - 1)]);
      symbols.push(token);
      indices.push(j + 2);
      i = j + 2;
    } else i = j;
  }
  return { smiles, symbols, coords, indices };
}

/** Each pair's bond, averaging both directions (a wedge from a to b is a hash read from b to a's side the other way round). */
export function bondsFrom(P: Float32Array, k: number): { edges: number[][]; edgeScores: number[][] } {
  const p = (a: number, b: number, t: number) => P[(a * k + b) * 7 + t];
  const prob: number[][][] = [];
  for (let a = 0; a < k; a++) {
    prob.push([]);
    for (let b = 0; b < k; b++) prob[a].push([0, 1, 2, 3, 4, 5, 6].map((t) => p(a, b, t)));
  }
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      for (let t = 0; t < 5; t++) prob[a][b][t] = prob[b][a][t] = (prob[a][b][t] + prob[b][a][t]) / 2;
      const w = (prob[a][b][5] + prob[b][a][6]) / 2, hh = (prob[a][b][6] + prob[b][a][5]) / 2;
      prob[a][b][5] = w; prob[a][b][6] = hh; prob[b][a][5] = hh; prob[b][a][6] = w;
    }
  }
  const edges = prob.map((row) => row.map((ps) => ps.indexOf(Math.max(...ps))));
  const edgeScores = prob.map((row) => row.map((ps) => Math.max(...ps)));
  return { edges, edgeScores };
}
