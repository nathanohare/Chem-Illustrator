// Measured shifts of whole structures, shipped as public/nmr/nmr-measured.dat (built by
// scripts/nmr/train_lookup.py --store from NMRShiftDB2 and CC BY NMRBank). When the drawn structure
// is in it, its own measured shifts replace the predictions for the atoms they cover.
// Structures are found by a key over their deepest atom codes, so stereoisomers share one entry:
// the store is used only where that can't matter (see hasStereoisomers).

import { envCodes, hash52, MAX_RADIUS, ringInfo, type EnvGraph } from './env';
import { stereoStates } from './features';
import type { AtomShifts, Nucleus } from './lookup';

interface Header { version: number; scale: Record<Nucleus, number>; solvents: string[]; count: number; entries: number }

/** One measured shift of a structure: the atom (position of its deepest code among the structure's
 * distinct deepest codes, sorted), nucleus, solvent and value. */
export interface MeasuredShift { atom: number; nuc: Nucleus; solvent: string | null; value: number }

/** The whole-structure key: hash52 of the sorted deepest atom codes (as train_lookup.py mol_key). */
export function structureKey(codes: string[][]): number {
  return parseInt(hash52(codes.map((c) => c[c.length - 1]).sort().join(',')), 16);
}

/** Each atom's position among the structure's distinct deepest codes, sorted (as the store names atoms). */
export function atomPositions(codes: string[][]): number[] {
  const deep = codes.map((c) => parseInt(c[c.length - 1], 16));
  const uniq = [...new Set(deep)].sort((a, b) => a - b);
  return deep.map((d) => uniq.indexOf(d));
}

/**
 * Whether the structure has diastereomers (two or more stereocentres, cis/trans on a ring, or a
 * double bond that can be E or Z). The store's key ignores stereochemistry, so its shifts could belong to another isomer
 * (E for Z, cis for trans, neomenthol for menthol): such structures keep their predictions. One
 * stereocentre alone is fine, as enantiomers have the same shifts.
 */
export function hasStereoisomers(g: EnvGraph): boolean {
  const ri = ringInfo(g);
  if (stereoStates(g, ri.degree).filter((x) => x !== 0).length >= 2) return true;
  const cls = envCodes(g, MAX_RADIUS).map((c) => c[MAX_RADIUS]);
  const nb: number[][] = g.atoms.map(() => []);
  for (const b of g.bonds) { nb[b.u].push(b.v); nb[b.v].push(b.u); }
  // cis/trans on a ring drawn without wedges (4-t-butylcyclohexanol, decalin): two sp3 carbons in
  // one ring system that each carry two different groups off the ring (a hydrogen counts as one),
  // or a hydrogen at a ring fusion
  const multiple = new Set<number>();
  g.bonds.forEach((b) => { if (b.o > 1) { multiple.add(b.u); multiple.add(b.v); } });
  const root = g.atoms.map((_, i) => i);
  const find = (x: number): number => (root[x] === x ? x : (root[x] = find(root[x])));
  const ringBond = new Map<string, boolean>();
  g.bonds.forEach((b, i) => { ringBond.set(`${b.u},${b.v}`, ri.bond[i] > 0); ringBond.set(`${b.v},${b.u}`, ri.bond[i] > 0); if (ri.bond[i] > 0) root[find(b.u)] = find(b.v); });
  const seen = new Set<number>();
  for (let i = 0; i < g.atoms.length; i++) {
    const a = g.atoms[i];
    if (!ri.atom[i] || a.el !== 'C' || a.arom || multiple.has(i) || a.h > 1 || ri.degree[i] + a.h !== 4) continue;
    const inRing = nb[i].filter((n) => ringBond.get(`${i},${n}`)).length;
    const off = nb[i].filter((n) => !ringBond.get(`${i},${n}`)).map((n) => cls[n]);
    if (a.h) off.push('H');
    if (!((inRing === 2 && off.length === 2 && off[0] !== off[1]) || (inRing === 3 && a.h === 1))) continue;
    if (seen.has(find(i))) return true;
    seen.add(find(i));
  }
  // an end of a double bond with two different substituents (a hydrogen counts as one)
  const twoKinds = (x: number, other: number) => {
    const subs = nb[x].filter((y) => y !== other).map((y) => cls[y]);
    const h = g.atoms[x].h;
    if (subs.length + h !== 2) return false;
    return h === 1 ? subs.length === 1 : subs.length === 2 && subs[0] !== subs[1];
  };
  return g.bonds.some((b, i) => b.o === 2 && !(g.atoms[b.u].arom && g.atoms[b.v].arom) && !(ri.bond[i] > 0 && ri.bond[i] < 8)
    && (b.ez === 'E' || b.ez === 'Z' || (twoKinds(b.u, b.v) && twoKinds(b.v, b.u))));
}

