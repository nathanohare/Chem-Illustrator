// Two bench tables: which common solvents mix (Miscibility), and the strength of concentrated acids
// and ammonia with the pH of 0.1 M solutions (Acids and Bases). Both are plain facts, entered here
// from the charts Nate uses; the concentrated reagents' molarities agree with % × density ÷ molar
// mass (tests/kb-lab-tables.test.ts checks them).

import type { Cell, KbTable } from './tables';

/** The solvents of the miscibility chart, in the order it lists them. */
export const MISCIBLE_SOLVENTS = [
  'Acetic acid', 'Acetone', 'Acetonitrile', 'Benzene', '1-Butanol', 'Butyl acetate', 'Carbon tetrachloride', 'Chloroform',
  'Cyclohexane', '1,2-Dichloroethane', 'Dichloromethane', 'Diethyl ether', 'Diisopropyl ether', 'DMF', 'DMSO', '1,4-Dioxane',
  'Ethanol', 'Ethyl acetate', 'Heptane', 'Hexane', 'Methanol', 'MEK (2-butanone)', 'MTBE', 'Pentane', '1-Propanol',
  '2-Propanol', 'THF', 'Toluene', 'Trichloroethylene', 'Water', 'Xylene',
];

/**
 * The pairs that form two phases in some proportions; every other pair mixes in all proportions.
 * The supplied chart also shaded xylene + trichloroethylene, which mix: their mixtures have been
 * measured across the whole composition range (Nath and Dubey, J. Phys. Chem. 1981, 85, 886), so
 * that pair is left out.
 */
export const IMMISCIBLE: [string, string][] = [
  ['Cyclohexane', 'Acetonitrile'], ['DMF', 'Cyclohexane'], ['DMSO', 'Cyclohexane'], ['Diethyl ether', 'DMSO'],
  ['Heptane', 'DMSO'], ['Heptane', 'DMF'], ['Heptane', 'Acetonitrile'],
  ['Hexane', 'DMSO'], ['Hexane', 'DMF'], ['Hexane', 'Acetonitrile'], ['Hexane', 'Acetic acid'],
  ['Methanol', 'Hexane'], ['Methanol', 'Heptane'], ['Methanol', 'Cyclohexane'],
  ['Pentane', 'Methanol'], ['Pentane', 'DMSO'], ['Pentane', 'DMF'], ['Pentane', 'Acetonitrile'], ['Pentane', 'Acetic acid'],
  ['Diisopropyl ether', 'DMF'],
  ['Water', 'Trichloroethylene'], ['Water', 'Toluene'], ['Water', 'Diisopropyl ether'], ['Water', 'Pentane'], ['Water', 'MEK (2-butanone)'],
  ['Water', 'MTBE'], ['Water', 'Hexane'], ['Water', 'Heptane'], ['Water', 'Diethyl ether'], ['Water', 'Ethyl acetate'],
  ['Water', 'Dichloromethane'], ['Water', '1,2-Dichloroethane'], ['Water', 'Cyclohexane'], ['Water', 'Chloroform'],
  ['Water', 'Carbon tetrachloride'], ['Water', 'Butyl acetate'], ['Water', '1-Butanol'], ['Water', 'Benzene'],
  ['Xylene', 'Water'], ['Xylene', 'DMSO'], ['Xylene', 'DMF'],
];

