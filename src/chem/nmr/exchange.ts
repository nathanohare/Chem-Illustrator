// Where OH, NH and SH protons usually appear. Their shifts move with concentration, water, temperature
// and hydrogen bonding, so the panel does not predict them; Check Data uses these ranges to match
// a measured OH/NH/SH peak to its group. Usual textbook ranges (Pretsch et al., Structure
// Determination of Organic Compounds; Silverstein et al., Spectrometric Identification of Organic Compounds).

import type { JGraph } from './coupling';

export type ExchangeKind =
  | 'acid' | 'phenol' | 'alcohol' | 'oxime'
  | 'amide' | 'imide' | 'carbamate' | 'sulfonamide' | 'azole' | 'arylamine' | 'amine' | 'ammonium'
  | 'arylthiol' | 'thiol';

const NAME: Record<ExchangeKind, string> = {
  acid: 'carboxylic acid OH', phenol: 'phenol OH', alcohol: 'alcohol OH', oxime: 'oxime OH',
  amide: 'amide NH', imide: 'imide NH', carbamate: 'carbamate NH', sulfonamide: 'sulfonamide NH', azole: 'pyrrole/indole-type NH',
  arylamine: 'aryl amine NH', amine: 'alkyl amine NH', ammonium: 'ammonium NH', arylthiol: 'aryl thiol SH', thiol: 'alkyl thiol SH',
};

/** Usual ranges (ppm): in CDCl3 and similar, and in DMSO-d6 (hydrogen bonds to the solvent move them up). */
const RANGE: Record<ExchangeKind, { cdcl3: [number, number]; dmso: [number, number] }> = {
  acid: { cdcl3: [10, 13], dmso: [11.5, 13] },
  phenol: { cdcl3: [4.5, 7], dmso: [8.5, 10] },
  alcohol: { cdcl3: [1, 4], dmso: [4, 5.5] },
  oxime: { cdcl3: [8, 10], dmso: [10.5, 11.5] },
  amide: { cdcl3: [5.5, 8.5], dmso: [7.5, 10.5] },
  imide: { cdcl3: [7.5, 9], dmso: [10.5, 11.5] },
  carbamate: { cdcl3: [4.5, 5.5], dmso: [6.5, 7.5] },
  sulfonamide: { cdcl3: [4.5, 7], dmso: [7, 10] },
  azole: { cdcl3: [7.5, 9], dmso: [10.5, 11.5] },
  arylamine: { cdcl3: [3, 5], dmso: [4.5, 5.5] },
  amine: { cdcl3: [0.5, 2.5], dmso: [1, 3] },
  ammonium: { cdcl3: [7, 9], dmso: [7.5, 9] },
  arylthiol: { cdcl3: [3, 4], dmso: [5, 6] },
  thiol: { cdcl3: [1, 2], dmso: [2, 3] },
};

export interface ExchangeRange { kind: ExchangeKind; name: string; lo: number; hi: number; /** Exchanged with the solvent's deuterium: not seen. */ gone: boolean }

/** The kind of group an O, N or S hydrogen belongs to. */
export function exchangeKind(g: JGraph, i: number): ExchangeKind | null {
  const a = g.atoms[i];
  if (!(a.h > 0) || !['O', 'N', 'S'].includes(a.el)) return null;
  const nb = g.bonds.filter((b) => b.u === i || b.v === i).map((b) => ({ n: b.u === i ? b.v : b.u, o: b.o }));
  const doubleTo = (c: number, el: string) => g.bonds.some((b) => (b.u === c || b.v === c) && b.o === 2 && g.atoms[b.u === c ? b.v : b.u].el === el);
  const carbonyl = nb.filter((x) => g.atoms[x.n].el === 'C' && doubleTo(x.n, 'O'));
  if (a.el === 'O') {
    if (carbonyl.length) return 'acid';
    if (nb.some((x) => g.atoms[x.n].el === 'N' && doubleTo(x.n, 'C'))) return 'oxime';
    if (nb.some((x) => g.atoms[x.n].arom)) return 'phenol';
    return 'alcohol';
  }
  if (a.el === 'S') return nb.some((x) => g.atoms[x.n].arom) ? 'arylthiol' : 'thiol';
  if ((a.q ?? 0) > 0) return 'ammonium';
  if (a.arom) return 'azole';
  if (carbonyl.length >= 2) return 'imide';
  if (carbonyl.length) {
    const c = carbonyl[0].n;
    const ester = g.bonds.some((b) => (b.u === c || b.v === c) && b.o === 1 && g.atoms[b.u === c ? b.v : b.u].el === 'O');
    return ester ? 'carbamate' : 'amide';
  }
  if (nb.some((x) => g.atoms[x.n].el === 'S' && doubleTo(x.n, 'O'))) return 'sulfonamide';
  if (nb.some((x) => g.atoms[x.n].arom)) return 'arylamine';
  return 'amine';
}

/** The usual range for an O, N or S hydrogen in a solvent, or null for other atoms. */
export function exchangeRange(g: JGraph, i: number, solvent: string): ExchangeRange | null {
  const kind = exchangeKind(g, i);
  if (!kind) return null;
  const s = solvent.toLowerCase();
  const gone = /d2o|cd3od|methanol|deuterium/.test(s);
  const dmsoLike = /dmso|acetone|cd3cn|acetonitrile|dmf/.test(s);
  const [lo, hi] = RANGE[kind][dmsoLike ? 'dmso' : 'cdcl3'];
  return { kind, name: NAME[kind], lo, hi, gone };
}
