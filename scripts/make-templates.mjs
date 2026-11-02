// Builds src/chem/templates.json, the structures offered by the template tools.
//
// Ring systems, heterocycles and amino acids are laid out by RDKit (CoordGen) from SMILES,
// then turned to sit on the usual 30° grid; sugars, nucleosides and nucleotides are drawn as
// Haworth projections below (their bases laid out by RDKit). (Conformers and
// other 3-D templates are made by make-conformers.py.)
// Every structure is checked: written back as a molfile, it must give the same molecule
// (stereochemistry included) as the SMILES it came from.
//
// Run with:  node scripts/make-templates.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RDKit = await require('@rdkit/rdkit')();
// OPSIN (name to structure), to check the hand-drawn sugars and nucleotides against their names
const { load: loadOpsin, parse: opsin } = await import('../src/vendor/opsin/opsin.js');
{
  const zlib = await import('node:zlib');
  const bytes = zlib.gunzipSync(fs.readFileSync(path.join(root, 'public', 'opsin', 'opsin-data.dat')));
  const err = loadOpsin(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length));
  if (err) throw new Error(`OPSIN: ${err}`);
}

// group, id, name, SMILES, and how to turn it: 'grid' (30° grid), 'ring5' (heteroatom at the
// bottom), 'amino' (backbone across, side chain up) or 'asis' (as RDKit draws it)
const LIST = [
  ['rings', 'naphthalene', 'Naphthalene', 'c1ccc2ccccc2c1'],
  ['rings', 'anthracene', 'Anthracene', 'c1ccc2cc3ccccc3cc2c1'],
  ['rings', 'phenanthrene', 'Phenanthrene', 'c1ccc2c(c1)ccc1ccccc12'],
  ['rings', 'biphenyl', 'Biphenyl', 'c1ccc(cc1)-c1ccccc1'],
  ['rings', 'fluorene', 'Fluorene', 'C1c2ccccc2-c2ccccc12'],
  ['rings', 'indane', 'Indane', 'C1Cc2ccccc2C1'],
  ['rings', 'tetralin', 'Tetralin', 'C1CCc2ccccc2C1'],
  ['rings', 'azulene', 'Azulene', 'c1ccc2cccc2cc1'],
  ['rings', 'decalin', 'Decalin', 'C1CCC2CCCCC2C1'],
  ['rings', 'steroid', 'Steroid skeleton', 'C1CCC2C(C1)CCC1C2CCC2CCCC12'],

  ['heterocycles', 'pyridine', 'Pyridine', 'c1ccncc1'],
  ['heterocycles', 'pyrimidine', 'Pyrimidine', 'c1cncnc1'],
  ['heterocycles', 'pyrazine', 'Pyrazine', 'c1cnccn1'],
  ['heterocycles', 'pyridazine', 'Pyridazine', 'c1ccnnc1'],
  ['heterocycles', 'triazine', '1,3,5-Triazine', 'c1ncncn1'],
  ['heterocycles', 'pyrrole', 'Pyrrole', 'c1cc[nH]c1', 'ring5'],
  ['heterocycles', 'furan', 'Furan', 'c1ccoc1', 'ring5'],
  ['heterocycles', 'thiophene', 'Thiophene', 'c1ccsc1', 'ring5'],
  ['heterocycles', 'imidazole', 'Imidazole', 'c1cnc[nH]1', 'ring5'],
  ['heterocycles', 'pyrazole', 'Pyrazole', 'c1cn[nH]c1', 'ring5'],
  ['heterocycles', 'oxazole', 'Oxazole', 'c1cocn1', 'ring5'],
  ['heterocycles', 'isoxazole', 'Isoxazole', 'c1cnoc1', 'ring5'],
  ['heterocycles', 'thiazole', 'Thiazole', 'c1cscn1', 'ring5'],
  ['heterocycles', 'triazole123', '1,2,3-Triazole', 'c1cn[nH]n1', 'ring5'],
  ['heterocycles', 'triazole124', '1,2,4-Triazole', 'c1nc[nH]n1', 'ring5'],
  ['heterocycles', 'tetrazole', 'Tetrazole', 'c1nnn[nH]1', 'ring5'],
  ['heterocycles', 'indole', 'Indole', 'c1ccc2[nH]ccc2c1'],
  ['heterocycles', 'benzofuran', 'Benzofuran', 'c1ccc2occc2c1'],
  ['heterocycles', 'benzothiophene', 'Benzothiophene', 'c1ccc2sccc2c1'],
  ['heterocycles', 'benzimidazole', 'Benzimidazole', 'c1ccc2[nH]cnc2c1'],
  ['heterocycles', 'benzoxazole', 'Benzoxazole', 'c1ccc2ocnc2c1'],
  ['heterocycles', 'benzothiazole', 'Benzothiazole', 'c1ccc2scnc2c1'],
  ['heterocycles', 'quinoline', 'Quinoline', 'c1ccc2ncccc2c1'],
  ['heterocycles', 'isoquinoline', 'Isoquinoline', 'c1ccc2cnccc2c1'],
  ['heterocycles', 'quinazoline', 'Quinazoline', 'c1ccc2ncncc2c1'],
  ['heterocycles', 'quinoxaline', 'Quinoxaline', 'c1ccc2nccnc2c1'],
  ['heterocycles', 'purine', 'Purine', 'c1ncc2[nH]cnc2n1'],
  ['heterocycles', 'carbazole', 'Carbazole', 'c1ccc2c(c1)[nH]c1ccccc12'],
  ['heterocycles', 'aziridine', 'Aziridine', 'C1CN1'],
  ['heterocycles', 'oxirane', 'Oxirane (epoxide)', 'C1CO1'],
  ['heterocycles', 'azetidine', 'Azetidine', 'C1CNC1'],
  ['heterocycles', 'oxetane', 'Oxetane', 'C1COC1'],
  ['heterocycles', 'pyrrolidine', 'Pyrrolidine', 'C1CCNC1', 'ring5'],
  ['heterocycles', 'thf', 'Tetrahydrofuran', 'C1CCOC1', 'ring5'],
  ['heterocycles', 'dioxolane', '1,3-Dioxolane', 'C1OCCO1', 'ring5'],
  ['heterocycles', 'piperidine', 'Piperidine', 'C1CCNCC1'],
  ['heterocycles', 'piperazine', 'Piperazine', 'C1CNCCN1'],
  ['heterocycles', 'morpholine', 'Morpholine', 'C1COCCN1'],
  ['heterocycles', 'thp', 'Tetrahydropyran', 'C1CCOCC1'],
  ['heterocycles', 'dioxane', '1,4-Dioxane', 'C1COCCO1'],

  ['amino', 'gly', 'Glycine (Gly, G)', 'NCC(=O)O', 'amino'],
  ['amino', 'ala', 'L-Alanine (Ala, A)', 'N[C@@H](C)C(=O)O', 'amino'],
  ['amino', 'val', 'L-Valine (Val, V)', 'N[C@@H](C(C)C)C(=O)O', 'amino'],
  ['amino', 'leu', 'L-Leucine (Leu, L)', 'N[C@@H](CC(C)C)C(=O)O', 'amino'],
  ['amino', 'ile', 'L-Isoleucine (Ile, I)', 'N[C@@H]([C@@H](C)CC)C(=O)O', 'amino'],
  ['amino', 'pro', 'L-Proline (Pro, P)', 'N1CCC[C@H]1C(=O)O', 'amino'],
  ['amino', 'phe', 'L-Phenylalanine (Phe, F)', 'N[C@@H](Cc1ccccc1)C(=O)O', 'amino'],
  ['amino', 'trp', 'L-Tryptophan (Trp, W)', 'N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O', 'amino'],
  ['amino', 'met', 'L-Methionine (Met, M)', 'N[C@@H](CCSC)C(=O)O', 'amino'],
  ['amino', 'ser', 'L-Serine (Ser, S)', 'N[C@@H](CO)C(=O)O', 'amino'],
  ['amino', 'thr', 'L-Threonine (Thr, T)', 'N[C@@H]([C@@H](C)O)C(=O)O', 'amino'],
  ['amino', 'cys', 'L-Cysteine (Cys, C)', 'N[C@@H](CS)C(=O)O', 'amino'],
  ['amino', 'tyr', 'L-Tyrosine (Tyr, Y)', 'N[C@@H](Cc1ccc(O)cc1)C(=O)O', 'amino'],
  ['amino', 'asn', 'L-Asparagine (Asn, N)', 'N[C@@H](CC(N)=O)C(=O)O', 'amino'],
  ['amino', 'gln', 'L-Glutamine (Gln, Q)', 'N[C@@H](CCC(N)=O)C(=O)O', 'amino'],
  ['amino', 'asp', 'L-Aspartic acid (Asp, D)', 'N[C@@H](CC(=O)O)C(=O)O', 'amino'],
  ['amino', 'glu', 'L-Glutamic acid (Glu, E)', 'N[C@@H](CCC(=O)O)C(=O)O', 'amino'],
  ['amino', 'lys', 'L-Lysine (Lys, K)', 'N[C@@H](CCCCN)C(=O)O', 'amino'],
  ['amino', 'arg', 'L-Arginine (Arg, R)', 'N[C@@H](CCCNC(=N)N)C(=O)O', 'amino'],
  ['amino', 'his', 'L-Histidine (His, H)', 'N[C@@H](Cc1c[nH]cn1)C(=O)O', 'amino'],
];

