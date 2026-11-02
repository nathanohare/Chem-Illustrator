// The Solvents and pKa in Water tables, from the same public-domain records as Reagent Safety
// (HSDB, NIOSH, CAMEO via PubChem), with each solvent's CHEM21 ranking (Prat et al., Green Chem.
// 2016, 18, 288: a ranking is a published fact, cited, not a copy of the paper's tables).

import { SAFETY_RECORDS, short } from './safety-tables';
import { logKowOf } from './safety';
import type { Cell, KbSource, KbTable } from './tables';

type Chem21 = 'Recommended' | 'Problematic' | 'Hazardous' | 'Highly hazardous';

/** CHEM21's ranking of the classical solvents, after the authors' discussion. */
export const CHEM21: Record<string, Chem21> = {
  Water: 'Recommended', Methanol: 'Recommended', Ethanol: 'Recommended', Isopropanol: 'Recommended', '1-Butanol': 'Recommended',
  'Ethylene glycol': 'Recommended', Acetone: 'Recommended', 'Ethyl acetate': 'Recommended',
  Tetrahydrofuran: 'Problematic', '2-Methyltetrahydrofuran': 'Problematic', Heptane: 'Problematic', Cyclohexane: 'Problematic',
  Toluene: 'Problematic', 'o-Xylene': 'Problematic', Acetonitrile: 'Problematic', 'Dimethyl sulfoxide': 'Problematic', 'Acetic acid': 'Problematic',
  'tert-Butyl methyl ether': 'Hazardous', 'Diisopropyl ether': 'Hazardous', '1,4-Dioxane': 'Hazardous', '1,2-Dimethoxyethane': 'Hazardous',
  Pentane: 'Hazardous', Hexane: 'Hazardous', Dichloromethane: 'Hazardous', 'N,N-Dimethylformamide': 'Hazardous',
  'N,N-Dimethylacetamide': 'Hazardous', 'N-Methyl-2-pyrrolidone': 'Hazardous', Sulfolane: 'Hazardous', Pyridine: 'Hazardous', Triethylamine: 'Hazardous',
  'Diethyl ether': 'Highly hazardous', Benzene: 'Highly hazardous', Chloroform: 'Highly hazardous', 'Carbon tetrachloride': 'Highly hazardous',
  '1,2-Dichloroethane': 'Highly hazardous', Nitromethane: 'Highly hazardous', 'Carbon disulfide': 'Highly hazardous', Hexamethylphosphoramide: 'Highly hazardous',
};

/** Solvents in the safety data the CHEM21 guide doesn't rank, shown in the table all the same. */
const OTHER_SOLVENTS = ['Chlorobenzene', 'Formamide', 'Petroleum ether', 'Trifluoroacetic acid', '1,1,1,3,3,3-Hexafluoro-2-propanol', '2,2,2-Trifluoroethanol', 'Propylene carbonate'];

const CHEM21_SOURCE: KbSource = { label: 'CHEM21 selection guide: Prat, D. et al. Green Chem. 2016, 18, 288–296', url: 'https://doi.org/10.1039/C5GC01008J' };

const byName = new Map(SAFETY_RECORDS.map((r) => [r.name, r]));
const pubchem = (row: Record<string, Cell>): KbSource[] => (row.cid ? [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${row.cid}` }] : []);

/** Text cut to a cell's length. */
const cut = (t: string | undefined, n = 90): string | null => (t ? (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t) : null);

export const SOLVENTS_TABLE: KbTable = {
  id: 'solvents',
  title: 'Solvents',
  about: 'Common solvents: CHEM21 green ranking, boiling and melting points, density, flash point, viscosity, refractive index, solubility in water, what they mix with, and log Kow.',
  columns: [
    { key: 'name', label: 'Solvent' },
    { key: 'chem21', label: 'CHEM21', filter: true },
    { key: 'bp', label: 'bp', numeric: true },
    { key: 'mp', label: 'mp', numeric: true },
    { key: 'density', label: 'Density', numeric: true },
    { key: 'flash', label: 'Flash point', numeric: true },
    { key: 'viscosity', label: 'Viscosity' },
    { key: 'nd', label: 'Refractive index' },
    { key: 'water', label: 'In water', prose: true },
    { key: 'organic', label: 'Mixes with', prose: true },
    { key: 'logkow', label: 'log Kow', numeric: true },
    { key: 'cas', label: 'CAS' },
  ],
  rows: [...Object.keys(CHEM21), ...OTHER_SOLVENTS].map((n): Record<string, Cell> | null => {
    const r = byName.get(n);
    if (!r) return null;
    const k = logKowOf(r);
    return {
      cid: r.cid, name: r.name, chem21: CHEM21[n] ?? 'Not ranked', bp: short(r.bp?.text), mp: short(r.mp?.text), density: short(r.density?.text), flash: short(r.flash?.text),
      viscosity: cut(r.viscosity?.text, 40), nd: cut(r.refractive?.text?.replace(/^Index of refraction:\s*/i, ''), 40),
      water: cut(r.water?.text), organic: cut(r.organic?.text, 120), logkow: k && !/XLogP/.test(k.source) ? k.value : null, cas: r.cas, smiles: r.smiles,
    };
  }).filter((r): r is Record<string, Cell> => !!r).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  sources: [
    CHEM21_SOURCE,
    { label: 'Hazardous Substances Data Bank, NIOSH and NOAA CAMEO, via PubChem (physical data)', url: 'https://pubchem.ncbi.nlm.nih.gov/source/hsdb' },
  ],
  links: pubchem,
};

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
