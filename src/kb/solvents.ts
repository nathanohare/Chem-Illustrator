// The Solvents table: Table 1 of Steven Murov's "Properties of Solvents Used in Organic Chemistry"
// (murov.info/orgsolvents.htm, last revised 2020), the 64 solvents with boiling and melting points,
// density, solubility in water, relative polarity, eluant strength, exposure limit, vapor pressure,
// dipole moment, dielectric constant and viscosity, retyped below with Murov's footnotes as the
// column notes. Formulas are left out: resting the pointer on a name shows the structure instead
// (solvent-pics.json, drawn from the SMILES here by scripts/kb/build-solvent-pics.mjs). Each
// solvent's ICH Q3C class (property-tables.ts) is added as the last column.

import type { Template, TemplateAtom, TemplateBond } from '../chem/templates';
import { ICH_Q3C } from './property-tables';
import type { Cell, KbTable } from './tables';
import PICS from './solvent-pics.json';

/**
 * Murov's Table 1 as printed: name | bp (°C) | mp (°C) | density (g/mL) | solubility in water
 * (g/100 g; M = miscible) | relative polarity | eluant strength | threshold limit (ppm) | vapor
 * pressure at 20 °C (hPa; * = at 25 °C) | dipole moment (D) | dielectric constant | viscosity (mPa s).
 */
