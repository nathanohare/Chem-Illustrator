// Vicinal H–C–C–H couplings from 3-D conformers: the generalized Karplus equation of Haasnoot,
// de Leeuw and Altona (Tetrahedron 1980, 36, 2783; Table 2), with Huggins electronegativities
// relative to H as listed by Altona et al. (Magn. Reson. Chem. 1989, 27, 564, p. 566). Each
// conformer gives its torsions; the couplings are averaged over the conformers' populations.
//
//   3J = P1 cos²φ + P2 cos φ + Σi Δχi (P4 + P5 cos²(ξi φ + P6 |Δχi|))
//   Δχi = Δχ(α atom) − P7 Σ Δχ(atoms on the α atom)      (β effect, eqn 9)
//   ξi = +1 when, looking along the C–C bond with the substituent's carbon in front, the
//        substituent sits +120° clockwise from that carbon's coupled proton; −1 at 240°.
// A methyl group rotates freely, and HLA averaged over staggered rotamers falls about 1 Hz short
// (ethane 6.9 against 8.0 measured), so CH3–CH couplings use Altona's rotational average instead
// (1989, eqn 10, rms 0.02 Hz over 84 couplings): <3J> = 7.84 − 0.59 (λ1 + λ2) − 0.42 λ1 λ2, with
// λ the group constants of the other carbon's substituents (Table 6).
// Set D for three non-H substituents on the fragment, E for four, B otherwise (the authors
// advise B over C for CH2–CH2, p. 2790). Only for sp3 carbons; alkenes, aromatics and small
// rings keep the rule values in coupling.ts.

import type { Model3d } from '../model3d-build';

interface HlaSet { p1: number; p2: number; p4: number; p5: number; p6: number; p7: number }
const SET_B: HlaSet = { p1: 13.70, p2: -0.73, p4: 0.56, p5: -2.47, p6: 16.9, p7: 0.14 };
const SET_D: HlaSet = { p1: 13.22, p2: -0.99, p4: 0.87, p5: -2.46, p6: 19.9, p7: 0 };
const SET_E: HlaSet = { p1: 13.24, p2: -0.91, p4: 0.53, p5: -2.41, p6: 15.5, p7: 0.19 };

/** Huggins electronegativity minus that of H, by atomic number (Altona 1989, p. 566). */
const DCHI: Record<number, number> = { 1: 0, 3: -0.9, 6: 0.4, 7: 0.85, 8: 1.3, 9: 1.7, 14: -0.3, 15: -0.05, 16: 0.4, 17: 0.95, 35: 0.75, 53: 0.45 };
const dchi = (z: number) => DCHI[z] ?? 0.4;

const RAD = Math.PI / 180;

/** Torsion a–b–c–d in degrees (IUPAC sign: clockwise looking from b to c is positive). */
export function torsion(x: number[], a: number, b: number, c: number, d: number): number {
  const v = (i: number, j: number) => [x[3 * j] - x[3 * i], x[3 * j + 1] - x[3 * i + 1], x[3 * j + 2] - x[3 * i + 2]];
  const cross = (p: number[], q: number[]) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const b1 = v(a, b), b2 = v(b, c), b3 = v(c, d);
  const n1 = cross(b1, b2), n2 = cross(b2, b3);
  const m = cross(n1, b2.map((t) => t / Math.sqrt(dot(b2, b2))));
  return Math.atan2(dot(m, n2), dot(n1, n2)) / RAD;
}

/** One H–C–C–H coupling from the HLA equation. φ in degrees; subs: each substituent's Δχ (β
 *  effect already applied) and ξ (+1 or −1); n: non-H substituents on the fragment. */
export function hla(phi: number, subs: { dchi: number; xi: number }[], n = subs.length): number {
  const s = n >= 4 ? SET_E : n === 3 ? SET_D : SET_B;
  const c = Math.cos(phi * RAD);
  let j = s.p1 * c * c + s.p2 * c;
  for (const { dchi: d, xi } of subs) {
    const t = Math.cos((xi * phi + s.p6 * Math.abs(d)) * RAD);
    j += d * (s.p4 + s.p5 * t * t);
  }
  return j;
}

export interface Vicinal3d {
  /** The two hydrogens (indices into the model's atoms) and their carbons. */
  h1: number; h2: number; c1: number; c2: number;
  /** Population-weighted 3J (Hz). */
  j: number;
}

