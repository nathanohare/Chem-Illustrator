// The bench hazard rating. It ranks compounds by measured numbers, not by the long generic GHS list,
// so that the few extraordinarily dangerous reagents (OsO4, Me2SO4, HF) stand out from solvents and
// routine reagents:
//
//   Tier 1, extraordinary: IDLH at or below 10 ppm (10 mg/m3), fatal through the skin or by
//     breathing it (harmonised EU H310 or H330), or a named special case (HF, cyanides, phosgene…).
//   Tier 2, high: IDLH above 10 and up to 100 ppm, oral LD50 at or below 50 mg/kg or fatal if
//     swallowed (H300), a volatile category 1A/1B carcinogen or mutagen, pyrophoric, or explosive.
//   Tier 3, standard: what a hood, normal PPE and good technique handle.
//   Tier 4, low: little hazard beyond normal care (salts, sugars, silica).
//   Not rated: no open source gives anything to rate it by. Never shown as Tier 3, which would
//     read as "standard" when nothing is known.
//
// Only the harmonised EU classification (Regulation 1272/2008 Annex VI) is used, never the merged
// supplier notifications that give dichloromethane H350 and acetone H372. The numbers come from
// safety-data.json (scripts/kb/build-safety.mjs); the lists below are written for this program.

export interface Lethal {
  kind: string;
  species: string;
  route: 'oral' | 'dermal' | 'inhalation' | 'ip' | 'iv' | 'sc';
  value: number;
  unit: string;
  time: string;
  source: string;
}

export interface Sourced { text: string; source: string }

export interface SafetyRecord {
  name: string;
  cid: number;
  cas: string | null;
  formula: string | null;
  mw: number | null;
  smiles: string | null;
  idlh: { value?: number; unit?: 'ppm' | 'mg/m3'; as?: string; ca?: boolean; text?: string; source: string; url?: string } | null;
  lethal: Lethal[];
  vp: Sourced | null;
  bp: Sourced | null;
  mp: Sourced | null;
  density: Sourced | null;
  flash: Sourced | null;
  ghs: { codes: string[]; classes: string } | null;
  alerts: string[];
  skin: boolean;
  incompatible: string | null;
  niosh: string | null;
  /** log Kow (octanol/water), solubility, pKa in water and the like, as the source gives them. */
  logKow?: Sourced | null;
  /** PubChem's computed XLogP3. */
  xlogp?: number | null;
  pka?: Sourced | null;
  water?: Sourced | null;
  organic?: Sourced | null;
  viscosity?: Sourced | null;
  refractive?: Sourced | null;
}

export type Tier = 1 | 2 | 3 | 4;

/** Named Tier 1 cases the numbers alone can miss (by PubChem CID). */
const TIER_1: Record<number, string> = {
  14917: 'HF: burns go deep and late; fatal through the skin',
  2724467: 'HF·pyridine: an HF source',
  175505: 'Et3N·3HF: an HF source',
  8929: 'Cyanide: fast-acting poison',
  9032: 'Cyanide: fast-acting poison',
  768: 'Hydrogen cyanide: fast-acting poison',
  82115: 'Releases HCN with water or acid',
  6406: 'Releases HCN',
  6371: 'Phosgene: no reliable warning odor, delayed lung damage',
  10426: 'Diphosgene: a phosgene source',
  94429: 'Triphosgene: a phosgene source',
  9550: 'Diazomethane: toxic and explosive',
  11645: 'Dimethylmercury: fatal through gloves and skin in small amounts',
  6497: 'Dimethyl sulfate: absorbed through skin, no warning, delayed effects',
  30318: 'Osmium tetroxide: volatile, damages eyes and lungs',
  10967: 'Bis(chloromethyl) ether: volatile human carcinogen',
  167693: 'TMS-diazomethane: deaths from inhaling it; acts like diazomethane',
};

