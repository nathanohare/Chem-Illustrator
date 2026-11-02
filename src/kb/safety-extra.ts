// The big Reagent Safety table: several thousand more compounds that an open source (HSDB, NIOSH,
// NOAA CAMEO, OSHA, DOE PAC, EU Annex VI) gives hazard data for, built by
// scripts/kb/build-safety.mjs --extra. Loaded when the Knowledge Base first opens, so it stays out
// of the program's start-up. Rows are keyed by PubChem CID and carry no CAS numbers (CAS's terms
// require a licence to publish them in bulk); a CAS number typed in is looked up on PubChem.

import data from './safety-extra.json';
import type { SafetyRecord } from './safety';
import { constantsRow, registerRecords, safetyRow } from './safety-tables';
import { CANONICAL_ROWS, type Cell } from './tables';

/** A record as stored (empty fields left out), with the empty fields put back. */
export function fullRecord(r: Partial<SafetyRecord> & { name: string; cid: number }): SafetyRecord {
  return {
    cas: null, formula: null, mw: null, smiles: null, idlh: null, lethal: [], vp: null, bp: null, mp: null, density: null, flash: null,
    ghs: null, alerts: [], skin: false, incompatible: null, niosh: null, xlogp: null, logKow: null, ...r,
  };
}

export const EXTRA_RECORDS: SafetyRecord[] = (data as unknown as { compounds: (Partial<SafetyRecord> & { name: string; cid: number })[] }).compounds.map(fullRecord);
registerRecords(EXTRA_RECORDS);

/** The SMILES were made canonical by RDKit when the table was built: SMILES search needn't redo them. */
const canonical = (row: Record<string, Cell>): Record<string, Cell> => { CANONICAL_ROWS.add(row); return row; };

export const extraSafetyRows = (): Record<string, Cell>[] => EXTRA_RECORDS.map((r) => canonical(safetyRow(r)));
export const extraConstantRows = (): Record<string, Cell>[] => EXTRA_RECORDS.filter((r) => r.mp || r.bp || r.density || r.flash || r.vp).map((r) => canonical(constantsRow(r)));
