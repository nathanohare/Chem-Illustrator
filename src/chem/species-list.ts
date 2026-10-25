// The names a text box can hold and still be chemistry: counterions and other common ions,
// reagents and solvents written as abbreviations (DMAP, mCPBA, THF), and ligands written on
// their own (PPh3, dppe, COD). Each is the whole species as SMILES, charges included; the
// charge it carries is the one a text box without a written charge is read with.
// Group abbreviations (Me, Boc, OTBS) are not here: on their own they are only part of a molecule.

import { NICKNAMES, L_LIGAND_NAMES } from './labels';

export type SpeciesKind = 'anion' | 'cation' | 'reagent' | 'ligand';

export interface SpeciesEntry {
  /** The ways it is written, first the usual one. */
  names: string[];
  smiles: string;
  /** Its full name. */
  name: string;
  kind: SpeciesKind;
  /**
   * Read only with its charge written: without it the text is something else (Cl, CN and OH are
   * labels, NO2 is nitrogen dioxide or a nitro group, Tr is the trityl group).
   */
  needsSign?: boolean;
}

const ARF = 'c1cc(C(F)(F)F)cc(C(F)(F)F)c1';
const C6F5 = 'c1c(F)c(F)c(F)c(F)c1F';
const PH = 'c1ccccc1';