/** Named Tier 2 cases (pyrophorics and others the alerts may not carry). */
const TIER_2: Record<number, string> = {
  53628101: 'Pyrophoric',
  102446: 'Pyrophoric',
  53627823: 'Pyrophoric in concentrated solution; reacts violently with water',
  101667988: 'Pyrophoric',
  11010: 'Pyrophoric',
  16682925: 'Pyrophoric',
  16682930: 'Pyrophoric',
  68983: 'Pyrophoric',
  83681: 'Pyrophoric',
  62619: 'Raney nickel: pyrophoric when dry',
  2724049: 'Pyrophoric in concentrated solution',
  14487: 'Pyrophoric neat; solutions ignite on spills',
  5462222: 'Ignites with water; old potassium grows an explosive superoxide crust',
  6323: 'Toxic gas with no warning odor; nerve damage',
  11009: 'Cyanide: releases HCN with acid',
  14915: 'Chromium(VI): carcinogen, fatal if inhaled as dust',
  119079: 'RuO4: volatile like OsO4; explodes with many organics',
  9526: 'Potent volatile alkylating agent',
  6163: 'Alkylating agent and carcinogen 1B, absorbed through skin',
  12679: 'Carcinogen 1B, absorbed through skin',
  123472: 'Releases HF; can detonate when heated',
  78378: 'Forms toxic, explosive HN3 with water or acid',
  6328: 'Volatile alkylating agent',
  7864: 'Volatile alkylating agent and carcinogen',
  33557: 'Azide: toxic, forms HN3 with acid and explosive metal azides',
  402: 'Hydrogen sulfide: dulls the sense of smell',
  281: 'Carbon monoxide: no warning',
  23931: 'Mercury vapor from spills',
  24085: 'Mercury(II) chloride: highly toxic',
  11247: 'Thallium salts are highly toxic',
  6954: 'Picric acid: explosive when dry',
  9321: 'Hydrazine: toxic, carcinogen, unstable',
  24408: 'Bromine: severe burns and toxic vapor',
  24526: 'Chlorine: toxic gas',
  3032552: 'Nitrogen dioxide: toxic gas, delayed lung damage',
  996: 'Phenol: absorbed through skin, can be fatal',
};

/** Pyrophoric reagents (with H250, the only test used: CAMEO also marks metal powders and alkoxides). */
const PYROPHORIC = new Set([53628101 /* tert-Butyllithium */, 102446 /* sec-Butyllithium */, 53627823 /* n-Butyllithium */, 2724049 /* Methyllithium */, 101667988 /* Diethylzinc */, 11010 /* Dimethylzinc */, 16682925 /* Trimethylaluminum */, 16682930 /* Triethylaluminum */, 68983 /* Trimethylphosphine */, 83681 /* Tri-tert-butylphosphine */, 14487 /* Diisobutylaluminum hydride */, 62619 /* Raney nickel */]);

/** Water-reactive metals and hydrides (in addition to H260, H261, EUH014 and CAMEO's alerts). */
const WATER_REACTIVE = new Set([5360545 /* Sodium */, 5462222 /* Potassium */, 3028194 /* Lithium */, 24758 /* Sodium hydride */, 82127 /* Potassium hydride */, 3033859 /* Calcium hydride */, 28112 /* Lithium aluminum hydride */, 4148881 /* Lithium borohydride */, 14487 /* Diisobutylaluminum hydride */, 2724049 /* Methyllithium */, 53627823 /* n-Butyllithium */, 102446 /* sec-Butyllithium */, 53628101 /* tert-Butyllithium */]);

/** Little hazard beyond normal care. */
const TIER_4 = new Set([5234 /* Sodium chloride */, 24436 /* Sodium sulfate */, 24083 /* Magnesium sulfate */, 516892 /* Sodium bicarbonate */, 962 /* Water */, 5988 /* Sucrose */, 5793 /* Glucose */, 24261 /* Silica gel */, 25517 /* Ammonium chloride */, 5284359 /* Calcium chloride */, 11430 /* Potassium carbonate */, 10340 /* Sodium carbonate */]);

/** Compounds whose smell or symptoms give no warning at harmful levels. */
const NO_WARNING = new Set([6497 /* Dimethyl sulfate */, 6163 /* Diethyl sulfate */, 6371 /* Phosgene */, 10426 /* Diphosgene */, 94429 /* Triphosgene */, 281 /* Carbon monoxide */, 11645 /* Dimethylmercury */, 6323 /* Bromomethane */, 402 /* Hydrogen sulfide */, 14917 /* Hydrofluoric acid */, 2724467 /* Hydrogen fluoride pyridine */, 175505 /* Triethylamine trihydrofluoride */, 30318 /* Osmium tetroxide */, 7864 /* Chloromethyl methyl ether */, 10967 /* Bis(chloromethyl) ether */, 3032552 /* Nitrogen dioxide */, 6328 /* Iodomethane */, 6354 /* Ethylene oxide */]);

