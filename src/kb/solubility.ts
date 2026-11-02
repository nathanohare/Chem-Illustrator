// The Solubility table: measured aqueous solubility of 9,982 compounds from AqSolDB (Sorkun,
// Khetan & Er, Sci. Data 2019, 6, 143; CC0 1.0), built by scripts/kb/build-aqsol.mjs. It is about
// 1 MB, so the window loads it only when it opens.

import data from './aqsol-data.json';
import { sig } from './safety-tables';
import type { Cell, KbTable } from './tables';

/** AqSolDB's reliability groups: how many datasets agreed on the value. */
export const RELIABILITY = ['', 'One source', 'Two sources, differing', 'Two or more, agreeing', 'Three or more, some differing', 'Three or more, agreeing'];

type Row = [name: string, smiles: string, logS: number, mw: number, group: number];

/** Grams per litre from log S (mol/L) and the molar mass. */
export function gramsPerLitre(logS: number, mw: number): number {
  return 10 ** logS * mw;
}

export const SOLUBILITY_TABLE: KbTable = {
  id: 'solubility',
  title: 'Solubility in Water',
  about: 'Measured solubility in water at about 25 °C for 9,982 compounds. log S is in mol/L; the more sources agreed, the more reliable the value.',
  columns: [
    { key: 'name', label: 'Compound' },
    { key: 'logs', label: 'log S (mol/L)', numeric: true },
    { key: 'gl', label: 'g/L', numeric: true },
    { key: 'mw', label: 'MW', numeric: true },
    { key: 'reliability', label: 'Reliability', filter: true, info: 'How many of the datasets AqSolDB merged measured this compound, and whether their values agreed (within 0.5 log units). More sources agreeing means a more reliable value. Source: Sorkun, Khetan and Er, Sci. Data 2019.' },
    { key: 'smiles', label: 'SMILES', hidden: true },
  ],
  rows: (data as unknown as { rows: Row[] }).rows.map(([name, smiles, logS, mw, g]): Record<string, Cell> => ({
    name, smiles, logs: logS, gl: sig(gramsPerLitre(logS, mw)), mw, reliability: RELIABILITY[g] ?? null,
  })),
  sources: [
    { label: 'AqSolDB: Sorkun, M. C.; Khetan, A.; Er, S. Sci. Data 2019, 6, 143 (CC0 1.0)', url: 'https://doi.org/10.1038/s41597-019-0151-1' },
  ],
  canonicalSmiles: true,
  links: (row) => [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(String(row.name))}` }],
};
