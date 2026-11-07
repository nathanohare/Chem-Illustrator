// Works out a 2-D drawing of each Hammett group (src/kb/hammett.ts) with RDKit, for the pictures in
// the Knowledge Base's Hammett table, and writes src/kb/hammett-pics.json: atoms (x, y in bond
// lengths, y down, element, charge), bonds (Kekulé orders) and the stub atoms ([*], where the group
// joins the ring), turned so the group's bond to the ring points left. Keyed by hammettId (the
// group's Table I number, or V and its Table V number).
// Run: node scripts/kb/build-hammett-pics.mjs

import { writeFileSync } from 'node:fs';
import initRDKit from '@rdkit/rdkit';
import { HAMMETT, hammettId } from '../../src/kb/hammett.ts';

const RD = await initRDKit();
const r3 = (v) => Math.round(v * 1000) / 1000;

function drawing(smiles) {
  const mol = RD.get_mol(smiles);
  if (!mol) return null;
  mol.set_new_coords?.(true);
  const block = mol.get_molblock();
  mol.delete();
  const lines = block.split('\n');
  const [na, nb] = [Number(lines[3].slice(0, 3)), Number(lines[3].slice(3, 6))];
  const atoms = [], bonds = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    atoms.push({ x: Number(l.slice(0, 10)), y: -Number(l.slice(10, 20)), el: l.slice(31, 34).trim(), charge: 0 });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push([Number(l.slice(0, 3)) - 1, Number(l.slice(3, 6)) - 1, Number(l.slice(6, 9))]);
  }
  for (const l of lines) {
    const m = /^M {2}CHG\s+(\d+)(.*)$/.exec(l);
    if (!m) continue;
    const v = m[2].trim().split(/\s+/).map(Number);
    for (let k = 0; k < v.length; k += 2) atoms[v[k] - 1].charge = v[k + 1];
  }
  const stubs = atoms.map((a, i) => (a.el === 'R' || a.el === '*' || a.el === 'R#' ? i : -1)).filter((i) => i >= 0);
  if (!stubs.length) return null;
  // bond length 1, the first stub's bond pointing left
  const L = bonds.reduce((s, [a, b]) => s + Math.hypot(atoms[a].x - atoms[b].x, atoms[a].y - atoms[b].y), 0) / (bonds.length || 1) || 1;
  const s = stubs[0], [nbr] = bonds.filter(([a, b]) => a === s || b === s).map(([a, b]) => (a === s ? b : a));
  let ang = Math.atan2(atoms[s].y - atoms[nbr].y, atoms[s].x - atoms[nbr].x);
  // two stubs (methylenedioxy): the line between them stands upright, the group to the right
  if (stubs.length === 2) {
    const [p, q] = [atoms[stubs[0]], atoms[stubs[1]]];
    const cx = atoms.reduce((t, a) => t + a.x, 0) / atoms.length, cy = atoms.reduce((t, a) => t + a.y, 0) / atoms.length;
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    ang = Math.atan2(my - cy, mx - cx);
  }
  const rot = Math.PI - ang, c = Math.cos(rot), sn = Math.sin(rot);
  const ox = atoms[nbr].x, oy = atoms[nbr].y;
  const out = atoms.map((a) => {
    const x = (a.x - ox) / L, y = (a.y - oy) / L;
    const t = [r3(x * c - y * sn), r3(x * sn + y * c), stubs.includes(atoms.indexOf(a)) ? 'C' : a.el];
    if (a.charge) t.push(a.charge);
    return t;
  });
  return { atoms: out, bonds, stubs };
}

const pics = {};
for (const g of HAMMETT) {
  if (!g.smiles || g.smiles.includes('.')) continue; // carboranes, metal complexes, salts: no plain drawing
  const d = drawing(g.smiles);
  if (d) pics[hammettId(g)] = d;
  else console.warn('no drawing for', g.group);
}
writeFileSync(new URL('../../src/kb/hammett-pics.json', import.meta.url), JSON.stringify(pics) + '\n');
console.log(Object.keys(pics).length, 'groups drawn');
