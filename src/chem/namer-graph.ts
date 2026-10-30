// The structure graph the systematic namer (OpenClatura, run in Python by src/worker/namer-worker.ts)
// reads, made here from RDKit so the namer needs no RDKit of its own. It carries what OpenClatura's
// own reader (graph_io.py) takes from RDKit: Kekulé bond orders, aromatic atoms, hydrogen counts,
// tetrahedral parities, R/S and E/Z labels, and which bonds lie in small rings.

import { SYMBOLS } from './elements';

export interface NamerAtom {
  el: string;
  q: number;
  iso: number;
  /** R or S as RDKit's legacy perception has it: marks the atom as a stereocentre. */
  legacy: string | null;
  /** The label by the current CIP rules (RDKit's CIP labeller), which the name uses. */
  cip: string | null;
  /** The drawn tetrahedral parity, for centres without a label. */
  tag: 'CW' | 'CCW' | null;
  arom: boolean;
  /** Hydrogens a SMILES would write inside brackets ([nH], [C@H]), as RDKit counts them explicit. */
  xh: number;
  h: number;
  rad: number;
  /** Neighbours, hydrogens included. */
  deg: number;
}

export interface NamerBond {
  u: number;
  v: number;
  /** Kekulé order: 1, 2 or 3. */
  o: number;
  ez: 'E' | 'Z' | null;
  /** In a ring of 3 to 7 atoms. */
  ring: boolean;
}

export interface NamerGraph {
  atoms: NamerAtom[];
  bonds: NamerBond[];
}

interface RdJson {
  defaults: { atom: Record<string, unknown>; bond: Record<string, unknown> };
  molecules: { atoms: Record<string, unknown>[]; bonds: { atoms: [number, number]; [k: string]: unknown }[]; extensions?: { name: string; [k: string]: unknown }[] }[];
}

/** The namer's graph of an RDKit molecule (from RDKit's JSON and its CIP labels). */
export function namerGraph(mol: { get_json(): string; get_stereo_tags(): string }): NamerGraph {
  const j = JSON.parse(mol.get_json()) as RdJson;
  const m = j.molecules[0];
  const rep = (m.extensions ?? []).find((e) => e.name === 'rdkitRepresentation') ?? {} as Record<string, unknown>;
  const arom = new Set((rep.aromaticAtoms as number[] | undefined) ?? []);
  const legacy = new Map((rep.cipCodes as [number, string][] | undefined) ?? []);
  const tags = JSON.parse(mol.get_stereo_tags()) as { CIP_atoms: [number, string][]; CIP_bonds: [number, number, string][] };
  const bare = (l: string) => l.replace(/[()]/g, '');
  const cip = new Map(tags.CIP_atoms.map(([i, l]) => [i, bare(l)] as const).filter(([, l]) => /^[RSrs]$/.test(l)));
  const pair = (u: number, v: number) => `${Math.min(u, v)},${Math.max(u, v)}`;
  const ez = new Map(tags.CIP_bonds.map(([a, b, l]) => [pair(a, b), bare(l)] as const).filter(([, l]) => l === 'E' || l === 'Z'));
  const rings = ((rep.atomRings as number[][] | undefined) ?? []).filter((r) => r.length >= 3 && r.length <= 7);
  const inSmallRing = (u: number, v: number) => rings.some((r) => {
    const i = r.indexOf(u), k = r.indexOf(v);
    return i >= 0 && k >= 0 && (Math.abs(i - k) === 1 || Math.abs(i - k) === r.length - 1);
  });
  const degree = m.atoms.map(() => 0);
  for (const b of m.bonds) { degree[b.atoms[0]]++; degree[b.atoms[1]]++; }
  const atoms = m.atoms.map((a0, i): NamerAtom => {
    const a = { ...j.defaults.atom, ...a0 } as { z: number; chg: number; isotope: number; impHs: number; nRad: number; stereo: string };
    const tag = a.stereo === 'cw' ? 'CW' : a.stereo === 'ccw' ? 'CCW' : null;
    const el = SYMBOLS[a.z] || '*';
    const xh = a.impHs && ((arom.has(i) && el !== 'C') || tag) ? a.impHs : 0;
    return { el, q: a.chg, iso: a.isotope, legacy: legacy.get(i) ?? null, cip: cip.get(i) ?? null, tag, arom: arom.has(i), xh, h: a.impHs, rad: a.nRad, deg: degree[i] + a.impHs };
  });
  const bonds = m.bonds.map((b0): NamerBond => {
    const b = { ...j.defaults.bond, ...b0 } as { atoms: [number, number]; bo: number };
    const [u, v] = b.atoms;
    return { u, v, o: b.bo, ez: (ez.get(pair(u, v)) as 'E' | 'Z' | undefined) ?? null, ring: inSmallRing(u, v) };
  });
  return { atoms, bonds };
}
