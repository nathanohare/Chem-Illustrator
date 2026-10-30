// What the Analysis panel works out besides formula and masses: the isotope pattern of an ion,
// elemental analysis, and estimated boiling and melting points.
//
// Sources:
// - Isotope masses and abundances: NIST, "Atomic Weights and Isotopic Compositions for All
//   Elements" (masses from the 2016 Atomic Mass Evaluation, abundances as IUPAC's
//   "representative isotopic compositions").
// - Boiling and melting points: K. G. Joback and R. C. Reid, "Estimation of pure-component
//   properties from group-contributions", Chem. Eng. Commun. 1987, 57, 233–243.
//   Tb = 198 + Σ(Tb groups) K and Tm = 122.5 + Σ(Tm groups) K. The method is rough (its authors give
//   an average error of about 13 K for Tb and 23 K for Tm, worse for large molecules), so the
//   panel calls these estimates.

import { ALIASES, ELECTRON, type Adduct } from './hrms';

/** Element counts of a neutral formula such as C9H8O4, CH2Cl2, C2H5D or an adduct's NH4. */
export function formulaCounts(formula: string): Map<string, number> | null {
  const f = ALIASES[formula] ?? formula;
  const counts = new Map<string, number>();
  const re = /([A-Z][a-z]?)(\d*)/g;
  let pos = 0;
  for (let g; (g = re.exec(f)); ) {
    if (g.index !== pos || !g[0]) return null;
    pos = g.index + g[0].length;
    counts.set(g[1], (counts.get(g[1]) ?? 0) + (g[2] ? Number(g[2]) : 1));
  }
  return pos === f.length && f.length > 0 ? counts : null;
}

/** The elements of an ion such as [M+Na]+ of a molecule with these counts. Null when an adduct takes away more than there is. */
export function ionCounts(mol: Map<string, number>, adduct: Adduct): Map<string, number> | null {
  const out = new Map<string, number>();
  for (const [el, n] of mol) out.set(el, n * adduct.n);
  for (const p of adduct.parts) {
    const c = formulaCounts(p.formula);
    if (!c) return null;
    for (const [el, n] of c) out.set(el, (out.get(el) ?? 0) + p.sign * p.count * n);
  }
  for (const [el, n] of out) {
    if (n < 0) return null;
    if (n === 0) out.delete(el);
  }
  return out;
}

/**
 * Isotopes of every element that has a representative isotopic composition (all but those with
 * no stable isotope, such as Tc, Pm and Po), with D as its own element: [mass (u), abundance (%)].
 */
