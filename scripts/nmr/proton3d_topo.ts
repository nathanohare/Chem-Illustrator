// Structure features and flags for each sp3 CH2 (src/chem/nmr/proton3d.ts ch2Topology, model3d-build.ts
// ch2Flags), with the app's own code, for fitting the CH2 split. No conformers needed.
// Input JSONL {id, molblock, ch2: [{c}]}; output JSONL {id, stereo, dia: [c], topo: {c: [...]}}.
//   node proton3d_topo.mjs IN.jsonl OUT.jsonl
import { createReadStream, openSync, writeSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Molecule } from 'openchemlib';
import { absoluteMolfile, ch2Flags } from '../../src/chem/model3d-build';
import { ch2Topology } from '../../src/chem/nmr/proton3d';

const [inp, outp] = process.argv.slice(2);
const w = openSync(outp, 'w');
const seen = new Set<string>();
for await (const line of createInterface({ input: createReadStream(inp) })) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as { id: string; molblock: string; ch2: { c: number }[] };
  if (seen.has(r.id)) continue;
  seen.add(r.id);
  try {
    const mol = Molecule.fromMolfile(absoluteMolfile(r.molblock));
    mol.ensureHelperArrays(Molecule.cHelperRings);
    const { stereo, diaCH2 } = ch2Flags(mol);
    const atoms = [], bonds = [];
    for (let i = 0; i < mol.getAllAtoms(); i++) atoms.push({ z: mol.getAtomicNo(i), charge: mol.getAtomCharge(i) });
    for (let b = 0; b < mol.getAllBonds(); b++) bonds.push({ a: mol.getBondAtom(0, b), b: mol.getBondAtom(1, b), order: mol.getBondOrder(b), aromatic: mol.isAromaticBond(b) });
    const topo: Record<number, number[]> = {};
    for (const { c } of r.ch2) topo[c] = ch2Topology({ atoms, bonds }, c, stereo);
    writeSync(w, JSON.stringify({ id: r.id, stereo, dia: diaCH2, topo }) + '\n');
  } catch (e) { process.stderr.write(`${r.id}: ${String(e)}\n`); }
}
closeSync(w);
