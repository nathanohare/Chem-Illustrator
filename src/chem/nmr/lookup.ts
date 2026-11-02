// The shift lookup shipped as public/nmr/nmr-hose.dat (built by scripts/nmr/train_lookup.py from
// NMRShiftDB2 and CC BY NMRBank lists). Each section holds sorted environment codes for one
// nucleus, radius and (optionally) solvent, with the median shift, its spread and how many
// measured atoms stand behind it.

import { envCodes, type EnvGraph } from './env';

export type Nucleus = '13C' | '1H';

export interface LookupParams { maxr: number; min_n?: number; depth?: number; decay?: number; c?: number; solvent?: boolean }

interface Section { nuc: Nucleus; r: number; solvent: string | null; count: number; codes: Float64Array; med: Int16Array; mad: Uint16Array; n: Uint16Array }

export interface ShiftHit {
  /** Predicted shift, ppm. */
  value: number;
  /** Mean absolute spread of the deepest matching environment's shifts, ppm. */
  spread: number;
  /** Deepest radius (bonds) that matched: 5 is a near-identical environment, 0 the atom type only. */
  radius: number;
  /** Measured atoms behind the deepest match. */
  n: number;
}

export interface AtomShifts {
  atom: number;
  c13: ShiftHit | null;
  /** For atoms carrying hydrogens: the shift of those hydrogens. */
  h1: ShiftHit | null;
  hCount: number;
}

interface Header { version: number; scale: Record<Nucleus, number>; params: Record<Nucleus, LookupParams>; sections: Omit<Section, 'codes' | 'med' | 'mad' | 'n'>[]; sources?: Record<string, number> }

export class ShiftTable {
  readonly params: Record<Nucleus, LookupParams>;
  readonly scale: Record<Nucleus, number>;
  readonly sources: Record<string, number>;
  private readonly sec = new Map<string, Section>();

  constructor(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
    if (magic !== 'NMRH') throw new Error('Not an NMR shift table');
    const len = dv.getUint32(8, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, len))) as Header;
    if (head.version !== 1) throw new Error(`NMR shift table version ${head.version} is not supported`);
    this.params = head.params;
    this.scale = head.scale;
    this.sources = head.sources ?? {};
    let off = 12 + len;
    off += (8 - (off % 8)) % 8;
    const take = <T>(make: (o: number, n: number) => T, bytes: number, n: number): T => {
      const a = make(off, n);
      off += bytes * n;
      off += (8 - (off % 8)) % 8;
      return a;
    };
    for (const s of head.sections) {
      const codes = take((o, n) => new Float64Array(buf, o, n), 8, s.count);
      const med = take((o, n) => new Int16Array(buf, o, n), 2, s.count);
      const mad = take((o, n) => new Uint16Array(buf, o, n), 2, s.count);
      const n = take((o, k) => new Uint16Array(buf, o, k), 2, s.count);
      this.sec.set(key(s.nuc, s.r, s.solvent), { ...s, codes, med, mad, n });
    }
  }

  private find(nuc: Nucleus, r: number, solvent: string | null, code: number): [number, number, number] | null {
    const s = this.sec.get(key(nuc, r, solvent));
    if (!s) return null;
    let lo = 0, hi = s.count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = s.codes[mid];
      if (c === code) return [s.med[mid] / this.scale[nuc], s.mad[mid] / this.scale[nuc], s.n[mid]];
      if (c < code) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }

  /** One atom's shift from its environment codes (radius 0 first), blending the deepest radii. */
  predict(nuc: Nucleus, codes: string[], solvent: string | null): ShiftHit | null {
    const p = this.params[nuc];
    const mins = p.min_n ?? 1, depth = p.depth ?? 1, decay = p.decay ?? 0.35, c = p.c ?? 1;
    const hits: [number, [number, number, number]][] = [];
    for (let r = Math.min(p.maxr, codes.length - 1); r >= 0; r--) {
      const code = parseInt(codes[r], 16);
      let s = solvent && p.solvent !== false ? this.find(nuc, r, solvent, code) : null;
      if (!s) s = this.find(nuc, r, null, code);
      if (!s || s[2] < (r > 0 ? mins : 0)) continue;
      hits.push([r, s]);
      if (hits.length > depth) break;
    }
    if (!hits.length) return null;
    const top = hits[0][0];
    let num = 0, den = 0;
    for (const [r, [med, , n]] of hits) {
      const w = decay ** (top - r) * (n / (n + c));
      num += w * med;
      den += w;
    }
    const [r0, [, mad0, n0]] = hits[0];
    return { value: num / den, spread: mad0, radius: r0, n: n0 };
  }

  /** 13C and 1H shifts for every atom of a structure. */
  predictAll(g: EnvGraph, solvent: string | null = 'CDCl3'): AtomShifts[] {
    const codes = envCodes(g);
    return g.atoms.map((a, i) => ({
      atom: i,
      c13: a.el === 'C' ? this.predict('13C', codes[i], solvent) : null,
      h1: a.h > 0 ? this.predict('1H', codes[i], solvent) : null,
      hCount: a.h,
    }));
  }
}

const key = (nuc: string, r: number, solvent: string | null) => `${nuc}|${r}|${solvent ?? ''}`;
