// Hammett constants of the groups on a drawn benzene ring, read against a marked "core": the part
// every row of a series shares, with [*] at each ring position whose group changes from row to
// row and an atom map (:1) on the reaction centre, e.g. [NH2:1]c1ccc(*)cc1 for para-substituted
// anilines. Each structure is matched to the core; the group found at each [*] position is looked
// up in the Hammett table (src/kb/hammett.ts, Hansch, Leo and Taft, Chem. Rev. 1991, Table I) by
// its SMILES, and its place on the ring, counted from the reaction centre, says whether σm or σp
// applies. Runs in the chemistry worker (and in tests, with RDKit loaded in Node).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { HAMMETT } from '../kb/hammett';

export type RingPlace = 'ipso' | 'ortho' | 'meta' | 'para';

/** The group at one marked position of one structure. */
export interface HammettSite {
  /** Where it is on the ring, counted from the reaction centre's ring atom. */
  place: RingPlace;
  /** Its row in HAMMETT, or -1 when the table doesn't have it. */
  row: number;
  /** The group's SMILES, * where it joins the ring ('' for hydrogen). */
  smiles: string;
  /** The group closes a ring back onto the marked ring (a fused ring): no single-group σ applies. */
  fused?: boolean;
}

export type HammettResult = { sites: HammettSite[] } | { error: string };

interface Graph {
  atoms: any[];
  bonds: { atoms: [number, number]; bo?: number; [k: string]: unknown }[];
  defaults: any;
  nb: number[][];
  rings: number[][];
}

function graphOf(mol: any): Graph {
  const j = JSON.parse(mol.get_json());
  const m = j.molecules[0];
  const nb: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) { nb[b.atoms[0]].push(b.atoms[1]); nb[b.atoms[1]].push(b.atoms[0]); }
  const ext = (m.extensions ?? []).find((e: any) => e.name === 'rdkitRepresentation');
  return { atoms: m.atoms, bonds: m.bonds, defaults: j.defaults, nb, rings: ext?.atomRings ?? [] };
}

const zOf = (g: Graph, a: number): number => g.atoms[a].z ?? g.defaults.atom.z ?? 6;

/** Atom map numbers of a molecule (from its molfile's atom-atom mapping column). */
function atomMaps(mol: any): number[] {
  const lines: string[] = mol.get_molblock().split(/\r?\n/);
  const n = parseInt(lines[3].slice(0, 3), 10);
  return Array.from({ length: n }, (_, i) => parseInt(lines[4 + i].slice(60, 63), 10) || 0);
}

function readMol(RDKit: any, text: string): any {
  let mol: any = null;
  try { mol = RDKit.get_mol(text); } catch { mol = null; }
  if (!mol || !mol.is_valid()) { mol?.delete?.(); return null; }
  return mol;
}

/** A molecule built from some atoms of a graph (and their bonds), extra atoms first. */
function subJson(g: Graph, keep: number[], extra: { atom: any; bondTo: number; bo?: number }[] = [], capped = false): string {
  const idx = new Map<number, number>();
  keep.forEach((a, i) => idx.set(a, i + extra.length));
  // capped: an atom that loses a bond to an atom left out gets a hydrogen in its place
  const lost = new Map<number, number>();
  if (capped) {
    for (const b of g.bonds) {
      const [p, q] = b.atoms;
      if (idx.has(p) !== idx.has(q)) { const k = idx.has(p) ? p : q; lost.set(k, (lost.get(k) ?? 0) + (b.bo ?? g.defaults.bond?.bo ?? 1)); }
    }
  }
  const atoms = [...extra.map((e) => e.atom), ...keep.map((a) => (lost.has(a) ? { ...g.atoms[a], impHs: (g.atoms[a].impHs ?? g.defaults.atom.impHs ?? 0) + lost.get(a)! } : g.atoms[a]))];
  const bonds: any[] = extra.map((e, i) => ({ atoms: [i, idx.get(e.bondTo)!], ...(e.bo && e.bo !== 1 ? { bo: e.bo } : {}) }));
  for (const b of g.bonds) {
    const p = idx.get(b.atoms[0]), q = idx.get(b.atoms[1]);
    if (p === undefined || q === undefined) continue;
    const { atoms: _, ...rest } = b;
    bonds.push({ ...rest, atoms: [p, q] });
  }
  return JSON.stringify({ rdkitjson: { version: 11 }, defaults: g.defaults, molecules: [{ atoms, bonds }] });
}

const canonCache = new WeakMap<object, Map<string, number>>();

/** The table's groups by canonical SMILES (and with E/Z marks taken out, as drawings often have none). */
function tableBySmiles(RDKit: any): Map<string, number> {
  let got = canonCache.get(RDKit);
  if (got) return got;
  got = new Map();
  HAMMETT.forEach((h, i) => {
    if (h.group === 'H' || h.smiles.includes('.') || h.smiles.split('[*]').length !== 2) return;
    const mol = readMol(RDKit, h.smiles);
    if (!mol) return;
    const s: string = mol.get_smiles();
    mol.delete();
    if (!got!.has(s)) got!.set(s, i);
    const flat = s.replace(/[/\\]/g, '');
    if (!got!.has(flat)) got!.set(flat, i);
  });
  canonCache.set(RDKit, got);
  return got;
}

/** The row of hydrogen in the table. */
export const H_ROW = HAMMETT.findIndex((h) => h.group === 'H');

