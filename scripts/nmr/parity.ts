// Checks that the app's reader (src/chem/nmr/lookup.ts) gives the same shifts as the Python build
// for the parity file written next to the table. Bundle with esbuild and run in Node:
//   node parity.mjs nmr-hose.dat
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { ShiftTable } from '../../src/chem/nmr/lookup';

const require = createRequire(import.meta.url);
const RDKit = await require(process.cwd() + '/node_modules/@rdkit/rdkit/dist/RDKit_minimal.js')();
const path = process.argv[2];
const buf = readFileSync(path);
const t0 = performance.now();
const table = new ShiftTable(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const loadMs = performance.now() - t0;
const par = JSON.parse(readFileSync(path + '.parity.json', 'utf8')) as { smiles: string; c13: [number, number | null][]; h1: [number, number | null][] }[];
let n = 0, worst = 0, miss = 0, ms = 0;
for (const p of par) {
  const mol = RDKit.get_mol(p.smiles);
  const g = namerGraph(mol);
  mol.delete();
  const s = performance.now();
  const got = table.predictAll(g, 'CDCl3');
  ms += performance.now() - s;
  for (const [nuc, list] of [['c13', p.c13], ['h1', p.h1]] as const) {
    for (const [atom, want] of list) {
      const hit = got[atom][nuc];
      if ((want === null) !== (hit === null)) { miss++; continue; }
      if (want === null || !hit) continue;
      worst = Math.max(worst, Math.abs(hit.value - want));
      n++;
    }
  }
}
console.log(JSON.stringify({ compared: n, mismatched_presence: miss, worst_ppm: +worst.toFixed(4), load_ms: Math.round(loadMs), predict_ms_per_compound: +(ms / par.length).toFixed(2) }));
