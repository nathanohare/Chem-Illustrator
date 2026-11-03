// Reading the results of quantum chemistry jobs (Gaussian .log/.out, ORCA .out) for energy
// diagrams: the energy (free energy when a frequency job ran, else the electronic energy), how
// many imaginary frequencies there are (one: a transition state), the level of theory from the
// route line or input, and the last geometry. Read from the plain text the programs write.

export interface QmAtom { el: string; x: number; y: number; z: number }

export interface QmResult {
  program: 'Gaussian' | 'ORCA';
  /** The name the job goes by (the file's name without its extension). */
  name: string;
  /** Energies in hartree, where the output gives them. */
  scf: number | null;
  enthalpy: number | null;
  free: number | null;
  /** Imaginary frequencies (null: no frequency job). */
  imaginary: number | null;
  /** The level of theory, written the way papers do (B3LYP-D3(BJ)/def2-TZVP, SMD(THF)). */
  theory: string;
  atoms: QmAtom[];
  /** The job did not finish normally. */
  unfinished: boolean;
}

/** Hartree in each unit the diagram offers. */
export const HARTREE: Record<string, number> = { 'kcal/mol': 627.509474, 'kJ/mol': 2625.499639, eV: 27.211386 };

const ELEMENTS = ['X', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe', 'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi'];

/** Which program wrote this text, if either. */
export function qmProgram(text: string): QmResult['program'] | null {
  if (/Gaussian, Inc\.|Entering Gaussian System|^\s*#[pPnNtT]?\s/m.test(text.slice(0, 20000)) && /SCF Done:|Standard orientation:|Input orientation:/.test(text)) return 'Gaussian';
  if (/\* O   R   C   A \*|O   R   C   A|FINAL SINGLE POINT ENERGY/.test(text)) return 'ORCA';
  return null;
}

/** Read one output file. Null when it is neither program's output. */
export function readQmOutput(text: string, fileName = ''): QmResult | null {
  const program = qmProgram(text);
  if (!program) return null;
  const name = fileName.replace(/^.*[\\/]/, '').replace(/\.(log|out|txt)$/i, '');
  return program === 'Gaussian' ? readGaussian(text, name) : readOrca(text, name);
}

const last = (text: string, re: RegExp): RegExpExecArray | null => {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m: RegExpExecArray | null, out: RegExpExecArray | null = null;
  while ((m = g.exec(text))) out = m;
  return out;
};
const num = (m: RegExpExecArray | null): number | null => (m ? Number(m[1]) : null);
/** The last match of `re` on a line that has `key` (found from the end, so a long log isn't searched through). */
const lastAt = (text: string, key: string, re: RegExp): RegExpExecArray | null => {
  const at = text.lastIndexOf(key);
  return at < 0 ? null : re.exec(text.slice(at, at + 400));
};

// ---------------------------------------------------------------- Gaussian

function readGaussian(text: string, name: string): QmResult {
  const scf = num(lastAt(text, 'SCF Done:', /SCF Done:\s+E\([^)]*\)\s*=\s*(-?\d+\.\d+)/));
  const free = num(lastAt(text, 'Sum of electronic and thermal Free Energies=', /Sum of electronic and thermal Free Energies=\s*(-?\d+\.\d+)/));
  const enthalpy = num(lastAt(text, 'Sum of electronic and thermal Enthalpies=', /Sum of electronic and thermal Enthalpies=\s*(-?\d+\.\d+)/));
  // the last frequency job: the negative frequencies it lists
  let imaginary: number | null = null;
  const freqAt = text.lastIndexOf('Harmonic frequencies');
  if (freqAt >= 0) imaginary = [...text.slice(freqAt).matchAll(/Frequencies --\s+([^\n]+)/g)].flatMap((m) => m[1].trim().split(/\s+/).map(Number)).filter((f) => f < 0).length;
  const route = gaussianRoute(text);
  const atoms = gaussianGeometry(text);
  return {
    program: 'Gaussian', name, scf, enthalpy, free, imaginary,
    theory: route ? gaussianTheory(route) : '', atoms, unfinished: !/Normal termination of Gaussian/.test(text.slice(-4000)),
  };
}

/** The first route section (# line and its continuations), as one line. */
export function gaussianRoute(text: string): string {
  // found without splitting the whole file into lines (a long optimization's log runs to tens of MB)
  const at = /^[ \t]*#/m.exec(text)?.index;
  if (at === undefined) return '';
  const lines = text.slice(at, at + 8000).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*#/.test(lines[i])) continue;
    let r = lines[i].trim();
    for (let j = i + 1; j < lines.length && !/^\s*-{5,}/.test(lines[j]); j++) r += lines[j].replace(/^\s/, '');
    return r;
  }
  return '';
}

