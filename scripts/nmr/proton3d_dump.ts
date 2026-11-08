// Per-proton 3-D terms (src/chem/nmr/proton3d.ts) for the two protons of each sp3 CH2 in a set of
// structures, for fitting the diastereotopic split (proton3d_fit.py). Input JSONL {id, molblock,
// ch2: [{c, shifts}]}; output JSONL adds per CH2 the terms of both protons and whether they are
// diastereotopic (OpenChemLib's diastereotopic atom IDs).
//   node proton3d_dump.mjs IN.jsonl OUT.jsonl [conformers]
import { createReadStream, openSync, writeSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Molecule, Resources } from 'openchemlib';
import { buildModel, withPopulations } from '../../src/chem/model3d-build';
import { protonTerms } from '../../src/chem/nmr/proton3d';

Resources.registerFromNodejs();
const [inp, outp, nConf] = process.argv.slice(2);
const w = openSync(outp, 'a'); // synchronous appends: nothing is lost if a shard is killed on a timeout
for await (const line of createInterface({ input: createReadStream(inp) })) {
  if (!line.trim()) continue;
  const r = JSON.parse(line) as { id: string; molblock: string; ch2: { c: number; shifts: number[] }[] };
  try {
    const m = buildModel(r.molblock, Number(nConf ?? 30), 1);
    if (!m) continue;
    const model = { ...m, conformers: withPopulations(m.conformers) };
    const terms = protonTerms(model);
    // diastereotopic: OpenChemLib gives the two hydrogens of the carbon different IDs
    const mol = Molecule.fromMolfile(r.molblock);
    mol.addImplicitHydrogens();
    const ids = mol.getDiastereotopicAtomIDs();
    mol.ensureHelperArrays(Molecule.cHelperNeighbours);
    const ch2 = r.ch2.map((x) => {
      const hs = model.bonds.map((b) => (b.a === x.c ? b.b : b.b === x.c ? b.a : -1)).filter((k) => k >= 0 && model.atoms[k].z === 1);
      const oh: number[] = [];
      for (let k = 0; k < mol.getAllAtoms(); k++) if (mol.getAtomicNo(k) === 1 && mol.getConnAtom(k, 0) === x.c) oh.push(k);
      const dia = oh.length === 2 && ids[oh[0]] !== ids[oh[1]];
      return { ...x, dia, terms: hs.length === 2 && terms.has(hs[0]) ? [terms.get(hs[0]), terms.get(hs[1])] : null };
    });
    writeSync(w, JSON.stringify({ id: r.id, ch2 }) + '\n');
  } catch { /* skip structures the force field or generator cannot handle */ }
}
closeSync(w);
