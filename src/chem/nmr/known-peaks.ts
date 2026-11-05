// Peaks that are not the compound's: the NMR solvent's residual and water peaks, and any shift table
// the user imported into the Knowledge Base (their own copy of a published impurity table). Check
// Data names extra peaks from these.

import { cellNumbers, type Cell, type KbTable } from '../../kb/tables';
import type { CheckNucleus, KnownPeak } from './check';

/** Residual 1H and 13C peaks and the water (HDO/H2O) peak of the common deuterated solvents, ppm
 *  (Fulmer et al., Organometallics 2010, 29, 2176; Gottlieb et al., J. Org. Chem. 1997, 62, 7512). */
const SOLVENT_PEAKS: Record<string, { h: string; c: string | null; water: string | null }> = {
  CDCl3: { h: '7.26', c: '77.16', water: '1.56' },
  'acetone-d6': { h: '2.05', c: '29.84, 206.26', water: '2.84' },
  'DMSO-d6': { h: '2.50', c: '39.52', water: '3.33' },
  C6D6: { h: '7.16', c: '128.06', water: '0.40' },
  CD3CN: { h: '1.94', c: '1.32, 118.26', water: '2.13' },
  CD3OD: { h: '3.31, 4.87 (OH)', c: '49.00', water: '4.87' },
  D2O: { h: '4.79', c: null, water: '4.79' },
  CD2Cl2: { h: '5.32', c: '53.84', water: '1.52' },
  'THF-d8': { h: '3.58, 1.72', c: '67.21, 25.31', water: '2.46' },
  'toluene-d8': { h: '7.09, 7.01, 6.97, 2.08', c: '137.48, 128.87, 127.96, 125.13, 20.43', water: '0.43' },
  'pyridine-d5': { h: '8.74, 7.58, 7.22', c: '150.35, 135.91, 123.87', water: null },
};

const nums = (c: Cell | undefined) => (c === undefined || c === null ? [] : cellNumbers(c));

/** Solvent and impurity peaks for a solvent (case-insensitive name, as a peak list writes it).
 *  imported: the Knowledge Base's imported tables (JSON) or null. */
export async function knownPeaks(solvent: string, nuc: CheckNucleus, imported: string | null = null): Promise<KnownPeak[]> {
  const key = Object.keys(SOLVENT_PEAKS).find((k) => k.toLowerCase() === solvent.toLowerCase()) ?? solvent;
  const out: KnownPeak[] = [];
  const row = SOLVENT_PEAKS[key];
  if (row) {
    for (const v of nums(nuc === '1H' ? row.h : row.c)) out.push({ name: `Residual ${key}`, shift: v });
    if (nuc === '1H') for (const v of nums(row.water)) out.push({ name: 'Water', shift: v });
  }
  out.push(...importedPeaks(imported, key, nuc));
  return out;
}

/** Peaks from imported tables: every column marked as a shift of this nucleus. A table with a
 *  column naming solvents gives only the rows for this solvent (or a column per solvent: only that
 *  column). The row's first column names it. */
export function importedPeaks(json: string | null, solvent: string, nuc: CheckNucleus): KnownPeak[] {
  if (!json) return [];
  let tables: KbTable[];
  try { tables = JSON.parse(json) as KbTable[]; } catch { return []; }
  if (!Array.isArray(tables)) return [];
  const out: KnownPeak[] = [];
  const sol = solvent.toLowerCase();
  const sameSolvent = (v: Cell | undefined) => typeof v === 'string' && v.toLowerCase().replace(/[^a-z0-9]/g, '') === sol.replace(/[^a-z0-9]/g, '');
  for (const t of tables) {
    if (!t || !Array.isArray(t.rows) || !Array.isArray(t.columns)) continue;
    const shiftCols = t.columns.filter((c) => c.shift === nuc);
    if (!shiftCols.length) continue;
    // a column per solvent ("CDCl3", "1H CDCl3" ...): use only this solvent's
    const perSolvent = shiftCols.filter((c) => c.label.toLowerCase().replace(/[^a-z0-9]/g, '').includes(sol.replace(/[^a-z0-9]/g, '')));
    const cols = perSolvent.length ? perSolvent : shiftCols;
    const nameKey = t.columns[0]?.key;
    const solventCol = t.columns.find((c) => t.rows.some((r) => sameSolvent(r[c.key])));
    for (const r of t.rows) {
      if (!perSolvent.length && solventCol && !sameSolvent(r[solventCol.key])) continue;
      for (const c of cols) for (const v of nums(r[c.key])) out.push({ name: String(r[nameKey] ?? t.title), shift: v });
    }
  }
  return out;
}

/** The residual peaks of a solvent (for referencing a measured spectrum). */
export function residualPeaks(solvent: string, nuc: CheckNucleus): number[] {
  const key = Object.keys(SOLVENT_PEAKS).find((k) => k.toLowerCase() === solvent.toLowerCase()) ?? solvent;
  const row = SOLVENT_PEAKS[key];
  if (!row) return [];
  const cell = nuc === '1H' ? row.h : row.c;
  // methanol-d4's OH (4.87) moves; reference to the CHD2 line
  return nums(cell === null ? null : cell.replace(/[\d.]+\s*\(OH\)/, ''));
}