/** Counterions and other common ions. */
const IONS: SpeciesEntry[] = [
  // weakly coordinating anions
  { names: ['BF4'], smiles: 'F[B-](F)(F)F', name: 'tetrafluoroborate', kind: 'anion' },
  { names: ['PF6'], smiles: 'F[P-](F)(F)(F)(F)F', name: 'hexafluorophosphate', kind: 'anion' },
  { names: ['SbF6'], smiles: 'F[Sb-](F)(F)(F)(F)F', name: 'hexafluoroantimonate', kind: 'anion' },
  { names: ['AsF6'], smiles: 'F[As-](F)(F)(F)(F)F', name: 'hexafluoroarsenate', kind: 'anion' },
  { names: ['ClO4'], smiles: '[O-][Cl+3]([O-])([O-])[O-]', name: 'perchlorate', kind: 'anion' },
  { names: ['OTf', 'TfO', 'CF3SO3', 'OSO2CF3'], smiles: '[O-]S(=O)(=O)C(F)(F)F', name: 'triflate (trifluoromethanesulfonate)', kind: 'anion' },
  { names: ['NTf2', 'Tf2N', 'TFSI', 'N(Tf)2'], smiles: '[N-](S(=O)(=O)C(F)(F)F)S(=O)(=O)C(F)(F)F', name: 'triflimide (bis(trifluoromethanesulfonyl)imide)', kind: 'anion' },
  { names: ['ONf', 'NfO'], smiles: '[O-]S(=O)(=O)C(F)(F)C(F)(F)C(F)(F)C(F)(F)F', name: 'nonaflate (nonafluorobutanesulfonate)', kind: 'anion' },
  { names: ['BArF', 'BArF4', 'BArF24', 'BAr4F', 'BAr\'4', 'B(ArF)4'], smiles: `[B-](${ARF})(${ARF})(${ARF})${ARF}`, name: 'BArF (tetrakis[3,5-bis(trifluoromethyl)phenyl]borate)', kind: 'anion' },
  { names: ['B(C6F5)4', 'BArF20', 'TPFPB'], smiles: `[B-](${C6F5})(${C6F5})(${C6F5})${C6F5}`, name: 'tetrakis(pentafluorophenyl)borate', kind: 'anion' },
  { names: ['BPh4', 'B(Ph)4'], smiles: `[B-](${PH})(${PH})(${PH})${PH}`, name: 'tetraphenylborate', kind: 'anion' },
  { names: ['OTs', 'TsO'], smiles: '[O-]S(=O)(=O)c1ccc(C)cc1', name: 'tosylate (4-methylbenzenesulfonate)', kind: 'anion' },
  { names: ['OMs', 'MsO'], smiles: '[O-]S(=O)(=O)C', name: 'mesylate (methanesulfonate)', kind: 'anion' },
  { names: ['OAc', 'AcO', 'CH3CO2', 'MeCO2'], smiles: '[O-]C(C)=O', name: 'acetate', kind: 'anion' },
  { names: ['CF3CO2', 'TFA', 'OCOCF3'], smiles: '[O-]C(=O)C(F)(F)F', name: 'trifluoroacetate', kind: 'anion', needsSign: true },
  { names: ['OPiv', 'PivO'], smiles: '[O-]C(=O)C(C)(C)C', name: 'pivalate', kind: 'anion', needsSign: true },
  { names: ['OBz', 'BzO', 'PhCO2'], smiles: '[O-]C(=O)c1ccccc1', name: 'benzoate', kind: 'anion', needsSign: true },
  { names: ['NO3'], smiles: '[O-][N+](=O)[O-]', name: 'nitrate', kind: 'anion' },
  { names: ['NO2'], smiles: '[O-]N=O', name: 'nitrite', kind: 'anion', needsSign: true },
  { names: ['HSO4'], smiles: 'OS(=O)(=O)[O-]', name: 'hydrogen sulfate', kind: 'anion' },
  { names: ['SO4'], smiles: '[O-]S(=O)(=O)[O-]', name: 'sulfate', kind: 'anion' },
  { names: ['SO3'], smiles: '[O-]S([O-])=O', name: 'sulfite', kind: 'anion', needsSign: true },
  { names: ['S2O3'], smiles: '[O-]S([O-])(=O)=S', name: 'thiosulfate', kind: 'anion' },
  { names: ['HCO3'], smiles: 'OC([O-])=O', name: 'hydrogen carbonate (bicarbonate)', kind: 'anion' },
  { names: ['CO3'], smiles: '[O-]C([O-])=O', name: 'carbonate', kind: 'anion' },
  { names: ['PO4'], smiles: '[O-]P([O-])([O-])=O', name: 'phosphate', kind: 'anion' },
  { names: ['HPO4'], smiles: 'OP([O-])([O-])=O', name: 'hydrogen phosphate', kind: 'anion' },
  { names: ['H2PO4'], smiles: 'OP(O)([O-])=O', name: 'dihydrogen phosphate', kind: 'anion' },
  { names: ['IO4'], smiles: '[O-]I(=O)(=O)=O', name: 'periodate', kind: 'anion' },
  { names: ['MnO4'], smiles: '[O-][Mn](=O)(=O)=O', name: 'permanganate', kind: 'anion' },
  { names: ['BH4'], smiles: '[BH4-]', name: 'borohydride (tetrahydroborate)', kind: 'anion' },
  { names: ['BH3CN', 'NCBH3'], smiles: '[BH3-]C#N', name: 'cyanoborohydride', kind: 'anion' },
  { names: ['AlH4'], smiles: '[AlH4-]', name: 'tetrahydroaluminate', kind: 'anion' },
  { names: ['AlCl4'], smiles: 'Cl[Al-](Cl)(Cl)Cl', name: 'tetrachloroaluminate', kind: 'anion' },
  { names: ['FeCl4'], smiles: 'Cl[Fe-](Cl)(Cl)Cl', name: 'tetrachloroferrate', kind: 'anion' },
  { names: ['AuCl4'], smiles: 'Cl[Au-](Cl)(Cl)Cl', name: 'tetrachloroaurate', kind: 'anion' },
  { names: ['I3'], smiles: 'I[I-]I', name: 'triiodide', kind: 'anion' },
  { names: ['SCN', 'NCS'], smiles: '[S-]C#N', name: 'thiocyanate', kind: 'anion', needsSign: true },
  { names: ['CN', 'NC'], smiles: '[C-]#N', name: 'cyanide', kind: 'anion', needsSign: true },
  { names: ['N3'], smiles: '[N-]=[N+]=[N-]', name: 'azide', kind: 'anion', needsSign: true },
  { names: ['OH', 'HO'], smiles: '[OH-]', name: 'hydroxide', kind: 'anion', needsSign: true },
  { names: ['OMe', 'MeO'], smiles: 'C[O-]', name: 'methoxide', kind: 'anion', needsSign: true },
  { names: ['OEt', 'EtO'], smiles: 'CC[O-]', name: 'ethoxide', kind: 'anion', needsSign: true },
  { names: ['OtBu', 'tBuO', 'Ot-Bu', 't-BuO'], smiles: 'CC(C)(C)[O-]', name: 'tert-butoxide', kind: 'anion', needsSign: true },
  { names: ['HMDS', 'N(TMS)2', 'N(SiMe3)2'], smiles: 'C[Si](C)(C)[N-][Si](C)(C)C', name: 'hexamethyldisilazide', kind: 'anion', needsSign: true },
  { names: ['acac'], smiles: 'CC(=O)C=C(C)[O-]', name: 'acetylacetonate', kind: 'anion', needsSign: true },
  // cations
  { names: ['NH4', 'H4N'], smiles: '[NH4+]', name: 'ammonium', kind: 'cation' },
  { names: ['H3O', 'OH3'], smiles: '[OH3+]', name: 'hydronium', kind: 'cation' },
  { names: ['NMe4', 'Me4N'], smiles: 'C[N+](C)(C)C', name: 'tetramethylammonium', kind: 'cation' },
  { names: ['NEt4', 'Et4N'], smiles: 'CC[N+](CC)(CC)CC', name: 'tetraethylammonium', kind: 'cation' },
  { names: ['NBu4', 'Bu4N', 'nBu4N', 'n-Bu4N', 'N(nBu)4', 'TBA'], smiles: 'CCCC[N+](CCCC)(CCCC)CCCC', name: 'tetrabutylammonium', kind: 'cation' },
  { names: ['HNEt3', 'Et3NH', 'NHEt3'], smiles: 'CC[NH+](CC)CC', name: 'triethylammonium', kind: 'cation' },
  { names: ['PPh4', 'Ph4P'], smiles: `[P+](${PH})(${PH})(${PH})${PH}`, name: 'tetraphenylphosphonium', kind: 'cation' },
  { names: ['PPN', '(Ph3P)2N', 'N(PPh3)2'], smiles: `${PH}P(${PH})(${PH})=[N+]=P(${PH})(${PH})${PH}`, name: 'bis(triphenylphosphine)iminium', kind: 'cation' },
  { names: ['pyH', 'PyH', 'HPy'], smiles: 'c1cc[nH+]cc1', name: 'pyridinium', kind: 'cation' },
  { names: ['BMIM', 'bmim', '[bmim]', 'C4mim'], smiles: 'CCCCn1cc[n+](C)c1', name: '1-butyl-3-methylimidazolium', kind: 'cation' },
  { names: ['EMIM', 'emim', '[emim]', 'C2mim'], smiles: 'CCn1cc[n+](C)c1', name: '1-ethyl-3-methylimidazolium', kind: 'cation' },
  { names: ['Ph3C', 'Tr', 'Trt', 'CPh3'], smiles: `[C+](${PH})(${PH})${PH}`, name: 'trityl cation', kind: 'cation', needsSign: true },
  { names: ['C7H7'], smiles: '[CH+]1C=CC=CC=C1', name: 'tropylium', kind: 'cation', needsSign: true },
  { names: ['Fc', 'Cp2Fe', 'FeCp2'], smiles: '[Fe+3].[CH-]1C=CC=C1.[CH-]1C=CC=C1', name: 'ferrocenium', kind: 'cation', needsSign: true },
];

