// Newman and sawhorse projections of a single bond, worked out from a 3-D conformer (built by the
// 3-D worker from the drawing, so wedges, hashes and double bonds fix where the groups go): the
// groups on the front and back atoms as angles seen down the bond, the label each one is written
// with, and how big each group is (its A-value, the cyclohexane axial-equatorial free energy
// difference), which ranks the groups on each atom largest, middle and smallest.
// No OpenChemLib here, so the drawing code and the window can use it cheaply.

export type V3 = [number, number, number];

/** A molecule as the 3-D builder gives it (Model3d without its conformers). */
export interface NewmanMol {
  atoms: { z: number; charge: number }[];
  bonds: { a: number; b: number; order: number; aromatic?: boolean }[];
}

/** One group on the front or back atom. */
export interface NewmanGroup {
  /** The 3-D model's atom the group is joined by. */
  atom: number;
  /** Angle seen down the bond, degrees clockwise from straight up. */
  angle: number;
  /** As it is written: CH3, OH, Ph, CO2Me (written the other way round by the drawing code on the left). */
  label: string;
  /** How big the group is, kcal/mol (its A-value): ranks the groups on each atom. */
  size: number;
  /** The group is part of a ring that runs through the bond (drawn joined to its partner by an arc). */
  ring?: number;
}

export interface NewmanView {
  front: NewmanGroup[];
  back: NewmanGroup[];
  /** The 3-D atoms viewed down: nearer the reader first. */
  frontAtom: number;
  backAtom: number;
  /** Dihedral between the largest front and largest back groups, degrees (−180 to 180). */
  dihedral: number;
}

const ELEMENT: Record<number, string> = {
  1: 'H', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 11: 'Na', 12: 'Mg', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 19: 'K', 29: 'Cu', 30: 'Zn',
  33: 'As', 34: 'Se', 35: 'Br', 50: 'Sn', 53: 'I',
};
export const elementSymbol = (z: number): string => ELEMENT[z] ?? '*';

const sub3 = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot3 = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross3 = (p: V3, q: V3): V3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const norm3 = (p: V3): V3 => { const l = Math.hypot(...p) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
const at = (xyz: number[], i: number): V3 => [xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2]];

/** Each atom's neighbours (by bond), with the bond order. */
export function neighbours(mol: NewmanMol): { atom: number; order: number }[][] {
  const out: { atom: number; order: number }[][] = mol.atoms.map(() => []);
  for (const b of mol.bonds) {
    out[b.a].push({ atom: b.b, order: b.aromatic ? 1.5 : b.order });
    out[b.b].push({ atom: b.a, order: b.aromatic ? 1.5 : b.order });
  }
  return out;
}

/** The atoms on `from`'s side of the bond from–block (from included, block left out), or null when a ring joins them. */
export function sideOf(mol: NewmanMol, from: number, block: number, nb = neighbours(mol)): number[] | null {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    const a = stack.pop()!;
    for (const { atom } of nb[a]) {
      if (a === from && atom === block) continue;
      if (atom === block) return null;
      if (!seen.has(atom)) { seen.add(atom); stack.push(atom); }
    }
  }
  return [...seen];
}

/** The ring (shortest path back round) through the bond a–b, as atoms from a's side to b's side, or null when the bond is in no ring. */
export function ringThrough(mol: NewmanMol, a: number, b: number, nb = neighbours(mol)): number[] | null {
  const prev = new Map<number, number>([[a, -1]]);
  const queue = [a];
  while (queue.length) {
    const x = queue.shift()!;
    for (const { atom } of nb[x]) {
      if (x === a && atom === b) continue;
      if (prev.has(atom)) continue;
      prev.set(atom, x);
      if (atom === b) {
        const path = [b];
        for (let p = x; p !== -1; p = prev.get(p)!) path.push(p);
        return path.reverse();
      }
      queue.push(atom);
    }
  }
  return null;
}

/**
 * The bond's Newman projection in conformer `xyz` (Å, 3 numbers an atom): seen from `front`'s
 * side, with the largest front group straight up (or turned by `turn` degrees). `drawn` gives the
 * label written on the drawing for a 3-D atom, when there is one (an abbreviation like OTBS).
 */
