// Crystal structures from CIF files: the atoms of a data block in Cartesian space, the molecule
// completed by symmetry, its bonds, and the crystal data table. Ported from Chem SI Assistant
// (si_assistant/core/crystal.py, same author and licence).
//
// * `structureFromCif(block)`: the cell, the symmetry operations, the atoms of the asymmetric unit
//   (element, fractional position, displacement parameters U as a 3 × 3 Cartesian matrix in Å²,
//   occupancy, disorder part).
// * `grow(structure)`: the molecules: every atom reached from the asymmetric unit through bonds,
//   also to atoms of symmetry-related copies (a molecule on an inversion centre is completed),
//   each copy once. Bonds come from the covalent radii (Cordero et al. 2008) + 0.45 Å; atoms of two
//   different disorder parts (1 and 2) are never bonded.
// * `crystalTable(block)`: the crystal data and structure refinement table, in the order journals
//   use: rows (label, value) in chemistry text marks (*italic*, _{sub}, ^{sup}); rows with no value
//   in the CIF are left out.

import { CifBlock, cifMarked, cifNumber, cifPlain } from './cif';

export type V3 = [number, number, number];
export type M3 = [V3, V3, V3];

// ---------------------------------------------------------------- 3 × 3 algebra

export const mmul = (a: M3, b: M3): M3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j])) as M3;
export const mvec = (a: M3, v: V3): V3 => [a[0][0] * v[0] + a[0][1] * v[1] + a[0][2] * v[2], a[1][0] * v[0] + a[1][1] * v[1] + a[1][2] * v[2], a[2][0] * v[0] + a[2][1] * v[1] + a[2][2] * v[2]];
export const mT = (a: M3): M3 => [[a[0][0], a[1][0], a[2][0]], [a[0][1], a[1][1], a[2][1]], [a[0][2], a[1][2], a[2][2]]];
export const ident3 = (): M3 => [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
export const det3 = (a: M3): number => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
export function inv3(a: M3): M3 {
  const d = det3(a) || 1e-12;
  const c = (i: number, j: number) => {
    const r = [0, 1, 2].filter((x) => x !== i), s = [0, 1, 2].filter((x) => x !== j);
    return ((i + j) % 2 ? -1 : 1) * (a[r[0]][s[0]] * a[r[1]][s[1]] - a[r[0]][s[1]] * a[r[1]][s[0]]);
  };
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => c(j, i) / d)) as M3;
}
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const norm3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

/** Eigenvalues (ascending) and eigenvectors (columns) of a symmetric 3 × 3 matrix (Jacobi). */
export function eigSym3(m: M3): { w: V3; v: M3 } {
  const a = m.map((r) => [...r]) as M3;
  const v = ident3();
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2;
    if (off < 1e-22) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq;
        a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk;
        a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = v[k][p], vkq = v[k][q];
        v[k][p] = c * vkp - s * vkq;
        v[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[i][i] - a[j][j]);
  return { w: order.map((i) => a[i][i]) as V3, v: [0, 1, 2].map((r) => order.map((i) => v[r][i])) as M3 };
}

// ---------------------------------------------------------------- the structure

/** Covalent radii in Å (Cordero et al., Dalton Trans. 2008, 2832; sp3 C). */
export const COVALENT: Record<string, number> = {
  H: 0.31, He: 0.28, Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58, Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05,
  Cl: 1.02, Ar: 1.06, K: 2.03, Ca: 1.76, Sc: 1.70, Ti: 1.60, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32, Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22, Ga: 1.22,
  Ge: 1.20, As: 1.19, Se: 1.20, Br: 1.20, Kr: 1.16, Rb: 2.20, Sr: 1.95, Y: 1.90, Zr: 1.75, Nb: 1.64, Mo: 1.54, Tc: 1.47, Ru: 1.46, Rh: 1.42,
  Pd: 1.39, Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39, Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.40, Cs: 2.44, Ba: 2.15, La: 2.07, Ce: 2.04, Pr: 2.03,
  Nd: 2.01, Sm: 1.98, Eu: 1.98, Gd: 1.96, Tb: 1.94, Dy: 1.92, Ho: 1.92, Er: 1.89, Tm: 1.90, Yb: 1.87, Lu: 1.87, Hf: 1.75, Ta: 1.70, W: 1.62,
  Re: 1.51, Os: 1.44, Ir: 1.41, Pt: 1.36, Au: 1.36, Hg: 1.32, Tl: 1.45, Pb: 1.46, Bi: 1.48, U: 1.96, D: 0.31,
};
const BOND_TOLERANCE = 0.45;
/** Growing stops here (a polymer or a network). */
export const MAX_ATOMS = 2000;