/**
 * Population-averaged vicinal couplings for every H–C(sp3)–C(sp3)–H in a 3-D model. Conformers
 * without a population count equally. Pairs where either carbon is in a 3- or 4-membered ring are
 * left out (the equation is not parameterized for them).
 */
export function vicinal3d(model: Model3d): Vicinal3d[] {
  const nAt = model.atoms.length;
  const nb: number[][] = Array.from({ length: nAt }, () => []);
  const order = new Map<string, number>();
  for (const b of model.bonds) {
    nb[b.a].push(b.b); nb[b.b].push(b.a);
    order.set(`${Math.min(b.a, b.b)},${Math.max(b.a, b.b)}`, b.aromatic ? 1.5 : b.order);
  }
  const isH = (i: number) => model.atoms[i].z === 1;
  const sp3C = (i: number) => model.atoms[i].z === 6 && nb[i].length === 4 && nb[i].every((k) => (order.get(`${Math.min(i, k)},${Math.max(i, k)}`) ?? 1) === 1);
  const inSmallRing = smallRingAtoms(nAt, nb, model.bonds);
  const confs = model.conformers;
  const pops = confs.map((c) => c.population ?? 1 / confs.length);
  const tot = pops.reduce((a, b) => a + b, 0) || 1;
  const out: Vicinal3d[] = [];
  for (const bd of model.bonds) {
    const [c1, c2] = [bd.a, bd.b];
    if (!sp3C(c1) || !sp3C(c2) || inSmallRing.has(c1) && inSmallRing.has(c2)) continue;
    const hs1 = nb[c1].filter(isH), hs2 = nb[c2].filter(isH);
    if (!hs1.length || !hs2.length) continue;
    // substituents (non-H, not the fragment carbons), with the β effect on Δχ
    const subsOf = (c: number, other: number) => nb[c].filter((k) => k !== other && !isH(k));
    const s1 = subsOf(c1, c2), s2 = subsOf(c2, c1);
    const n = s1.length + s2.length;
    const set = n >= 4 ? SET_E : n === 3 ? SET_D : SET_B;
    const dEff = (s: number, c: number) => dchi(model.atoms[s].z) - set.p7 * nb[s].filter((k) => k !== c).reduce((t, k) => t + dchi(model.atoms[k].z), 0);
    // a methyl on either side: Altona's rotational average, the same for every pair
    const me = hs1.length === 3 ? 1 : hs2.length === 3 ? 2 : 0;
    if (me) {
      const [cm, co] = me === 1 ? [c1, c2] : [c2, c1];
      const lam = nb[co].filter((k) => k !== cm && !isH(k)).map((k) => lambda(model, nb, order, k, co));
      const [l1 = 0, l2 = 0] = lam;
      const j = 7.84 - 0.59 * (l1 + l2) - 0.42 * l1 * l2;
      for (const h1 of hs1) for (const h2 of hs2) out.push({ h1, h2, c1, c2, j });
      continue;
    }
    for (const h1 of hs1) for (const h2 of hs2) {
      let j = 0;
      confs.forEach((cf, ci) => {
        const x = cf.xyz;
        const phi = torsion(x, h1, c1, c2, h2);
        const subs: { dchi: number; xi: number }[] = [];
        // substituent on c1: c1 in front; angle clockwise from h1 to s = phi(h1) − phi(s), both to h2
        for (const s of s1) subs.push({ dchi: dEff(s, c1), xi: xiOf(phi - torsion(x, s, c1, c2, h2)) });
        // substituent on c2: c2 in front, coupled proton h2
        for (const s of s2) subs.push({ dchi: dEff(s, c2), xi: xiOf(torsion(x, h2, c2, c1, h1) - torsion(x, s, c2, c1, h1)) });
        j += pops[ci] * hla(phi, subs, n);
      });
      out.push({ h1, h2, c1, c2, j: j / tot });
    }
  }
  return out;
}

/** +1 when the clockwise angle (degrees) is nearer +120°, −1 when nearer 240°. */
function xiOf(clockwise: number): number {
  const a = ((clockwise % 360) + 360) % 360;
  return a < 180 ? 1 : -1;
}