const MUROV = `
acetic acid|118|16.6|1.049|M|0.648|>1|10|15.3|1.68|6.2|1.12
acetone|56.2|-94.3|0.786|M|0.355|0.56|500|240|2.85|21|0.30
acetonitrile|81.6|-46|0.786|M|0.460|0.65|20|97|3.5|37.5|0.34
acetyl acetone|140.4|-23|0.975|16|0.571|||3|3.0|23|0.6
2-aminoethanol|170.9|10.5|1.018|M|0.651||3|0.53|2.3 - 2.6|37.7|20.8
aniline|184.4|-6.0|1.022|3.4|0.420||2|0.4|1.6|6.8|3.8
anisole|153.7|-37.5|0.996|0.10|0.198|||3.5*|1.4|4.3|0.98
benzene|80.1|5.5|0.879|0.18|0.111|0.32|0.5|101|0|2.3|0.60
benzonitrile|205|-13|0.996|0.2|0.333||10|12|4.1|26|1.27
benzyl alcohol|205.4|-15.3|1.042|3.5|0.608|||0.094*|1.7|13|5.47
1-butanol|117.6|-89.5|0.81|7.7|0.586||20|6.3|1.7|17.5|2.59
2-butanol|99.5|-114.7|0.808|18.1|0.506||100|18.3*|1.7|17.3|3.1
i-butanol|107.9|-108.2|0.803|8.5|0.552|||10.5*|1.8|17.9|6.68
2-butanone|79.6|-86.3|0.805|25.6|0.327|0.51|200|105|2.8|18.6|0.41
t-butyl alcohol|82.2|25.5|0.786|M|0.389||100|41|1.7|12.4|3.35
carbon disulfide|46.3|-111.6|1.263|0.2|0.065|0.15|10|400|0|2.6|0.36
carbon tetrachloride|76.7|-22.4|1.594|0.08|0.052|0.18|5|120|0|2.3|0.90
chlorobenzene|132|-45.6|1.106|0.05|0.188|0.30|10|12|1.54|5.7|0.75
chloroform|61.2|-63.5|1.498|0.8|0.259||10|210|1.0|4.8|0.54
cyclohexane|80.7|6.6|0.779|0.005|0.006|0.04|100|104|0|2|0.89
cyclohexanol|161.1|25.2|0.962|4.2|0.509||50|1.2|1.9|15|
cyclohexanone|155.6|-16.4|0.948|2.3|0.281||25|5|2.9|15|2.00
di-n-butylphthalate|340|-35|1.049|0.0011|0.272||||||16.6
1,1-dichloroethane|57.3|-97.0|1.176|0.5|0.269||100|240|1.8|10|0.84
1,2-dichloroethane|83.5|-35.4|1.235|0.87|0.327|||79*|1.8|10.4|0.78
diethylamine|56.3|-48|0.706|M|0.145|0.63|5|260|1.2|3.8|0.32
diethylene glycol|245|-10|1.118|M|0.713|||0.027|2.3|31.8|30.2
diglyme|162|-64|0.945|M|0.244||||1.9|7.23|1.88
dimethoxyethane (glyme)|85|-58|0.868|M|0.231||||1.7|7.3|1.1
N,N-dimethylaniline|194.2|2.4|0.956|0.14|0.179||||||1.40
dimethylformamide (DMF)|153|-61|0.944|M|0.386||10|3.5|3.8|37|0.80
dimethylphthalate|283.8|1|1.190|0.43|0.309||||||
dimethylsulfoxide (DMSO)|189|18.4|1.092|M|0.444|0.75||0.61*|3.9|46.7|2.00
dioxane|101.1|11.8|1.033|M|0.164|0.56|20|41|0.4|2|1.18
ethanol|78.5|-114.1|0.789|M|0.654|0.88|100|59|1.7|24|1.08
ether|34.6|-116.3|0.713|7.5|0.117|0.38|400|587|1.25|4.3|0.22
ethyl acetate|77|-83.6|0.894|8.7|0.228|0.58|400|97|1.78|6.0|0.43
ethyl acetoacetate|180.4|-80|1.028|2.9|0.577|||0.78*|||
ethyl benzoate|213|-34.6|1.047|0.07|0.228||||2.0|6.0|
ethylene glycol|197|-13|1.115|M|0.790|1.11||0.092*|2.3|37.7|16.1
glycerin|290|17.8|1.261|M|0.812||||2.7|42.5|934
heptane|98|-90.6|0.684|0.0003|0.012||400|48|0|1.9|0.39
1-heptanol|176.4|-35|0.819|0.17|0.549||||1.7|12|6.0
hexane|69|-95|0.655|0.0014|0.009|0.01|50|160|0|1.9|0.29
1-hexanol|158|-46.7|0.814|0.59|0.559|||0.22*|1.60|12.5|4.6
methanol|64.6|-98|0.791|M|0.762|0.95|200|128|1.6|33|0.54
methyl acetate|56.9|-98.1|0.933|24.4|0.253||200|220|1.7|6.68|0.36
methyl t-butyl ether (MTBE)|55.2|-109|0.741|4.8|0.124|0.20||250*|1.4|2.6|0.36
methylene chloride|39.8|-96.7|1.326|1.32|0.309|0.42|50|475|1.6|9.0|0.42
1-octanol|194.4|-15|0.827|0.096|0.537||||1.7|10.3|7.4
pentane|36.1|-129.7|0.626|0.004|0.009|0.00|600|573|0|1.84|0.23
1-pentanol|138.0|-78.2|0.814|2.2|0.568|||2.2*|1.7|14|3.5
2-pentanol|119.0|-50|0.810|4.5|0.488|||6.1*|1.7|13.7|3.5
3-pentanol|115.3|-8|0.821|5.1|0.463|||8.8*|1.7|13.3|
2-pentanone|102.3|-76.9|0.809|4.3|0.321|||35.4*|2.7|15.4|0.50
3-pentanone|101.7|-39.8|0.814|3.4|0.265||200|37.7*|2.8|17.0|0.44
1-propanol|97|-126|0.803|M|0.617|0.82||21*|1.68|22|1.95
2-propanol|82.4|-88.5|0.785|M|0.546|0.82|400|44|1.66|19|2.07
pyridine|115.5|-42|0.982|M|0.302|0.71|5|20|2.2|13|0.88
tetrahydrofuran(THF)|66|-108.4|0.886|30 or M|0.207|0.57|200|200|1.63|7.5|0.46
toluene|110.6|-93|0.867|0.05|0.099|0.29|50|29|0.36|2.4|0.55
water|100.00|0.00|0.998|M|1.000|>>1||17.5|1.85|80.1|0.89
water, heavy|101.3|4|1.107|M|0.991|||15|1.84|78.3|1.10
p-xylene|138.3|13.3|0.861|0.02|0.074|0.26|100|15|0|2.27|0.65
`;