const pretty: Record<string, string> = {
  b3lyp: 'B3LYP', m062x: 'M06-2X', m06: 'M06', m06l: 'M06-L', wb97xd: 'ωB97X-D', wb97x: 'ωB97X', 'wb97x-d3': 'ωB97X-D3', 'wb97x-v': 'ωB97X-V', 'wb97m-v': 'ωB97M-V',
  pbe0: 'PBE0', pbe1pbe: 'PBE0', pbe: 'PBE', bp86: 'BP86', tpss: 'TPSS', tpssh: 'TPSSh', b97d: 'B97-D', b97d3: 'B97-D3', mn15: 'MN15', camb3lyp: 'CAM-B3LYP', 'cam-b3lyp': 'CAM-B3LYP',
  hf: 'HF', mp2: 'MP2', ccsd: 'CCSD', 'ccsd(t)': 'CCSD(T)', 'dlpno-ccsd(t)': 'DLPNO-CCSD(T)', r2scan: 'r²SCAN', 'r2scan-3c': 'r²SCAN-3c', b3lyp3c: 'B3LYP-3c', 'pbeh-3c': 'PBEh-3c', b2plyp: 'B2PLYP', revpbe: 'revPBE',
  'b3lyp-d3': 'B3LYP-D3', 'b3lyp-d3bj': 'B3LYP-D3(BJ)', 'b3lyp-d4': 'B3LYP-D4', 'pbe0-d3bj': 'PBE0-D3(BJ)', 'b97-3c': 'B97-3c', 'gfn2-xtb': 'GFN2-xTB', xtb2: 'GFN2-xTB',
};

/** A functional or method as papers write it. */
function methodName(m: string): string {
  const k = m.toLowerCase().replace(/^[ru]o?(?=[a-z])/, (p) => (pretty[m.toLowerCase().slice(p.length)] ? '' : p));
  return pretty[k] ?? pretty[m.toLowerCase()] ?? m.toUpperCase();
}

/** A basis set as papers write it. */
function basisName(b: string): string {
  const l = b.toLowerCase();
  if (l === 'gen' || l === 'genecp') return 'mixed basis';
  if (/^def2/.test(l)) return 'def2-' + l.replace(/^def2-?/, '').toUpperCase().replace(/^MA-/, 'ma-');
  if (/^ma-def2/.test(l)) return 'ma-def2-' + l.replace(/^ma-def2-?/, '').toUpperCase();
  if (/^(aug-)?cc-p/.test(l)) return l.replace(/cc-p(c?w?c?v)(\w)z/, (_, v: string, z: string) => `cc-p${v.toUpperCase()}${z.toUpperCase()}Z`);
  if (/^\d-\d+/.test(l)) return l.replace(/g/, 'G');
  return b;
}

