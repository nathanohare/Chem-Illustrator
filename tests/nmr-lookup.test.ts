import { describe, expect, it } from 'vitest';
import { envCodes, hash52, type EnvGraph } from '../src/chem/nmr/env';
import { ShiftTable } from '../src/chem/nmr/lookup';

// Toluene drawn by hand: ring atoms 0-5 (aromatic), methyl 6 on atom 0.
const toluene: EnvGraph = {
  atoms: [
    { el: 'C', q: 0, arom: true, h: 0 }, { el: 'C', q: 0, arom: true, h: 1 }, { el: 'C', q: 0, arom: true, h: 1 },
    { el: 'C', q: 0, arom: true, h: 1 }, { el: 'C', q: 0, arom: true, h: 1 }, { el: 'C', q: 0, arom: true, h: 1 },
    { el: 'C', q: 0, arom: false, h: 3 },
  ],
  bonds: [
    { u: 0, v: 1, o: 2 }, { u: 1, v: 2, o: 1 }, { u: 2, v: 3, o: 2 }, { u: 3, v: 4, o: 1 }, { u: 4, v: 5, o: 2 }, { u: 5, v: 0, o: 1 },
    { u: 0, v: 6, o: 1 },
  ],
};

/** A one-section-per-radius table in the shipped layout, for the codes given. */
function table(entries: { nuc: '13C' | '1H'; r: number; code: string; ppm: number; n: number }[]): ArrayBuffer {
  const scale = { '13C': 50, '1H': 1000 };
  const groups = new Map<string, typeof entries>();
  for (const e of entries) groups.set(`${e.nuc}|${e.r}`, [...(groups.get(`${e.nuc}|${e.r}`) ?? []), e]);
  const sections = [...groups.entries()].map(([k, es]) => ({ nuc: k.split('|')[0], r: +k.split('|')[1], solvent: null, count: es.length }));
  const head = new TextEncoder().encode(JSON.stringify({ version: 1, scale, params: { '13C': { maxr: 5, depth: 0 }, '1H': { maxr: 4, depth: 0 } }, sections }));
  const pad = (n: number) => (8 - (n % 8)) % 8;
  const parts: Uint8Array[] = [];
  const pre = new Uint8Array(12 + head.length + pad(12 + head.length));
  pre.set(new TextEncoder().encode('NMRH'));
  new DataView(pre.buffer).setUint32(4, 1, true);
  new DataView(pre.buffer).setUint32(8, head.length, true);
  pre.set(head, 12);
  parts.push(pre);
  const push = (a: ArrayBufferView) => { const b = new Uint8Array(a.buffer); parts.push(b, new Uint8Array(pad(b.length))); };
  for (const [, es] of groups) {
    es.sort((a, b) => parseInt(a.code, 16) - parseInt(b.code, 16));
    push(Float64Array.from(es.map((e) => parseInt(e.code, 16))));
    push(Int16Array.from(es.map((e) => Math.round(e.ppm * scale[e.nuc]))));
    push(Uint16Array.from(es.map(() => 10)));
    push(Uint16Array.from(es.map((e) => e.n)));
  }
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

describe('NMR environment codes', () => {
  it('gives symmetry-equivalent atoms the same codes and different atoms different ones', () => {
    const c = envCodes(toluene);
    expect(c[1]).toEqual(c[5]); // the two ortho carbons
    expect(c[2]).toEqual(c[4]); // the two meta carbons
    expect(c[1][2]).not.toEqual(c[2][2]);
    expect(c[0]).toHaveLength(6);
  });

  it('hashes to 13 hex digits that a double holds exactly', () => {
    const h = hash52('C(h3)');
    expect(h).toMatch(/^[0-9a-f]{13}$/);
    expect(Number.isSafeInteger(parseInt(h, 16))).toBe(true);
  });
});

describe('NMR shift table', () => {
  it('reads the deepest matching radius and falls back to shallower ones', () => {
    const c = envCodes(toluene);
    const t = new ShiftTable(table([
      { nuc: '13C', r: 0, code: c[1][0], ppm: 128, n: 500 },
      { nuc: '13C', r: 3, code: c[1][3], ppm: 129.1, n: 12 },
      { nuc: '1H', r: 0, code: c[6][0], ppm: 2.3, n: 40 },
    ]));
    const p = t.predictAll(toluene);
    expect(p[1].c13?.value).toBeCloseTo(129.1, 2);
    expect(p[1].c13?.radius).toBe(3);
    expect(p[3].c13?.value).toBeCloseTo(128, 2); // para carbon: only the atom type matches
    expect(p[6].h1?.value).toBeCloseTo(2.3, 3);
    expect(p[0].h1).toBeNull(); // no hydrogens on the ipso carbon
  });

  it('refuses a file that is not a shift table', () => {
    expect(() => new ShiftTable(new ArrayBuffer(16))).toThrow();
  });
});
