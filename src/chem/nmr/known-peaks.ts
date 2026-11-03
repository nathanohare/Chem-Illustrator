// Peaks that are not the compound's: the NMR solvent's residual and water peaks (Knowledge Base ▸
// NMR Solvents) and green solvents as trace impurities (Knowledge Base ▸ Green Solvents in NMR,
// CC BY). Check Data names extra peaks from these.

import { NMR_SOLVENTS } from '../../kb/data';
import { cellNumbers, type Cell } from '../../kb/tables';
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

/** Solvent and impurity peaks for a solvent (case-insensitive name, as a peak list writes it). */
export async function knownPeaks(solvent: string, nuc: CheckNucleus): Promise<KnownPeak[]> {
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
  return out;
}