export interface XAtomSite {
  label: string;
  element: string;
  frac: V3;
  /** Cartesian U (Å²); isotropic: Uiso × I. */
  u: M3;
  anisotropic: boolean;
  occupancy: number;
  /** Disorder part ("" = none). */
  part: string;
}

export interface Structure {
  name: string;
  cell: [number, number, number, number, number, number];
  symops: [M3, V3][];
  atoms: XAtomSite[];
  /** Fractional → Cartesian (Å). */
  orth: M3;
}

export interface GrownAtom {
  site: number;
  label: string;
  element: string;
  xyz: V3;
  u: M3;
  anisotropic: boolean;
  part: string;
  molecule: number;
  /** The asymmetric unit's own atom (not a copy): the one labelled. */
  own: boolean;
}

export interface Grown {
  atoms: GrownAtom[];
  bonds: [number, number][];
  molecules: number;
  /** False: stopped at MAX_ATOMS (a polymer). */
  complete: boolean;
}

/** A CIF that holds no structure that can be drawn, in plain words. */
export class CrystalError extends Error {}

/** Fractional → Cartesian (Å): a along x, b in the xy plane (the usual convention). */
export function orthogonalisation(a: number, b: number, c: number, alpha: number, beta: number, gamma: number): M3 {
  const [al, be, ga] = [alpha, beta, gamma].map((d) => (d * Math.PI) / 180);
  const v = Math.sqrt(Math.max(1e-12, 1 - Math.cos(al) ** 2 - Math.cos(be) ** 2 - Math.cos(ga) ** 2 + 2 * Math.cos(al) * Math.cos(be) * Math.cos(ga)));
  return [
    [a, b * Math.cos(ga), c * Math.cos(be)],
    [0, b * Math.sin(ga), (c * (Math.cos(al) - Math.cos(be) * Math.cos(ga))) / Math.sin(ga)],
    [0, 0, (c * v) / Math.sin(ga)],
  ];
}

