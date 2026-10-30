// The chemistry a sheet can work out from a structure: formula, masses, HRMS m/z, cLogP, TPSA,
// hydrogen-bond donors and acceptors, rotatable bonds, SMILES and InChIKey, and whether the same
// compound is in another row. Each is a sheet function (MW(B2)) and can fill a whole column by itself.
//
// Definitions (as RDKit works them out):
// - cLogP: Wildman and Crippen, J. Chem. Inf. Comput. Sci. 1999, 39, 868–873.
// - TPSA: Ertl, Rohde and Selzer, J. Med. Chem. 2000, 43, 3714–3717 (N and O only, as published).
// - H-bond donors and acceptors: as in Lipinski's rule of five (Adv. Drug Deliv. Rev. 1997, 23,
//   3–25): donors are the OH and NH hydrogens, acceptors the N and O atoms.
// - Rotatable bonds: RDKit's standard (strict) definition: single bonds outside rings between
//   two non-terminal heavy atoms, leaving out amide C–N bonds and the like.
// - Estimates (see src/chem/analysis.ts and src/chem/pka.ts): logS by Delaney's ESOL equation,
//   boiling and melting points by Joback and Reid's groups, pKa and pKaH by Perrin, Dempsey and
//   Serjeant's Hammett and Taft rules.

import { CellError, ERR, Value } from './values';
import { ionMz, parseAdduct } from '../chem/hrms';

/** Everything worked out for one molecule. */
export interface MolProps {
  /** Hill formula with charge, e.g. C9H8O4. */
  formula: string;
  /** Average molecular weight, g/mol. */
  mw: number;
  /** Monoisotopic mass, u. */
  exact: number;
  charge: number;
  smiles: string;
  inchikey: string;
  clogp: number;
  tpsa: number;
  hbd: number;
  hba: number;
  rotb: number;
  /** Estimated: water solubility (log mol/L), boiling and melting points (K), most acidic pKa and most basic pKaH. */
  logS?: number;
  bp?: number | null;
  mp?: number | null;
  pka?: number | null;
  pkaH?: number | null;
}

export interface PropertyDef {
  /** Shown in the column header and lists. */
  label: string;
  /** What it is, for the Insert Property Column list. */
  help: string;
  /** Number format for a column of it. */
  format: string;
  /** Extra arguments after the structure (HRMS takes the adduct). */
  extra: number;
  /** Shown as a chemical formula (numbers lowered). */
  chem?: boolean;
}

export const PROPERTIES: Record<string, PropertyDef> = {
  FORMULA: { label: 'Formula', help: 'Molecular formula (Hill order)', format: 'General', extra: 0, chem: true },
  MW: { label: 'MW', help: 'Molecular weight, g/mol (average masses)', format: '0.00', extra: 0 },
  EXACTMASS: { label: 'Exact mass', help: 'Monoisotopic mass', format: '0.0000', extra: 0 },
  HRMS: { label: 'HRMS m/z', help: 'm/z of an ion, [M+H]+ unless you give another: HRMS(B2,"[M+Na]+")', format: '0.0000', extra: 1 },
  CLOGP: { label: 'cLogP', help: 'Calculated logP (Wildman–Crippen)', format: '0.00', extra: 0 },
  TPSA: { label: 'TPSA', help: 'Topological polar surface area, Å² (Ertl)', format: '0.0', extra: 0 },
  HBD: { label: 'H-bond donors', help: 'OH and NH hydrogens (Lipinski)', format: '0', extra: 0 },
  HBA: { label: 'H-bond acceptors', help: 'N and O atoms (Lipinski)', format: '0', extra: 0 },
  ROTB: { label: 'Rotatable bonds', help: 'Rotatable bonds (RDKit)', format: '0', extra: 0 },
  LOGS: { label: 'logS', help: 'Estimated water solubility, log mol/L (Delaney ESOL)', format: '0.00', extra: 0 },
  PKA: { label: 'pKa', help: 'Estimated pKa of the most acidic proton (Perrin–Dempsey–Serjeant rules)', format: '0.0', extra: 0 },
  PKAH: { label: 'pKaH', help: 'Estimated pKa of the conjugate acid of the most basic atom', format: '0.0', extra: 0 },
  BP: { label: 'bp (est.)', help: 'Estimated boiling point, °C (Joback–Reid)', format: '0', extra: 0 },
  MP: { label: 'mp (est.)', help: 'Estimated melting point, °C (Joback–Reid)', format: '0', extra: 0 },
  SMILES: { label: 'SMILES', help: 'Canonical SMILES (RDKit)', format: 'General', extra: 0 },
  INCHIKEY: { label: 'InChIKey', help: 'Standard InChIKey', format: 'General', extra: 0 },
  DUPLICATE: { label: 'Duplicate of', help: 'Another row with the same compound (same InChIKey), or blank: DUPLICATE(B2,B:B)', format: 'General', extra: 1 },
};

/** One property of a molecule (extra arguments as given in the formula). */
export function propertyValue(name: string, m: MolProps, extra: Value[] = []): Value | CellError {
  switch (name) {
    case 'FORMULA': return m.formula;
    case 'MW': return m.mw;
    case 'EXACTMASS': return m.exact;
    case 'HRMS': {
      const a = extra[0];
      const text = a === undefined || a === null || a === '' ? '[M+H]+' : String(a);
      // a charged molecule is its own ion, whatever adduct is asked for (as ISOMZ and the Analysis panel)
      if (m.charge) return m.exact / Math.abs(m.charge);
      try {
        return ionMz(m.exact, parseAdduct(text));
      } catch (e) {
        return ERR.value((e as Error).message);
      }
    }
    case 'CLOGP': return m.clogp;
    case 'TPSA': return m.tpsa;
    case 'HBD': return m.hbd;
    case 'HBA': return m.hba;
    case 'ROTB': return m.rotb;
    case 'LOGS': return m.logS ?? ERR.na('No estimate');
    case 'PKA': return m.pka ?? ERR.na('No acidic group the rules cover');
    case 'PKAH': return m.pkaH ?? ERR.na('No basic group the rules cover');
    case 'BP': return m.bp == null ? ERR.na('No Joback estimate for this structure') : m.bp - 273.15;
    case 'MP': return m.mp == null ? ERR.na('No Joback estimate for this structure') : m.mp - 273.15;
    case 'SMILES': return m.smiles;
    case 'INCHIKEY': return m.inchikey || ERR.na('No InChIKey for this structure');
  }
  return ERR.name();
}