/** Each solvent's name here, what else it is called (searched, not shown), its SMILES, and its ICH Q3C entry. */
const SOLVENTS: Record<string, { name: string; aka?: string; smiles: string; ich?: string }> = {
  'acetic acid': { name: 'Acetic acid', smiles: 'CC(=O)O', ich: 'Acetic acid' },
  acetone: { name: 'Acetone', smiles: 'CC(C)=O', ich: 'Acetone' },
  acetonitrile: { name: 'Acetonitrile', smiles: 'CC#N', ich: 'Acetonitrile' },
  'acetyl acetone': { name: 'Acetylacetone', smiles: 'CC(=O)CC(C)=O' },
  '2-aminoethanol': { name: '2-Aminoethanol', smiles: 'NCCO' },
  aniline: { name: 'Aniline', smiles: 'Nc1ccccc1' },
  anisole: { name: 'Anisole', smiles: 'COc1ccccc1', ich: 'Anisole' },
  benzene: { name: 'Benzene', smiles: 'c1ccccc1', ich: 'Benzene' },
  benzonitrile: { name: 'Benzonitrile', smiles: 'N#Cc1ccccc1' },
  'benzyl alcohol': { name: 'Benzyl alcohol', smiles: 'OCc1ccccc1' },
  '1-butanol': { name: '1-Butanol', smiles: 'CCCCO', ich: '1-Butanol' },
  '2-butanol': { name: '2-Butanol', smiles: 'CCC(C)O', ich: '2-Butanol' },
  'i-butanol': { name: 'Isobutanol', smiles: 'CC(C)CO', ich: '2-Methyl-1-propanol' },
  '2-butanone': { name: '2-Butanone', aka: 'MEK', smiles: 'CCC(C)=O', ich: 'Methyl ethyl ketone' },
  't-butyl alcohol': { name: 'tert-Butyl alcohol', smiles: 'CC(C)(C)O' },
  'carbon disulfide': { name: 'Carbon disulfide', smiles: 'S=C=S' },
  'carbon tetrachloride': { name: 'Carbon tetrachloride', smiles: 'ClC(Cl)(Cl)Cl', ich: 'Carbon tetrachloride' },
  chlorobenzene: { name: 'Chlorobenzene', smiles: 'Clc1ccccc1', ich: 'Chlorobenzene' },
  chloroform: { name: 'Chloroform', smiles: 'ClC(Cl)Cl', ich: 'Chloroform' },
  cyclohexane: { name: 'Cyclohexane', smiles: 'C1CCCCC1', ich: 'Cyclohexane' },
  cyclohexanol: { name: 'Cyclohexanol', smiles: 'OC1CCCCC1' },
  cyclohexanone: { name: 'Cyclohexanone', smiles: 'O=C1CCCCC1' },
  'di-n-butylphthalate': { name: 'Di-n-butyl phthalate', smiles: 'CCCCOC(=O)c1ccccc1C(=O)OCCCC' },
  '1,1-dichloroethane': { name: '1,1-Dichloroethane', smiles: 'CC(Cl)Cl' },
  '1,2-dichloroethane': { name: '1,2-Dichloroethane', smiles: 'ClCCCl', ich: '1,2-Dichloroethane' },
  diethylamine: { name: 'Diethylamine', smiles: 'CCNCC' },
  'diethylene glycol': { name: 'Diethylene glycol', smiles: 'OCCOCCO' },
  diglyme: { name: 'Diglyme', smiles: 'COCCOCCOC' },
  'dimethoxyethane (glyme)': { name: '1,2-Dimethoxyethane', aka: 'glyme', smiles: 'COCCOC', ich: '1,2-Dimethoxyethane' },
  'N,N-dimethylaniline': { name: 'N,N-Dimethylaniline', smiles: 'CN(C)c1ccccc1' },
  'dimethylformamide (DMF)': { name: 'N,N-Dimethylformamide', aka: 'DMF', smiles: 'CN(C)C=O', ich: 'N,N-Dimethylformamide' },
  dimethylphthalate: { name: 'Dimethyl phthalate', smiles: 'COC(=O)c1ccccc1C(=O)OC' },
  'dimethylsulfoxide (DMSO)': { name: 'Dimethyl sulfoxide', aka: 'DMSO', smiles: 'CS(C)=O', ich: 'Dimethyl sulfoxide' },
  dioxane: { name: '1,4-Dioxane', smiles: 'C1COCCO1', ich: '1,4-Dioxane' },
  ethanol: { name: 'Ethanol', smiles: 'CCO', ich: 'Ethanol' },
  ether: { name: 'Diethyl ether', smiles: 'CCOCC', ich: 'Diethyl ether' },
  'ethyl acetate': { name: 'Ethyl acetate', smiles: 'CCOC(C)=O', ich: 'Ethyl acetate' },
  'ethyl acetoacetate': { name: 'Ethyl acetoacetate', smiles: 'CCOC(=O)CC(C)=O' },
  'ethyl benzoate': { name: 'Ethyl benzoate', smiles: 'CCOC(=O)c1ccccc1' },
  'ethylene glycol': { name: 'Ethylene glycol', smiles: 'OCCO', ich: 'Ethylene glycol' },
  glycerin: { name: 'Glycerol', aka: 'glycerin', smiles: 'OCC(O)CO' },
  heptane: { name: 'Heptane', smiles: 'CCCCCCC', ich: 'Heptane' },
  '1-heptanol': { name: '1-Heptanol', smiles: 'CCCCCCCO' },
  hexane: { name: 'Hexane', smiles: 'CCCCCC', ich: 'Hexane' },
  '1-hexanol': { name: '1-Hexanol', smiles: 'CCCCCCO' },
  methanol: { name: 'Methanol', smiles: 'CO', ich: 'Methanol' },
  'methyl acetate': { name: 'Methyl acetate', smiles: 'COC(C)=O', ich: 'Methyl acetate' },
  'methyl t-butyl ether (MTBE)': { name: 'tert-Butyl methyl ether', aka: 'MTBE', smiles: 'COC(C)(C)C', ich: 'tert-Butyl methyl ether' },
  'methylene chloride': { name: 'Dichloromethane', aka: 'methylene chloride', smiles: 'ClCCl', ich: 'Dichloromethane' },
  '1-octanol': { name: '1-Octanol', smiles: 'CCCCCCCCO' },
  pentane: { name: 'Pentane', smiles: 'CCCCC', ich: 'Pentane' },
  '1-pentanol': { name: '1-Pentanol', smiles: 'CCCCCO', ich: '1-Pentanol' },
  '2-pentanol': { name: '2-Pentanol', smiles: 'CCCC(C)O' },
  '3-pentanol': { name: '3-Pentanol', smiles: 'CCC(O)CC' },
  '2-pentanone': { name: '2-Pentanone', smiles: 'CCCC(C)=O' },
  '3-pentanone': { name: '3-Pentanone', smiles: 'CCC(=O)CC' },
  '1-propanol': { name: '1-Propanol', smiles: 'CCCO', ich: '1-Propanol' },
  '2-propanol': { name: '2-Propanol', aka: 'isopropanol', smiles: 'CC(C)O', ich: 'Isopropanol' },
  pyridine: { name: 'Pyridine', smiles: 'c1ccncc1', ich: 'Pyridine' },
  'tetrahydrofuran(THF)': { name: 'Tetrahydrofuran', aka: 'THF', smiles: 'C1CCOC1', ich: 'Tetrahydrofuran' },
  toluene: { name: 'Toluene', smiles: 'Cc1ccccc1', ich: 'Toluene' },
  water: { name: 'Water', smiles: 'O' },
  'water, heavy': { name: 'Deuterium oxide', aka: 'heavy water, D2O', smiles: '[2H]O[2H]' },
  'p-xylene': { name: 'p-Xylene', smiles: 'Cc1ccc(C)cc1', ich: 'o-Xylene' },
};

