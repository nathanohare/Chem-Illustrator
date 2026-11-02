import { describe, expect, it } from 'vitest';
import { envCodes, type EnvGraph } from '../src/chem/nmr/env';
import { atomPositions, MeasuredStore, structureKey } from '../src/chem/nmr/measured';

// Ethanol: C0 (CH3), C1 (CH2), O2 (OH)
const ethanol: EnvGraph = {
  atoms: [{ el: 'C', q: 0, arom: false, h: 3 }, { el: 'C', q: 0, arom: false, h: 2 }, { el: 'O', q: 0, arom: false, h: 1 }],
  bonds: [{ u: 0, v: 1, o: 1 }, { u: 1, v: 2, o: 1 }],
};

/** A store in the shipped layout holding one structure. */
function store(key: number, src: number, entries: { atom: number; h: boolean; solvent: number; ppm: number }[]): ArrayBuffer {
  const scale = { '13C': 50, '1H': 1000 };
  const head = new TextEncoder().encode(JSON.stringify({ version: 1, scale, solvents: ['CDCl3', 'DMSO-d6'], count: 1, entries: entries.length }));
  const parts: Uint8Array[] = [];
  const pad = (b: Uint8Array) => { parts.push(b); const p = (8 - (b.length % 8)) % 8; if (p) parts.push(new Uint8Array(p)); };
  const pre = new Uint8Array(12 + head.length);
  pre.set(new TextEncoder().encode('NMRM'));
  new DataView(pre.buffer).setUint32(4, 1, true);
  new DataView(pre.buffer).setUint32(8, head.length, true);
  pre.set(head, 12);
  pad(pre);
  pad(new Uint8Array(new Float64Array([key]).buffer));
  pad(new Uint8Array(new Uint32Array([src]).buffer));
  pad(new Uint8Array(new Uint32Array([0, entries.length]).buffer));
  pad(new Uint8Array(entries.map((e) => e.atom)));
  pad(new Uint8Array(new Int16Array(entries.map((e) => Math.round(e.ppm * (e.h ? 1000 : 50)))).buffer));
  pad(new Uint8Array(entries.map((e) => (e.h ? 0x80 : 0) | e.solvent)));
  const out = new Uint8Array(parts.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

describe('measured-shift store', () => {
  const codes = envCodes(ethanol);
  const pos = atomPositions(codes);
  const deep = (i: number) => pos[i];
  const buf = store(structureKey(codes), 0x80000000 | 1399459, [
    { atom: deep(0), h: false, solvent: 1, ppm: 18.1 },
    { atom: deep(1), h: false, solvent: 1, ppm: 58.2 },
    { atom: deep(1), h: true, solvent: 2, ppm: 3.44 },
  ]);

  it('finds a structure by its key and names the source', () => {
    const hit = new MeasuredStore(buf).find(structureKey(codes));
    expect(hit?.source).toBe('PMC1399459');
    expect(hit?.shifts.map((s) => s.value)).toEqual([18.1, 58.2, 3.44]);
  });

  it('replaces predictions only in the matching solvent', () => {
    const p = () => ({ value: 0, spread: 1, radius: 3, n: 5 });
    const shifts = [0, 1, 2].map((i) => ({ atom: i, c13: i < 2 ? p() : null, h1: p(), hCount: ethanol.atoms[i].h }));
    expect(new MeasuredStore(buf).apply(ethanol, shifts, 'CDCl3')).toBe(2);
    expect(shifts[1].c13?.value).toBe(58.2);
    expect(shifts[1].c13?.measured?.source).toBe('PMC1399459');
    expect(shifts[1].h1?.measured).toBeUndefined();
  });

  it('ignores structures it does not hold', () => {
    expect(new MeasuredStore(buf).find(123)).toBeNull();
  });
});
