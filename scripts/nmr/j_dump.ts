// Predicted 1H groups with first-order multiplets (shifts as the app predicts them, couplings from
// src/chem/nmr/coupling.ts), for scoring against published multiplicities and J values (j_bench.py).
// Input JSONL {id, smiles, solvent}; output JSONL {id, groups: [{shift, n, mult, j, atoms}]}.
//   node j_dump.mjs TABLE NET IN.jsonl OUT.jsonl
import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { envCodes } from '../../src/chem/nmr/env';
import { ShiftTable } from '../../src/chem/nmr/lookup';
import { ShiftNet } from '../../src/chem/nmr/net';
import { protonGroups, setJOptions } from '../../src/chem/nmr/coupling';
if (process.env.JOPTS) setJOptions(JSON.parse(process.env.JOPTS));

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
  const h1 = g.atoms.map(() => NaN);
  for (const s of shifts) if (s.hCount && s.h1) h1[s.atom] = s.h1.value;
  const codes = envCodes(g).map((c) => c[c.length - 1]);
  const groups = protonGroups(g, h1, codes).map((x) => ({ ...x, shift: +x.shift.toFixed(3) }));
  w.write(JSON.stringify({ id, groups }) + '\n');
}
w.end();