/** Murov's solubility cell in words: "M" is miscible; THF's "30 or M" (sources differ) stays as printed, spelled out. */
function inWater(v: string): string | null {
  if (!v) return null;
  if (v === 'M') return 'Miscible';
  return v.replace(/\bM\b/, 'miscible');
}

/** The table's rows, in Murov's alphabetical order of his names. */
export function solventRows(src = MUROV): Record<string, Cell>[] {
  return src.trim().split('\n').map((line) => {
    const [key, bp, mp, density, water, polarity, eluant, tlv, vp, dipole, dielectric, viscosity] = line.split('|').map((s) => s.trim());
    const s = SOLVENTS[key];
    if (!s) throw new Error(`No name or SMILES for ${key}`);
    const ich = s.ich ? ICH_Q3C[s.ich] : undefined;
    const v = (x: string): Cell => (x === '' ? null : x);
    return {
      name: s.name, bp: v(bp), mp: v(mp), density: v(density), water: inWater(water), polarity: v(polarity), eluant: v(eluant),
      tlv: v(tlv), vp: v(vp), dipole: v(dipole), dielectric: v(dielectric), viscosity: v(viscosity),
      ich: ich ? ich.cls : 'Not listed', aka: [key, s.aka].filter(Boolean).join('; '), smiles: s.smiles,
    };
  });
}

/** A solvent's structure, for the picture shown when the pointer rests on its name. */
export function solventPicture(row: Record<string, Cell>): Template | null {
  const p = (PICS as unknown as Record<string, { atoms: TemplateAtom[]; bonds: TemplateBond[] }>)[String(row.smiles)];
  return p ? { id: `solvent-${row.smiles}`, name: String(row.name), group: 'own', atoms: p.atoms, bonds: p.bonds, attach: 0 } : null;
}

/** The SMILES of every solvent drawn (for scripts/kb/build-solvent-pics.mjs). */
export const SOLVENT_SMILES = Object.values(SOLVENTS).map((s) => s.smiles);

const MUROV_SOURCE = { label: 'Murov, S. Properties of Solvents Used in Organic Chemistry, Table 1 (murov.info, revised 2020)', url: 'http://murov.info/orgsolvents.htm' };
const REICHARDT = 'Reichardt, C. Solvents and Solvent Effects in Organic Chemistry, 3rd ed.; Wiley-VCH, 2003';

