// The phase 2 shift networks (public/nmr/nmr-net.dat, from scripts/nmr/train_net.py and
// export_net.py), run in plain TypeScript: a few small matrix products per atom, no runtime.
// Several networks trained with different seeds give a mean and, from their spread, an error bar.

import type { EnvGraph } from './env';
import { ATOM_BLOCKS, ATOM_DIM, graphFeatures, NET_SOLVENTS, solventIndex } from './features';
import type { Nucleus } from './lookup';

interface TensorInfo { name: string; shape: number[]; offset: number }
interface Header { version: number; models: { hidden: number; layers: number; tensors: TensorInfo[] }[]; norm: Record<Nucleus, [number, number]>; solvents: string[] }

/** A dense layer: out = W x + b, with W stored rows = outputs. */
interface Dense { w: Float32Array; b: Float32Array | null; out: number; inp: number }

interface Model { hidden: number; inp: Dense; msg: Dense[]; bond: Float32Array[]; self: Dense[]; agg: Dense[]; o1: Dense; o2: Dense }

/** Per atom: the ensemble mean and standard deviation for 13C and for the attached 1H. */
export interface NetShift { c13: number; c13sd: number; h1: number; h1sd: number }

function half(u: Uint16Array): Float32Array {
  const out = new Float32Array(u.length);
  for (let i = 0; i < u.length; i++) {
    const h = u[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
    out[i] = e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
  }
  return out;
}

function dense(x: Float32Array, n: number, d: Dense): Float32Array {
  const y = new Float32Array(n * d.out);
  for (let a = 0; a < n; a++) {
    const xo = a * d.inp, yo = a * d.out;
    for (let o = 0; o < d.out; o++) {
      let s = d.b ? d.b[o] : 0;
      const wo = o * d.inp;
      for (let i = 0; i < d.inp; i++) s += d.w[wo + i] * x[xo + i];
      y[yo + o] = s;
    }
  }
  return y;
}

const relu = (x: Float32Array) => { for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0; return x; };

export class ShiftNet {
  private readonly head: Header;
  private readonly models: Model[];

  constructor(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'NMRN') throw new Error('Not an NMR shift network');
    const len = dv.getUint32(8, true);
    this.head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, len))) as Header;
    if (this.head.version !== 1) throw new Error(`NMR shift network version ${this.head.version} is not supported`);
    let base = 12 + len;
    base += (8 - (base % 8)) % 8;
    this.models = this.head.models.map((m) => {
      const t = new Map(m.tensors.map((x) => [x.name, x]));
      const get = (name: string) => {
        const x = t.get(name);
        if (!x) throw new Error(`NMR shift network is missing ${name}`);
        const n = x.shape.reduce((a, b) => a * b, 1);
        return { a: half(new Uint16Array(buf.slice(base + x.offset, base + x.offset + 2 * n))), shape: x.shape };
      };
      const lin = (p: string, bias = true): Dense => {
        const w = get(`${p}.weight`);
        return { w: w.a, b: bias ? get(`${p}.bias`).a : null, out: w.shape[0], inp: w.shape[1] };
      };
      const ks = Array.from({ length: m.layers }, (_, k) => k);
      return {
        hidden: m.hidden, inp: lin('inp'), msg: ks.map((k) => lin(`msg.${k}`)), bond: ks.map((k) => get(`bond.${k}.weight`).a),
        self: ks.map((k) => lin(`self_.${k}`)), agg: ks.map((k) => lin(`agg.${k}`, false)), o1: lin('o1'), o2: lin('o2'),
      };
    });
  }

  get size(): number { return this.models.length; }

  private run(m: Model, x: Float32Array, n: number, bonds: [number, number, number][]): Float32Array {
    const H = m.hidden;
    let h = relu(dense(x, n, m.inp));
    for (let k = 0; k < m.msg.length; k++) {
      const mh = dense(h, n, m.msg[k]);
      const agg = new Float32Array(n * H);
      const e = m.bond[k];
      for (const [u, v, t] of bonds) {
        for (const [s, d] of [[u, v], [v, u]]) {
          for (let c = 0; c < H; c++) { const val = mh[s * H + c] + e[t * H + c]; if (val > 0) agg[d * H + c] += val; }
        }
      }
      const a = dense(h, n, m.self[k]), b = dense(agg, n, m.agg[k]);
      for (let i = 0; i < h.length; i++) { const z = a[i] + b[i]; if (z > 0) h[i] += z; }
    }
    return dense(relu(dense(h, n, m.o1)), n, m.o2);
  }

  /** Shifts for every atom of a structure in a solvent (any name; unknown solvents count as "other"). */
  predict(g: EnvGraph, solvent: string | null): NetShift[] {
    const f = graphFeatures(g);
    const n = g.atoms.length;
    const sizes = Object.values(ATOM_BLOCKS);
    const D = ATOM_DIM + NET_SOLVENTS.length + 1;
    const x = new Float32Array(n * D);
    const si = solventIndex(solvent);
    f.atoms.forEach((a, i) => {
      let off = 0;
      a.forEach((v, j) => { x[i * D + off + v] = 1; off += sizes[j]; });
      x[i * D + ATOM_DIM + si] = 1;
    });
    const [cm, cs] = this.head.norm['13C'], [hm, hs] = this.head.norm['1H'];
    const outs = this.models.map((m) => this.run(m, x, n, f.bonds));
    return Array.from({ length: n }, (_, i) => {
      const c = outs.map((o) => o[2 * i] * cs + cm), h = outs.map((o) => o[2 * i + 1] * hs + hm);
      const mean = (v: number[]) => v.reduce((t, z) => t + z, 0) / v.length;
      const sd = (v: number[]) => { const mu = mean(v); return Math.sqrt(v.reduce((t, z) => t + (z - mu) ** 2, 0) / Math.max(1, v.length - 1)); };
      return { c13: mean(c), c13sd: sd(c), h1: mean(h), h1sd: sd(h) };
    });
  }
}
