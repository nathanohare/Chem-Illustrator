// The Knowledge Base's built-in tables. Only facts the program may carry: hazard numbers and
// physical constants from public-domain records (safety-tables.ts), solvent properties (Murov's
// Table 1, solvents.ts), which solvents mix and acid strengths (lab-tables.ts), pKa values, Hammett
// constants and the glossary. Larger published tables (trace impurities in each solvent) are
// imported by the user from their own copy and kept on their computer; see tables.ts parseUserTable.

import { GLOSSARY } from './glossary';
import type { Cell, KbTable } from './tables';
import { PHYSICAL_CONSTANTS, REAGENT_SAFETY } from './safety-tables';
import { PKA_TABLE } from './property-tables';
import { SOLVENTS_TABLE } from './solvents';
import { ACIDS_TABLE, MISCIBILITY_TABLE } from './lab-tables';
import { HAMMETT_TABLE } from './hammett-table';

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
  sources: [{ label: 'Written for Chemweave' }],
};

/** The tables built in, in the order the window lists them. */
export const BUILT_IN_TABLES: KbTable[] = [REAGENT_SAFETY, SOLVENTS_TABLE, MISCIBILITY_TABLE, ACIDS_TABLE, PHYSICAL_CONSTANTS, PKA_TABLE, HAMMETT_TABLE, GLOSSARY_TABLE];

/** Big tables loaded when the window first opens, kept out of the program's start-up. */
export const LATER_TABLES: (() => Promise<KbTable>)[] = [
  async () => (await import('./pka')).PKA_VALUES_TABLE,
];

/** More rows for built-in tables, loaded the same way: the big Reagent Safety table. */
export const LATER_ROWS: { table: string; rows: () => Promise<Record<string, Cell>[]> }[] = [
  { table: 'reagent-safety', rows: async () => (await import('./safety-extra')).extraSafetyRows() },
  { table: 'physical-constants', rows: async () => (await import('./safety-extra')).extraConstantRows() },
];
