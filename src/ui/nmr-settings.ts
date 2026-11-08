// The NMR prediction settings (Settings ▸ NMR Prediction), kept in this computer's local storage
// like the panel's own choices (solvent, nucleus, quality).

export type RangeNucleus = '1H' | '13C';

/** Where a spectrum is drawn from and to (ppm) before any peak outside it widens it. */
export const DEFAULT_RANGE: Record<RangeNucleus, { lo: number; hi: number }> = { '1H': { lo: -0.5, hi: 10 }, '13C': { lo: -5, hi: 200 } };

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null): void => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not remembered */ } };

/** Predict as soon as a structure is selected (off: the NMR section stays closed until it is opened). */
export function nmrAutoPredict(): boolean { return get('ci-nmr-auto') === '1'; }
export function setNmrAutoPredict(v: boolean): void { put('ci-nmr-auto', v ? '1' : '0'); }

export function nmrRange(nuc: RangeNucleus): { lo: number; hi: number } {
  const lo = Number(get(`ci-nmr-${nuc}-lo`)), hi = Number(get(`ci-nmr-${nuc}-hi`));
  const d = DEFAULT_RANGE[nuc];
  const okLo = get(`ci-nmr-${nuc}-lo`) !== null && Number.isFinite(lo), okHi = get(`ci-nmr-${nuc}-hi`) !== null && Number.isFinite(hi);
  const r = { lo: okLo ? lo : d.lo, hi: okHi ? hi : d.hi };
  return r.hi > r.lo ? r : { ...d };
}
export function setNmrRange(nuc: RangeNucleus, lo: number, hi: number): void {
  const d = DEFAULT_RANGE[nuc];
  const same = lo === d.lo && hi === d.hi;
  put(`ci-nmr-${nuc}-lo`, same ? null : String(lo));
  put(`ci-nmr-${nuc}-hi`, same ? null : String(hi));
}

/** The range for a set of shifts: the setting, widened to take in any shift past either end. */
export function rangeFor(nuc: RangeNucleus, shifts: number[]): { lo: number; hi: number } {
  let { lo, hi } = nmrRange(nuc);
  const m = nuc === '1H' ? 0.5 : 10;
  for (const x of shifts) {
    if (!Number.isFinite(x)) continue;
    if (x + m / 2 > hi) hi = Math.ceil((x + m) / m) * m;
    if (x - m / 2 < lo) lo = Math.floor((x - m) / m) * m;
  }
  return { lo, hi };
}
