// Environment codes for a list of SMILES, with the app's own code (src/chem/nmr/env.ts) and RDKit.
// Input JSONL lines {id, smiles}; output JSONL {id, ok, el, h, codes}. Bundle with esbuild and run in Node:
//   npx esbuild scripts/nmr/env_codes.ts --bundle --platform=node --format=esm --outfile=/tmp/env_codes.mjs
//   node /tmp/env_codes.mjs IN.jsonl OUT.jsonl
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { envCodes } from '../../src/chem/nmr/env';

const require = createRequire(import.meta.url);
const init = require(process.cwd() + '/node_modules/@rdkit/rdkit/dist/RDKit_minimal.js');
const RDKit = await init();
const [inp, out] = process.argv.slice(2);
const w = createWriteStream(out);
let n = 0, bad = 0;
for await (const line of createInterface({ input: createReadStream(inp) })) {
  if (!line.trim()) continue;
  const { id, smiles } = JSON.parse(line) as { id: string; smiles: string };
  let rec: object = { id, ok: false };
  const mol = RDKit.get_mol(smiles);
  if (mol && mol.is_valid()) {
    try {
      const g = namerGraph(mol);
      rec = { id, ok: true, el: g.atoms.map((a) => a.el), h: g.atoms.map((a) => a.h), codes: envCodes(g) };
    } catch { bad++; }
    mol.delete();
  } else bad++;
  w.write(JSON.stringify(rec) + '\n');
  if (++n % 20000 === 0) console.error(n);
}
w.end();
console.error(`done ${n}, failed ${bad}`);