/** Does this pair form two phases? */
export function immiscible(a: string, b: string): boolean {
  return IMMISCIBLE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export const MISCIBILITY_TABLE: KbTable = {
  id: 'miscibility',
  title: 'Miscibility',
  about: 'Which common solvents mix. A shaded square means the two form two layers in some proportions (immiscible); a clear one means they mix in all proportions. Type a solvent to pick out its row and column; rest the pointer on a square to name the pair.',
  columns: [
    { key: 'name', label: 'Solvent' },
    { key: 'immiscible', label: 'Forms two layers with', prose: true },
  ],
  rows: MISCIBLE_SOLVENTS.map((name): Record<string, Cell> => {
    const with_ = MISCIBLE_SOLVENTS.filter((o) => o !== name && immiscible(name, o));
    return { name, immiscible: with_.length ? with_.join(', ') : 'Mixes with all the others' };
  }),
  matrix: {
    names: MISCIBLE_SOLVENTS,
    pairs: IMMISCIBLE,
    mark: 'Immiscible',
    markInfo: 'Immiscible: in some proportions the two form two phases (layers). Many such pairs still dissolve a little in each other.',
    other: 'Miscible',
  },
  sources: [
    { label: 'Common solvent miscibility chart (HPLC solvent suppliers), as supplied by Nate' },
    { label: 'Nath, J.; Dubey, S. J. Phys. Chem. 1981, 85, 886 (trichloroethylene + p-xylene mix in all proportions; the chart shaded the pair)', url: 'https://doi.org/10.1021/j150607a030' },
  ],
};

/** Concentrated reagents: % by weight, molarity, mL for 1 L of a 1 M solution, specific gravity. */
const CONCENTRATED: [string, number, number, number, number][] = [
  ['Acetic acid', 99.6, 17.4, 57.5, 1.05],
  ['Ammonia (ammonium hydroxide)', 25, 13.3, 75.1, 0.91],
  ['Ammonia (ammonium hydroxide)', 35, 18.1, 55.2, 0.88],
  ['Formic acid', 90, 23.6, 42.4, 1.205],
  ['Formic acid', 98, 25.9, 38.5, 1.22],
  ['Hydrochloric acid', 36, 11.6, 86.2, 1.18], // the chart printed 1.19; 36.0% HCl is 1.1791 g/mL at 20 °C (CRC Handbook)
  ['Nitric acid', 70, 15.7, 63.7, 1.42],
  ['Perchloric acid', 60, 9.2, 108.8, 1.54],
  ['Perchloric acid', 72, 12.2, 82.1, 1.7],
  ['Phosphoric acid', 90, 16.0, 62.4, 1.75],
  ['Sulfuric acid', 98, 18.3, 54.5, 1.835],
];

/** The pH of a 0.1 M (or saturated) solution in water at room temperature. */
const SOLUTION_PH: [string, string, number][] = [
  ['Hydrochloric acid', '0.1 M', 1.1], ['Trichloroacetic acid', '0.1 M', 1.2], ['Oxalic acid', '0.1 M', 1.3],
  ['Sodium hydrogen sulfate (bisulfate)', '0.1 M', 1.4], ['Tartaric acid', '0.1 M', 2.0], ['Citric acid', '0.1 M', 2.1],
  ['Salicylic acid', 'Saturated', 2.4], ['Succinic acid', '0.1 M', 2.7], ['Potassium hydrogen oxalate (bioxalate)', '0.1 M', 2.7],
  ['Benzoic acid', 'Saturated', 2.8], ['Ammonium dihydrogen phosphate (primary)', '0.1 M', 4.0], ['Potassium alum', '0.1 M', 4.2],
  ['Potassium dihydrogen phosphate (primary)', '0.1 M', 4.5], ['Sodium dihydrogen phosphate (primary)', '0.1 M', 4.5],
  ['Ammonium alum', '0.05 M', 4.6], ['Ammonium chloride', '0.1 M', 4.6], ['Boric acid', '0.1 M', 5.3],
  ['Ammonium sulfate', '0.1 M', 5.5], ['Ammonium oxalate', '0.1 M', 6.4], ['Diammonium hydrogen phosphate (secondary)', '0.1 M', 7.9],
  ['Sodium benzoate', '0.1 M', 8.0], ['Potassium bicarbonate', '0.1 M', 8.2], ['Sodium bicarbonate', '0.1 M', 8.3],
  ['Sodium acetate', '0.1 M', 8.9], ['Borax', '0.1 M', 9.2], ['Disodium hydrogen phosphate (secondary)', '0.1 M', 9.2],
  ['Sodium barbital', '0.1 M', 9.4], ['Potassium acetate', '0.1 M', 9.7], ['Ammonia (aqueous)', '0.1 M', 11.3],
  ['Potassium carbonate', '0.1 M', 11.5], ['Sodium carbonate', '0.1 M', 11.5], ['Calcium hydroxide', 'Saturated', 12.4],
  ['Sodium hydroxide', '0.1 M', 12.9],
];

const CONC_COLUMNS = [
  { key: 'name', label: 'Reagent' },
  { key: 'percent', label: '% by weight', numeric: true },
  { key: 'molarity', label: 'Molarity (approx.)', numeric: true, info: 'The concentrated reagent\'s molarity: % by weight × specific gravity × 10 ÷ molar mass. Bottles vary by a percent or two; the label or certificate gives the lot\'s own assay.' },
  { key: 'ml', label: 'mL for 1 L of 1 M', numeric: true, info: 'How many mL of the concentrated reagent, made up to 1 L with water, give a 1 M solution (1000 ÷ molarity). Add acid to water, never water to acid.' },
  { key: 'sg', label: 'Specific gravity', numeric: true },
];
const PH_COLUMNS = [
  { key: 'name', label: 'Chemical' },
  { key: 'conc', label: 'Concentration' },
  { key: 'ph', label: 'pH', numeric: true, info: 'The pH of the solution in water at room temperature, to about ±0.1.' },
];

export const ACIDS_TABLE: KbTable = {
  id: 'acids-bases',
  title: 'Acids and Bases',
  about: 'Concentrated acids and ammonia (% by weight, molarity, how much makes 1 L of 1 M, specific gravity), and the pH of 0.1 M solutions of common acids, bases and salts.',
  columns: [...CONC_COLUMNS, ...PH_COLUMNS.slice(1), { key: 'part', label: 'Part', hidden: true }],
  parts: [
    { key: 'conc', title: 'Concentrated reagents', columns: CONC_COLUMNS },
    { key: 'ph', title: 'pH of solutions', columns: PH_COLUMNS },
  ],
  rows: [
    // one decimal, as printed (16.0 M, pH 2.0)
    ...CONCENTRATED.map(([name, percent, molarity, ml, sg]): Record<string, Cell> => ({ part: 'conc', name, percent, molarity: molarity.toFixed(1), ml: ml.toFixed(1), sg })),
    ...SOLUTION_PH.map(([name, conc, ph]): Record<string, Cell> => ({ part: 'ph', name, conc, ph: ph.toFixed(1) })),
  ],
  sources: [
    { label: 'Common laboratory reference values, as supplied by Nate; molarities checked against % × density ÷ molar mass' },
    { label: 'CRC Handbook of Chemistry and Physics, Concentrative Properties of Aqueous Solutions: 36.0% HCl, 1.1791 g/mL at 20 °C (the chart printed 1.19)' },
  ],
};