/** Ethers and others that form explosive peroxides on standing (in addition to CAMEO's alerts). */
const PEROXIDE = new Set([8028 /* Tetrahydrofuran */, 3283 /* Diethyl ether */, 7914 /* Diisopropyl ether */, 31275 /* 1,4-Dioxane */, 8071 /* Ethylene glycol dimethyl ether */, 7301 /* 2-Methyltetrahydrofuran */, 8150 /* Diglyme */]);

/** Common reagents the open sources give nothing to rate by, rated here by PubChem CID (written for
 * this program from well-known chemistry and suppliers' SDSs; reviewed like the lists above). */
const NAMED: Record<number, { tier: 2 | 3; why: string; water?: boolean }> = {
  21889599: { tier: 3, why: 'Highly flammable; the vapor is heavier than air' },
  13529: { tier: 3, why: 'Corrosive to eyes and skin' },
  6409: { tier: 3, why: 'Toxic if swallowed or inhaled; flammable' },
  62406: { tier: 3, why: 'Superacid: severe burns; fumes in moist air', water: true },
  10796: { tier: 3, why: 'Irritant base' },
  23665647: { tier: 3, why: 'Corrosive strong base; moisture can make it self-heat', water: true },
  24758: { tier: 3, why: 'Gives hydrogen with water, which can ignite; runaway decomposition with DMF, DMSO or DMAc on warming', water: true },
  81184: { tier: 3, why: 'Corrosive base' },
  81531: { tier: 3, why: 'Flammable; corrosive' },
  14284: { tier: 2, why: 'Toxic through the skin and if swallowed (suppliers\' SDSs give H310 and H301)' },
  2724682: { tier: 3, why: 'Reacts violently with water; solutions flammable', water: true },
  57426343: { tier: 3, why: 'Reacts with water; corrosive; solutions flammable', water: true },
  2724254: { tier: 3, why: 'Reacts with water; corrosive; solutions flammable', water: true },
  3251421: { tier: 3, why: 'Reacts with water; corrosive; solutions flammable', water: true },
  2724141: { tier: 3, why: 'Fluoride source: corrosive, toxic' },
  25953: { tier: 3, why: 'Toxic if swallowed; fluoride gives HF with acid' },
  53629015: { tier: 3, why: 'Reacts violently with water; solutions flammable', water: true },
  101914: { tier: 3, why: 'Reacts violently with water; the ether solution is very flammable', water: true },
  101955: { tier: 3, why: 'Reacts violently with water; the THF solution is very flammable', water: true },
  5003444: { tier: 2, why: 'Gives HCN with acid; toxic' },
  5049666: { tier: 3, why: 'Gives hydrogen with water', water: true },
  6365270: { tier: 3, why: 'Gives hydrogen with water; flammable; old bottles can build pressure', water: true },
  9833925: { tier: 3, why: 'Gives hydrogen with water; flammable; stench', water: true },
  6327450: { tier: 3, why: 'Gives hydrogen with water; flammable', water: true },
  23712863: { tier: 3, why: 'Reacts violently with water; the THF solution is flammable', water: true },
  12052: { tier: 3, why: 'Flammable; gives hydrogen with bases, acids or fluoride' },
  5948: { tier: 2, why: 'Organotin: toxic, absorbed through the skin' },
  23938: { tier: 3, why: 'Dry or used catalyst ignites solvent vapor and hydrogen: keep it wet' },
  345198: { tier: 3, why: 'Oxidizer; once reduced, the platinum can ignite solvent vapor' },
  53393272: { tier: 2, why: 'Osmium(VI): toxic; oxidants turn it into volatile OsO4' },
  46846327: { tier: 2, why: 'Chromium(VI): carcinogen; toxic' },
  159879: { tier: 2, why: 'Chromium(VI): carcinogen; toxic' },
  158115057: { tier: 3, why: 'Strong oxidizer; corrosive' },
  159087: { tier: 3, why: 'Oxidizer; impure samples have been reported shock-sensitive' },
  108794: { tier: 2, why: 'Explodes on impact or on heating above about 200 °C' },
  23712892: { tier: 3, why: 'Oxidizer; corrosive' },
  180504: { tier: 3, why: 'Strong oxidizer' },
  6775: { tier: 2, why: 'Gives HCN with water; toxic' },
  2724126: { tier: 3, why: 'Corrosive' },
  82029: { tier: 3, why: 'Oxidizer; irritant' },
  31398: { tier: 3, why: 'Oxidizer; corrosive' },
  120273: { tier: 3, why: 'Oxidizer; irritant; light-sensitive' },
  2735153: { tier: 3, why: 'Strong alkylating agent; corrosive; reacts with moisture', water: true },
  12192: { tier: 2, why: 'Diazo compound: can decompose violently on heating; toxic' },
  65578: { tier: 3, why: 'Reacts violently with water giving HCl, CO and CO2; toxic, corrosive', water: true },
  6326975: { tier: 3, why: 'Reacts violently with water; corrosive', water: true },
  9845: { tier: 3, why: 'Reacts violently with water; corrosive and volatile', water: true },
  67749: { tier: 3, why: 'Reacts violently with water; severe burns', water: true },
  7397: { tier: 3, why: 'Corrosive; gives HCl with water' },
  90495: { tier: 2, why: 'Very toxic if inhaled (suppliers\' SDSs give H330); melts near room temperature' },
  68263: { tier: 3, why: 'Gives CO2 with water (pressure in closed vessels); corrosive', water: true },
  15908: { tier: 3, why: 'Skin sensitizer; corrosive' },
  8000: { tier: 3, why: 'Reacts violently with water, fuming; corrosive; flammable', water: true },
  65367: { tier: 3, why: 'Reacts violently with water; corrosive; flammable', water: true },
  28928: { tier: 3, why: 'Corrosive; gives HCl with water' },
  123414: { tier: 2, why: 'Organic azide: toxic; gives HN3 with acid' },
  24288: { tier: 3, why: 'Carcinogen by inhalation of dust (1B); sensitizer' },
  11979704: { tier: 3, why: 'Air-sensitive; irritant' },
  167845: { tier: 3, why: 'Irritant' },
};

