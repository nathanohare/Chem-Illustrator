// The Knowledge Base's glossary: a one-line meaning for every acronym and abbreviation its tables
// use (safety terms, NMR terms, identifiers, common reagents and solvents). Shown as the tooltip on
// any abbreviation in the Knowledge Base, and as a table of its own. Written for this program.

export interface GlossaryEntry {
  /** The abbreviation as it is written (IDLH, LD50, DIPEA). */
  term: string;
  /** What it stands for, written out. */
  full: string;
  /** What it means, in one line (may be empty when the full name says it all). */
  meaning: string;
  /** The kind of term: for grouping and filtering. */
  kind: 'Safety' | 'NMR' | 'Identifier' | 'Property' | 'Reagent' | 'Solvent' | 'Lab';
}

export const GLOSSARY: GlossaryEntry[] = [
  // safety
  { term: 'IDLH', full: 'Immediately Dangerous to Life or Health', meaning: 'Air concentration NIOSH judges could kill or cause lasting harm, or stop you escaping, within 30 minutes. Lower is more dangerous.', kind: 'Safety' },
  { term: 'LD50', full: 'Median lethal dose', meaning: 'Dose (mg per kg of body weight) that killed half the test animals by the route given. Lower is more toxic.', kind: 'Safety' },
  { term: 'LC50', full: 'Median lethal concentration', meaning: 'Air concentration that killed half the test animals over the time given. Lower is more toxic.', kind: 'Safety' },
  { term: 'LDLo', full: 'Lowest published lethal dose', meaning: 'The smallest dose reported to have caused a death.', kind: 'Safety' },
  { term: 'LCLo', full: 'Lowest published lethal concentration', meaning: 'The lowest air concentration reported to have caused a death.', kind: 'Safety' },
  { term: 'REL', full: 'Recommended Exposure Limit', meaning: 'NIOSH\'s recommended workplace limit, usually as an 8 or 10 hour average.', kind: 'Safety' },
  { term: 'PEL', full: 'Permissible Exposure Limit', meaning: 'OSHA\'s legal workplace limit in the US, as an 8 hour average.', kind: 'Safety' },
  { term: 'TLV', full: 'Threshold Limit Value', meaning: 'ACGIH\'s advised workplace limit.', kind: 'Safety' },
  { term: 'TWA', full: 'Time-weighted average', meaning: 'An exposure limit averaged over a work shift.', kind: 'Safety' },
  { term: 'STEL', full: 'Short-term exposure limit', meaning: 'A limit averaged over 15 minutes.', kind: 'Safety' },
  { term: 'GHS', full: 'Globally Harmonized System', meaning: 'The UN system of hazard classes, H-statements and pictograms. Category 1 is the most severe.', kind: 'Safety' },
  { term: 'CLP', full: 'Classification, Labelling and Packaging', meaning: 'The EU law applying GHS; its Annex VI holds the official (harmonised) classifications.', kind: 'Safety' },
  { term: 'IARC', full: 'International Agency for Research on Cancer', meaning: 'Classes agents by evidence of cancer: 1 (causes cancer), 2A (probably), 2B (possibly).', kind: 'Safety' },
  { term: 'NIOSH', full: 'National Institute for Occupational Safety and Health', meaning: 'The US agency that sets IDLH values and RELs.', kind: 'Safety' },
  { term: 'OSHA', full: 'Occupational Safety and Health Administration', meaning: 'The US agency that sets and enforces workplace limits.', kind: 'Safety' },
  { term: 'SDS', full: 'Safety Data Sheet', meaning: 'The supplier\'s hazard and handling sheet for a product.', kind: 'Safety' },
  { term: 'HSDB', full: 'Hazardous Substances Data Bank', meaning: 'A US National Library of Medicine toxicology database, now part of PubChem.', kind: 'Safety' },
  { term: 'CAMEO', full: 'CAMEO Chemicals (NOAA)', meaning: 'The US NOAA database of reactivity and response information.', kind: 'Safety' },
  { term: 'Tier', full: 'Bench hazard tier', meaning: 'This program\'s rating from 1 (extraordinary hazard) to 4 (low), set by IDLH, LD50 and harmonised classifications.', kind: 'Safety' },
  { term: 'po', full: 'Per os (by mouth)', meaning: 'Oral route of a dose.', kind: 'Safety' },
  { term: 'ip', full: 'Intraperitoneal', meaning: 'Injected into the abdominal cavity.', kind: 'Safety' },
  { term: 'iv', full: 'Intravenous', meaning: 'Injected into a vein.', kind: 'Safety' },
  { term: 'sc', full: 'Subcutaneous', meaning: 'Injected under the skin.', kind: 'Safety' },
  // NMR
  { term: 'NMR', full: 'Nuclear magnetic resonance', meaning: '', kind: 'NMR' },
  { term: 'ppm', full: 'Parts per million', meaning: 'The unit of chemical shift (δ).', kind: 'NMR' },
  { term: 'J', full: 'Coupling constant', meaning: 'Splitting between lines of a multiplet, in Hz.', kind: 'NMR' },
  { term: 'HDO', full: 'Partly deuterated water', meaning: 'The water peak seen in deuterated solvents.', kind: 'NMR' },
  { term: 's', full: 'Singlet', meaning: '', kind: 'NMR' },
  { term: 'd', full: 'Doublet', meaning: '', kind: 'NMR' },
  { term: 't', full: 'Triplet', meaning: '', kind: 'NMR' },
  { term: 'q', full: 'Quartet', meaning: '', kind: 'NMR' },
  { term: 'quint', full: 'Quintet', meaning: 'Five lines; the residual CHD2 peak of CD3 solvents.', kind: 'NMR' },
  { term: 'sept', full: 'Septet', meaning: 'Seven lines; the 13C peak of a CD3 group.', kind: 'NMR' },
  { term: 'm', full: 'Multiplet', meaning: '', kind: 'NMR' },
  { term: 'br', full: 'Broad', meaning: '', kind: 'NMR' },
  { term: 'qNMR', full: 'Quantitative NMR', meaning: 'Purity or amount measured against a weighed internal standard.', kind: 'NMR' },
  // identifiers and properties
  { term: 'CAS', full: 'CAS Registry Number', meaning: 'A compound\'s number from the Chemical Abstracts Service, such as 109-99-9 for THF.', kind: 'Identifier' },
  { term: 'SMILES', full: 'Simplified Molecular Input Line Entry System', meaning: 'A structure written as a line of text.', kind: 'Identifier' },
  { term: 'InChI', full: 'International Chemical Identifier', meaning: 'IUPAC\'s standard text identifier for a structure.', kind: 'Identifier' },
  { term: 'InChIKey', full: 'Hashed InChI', meaning: 'A fixed-length key made from the InChI, for searching.', kind: 'Identifier' },
  { term: 'MW', full: 'Molecular weight', meaning: 'In g/mol.', kind: 'Property' },
  { term: 'mp', full: 'Melting point', meaning: 'In °C.', kind: 'Property' },
  { term: 'bp', full: 'Boiling point', meaning: 'In °C at 1 atm unless a pressure is given.', kind: 'Property' },
  { term: 'nD', full: 'Refractive index', meaning: 'Measured with the sodium D line, at 20 °C unless stated.', kind: 'Property' },
  { term: 'logP', full: 'Octanol–water partition coefficient (log)', meaning: 'Higher means more oily; also a guide to skin uptake.', kind: 'Property' },
  { term: 'logS', full: 'Water solubility (log, mol/L)', meaning: '0 is 1 mol/L; −4 is 0.1 mmol/L.', kind: 'Property' },
  { term: 'pKa', full: 'Acid dissociation constant (−log)', meaning: 'Lower is more acidic; depends on the solvent (water, DMSO).', kind: 'Property' },
  { term: 'Rf', full: 'Retention factor', meaning: 'Distance a spot moves on a TLC plate divided by the solvent front\'s distance.', kind: 'Lab' },
  { term: 'TLC', full: 'Thin-layer chromatography', meaning: '', kind: 'Lab' },
  { term: 'KF', full: 'Karl Fischer titration', meaning: 'Measures water content, often in ppm.', kind: 'Lab' },
  { term: 'm/v', full: 'Mass per volume', meaning: '20% m/v is 20 g per 100 mL.', kind: 'Lab' },
  { term: 'Sure/Seal', full: 'Sure/Seal bottle', meaning: 'A bottle with a crown cap over a septum liner, for taking air-sensitive liquids out by syringe or cannula.', kind: 'Lab' },
  { term: 'Class D', full: 'Class D fire extinguisher', meaning: 'For burning metals and metal hydrides (Na, K, Li, LiAlH4). Water and CO2 make these fires worse.', kind: 'Safety' },
  // reagents
  { term: 'DIPEA', full: 'N,N-Diisopropylethylamine (Hünig\'s base)', meaning: '', kind: 'Reagent' },
  { term: 'DMAP', full: '4-(Dimethylamino)pyridine', meaning: '', kind: 'Reagent' },
  { term: 'DBU', full: '1,8-Diazabicyclo[5.4.0]undec-7-ene', meaning: '', kind: 'Reagent' },
  { term: 'LDA', full: 'Lithium diisopropylamide', meaning: '', kind: 'Reagent' },
  { term: 'LiHMDS', full: 'Lithium bis(trimethylsilyl)amide', meaning: '', kind: 'Reagent' },
  { term: 'NaHMDS', full: 'Sodium bis(trimethylsilyl)amide', meaning: '', kind: 'Reagent' },
  { term: 'KHMDS', full: 'Potassium bis(trimethylsilyl)amide', meaning: '', kind: 'Reagent' },
  { term: 'TBAF', full: 'Tetrabutylammonium fluoride', meaning: '', kind: 'Reagent' },
  { term: 'DMP', full: 'Dess–Martin periodinane', meaning: '', kind: 'Reagent' },
  { term: 'IBX', full: '2-Iodoxybenzoic acid', meaning: '', kind: 'Reagent' },
  { term: 'TEMPO', full: '(2,2,6,6-Tetramethylpiperidin-1-yl)oxyl', meaning: '', kind: 'Reagent' },
  { term: 'DDQ', full: '2,3-Dichloro-5,6-dicyano-1,4-benzoquinone', meaning: '', kind: 'Reagent' },
  { term: 'mCPBA', full: '3-Chloroperoxybenzoic acid', meaning: '', kind: 'Reagent' },
  { term: 'NBS', full: 'N-Bromosuccinimide', meaning: '', kind: 'Reagent' },
  { term: 'm-CPBA', full: 'meta-Chloroperoxybenzoic acid', meaning: '', kind: 'Reagent' },
  { term: 'PCC', full: 'Pyridinium chlorochromate', meaning: '', kind: 'Reagent' },
  { term: 'AIBN', full: 'Azobisisobutyronitrile', meaning: 'Radical initiator.', kind: 'Reagent' },
  { term: 'TBAT', full: 'Tetrabutylammonium difluorotriphenylsilicate', meaning: 'Dry, non-hygroscopic fluoride source.', kind: 'Reagent' },
  { term: 'TASF', full: 'Tris(dimethylamino)sulfonium difluorotrimethylsilicate', meaning: 'Dry fluoride source.', kind: 'Reagent' },
  { term: 'TsOH', full: 'p-Toluenesulfonic acid', meaning: '', kind: 'Reagent' },
  { term: 'NCS', full: 'N-Chlorosuccinimide', meaning: '', kind: 'Reagent' },
  { term: 'NIS', full: 'N-Iodosuccinimide', meaning: '', kind: 'Reagent' },
  { term: 'DCC', full: 'N,N\'-Dicyclohexylcarbodiimide', meaning: '', kind: 'Reagent' },
  { term: 'DCU', full: 'N,N\'-Dicyclohexylurea', meaning: 'The by-product of DCC couplings.', kind: 'Reagent' },
  { term: 'EDC', full: '1-Ethyl-3-(3-dimethylaminopropyl)carbodiimide', meaning: '', kind: 'Reagent' },
  { term: 'HATU', full: 'Hexafluorophosphate azabenzotriazole tetramethyl uronium', meaning: 'A peptide coupling reagent.', kind: 'Reagent' },
  { term: 'HOBt', full: '1-Hydroxybenzotriazole', meaning: '', kind: 'Reagent' },
  { term: 'TBSCl', full: 'tert-Butyldimethylsilyl chloride', meaning: '', kind: 'Reagent' },
  { term: 'TMSCl', full: 'Trimethylsilyl chloride', meaning: '', kind: 'Reagent' },
  { term: 'TMSCN', full: 'Trimethylsilyl cyanide', meaning: '', kind: 'Reagent' },
  { term: 'TFA', full: 'Trifluoroacetic acid', meaning: '', kind: 'Reagent' },
  { term: 'TFAA', full: 'Trifluoroacetic anhydride', meaning: '', kind: 'Reagent' },
  { term: 'Tf2O', full: 'Trifluoromethanesulfonic anhydride', meaning: '', kind: 'Reagent' },
  { term: 'TsCl', full: 'p-Toluenesulfonyl chloride', meaning: '', kind: 'Reagent' },
  { term: 'MsCl', full: 'Methanesulfonyl chloride', meaning: '', kind: 'Reagent' },
  { term: 'Boc2O', full: 'Di-tert-butyl dicarbonate', meaning: '', kind: 'Reagent' },
  { term: 'BHT', full: 'Butylated hydroxytoluene', meaning: 'Radical inhibitor added to ethers such as THF.', kind: 'Reagent' },
  { term: 'Ph3PO', full: 'Triphenylphosphine oxide', meaning: 'The by-product of Wittig, Mitsunobu and Appel reactions.', kind: 'Reagent' },
  { term: 'DIAD', full: 'Diisopropyl azodicarboxylate', meaning: '', kind: 'Reagent' },
  { term: 'DEAD', full: 'Diethyl azodicarboxylate', meaning: '', kind: 'Reagent' },
  { term: 'DIBAL', full: 'Diisobutylaluminium hydride', meaning: '', kind: 'Reagent' },
  // solvents
  { term: 'THF', full: 'Tetrahydrofuran', meaning: '', kind: 'Solvent' },
  { term: 'DCM', full: 'Dichloromethane', meaning: '', kind: 'Solvent' },
  { term: 'DMF', full: 'N,N-Dimethylformamide', meaning: '', kind: 'Solvent' },
  { term: 'DMA', full: 'N,N-Dimethylacetamide', meaning: '', kind: 'Solvent' },
  { term: 'DMSO', full: 'Dimethyl sulfoxide', meaning: '', kind: 'Solvent' },
  { term: 'NMP', full: 'N-Methyl-2-pyrrolidone', meaning: '', kind: 'Solvent' },
  { term: 'HMPA', full: 'Hexamethylphosphoramide', meaning: 'A carcinogen; DMPU is the usual substitute.', kind: 'Solvent' },
  { term: 'DMPU', full: 'N,N\'-Dimethylpropyleneurea', meaning: '', kind: 'Solvent' },
  { term: 'DME', full: '1,2-Dimethoxyethane', meaning: '', kind: 'Solvent' },
  { term: 'MTBE', full: 'Methyl tert-butyl ether', meaning: '', kind: 'Solvent' },
  { term: 'CPME', full: 'Cyclopentyl methyl ether', meaning: '', kind: 'Solvent' },
  { term: '2-MeTHF', full: '2-Methyltetrahydrofuran', meaning: '', kind: 'Solvent' },
  { term: 'MeCN', full: 'Acetonitrile', meaning: '', kind: 'Solvent' },
  { term: 'EtOAc', full: 'Ethyl acetate', meaning: '', kind: 'Solvent' },
  { term: 'Et2O', full: 'Diethyl ether', meaning: '', kind: 'Solvent' },
  { term: 'PE', full: 'Petroleum ether', meaning: 'A low-boiling alkane mixture, not an ether.', kind: 'Solvent' },
  { term: 'IPA', full: 'Isopropanol (2-propanol)', meaning: '', kind: 'Solvent' },
  { term: 'HFIP', full: '1,1,1,3,3,3-Hexafluoro-2-propanol', meaning: '', kind: 'Solvent' },
  { term: 'TFE', full: '2,2,2-Trifluoroethanol', meaning: '', kind: 'Solvent' },
  { term: 'VP', full: 'Vapour pressure', meaning: 'How readily a liquid evaporates, in mmHg at about 25 °C. 760 mmHg is the boiling point.', kind: 'Property' },
  { term: 'Ca', full: 'Potential occupational carcinogen (NIOSH)', meaning: 'NIOSH\'s mark on an IDLH or exposure limit for a substance it treats as a possible cause of cancer at work.', kind: 'Safety' },
  { term: 'EROS', full: 'Encyclopedia of Reagents for Organic Synthesis', meaning: 'Wiley\'s reagent encyclopedia; its short summary for each reagent is free to read.', kind: 'Reagent' },
  { term: 'Badges', full: 'Bench warnings', meaning: 'Skin: NIOSH notes absorption through skin. No warning: no smell or symptoms at harmful levels. Peroxide former, Pyrophoric, Water-reactive, Explosive, Oxidiser, Carcinogen 1A/1B: as named.', kind: 'Safety' },
];