/** Reagents and solvents chemists write as abbreviations or short formulas. */
const REAGENTS: SpeciesEntry[] = [
  // solvents
  { names: ['THF'], smiles: 'C1CCOC1', name: 'tetrahydrofuran', kind: 'reagent' },
  { names: ['2-MeTHF', 'MeTHF'], smiles: 'CC1CCCO1', name: '2-methyltetrahydrofuran', kind: 'reagent' },
  { names: ['DMF'], smiles: 'CN(C)C=O', name: 'N,N-dimethylformamide', kind: 'reagent' },
  { names: ['DMA', 'DMAc'], smiles: 'CN(C)C(C)=O', name: 'N,N-dimethylacetamide', kind: 'reagent' },
  { names: ['DMSO'], smiles: 'CS(C)=O', name: 'dimethyl sulfoxide', kind: 'reagent' },
  { names: ['DMSO-d6', 'd6-DMSO'], smiles: '[2H]C([2H])([2H])S(=O)C([2H])([2H])[2H]', name: 'dimethyl sulfoxide-d6', kind: 'reagent' },
  { names: ['DCM', 'CH2Cl2'], smiles: 'ClCCl', name: 'dichloromethane', kind: 'reagent' },
  { names: ['DCE'], smiles: 'ClCCCl', name: '1,2-dichloroethane', kind: 'reagent' },
  { names: ['MeCN', 'CH3CN', 'ACN'], smiles: 'CC#N', name: 'acetonitrile', kind: 'reagent' },
  { names: ['MeOH', 'CH3OH'], smiles: 'CO', name: 'methanol', kind: 'reagent' },
  { names: ['EtOH'], smiles: 'CCO', name: 'ethanol', kind: 'reagent' },
  { names: ['iPrOH', 'i-PrOH', 'IPA'], smiles: 'CC(C)O', name: 'propan-2-ol (isopropanol)', kind: 'reagent' },
  { names: ['tBuOH', 't-BuOH'], smiles: 'CC(C)(C)O', name: 'tert-butanol', kind: 'reagent' },
  { names: ['Et2O'], smiles: 'CCOCC', name: 'diethyl ether', kind: 'reagent' },
  { names: ['MTBE', 'TBME'], smiles: 'COC(C)(C)C', name: 'methyl tert-butyl ether', kind: 'reagent' },
  { names: ['DME'], smiles: 'COCCOC', name: '1,2-dimethoxyethane', kind: 'reagent' },
  { names: ['NMP'], smiles: 'CN1CCCC1=O', name: 'N-methyl-2-pyrrolidone', kind: 'reagent' },
  { names: ['HMPA'], smiles: 'CN(C)P(=O)(N(C)C)N(C)C', name: 'hexamethylphosphoramide', kind: 'reagent' },
  { names: ['DMPU'], smiles: 'CN1CCCN(C)C1=O', name: 'DMPU (1,3-dimethyltetrahydropyrimidin-2-one)', kind: 'reagent' },
  { names: ['TFE'], smiles: 'OCC(F)(F)F', name: '2,2,2-trifluoroethanol', kind: 'reagent' },
  { names: ['HFIP'], smiles: 'OC(C(F)(F)F)C(F)(F)F', name: 'hexafluoroisopropanol', kind: 'reagent' },
  { names: ['PhMe', 'toluene'], smiles: 'Cc1ccccc1', name: 'toluene', kind: 'reagent' },
  { names: ['PhH', 'C6H6', 'benzene'], smiles: 'c1ccccc1', name: 'benzene', kind: 'reagent' },
  { names: ['C6D6'], smiles: '[2H]c1c([2H])c([2H])c([2H])c([2H])c1[2H]', name: 'benzene-d6', kind: 'reagent' },
  { names: ['PhCF3'], smiles: 'FC(F)(F)c1ccccc1', name: 'trifluorotoluene', kind: 'reagent' },
  { names: ['CDCl3'], smiles: '[2H]C(Cl)(Cl)Cl', name: 'chloroform-d', kind: 'reagent' },
  { names: ['CD2Cl2'], smiles: '[2H]C([2H])(Cl)Cl', name: 'dichloromethane-d2', kind: 'reagent' },
  { names: ['CD3OD', 'MeOD-d4'], smiles: '[2H]OC([2H])([2H])[2H]', name: 'methanol-d4', kind: 'reagent' },
  { names: ['CD3CN'], smiles: '[2H]C([2H])([2H])C#N', name: 'acetonitrile-d3', kind: 'reagent' },
  { names: ['D2O'], smiles: '[2H]O[2H]', name: 'deuterium oxide', kind: 'reagent' },
  // acids, anhydrides and bases
  { names: ['TFA'], smiles: 'OC(=O)C(F)(F)F', name: 'trifluoroacetic acid', kind: 'reagent' },
  { names: ['TFAA'], smiles: 'O=C(OC(=O)C(F)(F)F)C(F)(F)F', name: 'trifluoroacetic anhydride', kind: 'reagent' },
  { names: ['AcOH', 'HOAc'], smiles: 'CC(=O)O', name: 'acetic acid', kind: 'reagent' },
  { names: ['Ac2O'], smiles: 'CC(=O)OC(C)=O', name: 'acetic anhydride', kind: 'reagent' },
  { names: ['TfOH', 'HOTf'], smiles: 'OS(=O)(=O)C(F)(F)F', name: 'triflic acid', kind: 'reagent' },
  { names: ['Tf2O'], smiles: 'O=S(=O)(OS(=O)(=O)C(F)(F)F)C(F)(F)F', name: 'triflic anhydride', kind: 'reagent' },
  { names: ['HNTf2', 'Tf2NH'], smiles: 'N(S(=O)(=O)C(F)(F)F)S(=O)(=O)C(F)(F)F', name: 'triflimide', kind: 'reagent' },
  { names: ['TsOH', 'pTsOH', 'p-TsOH', 'PTSA', 'p-TSA'], smiles: 'Cc1ccc(S(=O)(=O)O)cc1', name: '4-toluenesulfonic acid', kind: 'reagent' },
  { names: ['MsOH'], smiles: 'CS(=O)(=O)O', name: 'methanesulfonic acid', kind: 'reagent' },
  { names: ['CSA'], smiles: 'CC1(C)C2CCC1(CS(=O)(=O)O)C(=O)C2', name: 'camphorsulfonic acid', kind: 'reagent' },
  { names: ['PPTS'], smiles: 'Cc1ccc(S(=O)(=O)[O-])cc1.c1cc[nH+]cc1', name: 'pyridinium p-toluenesulfonate', kind: 'reagent' },
  { names: ['DBU'], smiles: 'C1CCC2=NCCCN2CC1', name: 'DBU (1,8-diazabicyclo[5.4.0]undec-7-ene)', kind: 'reagent' },
  { names: ['DBN'], smiles: 'C1CN=C2CCCN2C1', name: 'DBN (1,5-diazabicyclo[4.3.0]non-5-ene)', kind: 'reagent' },
  { names: ['DABCO'], smiles: 'C1CN2CCN1CC2', name: 'DABCO (1,4-diazabicyclo[2.2.2]octane)', kind: 'reagent' },
  { names: ['DMAP'], smiles: 'CN(C)c1ccncc1', name: '4-(dimethylamino)pyridine', kind: 'reagent' },
  { names: ['DIPEA', 'DIEA', 'iPr2NEt', 'i-Pr2NEt', 'EtN(iPr)2'], smiles: 'CCN(C(C)C)C(C)C', name: 'N,N-diisopropylethylamine (Hünig\'s base)', kind: 'reagent' },
  { names: ['Et3N', 'NEt3', 'TEA'], smiles: 'CCN(CC)CC', name: 'triethylamine', kind: 'reagent' },
  { names: ['pyridine', 'py', 'pyr'], smiles: 'c1ccncc1', name: 'pyridine', kind: 'reagent' },
  { names: ['2,6-lutidine'], smiles: 'Cc1cccc(C)n1', name: '2,6-lutidine', kind: 'reagent' },
  { names: ['LDA'], smiles: '[Li+].CC(C)[N-]C(C)C', name: 'lithium diisopropylamide', kind: 'reagent' },
  { names: ['LiHMDS', 'LHMDS'], smiles: '[Li+].C[Si](C)(C)[N-][Si](C)(C)C', name: 'lithium hexamethyldisilazide', kind: 'reagent' },
  { names: ['NaHMDS'], smiles: '[Na+].C[Si](C)(C)[N-][Si](C)(C)C', name: 'sodium hexamethyldisilazide', kind: 'reagent' },
  { names: ['KHMDS'], smiles: '[K+].C[Si](C)(C)[N-][Si](C)(C)C', name: 'potassium hexamethyldisilazide', kind: 'reagent' },
  { names: ['LiTMP', 'LTMP'], smiles: '[Li+].CC1(C)CCCC(C)(C)[N-]1', name: 'lithium 2,2,6,6-tetramethylpiperidide', kind: 'reagent' },
  { names: ['nBuLi', 'n-BuLi', 'BuLi'], smiles: '[Li]CCCC', name: 'n-butyllithium', kind: 'reagent' },
  { names: ['sBuLi', 's-BuLi'], smiles: '[Li]C(C)CC', name: 'sec-butyllithium', kind: 'reagent' },
  { names: ['tBuLi', 't-BuLi'], smiles: '[Li]C(C)(C)C', name: 'tert-butyllithium', kind: 'reagent' },
  { names: ['MeLi'], smiles: '[Li]C', name: 'methyllithium', kind: 'reagent' },
  { names: ['PhLi'], smiles: '[Li]c1ccccc1', name: 'phenyllithium', kind: 'reagent' },
  { names: ['KOtBu', 'tBuOK', 't-BuOK', 'KOt-Bu'], smiles: '[K+].CC(C)(C)[O-]', name: 'potassium tert-butoxide', kind: 'reagent' },
  { names: ['NaOtBu', 'tBuONa', 't-BuONa', 'NaOt-Bu'], smiles: '[Na+].CC(C)(C)[O-]', name: 'sodium tert-butoxide', kind: 'reagent' },
  { names: ['LiAlH4', 'LAH'], smiles: '[Li+].[AlH4-]', name: 'lithium aluminium hydride', kind: 'reagent' },
  { names: ['NaBH4'], smiles: '[Na+].[BH4-]', name: 'sodium borohydride', kind: 'reagent' },
  { names: ['NaBH3CN', 'NaCNBH3'], smiles: '[Na+].[BH3-]C#N', name: 'sodium cyanoborohydride', kind: 'reagent' },
  { names: ['NaBH(OAc)3', 'STAB'], smiles: '[Na+].CC(=O)O[BH-](OC(C)=O)OC(C)=O', name: 'sodium triacetoxyborohydride', kind: 'reagent' },
  { names: ['DIBAL', 'DIBAL-H', 'DIBALH', 'iBu2AlH', 'i-Bu2AlH'], smiles: 'CC(C)C[AlH]CC(C)C', name: 'diisobutylaluminium hydride', kind: 'reagent' },
  { names: ['9-BBN'], smiles: 'B1C2CCCC1CCC2', name: '9-borabicyclo[3.3.1]nonane', kind: 'reagent' },
  { names: ['TBAF'], smiles: 'CCCC[N+](CCCC)(CCCC)CCCC.[F-]', name: 'tetrabutylammonium fluoride', kind: 'reagent' },
  { names: ['TBAI'], smiles: 'CCCC[N+](CCCC)(CCCC)CCCC.[I-]', name: 'tetrabutylammonium iodide', kind: 'reagent' },
  { names: ['TBAB'], smiles: 'CCCC[N+](CCCC)(CCCC)CCCC.[Br-]', name: 'tetrabutylammonium bromide', kind: 'reagent' },
  // oxidants and halogen sources
  { names: ['mCPBA', 'm-CPBA', 'MCPBA'], smiles: 'OOC(=O)c1cccc(Cl)c1', name: '3-chloroperbenzoic acid', kind: 'reagent' },
  { names: ['DDQ'], smiles: 'N#CC1=C(C#N)C(=O)C(Cl)=C(Cl)C1=O', name: 'DDQ (2,3-dichloro-5,6-dicyano-1,4-benzoquinone)', kind: 'reagent' },
  { names: ['NBS'], smiles: 'BrN1C(=O)CCC1=O', name: 'N-bromosuccinimide', kind: 'reagent' },
  { names: ['NCS'], smiles: 'ClN1C(=O)CCC1=O', name: 'N-chlorosuccinimide', kind: 'reagent' },
  { names: ['NIS'], smiles: 'IN1C(=O)CCC1=O', name: 'N-iodosuccinimide', kind: 'reagent' },
  { names: ['NFSI'], smiles: 'O=S(=O)(c1ccccc1)N(F)S(=O)(=O)c1ccccc1', name: 'N-fluorobenzenesulfonimide', kind: 'reagent' },
  { names: ['Selectfluor'], smiles: 'ClC[N+]12CC[N+](F)(CC1)CC2.F[B-](F)(F)F.F[B-](F)(F)F', name: 'Selectfluor', kind: 'reagent' },
  { names: ['NMO'], smiles: 'C[N+]1([O-])CCOCC1', name: 'N-methylmorpholine N-oxide', kind: 'reagent' },
  { names: ['TEMPO'], smiles: 'CC1(C)CCCC(C)(C)N1[O]', name: 'TEMPO', kind: 'reagent' },
  { names: ['DMP'], smiles: 'CC(=O)OI1(OC(C)=O)(OC(C)=O)OC(=O)c2ccccc21', name: 'Dess–Martin periodinane', kind: 'reagent' },
  { names: ['IBX'], smiles: 'O=I1(O)OC(=O)c2ccccc21', name: '2-iodoxybenzoic acid', kind: 'reagent' },
  { names: ['PCC'], smiles: 'c1cc[nH+]cc1.[O-][Cr](=O)(=O)Cl', name: 'pyridinium chlorochromate', kind: 'reagent' },
  { names: ['DMDO'], smiles: 'CC1(C)OO1', name: 'dimethyldioxirane', kind: 'reagent' },
  { names: ['TBHP', 'tBuOOH', 't-BuOOH'], smiles: 'CC(C)(C)OO', name: 'tert-butyl hydroperoxide', kind: 'reagent' },
  { names: ['AIBN'], smiles: 'CC(C)(C#N)N=NC(C)(C)C#N', name: 'azobisisobutyronitrile', kind: 'reagent' },
  { names: ['BHT'], smiles: 'Cc1cc(C(C)(C)C)c(O)c(C(C)(C)C)c1', name: 'butylated hydroxytoluene', kind: 'reagent' },
  // silylating, sulfonylating and protecting reagents
  { names: ['TMSCl', 'Me3SiCl'], smiles: 'C[Si](C)(C)Cl', name: 'chlorotrimethylsilane', kind: 'reagent' },
  { names: ['TBSCl', 'TBDMSCl'], smiles: 'CC(C)(C)[Si](C)(C)Cl', name: 'tert-butyldimethylsilyl chloride', kind: 'reagent' },
  { names: ['TIPSCl'], smiles: 'CC(C)[Si](Cl)(C(C)C)C(C)C', name: 'triisopropylsilyl chloride', kind: 'reagent' },
  { names: ['TBDPSCl'], smiles: 'CC(C)(C)[Si](Cl)(c1ccccc1)c1ccccc1', name: 'tert-butyldiphenylsilyl chloride', kind: 'reagent' },
  { names: ['TESCl'], smiles: 'CC[Si](Cl)(CC)CC', name: 'chlorotriethylsilane', kind: 'reagent' },
  { names: ['TMSOTf'], smiles: 'C[Si](C)(C)OS(=O)(=O)C(F)(F)F', name: 'trimethylsilyl triflate', kind: 'reagent' },
  { names: ['TBSOTf', 'TBDMSOTf'], smiles: 'CC(C)(C)[Si](C)(C)OS(=O)(=O)C(F)(F)F', name: 'tert-butyldimethylsilyl triflate', kind: 'reagent' },
  { names: ['TIPSOTf'], smiles: 'CC(C)[Si](OS(=O)(=O)C(F)(F)F)(C(C)C)C(C)C', name: 'triisopropylsilyl triflate', kind: 'reagent' },
  { names: ['TMSCN'], smiles: 'C[Si](C)(C)C#N', name: 'trimethylsilyl cyanide', kind: 'reagent' },
  { names: ['TMSN3'], smiles: 'C[Si](C)(C)N=[N+]=[N-]', name: 'trimethylsilyl azide', kind: 'reagent' },
  { names: ['TMSCHN2'], smiles: 'C[Si](C)(C)C=[N+]=[N-]', name: '(trimethylsilyl)diazomethane', kind: 'reagent' },
  { names: ['MsCl'], smiles: 'CS(=O)(=O)Cl', name: 'methanesulfonyl chloride', kind: 'reagent' },
  { names: ['TsCl'], smiles: 'Cc1ccc(S(=O)(=O)Cl)cc1', name: '4-toluenesulfonyl chloride', kind: 'reagent' },
  { names: ['Boc2O'], smiles: 'CC(C)(C)OC(=O)OC(=O)OC(C)(C)C', name: 'di-tert-butyl dicarbonate', kind: 'reagent' },
  { names: ['CbzCl'], smiles: 'ClC(=O)OCc1ccccc1', name: 'benzyl chloroformate', kind: 'reagent' },
  { names: ['AcCl'], smiles: 'CC(Cl)=O', name: 'acetyl chloride', kind: 'reagent' },
  { names: ['BzCl'], smiles: 'ClC(=O)c1ccccc1', name: 'benzoyl chloride', kind: 'reagent' },
  { names: ['PivCl'], smiles: 'CC(C)(C)C(Cl)=O', name: 'pivaloyl chloride', kind: 'reagent' },
  { names: ['BnBr'], smiles: 'BrCc1ccccc1', name: 'benzyl bromide', kind: 'reagent' },
  // coupling reagents
  { names: ['DCC'], smiles: 'C1CCC(CC1)N=C=NC1CCCCC1', name: 'N,N′-dicyclohexylcarbodiimide', kind: 'reagent' },
  { names: ['DIC'], smiles: 'CC(C)N=C=NC(C)C', name: 'N,N′-diisopropylcarbodiimide', kind: 'reagent' },
  { names: ['EDC', 'EDCI'], smiles: 'CCN=C=NCCCN(C)C', name: 'EDC (1-ethyl-3-(3-dimethylaminopropyl)carbodiimide)', kind: 'reagent' },
  { names: ['HOBt'], smiles: 'On1nnc2ccccc21', name: '1-hydroxybenzotriazole', kind: 'reagent' },
  { names: ['HATU'], smiles: 'CN(C)C(=[N+](C)C)On1nnc2cccnc21.F[P-](F)(F)(F)(F)F', name: 'HATU', kind: 'reagent' },
  { names: ['CDI'], smiles: 'O=C(n1ccnc1)n1ccnc1', name: 'N,N′-carbonyldiimidazole', kind: 'reagent' },
  { names: ['DEAD'], smiles: 'CCOC(=O)N=NC(=O)OCC', name: 'diethyl azodicarboxylate', kind: 'reagent' },
  { names: ['DIAD'], smiles: 'CC(C)OC(=O)N=NC(=O)OC(C)C', name: 'diisopropyl azodicarboxylate', kind: 'reagent' },
  { names: ['DPPA'], smiles: 'O=P(N=[N+]=[N-])(Oc1ccccc1)Oc1ccccc1', name: 'diphenylphosphoryl azide', kind: 'reagent' },
  { names: ['BINOL'], smiles: 'Oc1ccc2ccccc2c1-c1c(O)ccc2ccccc12', name: '1,1′-bi-2-naphthol', kind: 'reagent' },
  // small molecules whose formulas don't spell out their bonds
  { names: ['H2'], smiles: '[H][H]', name: 'hydrogen', kind: 'reagent' },
  { names: ['D2'], smiles: '[2H][2H]', name: 'deuterium', kind: 'reagent' },
  { names: ['N2'], smiles: 'N#N', name: 'nitrogen', kind: 'reagent' },
  { names: ['O2'], smiles: 'O=O', name: 'oxygen', kind: 'reagent' },
  { names: ['O3'], smiles: '[O-][O+]=O', name: 'ozone', kind: 'reagent' },
  { names: ['F2'], smiles: 'FF', name: 'fluorine', kind: 'reagent' },
  { names: ['Cl2'], smiles: 'ClCl', name: 'chlorine', kind: 'reagent' },
  { names: ['Br2'], smiles: 'BrBr', name: 'bromine', kind: 'reagent' },
  { names: ['I2'], smiles: 'II', name: 'iodine', kind: 'reagent' },
  { names: ['CO'], smiles: '[C-]#[O+]', name: 'carbon monoxide', kind: 'reagent' },
  { names: ['CO2'], smiles: 'O=C=O', name: 'carbon dioxide', kind: 'reagent' },
  { names: ['SO2'], smiles: 'O=S=O', name: 'sulfur dioxide', kind: 'reagent' },
  { names: ['NO'], smiles: '[N]=O', name: 'nitric oxide', kind: 'reagent' },
  { names: ['H2O2'], smiles: 'OO', name: 'hydrogen peroxide', kind: 'reagent' },
  { names: ['BF3·OEt2', 'BF3•OEt2', 'BF3.OEt2', 'BF3OEt2'], smiles: 'F[B-](F)(F)[O+](CC)CC', name: 'boron trifluoride diethyl etherate', kind: 'reagent' },
  { names: ['BH3·THF', 'BH3•THF', 'BH3.THF'], smiles: '[BH3-][O+]1CCCC1', name: 'borane–THF', kind: 'reagent' },
  { names: ['BH3·SMe2', 'BH3•SMe2', 'BH3.SMe2', 'BH3·DMS', 'BMS'], smiles: '[BH3-][S+](C)C', name: 'borane dimethyl sulfide', kind: 'reagent' },
];