/**
 * The groups at the core's marked positions in a molecule (SMILES or molfile). The core is SMILES
 * with [*] at each position that changes; its reaction centre is the atom mapped :1, or else the
 * one ring atom of the marked ring that carries something other than a [*].
 */
export function hammettSites(RDKit: any, input: string, core: string): HammettResult {
  const cm = readMol(RDKit, core);
  if (!cm) return { error: `The core "${core}" isn't SMILES that can be read` };
  let q: any = null, mol: any = null;
  try {
    const cg = graphOf(cm);
    const maps = atomMaps(cm);
    const stars = cg.atoms.map((_, i) => i).filter((i) => zOf(cg, i) === 0);
    if (!stars.length) return { error: 'Mark the position that changes with * in the core, e.g. [NH2:1]c1ccc(*)cc1' };
    // the ring atoms the stars sit on, and the six-membered ring they share
    const at = stars.map((s) => cg.nb[s][0]);
    if (at.some((a) => a === undefined || zOf(cg, a) === 0)) return { error: 'Each * in the core must be joined to a ring atom' };
    const ring = cg.rings.find((r) => r.length === 6 && at.every((a) => r.includes(a)));
    if (!ring) return { error: 'The * positions must all be on one six-membered ring of the core' };
    let centre = maps.findIndex((m) => m === 1);
    if (centre < 0) {
      const bearing = ring.filter((a) => cg.nb[a].some((b) => !ring.includes(b) && zOf(cg, b) !== 0 && !cg.rings.some((r) => r.includes(a) && r.includes(b))));
      if (bearing.length !== 1) return { error: 'Mark the reaction centre with :1 in the core, e.g. [NH2:1]c1ccc(*)cc1' };
      centre = bearing[0];
    }
    // the reaction centre's ring atom: the centre itself, or the nearest atom of the ring to it
    let rc = -1;
    {
      const seen = new Set([centre]);
      let front = [centre];
      while (front.length && rc < 0) {
        const hit = front.find((a) => ring.includes(a));
        if (hit !== undefined) { rc = hit; break; }
        const next: number[] = [];
        for (const a of front) for (const b of cg.nb[a]) if (!seen.has(b) && zOf(cg, b) !== 0) { seen.add(b); next.push(b); }
        front = next;
      }
    }
    if (rc < 0) return { error: 'The reaction centre must be joined to the marked ring' };
    const ringDist = (a: number): number => {
      const i = ring.indexOf(a), j = ring.indexOf(rc);
      const d = Math.abs(i - j);
      return Math.min(d, 6 - d);
    };
    const places: RingPlace[] = at.map((a) => (['ipso', 'ortho', 'meta', 'para'] as const)[ringDist(a)]);

    // the core without its stars, to find in each molecule
    const kept = cg.atoms.map((_, i) => i).filter((i) => zOf(cg, i) !== 0);
    const qi = new Map(kept.map((a, i) => [a, i]));
    q = readMol(RDKit, subJson(cg, kept, [], true));
    if (!q) return { error: `The core "${core}" can't be read without its * atoms` };

    mol = readMol(RDKit, input);
    if (!mol) return { error: 'This structure can\'t be read' };
    const g = graphOf(mol);
    const matches: { atoms: number[] }[] = JSON.parse(mol.get_substruct_matches(q, JSON.stringify({ uniquify: false, maxMatches: 200 })) || '[]');
    if (!Array.isArray(matches) || !matches.length) return { error: 'This structure doesn\'t contain the marked core' };

    const table = tableBySmiles(RDKit);
    let best: HammettSite[] | null = null, bestScore = -1;
    for (const m of matches) {
      const inCore = new Set(m.atoms);
      const sites: HammettSite[] = at.map((a, k) => {
        const t = m.atoms[qi.get(a)!];
        const subs = g.nb[t].filter((b) => !inCore.has(b) && zOf(g, b) !== 1);
        if (!subs.length) return { place: places[k], row: H_ROW, smiles: '' };
        const s = subs[0];
        // the group: everything reached from s without going back through the ring atom
        const frag = [s];
        const seen = new Set([t, s]);
        let fused = false;
        for (let i = 0; i < frag.length; i++) {
          for (const b of g.nb[frag[i]]) {
            if (seen.has(b)) continue;
            if (inCore.has(b)) { fused = true; continue; }
            seen.add(b);
            frag.push(b);
          }
        }
        if (fused) return { place: places[k], row: -1, smiles: '', fused: true };
        const bond = g.bonds.find((b) => (b.atoms[0] === t && b.atoms[1] === s) || (b.atoms[0] === s && b.atoms[1] === t));
        const fm = readMol(RDKit, subJson(g, frag, [{ atom: { z: 0, impHs: 0 }, bondTo: s, bo: bond?.bo ?? 1 }]));
        const smiles: string = fm ? fm.get_smiles() : '';
        fm?.delete();
        const row = table.get(smiles) ?? table.get(smiles.replace(/[/\\]/g, '')) ?? -1;
        return { place: places[k], row, smiles };
      });
      // prefer the way round the ring that puts groups (not hydrogens) at the marked positions
      const score = sites.filter((x) => x.smiles || x.fused).length;
      if (score > bestScore) { best = sites; bestScore = score; }
    }
    return { sites: best! };
  } catch (e) {
    return { error: `Hammett matching failed: ${String(e)}` };
  } finally {
    cm.delete();
    q?.delete?.();
    mol?.delete?.();
  }
}
