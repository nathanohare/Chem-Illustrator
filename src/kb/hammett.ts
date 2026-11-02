// Hammett substituent constants (σm, σp) and the field and resonance parameters F and R (modified
// Swain–Lupton) of common substituents, from Table I of Hansch, Leo and Taft, Chem. Rev. 1991, 91,
// 165 (its row numbers kept so each value can be checked). A selection of the groups organic
// chemists use most, not the whole table: the paper's Table I has about 530 groups, and anyone with
// a copy can import the rest with Import Table. Each group's SMILES ([*] where it joins the ring)
// is written here, for matching groups on a drawn ring.

import type { KbTable } from './tables';

export interface Hammett {
  /** The group as chemists write it. */
  group: string;
  name: string;
  /** The group with [*] at the atom that joins the ring. */
  smiles: string;
  sm: number;
  sp: number;
  F: number;
  R: number;
  /** Row in Hansch, Leo and Taft's Table I. */
  row: number;
  /** A value the paper puts in brackets (less certain). */
  approx?: boolean;
}

const h = (group: string, name: string, smiles: string, sm: number, sp: number, F: number, R: number, row: number, approx = false): Hammett =>
  ({ group, name, smiles, sm, sp, F, R, row, ...(approx ? { approx } : {}) });

export const HAMMETT: Hammett[] = [
  h('H', 'hydrogen', '[*][H]', 0, 0, 0.03, 0, 43),
  // alkyl, aryl and unsaturated
  h('CH3', 'methyl', '[*]C', -0.07, -0.17, 0.01, -0.18, 133),
  h('C2H5', 'ethyl', '[*]CC', -0.07, -0.15, 0, -0.15, 219),
  h('n-C3H7', 'propyl', '[*]CCC', -0.06, -0.13, 0.01, -0.14, 289),
  h('i-C3H7', 'isopropyl', '[*]C(C)C', -0.04, -0.15, 0.04, -0.19, 288),
  h('n-C4H9', 'butyl', '[*]CCCC', -0.08, -0.16, -0.01, -0.15, 352),
  h('t-C4H9', 'tert-butyl', '[*]C(C)(C)C', -0.1, -0.2, -0.02, -0.18, 349),
  h('c-C3H5', 'cyclopropyl', '[*]C1CC1', -0.07, -0.21, 0.02, -0.23, 270),
  h('c-C6H11', 'cyclohexyl', '[*]C1CCCCC1', -0.05, -0.15, 0.03, -0.18, 433),
  h('1-Ad', '1-adamantyl', '[*]C12CC3CC(CC(C3)C1)C2', -0.12, -0.13, -0.07, -0.06, 497),
  h('CH2C6H5', 'benzyl', '[*]Cc1ccccc1', -0.08, -0.09, -0.04, -0.05, 456),
  h('CH=CH2', 'vinyl', '[*]C=C', 0.06, -0.04, 0.13, -0.17, 193),
  h('CH=CHC6H5', 'styryl (E)', '[*]/C=C/c1ccccc1', 0.03, -0.07, 0.1, -0.17, 468),
  h('C≡CH', 'ethynyl', '[*]C#C', 0.21, 0.23, 0.22, 0.01, 175),
  h('C≡CC6H5', 'phenylethynyl', '[*]C#Cc1ccccc1', 0.14, 0.16, 0.15, 0.01, 466),
  h('C6H5', 'phenyl', '[*]c1ccccc1', 0.06, -0.01, 0.12, -0.13, 417),
  h('C6H4-4-OMe', '4-methoxyphenyl', '[*]c1ccc(OC)cc1', 0.05, -0.08, 0.13, -0.21, 458),
  h('C6H4-4-NO2', '4-nitrophenyl', '[*]c1ccc([N+](=O)[O-])cc1', 0.25, 0.26, 0.26, 0, 413),
  h('2-pyridyl', '2-pyridyl', '[*]c1ccccn1', 0.33, 0.17, 0.4, -0.23, 378),
  h('3-pyridyl', '3-pyridyl', '[*]c1cccnc1', 0.23, 0.25, 0.24, 0.01, 379),
  h('4-pyridyl', '4-pyridyl', '[*]c1ccncc1', 0.27, 0.44, 0.21, 0.23, 380),
  h('2-furyl', '2-furyl', '[*]c1ccco1', 0.06, 0.02, 0.1, -0.08, 335),
  h('2-thienyl', '2-thienyl', '[*]c1cccs1', 0.09, 0.05, 0.13, -0.08, 336),
  h('3-thienyl', '3-thienyl', '[*]c1ccsc1', 0.03, -0.02, 0.08, -0.1, 337),
  h('1-pyrrolyl', 'pyrrol-1-yl', '[*]n1cccc1', 0.47, 0.37, 0.5, -0.13, 340),
  h('Fc', 'ferrocenyl', '[*][C-]1C=CC=C1.[CH-]1C=CC=C1.[Fe+2]', -0.15, -0.18, -0.09, -0.09, 493),
  // halogen-bearing carbon
  h('CF3', 'trifluoromethyl', '[*]C(F)(F)F', 0.43, 0.54, 0.38, 0.16, 70),
  h('CHF2', 'difluoromethyl', '[*]C(F)F', 0.29, 0.32, 0.29, 0.03, 103),
  h('CCl3', 'trichloromethyl', '[*]C(Cl)(Cl)Cl', 0.4, 0.46, 0.38, 0.09, 66),
  h('C2F5', 'pentafluoroethyl', '[*]C(F)(F)C(F)(F)F', 0.47, 0.52, 0.44, 0.08, 165),
  h('CH2F', 'fluoromethyl', '[*]CF', 0.12, 0.11, 0.15, -0.04, 122),
  h('CH2Cl', 'chloromethyl', '[*]CCl', 0.11, 0.12, 0.13, -0.01, 120),
  h('CH2Br', 'bromomethyl', '[*]CBr', 0.12, 0.14, 0.14, 0, 119),
  h('CH2CF3', '2,2,2-trifluoroethyl', '[*]CC(F)(F)F', 0.12, 0.09, 0.15, -0.06, 185),
  // other substituted carbon
  h('CH2OH', 'hydroxymethyl', '[*]CO', 0, 0, 0.03, -0.03, 143),
  h('CH2OMe', 'methoxymethyl', '[*]COC', 0.08, 0.01, 0.13, -0.12, 223),
  h('CH2NH2', 'aminomethyl', '[*]CN', -0.03, -0.11, 0.04, -0.15, 155),
  h('CH2NMe2', 'dimethylaminomethyl', '[*]CN(C)C', 0, 0.01, 0.03, -0.02, 298),
  h('CH2CN', 'cyanomethyl', '[*]CC#N', 0.16, 0.18, 0.17, 0.01, 189),
  h('CH2SiMe3', 'trimethylsilylmethyl', '[*]C[Si](C)(C)C', -0.16, -0.21, -0.09, -0.12, 369),
  h('CN', 'cyano', '[*]C#N', 0.56, 0.66, 0.51, 0.15, 84),
  h('CHO', 'formyl', '[*]C=O', 0.35, 0.42, 0.33, 0.09, 117),
  h('COCH3', 'acetyl', '[*]C(C)=O', 0.38, 0.5, 0.33, 0.17, 200),
  h('COC2H5', 'propanoyl', '[*]C(=O)CC', 0.38, 0.48, 0.34, 0.14, 276),
  h('COC6H5', 'benzoyl', '[*]C(=O)c1ccccc1', 0.34, 0.43, 0.31, 0.12, 448),
  h('COCF3', 'trifluoroacetyl', '[*]C(=O)C(F)(F)F', 0.63, 0.8, 0.54, 0.26, 160),
  h('COOH', 'carboxy', '[*]C(=O)O', 0.37, 0.45, 0.34, 0.11, 118),
  h('COO⁻', 'carboxylate', '[*]C(=O)[O-]', -0.1, 0, -0.1, 0.1, 99),
  h('COOCH3', 'methoxycarbonyl', '[*]C(=O)OC', 0.37, 0.45, 0.34, 0.11, 203),
  h('COOC2H5', 'ethoxycarbonyl', '[*]C(=O)OCC', 0.37, 0.45, 0.34, 0.11, 277),
  h('COOC6H5', 'phenoxycarbonyl', '[*]C(=O)Oc1ccccc1', 0.37, 0.44, 0.34, 0.1, 450),
  h('CONH2', 'carbamoyl', '[*]C(N)=O', 0.28, 0.36, 0.26, 0.1, 127),
  h('CONHCH3', 'methylcarbamoyl', '[*]C(=O)NC', 0.35, 0.36, 0.35, -0.01, 212),
  h('CONHC6H5', 'phenylcarbamoyl', '[*]C(=O)Nc1ccccc1', 0.23, 0.41, 0.17, 0.24, 454),
  h('COCl', 'chlorocarbonyl', '[*]C(Cl)=O', 0.51, 0.61, 0.46, 0.15, 64),
  h('CH=NOH', 'hydroxyiminomethyl', '[*]/C=N/O', 0.22, 0.1, 0.28, -0.18, 129),
  // halogens
  h('F', 'fluoro', '[*]F', 0.34, 0.06, 0.45, -0.39, 15),
  h('Cl', 'chloro', '[*]Cl', 0.37, 0.23, 0.42, -0.19, 5),
  h('Br', 'bromo', '[*]Br', 0.39, 0.23, 0.45, -0.22, 2),
  h('I', 'iodo', '[*]I', 0.35, 0.18, 0.42, -0.24, 28),
  // oxygen
  h('OH', 'hydroxy', '[*]O', 0.12, -0.37, 0.33, -0.7, 45),
  h('O⁻', 'oxido', '[*][O-]', -0.47, -0.81, -0.26, -0.55, 38, true),
  h('OCH3', 'methoxy', '[*]OC', 0.12, -0.27, 0.29, -0.56, 142),
  h('OC2H5', 'ethoxy', '[*]OCC', 0.1, -0.24, 0.26, -0.5, 221),
  h('O-n-C3H7', 'propoxy', '[*]OCCC', 0.1, -0.25, 0.26, -0.51, 294),
  h('O-i-C3H7', 'isopropoxy', '[*]OC(C)C', 0.1, -0.45, 0.34, -0.79, 293, true),
  h('O-n-C4H9', 'butoxy', '[*]OCCCC', 0.1, -0.32, 0.29, -0.61, 353),
  h('OCH2CH=CH2', 'allyloxy', '[*]OCC=C', 0.09, -0.25, 0.25, -0.5, 275),
  h('OC6H5', 'phenoxy', '[*]Oc1ccccc1', 0.25, -0.03, 0.37, -0.4, 420),
  h('OCF3', 'trifluoromethoxy', '[*]OC(F)(F)F', 0.38, 0.35, 0.39, -0.04, 75),
  h('OCHF2', 'difluoromethoxy', '[*]OC(F)F', 0.31, 0.18, 0.37, -0.19, 104),
  h('OCOCH3', 'acetoxy', '[*]OC(C)=O', 0.39, 0.31, 0.42, -0.11, 202),
  h('OCOC6H5', 'benzoyloxy', '[*]OC(=O)c1ccccc1', 0.21, 0.13, 0.26, -0.13, 449),
  h('OSO2CH3', 'mesyloxy', '[*]OS(C)(=O)=O', 0.39, 0.36, 0.4, -0.04, 150),
  h('OSO2CF3', 'triflyloxy', '[*]OS(=O)(=O)C(F)(F)F', 0.56, 0.53, 0.56, -0.03, 80),
  h('OSi(CH3)3', 'trimethylsilyloxy', '[*]O[Si](C)(C)C', 0.13, -0.27, 0.31, -0.58, 303),
  h('OCH2O', 'methylenedioxy (3,4-)', '[*]OCO[*]', -0.16, -0.16, -0.11, -0.05, 132),
  // nitrogen
  h('NH2', 'amino', '[*]N', -0.16, -0.66, 0.08, -0.74, 51),
  h('NHCH3', 'methylamino', '[*]NC', -0.21, -0.7, 0.03, -0.73, 154),
  h('N(CH3)2', 'dimethylamino', '[*]N(C)C', -0.16, -0.83, 0.15, -0.98, 231),
  h('N(C2H5)2', 'diethylamino', '[*]N(CC)CC', -0.23, -0.72, 0.01, -0.73, 360),
  h('NHC6H5', 'anilino', '[*]Nc1ccccc1', -0.02, -0.56, 0.22, -0.78, 427),
  h('N(C6H5)2', 'diphenylamino', '[*]N(c1ccccc1)c1ccccc1', 0, -0.22, 0.12, -0.34, 504),
  h('NHCOCH3', 'acetamido', '[*]NC(C)=O', 0.21, 0, 0.31, -0.31, 211),
  h('NHCOOCH3', 'methoxycarbonylamino', '[*]NC(=O)OC', -0.02, -0.17, 0.07, -0.24, 210),
  h('NHCOC6H5', 'benzamido', '[*]NC(=O)c1ccccc1', 0.02, -0.19, 0.13, -0.32, 453),
  h('NHCOCF3', 'trifluoroacetamido', '[*]NC(=O)C(F)(F)F', 0.3, 0.12, 0.38, -0.26, 177),
  h('NHSO2CH3', 'methanesulfonamido', '[*]NS(C)(=O)=O', 0.2, 0.03, 0.28, -0.25, 156),
  h('NHNH2', 'hydrazinyl', '[*]NN', -0.02, -0.55, 0.22, -0.77, 59),
  h('NHOH', 'hydroxyamino', '[*]NO', -0.04, -0.34, 0.11, -0.45, 52),
  h('NH3⁺', 'ammonio', '[*][NH3+]', 0.86, 0.6, 0.92, -0.32, 58),
  h('N(CH3)3⁺', 'trimethylammonio', '[*][N+](C)(C)C', 0.88, 0.82, 0.86, -0.04, 300),
  h('NO2', 'nitro', '[*][N+](=O)[O-]', 0.71, 0.78, 0.65, 0.13, 32),
  h('NO', 'nitroso', '[*]N=O', 0.62, 0.91, 0.49, 0.42, 31),
  h('N3', 'azido', '[*]N=[N+]=[N-]', 0.37, 0.08, 0.48, -0.4, 37),
  h('N=C=O', 'isocyanato', '[*]N=C=O', 0.27, 0.19, 0.31, -0.12, 89),
  h('N=C=S', 'isothiocyanato', '[*]N=C=S', 0.48, 0.38, 0.51, -0.13, 92),
  h('NC', 'isocyano', '[*][N+]#[C-]', 0.48, 0.49, 0.47, 0.02, 85),
  h('N=NC6H5', 'phenylazo', '[*]/N=N/c1ccccc1', 0.32, 0.39, 0.3, 0.09, 419),
  h('N₂⁺', 'diazonio', '[*][N+]#N', 1.76, 1.91, 1.58, 0.33, 34),
  // sulfur
  h('SH', 'sulfanyl', '[*]S', 0.25, 0.15, 0.3, -0.15, 49),
  h('SCH3', 'methylthio', '[*]SC', 0.15, 0, 0.23, -0.23, 151),
  h('SC2H5', 'ethylthio', '[*]SCC', 0.18, 0.03, 0.26, -0.23, 225),
  h('SC6H5', 'phenylthio', '[*]Sc1ccccc1', 0.23, 0.07, 0.3, -0.23, 426),
  h('SCF3', 'trifluoromethylthio', '[*]SC(F)(F)F', 0.4, 0.5, 0.36, 0.14, 81),
  h('SCN', 'thiocyanato', '[*]SC#N', 0.51, 0.52, 0.49, 0.03, 93),
  h('SOCH3', 'methylsulfinyl', '[*][S](C)=O', 0.52, 0.49, 0.52, -0.03, 144),
  h('SOC6H5', 'phenylsulfinyl', '[*]S(=O)c1ccccc1', 0.5, 0.44, 0.51, -0.07, 421),
  h('SO2CH3', 'methylsulfonyl', '[*]S(C)(=O)=O', 0.6, 0.72, 0.53, 0.19, 148),
  h('SO2C2H5', 'ethylsulfonyl', '[*]S(=O)(=O)CC', 0.66, 0.77, 0.59, 0.18, 224),
  h('SO2C6H5', 'phenylsulfonyl', '[*]S(=O)(=O)c1ccccc1', 0.62, 0.68, 0.58, 0.1, 424),
  h('SO2CF3', 'triflyl', '[*]S(=O)(=O)C(F)(F)F', 0.83, 0.96, 0.74, 0.22, 78),
  h('SO2NH2', 'sulfamoyl', '[*]S(N)(=O)=O', 0.53, 0.6, 0.49, 0.11, 53),
  h('SO2N(CH3)2', 'dimethylsulfamoyl', '[*]S(=O)(=O)N(C)C', 0.51, 0.65, 0.44, 0.21, 233),
  h('SO2Cl', 'chlorosulfonyl', '[*]S(Cl)(=O)=O', 1.2, 1.11, 1.16, -0.05, 7, true),
  h('SO3⁻', 'sulfonato', '[*]S(=O)(=O)[O-]', 0.3, 0.35, 0.29, 0.06, 40),
  h('S(CH3)2⁺', 'dimethylsulfonio', '[*][S+](C)C', 1, 0.9, 0.98, -0.08, 241),
  // silicon, tin, boron, phosphorus
  h('Si(CH3)3', 'trimethylsilyl', '[*][Si](C)(C)C', -0.04, -0.07, 0.01, -0.08, 307),
  h('Sn(CH3)3', 'trimethylstannyl', '[*][Sn](C)(C)C', 0, 0, 0.03, -0.03, 308),
  h('B(OH)2', 'dihydroxyboryl', '[*]B(O)O', -0.01, 0.12, -0.03, 0.15, 50),
  h('P(C6H5)2', 'diphenylphosphino', '[*]P(c1ccccc1)c1ccccc1', 0.11, 0.19, 0.1, 0.09, 506),
  h('PO(C6H5)2', 'diphenylphosphoryl', '[*]P(=O)(c1ccccc1)c1ccccc1', 0.38, 0.53, 0.32, 0.21, 505),
  h('PO(OC2H5)2', 'diethoxyphosphoryl', '[*]P(=O)(OCC)OCC', 0.55, 0.6, 0.52, 0.08, 363),
  h('P(CH3)3⁺', 'trimethylphosphonio', '[*][P+](C)(C)C', 0.74, 0.73, 0.71, 0.02, 306),
];

