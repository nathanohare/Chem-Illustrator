// Predicts shifts for SMILES with the app's reader: node predict_one.mjs TABLE SMILES [SOLVENT]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { namerGraph } from '../../src/chem/namer-graph';
import { ShiftTable } from '../../src/chem/nmr/lookup';

const require = createRequire(import.meta.url);
const RDKit = await require(process.cwd() + '/node_modules/@rdkit/rdkit/dist/RDKit_minimal.js')();
const [path, smiles, solvent] = process.argv.slice(2);
const buf = readFileSync(path);
const table = new ShiftTable(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const mol = RDKit.get_mol(smiles);
const g = namerGraph(mol);
console.log(JSON.stringify({ el: g.atoms.map((a) => a.el), shifts: table.predictAll(g, solvent ?? 'CDCl3') }));