const BY_TERM = new Map(GLOSSARY.map((g) => [g.term.toLowerCase(), g]));

/** Hazard statements (UN GHS / EU CLP wording, shortened), for tooltips on codes such as H330. */
const H_STATEMENTS: Record<string, string> = {
  H200: 'Unstable explosive', H201: 'Explosive; mass explosion hazard', H202: 'Explosive; severe projection hazard', H203: 'Explosive; fire, blast or projection hazard', H204: 'Fire or projection hazard', H205: 'May mass explode in fire',
  H220: 'Extremely flammable gas', H221: 'Flammable gas', H224: 'Extremely flammable liquid and vapour', H225: 'Highly flammable liquid and vapour', H226: 'Flammable liquid and vapour', H228: 'Flammable solid',
  H240: 'Heating may cause an explosion', H241: 'Heating may cause a fire or explosion', H242: 'Heating may cause a fire', H250: 'Catches fire spontaneously if exposed to air', H251: 'Self-heating; may catch fire',
  H260: 'In contact with water releases flammable gases which may ignite spontaneously', H261: 'In contact with water releases flammable gas', H270: 'May cause or intensify fire; oxidiser', H271: 'May cause fire or explosion; strong oxidiser', H272: 'May intensify fire; oxidiser', H280: 'Contains gas under pressure', H290: 'May be corrosive to metals',
  H300: 'Fatal if swallowed', H301: 'Toxic if swallowed', H302: 'Harmful if swallowed', H304: 'May be fatal if swallowed and enters airways', H310: 'Fatal in contact with skin', H311: 'Toxic in contact with skin', H312: 'Harmful in contact with skin',
  H314: 'Causes severe skin burns and eye damage', H315: 'Causes skin irritation', H317: 'May cause an allergic skin reaction', H318: 'Causes serious eye damage', H319: 'Causes serious eye irritation',
  H330: 'Fatal if inhaled', H331: 'Toxic if inhaled', H332: 'Harmful if inhaled', H334: 'May cause allergy or asthma symptoms if inhaled', H335: 'May cause respiratory irritation', H336: 'May cause drowsiness or dizziness',
  H340: 'May cause genetic defects', H341: 'Suspected of causing genetic defects', H350: 'May cause cancer', H350i: 'May cause cancer by inhalation', H351: 'Suspected of causing cancer',
  H360: 'May damage fertility or the unborn child', H360D: 'May damage the unborn child', H360F: 'May damage fertility', H360FD: 'May damage fertility; may damage the unborn child', H360Df: 'May damage the unborn child; suspected of damaging fertility', H360Fd: 'May damage fertility; suspected of damaging the unborn child',
  H361: 'Suspected of damaging fertility or the unborn child', H361d: 'Suspected of damaging the unborn child', H361f: 'Suspected of damaging fertility', H361fd: 'Suspected of damaging fertility and the unborn child', H362: 'May cause harm to breast-fed children',
  H370: 'Causes damage to organs', H371: 'May cause damage to organs', H372: 'Causes damage to organs through prolonged or repeated exposure', H373: 'May cause damage to organs through prolonged or repeated exposure',
  H400: 'Very toxic to aquatic life', H410: 'Very toxic to aquatic life with long-lasting effects', H411: 'Toxic to aquatic life with long-lasting effects', H412: 'Harmful to aquatic life with long-lasting effects', H413: 'May cause long-lasting harmful effects to aquatic life',
  EUH014: 'Reacts violently with water', EUH029: 'Contact with water liberates toxic gas', EUH031: 'Contact with acids liberates toxic gas', EUH032: 'Contact with acids liberates very toxic gas', EUH066: 'Repeated exposure may cause skin dryness or cracking', EUH070: 'Toxic by eye contact', EUH071: 'Corrosive to the respiratory tract',
};

