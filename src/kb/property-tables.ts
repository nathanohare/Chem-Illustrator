// The pKa in Water table, from the same public-domain records as Reagent Safety (HSDB via PubChem),
// and each solvent's class under the ICH Q3C guideline for residual solvents (ICH Q3C(R8), 2021),
// which drug regulators in the US, EU and Japan apply, for the Solvents table (solvents.ts). The
// class and limit are regulatory facts, cited.

import { SAFETY_RECORDS } from './safety-tables';
import type { Cell, KbSource, KbTable } from './tables';

export type IchClass = 'Class 1 (avoid)' | 'Class 2 (limit)' | 'Class 3 (low toxicity)' | 'No adequate data';

/** ICH Q3C(R8): each solvent's class and concentration limit in a drug (ppm, Option 1). */
export const ICH_Q3C: Record<string, { cls: IchClass; ppm?: number; note?: string }> = {
  Benzene: { cls: 'Class 1 (avoid)', ppm: 2 }, 'Carbon tetrachloride': { cls: 'Class 1 (avoid)', ppm: 4 }, '1,2-Dichloroethane': { cls: 'Class 1 (avoid)', ppm: 5 },
  Acetonitrile: { cls: 'Class 2 (limit)', ppm: 410 }, Chlorobenzene: { cls: 'Class 2 (limit)', ppm: 360 }, Chloroform: { cls: 'Class 2 (limit)', ppm: 60 },
  Cyclohexane: { cls: 'Class 2 (limit)', ppm: 3880 }, Dichloromethane: { cls: 'Class 2 (limit)', ppm: 600 }, '1,2-Dimethoxyethane': { cls: 'Class 2 (limit)', ppm: 100 },
  'N,N-Dimethylacetamide': { cls: 'Class 2 (limit)', ppm: 1090 }, 'N,N-Dimethylformamide': { cls: 'Class 2 (limit)', ppm: 880 }, '1,4-Dioxane': { cls: 'Class 2 (limit)', ppm: 380 },
  'Ethylene glycol': { cls: 'Class 2 (limit)', ppm: 620 }, Formamide: { cls: 'Class 2 (limit)', ppm: 220 }, Hexane: { cls: 'Class 2 (limit)', ppm: 290 },
  Methanol: { cls: 'Class 2 (limit)', ppm: 3000 }, 'N-Methyl-2-pyrrolidone': { cls: 'Class 2 (limit)', ppm: 530 }, Nitromethane: { cls: 'Class 2 (limit)', ppm: 50 },
  Pyridine: { cls: 'Class 2 (limit)', ppm: 200 }, Sulfolane: { cls: 'Class 2 (limit)', ppm: 160 }, Tetrahydrofuran: { cls: 'Class 2 (limit)', ppm: 720 },
  Toluene: { cls: 'Class 2 (limit)', ppm: 890 }, 'o-Xylene': { cls: 'Class 2 (limit)', ppm: 2170, note: 'as xylene' },
  'Acetic acid': { cls: 'Class 3 (low toxicity)' }, Acetone: { cls: 'Class 3 (low toxicity)' }, '1-Butanol': { cls: 'Class 3 (low toxicity)' },
  'tert-Butyl methyl ether': { cls: 'Class 3 (low toxicity)' }, 'Dimethyl sulfoxide': { cls: 'Class 3 (low toxicity)' }, Ethanol: { cls: 'Class 3 (low toxicity)' },
  'Ethyl acetate': { cls: 'Class 3 (low toxicity)' }, 'Diethyl ether': { cls: 'Class 3 (low toxicity)' }, Heptane: { cls: 'Class 3 (low toxicity)' },
  Pentane: { cls: 'Class 3 (low toxicity)' }, Isopropanol: { cls: 'Class 3 (low toxicity)' }, '2-Methyltetrahydrofuran': { cls: 'Class 3 (low toxicity)' },
  Triethylamine: { cls: 'Class 3 (low toxicity)' },
  Anisole: { cls: 'Class 3 (low toxicity)' }, '2-Butanol': { cls: 'Class 3 (low toxicity)' }, '2-Methyl-1-propanol': { cls: 'Class 3 (low toxicity)' },
  'Methyl ethyl ketone': { cls: 'Class 3 (low toxicity)' }, 'Methyl acetate': { cls: 'Class 3 (low toxicity)' }, '1-Pentanol': { cls: 'Class 3 (low toxicity)' },
  '1-Propanol': { cls: 'Class 3 (low toxicity)' },
  'Diisopropyl ether': { cls: 'No adequate data' }, 'Petroleum ether': { cls: 'No adequate data' }, 'Trifluoroacetic acid': { cls: 'No adequate data' },
};

const pubchem = (row: Record<string, Cell>): KbSource[] => (row.cid ? [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${row.cid}` }] : []);

/** Text cut to a cell's length. */
const cut = (t: string | undefined, n = 90): string | null => (t ? (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t) : null);

export const PKA_TABLE: KbTable = {
  id: 'pka-water',
  title: 'pKa in Water',
  about: 'Measured pKa values in water, as the Hazardous Substances Data Bank records them (for amines this is usually the pKa of the protonated base). DMSO pKa tables wait on permission from their authors.',
  columns: [
    { key: 'name', label: 'Compound' },
    { key: 'pka', label: 'pKa (as recorded)', prose: true },
    { key: 'formula', label: 'Formula' },
    { key: 'cas', label: 'CAS' },
  ],
  rows: SAFETY_RECORDS.filter((r) => r.pka && /\d/.test(r.pka.text)).map((r): Record<string, Cell> => ({
    cid: r.cid, name: r.name, pka: cut(r.pka!.text, 200), formula: r.formula, cas: r.cas, smiles: r.smiles,
  })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  sources: [{ label: 'Hazardous Substances Data Bank, via PubChem', url: 'https://pubchem.ncbi.nlm.nih.gov/source/hsdb' }],
  links: pubchem,
};
