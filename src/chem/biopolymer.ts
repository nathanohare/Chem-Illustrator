// Peptides from their sequence: type ACDEF (one-letter codes) or Boc-Ala-Phe-OMe (three-letter
// codes) and get the whole structure. The backbone is a zig-zag across the page with the side
// chains in turn up and down, as peptides are usually drawn; each side chain comes from that
// amino acid's template (scripts/make-templates.mjs), so it has the template's shape and
// wedges. A residue drawn upside down (side chain down) has its wedges swapped so it keeps its
// configuration, and a D-amino acid has all of its wedges swapped (its mirror image).

import type { BondDisplay } from '../model';
import { TEMPLATES, type Template, type TemplateAtom, type TemplateBond } from './templates';

/** One residue: its one-letter code and whether it is the D-amino acid. */
export interface Residue { code: string; d: boolean }

export const N_TERMINI = ['H', 'Ac', 'Boc', 'Fmoc', 'Cbz', 'Bz'] as const;
export const C_TERMINI = ['OH', 'NH2', 'OMe', 'OEt', 'OtBu', 'OBn'] as const;
export type NTerminus = (typeof N_TERMINI)[number];
export type CTerminus = (typeof C_TERMINI)[number];

export interface PeptideOptions {
  nTerm?: NTerminus;
  cTerm?: CTerminus;
}

export interface ParsedPeptide {
  residues: Residue[];
  /** Termini written in a three-letter sequence (Boc-Ala-OMe), when there were any. */
  nTerm?: NTerminus;
  cTerm?: CTerminus;
  /** What could not be read, in words; empty when the whole sequence was read. */
  problems: string[];
}

/** The longest peptide drawn: past this the drawing is many pages wide. */
export const MAX_RESIDUES = 100;

/** The amino acid templates by one-letter code, from their names, "L-Alanine (Ala, A)". */
const AMINO = new Map<string, Template>();
const THREE = new Map<string, string>();
for (const t of TEMPLATES) {
  if (t.group !== 'amino') continue;
  const m = /\((\w{3}), (\w)\)/.exec(t.name);
  if (!m) continue;
  AMINO.set(m[2], t);
  THREE.set(m[1].toLowerCase(), m[2]);
}