export interface HaveReady { what: string; why: string; source: string }

/** What to set out before opening the bottle, by PubChem CID. Your institution's protocol comes first. */
const HAVE_READY: { cids: number[]; ready: HaveReady }[] = [
  { cids: [14917 /* Hydrofluoric acid */, 2724467 /* Hydrogen fluoride pyridine */, 175505 /* Triethylamine trihydrofluoride */], ready: { what: 'Calcium gluconate gel', why: 'HF burns go deep and show late; the gel goes on at once, then medical care', source: 'CDC/NIOSH emergency response card' } },
  { cids: [8929 /* Sodium cyanide */, 9032 /* Potassium cyanide */, 768 /* Hydrogen cyanide */, 82115 /* Trimethylsilyl cyanide */, 6406 /* Acetone cyanohydrin */, 11009 /* Copper(I) cyanide */], ready: { what: 'Know where the cyanide antidote kit is; never work alone; bleach at high pH for waste', why: 'Acts in minutes; treatment is by trained responders', source: 'CDC/NIOSH emergency response card' } },
  { cids: [996 /* Phenol */], ready: { what: 'PEG 300 or 400 for skin', why: 'Water alone spreads phenol; swab with PEG first', source: 'HSDB first aid' } },
  { cids: [53628101 /* tert-Butyllithium */, 102446 /* sec-Butyllithium */, 53627823 /* n-Butyllithium */, 2724049 /* Methyllithium */, 101667988 /* Diethylzinc */, 11010 /* Dimethylzinc */, 16682925 /* Trimethylaluminum */, 16682930 /* Triethylaluminum */, 68983 /* Trimethylphosphine */, 83681 /* Tri-tert-butylphosphine */], ready: { what: 'Dry sand or a Class D extinguisher; dilute isopropanol in hexane for quenching residues', why: 'Ignites in air; water and CO2 make it worse', source: 'NOAA CAMEO' } },
  { cids: [5360545 /* Sodium */, 5462222 /* Potassium */, 3028194 /* Lithium */, 24758 /* Sodium hydride */, 82127 /* Potassium hydride */, 28112 /* Lithium aluminum hydride */, 3033859 /* Calcium hydride */], ready: { what: 'Dry sand or a Class D extinguisher; an alcohol for quenching (t-BuOH for K)', why: 'Reacts violently with water', source: 'NOAA CAMEO' } },
  { cids: [24408 /* Bromine */], ready: { what: 'Sodium thiosulfate solution', why: 'Neutralizes spills and splashes', source: 'NOAA CAMEO' } },
  { cids: [30318 /* Osmium tetroxide */, 53393272 /* Potassium osmate */], ready: { what: 'Corn oil or aqueous sodium sulfite for spills', why: 'Reduces OsO4; the oil turning black shows it worked', source: 'Published spill guidance' } },
  { cids: [70297 /* meta-Chloroperoxybenzoic acid */, 784 /* Hydrogen peroxide */, 6410 /* tert-Butyl hydroperoxide */, 7187 /* Benzoyl peroxide */, 31294 /* Carbamide Peroxide */], ready: { what: 'Sodium thiosulfate or sulfite solution', why: 'Quenches peroxides before workup or waste', source: 'Standard practice' } },
  { cids: [6497 /* Dimethyl sulfate */, 6163 /* Diethyl sulfate */, 6328 /* Iodomethane */, 9526 /* Methyl triflate */], ready: { what: 'Aqueous ammonia or NaOH to destroy spills and waste', why: 'Alkylating agents: destroy them, don\'t just dilute', source: 'HSDB' } },
  { cids: [9550 /* Diazomethane */, 167693 /* Trimethylsilyldiazomethane */], ready: { what: 'Acetic acid', why: 'Quenches excess diazo compound safely', source: 'Standard practice' } },
  { cids: [33557 /* Sodium azide */, 123414 /* Diphenylphosphoryl azide */, 78378 /* Trimethylsilyl azide */], ready: { what: 'Keep away from acid, DCM and metal drains; nitrous acid for waste', why: 'Forms HN3 or explosive metal azides', source: 'NOAA CAMEO' } },
  { cids: [6371 /* Phosgene */, 10426 /* Diphosgene */, 94429 /* Triphosgene */], ready: { what: 'Phosgene indicator badge; aqueous ammonia or NaOH for quenching', why: 'No reliable warning odor at harmful levels', source: 'CDC/NIOSH emergency response card' } },
  { cids: [23931 /* Mercury */, 11645 /* Dimethylmercury */], ready: { what: 'Mercury spill kit (sulfur or zinc powder)', why: 'Spilled droplets keep giving off vapor', source: 'NOAA CAMEO' } },
];