function smallRingAtoms(n: number, nb: number[][], bonds: { a: number; b: number }[]): Set<number> {
  const out = new Set<number>();
  for (const { a, b } of bonds) {
    // 3-ring: a common neighbour; 4-ring: neighbours of a and b that are bonded
    for (const k of nb[a]) if (k !== b && nb[b].includes(k)) [a, b, k].forEach((x) => out.add(x));
    for (const p of nb[a]) if (p !== b) for (const q of nb[b]) if (q !== a && q !== p && nb[p].includes(q)) [a, b, p, q].forEach((x) => out.add(x));
  }
  void n;
  return out;
}

/** Altona's λ group constant (1989, Table 6) for substituent atom s on carbon c. */
function lambda(model: Model3d, nb: number[][], order: Map<string, number>, s: number, c: number): number {
  const z = model.atoms[s].z;
  const ord = (a: number, b: number) => order.get(`${Math.min(a, b)},${Math.max(a, b)}`) ?? 1;
  const others = nb[s].filter((k) => k !== c);
  const hCount = others.filter((k) => model.atoms[k].z === 1).length;
  const heavy = others.filter((k) => model.atoms[k].z !== 1);
  switch (z) {
    case 1: return 0;
    case 9: return 1.37;
    case 17: return 0.94;
    case 35: return 0.8;
    case 53: return 0.63;
    case 14: return -0.15;
    case 3: return -0.54;
    case 8: {
      if (hCount) return 1.33; // OH
      const acyl = heavy.some((k) => model.atoms[k].z === 6 && nb[k].some((o) => o !== s && model.atoms[o].z === 8 && ord(k, o) === 2));
      return acyl ? 1.17 : 1.4; // OC(=O)R, OR
    }
    case 7: {
      if (heavy.some((k) => model.atoms[k].z === 8) && others.length === 2) return 0.77; // NO2
      return hCount ? 1.19 : 1.12; // NH2/NHR, NR2
    }
    case 16: return heavy.filter((k) => model.atoms[k].z === 8).length >= 2 ? 0.69 : 0.76;
    case 6: {
      if (others.some((k) => ord(s, k) === 3)) return 0.3; // CN, alkyne
      const carbonyl = others.some((k) => model.atoms[k].z === 8 && ord(s, k) === 2);
      if (carbonyl) return hCount ? 0.31 : others.some((k) => (model.atoms[k].z === 8 || model.atoms[k].z === 7) && ord(s, k) === 1) ? 0.42 : 0.48;
      if (others.some((k) => ord(s, k) !== 1)) return 0.45; // aryl, vinyl
      return 0.11 * hCount + 0.5; // saturated carbon without β halogens
    }
    default: return 0.4;
  }
}

/** A vicinal coupling between single protons of the NMR graph: proton ka of heavy atom a and
 *  proton kb of heavy atom b (protons counted in the 3-D model's order). */
export interface ProtonJ { a: number; ka: number; b: number; kb: number; j: number }

/**
 * The 3-D couplings on the NMR graph's atoms. heavy: the model atom of each graph atom (the
 * model keeps the molfile's atom order). Atoms whose hydrogen count differs from the graph's
 * are left out.
 */
export function graphCouplings3d(model: Model3d, heavy: number[], hCount: number[]): ProtonJ[] {
  const toGraph = new Map(heavy.map((m, g) => [m, g] as [number, number]));
  const hs = new Map<number, number[]>();
  const hOf = (m: number) => {
    let l = hs.get(m);
    if (!l) {
      l = [];
      for (const b of model.bonds) {
        const o = b.a === m ? b.b : b.b === m ? b.a : -1;
        if (o >= 0 && model.atoms[o].z === 1) l.push(o);
      }
      l.sort((p, q) => p - q);
      hs.set(m, l);
    }
    return l;
  };
  const out: ProtonJ[] = [];
  for (const v of vicinal3d(model)) {
    const a = toGraph.get(v.c1), b = toGraph.get(v.c2);
    if (a === undefined || b === undefined) continue;
    const la = hOf(v.c1), lb = hOf(v.c2);
    if (la.length !== hCount[a] || lb.length !== hCount[b]) continue;
    out.push({ a, ka: la.indexOf(v.h1), b, kb: lb.indexOf(v.h2), j: v.j });
  }
  return out;
}