/** Full names of the ligands a text box can hold on its own. */
const LIGAND_NAMES: Record<string, string> = {
  PPh3: 'triphenylphosphine', PCy3: 'tricyclohexylphosphine', PMe3: 'trimethylphosphine', PEt3: 'triethylphosphine',
  PtBu3: 'tri-tert-butylphosphine', PnBu3: 'tri-n-butylphosphine', dppm: '1,1-bis(diphenylphosphino)methane',
  dppe: '1,2-bis(diphenylphosphino)ethane', dppp: '1,3-bis(diphenylphosphino)propane', dppb: '1,4-bis(diphenylphosphino)butane',
  BINAP: '2,2′-bis(diphenylphosphino)-1,1′-binaphthyl', Xantphos: 'Xantphos', XPhos: 'XPhos', SPhos: 'SPhos', RuPhos: 'RuPhos',
  JohnPhos: 'JohnPhos', DavePhos: 'DavePhos', bpy: '2,2′-bipyridine', bipy: '2,2′-bipyridine', phen: '1,10-phenanthroline',
  tmeda: 'N,N,N′,N′-tetramethylethylenediamine', TMEDA: 'N,N,N′,N′-tetramethylethylenediamine', en: 'ethylenediamine',
  IMes: 'IMes (N-heterocyclic carbene)', SIMes: 'SIMes (N-heterocyclic carbene)', IPr: 'IPr (N-heterocyclic carbene)',
  SIPr: 'SIPr (N-heterocyclic carbene)', COD: '1,5-cyclooctadiene', NBD: 'norbornadiene', dba: 'dibenzylideneacetone',
  'p-cymene': 'p-cymene', C6Me6: 'hexamethylbenzene',
};