/** The three-letter code for a one-letter code (A → Ala). */
export function threeLetter(code: string): string {
  return /\((\w{3}),/.exec(AMINO.get(code)?.name ?? '')?.[1] ?? code;
}

/** Codes that are amino acids but have no template (selenocysteine, pyrrolysine) or stand for a choice of two. */
const NOT_DRAWN: Record<string, string> = {
  U: 'selenocysteine', O: 'pyrrolysine', B: 'Asx (Asp or Asn)', Z: 'Glx (Glu or Gln)', J: 'Leu or Ile', X: 'any amino acid',
};

/**
 * Read a sequence. One-letter codes may have spaces, numbers and line breaks between them (as
 * copied from a FASTA file, whose > header line is skipped). With `lowercaseD`, a small letter
 * is the D-amino acid (aDa is L-Ala, D-Ala, L-Ala). Three-letter codes are joined by hyphens
 * or spaces, each one may start with D- or L-, and the ends may name a protecting group or end
 * group (H-, Ac-, Boc-, Fmoc-, Cbz- or Z-, Bz-; -OH, -NH2, -OMe, -OEt, -OtBu, -OBn).
 */
export function parsePeptide(text: string, lowercaseD = true): ParsedPeptide {
  const lines = text.split(/\r?\n/).filter((l) => !l.trim().startsWith('>'));
  const body = lines.join(' ').trim();
  if (!body) return { residues: [], problems: ['Type a sequence, such as GLYP or Boc-Ala-Phe-OMe.'] };
  const words = threeLetterWords(body);
  if (words && (/[a-z]/.test(body) || words.length > 1)) return parseThree(words);
  const residues: Residue[] = [];
  const problems: string[] = [];
  const bad = new Map<string, number[]>();
  let pos = 0;
  for (const ch of body) {
    if (/[\s\d\-–·*.,;]/.test(ch)) continue;
    pos++;
    const up = ch.toUpperCase();
    if (AMINO.has(up)) {
      residues.push({ code: up, d: lowercaseD && ch !== up && up !== 'G' });
      continue;
    }
    if (!bad.has(ch)) bad.set(ch, []);
    bad.get(ch)!.push(pos);
  }
  for (const [ch, at] of bad) {
    const what = NOT_DRAWN[ch.toUpperCase()];
    const where = at.length > 3 ? `${at.slice(0, 3).join(', ')}…` : at.join(', ');
    problems.push(what ? `${ch} (${what}) at ${where} can't be drawn: no structure for it.` : `"${ch}" at ${where} is not a one-letter amino acid code.`);
  }
  if (residues.length > MAX_RESIDUES) problems.push(`That is ${residues.length} residues; up to ${MAX_RESIDUES} can be drawn at once.`);
  return { residues, problems };
}

const N_WORDS: Record<string, NTerminus> = { h: 'H', ac: 'Ac', boc: 'Boc', fmoc: 'Fmoc', cbz: 'Cbz', z: 'Cbz', bz: 'Bz' };
const C_WORDS: Record<string, CTerminus> = { oh: 'OH', nh2: 'NH2', ome: 'OMe', oet: 'OEt', otbu: 'OtBu', obn: 'OBn', obzl: 'OBn' };

/**
 * The words of a three-letter sequence (D-Ala kept as one word, D~Ala), or null when the text
 * is not one: most words must be three-letter codes (Ala, Gly…), allowing for the two ends.
 */
function threeLetterWords(body: string): string[] | null {
  if (!/^[A-Za-z0-9()\s\-–·]+$/.test(body)) return null;
  const words = body.replace(/\b([DLdl])[-–]\s*(?=[A-Za-z]{3}\b)/g, '$1~').split(/[\s\-–·]+/).filter(Boolean);
  const isCode = (w: string) => THREE.has(w.toLowerCase().replace(/^[dl]~/, ''));
  const codes = words.filter(isCode).length;
  const ends = (N_WORDS[words[0]?.toLowerCase()] ? 1 : 0) + (C_WORDS[words[words.length - 1]?.toLowerCase()] ? 1 : 0);
  return codes > 0 && codes + ends >= words.length - (words.length > 3 ? 1 : 0) && words.every((w) => w.length <= 6) ? words : null;
}

function parseThree(words: string[]): ParsedPeptide {
  const residues: Residue[] = [];
  const problems: string[] = [];
  let nTerm: NTerminus | undefined, cTerm: CTerminus | undefined;
  words.forEach((w, i) => {
    const lw = w.toLowerCase();
    if (i === 0 && words.length > 1 && N_WORDS[lw] && !THREE.has(lw)) { nTerm = N_WORDS[lw]; return; }
    if (i === words.length - 1 && words.length > 1 && C_WORDS[lw]) { cTerm = C_WORDS[lw]; return; }
    const m = /^([dl])~(\w+)$/i.exec(w);
    const code = THREE.get((m ? m[2] : w).toLowerCase());
    if (code) residues.push({ code, d: !!m && m[1].toUpperCase() === 'D' && code !== 'G' });
    else problems.push(`"${w.replace('~', '-')}" is not a three-letter amino acid code (Ala, Gly, Phe…).`);
  });
  if (residues.length > MAX_RESIDUES) problems.push(`That is ${residues.length} residues; up to ${MAX_RESIDUES} can be drawn at once.`);
  return { residues, problems, ...(nTerm ? { nTerm } : {}), ...(cTerm ? { cTerm } : {}) };
}

/** The sequence in three-letter codes, with its ends: H-Ala-D-Phe-OH. */
export function peptideName(residues: Residue[], opts: PeptideOptions = {}): string {
  const n = opts.nTerm ?? 'H', c = opts.cTerm ?? 'OH';
  return [n, ...residues.map((r) => (r.d ? 'D-' : '') + threeLetter(r.code)), c].join('-');
}

/** A template's backbone: the amino N, the α carbon, the carboxyl carbon and its oxygens. */
function backbone(t: Template): { n: number; ca: number; co: number; acidO: number[] } {
  const nbrs = (i: number) => t.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
  const isAcid = (i: number) => t.atoms[i][2] === 'C' && t.bonds.some((b) => b[2] === 2 && (b[0] === i || b[1] === i) && t.atoms[b[0] === i ? b[1] : b[0]][2] === 'O');
  const n = t.attach;
  const ca = nbrs(n).find((i) => nbrs(i).some(isAcid))!;
  const co = nbrs(ca).find(isAcid)!;
  return { n, ca, co, acidO: nbrs(co).filter((i) => t.atoms[i][2] === 'O') };
}

/** How a residue's template is moved onto the chain: turned by an angle and moved (after being flipped top to bottom, when asked). */
type Pt = [number, number];

interface Fit { c: number; s: number; tx: number; ty: number; flip: boolean }

/** The turn and move (no stretch) that best lays the points `from` on the points `to`. */
function fit(from: [number, number][], to: [number, number][], flip: boolean): Fit {
  const f = from.map(([x, y]) => [x, flip ? -y : y]);
  const n = f.length;
  const fc = [f.reduce((s, p) => s + p[0], 0) / n, f.reduce((s, p) => s + p[1], 0) / n];
  const tc = [to.reduce((s, p) => s + p[0], 0) / n, to.reduce((s, p) => s + p[1], 0) / n];
  let dot = 0, cross = 0;
  for (let i = 0; i < n; i++) {
    const ax = f[i][0] - fc[0], ay = f[i][1] - fc[1], bx = to[i][0] - tc[0], by = to[i][1] - tc[1];
    dot += ax * bx + ay * by;
    cross += ax * by - ay * bx;
  }
  const a = Math.atan2(cross, dot), c = Math.cos(a), s = Math.sin(a);
  return { c, s, tx: tc[0] - (c * fc[0] - s * fc[1]), ty: tc[1] - (s * fc[0] + c * fc[1]), flip };
}

const apply = (k: Fit, x: number, y: number): [number, number] => {
  const yy = k.flip ? -y : y;
  return [k.c * x - k.s * yy + k.tx, k.s * x + k.c * yy + k.ty];
};

const swapWedge = (d: BondDisplay | undefined): BondDisplay | undefined => (d === 'wedge' ? 'hashWedge' : d === 'hashWedge' ? 'wedge' : d);

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The peptide as a template (a bond long, its middle at (0, 0)), ready to put in a drawing
 * with placeTemplate. The N-terminus is on the left.
 *
 * The backbone is walked one bond at a time, turning 60° one way then the other (a zig-zag).
 * Proline is the exception: its ring is fused to the backbone N–Cα bond on the side away from
 * the C=O before it, which is the side the next C′ would go, so C′ goes on the other side of
 * the ring and the chain bends there.
 */
export function peptideTemplate(residues: Residue[], opts: PeptideOptions = {}): Template {
  const atoms: TemplateAtom[] = [];
  const bonds: TemplateBond[] = [];
  const add = (x: number, y: number, el: string, label?: string) => {
    atoms.push(label ? [r3(x), r3(y), el, 0, label] : [r3(x), r3(y), el]);
    return atoms.length - 1;
  };
  const TURN = Math.PI / 3;
  const step = (p: Pt, a: number): Pt => [p[0] + Math.cos(a), p[1] + Math.sin(a)];
  const unit = (p: Pt, q: Pt): Pt => { const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };
  /** Straight out from an atom, away from the two atoms it is bonded to. */
  const outward = (p: Pt, a: Pt, b: Pt): number => { const u = unit(p, a), v = unit(p, b); return Math.atan2(-(u[1] + v[1]), -(u[0] + v[0])); };
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

  // First the backbone (and proline rings, which are part of it), walked one bond at a time:
  // where the N is, the direction of the bond that came into it, and which way the next turn goes.
  interface Placed { res: Residue; t: Template; bb: ReturnType<typeof backbone>; k: Fit; pN: Pt; pCa: Pt; pC: Pt; pO: Pt }
  const placed: Placed[] = [];
  let pN: Pt = [0, 0];
  let dir = Math.PI / 6;
  let turn = -1;
  let before: Pt = step(pN, dir + Math.PI);
  for (const res of residues) {
    const t = AMINO.get(res.code);
    if (!t) throw new Error(`No amino acid for ${res.code}`);
    const bb = backbone(t);
    const T = (a: number): Pt => [t.atoms[a][0], t.atoms[a][1]];
    dir += turn * TURN; turn = -turn;
    const pCa = step(pN, dir);
    let k: Fit;
    let pC: Pt;
    if (res.code === 'P') {
      // the ring on the N–Cα bond, on the side away from the atom before the N
      const fits = [false, true].map((flip) => fit([T(bb.n), T(bb.ca)], [pN, pCa], flip));
      const ring = t.atoms.map((_, a) => a).filter((a) => a !== bb.n && a !== bb.ca && a !== bb.co && !bb.acidO.includes(a));
      const away = (f: Fit) => ring.reduce((sum, a) => { const q = apply(f, ...T(a)); return sum + Math.hypot(q[0] - before[0], q[1] - before[1]); }, 0);
      k = away(fits[1]) > away(fits[0]) ? fits[1] : fits[0];
      // C′ on the far side of the ring: one of the two places outside it, the one nearer the zig-zag's way
      const cb = ring.find((a) => t.bonds.some((x) => (x[0] === bb.ca && x[1] === a) || (x[1] === bb.ca && x[0] === a)))!;
      const out = outward(pCa, pN, apply(k, ...T(cb)));
      const want = dir + turn * TURN;
      const spread = (42 * Math.PI) / 180;
      const pick = [out - spread, out + spread].reduce((x, y) => (Math.abs(wrap(y - want)) < Math.abs(wrap(x - want)) ? y : x));
      turn = wrap(pick - dir) > 0 ? -1 : 1;
      dir = pick;
      pC = step(pCa, dir);
    } else {
      dir += turn * TURN; turn = -turn;
      pC = step(pCa, dir);
      // the template laid on N, Cα and C′, turned over when that fits better
      const fits = [false, true].map((flip) => fit([T(bb.n), T(bb.ca), T(bb.co)], [pN, pCa, pC], flip));
      const miss = (f: Fit) => [bb.n, bb.ca, bb.co].reduce((sum, a, m) => { const q = apply(f, ...T(a)); const r = [pN, pCa, pC][m]; return sum + Math.hypot(q[0] - r[0], q[1] - r[1]); }, 0);
      k = miss(fits[1]) < miss(fits[0]) ? fits[1] : fits[0];
    }
    // the next N (or the C-terminal group), and this residue's C=O straight out between them
    dir += turn * TURN; turn = -turn;
    const pNext = step(pC, dir);
    placed.push({ res, t, bb, k, pN, pCa, pC, pO: step(pC, outward(pC, pCa, pNext)) });
    before = pC;
    pN = pNext;
  }

  // Then the atoms: the backbone first, so each side chain can be laid out clear of all of it
  const maps = placed.map(() => new Map<number, number>());
  const oAt: number[] = [];
  placed.forEach(({ res, bb, pN: n, pCa, pC, pO }, i) => {
    const nLabel = i === 0 && opts.nTerm && opts.nTerm !== 'H' ? `NH${opts.nTerm}` : undefined;
    // proline's nitrogen has no H to share with a protecting group's label: Boc-Pro is drawn as a group on N
    maps[i].set(bb.n, add(n[0], n[1], 'N', i === 0 && res.code === 'P' ? undefined : nLabel));
    maps[i].set(bb.ca, add(pCa[0], pCa[1], 'C'));
    maps[i].set(bb.co, add(pC[0], pC[1], 'C'));
    oAt.push(add(pO[0], pO[1], 'O'));
  });
  let cEnd = -1;
  if (placed.length) {
    const c = opts.cTerm ?? 'OH';
    cEnd = c === 'NH2' ? add(pN[0], pN[1], 'N') : c === 'OH' ? add(pN[0], pN[1], 'O') : add(pN[0], pN[1], 'O', c);
  }
  // proline rings next (they are fixed), then the other side chains, each turned and flipped to
  // where it is least crowded by what is already there
  const order = placed.map((_, i) => i).sort((x, y) => (placed[x].res.code === 'P' ? 0 : 1) - (placed[y].res.code === 'P' ? 0 : 1));
  const mirroredAt = new Set<number>();
  for (const i of order) {
    const { res, t, bb, k, pN: n, pCa, pC } = placed[i];
    const map = maps[i];
    const side = t.atoms.map((_, a) => a).filter((a) => !map.has(a) && !bb.acidO.includes(a));
    let pos = new Map(side.map((a) => [a, apply(k, t.atoms[a][0], t.atoms[a][1])] as [number, Pt]));
    const cb = t.bonds.find((x) => (x[0] === bb.ca && pos.has(x[1])) || (x[1] === bb.ca && pos.has(x[0])));
    const beta = cb ? (cb[0] === bb.ca ? cb[1] : cb[0]) : -1;
    if (beta >= 0 && res.code !== 'P') {
      // straight out from the α carbon, or up to 30° either way, and either way round about that line
      const [bx, by] = pos.get(beta)!;
      const axis = outward(pCa, n, pC);
      const from = Math.atan2(by - pCa[1], bx - pCa[0]);
      const near: Pt[] = atoms.map((p) => [p[0], p[1]]);
      let best: { score: number; pos: Map<number, Pt>; mirror: boolean } | null = null;
      for (const off of [0, -15, 15, -30, 30]) {
        const ang = axis + (off * Math.PI) / 180;
        const c = Math.cos(ang - from), sn = Math.sin(ang - from);
        const ax = Math.cos(ang), ay = Math.sin(ang);
        for (const mirror of [false, true]) {
          const out = new Map<number, Pt>();
          for (const [a, [x, y]] of pos) {
            let q: Pt = [pCa[0] + c * (x - pCa[0]) - sn * (y - pCa[1]), pCa[1] + sn * (x - pCa[0]) + c * (y - pCa[1])];
            if (mirror) {
              const dx = q[0] - pCa[0], dy = q[1] - pCa[1], along = dx * ax + dy * ay;
              q = [pCa[0] + 2 * along * ax - dx, pCa[1] + 2 * along * ay - dy];
            }
            out.set(a, q);
          }
          let score = Math.abs(off) / 100 + (mirror ? 0.001 : 0);
          for (const [x, y] of out.values()) for (const q of near) { const d = Math.hypot(x - q[0], y - q[1]); if (d < 1.7) score += (1.7 - d) * (1.7 - d) * 4; }
          if (!best || score < best.score - 1e-9) best = { score, pos: out, mirror };
        }
      }
      pos = best!.pos;
      if (best!.mirror) mirroredAt.add(i);
    }
    for (const a of side) {
      const [px, py] = pos.get(a)!;
      const [, , el, charge, label] = t.atoms[a];
      atoms.push(label ? [r3(px), r3(py), el, charge ?? 0, label] : charge ? [r3(px), r3(py), el, charge] : [r3(px), r3(py), el]);
      map.set(a, atoms.length - 1);
    }
  }

  // the bonds: each template's own, wedges swapped for a template turned over (and again for a
  // D-amino acid); a side chain laid out the other way round has those beyond its β carbon
  // swapped too. Then the amide bonds and the C=O groups.
  placed.forEach(({ res, t, bb, k, pN: n }, i) => {
    const map = maps[i];
    const backboneAtom = (a: number) => a === bb.n || a === bb.ca || a === bb.co;
    for (const [a, b, order, disp] of t.bonds) {
      if (!map.has(a) || !map.has(b)) continue;
      let d = disp;
      if (k.flip !== res.d) d = swapWedge(d);
      if (mirroredAt.has(i) && !backboneAtom(a) && !backboneAtom(b)) d = swapWedge(d);
      bonds.push(d ? [map.get(a)!, map.get(b)!, order, d] : [map.get(a)!, map.get(b)!, order]);
    }
    if (i === 0 && res.code === 'P' && opts.nTerm && opts.nTerm !== 'H') {
      // Boc-Pro and the like: the group on the ring nitrogen, straight out from it
      const nAt = map.get(bb.n)!;
      const nb = bonds.filter((x) => x[0] === nAt || x[1] === nAt).map((x) => atoms[x[0] === nAt ? x[1] : x[0]]);
      let vx = 0, vy = 0;
      for (const q of nb) { const [ux, uy] = unit(n, [q[0], q[1]]); vx -= ux; vy -= uy; }
      const d = Math.hypot(vx, vy) || 1;
      bonds.push([nAt, add(n[0] + vx / d, n[1] + vy / d, 'C', opts.nTerm), 1]);
    }
    if (i > 0) bonds.push([maps[i - 1].get(placed[i - 1].bb.co)!, map.get(bb.n)!, 1]);
    bonds.push([map.get(bb.co)!, oAt[i], 2]);
  });
  if (cEnd >= 0) bonds.push([maps[placed.length - 1].get(placed[placed.length - 1].bb.co)!, cEnd, 1]);
  // middle at (0, 0)
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of atoms) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  for (const a of atoms) { a[0] = r3(a[0] - cx); a[1] = r3(a[1] - cy); }
  return { id: 'peptide', name: peptideName(residues, opts), group: 'own', atoms, bonds, attach: 0, join: 'bond' };
}
