// The 3-D Model window's top tier: input files for a quantum-chemistry program, so a conformer
// from the search (or refined with xTB) goes straight into a DFT calculation. Gaussian's .gjf
// (Link 0 lines, route line, title, charge and multiplicity, Cartesian coordinates, blank line)
// and ORCA's .inp ("!" keyword line, %pal and %maxcore blocks, "* xyz charge mult" … "*"),
// written from each program's published input description.

import { SYMBOLS } from './elements';
import type { Model3d } from './model3d-build';

export type QmProgram = 'gaussian' | 'orca';

export interface QmOptions {
  program: QmProgram;
  /** Method and basis set, as the program writes them (B3LYP/def2SVP, or "B3LYP D3BJ def2-SVP" for ORCA). */
  method: string;
  /** opt, opt freq, sp (single point), freq. */
  job: 'opt freq' | 'opt' | 'sp' | 'freq';
  /** Implicit solvent name ("" for the gas phase): SMD in Gaussian and ORCA. */
  solvent: string;
  charge: number;
  multiplicity: number;
  /** Processor cores and memory (GB). */
  cores: number;
  memory: number;
  title: string;
}

/** The methods offered (each program's spelling), most used first. */
export const QM_METHODS: Record<QmProgram, string[]> = {
  gaussian: ['B3LYP/6-31G(d) EmpiricalDispersion=GD3BJ', 'B3LYP/def2SVP EmpiricalDispersion=GD3BJ', 'M062X/def2TZVP', 'wB97XD/def2TZVP', 'PBE1PBE/def2SVP EmpiricalDispersion=GD3BJ'],
  orca: ['B3LYP D3BJ def2-SVP', 'r2SCAN-3c', 'B97-3c', 'M062X def2-TZVP', 'wB97X-D3 def2-TZVP', 'PBE0 D3BJ def2-TZVP'],
};

/** Total charge and the lowest multiplicity (2S+1) for a model's atoms: 1 for an even number of electrons, 2 for an odd one. */
export function chargeAndMultiplicity(m: Model3d): { charge: number; multiplicity: number } {
  const charge = m.atoms.reduce((s, a) => s + a.charge, 0);
  const electrons = m.atoms.reduce((s, a) => s + a.z, 0) - charge;
  return { charge, multiplicity: electrons % 2 ? 2 : 1 };
}

/** The conformer's atoms as "El  x  y  z" lines (Å), in a right-handed frame (OpenChemLib's y and z turned back). */
export function cartesianLines(m: Model3d, conf: number): string[] {
  const xyz = m.conformers[conf].xyz;
  const f = (v: number) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6).padStart(12);
  return m.atoms.map((a, i) => `${(SYMBOLS[a.z] || 'X').padEnd(2)} ${f(xyz[3 * i])} ${f(-xyz[3 * i + 1])} ${f(-xyz[3 * i + 2])}`);
}

/** An XYZ file of the conformer (atom count, a comment line, then the atoms). */
export function xyzFile(m: Model3d, conf: number, comment = ''): string {
  return `${m.atoms.length}\n${comment.replace(/\s+/g, ' ').slice(0, 200)}\n${cartesianLines(m, conf).join('\n')}\n`;
}

/** A Gaussian input file (.gjf) for one conformer. */
export function gaussianInput(m: Model3d, conf: number, o: QmOptions, chk = 'conformer'): string {
  const job = o.job === 'sp' ? 'SP' : o.job === 'opt freq' ? 'Opt Freq' : o.job === 'opt' ? 'Opt' : 'Freq';
  const scrf = o.solvent ? ` SCRF=(SMD,Solvent=${o.solvent})` : '';
  const title = (o.title || 'Conformer').replace(/[\r\n]+/g, ' ').trim() || 'Conformer';
  return [
    `%nprocshared=${Math.max(1, Math.round(o.cores))}`,
    `%mem=${Math.max(1, Math.round(o.memory))}GB`,
    `%chk=${chk.replace(/[^\w.-]+/g, '_')}.chk`,
    `#p ${o.method.trim()} ${job}${scrf}`,
    '',
    title,
    '',
    `${o.charge} ${o.multiplicity}`,
    ...cartesianLines(m, conf),
    '',
    '',
  ].join('\n');
}

/** An ORCA input file (.inp) for one conformer. */
export function orcaInput(m: Model3d, conf: number, o: QmOptions): string {
  const job = o.job === 'sp' ? '' : o.job === 'opt freq' ? ' Opt Freq' : o.job === 'opt' ? ' Opt' : ' Freq';
  const solvent = o.solvent ? ` CPCM(${o.solvent})` : '';
  const cores = Math.max(1, Math.round(o.cores));
  // %maxcore is per core, in MB; three quarters of the memory, as ORCA's manual advises
  const perCore = Math.max(500, Math.floor((o.memory * 1024 * 0.75) / cores));
  const lines = [
    `# ${(o.title || 'Conformer').replace(/[\r\n]+/g, ' ').trim()}`,
    `! ${o.method.trim()}${job}${solvent}`,
    ...(o.solvent ? [`%cpcm`, `  smd true`, `  SMDsolvent "${o.solvent}"`, `end`] : []),
    ...(cores > 1 ? [`%pal nprocs ${cores} end`] : []),
    `%maxcore ${perCore}`,
    '',
    `* xyz ${o.charge} ${o.multiplicity}`,
    ...cartesianLines(m, conf),
    '*',
    '',
  ];
  return lines.join('\n');
}

/** The input file for the program chosen, with its file extension. */
export function qmInput(m: Model3d, conf: number, o: QmOptions, name: string): { text: string; ext: string } {
  return o.program === 'gaussian' ? { text: gaussianInput(m, conf, o, name), ext: 'gjf' } : { text: orcaInput(m, conf, o), ext: 'inp' };
}
