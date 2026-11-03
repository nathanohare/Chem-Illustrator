// The Perspective tools: press on a structure and drag to turn it in 3-D. Perspective turns the
// drawing as a flat sheet, as ChemDraw does; 3-D Perspective turns the structure's real shape
// (built once, then kept: a structure turned that way stays "live" and turns on from where it
// is, until an atom or bond of it changes and the shape is built again from the drawing).
// Turn in 3-D… does the same by angles typed in. See src/chem/perspective.ts for the geometry.

import type { BondDisplay, Doc } from '../model';
import { toMolfile, type MolExport } from '../chem/molfile';
import { layerByDepth } from '../chem/crossing';
import { redrawWedges, wedgeCentres } from '../chem/place3d';
import type { PoseResult, Pose } from '../chem/pose3d';
import {
  IDENT, apply, centroid, drawingFrame, facingNormal, fitToDrawing, fitTurn, modelScale, offPlane, turnAbout,
  type DepthCues, type M3, type V3,
} from '../chem/perspective';

/** What the tools need from the rest of the app: the 3-D builder (a worker) and a way to tell two drawings of a compound apart. */
export interface PerspectiveHost {
  pose(molblock: string, cues: DepthCues, L: number): Promise<PoseResult>;
  smiles(molblock: string): Promise<string | null>;
}

/** What the drawing says about its own depth (wedges, bold and hashed bonds), for the molfile it makes. */
export function depthCues(doc: Doc, ex: MolExport): DepthCues {
  const index = new Map<number, number>();
  ex.map.forEach((id, i) => { if (id >= 0 && !index.has(id)) index.set(id, i); });
  const xy = ex.map.map((id, i): [number, number] | null => {
    const a = id >= 0 && index.get(id) === i ? doc.atoms.get(id) : undefined;
    return a ? [a.x, a.y] : null;
  });
  const cues: DepthCues = { xy, wedges: [], near: [], far: [] };
  for (const b of doc.bonds.values()) {
    const i = index.get(b.a1), j = index.get(b.a2);
    if (i === undefined || j === undefined) continue;
    if (b.display === 'wedge' || b.display === 'hashWedge') cues.wedges.push({ a: i, b: j, toward: b.display === 'wedge' });
    else if (b.display === 'bold') cues.near.push([i, j]);
    else if (b.display === 'hash') cues.far.push([i, j]);
  }
  return cues;
}

const SHOWN: Partial<Record<BondDisplay, string>> = { wedge: 'w', hashWedge: 'h', bold: 'b', hash: 'x' };

/** A structure as the 3-D builder sees it: its atoms and bonds and the depth its bonds show (not where anything is). */
export function structureKey(doc: Doc, ids: Iterable<number>): string {
  const set = new Set(ids);
  const parts: string[] = [];
  for (const id of [...set].sort((p, q) => p - q)) {
    const a = doc.atoms.get(id);
    if (a) parts.push(`${id}:${a.z}:${a.label ?? ''}:${a.charge}:${a.isotope}`);
  }
  const bonds = [...doc.bonds.values()].filter((b) => set.has(b.a1) && set.has(b.a2)).sort((p, q) => p.id - q.id);
  for (const b of bonds) parts.push(`${b.a1}-${b.a2}:${b.order}:${SHOWN[b.display] ?? ''}`);
  return parts.join('|');
}

/** Shapes built (or being built), by document and structure: built once, used for every turn after. */
const built = new WeakMap<Doc, Map<string, { map: number[]; result: Promise<PoseResult> }>>();
/** How many structures' shapes a drawing keeps (the ones used last), so a long session doesn't hold every shape ever built. */
export const POSES_KEPT = 40;
/** How many shapes a drawing keeps now (for tests). */
export function posesKept(doc: Doc): number { return built.get(doc)?.size ?? 0; }
/** Keep a shape, as the one used last, dropping the shape used longest ago when there are too many. */
function keep(byKey: Map<string, { map: number[]; result: Promise<PoseResult> }>, key: string, v: { map: number[]; result: Promise<PoseResult> }): void {
  byKey.delete(key);
  byKey.set(key, v);
  while (byKey.size > POSES_KEPT) byKey.delete(byKey.keys().next().value!);
}