/** "-x+1/2, y+1/2, -z+1/2" → [rotation, translation]. */
export function parseSymop(text: string): [M3, V3] {
  text = cifPlain(text).trim().replace(/^['"]|['"]$/g, '');
  const parts = text.toLowerCase().split(',').map((p) => p.trim());
  if (parts.length !== 3) throw new CrystalError(`The symmetry operation “${text}” could not be read.`);
  const rot: M3 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const trans: V3 = [0, 0, 0];
  parts.forEach((part, row) => {
    for (const m of part.replace(/\s+/g, '').matchAll(/([+-]?)([\d./]*)\*?([xyz]?)/g)) {
      const [, sign, coef, v] = m;
      if (!coef && !v) continue;
      let value = 1;
      if (coef) {
        if (coef.includes('/')) { const [n, d] = coef.split('/'); value = parseFloat(n) / parseFloat(d); } else value = parseFloat(coef);
        if (!Number.isFinite(value)) throw new CrystalError(`The symmetry operation “${text}” could not be read.`);
      }
      if (sign === '-') value = -value;
      if (v) rot[row]['xyz'.indexOf(v)] += value; else trans[row] += value;
    }
  });
  return [rot, trans];
}

const TWO_LETTER_UNLIKELY = new Set(['Cs', 'Ca', 'Co', 'Cu', 'Cd', 'Ce', 'Hf', 'Os', 'Np', 'Nb', 'Sc', 'Sn', 'In', 'Ho', 'Pb']);

/** The element of an atom: its type symbol ("C", "O2-", "Cl1-" → "C", "O", "Cl"), else the letters its label starts with ("CL1" → "Cl", "C12A" → "C"). */
export function elementOf(label: string, typeSymbol: string | null | undefined): string {
  for (const source of [typeSymbol, label]) {
    if (!source) continue;
    const m = /^([A-Za-z]{1,2})/.exec(source);
    if (!m) continue;
    const letters = m[1];
    const two = letters[0].toUpperCase() + letters.slice(1, 2).toLowerCase();
    if (letters.length === 2 && two in COVALENT && (source === typeSymbol || !TWO_LETTER_UNLIKELY.has(two))) return two;
    const one = letters[0].toUpperCase();
    if (one in COVALENT) return one;
    if (two in COVALENT) return two;
  }
  return 'C';
}

/** The structure of a CIF data block. */
export function structureFromCif(block: CifBlock): Structure {
  const cell = ['length_a', 'length_b', 'length_c', 'angle_alpha', 'angle_beta', 'angle_gamma'].map((k) => cifNumber(block.get(`_cell_${k}`)));
  if (cell.some((v) => v === null || v <= 0)) throw new CrystalError('The CIF has no complete unit cell (a, b, c, α, β, γ).');
  const c6 = cell as [number, number, number, number, number, number];
  const orth = orthogonalisation(...c6);
  let opsText: string[] = [];
  for (const tag of ['_space_group_symop_operation_xyz', '_symmetry_equiv_pos_as_xyz']) {
    const loop = block.loopWith(tag);
    if (loop) { opsText = loop.get(tag)!; break; }
  }
  if (!opsText.length) { const one = block.get('_space_group_symop_operation_xyz', '_symmetry_equiv_pos_as_xyz'); if (one) opsText = [one]; }
  const symops: [M3, V3][] = [];
  for (const t of opsText.length ? opsText : ['x, y, z']) { try { symops.push(parseSymop(t)); } catch { /* skipped */ } }
  if (!symops.length) symops.push([ident3(), [0, 0, 0]]);
  const rows = block.rows('_atom_site_label');
  if (!rows.length) throw new CrystalError('The CIF lists no atoms (no _atom_site_ table).');
  const aniso = new Map(block.rows('_atom_site_aniso_label').map((r) => [r.get('_atom_site_aniso_label')!, r]));
  // U (in the CIF, relative to the reciprocal axes) → Cartesian: A N U N Aᵀ
  const recip = mT(inv3(orth));
  const nd = [0, 1, 2].map((k) => Math.hypot(recip[0][k], recip[1][k], recip[2][k]));
  const N: M3 = [[nd[0], 0, 0], [0, nd[1], 0], [0, 0, nd[2]]];
  const atoms: XAtomSite[] = [];
  for (const r of rows) {
    const label = r.get('_atom_site_label')!;
    const frac = ['x', 'y', 'z'].map((k) => cifNumber(r.get(`_atom_site_fract_${k}`)));
    if (frac.some((v) => v === null)) continue;
    const element = elementOf(label, r.get('_atom_site_type_symbol'));
    let uiso = cifNumber(r.get('_atom_site_u_iso_or_equiv'));
    const biso = cifNumber(r.get('_atom_site_b_iso_or_equiv'));
    if (uiso === null && biso !== null) uiso = biso / (8 * Math.PI ** 2);
    const ui = uiso && uiso > 0 ? uiso : 0.03;
    let u: M3 = [[ui, 0, 0], [0, ui, 0], [0, 0, ui]];
    let anisotropic = false;
    const a = aniso.get(label);
    if (a) {
      const vals = ['11', '22', '33', '12', '13', '23'].map((ij) => cifNumber(a.get(`_atom_site_aniso_u_${ij}`)));
      if (vals.every((v) => v !== null)) {
        const [u11, u22, u33, u12, u13, u23] = vals as number[];
        u = mmul(mmul(mmul(mmul(orth, N), [[u11, u12, u13], [u12, u22, u23], [u13, u23, u33]]), N), mT(orth));
        anisotropic = true;
      }
    }
    const occ = cifNumber(r.get('_atom_site_occupancy'));
    const part = r.get('_atom_site_disorder_group') ?? '';
    atoms.push({ label, element, frac: frac as V3, u, anisotropic, occupancy: occ ?? 1, part: part === '.' || part === '?' ? '' : part });
  }
  if (!atoms.length) throw new CrystalError("The CIF's atoms have no positions.");
  return { name: block.name, cell: c6, symops, atoms, orth };
}

function bonded(a: XAtomSite, b: XAtomSite, distance: number): boolean {
  if (distance < 0.1) return false;
  if (a.part && b.part && a.part !== b.part && a.part !== '0' && b.part !== '0') return false;
  if ((a.element === 'H' || a.element === 'D') && (b.element === 'H' || b.element === 'D')) return false;
  return distance <= (COVALENT[a.element] ?? 1.5) + (COVALENT[b.element] ?? 1.5) + BOND_TOLERANCE;
}

/** The molecules of a structure: the asymmetric unit completed through bonds to its symmetry-related copies. */
export function grow(s: Structure): Grown {
  const ops = s.symops;
  const isIdent = (r: M3, t: V3) => r.every((row, i) => row.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-6)) && t.every((v) => Math.abs(v) < 1e-6);
  let identity = ops.findIndex(([r, t]) => isIdent(r, t));
  if (identity < 0) identity = 0;
  const fracOf = (i: number, op: number, shift: V3): V3 => {
    const [r, t] = ops[op];
    const f = mvec(r, s.atoms[i].frac);
    return [f[0] + t[0] + shift[0], f[1] + t[1] + shift[1], f[2] + t[2] + shift[2]];
  };
  const placed: GrownAtom[] = [];
  const where = new Map<string, number>();
  const key = (f: V3) => f.map((v) => Math.round(v * 2000)).join(',');
  const orthInv = inv3(s.orth);
  const add = (i: number, op: number, shift: V3): number | null => {
    const f = fracOf(i, op, shift);
    const k = key(f);
    const had = where.get(k);
    if (had !== undefined) return had;
    if (placed.length >= MAX_ATOMS) return null;
    const rc = mmul(mmul(s.orth, ops[op][0]), orthInv);
    const at = s.atoms[i];
    placed.push({ site: i, label: at.label, element: at.element, xyz: mvec(s.orth, f), u: mmul(mmul(rc, at.u), mT(rc)), anisotropic: at.anisotropic, part: at.part, molecule: 0, own: false });
    where.set(k, placed.length - 1);
    return placed.length - 1;
  };
  for (let i = 0; i < s.atoms.length; i++) { const k = add(i, identity, [0, 0, 0]); if (k !== null) placed[k].own = true; }
  // every copy of every atom that a placed atom is bonded to (each operation, at the lattice
  // shift nearest to it and the shifts next to that) is placed too, and so on
  const images = ops.map(([r, t]) => s.atoms.map((a) => { const f = mvec(r, a.frac); return [f[0] + t[0], f[1] + t[1], f[2] + t[2]] as V3; }));
  // (each image's place in Å, and each of the 27 neighbouring cells' offset in Å, worked out once:
  // a network grown to MAX_ATOMS in a high-symmetry group checks millions of candidates)
  const imageXyz = images.map((f0) => f0.map((f) => mvec(s.orth, f)));
  // an atom on a special position is the same image under many operations (48 of Fm-3m's 192 for
  // Na in NaCl): each place is tried once
  const tried: [number, number][] = [];
  const seenImage = new Set<string>();
  images.forEach((f0, op) => f0.forEach((f, j) => {
    const k = `${j}:${f.map((v) => Math.round((v - Math.floor(v)) * 2000) % 2000).join(',')}`;
    if (!seenImage.has(k)) { seenImage.add(k); tried.push([op, j]); }
  }));
  const STEPS = [-1, 0, 1];
  const O = s.orth;
  const reach = 2 * Math.max(...s.atoms.map((a) => COVALENT[a.element] ?? 1.5)) + BOND_TOLERANCE;
  const reach2 = reach * reach;
  const spacing = orthInv.map((row) => 1 / Math.hypot(row[0], row[1], row[2]));
  let complete = true;
  const queue = placed.map((_, i) => i);
  const queued = new Set(queue);
  for (let qi = 0; qi < queue.length; qi++) {
    const here = placed[queue[qi]];
    const hf = mvec(orthInv, here.xyz);
    const [hx, hy, hz] = here.xyz;
    for (const [op, j] of tried) {
      const f = images[op][j], c = imageXyz[op][j];
      const n0 = Math.round(hf[0] - f[0]), n1 = Math.round(hf[1] - f[1]), n2 = Math.round(hf[2] - f[2]);
      // a neighbouring cell along an axis is tried only when it can come within reach (an image
      // u cells along an axis is at least u × the spacing of the cell's faces across it away)
      const u0 = f[0] + n0 - hf[0], u1 = f[1] + n1 - hf[1], u2 = f[2] + n2 - hf[2];
      const s0 = STEPS.filter((k) => Math.abs(u0 + k) * spacing[0] <= reach), s1 = STEPS.filter((k) => Math.abs(u1 + k) * spacing[1] <= reach), s2 = STEPS.filter((k) => Math.abs(u2 + k) * spacing[2] <= reach);
      if (!s0.length || !s1.length || !s2.length) continue;
      for (const a of s0) for (const b of s1) for (const e of s2) {
        const t0 = n0 + a, t1 = n1 + b, t2 = n2 + e;
        const dx = c[0] + O[0][0] * t0 + O[0][1] * t1 + O[0][2] * t2 - hx;
        const dy = c[1] + O[1][0] * t0 + O[1][1] * t1 + O[1][2] * t2 - hy;
        const dz = c[2] + O[2][0] * t0 + O[2][1] * t1 + O[2][2] * t2 - hz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > reach2) continue;
        const d = Math.sqrt(d2);
        if (!bonded(s.atoms[here.site], s.atoms[j], d)) continue;
        const g = add(j, op, [t0, t1, t2]);
        if (g === null) complete = false;
        else if (!queued.has(g)) { queued.add(g); queue.push(g); }
      }
    }
  }
  // bonds between the atoms placed: only atoms in the same or a touching 4 Å box can be bonded
  const bonds: [number, number][] = [];
  const cell = (v: number) => Math.floor(v / 4);
  const boxes = new Map<string, number[]>();
  placed.forEach((p, i) => {
    const k = `${cell(p.xyz[0])},${cell(p.xyz[1])},${cell(p.xyz[2])}`;
    const list = boxes.get(k);
    if (list) list.push(i); else boxes.set(k, [i]);
  });
  for (let i = 0; i < placed.length; i++) {
    const [x, y, z] = placed[i].xyz;
    const cx = cell(x), cy = cell(y), cz = cell(z);
    const near: number[] = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const j of boxes.get(`${cx + a},${cy + b},${cz + c}`) ?? []) if (j > i) near.push(j);
    near.sort((p, q) => p - q);
    for (const j of near) {
      const d = norm3(sub3(placed[j].xyz, placed[i].xyz));
      if (d < 4 && bonded(s.atoms[placed[i].site], s.atoms[placed[j].site], d)) bonds.push([i, j]);
    }
  }
  // molecules: connected pieces
  const parent = placed.map((_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const [i, j] of bonds) parent[find(i)] = find(j);
  const roots = new Map<number, number>();
  placed.forEach((g, i) => { const r = find(i); if (!roots.has(r)) roots.set(r, roots.size); g.molecule = roots.get(r)!; });
  return { atoms: placed, bonds, molecules: roots.size, complete };
}

