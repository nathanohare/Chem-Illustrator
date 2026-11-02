// The Knowledge Base's built-in tables. Only facts the program may carry: hazard numbers and
// physical constants from public-domain records (safety-tables.ts), the residual peaks of the
// common deuterated solvents (printed on every solvent maker's chart), and the glossary and the
// purification and technique notes (handling.ts) written for this program. Larger published
// tables (trace impurities in each solvent) are imported by the user from their own copy and kept
// on their computer; see tables.ts parseUserTable.

import { GLOSSARY } from './glossary';
import { PURIFICATION_TABLE, TECHNIQUES_TABLE } from './handling';
import type { Cell, KbTable } from './tables';
import { PHYSICAL_CONSTANTS, REAGENT_SAFETY } from './safety-tables';
import { PKA_TABLE, SOLVENTS_TABLE } from './property-tables';
import { HAMMETT_TABLE } from './hammett';

/** The common NMR solvents: residual 1H and 13C peaks, the water peak, and boiling and melting points. */
export const NMR_SOLVENTS: KbTable = {
  id: 'nmr-solvents',
  title: 'NMR Solvents',
  about: 'Residual solvent peaks, the water (HDO) peak and physical data for common deuterated solvents. Type a shift (7.26) to find the solvent it belongs to.',
  columns: [
    { key: 'name', label: 'Solvent' },
    { key: 'formula', label: 'Formula', narrow: true },
    { key: 'h', label: '1H residual (ppm)', shift: '1H' },
    { key: 'hm', label: 'Mult.', narrow: true },
    { key: 'c', label: '13C (ppm)', shift: '13C' },
    { key: 'cm', label: 'Mult.', narrow: true },
    { key: 'water', label: 'HDO / H2O (ppm)', shift: '1H' },
    { key: 'bp', label: 'bp (°C)', numeric: true },
    { key: 'mp', label: 'mp (°C)', numeric: true },
    { key: 'cas', label: 'CAS' },
  ],
  rows: [
    { name: 'Chloroform-d', formula: 'CDCl3', h: '7.26', hm: 's', c: '77.16', cm: 't', water: '1.56', bp: 61, mp: -64, cas: '865-49-6', smiles: '[2H]C(Cl)(Cl)Cl' },
    { name: 'Acetone-d6', formula: '(CD3)2CO', h: '2.05', hm: 'quint', c: '29.84, 206.26', cm: 'sept, s', water: '2.84', bp: 56, mp: -95, cas: '666-52-4', smiles: '[2H]C([2H])([2H])C(=O)C([2H])([2H])[2H]' },
    { name: 'Dimethyl sulfoxide-d6', formula: '(CD3)2SO', h: '2.50', hm: 'quint', c: '39.52', cm: 'sept', water: '3.33', bp: 189, mp: 18, cas: '2206-27-1', smiles: '[2H]C([2H])([2H])S(=O)C([2H])([2H])[2H]' },
    { name: 'Benzene-d6', formula: 'C6D6', h: '7.16', hm: 's', c: '128.06', cm: 't', water: '0.40', bp: 80, mp: 5, cas: '1076-43-3', smiles: '[2H]c1c([2H])c([2H])c([2H])c([2H])c1[2H]' },
    { name: 'Acetonitrile-d3', formula: 'CD3CN', h: '1.94', hm: 'quint', c: '1.32, 118.26', cm: 'sept, s', water: '2.13', bp: 82, mp: -45, cas: '2206-26-0', smiles: '[2H]C([2H])([2H])C#N' },
    { name: 'Methanol-d4', formula: 'CD3OD', h: '3.31, 4.87 (OH)', hm: 'quint, s', c: '49.00', cm: 'sept', water: '4.87', bp: 65, mp: -98, cas: '811-98-3', smiles: '[2H]OC([2H])([2H])[2H]' },
    { name: 'Deuterium oxide', formula: 'D2O', h: '4.79', hm: 's', c: null, cm: null, water: '4.79', bp: 101, mp: 4, cas: '7789-20-0', smiles: '[2H]O[2H]' },
    { name: 'Dichloromethane-d2', formula: 'CD2Cl2', h: '5.32', hm: 't', c: '53.84', cm: 'quint', water: '1.52', bp: 40, mp: -95, cas: '1665-00-5', smiles: '[2H]C([2H])(Cl)Cl' },
    { name: 'Tetrahydrofuran-d8', formula: 'C4D8O', h: '3.58, 1.72', hm: 'm, m', c: '67.21, 25.31', cm: 'quint, quint', water: '2.46', bp: 65, mp: -108, cas: '1693-74-9', smiles: '[2H]C1([2H])OC([2H])([2H])C([2H])([2H])C1([2H])[2H]' },
    { name: 'Toluene-d8', formula: 'C6D5CD3', h: '7.09, 7.01, 6.97, 2.08', hm: 'm, m, m, quint', c: '137.48, 128.87, 127.96, 125.13, 20.43', cm: 's, t, t, t, sept', water: '0.43', bp: 111, mp: -95, cas: '2037-26-5', smiles: '[2H]c1c([2H])c([2H])c(C([2H])([2H])[2H])c([2H])c1[2H]' },
    { name: 'Pyridine-d5', formula: 'C5D5N', h: '8.74, 7.58, 7.22', hm: 'br, br, br', c: '150.35, 135.91, 123.87', cm: 't, t, t', water: null, bp: 115, mp: -42, cas: '7291-22-7', smiles: '[2H]c1nc([2H])c([2H])c([2H])c1[2H]' },
  ],
  sources: [
    { label: 'Fulmer, G. R. et al. Organometallics 2010, 29, 2176', url: 'https://doi.org/10.1021/om100106e' },
    { label: 'Gottlieb, H. E.; Kotlyar, V.; Nudelman, A. J. Org. Chem. 1997, 62, 7512', url: 'https://doi.org/10.1021/jo971176v' },
  ],
};