export const ISOTOPES: Record<string, [number, number][]> = {
  H: [[1.00782503223, 99.9885], [2.01410177812, 0.0115]],
  D: [[2.01410177812, 100]],
  He: [[3.0160293201, 0.000134], [4.00260325413, 99.999866]],
  Li: [[6.0151228874, 7.59], [7.0160034366, 92.41]],
  Be: [[9.012183065, 100]],
  B: [[10.01293695, 19.9], [11.00930536, 80.1]],
  C: [[12, 98.93], [13.00335483507, 1.07]],
  N: [[14.00307400443, 99.636], [15.00010889888, 0.364]],
  O: [[15.99491461957, 99.757], [16.9991317565, 0.038], [17.99915961286, 0.205]],
  F: [[18.99840316273, 100]],
  Ne: [[19.9924401762, 90.48], [20.993846685, 0.27], [21.991385114, 9.25]],
  Na: [[22.989769282, 100]],
  Mg: [[23.985041697, 78.99], [24.985836976, 10], [25.982592968, 11.01]],
  Al: [[26.98153853, 100]],
  Si: [[27.97692653465, 92.223], [28.9764946649, 4.685], [29.973770136, 3.092]],
  P: [[30.97376199842, 100]],
  S: [[31.9720711744, 94.99], [32.9714589098, 0.75], [33.967867004, 4.25], [35.96708071, 0.01]],
  Cl: [[34.968852682, 75.76], [36.965902602, 24.24]],
  Ar: [[35.967545105, 0.3336], [37.96273211, 0.0629], [39.9623831237, 99.6035]],
  K: [[38.9637064864, 93.2581], [39.963998166, 0.0117], [40.9618252579, 6.7302]],
  Ca: [[39.962590863, 96.941], [41.95861783, 0.647], [42.95876644, 0.135], [43.95548156, 2.086], [45.953689, 0.004], [47.95252276, 0.187]],
  Sc: [[44.95590828, 100]],
  Ti: [[45.95262772, 8.25], [46.95175879, 7.44], [47.94794198, 73.72], [48.94786568, 5.41], [49.94478689, 5.18]],
  V: [[49.94715601, 0.25], [50.94395704, 99.75]],
  Cr: [[49.94604183, 4.345], [51.94050623, 83.789], [52.94064815, 9.501], [53.93887916, 2.365]],
  Mn: [[54.93804391, 100]],
  Fe: [[53.93960899, 5.845], [55.93493633, 91.754], [56.93539284, 2.119], [57.93327443, 0.282]],
  Co: [[58.93319429, 100]],
  Ni: [[57.93534241, 68.077], [59.93078588, 26.223], [60.93105557, 1.1399], [61.92834537, 3.6346], [63.92796682, 0.9255]],
  Cu: [[62.92959772, 69.15], [64.9277897, 30.85]],
  Zn: [[63.92914201, 49.17], [65.92603381, 27.73], [66.92712775, 4.04], [67.92484455, 18.45], [69.9253192, 0.61]],
  Ga: [[68.9255735, 60.108], [70.92470258, 39.892]],
  Ge: [[69.92424875, 20.57], [71.922075826, 27.45], [72.923458956, 7.75], [73.921177761, 36.5], [75.921402726, 7.73]],
  As: [[74.92159457, 100]],
  Se: [[73.922475934, 0.89], [75.919213704, 9.37], [76.919914154, 7.63], [77.91730928, 23.77], [79.9165218, 49.61], [81.9166995, 8.73]],
  Br: [[78.9183376, 50.69], [80.9162897, 49.31]],
  Kr: [[77.92036494, 0.355], [79.91637808, 2.286], [81.91348273, 11.593], [82.91412716, 11.5], [83.9114977282, 56.987], [85.9106106269, 17.279]],
  Rb: [[84.9117897379, 72.17], [86.909180531, 27.83]],
  Sr: [[83.9134191, 0.56], [85.9092606, 9.86], [86.9088775, 7], [87.9056125, 82.58]],
  Y: [[88.9058403, 100]],
  Zr: [[89.9046977, 51.45], [90.9056396, 11.22], [91.9050347, 17.15], [93.9063108, 17.38], [95.9082714, 2.8]],
  Nb: [[92.906373, 100]],
  Mo: [[91.90680796, 14.53], [93.9050849, 9.15], [94.90583877, 15.84], [95.90467612, 16.67], [96.90601812, 9.6], [97.90540482, 24.39], [99.9074718, 9.82]],
  Ru: [[95.90759025, 5.54], [97.9052868, 1.87], [98.9059341, 12.76], [99.9042143, 12.6], [100.9055769, 17.06], [101.9043441, 31.55], [103.9054275, 18.62]],
  Rh: [[102.905498, 100]],
  Pd: [[101.9056022, 1.02], [103.9040305, 11.14], [104.9050796, 22.33], [105.9034804, 27.33], [107.9038916, 26.46], [109.9051722, 11.72]],
  Ag: [[106.9050916, 51.839], [108.9047553, 48.161]],
  Cd: [[105.9064599, 1.25], [107.9041834, 0.89], [109.90300661, 12.49], [110.90418287, 12.8], [111.90276287, 24.13], [112.90440813, 12.22], [113.90336509, 28.73], [115.90476315, 7.49]],
  In: [[112.90406184, 4.29], [114.903878776, 95.71]],
  Sn: [[111.90482387, 0.97], [113.9027827, 0.66], [114.903344699, 0.34], [115.9017428, 14.54], [116.90295398, 7.68], [117.90160657, 24.22], [118.90331117, 8.59], [119.90220163, 32.58], [121.9034438, 4.63], [123.9052766, 5.79]],
  Sb: [[120.903812, 57.21], [122.9042132, 42.79]],
  Te: [[119.9040593, 0.09], [121.9030435, 2.55], [122.9042698, 0.89], [123.9028171, 4.74], [124.9044299, 7.07], [125.9033109, 18.84], [127.90446128, 31.74], [129.906222748, 34.08]],
  I: [[126.9044719, 100]],
  Xe: [[123.905892, 0.0952], [125.9042983, 0.089], [127.903531, 1.9102], [128.9047808611, 26.4006], [129.903509349, 4.071], [130.90508406, 21.2324], [131.9041550856, 26.9086], [133.90539466, 10.4357], [135.907214484, 8.8573]],
  Cs: [[132.905451961, 100]],
  Ba: [[129.9063207, 0.106], [131.9050611, 0.101], [133.90450818, 2.417], [134.90568838, 6.592], [135.90457573, 7.854], [136.90582714, 11.232], [137.905247, 71.698]],
  La: [[137.9071149, 0.08881], [138.9063563, 99.91119]],
  Ce: [[135.90712921, 0.185], [137.905991, 0.251], [139.9054431, 88.45], [141.9092504, 11.114]],
  Pr: [[140.9076576, 100]],
  Nd: [[141.907729, 27.152], [142.90982, 12.174], [143.910093, 23.798], [144.9125793, 8.293], [145.9131226, 17.189], [147.9168993, 5.756], [149.9209022, 5.638]],
  Sm: [[143.9120065, 3.07], [146.9149044, 14.99], [147.9148292, 11.24], [148.9171921, 13.82], [149.9172829, 7.38], [151.9197397, 26.75], [153.9222169, 22.75]],
  Eu: [[150.9198578, 47.81], [152.921238, 52.19]],
  Gd: [[151.9197995, 0.2], [153.9208741, 2.18], [154.9226305, 14.8], [155.9221312, 20.47], [156.9239686, 15.65], [157.9241123, 24.84], [159.9270624, 21.86]],
  Tb: [[158.9253547, 100]],
  Dy: [[155.9242847, 0.056], [157.9244159, 0.095], [159.9252046, 2.329], [160.9269405, 18.889], [161.9268056, 25.475], [162.9287383, 24.896], [163.9291819, 28.26]],
  Ho: [[164.9303288, 100]],
  Er: [[161.9287884, 0.139], [163.9292088, 1.601], [165.9302995, 33.503], [166.9320546, 22.869], [167.9323767, 26.978], [169.9354702, 14.91]],
  Tm: [[168.9342179, 100]],
  Yb: [[167.9338896, 0.123], [169.9347664, 2.982], [170.9363302, 14.09], [171.9363859, 21.68], [172.9382151, 16.103], [173.9388664, 32.026], [175.9425764, 12.996]],
  Lu: [[174.9407752, 97.401], [175.9426897, 2.599]],
  Hf: [[173.9400461, 0.16], [175.9414076, 5.26], [176.9432277, 18.6], [177.9437058, 27.28], [178.9458232, 13.62], [179.946557, 35.08]],
  Ta: [[179.9474648, 0.01201], [180.9479958, 99.98799]],
  W: [[179.9467108, 0.12], [181.94820394, 26.5], [182.95022275, 14.31], [183.95093092, 30.64], [185.9543628, 28.43]],
  Re: [[184.9529545, 37.4], [186.9557501, 62.6]],
  Os: [[183.9524885, 0.02], [185.953835, 1.59], [186.9557474, 1.96], [187.9558352, 13.24], [188.9581442, 16.15], [189.9584437, 26.26], [191.961477, 40.78]],
  Ir: [[190.9605893, 37.3], [192.9629216, 62.7]],
  Pt: [[189.9599297, 0.012], [191.9610387, 0.782], [193.9626809, 32.86], [194.9647917, 33.78], [195.96495209, 25.21], [197.9678949, 7.356]],
  Au: [[196.96656879, 100]],
  Hg: [[195.9658326, 0.15], [197.9667686, 9.97], [198.96828064, 16.87], [199.96832659, 23.1], [200.97030284, 13.18], [201.9706434, 29.86], [203.97349398, 6.87]],
  Tl: [[202.9723446, 29.52], [204.9744278, 70.48]],
  Pb: [[203.973044, 1.4], [205.9744657, 24.1], [206.9758973, 22.1], [207.9766525, 52.4]],
  Bi: [[208.9803991, 100]],
  Th: [[232.0380558, 100]],
  Pa: [[231.0358842, 100]],
  U: [[234.0409523, 0.0054], [235.0439301, 0.7204], [238.0507884, 99.2742]],
};

