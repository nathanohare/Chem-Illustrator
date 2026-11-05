// Vicinal 3JHH from 3-D conformers (src/chem/nmr/karplus.ts) against measured couplings: the
// Dickson et al. 2025 benchmark (Analyst, doi 10.1039/d5an00240k, ESI tables 12, 15, 16), turned
// into JSON by a local script (the ESI's data licence is not stated, so it is not kept here).
// Scores H–C(sp3)–C(sp3)–H pairs four ways: HLA on the authors' DFT conformers and populations,
// HLA on the app's own conformers (OpenChemLib + MMFF94s+), the 2-D rules (coupling.ts), and the
// authors' DFT couplings.
//   node j3d_bench.mjs bench.json
import { readFileSync } from 'node:fs';
import { Resources } from 'openchemlib';
import { buildModel, withPopulations, type Model3d } from '../../src/chem/model3d-build';
import { vicinal3d } from '../../src/chem/nmr/karplus';
import { predictCouplings, type JGraph } from '../../src/chem/nmr/coupling';

Resources.registerFromNodejs();
interface J { h1: number; h2: number; n: number; exp: number; dft: number; bench: boolean }
interface Mol { z: number[]; bonds: Model3d['bonds']; molblock: string | null; conformers: { xyz: number[]; population: number }[]; j: J[] }
const data = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Record<string, Mol>;
const EL: Record<number, string> = { 1: 'H', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 16: 'S', 17: 'Cl' };