// ---------------------------------------------------------------- the table

/** "C12 H14 N O2" → "C_{12}H_{14}NO_{2}". */
function formulaMarked(text: string): string {
  const out = [...text.matchAll(/([A-Z][a-z]?)\s*([\d.]*)/g)].map(([, el, n]) => el + (n && n !== '1' ? `_{${n}}` : ''));
  return out.join('') || cifMarked(text);
}

/** A Hermann–Mauguin symbol as printed: "P 21/c" → "*P*2_{1}/*c*", "P -1" → "*P*1̄"; a monoclinic full symbol in its short form ("P 1 21/c 1" → *P*2_{1}/*c*). */
export function spaceGroupMarked(text: string): string {
  let parts = cifPlain(text).replace(/_/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 4 && parts.filter((p) => p === '1').length === 2) parts = [parts[0], ...parts.slice(1).filter((p) => p !== '1')];
  return parts.map((p) => p.replace(/-(\d)/g, '$1̅').replace(/(?<![\d_])(\d)(\d)(?!\d)/g, '$1_{$2}').replace(/([A-Za-z])/g, '*$1*')).join('').replace(/\*\*/g, '');
}

/** [key, label, value] rows of the crystal data and structure refinement table (see the module's text). */
export function crystalTable(block: CifBlock): [string, string, string][] {
  const g = (...t: string[]) => block.get(...t);
  const val = (tag: string) => { const v = g(tag); return v !== null ? cifMarked(v) : null; };
  const join = (parts: (string | null)[], sep = ', ') => { const f = parts.filter((p): p is string => !!p); return f.length ? f.join(sep) : null; };
  const rows: [string, string, string | null][] = [];
  let ccdc = g('_database_code_depnum_ccdc_archive', '_database_code_ccdc');
  if (ccdc) ccdc = cifPlain(ccdc).replace(/^CCDC\s*/i, '').trim();
  rows.push(['code', 'Identification code', block.name || null]);
  rows.push(['ccdc', 'CCDC deposition number', ccdc]);
  const formula = g('_chemical_formula_sum');
  rows.push(['formula', 'Empirical formula', formula ? formulaMarked(formula) : null]);
  rows.push(['weight', 'Formula weight', val('_chemical_formula_weight')]);
  const temp = g('_diffrn_ambient_temperature', '_cell_measurement_temperature');
  rows.push(['temperature', 'Temperature/K', temp ? cifMarked(temp) : null]);
  rows.push(['system', 'Crystal system', val('_space_group_crystal_system') ?? val('_symmetry_cell_setting')]);
  const sg = g('_space_group_name_h-m_alt', '_symmetry_space_group_name_h-m');
  rows.push(['space_group', 'Space group', sg ? spaceGroupMarked(sg) : null]);
  for (const [k, label, tag] of [
    ['a', '*a*/Å', '_cell_length_a'], ['b', '*b*/Å', '_cell_length_b'], ['c', '*c*/Å', '_cell_length_c'],
    ['alpha', 'α/°', '_cell_angle_alpha'], ['beta', 'β/°', '_cell_angle_beta'], ['gamma', 'γ/°', '_cell_angle_gamma'],
    ['volume', 'Volume/Å^{3}', '_cell_volume'], ['z', '*Z*', '_cell_formula_units_z'],
    ['density', 'ρ_{calc}/g cm^{−3}', '_exptl_crystal_density_diffrn'], ['mu', 'μ/mm^{−1}', '_exptl_absorpt_coefficient_mu'],
    ['f000', '*F*(000)', '_exptl_crystal_f_000'],
  ]) rows.push([k, label, val(tag)]);
  const size = ['max', 'mid', 'min'].map((k) => g(`_exptl_crystal_size_${k}`));
  rows.push(['size', 'Crystal size/mm^{3}', size.every(Boolean) ? size.map((s) => cifPlain(s!)).join(' × ') : null]);
  let rad = g('_diffrn_radiation_type');
  const wave = g('_diffrn_radiation_wavelength');
  if (rad) rad = cifPlain(rad).replace(/^\s*([A-Z][a-z]?)\s*K\s*(?:α|a\b)/, '$1 Kα');
  rows.push(['radiation', 'Radiation', join([rad ? cifMarked(rad) : null, wave ? (rad ? `(λ = ${cifPlain(wave)})` : `λ = ${cifPlain(wave)}`) : null], ' ')]);
  const t0 = cifNumber(g('_diffrn_reflns_theta_min')), t1 = cifNumber(g('_diffrn_reflns_theta_max'));
  rows.push(['two_theta', '2Θ range for data collection/°', t0 !== null && t1 !== null ? `${(2 * t0).toFixed(2)} to ${(2 * t1).toFixed(2)}` : null]);
  const limits: string[] = [];
  for (const axis of 'hkl') {
    const lo = g(`_diffrn_reflns_limit_${axis}_min`), hi = g(`_diffrn_reflns_limit_${axis}_max`);
    if (lo !== null && hi !== null) limits.push(`${lo.replace('-', '−')} ≤ *${axis}* ≤ ${hi}`);
  }
  rows.push(['index', 'Index ranges', limits.length === 3 ? limits.join(', ') : null]);
  rows.push(['collected', 'Reflections collected', val('_diffrn_reflns_number')]);
  const total = g('_reflns_number_total');
  const rint = g('_diffrn_reflns_av_r_equivalents'), rsig = g('_diffrn_reflns_av_uneti/neti', '_diffrn_reflns_av_sigmai/neti');
  const extra = join([rint ? `*R*_{int} = ${rint}` : null, rsig ? `*R*_{sigma} = ${rsig}` : null]);
  rows.push(['independent', 'Independent reflections', total ? total + (extra ? ` [${extra}]` : '') : null]);
  const drp = [g('_refine_ls_number_reflns'), g('_refine_ls_number_restraints'), g('_refine_ls_number_parameters')];
  rows.push(['data', 'Data/restraints/parameters', drp.every((v) => v !== null) ? drp.join('/') : null]);
  rows.push(['gof', 'Goodness-of-fit on *F*^{2}', val('_refine_ls_goodness_of_fit_ref')]);
  const r1 = g('_refine_ls_r_factor_gt'), wr2 = g('_refine_ls_wr_factor_gt');
  rows.push(['r_gt', 'Final *R* indexes [*I* ≥ 2σ(*I*)]', join([r1 ? `*R*_{1} = ${r1}` : null, wr2 ? `w*R*_{2} = ${wr2}` : null])]);
  const r1a = g('_refine_ls_r_factor_all'), wr2a = g('_refine_ls_wr_factor_ref');
  rows.push(['r_all', 'Final *R* indexes [all data]', join([r1a ? `*R*_{1} = ${r1a}` : null, wr2a ? `w*R*_{2} = ${wr2a}` : null])]);
  const peak = g('_refine_diff_density_max'), hole = g('_refine_diff_density_min');
  rows.push(['peak', 'Largest diff. peak/hole/e Å^{−3}', peak && hole ? `${peak}/${hole.replace('-', '−')}` : null]);
  rows.push(['flack', 'Flack parameter', val('_refine_ls_abs_structure_flack')]);
  return rows.filter((r): r is [string, string, string] => !!r[2]);
}

/** Table text marks (*italic*, _{sub}, ^{sup}) as HTML. */
export function marksHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*([^*]+)\*/g, '<i>$1</i>').replace(/_\{([^}]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^}]*)\}/g, '<sup>$1</sup>');
}

/** Table text marks as plain text (for a tab-separated copy). */
export const marksPlain = (text: string): string => text.replace(/\*([^*]+)\*/g, '$1').replace(/_\{([^}]*)\}/g, '$1').replace(/\^\{([^}]*)\}/g, '$1');