/**
 * A distribution by nominal mass: entry k holds the isotopologues k mass units above the
 * lightest (their summed probability `p`, and `pm`, the sum of probability times mass, so
 * their mean mass is pm / p). This is exactly what the pattern shows (M, M+1, M+2…, each at
 * its mean m/z), and it stays a few hundred numbers long even for a protein, where keeping
 * every isotopologue apart took seconds.
 */
interface Nominal { p: Float64Array; pm: Float64Array }

/** Entries weaker than this fraction of the strongest are dropped from the ends. */
const PRUNE = 1e-12;

function convolve(a: Nominal, b: Nominal): Nominal {
  const n = a.p.length + b.p.length - 1;
  const p = new Float64Array(n), pm = new Float64Array(n);
  for (let i = 0; i < a.p.length; i++) {
    const ap = a.p[i], apm = a.pm[i];
    if (!ap) continue;
    for (let j = 0; j < b.p.length; j++) {
      const bp = b.p[j];
      if (!bp) continue;
      p[i + j] += ap * bp;
      // the mean mass of a sum is the sum of the means: Σ pa·pb·(ma + mb)
      pm[i + j] += apm * bp + ap * b.pm[j];
    }
  }
  return trim({ p, pm });
}

/** Drop the negligible ends (keeping index 0, the lightest, as the reference). */
function trim(d: Nominal): Nominal {
  let max = 0;
  for (const x of d.p) if (x > max) max = x;
  let end = d.p.length;
  while (end > 1 && d.p[end - 1] < max * PRUNE) end--;
  for (let i = 0; i < end; i++) if (d.p[i] < max * PRUNE) { d.p[i] = 0; d.pm[i] = 0; }
  return end === d.p.length ? d : { p: d.p.slice(0, end), pm: d.pm.slice(0, end) };
}

/** One atom of an element, by nominal mass above its lightest isotope. */
function atomOf(iso: [number, number][]): Nominal {
  const light = Math.min(...iso.map(([m]) => m));
  const n = Math.max(...iso.map(([m]) => Math.round(m - light))) + 1;
  const p = new Float64Array(n), pm = new Float64Array(n);
  for (const [m, a] of iso) {
    const k = Math.round(m - light);
    p[k] += a / 100;
    pm[k] += (a / 100) * m;
  }
  return { p, pm };
}

