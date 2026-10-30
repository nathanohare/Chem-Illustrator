// Estimated pKa values: which atoms of a molecule give up or take a proton in water, and how
// readily. The method is Perrin, Dempsey and Serjeant's ("pKa Prediction for Organic Acids and
// Bases", Chapman & Hall 1981): each ionising group has a parent value, moved by its neighbours
// through Hammett σ (aromatic rings: Hansch, Leo and Taft, Chem. Rev. 1991, 91, 165) or Taft σ*
// (chains) with the group's own ρ. Aliphatic amines use per-position increments for groups one
// and two carbons away (as tabulated by Morgenthaler et al., ChemMedChem 2007, 2, 1100). Typical
// errors are 0.5 to 1 unit; groups the rules don't cover get no value rather than a guess.
//
// Each site's value is for that group alone, with the rest of the molecule in its usual state at
// that pH (an amine next to an acid counts as NH3+, as in a zwitterion); later protons of a
// polyprotic molecule are not worked out.

/** One acidic proton or basic atom. For a base the value is the pKa of its conjugate acid (pKaH). */
export interface PkaSite {
  /** The atom (RDKit's numbering) that loses the proton or takes it. */
  atom: number;
  kind: 'acid' | 'base';
  pka: number;
  /** What the group is, in plain words. */
  group: string;
}

interface JsonMol {
  atoms: { z?: number; impHs?: number; chg?: number }[];
  bonds: { bo?: number; atoms: [number, number] }[];
  extensions?: { name: string; aromaticAtoms?: number[]; atomRings?: number[][] }[];
}

/** Hammett constants [σm, σp, σp⁻] (σp⁻ for a para group that takes a ring's lone pair). */
const SIGMA: Record<string, [number, number, number]> = {
  Me: [-0.07, -0.17, -0.17], alkyl: [-0.07, -0.15, -0.15], aryl: [0.06, -0.01, 0.02], vinyl: [0.06, -0.04, 0.0],
  alkynyl: [0.21, 0.23, 0.53], CF3: [0.43, 0.54, 0.65], CCl3: [0.4, 0.46, 0.5],
  F: [0.34, 0.06, -0.03], Cl: [0.37, 0.23, 0.19], Br: [0.39, 0.23, 0.25], I: [0.35, 0.18, 0.27],
  OH: [0.12, -0.37, -0.37], OR: [0.12, -0.27, -0.26], OAr: [0.25, -0.03, -0.03], OCOR: [0.39, 0.31, 0.31],
  NH2: [-0.16, -0.66, -0.66], NHR: [-0.21, -0.7, -0.7], NR2: [-0.16, -0.83, -0.83], NHCOR: [0.21, 0.0, 0.0],
  NHSO2R: [0.2, 0.03, 0.03], NO2: [0.71, 0.78, 1.27], CN: [0.56, 0.66, 1.0], CHO: [0.35, 0.42, 1.03],
  COR: [0.38, 0.5, 0.84], CO2R: [0.37, 0.45, 0.75], CO2H: [0.37, 0.45, 0.77], CONR2: [0.28, 0.36, 0.61],
  SO2R: [0.6, 0.72, 1.13], SO2NR2: [0.53, 0.6, 0.94], SO3H: [0.3, 0.35, 0.5], SOR: [0.52, 0.49, 0.73],
  SR: [0.15, 0.0, 0.06], SH: [0.25, 0.15, 0.15], B: [-0.01, 0.12, 0.12], Si: [-0.04, -0.07, -0.07], P: [0.42, 0.5, 0.5],
  // a ring nitrogen in the ring itself (an aza group)
  aza: [0.65, 0.93, 0.93],
};

