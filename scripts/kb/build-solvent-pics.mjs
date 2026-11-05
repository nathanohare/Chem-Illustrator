// Works out a 2-D drawing of each solvent in the Knowledge Base's Solvents table (src/kb/solvents.ts)
// with RDKit, for the structure shown when the pointer rests on a solvent's name, and writes
// src/kb/solvent-pics.json, keyed by SMILES: atoms ([x, y in bond lengths, y down, element,
// charge?]) and bonds (Kekulé orders), centred on the origin and laid out wider than tall.
// Run: node scripts/kb/build-solvent-pics.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import initRDKit from '@rdkit/rdkit';

const RD = await initRDKit();
const r3 = (v) => Math.round(v * 1000) / 1000;
const src = readFileSync(new URL('../../src/kb/solvents.ts', import.meta.url), 'utf8');
const smiles = [...new Set([...src.matchAll(/smiles: '([^']+)'/g)].map((m) => m[1]))];

function drawing(s) {
  const mol = RD.get_mol(s);
  if (!mol) return null;
  mol.set_new_coords?.(true);
  const lines = mol.get_molblock().split('\n');
  mol.delete();
  const [na, nb] = [Number(lines[3].slice(0, 3)), Number(lines[3].slice(3, 6))];
  const atoms = [], bonds = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    atoms.push({ x: Number(l.slice(0, 10)), y: -Number(l.slice(10, 20)), el: l.slice(31, 34).trim(), iso: 0, charge: 0 });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push([Number(l.slice(0, 3)) - 1, Number(l.slice(3, 6)) - 1, Number(l.slice(6, 9))]);
  }
  for (const l of lines) {
    const m = /^M {2}(CHG|ISO)\s+(\d+)(.*)$/.exec(l);
    if (!m) continue;
    const v = m[3].trim().split(/\s+/).map(Number);
    for (let k = 0; k < v.length; k += 2) atoms[v[k] - 1][m[1] === 'CHG' ? 'charge' : 'iso'] = v[k + 1];
  }
  const L = bonds.reduce((t, [a, b]) => t + Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y), 0) / (bonds.length || 1) || 1;
  // the long way across, level
  let sxx = 0, syy = 0, sxy = 0;
  const cx = atoms.reduce((t, a) => t + a.x, 0) / na, cy = atoms.reduce((t, a) => t + a.y, 0) / na;
  for (const a of atoms) { const x = a.x - cx, y = a.y - cy; sxx += x * x; syy += y * y; sxy += x * y; }
  const rot = -0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(rot), sn = Math.sin(rot);
  return {
    atoms: atoms.map((a) => {
      const x = (a.x - cx) / L, y = (a.y - cy) / L;
      // deuterium written D
      const t = [r3(x * c - y * sn), r3(x * sn + y * c), a.el === 'H' && a.iso === 2 ? 'D' : a.el];
      if (a.charge) t.push(a.charge);
      return t;
    }),
    bonds,
  };
}

const pics = {};
for (const s of smiles) {
  const d = drawing(s);
  if (d) pics[s] = d;
  else console.warn('no drawing for', s);
}
writeFileSync(new URL('../../src/kb/solvent-pics.json', import.meta.url), JSON.stringify(pics) + '\n');
console.log(Object.keys(pics).length, 'solvents drawn');