export const SOLVENTS_TABLE: KbTable = {
  id: 'solvents',
  title: 'Solvents',
  about: 'Properties of 64 common organic solvents, from Table 1 of Steven Murov\'s Properties of Solvents Used in Organic Chemistry: boiling and melting points, density, solubility in water, relative polarity, eluant strength, exposure limit, vapor pressure, dipole moment, dielectric constant and viscosity, with each solvent\'s ICH Q3C class. Rest the pointer on a name to see its structure. Click a heading to sort.',
  noSearch: true,
  columns: [
    { key: 'name', label: 'Solvent' },
    { key: 'bp', label: 'bp (°C)', numeric: true },
    { key: 'mp', label: 'mp (°C)', numeric: true },
    { key: 'density', label: 'Density (g/mL)', numeric: true },
    { key: 'water', label: 'In water', numeric: true, info: 'Solubility in water, in grams of solvent per 100 g of water (g/100 g). Miscible: mixes with water in all proportions. Source: Murov, Table 1.' },
    { key: 'polarity', label: 'Polarity', numeric: true, info: `Relative polarity: Reichardt's normalized polarity (ETN), from the shift of a dye's absorption band in the solvent: water 1.000, tetramethylsilane 0. Higher is more polar. Source: Murov, Table 1, from ${REICHARDT}.` },
    { key: 'eluant', label: 'Eluant ε°', numeric: true, info: `Eluant strength: Snyder's ε° on alumina: how strongly the solvent moves compounds down an alumina column. Higher elutes faster; on silica the values are lower but in much the same order. Source: Murov, Table 1, from ${REICHARDT}, p 495.` },
    { key: 'tlv', label: 'TLV (ppm)', numeric: true, info: `Threshold limit value (TLV) for exposure: the airborne concentration, in ppm, that workers may breathe day after day without harm (an 8-hour time-weighted average). Lower means more toxic by breathing. Source: Murov, Table 1, from ${REICHARDT}, pp 501–502; check your country's current limits.` },
    { key: 'vp', label: 'VP (hPa)', numeric: true, info: 'Vapor pressure (VP) at 20 °C, in hectopascals (1 hPa = 0.75 mmHg); values marked * are at 25 °C. Higher evaporates faster and fills the air sooner. Source: Murov, Table 1, from Reichardt and ChemIDplus.' },
    { key: 'dipole', label: 'Dipole (D)', numeric: true, info: 'Dipole moment in debye (D). Zero for symmetric molecules (benzene, CCl4, hexane) even when their bonds are polar.' },
    { key: 'dielectric', label: 'ε', numeric: true, info: 'Dielectric constant (relative permittivity, ε): how well the solvent separates charges. Above about 15, ions and charged intermediates are well stabilized (polar solvents); below about 5, hardly at all.' },
    { key: 'viscosity', label: 'η (cP)', numeric: true, info: 'Viscosity (η) in centipoise (cP), the same number as millipascal-seconds (mPa·s). Water is 0.89 at 25 °C. Thicker solvents run slower through a column or a filter. Source: Murov, Table 1, except 1-hexanol: Murov prints 0.59 (the solubility figure repeated); 4.6 is the measured value at 25 °C (Cano-Gómez et al., J. Chem. Eng. Data 2015, 60, 1945, via NIST TRC ThermoML).' },
    { key: 'ich', label: 'ICH class', info: 'ICH Q3C(R8) residual-solvent class: how much of a solvent may be left in a medicine, set by its toxicity. Class 1: avoid (known or suspected carcinogens, environmental hazards). Class 2: limit (a ppm cap for each). Class 3: low toxic potential (up to 5,000 ppm). "No adequate data": listed, but no limit set. A safety limit for drug products, not a green-chemistry ranking. Source: ICH Q3C(R8), 2021.' },
    { key: 'aka', label: 'Also called', hidden: true },
    { key: 'smiles', label: 'SMILES', hidden: true },
  ],
  rows: solventRows(),
  structure: solventPicture,
  sources: [
    MUROV_SOURCE,
    { label: 'Cano-Gómez, J. J. et al. J. Chem. Eng. Data 2015, 60, 1945 (1-hexanol viscosity, 4.56 mPa·s at 25 °C; Murov prints 0.59)', url: 'https://doi.org/10.1021/je501133u' },
    { label: 'ICH Q3C(R8) Impurities: Guideline for Residual Solvents, 2021 (class)', url: 'https://database.ich.org/sites/default/files/ICH_Q3C-R8_Guideline_Step4_2021_0422_1.pdf' },
  ],
};
