// The Solvents and pKa in Water tables, from the same public-domain records as Reagent Safety
// (HSDB, NIOSH, CAMEO via PubChem), with each solvent's class and residue limit under the ICH Q3C
// guideline for residual solvents (ICH Q3C(R8), 2021), which drug regulators in the US, EU and Japan
// apply. The class and limit are regulatory facts, cited.

import { SAFETY_RECORDS, short } from './safety-tables';
import { logKowOf } from './safety';
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
  'Diisopropyl ether': { cls: 'No adequate data' }, 'Petroleum ether': { cls: 'No adequate data' }, 'Trifluoroacetic acid': { cls: 'No adequate data' },
};

/** Solvents in the safety data that ICH Q3C doesn't list, shown in the table all the same. */
const OTHER_SOLVENTS = ['Water', 'Carbon disulfide', 'Hexamethylphosphoramide', '1,1,1,3,3,3-Hexafluoro-2-propanol', '2,2,2-Trifluoroethanol', 'Propylene carbonate'];

const ICH_SOURCE: KbSource = { label: 'ICH Q3C(R8) Impurities: Guideline for Residual Solvents, International Council for Harmonisation, 2021 (Tables 1–4)', url: 'https://database.ich.org/sites/default/files/ICH_Q3C-R8_Guideline_Step4_2021_0422_1.pdf' };

/** "600" for Class 2, "5000 (0.5%)" for Class 3 (50 mg a day without justification). */
function ichLimit(n: string): string | null {
  const q = ICH_Q3C[n];
  if (!q) return null;
  if (q.ppm !== undefined) return `${q.ppm.toLocaleString('en-US')}${q.note ? ` (${q.note})` : ''}`;
  return q.cls.startsWith('Class 3') ? '5,000 (0.5%)' : null;
}

const byName = new Map(SAFETY_RECORDS.map((r) => [r.name, r]));
const pubchem = (row: Record<string, Cell>): KbSource[] => (row.cid ? [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${row.cid}` }] : []);

/** Text cut to a cell's length. */
const cut = (t: string | undefined, n = 90): string | null => (t ? (t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t) : null);

export const SOLVENTS_TABLE: KbTable = {
  id: 'solvents',
  title: 'Solvents',
  about: 'Common solvents: ICH Q3C residual-solvent class and limit (Class 1 avoid, 2 limit, 3 low toxicity), with boiling and melting points, density, flash point, viscosity, refractive index, solubility in water, what they mix with, and log Kow.',
  columns: [
    { key: 'name', label: 'Solvent' },
    { key: 'ich', label: 'ICH Q3C class', filter: true, info: 'ICH Q3C(R8) residual-solvent class: how much of a solvent may be left in a medicine, set by its toxicity. Class 1: avoid (known or suspected carcinogens, environmental hazards). Class 2: limit (a ppm cap for each). Class 3: low toxic potential (up to 5,000 ppm). "No adequate data": listed, but no limit set. A safety limit for drug products, not a green-chemistry ranking. Source: ICH Q3C(R8), 2021.' },
    { key: 'limit', label: 'ICH limit (ppm)', numeric: true, info: 'The most a medicine may contain, in ppm, under ICH Q3C(R8): the solvent\'s permitted daily exposure for a 10 g daily dose. Class 3 solvents: 5,000 ppm (0.5%). Lower means more toxic. Source: ICH Q3C(R8), 2021.' },
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
  rows: [...Object.keys(ICH_Q3C), ...OTHER_SOLVENTS].map((n): Record<string, Cell> | null => {
    const r = byName.get(n);
    if (!r) return null;
    const k = logKowOf(r);
    return {
      cid: r.cid, name: r.name, ich: ICH_Q3C[n]?.cls ?? 'Not listed', limit: ichLimit(n), bp: short(r.bp?.text), mp: short(r.mp?.text), density: short(r.density?.text), flash: short(r.flash?.text),
      viscosity: cut(r.viscosity?.text, 40), nd: cut(r.refractive?.text?.replace(/^Index of refraction:\s*/i, ''), 40),
      water: cut(r.water?.text), organic: cut(r.organic?.text, 120), logkow: k && !/XLogP/.test(k.source) ? k.value : null, cas: r.cas, smiles: r.smiles,
    };
  }).filter((r): r is Record<string, Cell> => !!r).sort((a, b) => String(a.name).localeCompare(String(b.name))),
  sources: [
    ICH_SOURCE,
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