export interface Incident { what: string; source: string; url?: string }

/** Documented fatal or serious incidents, written from public reports (reviewed before adding). */
const INCIDENTS: Record<number, Incident> = {
  11645: { what: 'Fatal: a Dartmouth chemist died months after a few drops passed through her latex glove (1996–97)', source: 'Nierenberg et al., N. Engl. J. Med. 1998, 338, 1672', url: 'https://doi.org/10.1056/NEJM199806043382305' },
  167693: { what: 'Fatal: two chemists died after inhaling it, at Gelest (US, 2008) and in Canada (2008)', source: 'OSHA nomination to the US National Toxicology Program, 2011', url: 'https://ntp.niehs.nih.gov/sites/default/files/ntp/noms/support_docs/osha070511_tmsdnomination_508.pdf' },
  53628101: { what: 'Fatal: a UCLA research assistant died of burns when a syringe of t-BuLi came apart and ignited (2008)', source: 'Sheri Sangji case', url: 'https://en.wikipedia.org/wiki/Sheri_Sangji_case' },
  6371: { what: 'Fatal: a worker died after a phosgene hose ruptured at the DuPont Belle plant (2010)', source: 'US Chemical Safety Board report, 2011', url: 'https://www.csb.gov/dupont-belle-toxic-chemical-releases-/' },
};