/** Ligands written the way they are written in metal formulas (lower case), as well. */
const LIGAND_ALIASES: Record<string, string> = { cod: 'COD', nbd: 'NBD' };

const ligandEntries = (): SpeciesEntry[] => {
  const out: SpeciesEntry[] = [];
  for (const n of L_LIGAND_NAMES) {
    const name = LIGAND_NAMES[n];
    if (!name || !NICKNAMES[n] || ['py', 'THF', 'DMF', 'DMSO', 'Et2O', 'DME', 'MeCN', 'PhCN', 'CO', 'OC'].includes(n)) continue;
    const names = [n, ...Object.entries(LIGAND_ALIASES).filter(([, to]) => to === n).map(([a]) => a)];
    out.push({ names, smiles: NICKNAMES[n], name, kind: 'ligand' });
  }
  out.push({ names: ['dtbbpy', 'dtbpy'], smiles: 'CC(C)(C)c1ccnc(-c2cc(C(C)(C)C)ccn2)c1', name: '4,4′-di-tert-butyl-2,2′-bipyridine', kind: 'ligand' });
  out.push({ names: ['dppf'], smiles: '[Fe+2].P(c1ccccc1)(c1ccccc1)C1=CC=C[CH-]1.P(c1ccccc1)(c1ccccc1)C1=CC=C[CH-]1', name: '1,1′-bis(diphenylphosphino)ferrocene', kind: 'ligand' });
  return out;
};

/** Everything a text box can name, by each way it is written. */
export const SPECIES_ENTRIES: SpeciesEntry[] = [...IONS, ...REAGENTS, ...ligandEntries()];

/** Each entry by the ways it is written; a name read two ways (TFA, CN) has its uncharged reading first. */
export const SPECIES_BY_NAME = new Map<string, SpeciesEntry[]>();
for (const e of SPECIES_ENTRIES) {
  for (const n of e.names) {
    const list = SPECIES_BY_NAME.get(n) ?? [];
    list.push(e);
    list.sort((a, b) => Number(!!a.needsSign) - Number(!!b.needsSign));
    SPECIES_BY_NAME.set(n, list);
  }
}