/** The distribution of n atoms of one element, by repeated squaring. */
function elementPeaks(iso: [number, number][], n: number): Nominal {
  let result: Nominal = { p: Float64Array.of(1), pm: Float64Array.of(0) };
  let base = atomOf(iso);
  for (let k = n; k > 0; k >>= 1) {
    if (k & 1) result = convolve(result, base);
    if (k > 1) base = convolve(base, base);
  }
  return result;
}

export interface IsotopePeak {
  /** m/z, the intensity-weighted mean of the isotopologues that make up this peak. */
  mz: number;
  /** Height relative to the tallest peak, in % (the tallest is 100). */
  rel: number;
}

/** Patterns already worked out (the Analysis panel asks again on every change). */
const patterns = new Map<string, IsotopePeak[] | null>();

/**
 * The isotope pattern of an ion with these element counts and charge z, as a mass spectrometer
 * shows it: isotopologues one mass unit apart are summed into one peak (M, M+1, M+2…), at their
 * mean m/z. Peaks below `min` % of the tallest are left out. Null when an element is not in the table.
 */
export function isotopePattern(counts: Map<string, number>, z: number, min = 0.1): IsotopePeak[] | null {
  const key = `${[...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([e, n]) => e + n).join('')}|${z}`;
  let all = patterns.get(key);
  if (all === undefined) {
    all = computePattern(counts, z);
    if (patterns.size > 200) patterns.clear();
    patterns.set(key, all);
  }
  return all && all.filter((g) => g.rel >= min);
}

function computePattern(counts: Map<string, number>, z: number): IsotopePeak[] | null {
  let d: Nominal = { p: Float64Array.of(1), pm: Float64Array.of(0) };
  for (const [el, n] of counts) {
    const iso = ISOTOPES[el];
    if (!iso) return null;
    if (n > 0) d = convolve(d, elementPeaks(iso, n));
  }
  if (!z) z = 1;
  let max = 0;
  for (const x of d.p) if (x > max) max = x;
  const out: IsotopePeak[] = [];
  for (let k = 0; k < d.p.length; k++) {
    if (!d.p[k]) continue;
    const m = d.pm[k] / d.p[k];
    out.push({ mz: (m - z * ELECTRON) / Math.abs(z), rel: (100 * d.p[k]) / max });
  }
  return out;
}

/**
 * Elemental analysis: each element's share of the mass, in %, from the element counts and the
 * standard atomic weights (as the chemistry engine uses them). Hill order, as journals list it (C, H, N…).
 */
export function elementalAnalysis(counts: Map<string, number>, weights: Record<string, number>): { el: string; pct: number }[] | null {
  let total = 0;
  for (const [el, n] of counts) {
    const w = weights[el];
    if (w === undefined) return null;
    total += n * w;
  }
  if (!total) return null;
  const els = [...counts.keys()];
  const hasC = counts.has('C');
  const rank = (s: string) => (hasC ? (s === 'C' ? 0 : s === 'H' ? 1 : s === 'D' ? 1.5 : s === 'N' ? 2 : 3) : 0);
  els.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return els.map((el) => ({ el, pct: (100 * counts.get(el)! * weights[el]) / total }));
}

// ---------------------------------------------------------------- Joback estimates

/**
 * Joback and Reid's groups (Chem. Eng. Commun. 1987, 57, 233), each contribution in the order of
 * `JOBACK_KEYS`: critical temperature, pressure (bar) and volume (cm³/mol), boiling and melting
 * points (K), enthalpy and Gibbs energy of formation of the ideal gas at 298 K (kJ/mol), the four
 * heat capacity coefficients (J/mol·K), and enthalpies of fusion and vaporisation (kJ/mol). Null
 * where the paper gives no value.
 */