function poseFor(doc: Doc, ids: number[], host: PerspectiveHost): { ex: MolExport; result: Promise<PoseResult> } {
  const ex = toMolfile(doc, ids);
  let byKey = built.get(doc);
  if (!byKey) built.set(doc, (byKey = new Map()));
  const key = structureKey(doc, ids);
  const had = byKey.get(key);
  if (had && had.map.length === ex.map.length && had.map.every((v, i) => v === ex.map[i])) { keep(byKey, key, had); return { ex, result: had.result }; }
  const result: Promise<PoseResult> = ex.generic.length
    ? Promise.resolve({ problem: 'build', message: 'A structure with R groups, or labels that can\'t be read, has no 3-D shape.' })
    : host.pose(ex.molblock, depthCues(doc, ex), doc.style.bondLength || 14.4).catch((e) => ({ problem: 'build' as const, message: String((e as Error)?.message ?? e) }));
  keep(byKey, key, { map: ex.map, result });
  // a failure is tried again next time (the worker may have been busy starting)
  void result.then((r) => { if ('problem' in r && r.problem === 'build' && byKey!.get(key)?.result === result) byKey!.delete(key); });
  return { ex, result };
}

/** After a turn the wedges may sit on other bonds: the same shape serves the structure as it now is. */
function rememberAs(doc: Doc, oldKey: string, ids: number[]): void {
  const byKey = built.get(doc);
  const had = byKey?.get(oldKey);
  if (had) keep(byKey!, structureKey(doc, ids), had);
}

/** The structures (atom ids, η-centres left out) these atoms belong to. */
export function structuresOf(doc: Doc, atomIds: Iterable<number>): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const id of atomIds) {
    if (seen.has(id) || !doc.atoms.has(id)) continue;
    const frag = doc.fragmentOf(id);
    for (const f of frag) seen.add(f);
    const ids = [...frag].filter((f) => !doc.atoms.get(f)!.multi).sort((p, q) => p - q);
    if (ids.length) out.push(ids);
  }
  return out;
}

const posOf = (doc: Doc, id: number): V3 => { const a = doc.atoms.get(id)!; return [a.x, a.y, a.depth ?? 0]; };
const median = (xs: number[]): number => { const s = [...xs].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };

/** One structure being turned: its atoms, where they start (x, y, depth), and how its wedges follow. */
interface Piece {
  ids: number[];
  start: V3[];
  /** Wedges go by depth (a real shape, or a drawing that already has depth); otherwise they turn over with the sheet. */
  solid: boolean;
  centres: Set<number>;
  /** A flat sheet: the side facing the reader at the start, and its wedges as drawn. */
  normal?: V3;
  wedges?: Map<number, BondDisplay>;
  /** The real shape's hydrogens (start positions), by the drawn atom each is on: for a crowded centre's wedge. */
  hs?: Map<number, V3>;
  /** For the shape kept for this structure. */
  key?: string;
}

/** A drawing turned as a flat sheet, keeping any depth its atoms have (a chair, a structure turned before). */
function flatPiece(doc: Doc, ids: number[]): Piece {
  const start = ids.map((id) => posOf(doc, id));
  const L = doc.style.bondLength || 14.4;
  const normal = facingNormal(start) ?? [0, 0, 1];
  const set = new Set(ids);
  const wedges = new Map<number, BondDisplay>();
  for (const b of doc.bonds.values()) if (set.has(b.a1) && set.has(b.a2) && (b.display === 'wedge' || b.display === 'hashWedge')) wedges.set(b.id, b.display);
  return { ids, start, solid: offPlane(start, normal) > 0.25 * L, centres: wedgeCentres(doc, ids), normal, wedges };
}

/**
 * A structure's real shape, placed where the drawing is: a structure turned before (its atoms'
 * depths are the shape's) goes on from where it is; otherwise the shape is turned to lie over
 * the drawing as best it can, which shows its true form at the first move.
 */
