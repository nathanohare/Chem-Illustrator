// Predicted 1H spectrum of one structure (shifts as the app predicts them, couplings from coupling.ts,
// exact simulation per coupled cluster with spin.ts), as JSON for mockups and checks.
//   node spectrum_demo.mjs TABLE NET SMILES [MHz] > out.json
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { envCodes } from '../../src/chem/nmr/env';
import { ShiftTable } from '../../src/chem/nmr/lookup';
import { ShiftNet } from '../../src/chem/nmr/net';
import { predictCouplings, protonGroups } from '../../src/chem/nmr/coupling';
import { lorentzian, transitions } from '../../src/chem/nmr/spin';

const require = createRequire(import.meta.url);
const RDKit = await require(process.cwd() + '/node_modules/@rdkit/rdkit/dist/RDKit_minimal.js')();
const [tablePath, netPath, smiles, mhzArg] = process.argv.slice(2);
const sf = Number(mhzArg ?? 400);
const read = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const table = new ShiftTable(read(tablePath));
const net = new ShiftNet(read(netPath));
const mol = RDKit.get_mol(smiles);
const g = namerGraph(mol);
mol.delete();
const shifts = table.predictAll(g, 'CDCl3');
net.apply(g, shifts, 'CDCl3');
const h1 = g.atoms.map(() => NaN);
for (const s of shifts) if (s.hCount && s.h1) h1[s.atom] = s.h1.value;
const codes = envCodes(g).map((c) => c[c.length - 1]);
const groups = protonGroups(g, h1, codes);
// spins: one per hydrogen on carbon (exchangeable H as uncoupled singlets)
const spins: { atom: number; shift: number }[] = [];
g.atoms.forEach((a, i) => { if (!Number.isNaN(h1[i])) for (let k = 0; k < a.h; k++) spins.push({ atom: i, shift: h1[i] }); });
const cs = predictCouplings(g).filter((c) => g.atoms[c.b].el !== 'F' && g.atoms[c.a].el !== 'F');
const J = spins.map(() => spins.map(() => 0));
spins.forEach((s, x) => spins.forEach((t, y) => {
  if (x === y) return;
  for (const c of cs) {
    if (c.a === c.b && s.atom === c.a && t.atom === c.a) J[x][y] = c.j;
    else if ((c.a === s.atom && c.b === t.atom) || (c.b === s.atom && c.a === t.atom)) J[x][y] = c.j;
  }
}));
// clusters: connected components of the coupling graph
const seen = new Set<number>(); const clusters: number[][] = [];
spins.forEach((_, x) => {
  if (seen.has(x)) return;
  const comp = [x]; seen.add(x);
  for (let q = 0; q < comp.length; q++) spins.forEach((_, y) => { if (!seen.has(y) && Math.abs(J[comp[q]][y]) >= 0.3) { seen.add(y); comp.push(y); } });
  clusters.push(comp);
});
const lo = -0.5, hi = 10.5, N = 8000;
const ppm = Array.from({ length: N }, (_, i) => hi - ((hi - lo) * i) / (N - 1));
const y = new Float64Array(N);
for (const comp of clusters) {
  // methyl-type equivalent spins with no partners are singlets; big clusters are simulated exactly
  const sys = { shifts: comp.map((x) => spins[x].shift), j: comp.map((x) => comp.map((z) => J[x][z])), widths: 0.9 };
  const l = transitions(sys, sf);
  const part = lorentzian(l, ppm.map((p) => p * sf));
  for (let i = 0; i < N; i++) y[i] += part[i];
}
console.log(JSON.stringify({ smiles, sf, el: g.atoms.map((a) => a.el), hcount: g.atoms.map((a) => a.h), groups, clusters: clusters.map((c) => c.length), ppm: ppm.map((p) => +p.toFixed(4)), y: [...y].map((v) => +v.toFixed(5)) }));