// L-amino acids are S at the α carbon, except cysteine (R); isoleucine is 2S,3S and threonine 2S,3R.
const EXPECTED_CIP = { ile: ['(S)', '(S)'], thr: ['(S)', '(R)'], cys: ['(R)'] };

// ------------------------------------------------------------------ geometry helpers

const r3 = (v) => Math.round(v * 1000) / 1000;
const angle = (dx, dy) => Math.atan2(dy, dx);
const rot = (p, a) => ({ ...p, x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

function parseMolblock(mb) {
  const lines = mb.split('\n');
  const na = parseInt(lines[3].slice(0, 3), 10), nb = parseInt(lines[3].slice(3, 6), 10);
  const atoms = [], bonds = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    // molfiles have y up; the page has y down
    atoms.push({ x: parseFloat(l.slice(0, 10)), y: -parseFloat(l.slice(10, 20)), el: l.slice(31, 34).trim(), charge: 0 });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push({ a: parseInt(l.slice(0, 3), 10) - 1, b: parseInt(l.slice(3, 6), 10) - 1, order: parseInt(l.slice(6, 9), 10), stereo: parseInt(l.slice(9, 12), 10) || 0 });
  }
  for (const l of lines) {
    if (!l.startsWith('M  CHG')) continue;
    const n = parseInt(l.slice(6, 9), 10);
    for (let k = 0; k < n; k++) atoms[parseInt(l.slice(10 + k * 8, 13 + k * 8), 10) - 1].charge = parseInt(l.slice(14 + k * 8, 17 + k * 8), 10);
  }
  return { atoms, bonds };
}

function toMolblock(t) {
  const f = (v) => v.toFixed(4).padStart(10);
  const i3 = (v) => String(v).padStart(3);
  const out = ['', '  template', '', `${i3(t.atoms.length)}${i3(t.bonds.length)}  0  0  0  0  0  0  0  0999 V2000`];
  for (const a of t.atoms) out.push(`${f(a.x)}${f(-a.y)}${f(0)} ${(a.el + '   ').slice(0, 3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  for (const b of t.bonds) out.push(`${i3(b.a + 1)}${i3(b.b + 1)}${i3(b.order)}${i3(b.stereo)}`);
  const chg = t.atoms.map((a, i) => [i, a.charge]).filter(([, c]) => c);
  if (chg.length) out.push(`M  CHG${i3(chg.length)}` + chg.map(([i, c]) => ` ${i3(i + 1)} ${i3(c)}`).join(''));
  out.push('M  END');
  return out.join('\n');
}

/** Same size (bond length 1) and centred on the middle of the box round it. */
function normalize(t) {
  let sum = 0;
  for (const b of t.bonds) sum += Math.hypot(t.atoms[b.a].x - t.atoms[b.b].x, t.atoms[b.a].y - t.atoms[b.b].y);
  const k = t.bonds.length ? t.bonds.length / sum : 1;
  for (const p of t.atoms) { p.x *= k; p.y *= k; }
  const box = bbox(t);
  const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2;
  for (const p of t.atoms) { p.x -= cx; p.y -= cy; }
}

function centre(t) {
  const box = bbox(t);
  const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2;
  for (const p of t.atoms) { p.x -= cx; p.y -= cy; }
}

function bbox(t) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of t.atoms) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  return { x1, y1, x2, y2 };
}

function turn(t, ang) { t.atoms = t.atoms.map((p) => rot(p, ang)); }

/** Mirror top to bottom; wedges and hashes swap so the stereochemistry stays the same. */
function mirror(t) {
  for (const p of t.atoms) p.y = -p.y;
  for (const b of t.bonds) b.stereo = b.stereo === 1 ? 6 : b.stereo === 6 ? 1 : b.stereo;
}

const hetero = (t) => t.atoms.filter((p) => p.el !== 'C' && p.el !== 'H');

/** Turn so the bonds lie on the 30° grid, then pick the turn that reads best. */
function onGrid(t) {
  let sx = 0, sy = 0;
  for (const b of t.bonds) {
    const ang = angle(t.atoms[b.b].x - t.atoms[b.a].x, t.atoms[b.b].y - t.atoms[b.a].y);
    sx += Math.cos(6 * ang); sy += Math.sin(6 * ang);
  }
  // bonds at 30°, 90°, 150°…: 6 × angle is 180° (mod 360°)
  const base = (Math.PI - Math.atan2(sy, sx)) / 6;
  let best = null;
  const het = hetero(t).length ? hetero(t) : null;
  for (let k = 0; k < 12; k++) {
    for (const flip of [false, true]) {
      const c = { atoms: t.atoms.map((p) => ({ ...p })), bonds: t.bonds.map((b) => ({ ...b })) };
      if (flip) mirror(c);
      turn(c, base + (k * Math.PI) / 6);
      const box = bbox(c);
      const w = box.x2 - box.x1, h = box.y2 - box.y1;
      // on the grid; wider than tall; heteroatoms low and to the right; a vertex at the top
      const off = c.bonds.reduce((s, b) => s + (1 + Math.cos(6 * angle(c.atoms[b.b].x - c.atoms[b.a].x, c.atoms[b.b].y - c.atoms[b.a].y))), 0);
      let score = off * 100 + (h > w * 1.05 ? 10 : 0);
      if (het) {
        const hx = het.reduce((s, p, i) => s + hetero(c)[i].x, 0) / het.length, hy = hetero(c).reduce((s, p) => s + p.y, 0) / het.length;
        score += -hy * 2 - hx * 0.5;
      }
      if (!best || score < best.score - 1e-6) best = { score, c };
    }
  }
  t.atoms = best.c.atoms;
  t.bonds = best.c.bonds;
}

/** Five-membered rings: the (first) heteroatom straight below the middle. */
function ring5(t) {
  const het = t.atoms.find((p) => p.el !== 'C');
  if (!het) return onGrid(t);
  const cx = t.atoms.reduce((s, p) => s + p.x, 0) / t.atoms.length, cy = t.atoms.reduce((s, p) => s + p.y, 0) / t.atoms.length;
  turn(t, Math.PI / 2 - angle(het.x - cx, het.y - cy));
}

/** Amino acids: N on the left, the carboxyl on the right, the side chain upwards. */
function amino(t) {
  const n = 0;
  const nb = (i) => t.bonds.filter((b) => b.a === i || b.b === i).map((b) => (b.a === i ? b.b : b.a));
  const isAcid = (i) => t.atoms[i].el === 'C' && nb(i).some((j) => t.atoms[j].el === 'O' && t.bonds.some((b) => ((b.a === i && b.b === j) || (b.a === j && b.b === i)) && b.order === 2));
  // the α carbon: the nitrogen's neighbour that carries the carboxyl group
  const ca = nb(n).find((i) => nb(i).some(isAcid));
  const co = nb(ca).find(isAcid);
  turn(t, -angle(t.atoms[co].x - t.atoms[n].x, t.atoms[co].y - t.atoms[n].y));
  const side = nb(ca).filter((j) => j !== n && j !== co);
  const sy = side.length ? side.reduce((s, j) => s + t.atoms[j].y, 0) / side.length - t.atoms[ca].y : -1;
  if (sy > 0) mirror(t);
}

// ------------------------------------------------------------------ hand-drawn templates

// Haworth projections: ring oxygen at the back right, anomeric carbon on the right, the front
// edge drawn bold. Ring substituents stand straight up or down (the front carbons' upper ones
// shorter, as they sit inside the ring); hydrogens are left out. The ring is drawn wide, as
// usual for Haworth projections, so the labels have room; substituent bonds are a bond long.
//
// Which way each group points follows the usual rules (IUPAC 2-Carb-7): a group on the right of
// the Fischer projection points down, one on the left up; the CH2OH (or CH3, CO2H) at the end of
// the ring points up for D-sugars and down for L; and the anomeric OH points down for α-D and
// β-L, up for β-D and α-L. Every sugar is checked against its name read by OPSIN, stereocentres
// and all (see haworthCheck), so a slip in this table stops the build.
const RING = {
  pyranose: [['O', 1, -0.85], ['C', 2, 0], ['C', 1, 0.85], ['C', -1, 0.85], ['C', -2, 0], ['C', -1, -0.85]],
  furanose: [['O', 0, -1], ['C', 1.5, -0.2], ['C', 1, 0.95], ['C', -1, 0.95], ['C', -1.5, -0.2]],
};
/** The front carbons, whose upward bonds are drawn shorter. */
const FRONT = [2, 3];

/** Each group: the element and label of the atom on the ring, and the group written out as SMILES from that atom (for checking). */
const GROUPS = {
  OH: ['O'],
  CH2OH: ['C', 'CH2OH', 'CO'],
  CH3: ['C', 'CH3'],
  CO2H: ['C', 'CO2H', 'C(=O)O'],
  NHAc: ['N', 'NHAc', 'NC(C)=O'],
};

/**
 * A Haworth ring with groups on it. `subs` lists [ring position, +1 up or −1 down, group]: a
 * group from GROUPS, 'base:<id>' (a nucleobase, by its ring nitrogen) or 'P<n>' (CH2 and a chain
 * of n phosphates, for nucleotides). Positions: pyranose 0 O5, 1 C1, 2 C2, 3 C3, 4 C4, 5 C5;
 * furanose 0 ring O, 1 the anomeric carbon, then round to 4.
 */
function haworth(kind, subs) {
  const atoms = RING[kind].map(([el, x, y]) => ({ el, x, y, charge: 0 }));
  const n = atoms.length;
  const bonds = [];
  // the three front edges (C1–C2, C2–C3, C3–C4) are bold
  for (let i = 0; i < n; i++) bonds.push({ a: i, b: (i + 1) % n, order: 1, stereo: 0, display: i >= 1 && i <= 3 ? 'bold' : undefined });
  const stereo = [];
  const extra = [];
  const put = (el, x, y, label) => { atoms.push({ el, x, y, charge: 0, ...(label ? { label } : {}) }); return atoms.length - 1; };
  const bond = (a, b, order = 1) => bonds.push({ a, b, order, stereo: 0 });
  for (const [i, dir, what] of subs) {
    const p = atoms[i];
    const up = dir > 0;
    // a front carbon's upper group sits inside the ring: a shorter bond; so does the lower group
    // of the back left carbon (an L-sugar's CH3)
    const len = (up && FRONT.includes(i)) ? 0.75 : (!up && kind === 'pyranose' && i === 5) ? 0.7 : 1;
    let x = p.x, y = p.y + (up ? -len : len);
    // a furanose is narrow: an upper group inside it leans in towards the middle, clear of the ring's sides
    if (kind === 'furanose' && up && FRONT.includes(i)) { x = p.x * 0.7; y = p.y - 0.68; }
    // and its anomeric carbon's lower group leans out to the right, clear of C2's
    if (kind === 'furanose' && !up && i === 1) { x = p.x + 0.5; y = p.y + 0.866; }
    // the furanose's last carbon: its CH2OH leans out to the left, clear of the ring oxygen
    if (kind === 'furanose' && i === 4) { x = p.x - 0.7; y = p.y + (up ? -0.7 : 0.7); }
    // a ketose's anomeric carbon has a group up and one down: both lean out to the right, the
    // lower one clear of the OH standing inside the ring on the carbon next to it
    if (i === 1 && subs.filter(([j]) => j === 1).length > 1) { x = p.x + (up ? 0.5 : 0.866); y = p.y + (up ? -0.866 : 0.5); }
    let k;
    if (what.startsWith('base:')) {
      k = placeBase(atoms, bonds, what.slice(5), x, y);
    } else if (/^P\d$/.test(what)) {
      // CH2, then O, then each phosphate along to the left: P(=O) up, OH down
      k = put('C', x, y);
      let prev = put('O', x - 1, y);
      bond(k, prev);
      let px = x - 1;
      for (let m = 0; m < Number(what[1]); m++) {
        const P = put('P', px - 1, y);
        bond(prev, P);
        bond(P, put('O', px - 1, y - 1), 2);
        bond(P, put('O', px - 1, y + 1));
        prev = put('O', px - 2, y);
        bond(P, prev);
        px -= 2;
      }
    } else {
      const [el, label, rest] = GROUPS[what];
      k = put(el, x, y, label);
      if (rest) extra.push([k, rest]);
    }
    bond(i, k);
    stereo.push([i, k, dir]);
  }
  return { atoms, bonds, ring: n, stereo, extra, scaled: true };
}

/** Nucleobases: SMILES with * on the nitrogen that joins the sugar. */
const BASES = {
  A: ['Adenine', '*n1cnc2c(N)ncnc12'],
  G: ['Guanine', '*n1cnc2c(=O)[nH]c(N)nc12'],
  C: ['Cytosine', '*n1ccc(N)nc1=O'],
  T: ['Thymine', '*n1cc(C)c(=O)[nH]c1=O'],
  U: ['Uracil', '*n1ccc(=O)[nH]c1=O'],
};

/** A nucleobase laid out by RDKit, a bond long, with the joining nitrogen at (0, 0) and the bond to the sugar pointing down. */
function baseShape(code) {
  const m = RDKit.get_mol(BASES[code][1]);
  m.set_new_coords(true);
  const t = parseMolblock(m.get_molblock());
  m.delete();
  normalize(t);
  const star = t.atoms.findIndex((p) => p.el === 'R' || p.el === '*' || p.el === 'R#');
  const nb = t.bonds.find((b) => b.a === star || b.b === star);
  const n = nb.a === star ? nb.b : nb.a;
  const o = { x: t.atoms[n].x, y: t.atoms[n].y };
  for (const p of t.atoms) { p.x -= o.x; p.y -= o.y; }
  turn(t, Math.PI / 2 - angle(t.atoms[star].x, t.atoms[star].y));
  return { t, star, n };
}

/** Put a nucleobase in, its joining nitrogen at (x, y) and the rings turned away from the sugar's atoms. Returns the nitrogen. */
function placeBase(atoms, bonds, code, x, y) {
  const { t, star, n } = baseShape(code);
  const sugar = atoms.map((p) => ({ ...p }));
  let best = null;
  for (const flip of [1, -1]) {
    const pts = t.atoms.map((p) => ({ x: x + flip * p.x, y: y + p.y }));
    const clear = Math.min(...pts.filter((_, i) => i !== star && i !== n).flatMap((p) => sugar.map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
    if (!best || clear > best.clear) best = { clear, pts };
  }
  const index = new Map();
  t.atoms.forEach((p, i) => {
    if (i === star) return;
    atoms.push({ el: p.el, x: r3(best.pts[i].x), y: r3(best.pts[i].y), charge: p.charge });
    index.set(i, atoms.length - 1);
  });
  for (const b of t.bonds) if (b.a !== star && b.b !== star) bonds.push({ a: index.get(b.a), b: index.get(b.b), order: b.order, stereo: 0 });
  return index.get(n);
}

/**
 * The Haworth drawing seen from above, as a molfile: the ring flat on the page and each group
 * on a wedge (up) or a hash (down). This is the same molecule as the Haworth projection, written
 * in a way RDKit reads stereocentres from, so it can be checked against the sugar's name.
 */
function haworthCheck(h) {
  // seen from above, the back of the ring is still at the top of the page and its right on the right
  const atoms = h.atoms.map((p) => ({ el: p.el, x: p.x, y: p.y, charge: p.charge }));
  const bonds = h.bonds.map((b) => ({ ...b, stereo: 0 }));
  const ring = atoms.slice(0, h.ring);
  const cx = ring.reduce((s, p) => s + p.x, 0) / h.ring, cy = ring.reduce((s, p) => s + p.y, 0) / h.ring;
  // each group straight out from the middle of the ring; two on one carbon splay apart
  const count = new Map();
  for (const [i, k, dir] of h.stereo) {
    const seen = count.get(i) ?? 0;
    count.set(i, seen + 1);
    const both = h.stereo.filter(([j]) => j === i).length > 1;
    const a = angle(atoms[i].x - cx, atoms[i].y - cy) + (both ? (seen ? -0.45 : 0.45) : 0);
    const to = { x: atoms[i].x + Math.cos(a), y: atoms[i].y + Math.sin(a) };
    const dx = to.x - atoms[k].x, dy = to.y - atoms[k].y;
    // move the group and everything beyond it (a base, a phosphate chain) together
    const side = beyond(h, i, k);
    for (const j of side) { atoms[j].x += dx; atoms[j].y += dy; }
    const b = bonds.find((x) => (x.a === i && x.b === k) || (x.a === k && x.b === i));
    b.a = i; b.b = k; b.stereo = dir > 0 ? 1 : 6;
  }
  // labels written out
  for (const [k, rest] of h.extra) {
    const m = RDKit.get_mol(rest);
    const g = parseMolblock(m.get_molblock());
    m.delete();
    const base = atoms.length;
    // atom 0 of the group is the labelled atom itself
    g.atoms.slice(1).forEach((p, j) => atoms.push({ el: p.el, x: atoms[k].x + 0.3 * (j + 1), y: atoms[k].y + 0.2 * (j + 1), charge: p.charge }));
    const at = (j) => (j === 0 ? k : base + j - 1);
    for (const b of g.bonds) bonds.push({ a: at(b.a), b: at(b.b), order: b.order, stereo: 0 });
  }
  return toMolblock({ atoms, bonds });
}

/** Atoms on the far side of the bond i–k, from k. */
function beyond(h, i, k) {
  const seen = new Set([k]);
  const stack = [k];
  while (stack.length) {
    const x = stack.pop();
    for (const b of h.bonds) {
      const y = b.a === x ? b.b : b.b === x ? b.a : -1;
      if (y < 0 || y === i || seen.has(y)) continue;
      seen.add(y);
      stack.push(y);
    }
  }
  return seen;
}

/**
 * A sugar from its Fischer projection: `fischer` gives the side (R right, L left) of the OH on
 * each ring carbon after the anomeric one, by carbon number; `series` the D or L series; `swap`
 * puts another group in place of an OH (NHAc, or H for a deoxy sugar) by carbon number; `tail` the
 * group on the last ring carbon (none for a pentopyranose, whose last ring carbon is a CH2).
 */
function fromFischer({ ring, anomer, series, fischer, swap = {}, tail = 'CH2OH', keto = false }) {
  const kind = ring;
  const n = RING[kind].length;
  const first = keto ? 2 : 1; // the anomeric carbon's number
  const subs = [];
  const tailUp = series === 'D' ? 1 : -1;
  // α: the anomeric O on the side away from the tail; β: the same side
  const anomUp = anomer === 'b' ? tailUp : -tailUp;
  subs.push([1, anomUp, 'OH']);
  if (keto) subs.push([1, -anomUp, 'CH2OH']);
  for (let pos = 2; pos < n; pos++) {
    const c = first + pos - 1;
    const last = pos === n - 1;
    if (last && tail) { subs.push([pos, tailUp, tail]); continue; }
    if (last && !fischer[c]) continue;
    const g = swap[c] ?? 'OH';
    if (g === 'H') continue;
    subs.push([pos, fischer[c] === 'R' ? -1 : 1, g]);
  }
  return haworth(kind, subs);
}

// D-sugars by the side of their OHs in the Fischer projection (C2 down); L-sugars are their mirror images
const D_GLC = { 2: 'R', 3: 'L', 4: 'R' }, D_GAL = { 2: 'R', 3: 'L', 4: 'L' }, D_MAN = { 2: 'L', 3: 'L', 4: 'R' };
const L_GAL = { 2: 'L', 3: 'R', 4: 'R' }, L_MAN = { 2: 'R', 3: 'R', 4: 'L' };
const D_XYL = { 2: 'R', 3: 'L', 4: 'R' }, D_RIB = { 2: 'R', 3: 'R' }, L_ARA = { 2: 'R', 3: 'L' };
const D_FRU = { 3: 'L', 4: 'R' };

const pyr = (anomer, fischer, more = {}) => fromFischer({ ring: 'pyranose', anomer, series: 'D', fischer, ...more });
const fur = (anomer, fischer, more = {}) => fromFischer({ ring: 'furanose', anomer, series: 'D', fischer, ...more });

// [id, name, OPSIN name it is checked against, drawing]
const SUGARS = [
  ['b-glc', 'β-D-Glucopyranose', 'beta-D-glucopyranose', pyr('b', D_GLC)],
  ['a-glc', 'α-D-Glucopyranose', 'alpha-D-glucopyranose', pyr('a', D_GLC)],
  ['b-gal', 'β-D-Galactopyranose', 'beta-D-galactopyranose', pyr('b', D_GAL)],
  ['a-gal', 'α-D-Galactopyranose', 'alpha-D-galactopyranose', pyr('a', D_GAL)],
  ['b-man', 'β-D-Mannopyranose', 'beta-D-mannopyranose', pyr('b', D_MAN)],
  ['a-man', 'α-D-Mannopyranose', 'alpha-D-mannopyranose', pyr('a', D_MAN)],
  ['b-glcnac', 'N-Acetyl-β-D-glucosamine (β-GlcNAc)', '2-acetamido-2-deoxy-beta-D-glucopyranose', pyr('b', D_GLC, { swap: { 2: 'NHAc' } })],
  ['a-glcnac', 'N-Acetyl-α-D-glucosamine (α-GlcNAc)', '2-acetamido-2-deoxy-alpha-D-glucopyranose', pyr('a', D_GLC, { swap: { 2: 'NHAc' } })],
  ['b-galnac', 'N-Acetyl-β-D-galactosamine (β-GalNAc)', '2-acetamido-2-deoxy-beta-D-galactopyranose', pyr('b', D_GAL, { swap: { 2: 'NHAc' } })],
  ['a-galnac', 'N-Acetyl-α-D-galactosamine (α-GalNAc)', '2-acetamido-2-deoxy-alpha-D-galactopyranose', pyr('a', D_GAL, { swap: { 2: 'NHAc' } })],
  ['b-glca', 'β-D-Glucuronic acid', 'beta-D-glucopyranuronic acid', pyr('b', D_GLC, { tail: 'CO2H' })],
  ['b-xyl', 'β-D-Xylopyranose', 'beta-D-xylopyranose', pyr('b', D_XYL, { tail: null })],
  ['a-fuc', 'α-L-Fucopyranose', 'alpha-L-fucopyranose', fromFischer({ ring: 'pyranose', anomer: 'a', series: 'L', fischer: L_GAL, tail: 'CH3' })],
  ['a-rha', 'α-L-Rhamnopyranose', 'alpha-L-rhamnopyranose', fromFischer({ ring: 'pyranose', anomer: 'a', series: 'L', fischer: L_MAN, tail: 'CH3' })],
  ['b-rib', 'β-D-Ribofuranose', 'beta-D-ribofuranose', fur('b', D_RIB)],
  ['a-rib', 'α-D-Ribofuranose', 'alpha-D-ribofuranose', fur('a', D_RIB)],
  ['b-drib', '2-Deoxy-β-D-ribofuranose', '2-deoxy-beta-D-ribofuranose', fur('b', D_RIB, { swap: { 2: 'H' } })],
  ['a-ara', 'α-L-Arabinofuranose', 'alpha-L-arabinofuranose', fromFischer({ ring: 'furanose', anomer: 'a', series: 'L', fischer: L_ARA })],
  ['b-fru', 'β-D-Fructofuranose', 'beta-D-fructofuranose', fur('b', D_FRU, { keto: true })],
  ['a-fru', 'α-D-Fructofuranose', 'alpha-D-fructofuranose', fur('a', D_FRU, { keto: true })],
];

// Nucleosides and nucleotides: β-D-ribofuranose (or 2-deoxy) with the base up from C1′ and,
// for a nucleotide, the 5′-phosphates along to the left of C5′.
const nucleoside = (code, deoxy, phosphates = 0) => haworth('furanose', [
  [1, 1, `base:${code}`],
  ...(deoxy ? [] : [[2, -1, 'OH']]),
  [3, -1, 'OH'],
  [4, 1, phosphates ? `P${phosphates}` : 'CH2OH'],
]);

const NUCLEIC = [
  ['adenosine', 'Adenosine (A)', 'adenosine', nucleoside('A', false)],
  ['guanosine', 'Guanosine (G)', 'guanosine', nucleoside('G', false)],
  ['cytidine', 'Cytidine (C)', 'cytidine', nucleoside('C', false)],
  ['uridine', 'Uridine (U)', 'uridine', nucleoside('U', false)],
  ['dadenosine', "2′-Deoxyadenosine (dA)", "2'-deoxyadenosine", nucleoside('A', true)],
  ['dguanosine', "2′-Deoxyguanosine (dG)", "2'-deoxyguanosine", nucleoside('G', true)],
  ['dcytidine', "2′-Deoxycytidine (dC)", "2'-deoxycytidine", nucleoside('C', true)],
  ['thymidine', 'Thymidine (dT)', 'thymidine', nucleoside('T', true)],
  ['amp', "Adenosine 5′-monophosphate (AMP)", "adenosine 5'-monophosphate", nucleoside('A', false, 1)],
  ['gmp', "Guanosine 5′-monophosphate (GMP)", "guanosine 5'-monophosphate", nucleoside('G', false, 1)],
  ['cmp', "Cytidine 5′-monophosphate (CMP)", "cytidine 5'-monophosphate", nucleoside('C', false, 1)],
  ['ump', "Uridine 5′-monophosphate (UMP)", "uridine 5'-monophosphate", nucleoside('U', false, 1)],
  ['damp', "2′-Deoxyadenosine 5′-monophosphate (dAMP)", "2'-deoxyadenosine 5'-monophosphate", nucleoside('A', true, 1)],
  ['dgmp', "2′-Deoxyguanosine 5′-monophosphate (dGMP)", "2'-deoxyguanosine 5'-monophosphate", nucleoside('G', true, 1)],
  ['dcmp', "2′-Deoxycytidine 5′-monophosphate (dCMP)", "2'-deoxycytidine 5'-monophosphate", nucleoside('C', true, 1)],
  ['dtmp', "Thymidine 5′-monophosphate (dTMP)", "thymidine 5'-monophosphate", nucleoside('T', true, 1)],
  ['adp', "Adenosine 5′-diphosphate (ADP)", "adenosine 5'-diphosphate", nucleoside('A', false, 2)],
  ['atp', "Adenosine 5′-triphosphate (ATP)", "adenosine 5'-triphosphate", nucleoside('A', false, 3)],
];

const HAND = [
  ...SUGARS.map(([id, name, opsin, h]) => ({ group: 'sugars', id, name, opsin, ...h })),
  ...NUCLEIC.map(([id, name, opsin, h]) => ({ group: 'nucleic', id, name, opsin, ...h })),
];

/** The nucleobases on their own, joined by a new bond from their ring nitrogen (N9 of a purine, N1 of a pyrimidine). */
function baseTemplates() {
  return Object.entries(BASES).map(([code, [name, smiles]]) => {
    const { t, star, n } = baseShape(code);
    const keep = t.atoms.map((_, i) => i).filter((i) => i !== star);
    const index = new Map(keep.map((i, k) => [i, k]));
    const out = {
      atoms: keep.map((i) => ({ ...t.atoms[i] })),
      bonds: t.bonds.filter((b) => b.a !== star && b.b !== star).map((b) => ({ ...b, a: index.get(b.a), b: index.get(b.b) })),
    };
    return { code, name, smiles: smiles.replace('*n', '[nH]'), t: out, n: index.get(n) };
  });
}

// ------------------------------------------------------------------ build and check

function canon(smilesOrMolblock, stereo = true) {
  const m = RDKit.get_mol(smilesOrMolblock);
  if (!m) throw new Error(`RDKit could not read: ${smilesOrMolblock.slice(0, 60)}`);
  const s = stereo ? m.get_smiles() : RDKit.get_mol(m.get_smiles()).get_smiles(JSON.stringify({ doIsomericSmiles: false }));
  m.delete();
  return s;
}

/** Bond used when the template is clicked onto a bond: an outside ring edge between two carbons, leftmost first. */
function pickFuse(t) {
  const deg = t.atoms.map((_, i) => t.bonds.filter((b) => b.a === i || b.b === i).length);
  const ringBond = new Set(cyclicBonds(t));
  const cands = t.bonds.map((b, i) => ({ b, i })).filter(({ b, i }) => ringBond.has(i) && deg[b.a] === 2 && deg[b.b] === 2);
  if (!cands.length) return undefined;
  const score = ({ b }) => (t.atoms[b.a].el === 'C' && t.atoms[b.b].el === 'C' ? 0 : 100) + (t.atoms[b.a].x + t.atoms[b.b].x) / 2 + (b.order === 1 ? 0 : 0.01);
  cands.sort((p, q) => score(p) - score(q));
  return [cands[0].b.a, cands[0].b.b];
}

/** Bonds in rings: those whose removal leaves their ends still connected. */
function cyclicBonds(t) {
  const out = [];
  t.bonds.forEach((skip, i) => {
    const seen = new Set([skip.a]);
    const stack = [skip.a];
    while (stack.length) {
      const x = stack.pop();
      for (const b of t.bonds) {
        if (b === skip) continue;
        const y = b.a === x ? b.b : b.b === x ? b.a : -1;
        if (y >= 0 && !seen.has(y)) { seen.add(y); stack.push(y); }
      }
    }
    if (seen.has(skip.b)) out.push(i);
  });
  return out;
}

/** Atom used when the template is clicked onto an atom. */
function pickAttach(t, group) {
  if (group === 'amino') return 0; // the amino nitrogen, joined by a new bond
  if (group === 'sugars' && t.atoms[0].el === 'O' && t.atoms.length > 6) {
    // the anomeric OH: the substituent on C1
    const b = t.bonds.find((x) => (x.a === 1 && t.atoms[x.b].el === 'O' && x.b !== 0));
    if (b) return b.b;
  }
  if (group === 'nucleic') {
    // a nucleotide: its last phosphate's free OH (on the left); a nucleoside: the 3′-OH
    const ps = t.atoms.map((p, i) => i).filter((i) => t.atoms[i].el === 'P');
    if (ps.length) {
      const p = ps.reduce((a, b) => (t.atoms[b].x < t.atoms[a].x ? b : a));
      const os = t.bonds.filter((b) => (b.a === p || b.b === p) && b.order === 1).map((b) => (b.a === p ? b.b : b.a));
      return os.reduce((a, b) => (t.atoms[b].x < t.atoms[a].x ? b : a));
    }
    const o3 = t.bonds.find((b) => b.a === 3 && t.atoms[b.b].el === 'O');
    if (o3) return o3.b;
  }
  const deg = t.atoms.map((_, i) => t.bonds.filter((b) => b.a === i || b.b === i).length);
  const ring = new Set(cyclicBonds(t).flatMap((i) => [t.bonds[i].a, t.bonds[i].b]));
  let best = 0;
  t.atoms.forEach((p, i) => {
    const q = t.atoms[best];
    const ok = (k) => ring.has(k) && deg[k] === 2 && t.atoms[k].el === 'C';
    if (ok(i) && (!ok(best) || p.x < q.x - 1e-6 || (Math.abs(p.x - q.x) < 1e-6 && p.y < q.y))) best = i;
  });
  return best;
}

const out = [];
let failures = 0;
for (const [group, id, name, smiles, how = 'grid'] of LIST) {
  const m = RDKit.get_mol(smiles);
  m.set_new_coords(true);
  const t = parseMolblock(m.get_molblock());
  m.delete();
  normalize(t);
  if (how === 'grid') onGrid(t);
  else if (how === 'ring5') ring5(t);
  else if (how === 'amino') amino(t);
  normalize(t);
  // checks: same molecule, and L-amino acids have the right configuration
  const want = canon(smiles), got = canon(toMolblock(t));
  if (want !== got) { console.error(`${id}: drawn as ${got}, expected ${want}`); failures++; }
  if (group === 'amino' && id !== 'gly') {
    const tags = JSON.parse(RDKit.get_mol(toMolblock(t)).get_stereo_tags()).CIP_atoms.map(([, c]) => c);
    const exp = EXPECTED_CIP[id] ?? ['(S)'];
    if (JSON.stringify(tags) !== JSON.stringify(exp)) { console.error(`${id}: CIP ${tags} expected ${exp}`); failures++; }
  }
  out.push(finish(t, group, id, name));
}
// Haworth sugars, nucleosides and nucleotides: checked against their names, read by OPSIN,
// stereocentres and all
for (const h of HAND) {
  const t = { atoms: h.atoms.map((p) => ({ ...p })), bonds: h.bonds.map((b) => ({ ...b })) };
  centre(t);
  const named = JSON.parse(opsin(h.opsin));
  if (!named.ok) { console.error(`${h.id}: OPSIN could not read "${h.opsin}": ${named.message}`); failures++; continue; }
  const want = canon(named.smiles), got = canon(haworthCheck({ ...h, atoms: t.atoms }));
  if (want !== got) { console.error(`${h.id}: drawn as ${got}, but ${h.opsin} is ${want}`); failures++; }
  out.push(finish(t, h.group, h.id, h.name));
}
// the nucleobases on their own (as the usual 9H-purine and 1H-pyrimidine tautomers)
for (const b of baseTemplates()) {
  centre(b.t);
  const want = canon(b.smiles), got = canon(toMolblock(b.t));
  if (want !== got) { console.error(`${b.code}: drawn as ${got}, expected ${want}`); failures++; }
  out.push({ ...finish(b.t, 'nucleic', `base-${b.code.toLowerCase()}`, `${b.name} (${b.code})`), attach: b.n, join: 'bond' });
}

function finish(t, group, id, name) {
  const fuse = pickFuse(t);
  const attach = pickAttach(t, group);
  return {
    id, name, group,
    atoms: t.atoms.map((p) => [r3(p.x), r3(p.y), p.el, ...(p.charge || p.label ? [p.charge] : []), ...(p.label ? [p.label] : [])]),
    bonds: t.bonds.map((b) => [b.a, b.b, b.order, ...(b.stereo === 1 ? ['wedge'] : b.stereo === 6 ? ['hashWedge'] : b.display ? [b.display] : [])]),
    attach,
    ...(fuse ? { fuse } : {}),
    ...(group === 'amino' ? { join: 'bond' } : {}),
  };
}

if (failures) { console.error(`${failures} template(s) failed their checks; nothing written.`); process.exit(1); }
const file = path.join(root, 'src', 'chem', 'templates.json');
// one template per line keeps the file readable and the diffs small
fs.writeFileSync(file, '[\n' + out.map((t) => '  ' + JSON.stringify(t)).join(',\n') + '\n]\n');
console.log(`Wrote ${out.length} templates to ${path.relative(root, file)}`);