/** Vapour pressure in mmHg from texts like "0.677 mm Hg at 25 °C", "65 Pa", "1.2 kPa", "1 atm". */
export function vpMmHg(text: string): number | null {
  const m = /(\d[\d,]*(?:\.\d+)?(?:\s*[xX×]\s*10\s*[-+−]?\d+|e[-+]?\d+)?)\s*(mm ?Hg|mmHg|torr|kPa|Pa|atm|bar|psi)\b/i.exec(text);
  if (!m) return null;
  let s = m[1].replace(/,/g, '').replace(/\s/g, '');
  const sci = /^([\d.]+)[xX×]10([-+−]?\d+)$/.exec(s);
  const v = sci ? Number(sci[1]) * 10 ** Number(sci[2].replace('−', '-')) : Number(s);
  const u = m[2].toLowerCase().replace(/\s/g, '');
  const f = u === 'mmhg' || u === 'torr' ? 1 : u === 'kpa' ? 7.50062 : u === 'pa' ? 0.00750062 : u === 'atm' ? 760 : u === 'bar' ? 750.062 : 51.7149;
  return Number.isFinite(v) ? v * f : null;
}

/** IDLH in ppm (mg/m3 converted with the molar mass at 25 °C), or null. */
export function idlhPpm(r: SafetyRecord): number | null {
  const i = r.idlh;
  if (!i || i.value === undefined) return null;
  if (i.unit === 'ppm') return i.value;
  return r.mw ? (i.value * 24.45) / r.mw : null;
}

/** How many times the IDLH the saturated vapour at room temperature is, or null. */
export function vapourRatio(r: SafetyRecord): number | null {
  const vp = r.vp ? vpMmHg(r.vp.text) : null;
  const ppm = idlhPpm(r);
  if (vp === null || !ppm) return null;
  // a gas (vapour pressure above 1 atm) is at most pure gas in the room
  return (Math.min(vp, 760) / 760) * 1e6 / ppm;
}

/** The lowest oral LD50 in mg/kg, or null. */
export function oralLd50(r: SafetyRecord): number | null {
  const v = r.lethal.filter((l) => l.kind === 'LD50' && l.route === 'oral').map((l) => { const u = l.unit.toLowerCase(); return u === 'g/kg' ? l.value * 1000 : u === 'ug/kg' ? l.value / 1000 : u === 'mg/kg' ? l.value : NaN; }).filter((n) => Number.isFinite(n));
  return v.length ? Math.min(...v) : null;
}

const has = (r: SafetyRecord, ...codes: string[]) => !!r.ghs?.codes.some((c) => codes.some((x) => c === x || c.startsWith(x + '+') || c.includes('+' + x)));
const alert = (r: SafetyRecord, re: RegExp) => r.alerts.some((a) => re.test(a));
const pyrophoric = (r: SafetyRecord) => has(r, 'H250') || PYROPHORIC.has(r.cid);
/** Saturated vapour at least this many times the IDLH: the compound can readily reach it in air. */
const REACHES_IDLH = 1000;

export interface Rating { tier: Tier | null; why: string[] }

/** Something an open source gave to rate a compound by (or it is on one of the lists above). */
function rateable(r: SafetyRecord): boolean {
  const cid = r.cid;
  return !!(r.idlh || r.lethal.some((l) => l.kind === 'LD50' || l.kind === 'LC50') || r.ghs?.codes.length || r.alerts.length || r.incompatible || TIER_1[cid] || TIER_2[cid] || TIER_4.has(cid) || WATER_REACTIVE.has(cid) || PYROPHORIC.has(cid) || NAMED[r.cid]);
}

