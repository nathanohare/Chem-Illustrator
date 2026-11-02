// The 3-D Model window's third tier: the lowest conformers re-optimised with GFN2-xTB (the Grimme
// group's semiempirical method; xtb is free software under the LGPL 3.0). The desktop app runs an
// xtb program the person has installed (src-tauri/src/xtb.rs); nothing is sent anywhere.
// Energies come back in hartree and are kept in kcal/mol, like MMFF's, and the conformers are
// ranked again, as the order often changes.

import type { Conformer, Model3d } from './model3d-build';
import { withPopulations } from './conformer-rank';
import { chargeAndMultiplicity, xyzFile } from './qm-input';

/** kcal/mol per hartree. */
export const KCAL_PER_HARTREE = 627.509474;

/** ALPB solvents xtb knows, as it spells them. */
export const XTB_SOLVENTS = ['acetone', 'acetonitrile', 'aniline', 'benzaldehyde', 'benzene', 'ch2cl2', 'chcl3', 'cs2', 'dioxane', 'dmf', 'dmso', 'ether', 'ethylacetate', 'furane', 'hexandecane', 'hexane', 'methanol', 'nitromethane', 'octanol', 'woctanol', 'phenol', 'toluene', 'thf', 'water'];

export interface XtbOptions {
  /** The xtb program ("xtb" to find it on PATH). */
  exe: string;
  /** ALPB solvent, or "" for the gas phase. */
  solvent: string;
  /** Optimise each conformer (otherwise single-point energies on the MMFF geometries). */
  opt: boolean;
  /** How many of the lowest conformers to refine. */
  count: number;
}

export const DEFAULT_XTB: XtbOptions = { exe: 'xtb', solvent: '', opt: true, count: 5 };

/** What runs xtb on one conformer (the desktop app's xtb_run). */
export type XtbRunner = (job: { exe: string; xyz: string; charge: number; uhf: number; solvent: string | null; opt: boolean }) => Promise<{ xyz: string; energy: number }>;

/** Positions (OpenChemLib's frame: y and z turned) from an XYZ file xtb wrote, or null if its atoms don't match. */
export function readXyz(text: string, m: Model3d): number[] | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const n = parseInt(lines[0], 10);
  if (n !== m.atoms.length) return null;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const w = (lines[2 + i] ?? '').trim().split(/\s+/);
    if (w.length < 4) return null;
    const [x, y, z] = [parseFloat(w[1]), parseFloat(w[2]), parseFloat(w[3])];
    if (![x, y, z].every(Number.isFinite)) return null;
    out.push(x, -y, -z);
  }
  return out;
}

/**
 * The model with its lowest `opts.count` conformers refined by xtb (one after another, `progress`
 * told after each), ranked again by their xTB energies; the rest are left out, as their MMFF
 * energies can't be compared with xTB's. Throws xtb's own message when a run fails.
 */
export async function refineWithXtb(m: Model3d, opts: XtbOptions, run: XtbRunner, progress?: (done: number, total: number) => void, stopped?: () => boolean): Promise<Model3d> {
  const { charge, multiplicity } = chargeAndMultiplicity(m);
  const n = Math.max(1, Math.min(opts.count, m.conformers.length));
  const out: Conformer[] = [];
  for (let k = 0; k < n; k++) {
    if (stopped?.()) break;
    const r = await run({ exe: opts.exe, xyz: xyzFile(m, k, `conformer ${k + 1}`), charge, uhf: multiplicity - 1, solvent: opts.solvent || null, opt: opts.opt });
    const xyz = opts.opt ? readXyz(r.xyz, m) : m.conformers[k].xyz;
    if (!xyz) throw new Error('xtb gave back a geometry with different atoms.');
    out.push({ xyz, energy: r.energy * KCAL_PER_HARTREE });
    progress?.(k + 1, n);
  }
  if (!out.length) return m;
  out.sort((p, q) => p.energy! - q.energy!);
  return { ...m, conformers: withPopulations(out), method: `GFN2-xTB${opts.solvent ? ` (ALPB ${opts.solvent})` : ''}${opts.opt ? '' : ' single points'}` };
}