const solventName = (s: string): string => {
  const l = s.toLowerCase().replace(/["']/g, '');
  const known: Record<string, string> = { thf: 'THF', tetrahydrofuran: 'THF', water: 'water', h2o: 'water', dichloromethane: 'CH₂Cl₂', ch2cl2: 'CH₂Cl₂', dcm: 'CH₂Cl₂', toluene: 'toluene', benzene: 'benzene', acetonitrile: 'MeCN', mecn: 'MeCN', ch3cn: 'MeCN', methanol: 'MeOH', ch3oh: 'MeOH', ethanol: 'EtOH', dmso: 'DMSO', dimethylsulfoxide: 'DMSO', dmf: 'DMF', 'n,n-dimethylformamide': 'DMF', chloroform: 'CHCl₃', chcl3: 'CHCl₃', diethylether: 'Et₂O', hexane: 'hexane', 'n-hexane': 'hexane', '1,4-dioxane': 'dioxane', dioxane: 'dioxane', acetone: 'acetone' };
  return known[l] ?? l;
};

/** "#p opt freq b3lyp/6-31g(d) empiricaldispersion=gd3bj scrf=(smd,solvent=thf)" → "B3LYP-D3(BJ)/6-31G(d), SMD(THF)". */
export function gaussianTheory(route: string): string {
  const r = route.replace(/^#\w?\s*/, '');
  const mb = /(?:^|\s)([^\s=/]+)\/([^\s=]+)/.exec(r);
  let method = mb ? methodName(mb[1]) : '';
  const basis = mb ? basisName(mb[2]) : '';
  const disp = /empiricaldispersion\s*=\s*\(?\s*(gd3bj|gd3|gd2|pfd)/i.exec(r)?.[1].toLowerCase();
  if (disp && method) method += disp === 'gd3bj' ? '-D3(BJ)' : disp === 'gd3' ? '-D3' : disp === 'gd2' ? '-D2' : '';
  const scrf = /scrf\s*=\s*\(?([^)\s]*)\)?/i.exec(r)?.[1] ?? (/\bscrf\b/i.test(r) ? '' : null);
  let solv = '';
  if (scrf !== null) {
    const model = /\bsmd\b/i.test(scrf) ? 'SMD' : /\bcpcm\b/i.test(scrf) ? 'CPCM' : 'PCM';
    const s = /solvent\s*=\s*([^,)\s]+)/i.exec(scrf)?.[1] ?? 'water';
    solv = `${model}(${solventName(s)})`;
  }
  return [method && basis ? `${method}/${basis}` : method, solv].filter(Boolean).join(', ');
}

/** The last Standard orientation (or Input orientation) in Å. */
function gaussianGeometry(text: string): QmAtom[] {
  const at = Math.max(text.lastIndexOf('Standard orientation:'), text.lastIndexOf('Input orientation:'));
  if (at < 0) return [];
  const lines = text.slice(at).split(/\r?\n/);
  const out: QmAtom[] = [];
  let dashes = 0;
  for (const l of lines.slice(1)) {
    if (/^\s*-{10,}/.test(l)) { if (++dashes === 3) break; continue; }
    if (dashes < 2) continue;
    const p = l.trim().split(/\s+/).map(Number);
    if (p.length >= 6 && p.every(Number.isFinite)) out.push({ el: ELEMENTS[p[1]] ?? 'X', x: p[3], y: p[4], z: p[5] });
  }
  return out;
}

// ---------------------------------------------------------------- ORCA

const ORCA_JOB = /^(opt|optts|freq|numfreq|anfreq|tightscf|verytightscf|extremescf|loosescf|normalscf|tightopt|verytightopt|looseopt|rijcosx|ri|rijk|ri-jk|nori|defgrid\d|grid\d|finalgrid\d|nofinalgrid|def2\/j|def2\/jk|autoaux|slowconv|veryslowconv|kdiis|soscf|nososcf|nopop|miniprint|smallprint|normalprint|largeprint|printbasis|pal\d+|uks|rks|uhf|rhf|sp|engrad|irc|scants|xyzfile|keepdens|moread|noautostart|frozencore|nofrozencore|tightpno|normalpno|loosepno|[\w-]+\/c)$/i;

function readOrca(text: string, name: string): QmResult {
  const scf = num(last(text, /FINAL SINGLE POINT ENERGY\s+(-?\d+\.\d+)/));
  const free = num(last(text, /Final Gibbs free energy\s+\.\.\.\s+(-?\d+\.\d+)/));
  const enthalpy = num(last(text, /Total Enthalpy\s+\.\.\.\s+(-?\d+\.\d+)/));
  const fAt = text.lastIndexOf('VIBRATIONAL FREQUENCIES');
  const imaginary = fAt < 0 ? null : (text.slice(fAt, text.indexOf('NORMAL MODES', fAt) > 0 ? text.indexOf('NORMAL MODES', fAt) : undefined).match(/\*\*\*imaginary mode\*\*\*/g) ?? []).length;
  const input = [...text.matchAll(/^\|\s*\d+>\s*(.*)$/gm)].map((m) => m[1]);
  return { program: 'ORCA', name, scf, enthalpy, free, imaginary, theory: orcaTheory(input), atoms: orcaGeometry(text), unfinished: !/ORCA TERMINATED NORMALLY/.test(text.slice(-4000)) };
}

/** The input file's lines (as echoed in the output) → the level of theory. */
export function orcaTheory(input: string[]): string {
  const words = input.filter((l) => /^\s*!/.test(l)).flatMap((l) => l.replace(/^\s*!/, '').replace(/#.*$/, '').trim().split(/\s+/)).filter(Boolean);
  let method = '', basis = '', disp = '', solv = '';
  for (const w of words) {
    const l = w.toLowerCase();
    if (ORCA_JOB.test(l)) continue;
    if (/^d3bj$/.test(l)) { disp = '-D3(BJ)'; continue; }
    if (/^d3(zero)?$/.test(l)) { disp = '-D3'; continue; }
    if (/^d4$/.test(l)) { disp = '-D4'; continue; }
    const s = /^c?pcm\((.+)\)$/.exec(l) ?? /^smd\((.+)\)$/.exec(l);
    if (s) { solv = `${l.startsWith('smd') ? 'SMD' : 'CPCM'}(${solventName(s[1])})`; continue; }
    if (/^(def2|ma-def2|(aug-)?cc-p|6-31|6-311|sto-|pcseg|x2c-|sarc)/.test(l)) { if (!basis) basis = basisName(w); continue; }
    if (!method) method = methodName(w);
  }
  const block = input.join('\n');
  const smd = /smd\s+true/i.test(block) ? /smdsolvent\s+"([^"]+)"/i.exec(block)?.[1] : undefined;
  if (smd) solv = `SMD(${solventName(smd)})`;
  // composite methods (r²SCAN-3c, B97-3c) bring their own basis
  const head = method + disp;
  return [head && basis && !/-3c$/.test(method) ? `${head}/${basis}` : head, solv].filter(Boolean).join(', ');
}

function orcaGeometry(text: string): QmAtom[] {
  const at = text.lastIndexOf('CARTESIAN COORDINATES (ANGSTROEM)');
  if (at < 0) return [];
  const out: QmAtom[] = [];
  for (const l of text.slice(at).split(/\r?\n/).slice(2)) {
    const p = l.trim().split(/\s+/);
    if (p.length !== 4 || !/^[A-Z][a-z]?$/.test(p[0])) break;
    const [x, y, z] = p.slice(1).map(Number);
    if (![x, y, z].every(Number.isFinite)) break;
    out.push({ el: p[0], x, y, z });
  }
  return out;
}

// ---------------------------------------------------------------- for the diagram

/** The energy a diagram uses from a result: free energy when every file has one, else the SCF energy. */
export function pickEnergy(results: QmResult[]): { kind: 'free' | 'scf'; quantity: string } {
  return results.length && results.every((r) => r.free !== null) ? { kind: 'free', quantity: 'ΔG' } : { kind: 'scf', quantity: 'ΔE' };
}

/** A species' name from its file: a transition state (one imaginary frequency) gets its ‡. */
export function speciesName(r: QmResult): string {
  let n = r.name.replace(/^\d+[-_ .]+(?=\D)/, '').replace(/[_-]?(opt|freq|optfreq|sp|ts-?opt|final)$/i, '').replace(/^ts(\d*)$/i, (_, d: string) => `TS${d}`);
  if (!n) n = r.name;
  return r.imaginary === 1 && !n.endsWith('‡') ? n + '‡' : n;
}