export const HANSCH_1991 = { label: 'Hansch, C.; Leo, A.; Taft, R. W. Chem. Rev. 1991, 91, 165–195, Table I', url: 'https://doi.org/10.1021/cr00002a004' };

/** The group on benzene (PhX), so a SMILES search for nitrobenzene finds NO2. */
export function onBenzene(x: Hammett): string | null {
  if (x.smiles.includes('.')) return null;
  if (x.group === 'H') return 'c1ccccc1';
  const two = x.smiles.split('[*]').length - 1;
  if (two === 2) return 'c1ccc2c(c1)' + x.smiles.replace(/^\[\*\]/, '').replace(/\[\*\]$/, '2');
  return x.smiles.replace('[*]', 'c1ccccc1');
}

// a plain minus sign, so the values sort and paste into Excel as numbers
const fmt = (n: number) => (n === 0 ? '0.00' : n.toFixed(2));

export const HAMMETT_TABLE: KbTable = {
  id: 'hammett',
  title: 'Hammett Constants',
  about: 'Hammett σm and σp, and the field (F) and resonance (R) parameters (Swain–Lupton, as modified by Hansch, Leo and Taft; σp ≈ F + R), of common substituents on a benzene ring. Search by group (NO2, OMe) or name. Values in brackets are ones the paper marks as less certain. A selection: the paper lists about 530 groups, and Import Table adds the rest from your copy.',
  columns: [
    { key: 'group', label: 'Group' },
    { key: 'name', label: 'Name' },
    { key: 'sm', label: 'σm', numeric: true },
    { key: 'sp', label: 'σp', numeric: true },
    { key: 'F', label: 'F', numeric: true },
    { key: 'R', label: 'R', numeric: true },
    { key: 'row', label: 'Table I no.', numeric: true, narrow: true },
  ],
  rows: HAMMETT.map((x) => {
    const v = (n: number) => (x.approx ? `(${fmt(n)})` : fmt(n));
    return { group: x.group, name: x.name, sm: v(x.sm), sp: v(x.sp), F: v(x.F), R: v(x.R), row: x.row, smiles: onBenzene(x) };
  }),
  sources: [HANSCH_1991, { label: 'Selection, names and SMILES by Chem Illustrator' }],
};