export const JOBACK: Record<string, (number | null)[]> = {
  '-CH3': [0.0141, -0.0012, 65.0, 23.58, -5.1, -76.45, -43.96, 19.5, -0.00808, 0.000153, -9.67e-08, 0.908, 2.373],
  '-CH2-': [0.0189, 0.0, 56.0, 22.88, 11.27, -20.64, 8.42, -0.909, 0.095, -5.44e-05, 1.19e-08, 2.59, 2.226],
  '>CH-': [0.0164, 0.002, 41.0, 21.74, 12.64, 29.89, 58.36, -23.0, 0.204, -0.000265, 1.2e-07, 0.749, 1.691],
  '>C<': [0.0067, 0.0043, 27.0, 18.25, 46.43, 82.23, 116.02, -66.2, 0.427, -0.000641, 3.01e-07, -1.46, 0.636],
  '=CH2': [0.0113, -0.0028, 56.0, 18.18, -4.32, -9.63, 3.77, 23.6, -0.0381, 0.000172, -1.03e-07, -0.473, 1.724],
  '=CH-': [0.0129, -0.0006, 46.0, 24.96, 8.73, 37.97, 48.53, -8.0, 0.105, -9.63e-05, 3.56e-08, 2.691, 2.205],
  '=C<': [0.0117, 0.0011, 38.0, 24.14, 11.14, 83.99, 92.36, -28.1, 0.208, -0.000306, 1.46e-07, 3.063, 2.138],
  '=C=': [0.0026, 0.0028, 36.0, 26.15, 17.78, 142.14, 136.7, 27.4, -0.0557, 0.000101, -5.02e-08, 4.72, 2.661],
  '≡CH': [0.0027, -0.0008, 46.0, 9.2, -11.18, 79.3, 77.71, 24.5, -0.0271, 0.000111, -6.78e-08, 2.322, 1.155],
  '≡C-': [0.002, 0.0016, 37.0, 27.38, 64.32, 115.51, 109.82, 7.87, 0.0201, -8.33e-06, 1.39e-09, 4.151, 3.302],
  '-CH2- (ring)': [0.01, 0.0025, 48.0, 27.15, 7.75, -26.8, -3.68, -6.03, 0.0854, -8e-06, -1.8e-08, 0.49, 2.398],
  '>CH- (ring)': [0.0122, 0.0004, 38.0, 21.78, 19.88, 8.67, 40.99, -20.5, 0.162, -0.00016, 6.24e-08, 3.243, 1.942],
  '>C< (ring)': [0.0042, 0.0061, 27.0, 21.32, 60.15, 79.72, 87.88, -90.9, 0.557, -0.0009, 4.69e-07, -1.373, 0.644],
  '=CH- (ring)': [0.0082, 0.0011, 41.0, 26.73, 8.13, 2.09, 11.3, -2.14, 0.0574, -1.64e-06, -1.59e-08, 1.101, 2.544],
  '=C< (ring)': [0.0143, 0.0008, 32.0, 31.01, 37.02, 46.43, 54.05, -8.25, 0.101, -0.000142, 6.78e-08, 2.394, 3.059],
  '-F': [0.0111, -0.0057, 27.0, -0.03, -15.78, -251.92, -247.19, 26.5, -0.0913, 0.000191, -1.03e-07, 1.398, -0.67],
  '-Cl': [0.0105, -0.0049, 58.0, 38.13, 13.55, -71.55, -64.31, 33.3, -0.0963, 0.000187, -9.96e-08, 2.515, 4.532],
  '-Br': [0.0133, 0.0057, 71.0, 66.86, 43.43, -29.48, -38.06, 28.6, -0.0649, 0.000136, -7.45e-08, 3.603, 6.582],
  '-I': [0.0068, -0.0034, 97.0, 93.84, 41.69, 21.06, 5.74, 32.1, -0.0641, 0.000126, -6.87e-08, 2.724, 9.52],
  '-OH (alcohol)': [0.0741, 0.0112, 28.0, 92.88, 44.45, -208.04, -189.2, 25.7, -0.0691, 0.000177, -9.88e-08, 2.406, 16.826],
  '-OH (phenol)': [0.024, 0.0184, -25.0, 76.34, 82.83, -221.65, -197.37, -2.81, 0.111, -0.000116, 4.94e-08, 4.49, 12.499],
  '-O-': [0.0168, 0.0015, 18.0, 22.42, 22.23, -132.22, -105.0, 25.5, -0.0632, 0.000111, -5.48e-08, 1.188, 2.41],
  '-O- (ring)': [0.0098, 0.0048, 13.0, 31.22, 23.05, -138.16, -98.22, 12.2, -0.0126, 6.03e-05, -3.86e-08, 5.879, 4.682],
  '>C=O': [0.038, 0.0031, 62.0, 76.75, 61.2, -133.22, -120.5, 6.45, 0.067, -3.57e-05, 2.86e-09, 4.189, 8.972],
  '>C=O (ring)': [0.0284, 0.0028, 55.0, 94.97, 75.97, -164.5, -126.27, 30.4, -0.0829, 0.000236, -1.31e-07, 0.0, 6.645],
  'O=CH- (aldehyde)': [0.0379, 0.003, 82.0, 72.24, 36.9, -162.03, -143.48, 30.9, -0.0336, 0.00016, -9.88e-08, 3.197, 9.093],
  '-COOH': [0.0791, 0.0077, 89.0, 169.09, 155.5, -426.72, -387.87, 24.1, 0.0427, 8.04e-05, -6.87e-08, 11.051, 19.537],
  '-COO- (ester)': [0.0481, 0.0005, 82.0, 81.1, 53.6, -337.92, -301.95, 24.5, 0.0402, 4.02e-05, -4.52e-08, 6.959, 9.633],
  '=O (other)': [0.0143, 0.0101, 36.0, -10.5, 2.08, -247.61, -250.83, 6.82, 0.0196, 1.27e-05, -1.78e-08, 3.624, 5.909],
  '-NH2': [0.0243, 0.0109, 38.0, 73.23, 66.89, -22.02, 14.07, 26.9, -0.0412, 0.000164, -9.76e-08, 3.515, 10.788],
  '>NH': [0.0295, 0.0077, 35.0, 50.17, 52.66, 53.47, 89.39, -1.21, 0.0762, -4.86e-05, 1.05e-08, 5.099, 6.436],
  '>NH (ring)': [0.013, 0.0114, 29.0, 52.82, 101.51, 31.65, 75.61, 11.8, -0.023, 0.000107, -6.28e-08, 7.49, 6.93],
  '>N-': [0.0169, 0.0074, 9.0, 11.74, 48.84, 123.34, 163.16, -31.1, 0.227, -0.00032, 1.46e-07, 4.703, 1.896],
  '-N=': [0.0255, -0.0099, null, 74.6, null, 23.61, null, null, null, null, null, null, 3.335],
  '-N= (ring)': [0.0085, 0.0076, 34.0, 57.55, 68.4, 55.52, 79.93, 8.83, -0.00384, 4.35e-05, -2.6e-08, 3.649, 6.528],
  '=NH': [null, null, null, 83.08, 68.91, 93.7, 119.66, 5.69, -0.00412, 0.000128, -8.88e-08, null, 12.169],
  '-CN': [0.0496, -0.0101, 91.0, 125.66, 59.89, 88.43, 89.22, 36.5, -0.0733, 0.000184, -1.03e-07, 2.414, 12.851],
  '-NO2': [0.0437, 0.0064, 91.0, 152.54, 127.24, -66.57, -16.83, 25.9, -0.00374, 0.000129, -8.88e-08, 9.679, 16.738],
  '-SH': [0.0031, 0.0084, 63.0, 63.56, 20.09, -17.33, -22.99, 35.3, -0.0758, 0.000185, -1.03e-07, 2.36, 6.884],
  '-S-': [0.0119, 0.0049, 54.0, 68.78, 34.4, 41.87, 33.12, 19.6, -0.00561, 4.02e-05, -2.76e-08, 4.13, 6.817],
  '-S- (ring)': [0.0019, 0.0051, 38.0, 52.1, 79.93, 39.1, 27.76, 16.7, 0.00481, 2.77e-05, -2.11e-08, 1.557, 5.984],
};