/** Taft σ* of a group X as felt through one CH2 (σ*(CH2X) = 0.4·g). */
const G: Record<string, number> = {
  F: 2.75, Cl: 2.63, Br: 2.5, I: 2.13, OH: 1.39, OR: 1.3, OAr: 1.6, OCOR: 1.7, NH2: 0.62, NHR: 0.62, NR2: 0.62,
  NH3: 4.0, NHCOR: 1.4, NHSO2R: 1.6, NO2: 4.0, CN: 3.3, CHO: 2.15, COR: 1.65, CO2R: 2.0, CO2H: 2.08, CONR2: 1.68,
  SO2R: 3.3, SO2NR2: 3.0, SO3H: 3.5, SOR: 2.9, SR: 1.3, SH: 1.3, aryl: 0.6, vinyl: 0.4, alkynyl: 1.74,
  B: 0, Si: -0.3, P: 2.0, aza: 0,
};

/** Change in an amine's pKaH from a group on the carbon next to N (2) or the one beyond (3). */
const AMINE_INC: Record<string, [number, number]> = {
  F: [-4.0, -1.7], Cl: [-4.0, -1.5], Br: [-4.0, -1.5], I: [-3.5, -1.3], OH: [-2.0, -1.1], OR: [-2.0, -1.2],
  OAr: [-2.3, -1.5], OCOR: [-2.5, -1.6], NH2: [-1.5, -0.9], NHR: [-1.5, -0.9], NR2: [-1.5, -0.9],
  NHCOR: [-2.0, -1.0], NHSO2R: [-2.2, -1.1], NO2: [-6.0, -2.8], CN: [-5.3, -2.9], CHO: [-2.9, -1.6],
  COR: [-2.9, -1.6], CO2R: [-2.9, -1.6], CO2H: [-1.0, -0.3], CONR2: [-2.6, -1.3], SO2R: [-3.5, -1.8],
  SO2NR2: [-3.3, -1.7], SO3H: [-2.0, -0.6], SOR: [-3.0, -1.6], SR: [-1.5, -1.0], SH: [-1.5, -1.0],
  aryl: [-1.3, -0.7], vinyl: [-1.1, -0.5], alkynyl: [-2.5, -1.0], B: [0, 0], Si: [0.2, 0.1], P: [-2.5, -1.2], aza: [0, 0],
};

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Estimated pKa values of a molecule given as RDKit JSON: acids first (most acidic first), then bases. */
export function estimatePka(json: string): PkaSite[] {
  const j = JSON.parse(json);
  const defs = j.defaults ?? {};
  const mol: JsonMol = j.molecules[0];
  const n = mol.atoms.length;
  const z = mol.atoms.map((a) => a.z ?? defs.atom?.z ?? 6);
  const hs = mol.atoms.map((a) => a.impHs ?? defs.atom?.impHs ?? 0);
  const chg = mol.atoms.map((a) => a.chg ?? defs.atom?.chg ?? 0);
  const ext = mol.extensions?.find((e) => e.name === 'rdkitRepresentation');
  const arom = new Set(ext?.aromaticAtoms ?? []);
  const rings = (ext?.atomRings ?? []).map((r) => r.slice());
  const nb: [number, number][][] = Array.from({ length: n }, () => []);
  for (const b of mol.bonds) {
    const [p, q] = b.atoms;
    const bo = b.bo ?? defs.bond?.bo ?? 1;
    if (z[p] === 1 && z[q] !== 1) { hs[q]++; continue; }
    if (z[q] === 1 && z[p] !== 1) { hs[p]++; continue; }
    nb[p].push([q, bo]);
    nb[q].push([p, bo]);
  }
  // the neutral parent: a drawn anion gets its proton back, an ammonium loses its extra one
  // (a nitro group or N-oxide keeps its charges)
  for (let a = 0; a < n; a++) {
    if (chg[a] === -1 && (z[a] === 8 || z[a] === 16 || z[a] === 7) && !nb[a].some(([b]) => chg[b] > 0)) { chg[a] = 0; hs[a]++; }
    else if (chg[a] === 1 && z[a] === 7 && hs[a] > 0 && !nb[a].some(([b]) => chg[b] < 0)) { chg[a] = 0; hs[a]--; }
  }

  const heavy = (a: number) => nb[a].map(([b]) => b);
  const deg = (a: number) => nb[a].length;
  const ringsOf = (a: number) => rings.filter((r) => r.includes(a));
  const sameRing = (a: number, b: number) => rings.some((r) => r.includes(a) && r.includes(b));
  /** A terminal =O (or =S) on atom a. */
  const oxo = (a: number, el = 8) => nb[a].filter(([b, bo]) => bo === 2 && z[b] === el && deg(b) === 1).map(([b]) => b);
  const isCarbonyl = (c: number) => z[c] === 6 && !arom.has(c) && oxo(c).length === 1;
  const isSulfonyl = (s: number) => z[s] === 16 && oxo(s).length === 2;
  const sp3C = (c: number) => z[c] === 6 && !arom.has(c) && nb[c].every(([, bo]) => bo === 1);
  const aromNs = (r: number[]) => r.filter((a) => z[a] === 7 && arom.has(a)).length;

  /** What kind of group x is, seen from the atom `from` it is attached to. */
  const key = (x: number, from: number): string => {
    const others = heavy(x).filter((b) => b !== from);
    switch (z[x]) {
      case 9: return 'F';
      case 17: return 'Cl';
      case 35: return 'Br';
      case 53: return 'I';
      case 5: return 'B';
      case 14: return 'Si';
      case 15: return 'P';
      case 8:
        if (hs[x]) return 'OH';
        if (others.some(isCarbonyl)) return 'OCOR';
        if (others.some((b) => arom.has(b))) return 'OAr';
        return 'OR';
      case 7: {
        if (arom.has(x)) return 'aryl';
        if (oxo(x).length === 2 || (others.filter((b) => z[b] === 8 && deg(b) === 1).length === 2)) return 'NO2';
        if (nb[x].some(([b, bo]) => b === from && bo === 3)) return 'CN';
        if (others.some(isCarbonyl)) return 'NHCOR';
        if (others.some(isSulfonyl)) return 'NHSO2R';
        if (chg[x] > 0) return 'NH3';
        return hs[x] >= 2 ? 'NH2' : hs[x] === 1 ? 'NHR' : 'NR2';
      }
      case 16: {
        const o = oxo(x).length;
        if (o === 2) return others.some((b) => z[b] === 8 && hs[b]) ? 'SO3H' : others.some((b) => z[b] === 7) ? 'SO2NR2' : 'SO2R';
        if (o === 1) return 'SOR';
        return hs[x] ? 'SH' : 'SR';
      }
      case 6: {
        if (arom.has(x)) return 'aryl';
        if (nb[x].some(([b, bo]) => bo === 3 && z[b] === 7)) return 'CN';
        if (nb[x].some(([, bo]) => bo === 3)) return 'alkynyl';
        if (isCarbonyl(x)) {
          if (others.some((b) => z[b] === 8 && hs[b] && deg(b) === 1)) return 'CO2H';
          if (others.some((b) => z[b] === 8 && deg(b) === 2)) return 'CO2R';
          if (others.some((b) => z[b] === 7)) return 'CONR2';
          return hs[x] ? 'CHO' : 'COR';
        }
        if (nb[x].some(([, bo]) => bo === 2)) return 'vinyl';
        const hal = others.filter((b) => z[b] === 9).length, cl = others.filter((b) => z[b] === 17).length;
        if (hal === 3) return 'CF3';
        if (cl === 3) return 'CCl3';
        return hs[x] === 3 ? 'Me' : 'alkyl';
      }
    }
    return 'alkyl';
  };

  /** Taft σ* of the group that starts at atom a (attached to `from`); H is 0.49. */
  const sigmaStar = (a: number, from: number, depth = 0): number => {
    if (z[a] === 6 && sp3C(a)) {
      const parts: number[] = [];
      for (const b of heavy(a)) {
        if (b === from) continue;
        if (depth < 3 && sp3C(b)) parts.push(0.4 * sigmaStar(b, a, depth + 1) - 0.1);
        else parts.push(0.4 * g(b, a));
      }
      // several pulling groups on one carbon add up less than fully (CHCl2, CCl3)
      const pos = parts.filter((p) => p > 0).sort((p, q) => q - p);
      return pos.reduce((s, p, k) => s + p * 0.85 ** k, 0) + parts.filter((p) => p <= 0).reduce((s, p) => s + p, 0);
    }
    return g(a, from);
  };
  /** g of a group, an amine nitrogen counted as protonated (as it is near an acid in water). */
  const g = (a: number, from: number): number => {
    if (z[a] === 6 && arom.has(a)) return G.aryl + 0.3 * Math.max(0, ...ringsOf(a).map(aromNs));
    let k = key(a, from);
    if ((k === 'NH2' || k === 'NHR' || k === 'NR2') && amineN(a)) k = 'NH3';
    return G[k] ?? 0;
  };

  /** An sp3 amine nitrogen: not aromatic, not on a ring carbon, carbonyl, sulfonyl, C=N, N or O. */
  const amineN = (a: number) =>
    z[a] === 7 && !arom.has(a) && chg[a] === 0 && deg(a) + hs[a] === 3 && nb[a].every(([b, bo]) => bo === 1 && z[b] === 6 && !arom.has(b) && !isCarbonyl(b) && !nb[b].some(([c, bo2]) => bo2 >= 2 && c !== a));

  // ---------------------------------------------------------------- Hammett sums on a ring

  /**
   * Σσ for the substituents of the six-membered aromatic ring that atom r (the ring atom bearing
   * the site, or the ring N itself) belongs to. `minus`: para acceptors use σp⁻. `skip` is the site.
   */
  const hammett = (r: number, skip: number, opts: { minus?: boolean; ortho: 'max' | 'twice-meta' }): { sum: number; ortho: number } | null => {
    const ring = ringsOf(r).find((rg) => rg.length === 6 && rg.every((a) => arom.has(a)));
    if (!ring) return null;
    // distance round the ring from r
    const dist = new Map<number, number>([[r, 0]]);
    const queue = [r];
    while (queue.length) {
      const a = queue.shift()!;
      for (const b of heavy(a)) if (ring.includes(b) && !dist.has(b)) { dist.set(b, dist.get(a)! + 1); queue.push(b); }
    }
    let sum = 0, ortho = 0;
    const sigma = (s: [number, number, number], d: number) => {
      if (d === 2) return s[0];
      const p = opts.minus ? s[2] : s[1];
      if (d === 3) return p;
      return opts.ortho === 'twice-meta' ? 2 * s[0] : Math.max(p, s[0]);
    };
    for (const c of ring) {
      const d = dist.get(c)!;
      if (d === 0) continue;
      if (z[c] === 7) sum += d === 1 && z[r] === 7 ? 0.5 : sigma(SIGMA.aza, d);
      for (const x of heavy(c)) {
        if (ring.includes(x) || x === skip) continue;
        // a ring fused on (both atoms in another ring with this one) counts once, from one side
        if (arom.has(x) && sameRing(x, c) && heavy(x).some((y) => y !== c && ring.includes(y))) continue;
        sum += sigma(SIGMA[key(x, c)] ?? [0, 0, 0], d);
        if (d === 1) ortho++;
      }
    }
    return { sum, ortho };
  };

  const sites: PkaSite[] = [];
  const add = (atom: number, kind: 'acid' | 'base', pka: number, group: string) => {
    if (kind === 'acid' ? pka <= 16 : pka >= -2) sites.push({ atom, kind, pka: r1(pka), group });
  };
  const attachedAryl = (a: number) => heavy(a).find((b) => arom.has(b) && z[b] === 6);

  for (let a = 0; a < n; a++) {
    // ------------------------------------------------------------ acids
    if (z[a] === 8 && hs[a] && deg(a) === 1) {
      const c = heavy(a)[0];
      if (isCarbonyl(c)) {
        const rest = heavy(c).filter((b) => b !== a && !oxo(c).includes(b));
        if (rest.some((b) => z[b] === 8 || z[b] === 7)) continue; // carbonic and carbamic acids
        const R = rest[0];
        if (R === undefined) add(a, 'acid', 4.66 - 1.62 * 0.49, 'carboxylic acid');
        else if (arom.has(R)) {
          const h = hammett(R, c, { ortho: 'max' });
          if (h) add(a, 'acid', 4.2 - 1.0 * h.sum - 0.5 * h.ortho, 'carboxylic acid');
          else add(a, 'acid', 3.5, 'carboxylic acid');
        } else add(a, 'acid', 4.66 - 1.62 * sigmaStar(R, c), 'carboxylic acid');
        continue;
      }
      if (z[c] === 6 && arom.has(c)) {
        const h = hammett(c, a, { minus: true, ortho: 'max' });
        if (h) add(a, 'acid', 9.92 - 2.23 * h.sum, 'phenol OH');
        continue;
      }
      if (sp3C(c)) { add(a, 'acid', 15.5 - 3.4 * sigmaStar(c, a), 'alcohol OH'); continue; }
      if (z[c] === 16 && oxo(c).length === 2) {
        const arylS = attachedAryl(c) !== undefined;
        add(a, 'acid', heavy(c).some((b) => b !== a && z[b] === 8 && deg(b) === 2) ? -3 : arylS ? -2.8 : -1.9, heavy(c).some((b) => z[b] === 8 && deg(b) === 2) ? 'sulfate' : 'sulfonic acid');
        continue;
      }
      if (z[c] === 15 && oxo(c).length) {
        // one value per P, from the first of its OH groups
        if (heavy(c).find((b) => z[b] === 8 && hs[b] && deg(b) === 1) !== a) continue;
        const esters = heavy(c).filter((b) => z[b] === 8 && deg(b) === 2).length;
        const carbons = heavy(c).filter((b) => z[b] === 6).length;
        add(a, 'acid', carbons >= 2 ? 3.1 : carbons === 1 ? 2.4 : esters ? 1.5 : 2.1, carbons ? 'phosphonic acid' : 'phosphoric acid');
        continue;
      }
      if (z[c] === 5) {
        if (heavy(c).find((b) => z[b] === 8 && hs[b]) !== a) continue;
        const ar = attachedAryl(c);
        const h = ar !== undefined ? hammett(ar, c, { ortho: 'max' }) : null;
        add(a, 'acid', ar !== undefined ? 8.8 - 2.1 * (h?.sum ?? 0) : 10.4, 'boronic acid');
        continue;
      }
      if (z[c] === 7) {
        const acyl = heavy(c).filter(isCarbonyl).length;
        if (acyl >= 2) add(a, 'acid', 6.0, 'N-hydroxyimide OH');
        else if (acyl === 1) add(a, 'acid', 9.0, 'hydroxamic acid');
        else if (nb[c].some(([b, bo]) => bo === 2 && z[b] === 6)) {
          const cn = nb[c].find(([b, bo]) => bo === 2 && z[b] === 6)![0];
          add(a, 'acid', heavy(cn).some((b) => arom.has(b)) ? 10.7 : 11.9, 'oxime OH');
        }
        continue;
      }
    }
    if (z[a] === 16 && hs[a] && deg(a) === 1) {
      const c = heavy(a)[0];
      if (z[c] === 6 && arom.has(c)) {
        const h = hammett(c, a, { minus: true, ortho: 'max' });
        if (h) add(a, 'acid', 6.62 - 2.18 * h.sum, 'thiophenol SH');
      } else if (sp3C(c)) add(a, 'acid', 10.3 - 3.5 * sigmaStar(c, a), 'thiol SH');
      continue;
    }
    if (z[a] === 7 && hs[a] && !arom.has(a)) {
      const sulf = heavy(a).filter(isSulfonyl);
      const acyl = heavy(a).filter(isCarbonyl);
      if (sulf.length >= 2) add(a, 'acid', 1.5, 'sulfonimide NH');
      else if (sulf.length === 1) {
        const other = heavy(a).find((b) => b !== sulf[0]);
        const arylS = attachedAryl(sulf[0]) !== undefined;
        if (other === undefined) add(a, 'acid', arylS ? 10.1 : 10.8, 'sulfonamide NH');
        else if (isCarbonyl(other)) add(a, 'acid', 4.5, 'acylsulfonamide NH');
        else if (arom.has(other)) add(a, 'acid', ringsOf(other).some((r) => aromNs(r) > 0) ? 6.5 : 8.5, 'sulfonamide NH');
        else add(a, 'acid', 11.0, 'sulfonamide NH');
      } else if (acyl.length >= 2) {
        const urea = acyl.some((c) => heavy(c).some((b) => b !== a && z[b] === 7));
        const aroyl = acyl.every((c) => attachedAryl(c) !== undefined);
        const sixRing = ringsOf(a).some((r) => r.length === 6);
        add(a, 'acid', urea ? 9.2 : aroyl ? 8.3 : sixRing ? 11.4 : 9.6, 'imide NH');
      }
    }
    if (z[a] === 7 && hs[a] && arom.has(a)) {
      const r5 = ringsOf(a).find((r) => r.length === 5 && r.every((b) => arom.has(b)));
      const r6 = ringsOf(a).find((r) => r.length === 6 && r.every((b) => arom.has(b)));
      if (r5) {
        const k = r5.filter((b) => b !== a && z[b] === 7).length;
        const benzo = r5.some((b) => ringsOf(b).some((r) => r !== r5 && r.length === 6));
        const v = [17.5, 14.4, 9.8, 4.9][Math.min(k, 3)] - (benzo ? 1.5 : 0);
        add(a, 'acid', v, k === 3 ? 'tetrazole NH' : 'azole NH');
      } else if (r6) {
        const co = heavy(a).filter((b) => oxo(b).length || nb[b].some(([c, bo]) => bo === 2 && z[c] === 8)).length;
        if (co) add(a, 'acid', co >= 2 ? 9.4 : 11.6, co >= 2 ? 'uracil-type NH' : 'pyridone NH');
      }
    }
    if (z[a] === 6 && hs[a] && sp3C(a)) {
      // carbon acids: between two carbonyls (or nitriles), or next to a nitro group
      const nitro = heavy(a).filter((b) => key(b, a) === 'NO2');
      if (nitro.length) { add(a, 'acid', 10.2 - 0.8 * heavy(a).filter((b) => b !== nitro[0] && z[b] === 6).length - 3 * (nitro.length - 1), 'nitroalkane CH'); continue; }
      const ewg = heavy(a).map((b) => key(b, a)).filter((k) => ['COR', 'CHO', 'CO2R', 'CONR2', 'CN', 'SO2R'].includes(k));
      if (ewg.length >= 2) {
        const val: Record<string, number> = { COR: 4.5, CHO: 4.5, CO2R: 6.5, CONR2: 7.5, CN: 5.6, SO2R: 6.0 };
        const twoMost = ewg.map((k) => val[k]).sort((p, q) => p - q).slice(0, 2);
        let v = twoMost[0] + twoMost[1] - 3 * (ewg.length - 2);
        const carbonyls = heavy(a).filter(isCarbonyl);
        if (carbonyls.length >= 2 && carbonyls.every((c) => sameRing(a, c))) v -= ewg.includes('COR') ? 3.7 : ewg.includes('CONR2') ? 11 : 8.2;
        add(a, 'acid', Math.max(v, 1), '1,3-dicarbonyl CH');
      }
    }

    // ------------------------------------------------------------ bases
    if (z[a] === 7 && !arom.has(a) && chg[a] === 0) {
      if (amineN(a)) {
        const carbons = heavy(a);
        const nonMethyl = carbons.filter((c) => !(hs[c] === 3)).length;
        let v = carbons.length === 1 ? 10.65 : carbons.length === 2 ? 10.75 + 0.2 * nonMethyl : 9.8 + 0.3 * nonMethyl;
        if (carbons.length === 0) v = 9.25; // ammonia
        if (ringsOf(a).some((r) => r.length === 3)) v -= 3;
        for (const ca of carbons) {
          for (const x of heavy(ca)) {
            if (x === a) continue;
            if (sp3C(x)) {
              for (const y of heavy(x)) {
                if (y === ca || y === a) continue;
                if (sp3C(y)) {
                  for (const w of heavy(y)) {
                    if (w === x || w === a || sp3C(w)) continue;
                    v += 0.45 * (AMINE_INC[key(w, y)]?.[1] ?? 0);
                  }
                } else v += AMINE_INC[key(y, x)]?.[1] ?? 0;
              }
            } else if (arom.has(x) && ringsOf(x).some((r) => aromNs(r) > 0)) v += -1.8; // a heteroaryl
            else v += AMINE_INC[key(x, ca)]?.[0] ?? 0;
          }
        }
        add(a, 'base', v, carbons.length === 3 ? 'tertiary amine' : carbons.length === 2 ? 'secondary amine' : carbons.length === 1 ? 'primary amine' : 'ammonia');
        continue;
      }
      // anilines (N on an aromatic carbon of a six-membered ring, not an amide or sulfonamide)
      const ar = heavy(a).filter((b) => arom.has(b) && z[b] === 6);
      if (ar.length && deg(a) + hs[a] === 3 && nb[a].every(([b, bo]) => bo === 1 && !isCarbonyl(b) && !isSulfonyl(b) && (arom.has(b) || sp3C(b)))) {
        if (ar.length >= 2) { add(a, 'base', 0.8, 'diarylamine N'); continue; }
        const h = hammett(ar[0], a, { minus: true, ortho: 'max' });
        if (h) {
          const alkyls = deg(a) - 1;
          add(a, 'base', [4.6, 4.85, 5.07][alkyls] - 2.89 * h.sum - 0.6 * h.ortho, 'aniline N');
        }
        continue;
      }
      // amidines and guanidines (the =N takes the proton), and imines
      const dbl = nb[a].find(([b, bo]) => bo === 2 && z[b] === 6 && !arom.has(b));
      if (dbl && !heavy(a).some((b) => z[b] === 8 || z[b] === 7 || isCarbonyl(b) || isSulfonyl(b))) {
        const c = dbl[0];
        const ns = heavy(c).filter((b) => b !== a && z[b] === 7);
        const allN = [a, ...ns];
        const acylated = allN.some((m) => heavy(m).some((b) => b !== c && (isCarbonyl(b) || isSulfonyl(b))));
        const aryl = allN.some((m) => heavy(m).some((b) => b !== c && arom.has(b)));
        if (ns.length >= 2) add(a, 'base', 13.6 - (acylated ? 5.6 : 0) - (aryl ? 2.8 : 0), 'guanidine N');
        else if (ns.length === 1) {
          // alkyl groups on the nitrogens (DBU) make an amidine a little stronger
          const alkyls = allN.reduce((t, m) => t + heavy(m).filter((b) => b !== c && sp3C(b)).length, 0);
          add(a, 'base', 12.4 + 0.3 * alkyls - (acylated ? 5 : 0) - (aryl ? 2.5 : 0) - (heavy(c).some((b) => arom.has(b)) ? 0.8 : 0), 'amidine N');
        }
        else if (!heavy(c).some((b) => z[b] === 8 || z[b] === 16)) add(a, 'base', aryl || heavy(c).some((b) => arom.has(b)) ? 5.5 : 7.0, 'imine N');
        continue;
      }
      // hydroxylamines and hydrazines
      if (deg(a) + hs[a] === 3 && nb[a].every(([, bo]) => bo === 1) && !heavy(a).some((b) => isCarbonyl(b) || isSulfonyl(b) || arom.has(b))) {
        if (heavy(a).some((b) => z[b] === 8)) add(a, 'base', 5.9, 'hydroxylamine N');
        else if (heavy(a).some((b) => z[b] === 7 && !arom.has(b) && !heavy(b).some(isCarbonyl))) add(a, 'base', 8.1, 'hydrazine N');
      }
    }
    // aromatic N with a lone pair in the ring's plane (pyridine-type)
    if (z[a] === 7 && arom.has(a) && !hs[a] && deg(a) === 2 && chg[a] === 0) {
      const r6 = ringsOf(a).find((r) => r.length === 6 && r.every((b) => arom.has(b)));
      const r5 = ringsOf(a).find((r) => r.length === 5 && r.every((b) => arom.has(b)));
      if (r6) {
        // a pyridone's ring N is an amide, not a base
        if (r6.some((b) => oxo(b).length)) continue;
        const h = hammett(a, -1, { ortho: 'twice-meta' });
        if (h) add(a, 'base', 5.25 - 5.9 * h.sum, ringsOf(a).length > 1 || r6.some((b) => ringsOf(b).length > 1) ? 'aza-arene N' : 'pyridine N');
      } else if (r5) {
        const others = r5.filter((b) => b !== a && z[b] !== 6);
        const adjacent = others.filter((b) => heavy(a).includes(b));
        const pyrroleN = others.filter((b) => z[b] === 7 && (hs[b] || deg(b) === 3));
        let v: number;
        if (others.length === 1 && !adjacent.length) v = z[others[0]] === 7 ? 7.0 : z[others[0]] === 16 ? 2.5 : 0.8;
        else if (others.length === 1) v = z[others[0]] === 7 ? 2.5 : -3;
        else v = pyrroleN.length ? 2.0 : -2;
        // groups on the ring carbons: alkyl and amino push electrons in, acceptors pull them out
        for (const c of r5) {
          if (z[c] !== 6) continue;
          const between = heavy(c).filter((b) => r5.includes(b) && z[b] !== 6).length === 2;
          for (const x of heavy(c)) {
            if (r5.includes(x)) continue;
            if (arom.has(x) && sameRing(x, c)) { v -= 0.75; continue; } // a fused ring (counted from both carbons)
            const k = key(x, c);
            const s = SIGMA[k]?.[1] ?? 0;
            if (k === 'NH2' || k === 'NHR' || k === 'NR2') v += between ? 2.9 : 1.5;
            else if (k === 'Me' || k === 'alkyl') v += between ? 0.9 : 0.5;
            else v -= 4 * Math.max(0, s);
          }
        }
        // a fused ring that pulls electrons out: ring nitrogens (purine), carbonyls (caffeine)
        for (const fr of rings) {
          if (fr === r5 || fr.filter((b) => r5.includes(b)).length < 2) continue;
          v -= 1.5 * fr.filter((b) => !r5.includes(b) && z[b] === 7 && !hs[b] && deg(b) === 2).length;
          v -= 2.5 * fr.filter((b) => oxo(b).length).length;
        }
        add(a, 'base', v, 'azole N');
      }
    }
  }
  const acids = sites.filter((s) => s.kind === 'acid').sort((p, q) => p.pka - q.pka);
  const bases = sites.filter((s) => s.kind === 'base').sort((p, q) => q.pka - p.pka);
  return [...acids, ...bases];
}