/** The tier and the reasons for it, most important first. */
export function rate(r: SafetyRecord): Rating {
  const why1: string[] = [], why2: string[] = [];
  const cid = r.cid;
  const ppm = idlhPpm(r);
  const vp = r.vp ? vpMmHg(r.vp.text) : null;
  const ratio = vapourRatio(r);
  // an IDLH counts in full only when the saturated vapour reaches it many times over: dusts, mists
  // and liquids that hardly evaporate (NaOH, H2SO4, iodine) can't fill a room the way OsO4 can
  const airborne = ratio !== null && ratio >= REACHES_IDLH;
  const nonVolatile = vp !== null && vp < 0.01;
  if (TIER_1[cid]) why1.push(TIER_1[cid]);
  if (ppm !== null && ppm <= 10 && airborne) why1.push(`IDLH ${fmtIdlh(r)}; saturated vapor ${Math.round(ratio!).toLocaleString('en-US')} × IDLH`);
  if (has(r, 'H330') && !nonVolatile) why1.push('Fatal if inhaled (H330, harmonized)');
  if (has(r, 'H310')) why1.push('Fatal in contact with skin (H310, harmonized)');
  if (why1.length) return { tier: 1, why: [...new Set(why1)] };
  if (TIER_2[cid]) why2.push(TIER_2[cid]);
  if (NAMED[r.cid]?.tier === 2) why2.push(NAMED[r.cid].why);
  // an IDLH in mg/m3 for a solid or mist that doesn't evaporate is about dust, not vapour: left out
  const dust = r.idlh?.unit === 'mg/m3' && (vp === null || nonVolatile);
  if (ppm !== null && ppm <= 10 && !dust) why2.push(`IDLH ${fmtIdlh(r)}, but ${vp === null ? 'how volatile it is isn\'t known' : 'it evaporates slowly'}`);
  else if (ppm !== null && ppm <= 100 && airborne) why2.push(`IDLH ${fmtIdlh(r)}; saturated vapor ${Math.round(ratio!).toLocaleString('en-US')} × IDLH`);
  if (has(r, 'H330') && nonVolatile) why2.push('Fatal if inhaled as dust or mist (H330, harmonized)');
  const ld = oralLd50(r);
  if (ld !== null && ld <= 50) why2.push(`Oral LD50 ${sig3(ld)} mg/kg`);
  if (has(r, 'H300')) why2.push('Fatal if swallowed (H300, harmonized)');
  if (has(r, 'H340', 'H350') && (vp === null || vp >= 1)) why2.push('Carcinogen or mutagen 1A/1B (harmonized), volatile');
  if (pyrophoric(r) && !why2.some((w) => /pyrophoric/i.test(w))) why2.push('Pyrophoric');
  if (has(r, 'H200', 'H201', 'H202', 'H203', 'H204', 'H240', 'H241') || alert(r, /\bexplosive\b/i)) why2.push('Explosive or shock-sensitive');
  if (why2.length) return { tier: 2, why: [...new Set(why2)] };
  if (TIER_4.has(cid)) return { tier: 4, why: ['Little hazard beyond normal care'] };
  if (!rateable(r)) return { tier: null, why: ['Not rated: the open sources give no hazard data for it. Read the SDS'] };
  const why3: string[] = NAMED[r.cid] ? [NAMED[r.cid].why] : [];
  if (has(r, 'H224', 'H225')) why3.push('Highly flammable');
  if (has(r, 'H314')) why3.push('Corrosive');
  if ((has(r, 'H260', 'H261') || WATER_REACTIVE.has(cid)) && !NAMED[r.cid]?.water) why3.push('Reacts with water');
  // what the harmonised classification says beyond the numbers, so a Tier 3 row never reads as harmless
  if (has(r, 'H340', 'H350')) why3.push('Carcinogen or mutagen 1A/1B (harmonized), not volatile');
  if (has(r, 'H360')) why3.push('May damage fertility or the unborn child (H360, harmonized)');
  if (has(r, 'H301', 'H311', 'H331')) why3.push('Toxic (acute category 3, harmonized)');
  if (has(r, 'H370', 'H372')) why3.push('Damages organs (H370/H372, harmonized)');
  if (has(r, 'H334')) why3.push('Respiratory sensitizer');
  if (has(r, 'H351')) why3.push('Suspected carcinogen only');
  return { tier: 3, why: why3.length ? why3 : ['Standard handling: hood, gloves, goggles'] };
}

const sig3 = (n: number) => Number(n.toPrecision(3)).toLocaleString('en-US');

export function fmtIdlh(r: SafetyRecord): string {
  const i = r.idlh;
  if (!i) return '';
  if (i.value === undefined) return i.text === 'N.D.' ? 'None set' : i.ca ? 'None set (Ca)' : i.text ?? '';
  return `${i.value.toLocaleString('en-US')} ${i.unit}${i.as ? ` (as ${i.as})` : ''}`;
}

