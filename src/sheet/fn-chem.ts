// Chemistry functions that need no structure: SIGMA, the Hammett substituent constant of a
// group, for Hammett plots (Fit Line > Hammett). The values are the table the pKa estimates use
// (src/chem/pka.ts), from Hansch, Leo and Taft, Chem. Rev. 1991, 91, 165.

import { SIGMA } from '../chem/pka';
import { FnDef, omitted, textArg } from './args';
import { ERR, isError } from './values';

/** Common ways of writing a group, to the table's names. */
const ALIASES: Record<string, string> = {
  H: 'H', ME: 'Me', CH3: 'Me', ET: 'alkyl', C2H5: 'alkyl', IPR: 'alkyl', TBU: 'alkyl', ALKYL: 'alkyl', R: 'alkyl',
  PH: 'aryl', C6H5: 'aryl', AR: 'aryl', ARYL: 'aryl', VINYL: 'vinyl', CH: 'vinyl', ALKYNYL: 'alkynyl', CCH: 'alkynyl',
  CF3: 'CF3', CCL3: 'CCl3', F: 'F', CL: 'Cl', BR: 'Br', I: 'I',
  OH: 'OH', OME: 'OR', OCH3: 'OR', OET: 'OR', OR: 'OR', OPH: 'OAr', OAR: 'OAr', OAC: 'OCOR', OCOR: 'OCOR', OCOME: 'OCOR', OCOCH3: 'OCOR',
  NH2: 'NH2', NHME: 'NHR', NHR: 'NHR', NME2: 'NR2', NR2: 'NR2', NET2: 'NR2', NHAC: 'NHCOR', NHCOR: 'NHCOR', NHCOME: 'NHCOR',
  NHSO2ME: 'NHSO2R', NHSO2R: 'NHSO2R', NO2: 'NO2', CN: 'CN', CHO: 'CHO',
  COME: 'COR', AC: 'COR', COCH3: 'COR', COR: 'COR', CO2ME: 'CO2R', COOME: 'CO2R', CO2ET: 'CO2R', COOET: 'CO2R', CO2R: 'CO2R',
  CO2H: 'CO2H', COOH: 'CO2H', CONH2: 'CONR2', CONME2: 'CONR2', CONR2: 'CONR2',
  SO2ME: 'SO2R', SO2R: 'SO2R', SO2NH2: 'SO2NR2', SO2NR2: 'SO2NR2', SO3H: 'SO3H', SOME: 'SOR', SOR: 'SOR', SME: 'SR', SR: 'SR', SH: 'SH',
  BPIN: 'B', 'B(OH)2': 'B', B: 'B', SIME3: 'Si', TMS: 'Si', SI: 'Si', 'PO(OET)2': 'P', P: 'P',
};

/** σ of a group: position "para" (or "p", the default), "meta" ("m") or "para-" ("p-", σp⁻). Null when unknown. */
export function hammettSigma(group: string, position = 'para'): number | null {
  const key = ALIASES[group.trim().replace(/[\s−–]/g, '').toUpperCase()] ?? ALIASES[group.trim()];
  if (!key) return null;
  if (key === 'H') return 0;
  const row = SIGMA[key];
  if (!row) return null;
  const p = position.trim().toLowerCase().replace(/[−–]/g, '-');
  const i = p === 'm' || p === 'meta' ? 0 : p === 'p-' || p === 'para-' || p === 'p minus' || p === 'para minus' ? 2 : p === 'p' || p === 'para' ? 1 : -1;
  return i < 0 ? null : row[i as 0 | 1 | 2];
}

export const CHEM_FUNCTIONS: Record<string, FnDef> = {
  // SIGMA(group, [position]): the Hammett σ of a substituent ("NO2", "OMe", "Cl"…)
  SIGMA: {
    min: 1, max: 2,
    fn: (args) => {
      const g = textArg(args, 0);
      if (isError(g)) return g;
      const pos = omitted(args, 1) ? 'para' : textArg(args, 1);
      if (isError(pos)) return pos;
      const v = hammettSigma(g, pos);
      return v ?? ERR.na(`No Hammett σ for ${g} (${pos}): try a group such as NO2, CN, Cl, OMe, NMe2 or CO2Me, and "para", "meta" or "para-"`);
    },
  },
};
