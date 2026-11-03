// Peaks that are not the compound's: the NMR solvent's residual and water peaks (Knowledge Base ▸
// NMR Solvents), green solvents as trace impurities (Knowledge Base ▸ Green Solvents in NMR,
// CC BY), and any shift table the user imported into the Knowledge Base (their own copy of a
// published impurity table). Check Data names extra peaks from these.

import { NMR_SOLVENTS } from '../../kb/data';
import { cellNumbers, type Cell, type KbTable } from '../../kb/tables';
import type { CheckNucleus, KnownPeak } from './check';

/** NMR Solvents table formula for each solvent name the panel and peak lists use. */
const FORMULA: Record<string, string> = {
  CDCl3: 'CDCl3', 'DMSO-d6': '(CD3)2SO', 'acetone-d6': '(CD3)2CO', C6D6: 'C6D6', CD3CN: 'CD3CN', CD3OD: 'CD3OD',
  D2O: 'D2O', CD2Cl2: 'CD2Cl2', 'THF-d8': 'C4D8O', 'toluene-d8': 'C6D5CD3', 'pyridine-d5': 'C5D5N',
};
/** Green Solvents in NMR table's solvent names. */
const GREEN: Record<string, string> = {
  CDCl3: 'CDCl3', 'DMSO-d6': 'DMSO-d6', 'acetone-d6': 'Acetone-d6', CD3CN: 'CD3CN', CD3OD: 'CD3OD', D2O: 'D2O', 'THF-d8': 'THF-d8', 'toluene-d8': 'Toluene-d8',
};

const nums = (c: Cell | undefined) => (c === undefined || c === null ? [] : cellNumbers(c));

/** Solvent and impurity peaks for a solvent (case-insensitive name, as a peak list writes it).
 *  imported: the Knowledge Base's imported tables (JSON) or null. */
export async function knownPeaks(solvent: string, nuc: CheckNucleus, imported: string | null = null): Promise<KnownPeak[]> {
  const key = Object.keys(FORMULA).find((k) => k.toLowerCase() === solvent.toLowerCase()) ?? solvent;
  const out: KnownPeak[] = [];
  const row = NMR_SOLVENTS.rows.find((r) => r.formula === FORMULA[key]);
  if (row) {
    for (const v of nums(row[nuc === '1H' ? 'h' : 'c'])) out.push({ name: `Residual ${key}`, shift: v });
    if (nuc === '1H') for (const v of nums(row.water)) out.push({ name: 'Water', shift: v });
  }
  if (GREEN[key]) {
    try {
      const { GREEN_NMR_TABLE } = await import('../../kb/green-nmr');
      for (const r of GREEN_NMR_TABLE.rows) {
        if (r.solvent !== GREEN[key] || r.nucleus !== nuc) continue;
        for (const v of nums(r[nuc === '1H' ? 'h' : 'c'])) out.push({ name: String(r.name).replace(/\s*\(.*\)$/, ''), shift: v });
      }
    } catch { /* the table could not load: solvent peaks only */ }
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
    if (!t || !Array.isArray(t.rows) || !Array.isArray(t.columns) || t.pdf) continue;
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
  const key = Object.keys(FORMULA).find((k) => k.toLowerCase() === solvent.toLowerCase()) ?? solvent;
  const row = NMR_SOLVENTS.rows.find((r) => r.formula === FORMULA[key]);
  if (!row) return [];
  const cell = row[nuc === '1H' ? 'h' : 'c'];
  // methanol-d4's OH (4.87) moves; reference to the CHD2 line
  return nums(typeof cell === 'string' ? cell.replace(/[\d.]+\s*\(OH\)/, '') : cell);
}
