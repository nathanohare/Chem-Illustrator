// Predicts shifts exactly as the app's NMR panel does (lookup table, then networks blended in),
// for a head-to-head against other programs (scripts/nmr/head_to_head.py).
// Input JSONL {id, smiles, solvent}; output JSONL {id, 13C: [ppm per carbon], 1H: [[ppm, H count] per atom]}.
//   node app_predict.mjs TABLE NET IN.jsonl OUT.jsonl
import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { ShiftTable } from '../../src/chem/nmr/lookup';
import { ShiftNet } from '../../src/chem/nmr/net';

const require = createRequire(import.meta.url);
const RDKit = await require(process.cwd() + '/node_modules/@rdkit/rdkit/dist/RDKit_minimal.js')();
const [tablePath, netPath, inp, out] = process.argv.slice(2);
const read = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const table = new ShiftTable(read(tablePath));
const net = new ShiftNet(read(netPath));
const w = createWriteStream(out);
for await (const line of createInterface({ input: createReadStream(inp) })) {
  if (!line.trim()) continue;
  const { id, smiles, solvent } = JSON.parse(line) as { id: string; smiles: string; solvent: string };
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) continue;
  const g = namerGraph(mol);
  mol.delete();
  const shifts = table.predictAll(g, solvent);
  net.apply(g, shifts, solvent);
  const c13: number[] = [], h1: [number, number][] = [];
  for (const s of shifts) {
    if (g.atoms[s.atom].el === 'C' && s.c13) c13.push(+s.c13.value.toFixed(2));
    if (s.hCount && s.h1) h1.push([+s.h1.value.toFixed(3), s.hCount]);
  }
  w.write(JSON.stringify({ id, '13C': c13, '1H': h1 }) + '\n');
}
w.end();