export const JOBACK_KEYS = ['tc', 'pc', 'vc', 'tb', 'tm', 'hf', 'gf', 'cpa', 'cpb', 'cpc', 'cpd', 'hfus', 'hvap'] as const;

export interface JobackResult {
  /** Normal boiling point, K (null when a group can't be assigned). */
  tb: number | null;
  /** Melting point, K (null when a group can't be assigned or has no Tm value). */
  tm: number | null;
  /** Critical temperature (K), pressure (bar) and volume (cm³/mol). */
  tc?: number | null;
  pc?: number | null;
  vc?: number | null;
  /** Enthalpy and Gibbs energy of formation of the ideal gas at 298 K, kJ/mol. */
  hf?: number | null;
  gf?: number | null;
  /** Heat capacity of the ideal gas at 298 K, J/(mol·K). */
  cp?: number | null;
  /** Enthalpy of vaporisation at the boiling point and of fusion, kJ/mol. */
  hvap?: number | null;
  hfus?: number | null;
  /** How many of each group were counted. */
  groups: Record<string, number>;
  /** Why there is no estimate, in plain words. */
  missing?: string;
}

/** A molecule as RDKit's JSON gives it (commonchem), the parts used here. */
interface JsonMol {
  atoms: { z?: number; impHs?: number; chg?: number }[];
  bonds: { bo?: number; atoms: [number, number] }[];
  extensions?: { name: string; aromaticAtoms?: number[]; atomRings?: number[][] }[];
}

const SYM: Record<number, string> = { 6: 'C', 7: 'N', 8: 'O', 9: 'F', 16: 'S', 17: 'Cl', 35: 'Br', 53: 'I' };

/**
 * Joback and Reid's estimated boiling and melting points for a molecule given as RDKit JSON.
 * Each heavy atom is put in one group (carbonyls, acids, esters, nitriles and nitro groups take
 * their O and N with them); a molecule with an atom no group fits gets no estimate.
 */