/** The glossary entry for a term (any case), or null. */
export function glossaryEntry(term: string): GlossaryEntry | null {
  return BY_TERM.get(term.trim().toLowerCase()) ?? null;
}

/** The tooltip for a term: "IDLH: Immediately Dangerous to Life or Health. Air concentration…", or null. */
export function glossaryTip(term: string): string | null {
  const h = H_STATEMENTS[term.trim()];
  if (h) return `${term.trim()}: ${h}`;
  const g = glossaryEntry(term);
  if (!g) return null;
  return g.meaning ? `${g.term}: ${g.full}. ${g.meaning}` : `${g.term}: ${g.full}`;
}

/** Words that are glossary terms only when written exactly so (one-letter NMR terms, "J", "d"): never matched inside other text. */
const EXACT_ONLY = new Set(['s', 'd', 't', 'q', 'm', 'br', 'j', 'po', 'ip', 'iv', 'sc', 'mp', 'bp', 'pe', 'kf', 'tier']);

/**
 * Text cut into pieces, each known abbreviation a piece with its tooltip: for showing a header or
 * cell with the abbreviations explained on hover. Short words that are ordinary English or NMR
 * letters (s, d, m, bp) are explained only when they are the whole text.
 */
export function explainPieces(text: string): { text: string; tip?: string }[] {
  const whole = text.trim();
  if (EXACT_ONLY.has(whole.toLowerCase())) {
    const tip = glossaryTip(whole);
    return [tip ? { text, tip } : { text }];
  }
  const out: { text: string; tip?: string }[] = [];
  const re = /[A-Za-z][A-Za-z0-9-]*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const w = m[0];
    if (EXACT_ONLY.has(w.toLowerCase())) continue;
    const tip = glossaryTip(w);
    if (!tip) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: w, tip });
    last = m.index + w.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}