const rows: { mol: string; exp: number; dft: number; bench: boolean; hlaDft: number; hlaOwn: number; rule: number }[] = [];
for (const [name, m] of Object.entries(data)) {
  const nb: number[][] = m.z.map(() => []);
  for (const b of m.bonds) { nb[b.a].push(b.b); nb[b.b].push(b.a); }
  const parent = (h: number) => nb[h][0];
  // A: the authors' DFT conformers and populations
  const dftModel: Model3d = { atoms: m.z.map((z) => ({ z, charge: 0 })), bonds: m.bonds, conformers: m.conformers.map((c) => ({ xyz: c.xyz, energy: 0, population: c.population })) };
  const key = (a: number, b: number) => `${Math.min(a, b)},${Math.max(a, b)}`;
  const A = new Map(vicinal3d(dftModel).map((v) => [key(v.h1, v.h2), v.j]));
  // B: the app's conformers from the same structure (explicit H, DFT atom order); H matched by parent and handedness
  const B = new Map<string, number>();
  const own = m.molblock ? buildModel(m.molblock, 30, 1) : null;
  if (own) {
    const ownModel = { ...own, conformers: withPopulations(own.conformers) };
    const onb: number[][] = own.atoms.map(() => []);
    for (const b of own.bonds) { onb[b.a].push(b.b); onb[b.b].push(b.a); }
    const heavyD = m.z.map((z, i) => (z > 1 ? i : -1)).filter((i) => i >= 0);
    const heavyO = own.atoms.map((a, i) => (a.z > 1 ? i : -1)).filter((i) => i >= 0);
    if (heavyD.length === heavyO.length && heavyD.every((d, k) => m.z[d] === own.atoms[heavyO[k]].z)) {
      const o2d = new Map(heavyO.map((o, k) => [o, heavyD[k]] as [number, number]));
      // handedness of H around its carbon: sign of the triple product with the carbon's two lowest-numbered heavy neighbours
      const hand = (x: number[], c: number, h: number, hv: number[]) => {
        const v = (i: number) => [x[3 * i] - x[3 * c], x[3 * i + 1] - x[3 * c + 1], x[3 * i + 2] - x[3 * c + 2]];
        const [p, q, r] = [v(hv[0]), v(hv[1]), v(h)];
        return Math.sign(p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]));
      };
      const hMap = new Map<number, number>();
      for (const o of heavyO) {
        const d = o2d.get(o)!;
        const hsO = onb[o].filter((k) => own.atoms[k].z === 1), hsD = nb[d].filter((k) => m.z[k] === 1);
        if (hsO.length !== hsD.length) continue;
        if (hsO.length === 1) { hMap.set(hsO[0], hsD[0]); continue; }
        if (hsO.length !== 2) { hsO.forEach((h, k) => hMap.set(h, hsD[k])); continue; } // methyls: averaged anyway
        const hvO = onb[o].filter((k) => own.atoms[k].z > 1).sort((p, q) => o2d.get(p)! - o2d.get(q)!);
        const hvD = hvO.map((k) => o2d.get(k)!);
        if (hvO.length < 2) continue;
        const sO = hand(own.conformers[0].xyz, o, hsO[0], hvO), sD = hand(m.conformers[0].xyz, d, hsD[0], hvD);
        hMap.set(hsO[0], sO === sD ? hsD[0] : hsD[1]); hMap.set(hsO[1], sO === sD ? hsD[1] : hsD[0]);
      }
      for (const v of vicinal3d(ownModel)) {
        const a = hMap.get(v.h1), b = hMap.get(v.h2);
        if (a !== undefined && b !== undefined) B.set(key(a, b), v.j);
      }
    } else console.error(name, 'own model atoms differ');
  }
  // C: 2-D rules on the heavy-atom graph
  const heavy = m.z.map((z, i) => (z > 1 ? i : -1)).filter((i) => i >= 0);
  const gi = new Map(heavy.map((d, k) => [d, k] as [number, number]));
  const g: JGraph = {
    atoms: heavy.map((d) => ({ el: EL[m.z[d]] ?? 'C', arom: m.bonds.some((b) => b.aromatic && (b.a === d || b.b === d)), h: nb[d].filter((k) => m.z[k] === 1).length, legacy: m.z[d] === 6 && nb[d].length === 4 ? 'x' : null })),
    bonds: m.bonds.filter((b) => m.z[b.a] > 1 && m.z[b.b] > 1).map((b) => ({ u: gi.get(b.a)!, v: gi.get(b.b)!, o: b.aromatic ? 2 : b.order })),
  };
  const C = new Map(predictCouplings(g).filter((c) => c.a !== c.b).map((c) => [`${c.a},${c.b}`, c.j]));
  for (const j of m.j) {
    if (j.n !== 3) continue;
    const k = key(j.h1, j.h2);
    if (!A.has(k)) continue; // not H–C(sp3)–C(sp3)–H
    const ga = gi.get(parent(j.h1))!, gb = gi.get(parent(j.h2))!;
    rows.push({ mol: name, exp: j.exp, dft: j.dft, bench: j.bench, hlaDft: A.get(k)!, hlaOwn: B.get(k) ?? NaN, rule: C.get(`${Math.min(ga, gb)},${Math.max(ga, gb)}`) ?? 0 });
  }
}
const mae = (rs: typeof rows, f: (r: (typeof rows)[0]) => number) => { const v = rs.filter((r) => Number.isFinite(f(r))); return `${(v.reduce((t, r) => t + Math.abs(f(r) - r.exp), 0) / v.length).toFixed(2)} (${v.length})`; };
const report = (label: string, rs: typeof rows) => console.log(`${label.padEnd(22)} n=${rs.length}  DFT ${mae(rs, (r) => r.dft)}  HLA/DFT-geom ${mae(rs, (r) => r.hlaDft)}  HLA/own ${mae(rs, (r) => r.hlaOwn)}  2-D rules ${mae(rs, (r) => r.rule)}`);
report('all sp3 3JHH', rows);
report('benchmark subset', rows.filter((r) => r.bench));
for (const name of Object.keys(data)) { const rs = rows.filter((r) => r.mol === name); if (rs.length) report(name, rs); }
if (process.env.ROWS) for (const r of rows) console.log(JSON.stringify(r));