/** The glossary as a table. */
export const GLOSSARY_TABLE: KbTable = {
  id: 'glossary',
  title: 'Abbreviations',
  about: 'What each abbreviation and acronym in the Knowledge Base means. Rest the mouse on one anywhere in these tables to see this.',
  columns: [
    { key: 'term', label: 'Abbreviation' },
    { key: 'full', label: 'Stands for' },
    { key: 'meaning', label: 'Meaning' },
    { key: 'kind', label: 'Kind', filter: true, narrow: true },
  ],
  rows: GLOSSARY.map((g) => ({ term: g.term, full: g.full, meaning: g.meaning || null, kind: g.kind })),
  sources: [{ label: 'Written for Chem Illustrator' }],
};

/** The tables built in, in the order the window lists them. */
export const BUILT_IN_TABLES: KbTable[] = [REAGENT_SAFETY, PURIFICATION_TABLE, TECHNIQUES_TABLE, SOLVENTS_TABLE, NMR_SOLVENTS, PHYSICAL_CONSTANTS, PKA_TABLE, HAMMETT_TABLE, GLOSSARY_TABLE];

/** Big tables loaded when the window first opens, kept out of the program's start-up. */
export const LATER_TABLES: (() => Promise<KbTable>)[] = [
  async () => (await import('./solubility')).SOLUBILITY_TABLE,
  async () => (await import('./green-nmr')).GREEN_NMR_TABLE,
];

/** More rows for built-in tables, loaded the same way: the big Reagent Safety table. */
export const LATER_ROWS: { table: string; rows: () => Promise<Record<string, Cell>[]> }[] = [
  { table: 'reagent-safety', rows: async () => (await import('./safety-extra')).extraSafetyRows() },
  { table: 'physical-constants', rows: async () => (await import('./safety-extra')).extraConstantRows() },
];