export function joback(json: string): JobackResult {
  const j = JSON.parse(json);
  const defs = j.defaults ?? {};
  const mol: JsonMol = j.molecules[0];
  const n = mol.atoms.length;
  const z = mol.atoms.map((a) => a.z ?? defs.atom?.z ?? 6);
  const hs = mol.atoms.map((a) => a.impHs ?? defs.atom?.impHs ?? 0);
  const chg = mol.atoms.map((a) => a.chg ?? defs.atom?.chg ?? 0);
  const ext = mol.extensions?.find((e) => e.name === 'rdkitRepresentation');
  const arom = new Set(ext?.aromaticAtoms ?? []);
  const inRing = new Set((ext?.atomRings ?? []).flat());
  // neighbours as [atom, bond order], explicit H atoms folded into their atom's H count
  const nb: [number, number][][] = Array.from({ length: n }, () => []);
  for (const b of mol.bonds) {
    const [p, q] = b.atoms;
    const bo = b.bo ?? defs.bond?.bo ?? 1;
    if (z[p] === 1 && z[q] !== 1) { hs[q]++; continue; }
    if (z[q] === 1 && z[p] !== 1) { hs[p]++; continue; }
    nb[p].push([q, bo]);
    nb[q].push([p, bo]);
  }
  const groups: Record<string, number> = {};
  const done = new Set<number>();
  const add = (g: string, ...atoms: number[]) => { groups[g] = (groups[g] ?? 0) + 1; for (const a of atoms) done.add(a); };
  const fail = (why: string): JobackResult => ({ tb: null, tm: null, groups, missing: why });
  const terminal = (a: number) => nb[a].length === 1;

  // groups of several atoms first
  for (let a = 0; a < n; a++) {
    if (z[a] === 6 && !arom.has(a) && !chg[a]) {
      const dO = nb[a].find(([b, bo]) => bo === 2 && z[b] === 8 && terminal(b) && !chg[b]);
      if (dO) {
        const sO = nb[a].filter(([b, bo]) => bo === 1 && z[b] === 8 && !chg[b] && !done.has(b)).map(([b]) => b);
        const acid = sO.find((b) => terminal(b) && hs[b] === 1);
        const ester = sO.find((b) => nb[b].length === 2 && hs[b] === 0 && nb[b].every(([c]) => z[c] === 6));
        if (acid !== undefined && hs[a] === 0) add('-COOH', a, dO[0], acid);
        else if (ester !== undefined && hs[a] === 0 && !inRing.has(a)) add('-COO- (ester)', a, dO[0], ester);
        else if (hs[a] >= 1 && !inRing.has(a)) add('O=CH- (aldehyde)', a, dO[0]);
        else add(inRing.has(a) ? '>C=O (ring)' : '>C=O', a, dO[0]);
        continue;
      }
      const tN = nb[a].find(([b, bo]) => bo === 3 && z[b] === 7 && terminal(b));
      if (tN && hs[a] === 0) { add('-CN', a, tN[0]); continue; }
    }
    if (z[a] === 7) {
      const os = nb[a].filter(([b]) => z[b] === 8 && terminal(b));
      if (os.length === 2 && nb[a].length === 3 && chg[a] + os.reduce((s, [b]) => s + chg[b], 0) === 0) add('-NO2', a, ...os.map(([b]) => b));
    }
  }

  for (let a = 0; a < n; a++) {
    if (done.has(a) || z[a] === 1) continue;
    const sym = SYM[z[a]];
    const ring = inRing.has(a);
    const h = hs[a];
    const deg = nb[a].length;
    const doubles = nb[a].filter(([, bo]) => bo === 2).length;
    const triples = nb[a].filter(([, bo]) => bo === 3).length;
    if (!sym) return fail(`Joback's method has no group for ${elementName(z[a])}.`);
    if (chg[a]) return fail('Joback\'s method has no groups for charged atoms.');
    switch (sym) {
      case 'C':
        if (arom.has(a)) add(h ? '=CH- (ring)' : '=C< (ring)', a);
        else if (triples) add(h ? '≡CH' : '≡C-', a);
        else if (doubles >= 2) add('=C=', a);
        else if (doubles === 1) add(h === 2 ? '=CH2' : h === 1 ? (ring ? '=CH- (ring)' : '=CH-') : ring ? '=C< (ring)' : '=C<', a);
        else if (h === 3) add('-CH3', a);
        else if (h === 2) add(ring ? '-CH2- (ring)' : '-CH2-', a);
        else if (h === 1) add(ring ? '>CH- (ring)' : '>CH-', a);
        else if (h === 0 && deg === 4) add(ring ? '>C< (ring)' : '>C<', a);
        else return fail('Joback\'s method has no group for methane or a carbon with this many hydrogens.');
        break;
      case 'O':
        if (doubles) add('=O (other)', a);
        else if (deg === 1 && h === 1) add(nb[a].some(([b]) => arom.has(b)) ? '-OH (phenol)' : '-OH (alcohol)', a);
        else if (deg === 2) add(ring ? '-O- (ring)' : '-O-', a);
        else return fail('Joback\'s method has no group for water or an O like this one.');
        break;
      case 'N':
        if (arom.has(a)) {
          if (h === 1) add('>NH (ring)', a);
          else if (deg === 2) add('-N= (ring)', a);
          else return fail('Joback\'s method has no group for an aromatic N with three bonds (as in N-methylpyrrole).');
        } else if (triples) return fail('Joback\'s method has no group for this N.');
        else if (doubles) add(h === 1 ? '=NH' : ring ? '-N= (ring)' : '-N=', a);
        else if (h === 2) add('-NH2', a);
        else if (h === 1) add(ring ? '>NH (ring)' : '>NH', a);
        else if (deg === 3 && !ring) add('>N-', a);
        else return fail('Joback\'s method has no group for a ring N with three bonds (as in N-methylpiperidine).');
        break;
      case 'S':
        if (deg === 1 && h === 1 && !doubles) add('-SH', a);
        else if (deg === 2 && !doubles) add(ring || arom.has(a) ? '-S- (ring)' : '-S-', a);
        else return fail('Joback\'s method has no group for S with more than two bonds (sulfoxides, sulfones).');
        break;
      default:
        add('-' + sym, a);
    }
  }
  if (!Object.keys(groups).length) return fail('No groups.');
  // each property's sum over the groups, null when a group has no value for it
  const sum = (key: (typeof JOBACK_KEYS)[number]): number | null => {
    const k = JOBACK_KEYS.indexOf(key);
    let t = 0;
    for (const [g, c] of Object.entries(groups)) {
      const v = JOBACK[g][k];
      if (v === null) return null;
      t += c * v;
    }
    return t;
  };
  const plus = (v: number | null, base: number) => (v === null ? null : base + v);
  const tb = 198 + sum('tb')!;
  const tm = plus(sum('tm'), 122.5);
  const sTc = sum('tc'), sPc = sum('pc');
  // all atoms, hydrogens included, for the critical pressure
  const atoms = z.filter((x) => x !== 1).length + hs.reduce((s, h, a) => s + (z[a] === 1 ? 0 : h), 0);
  const tc = sTc === null ? null : tb / (0.584 + 0.965 * sTc - sTc * sTc);
  const pc = sPc === null ? null : (0.113 + 0.0032 * atoms - sPc) ** -2;
  const [a, b, c, d] = (['cpa', 'cpb', 'cpc', 'cpd'] as const).map(sum);
  const T = 298.15;
  const cp = a === null || b === null || c === null || d === null ? null
    : a - 37.93 + (b + 0.21) * T + (c - 3.91e-4) * T * T + (d + 2.06e-7) * T * T * T;
  return {
    tb, tm, tc, pc, vc: plus(sum('vc'), 17.5), hf: plus(sum('hf'), 68.29), gf: plus(sum('gf'), 53.88), cp,
    hvap: plus(sum('hvap'), 15.3), hfus: plus(sum('hfus'), -0.88), groups,
    missing: tm === null ? 'No melting point: Joback\'s method has no value for an open-chain -N= group.' : undefined,
  };
}