export function newmanView(mol: NewmanMol, xyz: number[], front: number, back: number, opts: { turn?: number; drawn?: (atom: number) => string | null } = {}): NewmanView {
  const nb = neighbours(mol);
  const pf = at(xyz, front), pb = at(xyz, back);
  const k = norm3(sub3(pb, pf));
  const ring = ringThrough(mol, front, back, nb);
  const groups = (centre: number, other: number): NewmanGroup[] => nb[centre].filter((n) => n.atom !== other).map((n) => ({
    atom: n.atom, angle: 0, label: opts.drawn?.(n.atom) ?? groupLabel(mol, n.atom, centre, nb),
    size: groupSize(mol, n.atom, centre, nb), ...(ring && ring.includes(n.atom) ? { ring: ring.indexOf(n.atom) } : {}),
  }));
  const fg = groups(front, back), bg = groups(back, front);
  // up: square to the bond, towards the largest front group (or any group)
  const big = [...fg].sort((p, q) => q.size - p.size || p.atom - q.atom)[0] ?? [...bg].sort((p, q) => q.size - p.size)[0];
  let ref: V3 = big ? sub3(at(xyz, big.atom), pf) : [0, 1, 0];
  ref = sub3(ref, k.map((v) => v * dot3(ref, k)) as V3);
  if (Math.hypot(...ref) < 1e-6) ref = Math.abs(k[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const up = norm3(sub3(ref, k.map((v) => v * dot3(ref, k)) as V3));
  // looking along k from the front: right = forward × up
  const right = cross3(k, up);
  const turn = opts.turn ?? 0;
  const angleOf = (p: V3, c: V3) => {
    const v = sub3(p, c);
    return norm360((Math.atan2(dot3(v, right), dot3(v, up)) * 180) / Math.PI + turn);
  };
  for (const g of fg) g.angle = angleOf(at(xyz, g.atom), pf);
  for (const g of bg) g.angle = angleOf(at(xyz, g.atom), pb);
  fg.sort((p, q) => p.angle - q.angle);
  bg.sort((p, q) => p.angle - q.angle);
  const bf = largest(fg), bb = largest(bg);
  const dihedral = bf && bb ? norm180(bb.angle - bf.angle) : 0;
  return { front: fg, back: bg, frontAtom: front, backAtom: back, dihedral };
}

const largest = (gs: NewmanGroup[]): NewmanGroup | undefined => [...gs].sort((p, q) => q.size - p.size || p.angle - q.angle)[0];

export const norm360 = (a: number): number => ((a % 360) + 360) % 360;
export const norm180 = (a: number): number => { const x = norm360(a); return x > 180 ? x - 360 : x; };

/** Rank of each group on its atom by size: 0 the largest, 2 the smallest, 1 between (equal sizes share a rank). */
export function sizeRanks(gs: NewmanGroup[]): (0 | 1 | 2)[] {
  const sizes = [...new Set(gs.map((g) => Math.round(g.size * 100)))].sort((p, q) => q - p);
  return gs.map((g) => {
    const s = Math.round(g.size * 100);
    if (sizes.length === 1) return 2;
    if (s === sizes[0]) return 0;
    if (s === sizes[sizes.length - 1]) return 2;
    return 1;
  });
}

/** The torsion (dihedral) angle a–b–c–d in degrees, −180 to 180, by IUPAC's sign rule. */
export function torsion(xyz: number[], a: number, b: number, c: number, d: number): number {
  const b1 = sub3(at(xyz, b), at(xyz, a)), b2 = sub3(at(xyz, c), at(xyz, b)), b3 = sub3(at(xyz, d), at(xyz, c));
  const n1 = cross3(b1, b2), n2 = cross3(b2, b3);
  const m1 = cross3(n1, norm3(b2));
  return (Math.atan2(dot3(m1, n2), dot3(n1, n2)) * 180) / Math.PI;
}

/** The name of a conformation by the torsion between the two groups compared (Klyne–Prelog). */
export function conformationName(phi: number): string {
  const a = Math.abs(norm180(phi));
  if (a < 30) return 'synperiplanar';
  if (a < 90) return 'synclinal';
  if (a < 150) return 'anticlinal';
  return 'antiperiplanar';
}

/** The everyday name: eclipsed, gauche or anti (staggered and eclipsed told apart by the angle). */
export function commonName(phi: number): string {
  const a = Math.abs(norm180(phi));
  if (a < 15) return 'eclipsed';
  if (Math.abs(a - 60) < 15) return 'gauche';
  if (Math.abs(a - 120) < 15) return 'eclipsed';
  if (a > 165) return 'anti';
  return '';
}

// ------------------------------------------------------------------ labels

/** The group's heavy atoms (from `start`, not crossing back to `from`), or null when it reaches round to `from` (a ring). */
function groupAtoms(mol: NewmanMol, start: number, from: number, nb: { atom: number; order: number }[][]): number[] | null {
  return sideOf(mol, start, from, nb);
}

const hCount = (mol: NewmanMol, a: number, nb: { atom: number; order: number }[][]) => nb[a].filter((n) => mol.atoms[n.atom].z === 1).length;
const heavy = (mol: NewmanMol, a: number, nb: { atom: number; order: number }[][], not: number) => nb[a].filter((n) => n.atom !== not && mol.atoms[n.atom].z !== 1);

/** A key for a small group: each heavy atom with its hydrogens and the bond to it, depth first. */
function shapeKey(mol: NewmanMol, a: number, from: number, nb: { atom: number; order: number }[][], depth = 0): string {
  const el = elementSymbol(mol.atoms[a].z);
  const h = hCount(mol, a, nb);
  const kids = heavy(mol, a, nb, from).map((n) => (n.order === 2 ? '=' : n.order === 3 ? '#' : n.order === 1.5 ? ':' : '') + (depth > 5 ? '…' : shapeKey(mol, n.atom, a, nb, depth + 1))).sort();
  const q = mol.atoms[a].charge ? (mol.atoms[a].charge > 0 ? '+' : '-') : '';
  return el + (h ? 'H' + (h > 1 ? h : '') : '') + q + (kids.length ? '(' + kids.join(',') + ')' : '');
}

/** Common groups by their shape key: how they are written and their A-value (kcal/mol). */
const KNOWN: Record<string, [string, number]> = {
  H: ['H', 0], F: ['F', 0.25], Cl: ['Cl', 0.43], Br: ['Br', 0.38], I: ['I', 0.43],
  OH: ['OH', 0.87], 'O(CH3)': ['OMe', 0.6], 'O(C(=O,CH3))': ['OAc', 0.7], 'O(C(=O,c))': ['OBz', 0.7], NH2: ['NH2', 1.4], 'NH(CH3)': ['NHMe', 1.3], 'N(CH3,CH3)': ['NMe2', 2.1],
  'N+(=O,O-)': ['NO2', 1.1], 'N(=O,O)': ['NO2', 1.1], SH: ['SH', 1.2], 'S(CH3)': ['SMe', 1.0],
  CH3: ['CH3', 1.74], 'CH2(CH3)': ['CH2CH3', 1.79], 'CH(CH3,CH3)': ['iPr', 2.21], 'C(CH3,CH3,CH3)': ['tBu', 4.9],
  'CH2(OH)': ['CH2OH', 1.76], 'CH2(CH2(CH3))': ['CH2CH2CH3', 1.8], 'CH2(Br)': ['CH2Br', 1.79], 'CH2(Cl)': ['CH2Cl', 1.79],
  'C(F,F,F)': ['CF3', 2.4], 'C(#N)': ['CN', 0.2], 'C(#CH)': ['C≡CH', 0.41], 'CH(=CH2)': ['CH=CH2', 1.68],
  'CH(=O)': ['CHO', 0.7], 'C(=O,CH3)': ['Ac', 1.17], 'C(=O,OH)': ['CO2H', 1.35], 'C(=O,O(CH3))': ['CO2Me', 1.27], 'C(=O,O(CH2(CH3)))': ['CO2Et', 1.2],
  'C(=O,NH2)': ['CONH2', 1.6], 'C(=O,O-)': ['CO2−', 2.0], 'Si(CH3,CH3,CH3)': ['SiMe3', 2.5], 'CH2(c)': ['Bn', 1.8],
};

/** Is the group a benzene ring (C6H5)? */
function isPhenyl(mol: NewmanMol, a: number, from: number, nb: { atom: number; order: number }[][]): boolean {
  const atoms = groupAtoms(mol, a, from, nb);
  if (!atoms) return false;
  const hv = atoms.filter((x) => mol.atoms[x].z !== 1);
  return hv.length === 6 && hv.every((x) => mol.atoms[x].z === 6 && heavy(mol, x, nb, -1).length === (x === a ? 3 : 2) && nb[x].some((n) => n.order === 1.5 || n.order === 2));
}

/** How a group is written on the projection: CH3, OH, Ph, CO2Me; a larger one by a condensed formula, R when even that is long. */
export function groupLabel(mol: NewmanMol, a: number, from: number, nb = neighbours(mol)): string {
  if (mol.atoms[a].z === 1) return 'H';
  if (isPhenyl(mol, a, from, nb)) return 'Ph';
  const atoms = groupAtoms(mol, a, from, nb);
  const key = shapeKey(mol, a, from, nb).replace(/\(c\)/g, '(c)');
  const known = KNOWN[key] ?? (atoms ? KNOWN[benzylKey(mol, a, from, nb)] : undefined);
  if (known && atoms) return known[0];
  // in a ring through the bond, or anything else: the atom and its hydrogens (CH2), then the rest if it is a short unbranched chain
  const el = elementSymbol(mol.atoms[a].z), h = hCount(mol, a, nb);
  const head = el + (h ? 'H' + (h > 1 ? h : '') : '');
  if (!atoms) return head;
  let text = head, prev = from, cur = a;
  for (let i = 0; i < 3; i++) {
    const next = heavy(mol, cur, nb, prev);
    if (!next.length) return text;
    if (next.length > 1 || next[0].order !== 1) break;
    prev = cur; cur = next[0].atom;
    const hh = hCount(mol, cur, nb);
    text += elementSymbol(mol.atoms[cur].z) + (hh ? 'H' + (hh > 1 ? hh : '') : '');
  }
  return heavy(mol, cur, nb, prev).length ? text + 'R' : text;
}

/** CH2 joined to a benzene ring: written Bn. */
function benzylKey(mol: NewmanMol, a: number, from: number, nb: { atom: number; order: number }[][]): string {
  const next = heavy(mol, a, nb, from);
  if (mol.atoms[a].z === 6 && hCount(mol, a, nb) === 2 && next.length === 1 && isPhenyl(mol, next[0].atom, a, nb)) return 'CH2(c)';
  return '';
}

/**
 * How big a group is, as its A-value (kcal/mol, from the cyclohexane conformational free
 * energies tabulated by Eliel, Wilen and Mander, Stereochemistry of Organic Compounds, 1994):
 * known groups by value, others by their first atom and how branched it is.
 */
export function groupSize(mol: NewmanMol, a: number, from: number, nb = neighbours(mol)): number {
  const z = mol.atoms[a].z;
  if (z === 1) return 0;
  if (isPhenyl(mol, a, from, nb)) return 2.8;
  const key = shapeKey(mol, a, from, nb);
  const known = KNOWN[key] ?? KNOWN[benzylKey(mol, a, from, nb)];
  if (known) return known[1];
  const branches = heavy(mol, a, nb, from).length;
  if (z === 6) return [1.74, 1.8, 2.2, 4.9][Math.min(3, branches)];
  if (z === 7) return 1.4 + 0.3 * branches;
  if (z === 8) return 0.6 + 0.1 * branches;
  if (z === 16) return 1.0 + 0.1 * branches;
  if (z === 14) return 2.5;
  return 0.5 + 0.2 * branches;
}