export class MeasuredStore {
  private readonly head: Header;
  private readonly keys: Float64Array;
  private readonly src: Uint32Array;
  private readonly off: Uint32Array;
  private readonly atoms: Uint8Array;
  private readonly vals: Int16Array;
  private readonly kinds: Uint8Array;

  constructor(buf: ArrayBuffer) {
    const dv = new DataView(buf);
    if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) !== 'NMRM') throw new Error('Not an NMR measured-shift store');
    const len = dv.getUint32(8, true);
    this.head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, len))) as Header;
    if (this.head.version !== 1) throw new Error(`NMR measured-shift store version ${this.head.version} is not supported`);
    let off = 12 + len;
    off += (8 - (off % 8)) % 8;
    const take = <T>(make: (o: number, n: number) => T, bytes: number, n: number): T => {
      const a = make(off, n);
      off += bytes * n;
      off += (8 - (off % 8)) % 8;
      return a;
    };
    const { count, entries } = this.head;
    this.keys = take((o, n) => new Float64Array(buf, o, n), 8, count);
    this.src = take((o, n) => new Uint32Array(buf, o, n), 4, count);
    this.off = take((o, n) => new Uint32Array(buf, o, n), 4, count + 1);
    this.atoms = take((o, n) => new Uint8Array(buf, o, n), 1, entries);
    this.vals = take((o, n) => new Int16Array(buf, o, n), 2, entries);
    this.kinds = take((o, n) => new Uint8Array(buf, o, n), 1, entries);
  }

  get size(): number { return this.head.count; }

  /** The structure's measured shifts and where they come from, or null when it is not in the store. */
  find(key: number): { source: string; shifts: MeasuredShift[] } | null {
    let lo = 0, hi = this.head.count - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const k = this.keys[mid];
      if (k === key) {
        const shifts: MeasuredShift[] = [];
        for (let e = this.off[mid]; e < this.off[mid + 1]; e++) {
          const kind = this.kinds[e];
          const nuc: Nucleus = kind & 0x80 ? '1H' : '13C';
          const si = kind & 0x7f;
          shifts.push({ atom: this.atoms[e], nuc, solvent: si ? this.head.solvents[si - 1] ?? null : null, value: this.vals[e] / this.head.scale[nuc] });
        }
        const s = this.src[mid];
        return { source: s & 0x80000000 ? `PMC${s & 0x7fffffff}` : `NMRShiftDB2 ${s}`, shifts };
      }
      if (k < key) lo = mid + 1; else hi = mid - 1;
    }
    return null;
  }

  /**
   * Replaces predictions with the structure's measured shifts taken in the given solvent (or with no
   * solvent recorded). Returns how many atoms changed. Structures with diastereomers are left alone
   * (the store can't tell them apart).
   */
  apply(g: EnvGraph, shifts: AtomShifts[], solvent: string): number {
    if (hasStereoisomers(g)) return 0;
    const codes = envCodes(g);
    const hit = this.find(structureKey(codes));
    if (!hit) return 0;
    const pos = atomPositions(codes);
    const pick = (atom: number, nuc: Nucleus) => {
      const ms = hit.shifts.filter((m) => m.atom === atom && m.nuc === nuc);
      return ms.find((m) => m.solvent === solvent) ?? ms.find((m) => m.solvent === null) ?? null;
    };
    let changed = 0;
    shifts.forEach((s, i) => {
      for (const nuc of ['13C', '1H'] as const) {
        const field = nuc === '13C' ? 'c13' : 'h1';
        if (!s[field]) continue;
        const m = pick(pos[i], nuc);
        if (!m) continue;
        s[field] = { value: m.value, spread: 0, radius: codes[i].length - 1, n: 1, measured: { source: hit.source, solvent: m.solvent } };
        changed++;
      }
    });
    return changed;
  }
}
