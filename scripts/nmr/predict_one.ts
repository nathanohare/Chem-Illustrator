// Predicts shifts for SMILES with the app's reader:
//   node predict_one.mjs TABLE SMILES [SOLVENT] [STORE]
// With STORE (nmr-measured.dat), the structure's own measured shifts replace predictions where known.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { ShiftTable } from '../../src/chem/nmr/lookup';
import { MeasuredStore } from '../../src/chem/nmr/measured';

const require = createRequire(import.meta.url);
const RDKit = await require(process.cwd() + '/node_modules/@rdkit/rdkit/dist/RDKit_minimal.js')();
const [path, smiles, solvent, storePath] = process.argv.slice(2);
const read = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const table = new ShiftTable(read(path));
const mol = RDKit.get_mol(smiles);
const g = namerGraph(mol);
const shifts = table.predictAll(g, solvent ?? 'CDCl3');
const measured = storePath ? new MeasuredStore(read(storePath)).apply(g, shifts, solvent ?? 'CDCl3') : 0;
console.log(JSON.stringify({ el: g.atoms.map((a) => a.el), measured, shifts }));
