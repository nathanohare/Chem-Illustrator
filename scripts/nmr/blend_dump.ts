// Per-atom lookup hits and network predictions with the app's own readers, for tuning how the two
// are blended (scripts/nmr/blend_tune.py). Input JSONL {id, smiles, solvents: [..]}; output JSONL
// {id, solvent, el, h, look: [[value, spread, radius, n] | null per nucleus], net: [[c13, c13sd, h1, h1sd]]}.
//   node blend_dump.mjs TABLE NET IN.jsonl OUT.jsonl
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
const hit = (h: { value: number; spread: number; radius: number; n: number } | null) => (h ? [+h.value.toFixed(3), +h.spread.toFixed(3), h.radius, h.n] : null);
let n = 0;
for await (const line of createInterface({ input: createReadStream(inp) })) {
  if (!line.trim()) continue;
  const { id, smiles, solvents } = JSON.parse(line) as { id: string; smiles: string; solvents: (string | null)[] };
  const mol = RDKit.get_mol(smiles);
  if (!mol || !mol.is_valid()) continue;
  const g = namerGraph(mol);
  mol.delete();
  for (const solvent of solvents) {
    const look = table.predictAll(g, solvent ?? 'CDCl3');
    const nn = net.predict(g, solvent);
    w.write(JSON.stringify({ id, solvent, el: g.atoms.map((a) => a.el), h: g.atoms.map((a) => a.h),
      look: look.map((s) => [hit(s.c13), hit(s.h1)]), net: nn.map((s) => [s.c13, s.c13sd, s.h1, s.h1sd].map((v) => +v.toFixed(3))) }) + '\n');
  }
  if (++n % 2000 === 0) console.error(n);
}
w.end();