/** Badges beside the tier: bench-specific warnings. */
export function badges(r: SafetyRecord): string[] {
  const cid = r.cid;
  const out: string[] = [];
  if (r.skin) out.push('Skin');
  if (NO_WARNING.has(cid)) out.push('No warning');
  if (PEROXIDE.has(cid) || alert(r, /peroxid/i)) out.push('Peroxide former');
  if (pyrophoric(r)) out.push('Pyrophoric');
  if (has(r, 'H260', 'H261', 'EUH014') || alert(r, /water-reactive/i) || WATER_REACTIVE.has(cid) || NAMED[r.cid]?.water) out.push('Water-reactive');
  if (has(r, 'H200', 'H201', 'H202', 'H203', 'H240', 'H241') || alert(r, /\bexplosive\b/i)) out.push('Explosive');
  if (has(r, 'H271', 'H272') || alert(r, /strong oxidizing/i)) out.push('Oxidizer');
  if (has(r, 'H350', 'H340')) out.push('Carcinogen 1A/1B');
  return out;
}

export function haveReady(r: SafetyRecord): HaveReady | null {
  return HAVE_READY.find((h) => h.cids.includes(r.cid))?.ready ?? null;
}

export function incident(r: SafetyRecord): Incident | null {
  return INCIDENTS[r.cid] ?? null;
}

const ROUTE_ORDER = ['oral', 'dermal', 'inhalation', 'ip', 'iv', 'sc'];

/** The lowest LD50 (or LC50) for each route reported, with species: "rat 440 mg/kg". */
export function lethalByRoute(r: SafetyRecord): Partial<Record<Lethal['route'], string>> {
  const out: Partial<Record<Lethal['route'], string>> = {};
  const best = new Map<string, Lethal>();
  for (const l of r.lethal) {
    if (l.kind !== 'LD50' && l.kind !== 'LC50') continue;
    const cur = best.get(l.route);
    // a lower dose in the same unit wins; otherwise keep the first (a rat value, as HSDB lists it)
    if (!cur || (cur.unit.toLowerCase() === l.unit.toLowerCase() && l.value < cur.value)) best.set(l.route, l);
  }
  for (const route of ROUTE_ORDER) {
    const l = best.get(route);
    if (!l) continue;
    // doses in mg/kg whatever unit the record used
    const unit = l.unit.toLowerCase();
    const [v, u] = unit === 'g/kg' ? [l.value * 1000, 'mg/kg'] : unit === 'ug/kg' ? [l.value / 1000, 'mg/kg'] : unit === 'mg/kg' ? [l.value, 'mg/kg'] : [l.value, l.unit];
    out[route as Lethal['route']] = `${l.species.replace(/^rats$/, 'rat').replace(/^mice$/, 'mouse')} ${sig3(v)} ${u}${l.time ? ' / ' + l.time : ''}`;
  }
  return out;
}

/** The first number in a log Kow text ("log Kow = 0.46", "Log Kow= -0.31"). */
export function logKowOf(r: SafetyRecord): { value: number; source: string } | null {
  const m = r.logKow ? /(-?\d+(?:\.\d+)?)/.exec(r.logKow.text.replace(/^.*?(?:kow|log p)\s*[=:]?\s*/i, '')) : null;
  if (m) return { value: Number(m[1]), source: r.logKow!.source };
  return typeof r.xlogp === 'number' ? { value: r.xlogp, source: 'XLogP3 (computed)' } : null;
}

/**
 * How fast the compound crosses skin from water, estimated by the Potts–Guy equation
 * (Pharm. Res. 1992, 9, 663): log Kp (cm/h) = −2.72 + 0.71 log Kow − 0.0061 MW. Only for neutral
 * organic molecules up to 500 g/mol; salts, metals and ions get none. A rough guide to which
 * compounds go through skin quickly, never a substitute for the skin notation or glove data.
 */
export function skinKp(r: SafetyRecord): { kp: number; band: 'high' | 'moderate' | 'low'; source: string } | null {
  if (!r.smiles || !r.mw || r.mw > 500 || /\.|[+-]\]|\[(?:Li|Na|K|Mg|Zn|Al|Cu|Pd|Hg|Tl|Ni|Co|Cs|Ca|Sn|Ti|B|Si|Os|Ru|Cr|Mn|Pb|Ag|Se|Ce)/.test(r.smiles) || !/C|c/.test(r.smiles)) return null;
  const k = logKowOf(r);
  if (!k) return null;
  const kp = 10 ** (-2.72 + 0.71 * k.value - 0.0061 * r.mw);
  return { kp, band: kp >= 1e-2 ? 'high' : kp >= 1e-3 ? 'moderate' : 'low', source: k.source };
}
