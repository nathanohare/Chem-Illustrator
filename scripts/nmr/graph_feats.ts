// Network graph features for a list of SMILES, with the app's own code (src/chem/nmr/features.ts).
// Input JSONL {id, smiles}; output JSONL {id, ok, a: atom feature indices, b: [u, v, type]}.
//   npx esbuild scripts/nmr/graph_feats.ts --bundle --platform=node --format=esm --outfile=/tmp/graph_feats.mjs
//   node /tmp/graph_feats.mjs IN.jsonl OUT.jsonl
import { createReadStream, createWriteStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { graphFeatures } from '../../src/chem/nmr/features';

const require = createRequire(import.meta.url);
const RDKit = await require(process.cwd() + '/node_modules/@rdkit/rdkit/dist/RDKit_minimal.js')();
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
      const f = graphFeatures(namerGraph(mol));
      rec = { id, ok: true, a: f.atoms, b: f.bonds };
    } catch { bad++; }
    mol.delete();
  } else bad++;
  w.write(JSON.stringify(rec) + '\n');
  if (++n % 20000 === 0) console.error(n);
}
w.end();
console.error(`done ${n}, failed ${bad}`);