function solidPiece(doc: Doc, ids: number[], pose: Pose, ex: MolExport): Piece | null {
  const drawnAt: number[] = [];
  const pids: number[] = [];
  ex.map.forEach((id, i) => { if (id >= 0 && doc.atoms.has(id) && !pids.includes(id)) { pids.push(id); drawnAt.push(i); } });
  if (pids.length < 2) return null;
  const isDrawn = new Set(drawnAt);
  const index = new Map(pids.map((id, k) => [id, drawnAt[k]]));
  const lens: number[] = [];
  for (const b of doc.bonds.values()) {
    if (!index.has(b.a1) || !index.has(b.a2)) continue;
    const p = posOf(doc, b.a1), q = posOf(doc, b.a2);
    lens.push(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
  }
  const L = median(lens) || doc.style.bondLength || 14.4;
  const M = drawingFrame(pose.pts, modelScale(pose.pts, pose.bonds, L, (i) => isDrawn.has(i)));
  const now = pids.map((id) => posOf(doc, id));
  let place: (p: V3) => V3;
  let start: V3[];
  const live = pids.every((id) => doc.atoms.get(id)!.depth !== undefined) ? fitTurn(drawnAt.map((i) => M[i]), now) : null;
  if (live && live.rms < 0.2 * L) {
    place = (p) => { const q = apply(live.R, [p[0] - live.pc[0], p[1] - live.pc[1], p[2] - live.pc[2]]); return [q[0] + live.qc[0], q[1] + live.qc[1], q[2] + live.qc[2]]; };
    start = now;
  } else {
    const xy = ex.map.map((id, i): [number, number] | null => (isDrawn.has(i) ? [doc.atoms.get(id)!.x, doc.atoms.get(id)!.y] : null));
    const fit = fitToDrawing(M, xy);
    if (!fit) return null;
    place = (p) => { const q = apply(fit.R, [p[0] - fit.pc[0], p[1] - fit.pc[1], p[2] - fit.pc[2]]); return [q[0] + fit.qc[0], q[1] + fit.qc[1], q[2] + fit.qc[2]]; };
    start = drawnAt.map((i) => place(M[i]));
  }
  const hs = new Map<number, V3>();
  for (const [a, b] of pose.bonds) {
    for (const [heavy, h] of [[a, b], [b, a]]) {
      if (pose.z[h] !== 1 || !isDrawn.has(heavy) || h < ex.map.length) continue;
      const id = ex.map[heavy];
      if (!hs.has(id)) hs.set(id, place(M[h]));
    }
  }
  return { ids: pids, start, solid: true, centres: wedgeCentres(doc, pids), hs, key: structureKey(doc, ids) };
}

const swapWedge = (d: BondDisplay): BondDisplay => (d === 'wedge' ? 'hashWedge' : d === 'hashWedge' ? 'wedge' : d);

/** Structures being turned together about their common middle. */
export class PerspectiveTurn {
  readonly centre: V3;
  /** The last turn at which every stereocentre could be drawn so it reads right. */
  lastGood: M3 = IDENT;
  /** What the drawing meant before (a SMILES per structure), to check it still does after. */
  before: Promise<(string | null)[]> | null = null;

  constructor(readonly pieces: Piece[]) {
    this.centre = centroid(pieces.flatMap((p) => p.start));
  }

  get atomIds(): number[] { return this.pieces.flatMap((p) => p.ids); }

  /**
   * Put every atom where the turn R takes it, wedges and crossings following. `final` (at the
   * end of a turn) also draws a crowded centre's hydrogen when no bond can carry its wedge.
   * Call inside an edit. Returns how many stereocentres can't be drawn so they read right.
   */
  apply(doc: Doc, R: M3, final = false): number {
    let unshown = 0;
    for (const piece of this.pieces) {
      const pts = turnAbout(R, this.centre, piece.start);
      piece.ids.forEach((id, i) => {
        if (!doc.atoms.has(id)) return;
        const [x, y, depth] = pts[i];
        // (ChemDraw's xyz has the reader at −z)
        doc.updateAtom(id, { x, y, depth, xyz: [x, y, -depth] });
      });
      if (piece.solid) {
        const hs = piece.hs;
        const hydrogen = final && hs ? (c: number) => { const h = hs.get(c); return h ? turnAbout(R, this.centre, [h])[0] : null; } : undefined;
        unshown += redrawWedges(doc, piece.centres, new Set(piece.ids), hydrogen);
      } else if (piece.wedges?.size) {
        // a flat sheet seen from behind: what pointed towards the reader now points away
        const behind = apply(R, piece.normal!)[2] < 0;
        for (const [bid, d] of piece.wedges) if (doc.bonds.has(bid)) doc.updateBond(bid, { display: behind ? swapWedge(d) : d });
      }
    }
    layerByDepth(doc, this.atomIds);
    return unshown;
  }

  /** After a turn: the shapes built serve the structures as they now are. */
  remember(doc: Doc): void {
    for (const p of this.pieces) if (p.key) rememberAs(doc, p.key, p.ids);
  }
}

export interface Prepared {
  turn: PerspectiveTurn;
  /** Why a structure is turned flat when its 3-D shape was asked for. */
  notes: string[];
}

/**
 * Get structures ready to turn: flat sheets, or (`real`) their 3-D shapes, built if need be.
 * A structure with no 3-D shape that fits its drawing is turned flat, with a note saying why.
 */
export async function prepareTurn(doc: Doc, structures: number[][], real: boolean, host: PerspectiveHost | null): Promise<Prepared> {
  const notes: string[] = [];
  const pieces: Piece[] = [];
  const jobs = structures.map((ids) => (real && host ? poseFor(doc, ids, host) : null));
  for (let k = 0; k < structures.length; k++) {
    const ids = structures[k].filter((id) => doc.atoms.has(id));
    if (!ids.length) continue;
    const job = jobs[k];
    if (!job) { pieces.push(flatPiece(doc, ids)); continue; }
    const r = await job.result;
    const piece = 'pose' in r ? solidPiece(doc, ids, r.pose, toMolfile(doc, ids)) : null;
    if (piece) pieces.push(piece);
    else {
      notes.push('problem' in r ? r.message : 'No 3-D shape could be placed over this drawing.');
      pieces.push(flatPiece(doc, ids));
    }
  }
  const turn = new PerspectiveTurn(pieces);
  if (host) turn.before = Promise.all(pieces.map((p) => host.smiles(toMolfile(doc, p.ids).molblock).catch(() => null)));
  return { turn, notes };
}

/** Whether the structures still mean what they did before the turn (null: can't tell). */
export async function stillMeans(doc: Doc, turn: PerspectiveTurn, host: PerspectiveHost): Promise<boolean | null> {
  const before = await turn.before;
  if (!before) return null;
  const after = await Promise.all(turn.pieces.map((p) => host.smiles(toMolfile(doc, p.ids.filter((id) => doc.atoms.has(id))).molblock).catch(() => null)));
  return before.every((s, i) => !s || !after[i] || s === after[i]);
}

/** Make structures ordinary flat drawings again: they keep how they look but forget their depth. Call inside an edit. */
export function flatten(doc: Doc, atomIds: Iterable<number>): number {
  let n = 0;
  for (const id of atomIds) {
    const a = doc.atoms.get(id);
    if (!a || (a.depth === undefined && !a.xyz)) continue;
    doc.updateAtom(id, { depth: undefined, xyz: undefined });
    n++;
  }
  return n;
}

/**
 * Structures turned as they are (no shape built): flat sheets, or the 3-D shape their atoms'
 * depths already give them (a structure turned with 3-D Perspective). For the slide show's Turn
 * in 3-D, which turns copies of the slide's drawing frame by frame.
 */
export function sheetTurn(doc: Doc, atomIds: Iterable<number>): PerspectiveTurn {
  return new PerspectiveTurn(structuresOf(doc, atomIds).map((ids) => flatPiece(doc, ids)));
}
