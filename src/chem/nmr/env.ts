// Atom environment codes for NMR shift lookup (HOSE-style spheres, hashed). The same code runs when
// the lookup table is built (scripts/nmr/env_codes.ts, in Node) and when the app predicts, so a
// drawn atom and a database atom with the same surroundings always get the same code.
//
// Code at radius 0 describes the atom itself (element, aromatic, charge, hydrogens, heavy-atom
// degree, smallest ring). Each further radius folds in the neighbours' codes from the radius
// before, with the bond type, the way Morgan/ECFP environments grow one bond at a time.

/** cip and ez (CIP labels from the drawing) are read only by the shift networks' stereo features. */
export interface EnvAtom { el: string; q: number; arom: boolean; h: number; cip?: string | null }
export interface EnvBond { u: number; v: number; o: number; ez?: 'E' | 'Z' | null }
export interface EnvGraph { atoms: EnvAtom[]; bonds: EnvBond[] }

export const MAX_RADIUS = 5;
const RING_CAP = 8;

/** 52-bit string hash (two FNV-1a lanes), as 13 hex digits. */
export function hash52(s: string): string {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return (a >>> 0).toString(16).padStart(8, '0') + ((b >>> 0) & 0xfffff).toString(16).padStart(5, '0');
}

interface Adj { n: number; bond: number }

function adjacency(g: EnvGraph): Adj[][] {
  const adj: Adj[][] = g.atoms.map(() => []);
  g.bonds.forEach((b, i) => { adj[b.u].push({ n: b.v, bond: i }); adj[b.v].push({ n: b.u, bond: i }); });
  return adj;
}

/** Shortest cycle through each bond (0 when the bond is in no ring of up to RING_CAP atoms). */
function bondRings(g: EnvGraph, adj: Adj[][]): number[] {
  return g.bonds.map((b, bi) => {
    const dist = new Map<number, number>([[b.v, 0]]);
    const queue = [b.v];
    while (queue.length) {
      const x = queue.shift()!;
      const d = dist.get(x)!;
      if (d + 1 >= RING_CAP) continue;
      for (const { n, bond } of adj[x]) {
        if (bond === bi || dist.has(n)) continue;
        if (n === b.u) return d + 2;
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
    return 0;
  });
}

/** Per atom, the hashed environment code at each radius 0..maxRadius. */
/** Smallest ring through each bond and each atom (0 when none of up to 8 atoms), and each atom's degree. */
export function ringInfo(g: EnvGraph): { bond: number[]; atom: number[]; degree: number[] } {
  const adj = adjacency(g);
  const ring = bondRings(g, adj);
  const atom = g.atoms.map((_, i) => adj[i].reduce((m, { bond }) => (ring[bond] && (!m || ring[bond] < m) ? ring[bond] : m), 0));
  return { bond: ring, atom, degree: adj.map((a) => a.length) };
}

export function envCodes(g: EnvGraph, maxRadius = MAX_RADIUS): string[][] {
  const adj = adjacency(g);
  const ring = bondRings(g, adj);
  const atomRing = g.atoms.map((_, i) => adj[i].reduce((m, { bond }) => (ring[bond] && (!m || ring[bond] < m) ? ring[bond] : m), 0));
  const bondLabel = g.bonds.map((b, i) => (g.atoms[b.u].arom && g.atoms[b.v].arom && ring[i] ? 'a' : String(b.o)));
  let cur = g.atoms.map((a, i) => `${a.el}${a.arom ? 'a' : ''}${a.q ? (a.q > 0 ? '+' : '') + a.q : ''}h${a.h}d${adj[i].length}r${atomRing[i]}`);
  const codes = g.atoms.map(() => [] as string[]);
  cur.forEach((s, i) => codes[i].push(hash52(s)));
  for (let r = 1; r <= maxRadius; r++) {
    const next = cur.map((s, i) => {
      const nb = adj[i].map(({ n, bond }) => bondLabel[bond] + cur[n]).sort();
      return hash52(`${s}(${nb.join(',')})`);
    });
    next.forEach((s, i) => codes[i].push(s));
    cur = next;
  }
  return codes;
}
