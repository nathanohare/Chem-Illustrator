// A liquid's or solid's density from its formula, by Girolami's method (J. Chem. Educ. 1994, 71,
// 962): each atom takes a volume by its row of the periodic table (H 1, Li–F 2, Na–Cl 4, K–Br 5,
// Rb–I 7.5, Cs–Bi 9), and d = M / (5 · ΣV) g/mL. The density goes up 10% for each OH, CO2H, NH or
// NH2, amide, sulfoxide and lone ring (20% for a sulfone) and 7.5% for each ring of a fused
// system, at most 30% in all. Typical error 0.05 g/mL (166 compounds).

/** The volume Girolami gives an atom of each element (by atomic number); undefined past bismuth or for noble gases. */
function volume(z: number): number | undefined {
  if (z === 1) return 1;
  if (z >= 3 && z <= 9) return 2;
  if (z >= 11 && z <= 17) return 4;
  if (z >= 19 && z <= 35) return 5;
  if (z >= 37 && z <= 53) return 7.5;
  if (z >= 55 && z <= 83) return 9;
  return undefined;
}

const SYMBOLS = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi'.split(' ');

/** What raises the density: groups that hydrogen-bond or are polar, and rings. */
export interface DensityGroups {
  hydroxyl: number;
  acid: number;
  /** Primary and secondary amines (N–H). */
  amine: number;
  amide: number;
  sulfoxide: number;
  sulfone: number;
  /** Rings sharing no bond with another ring. */
  loneRings: number;
  /** Rings in fused systems (naphthalene: 2). */
  fusedRings: number;
}

/** The scale factor for these groups: 1.0 to 1.3. */
export function densityFactor(g: DensityGroups): number {
  const add = 0.1 * (g.hydroxyl + g.acid + g.amine + g.amide + g.sulfoxide + 2 * g.sulfone + g.loneRings) + 0.075 * g.fusedRings;
  return 1 + Math.min(0.3, add);
}

/** Estimated density, g/mL; null when an element is outside the method. */
export function girolamiDensity(counts: Record<string, number>, mw: number, g: DensityGroups): number | null {
  let v = 0;
  for (const [el, n] of Object.entries(counts)) {
    const z = SYMBOLS.indexOf(el) + 1;
    const x = z ? volume(z) : undefined;
    if (x === undefined) return null;
    v += x * n;
  }
  if (!(v > 0) || !(mw > 0)) return null;
  return (densityFactor(g) * mw) / (5 * v);
}

/** Lone and fused rings from the rings' atoms: a ring is fused when it shares a bond (two atoms) with another. */
export function ringKinds(rings: number[][]): { lone: number; fused: number } {
  let fused = 0;
  rings.forEach((r, i) => {
    const s = new Set(r);
    if (rings.some((o, j) => j !== i && o.filter((a) => s.has(a)).length >= 2)) fused++;
  });
  return { lone: rings.length - fused, fused };
}

/** SMARTS for the groups, matched with the chemistry engine. */
export const DENSITY_SMARTS: Record<Exclude<keyof DensityGroups, 'loneRings' | 'fusedRings'>, string> = {
  hydroxyl: '[OX2H][#6;!$(C=O)]',
  acid: '[CX3](=O)[OX2H1]',
  amine: '[NX3;H2,H1;!$(N[C,S]=[O,S,N])]',
  amide: '[CX3](=O)[NX3]',
  sulfoxide: '[SX3](=O)([#6])[#6]',
  sulfone: '[SX4](=O)(=O)([#6])[#6]',
};