function elementName(z: number): string {
  const names: Record<number, string> = { 5: 'boron', 14: 'silicon', 15: 'phosphorus', 34: 'selenium', 0: 'R groups' };
  return names[z] ?? 'this element';
}

// ---------------------------------------------------------------- solubility and volatility

/**
 * Estimated water solubility, log10 of mol/L at 25 °C: Delaney's ESOL equation (J. Chem. Inf.
 * Comput. Sci. 2004, 44, 1000) with Wildman–Crippen logP in place of Daylight's. `ap` is the
 * fraction of heavy atoms that are aromatic. Typical error about 0.8 log units.
 */
export function esolLogS(clogp: number, mw: number, rotb: number, ap: number): number {
  return 0.16 - 0.63 * clogp - 0.0062 * mw + 0.066 * rotb - 0.74 * ap;
}

/**
 * Estimated vapour pressure (Pa) at temperature T from the normal boiling point: Lyman's
 * Antoine-type method (Handbook of Chemical Property Estimation Methods, 1990, ch. 14) with
 * Fishtine's factor `kf` for polar liquids. A solid (melting point above T) is corrected from the
 * subcooled liquid with Walden's rule (entropy of melting 56.5 J/mol·K).
 */
export function vapourPressure(tb: number, kf = 1, tm: number | null = null, T = 298.15): number {
  const R = 1.987;
  const c2 = -18 + 0.19 * tb;
  const dsb = kf * (8.75 + R * Math.log(tb));
  let lnP = ((dsb * (tb - c2) ** 2) / (0.97 * R * tb)) * (1 / (tb - c2) - 1 / (T - c2));
  if (tm !== null && tm > T) lnP -= (56.5 * (tm - T)) / (8.314 * T);
  return Math.exp(lnP) * 101325;
}

/** Fishtine's factor for the most polar group present (1 for hydrocarbons and halides). */
export function fishtine(groups: Record<string, number>): number {
  if (groups['-OH (alcohol)']) return 1.3;
  if (groups['-OH (phenol)'] || groups['-COOH']) return 1.15;
  if (groups['-NH2'] || groups['>NH'] || groups['>NH (ring)']) return 1.1;
  if (['>C=O', '>C=O (ring)', '-COO- (ester)', 'O=CH- (aldehyde)', '-CN', '-NO2'].some((g) => groups[g])) return 1.06;
  if (groups['-O-'] || groups['-O- (ring)']) return 1.03;
  return 1;
}

/** Henry's law constant (Pa·m³/mol) as vapour pressure over solubility (both estimated). */
export function henryConstant(vpPa: number, logS: number): number {
  return vpPa / (10 ** logS * 1000);
}
