// Chemistry > Expand Label: an abbreviation (OMe, Boc, CO2Et, PPh3 on a metal) drawn out as
// the atoms and bonds it stands for, joined where the label was. Ligands on a metal use their
// template (so a chelate's donors both bond to the metal); anything else is laid out by the
// chemistry engine from SMILES and turned to lie along the bond the label hung from.

import type { Doc, Atom, Bond } from '../model';
import { isMetalAtom } from '../model';
import { Vec, dist, angleOf, DEG } from '../geom';
import { SYMBOLS, elementNumber } from './elements';
import { NICKNAMES, labelGraph, type MiniGraph } from './labels';
import { templateById, atomPlacements, crowdingOf, placeTemplate, freePlacement, type Template, type TemplateAtom, type TemplateBond, type TemplateShape, type TemplateHapto } from './templates';
import { ligandByAbbr } from './ligands';

/** Ligand abbreviations with a template, by the label written on the drawing. */
const LIGAND_TEMPLATE: Record<string, string> = {
  PPh3: 'pph3', PCy3: 'pcy3', PtBu3: 'ptbu3', 'P(t-Bu)3': 'ptbu3', XPhos: 'xphos', SPhos: 'sphos',
  dppe: 'dppe', dppp: 'dppp', dppf: 'dppf', BINAP: 'binap', Xantphos: 'xantphos', IMes: 'imes', IPr: 'ipr',
  CO: 'co', MeCN: 'mecn', NCMe: 'mecn', py: 'py', bpy: 'bipy', bipy: 'bipy', phen: 'phen', TMEDA: 'tmeda', tmeda: 'tmeda',
  en: 'en', acac: 'acac', Cp: 'cp', 'Cp*': 'cpstar', C6H6: 'benzene', COD: 'cod', cod: 'cod',
};

/** The metal a label hangs from, when its only bond is to one. */
function metalOf(doc: Doc, a: Atom): Atom | null {
  const bonds = doc.adj.get(a.id) ?? [];
  if (bonds.length !== 1) return null;
  const b = doc.bonds.get(bonds[0])!;
  const m = doc.atoms.get(b.a1 === a.id ? b.a2 : b.a1);
  return m && isMetalAtom(m) ? m : null;
}

/** The template a ligand label on a metal expands to, if there is one. */
export function ligandTemplateFor(doc: Doc, a: Atom): string | null {
  return a.label && metalOf(doc, a) ? LIGAND_TEMPLATE[a.label] ?? ligandByAbbr(a.label)?.tpl ?? null : null;
}

/**
 * A ligand's template without its metal: the free ligand drawn the way it is drawn on a metal
 * (BINAP with its PPh2 groups side by side on the left). Null for π-ligands (Cp, COD), whose
 * drawings are views onto a metal, and for small one-donor ligands (CO, OAc).
 */
export function freeLigandTemplate(t: Template): Template | null {
  if (!t.onMetal || t.hapto?.some(([m]) => m === t.attach)) return null;
  const idx = new Map<number, number>();
  const atoms: TemplateAtom[] = [];
  t.atoms.forEach((x, i) => { if (i !== t.attach) { idx.set(i, atoms.length); atoms.push(x); } });
  // (a small one-donor ligand, CO or OAc, is drawn from its SMILES like any other label)
  const donors = t.bonds.filter(([i, j]) => i === t.attach || j === t.attach).length;
  if (atoms.length < (donors >= 2 ? 2 : 6) || atoms.some((x) => x[4] === 'M')) return null;
  const bonds: TemplateBond[] = t.bonds.filter(([i, j]) => i !== t.attach && j !== t.attach).map(([i, j, o, d]) => (d ? [idx.get(i)!, idx.get(j)!, o, d] : [idx.get(i)!, idx.get(j)!, o]));
  // the middle of the ligand at (0, 0), where the label was
  const cx = atoms.reduce((s, x) => s + x[0], 0) / atoms.length, cy = atoms.reduce((s, x) => s + x[1], 0) / atoms.length;
  const donor = t.bonds.find(([i, j]) => i === t.attach || j === t.attach);
  return {
    id: `${t.id}-free`, name: t.name, group: t.group,
    atoms: atoms.map(([x, y, ...rest]) => [x - cx, y - cy, ...rest] as TemplateAtom),
    bonds,
    attach: donor ? idx.get(donor[0] === t.attach ? donor[1] : donor[0])! : 0,
    ...(t.z ? { z: t.z.filter((_, i) => i !== t.attach) } : {}),
    // the ligand's own η-bonds (dppf's iron to its rings)
    ...(t.hapto?.length ? { hapto: t.hapto.map(([m, ring, d]) => (d ? [idx.get(m)!, ring.map((i) => idx.get(i)!), d] : [idx.get(m)!, ring.map((i) => idx.get(i)!)]) as TemplateHapto) } : {}),
    ...(t.circle ? { circle: t.circle.filter((r) => !r.includes(t.attach)).map((r) => r.map((i) => idx.get(i)!)) } : {}),
    ...(t.shapes ? { shapes: t.shapes.map(([k, x1, y1, x2, y2]) => [k, x1 - cx, y1 - cy, x2 - cx, y2 - cy] as TemplateShape) } : {}),
    ...(t.upright ? { upright: true } : {}),
  };
}

/**
 * The library's ligands drawn out in full (every phenyl on its P), the same way round as their
 * usual drawings: for Expand Label Fully, loaded the first time it is used. A ligand with a metal
 * of its own (dppf) or on a metal by a π-bond has none, and is drawn out label by label.
 */
let FULL: Map<string, Template> | null = null;

export async function loadFullLigands(): Promise<void> {
  if (FULL) return;
  const data = (await import('./ligand-library-full.json')).default as unknown as Template[];
  FULL = new Map(data.map((t) => [t.id.replace(/-full$/, ''), t]));
}

/** A template, or (with `full`, once loaded) its drawing in full when there is one. */
const drawingOf = (id: string, full: boolean): Template | undefined => (full ? FULL?.get(id) : undefined) ?? templateById(id);

/** The free ligand a label standing on its own (BINAP, dppf, salen) expands to, if it is one. */
export function freeLigandFor(label: string | null, full = false): Template | null {
  if (!label) return null;
  const id = LIGAND_TEMPLATE[label] ?? ligandByAbbr(label)?.tpl;
  const t = id ? drawingOf(id, full) : undefined;
  return t ? freeLigandTemplate(t) : null;
}

/** Put a free ligand's drawing with its middle at a point. Returns the new atoms. Call inside an edit. */
export function placeFreeLigand(doc: Doc, t: Template, at: Vec, scale = 1, color?: string): number[] {
  const ids = placeTemplate(doc, t, freePlacement(at, doc.style.bondLength * scale), { noMerge: true, scale });
  if (color) for (const id of ids) doc.updateAtom(id, { color });
  return ids;
}

/** SMILES (the first atom where the label joins) for what a label stands for, or null. */
export function labelSmiles(a: Atom, ext: number): string | null {
  if (!a.label) return null;
  if (a.group) return a.group;
  if (NICKNAMES[a.label]) return NICKNAMES[a.label];
  const g = labelGraph(a.label, ext);
  return g && g.atoms.length && !g.atoms.some((x) => x.dummy) ? miniSmiles(g) : null;
}

/** SMILES for a label's atoms, from its first atom. */
export function miniSmiles(g: MiniGraph): string {
  const nbrs = g.atoms.map(() => [] as { to: number; order: number }[]);
  for (const b of g.bonds) { nbrs[b.a].push({ to: b.b, order: b.order }); nbrs[b.b].push({ to: b.a, order: b.order }); }
  const seen = new Array(g.atoms.length).fill(false);
  const ringAt = new Map<number, string[]>();
  let ring = 0;
  const bondSym = (o: number, i: number, j: number) => (o === 2 ? '=' : o === 3 ? '#' : o === 1 && g.atoms[i].aromatic && g.atoms[j].aromatic ? '-' : '');
  const atomSym = (i: number) => {
    const x = g.atoms[i];
    const sym = SYMBOLS[x.z] ?? '*';
    const s = x.aromatic ? sym.toLowerCase() : sym;
    if (x.hCount === undefined && !x.charge && !x.iso && /^(B|C|N|O|P|S|F|Cl|Br|I|b|c|n|o|p|s)$/.test(s)) return s;
    const h = x.hCount ? (x.hCount > 1 ? `H${x.hCount}` : 'H') : '';
    const c = x.charge ? (x.charge > 0 ? '+' : '-') + (Math.abs(x.charge) > 1 ? Math.abs(x.charge) : '') : '';
    return `[${x.iso || ''}${s}${h}${c}]`;
  };
  // ring closures first: bonds back to atoms already reached
  const order: number[] = [];
  const parent = new Array(g.atoms.length).fill(-1);
  const visit = (i: number) => {
    seen[i] = true;
    order.push(i);
    for (const { to } of nbrs[i]) if (!seen[to]) { parent[to] = i; visit(to); }
  };
  visit(0);
  const done = new Set<string>();
  for (const b of g.bonds) {
    if (parent[b.b] === b.a || parent[b.a] === b.b) continue;
    const key = `${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`;
    if (done.has(key)) continue;
    done.add(key);
    const n = ++ring;
    const d = n > 9 ? `%${n}` : String(n);
    const [first, second] = order.indexOf(b.a) < order.indexOf(b.b) ? [b.a, b.b] : [b.b, b.a];
    (ringAt.get(first) ?? ringAt.set(first, []).get(first)!).push(bondSym(b.order, b.a, b.b) + d);
    (ringAt.get(second) ?? ringAt.set(second, []).get(second)!).push(d);
  }
  const write = (i: number): string => {
    let s = atomSym(i) + (ringAt.get(i) ?? []).join('');
    const kids = nbrs[i].filter(({ to }) => parent[to] === i);
    kids.forEach(({ to, order: o }, k) => {
      const part = bondSym(o, i, to) + write(to);
      s += k < kids.length - 1 ? `(${part})` : part;
    });
    return s;
  };
  return write(0);
}

/**
 * Put a ligand's template on the metal its label hangs from, in place of the label (or, for a
 * ligand's name on its own, the free ligand where the name was); `full`: its drawing in full,
 * when loaded. Returns the new atoms, or null when there is no template. Call inside an edit.
 */
export function expandLigand(doc: Doc, labelId: number, full = false): number[] | null {
  const a = doc.atoms.get(labelId);
  // a ligand's name on its own (BINAP as a reagent): the free ligand, drawn where the name was
  const free = a && !doc.degree(a.id) ? freeLigandFor(a.label, full) : null;
  if (a && free) {
    const at = { x: a.x, y: a.y };
    doc.removeAtom(a.id);
    return placeFreeLigand(doc, free, at, a.s ?? 1, a.color);
  }
  const id = a && ligandTemplateFor(doc, a);
  const base = id ? templateById(id) : undefined;
  const m = a && metalOf(doc, a);
  if (!a || !base || !m) return null;
  const d = Math.max(1e-9, dist(a, m));
  const dir = { x: (a.x - m.x) / d, y: (a.y - m.y) / d };
  const at = { x: a.x, y: a.y };
  doc.removeAtom(a.id);
  const L = doc.style.bondLength * (m.s ?? 1);
  const put = (t: Template): number[] => {
    const ignore = new Set([m.id]);
    const pls = atomPlacements(t, m, dir, L, false)
      .map((pl) => ({ pl, c: crowdingOf(doc, t, pl, ignore) })).sort((p, q) => p.c - q.c);
    const ids = placeTemplate(doc, t, pls[0].pl, { existing: new Map([[t.attach, m.id]]), scale: m.s, noMerge: true });
    // one donor (PPh3, CO, py): it goes where the label was, so the metal's bonds keep their length
    const donors = t.bonds.filter(([i, j]) => i === t.attach || j === t.attach).map(([i, j]) => (i === t.attach ? j : i));
    if (donors.length === 1 && !t.hapto?.length) {
      const dn = doc.atoms.get(ids[donors[0]])!;
      const dx = at.x - dn.x, dy = at.y - dn.y;
      if (Math.hypot(dx, dy) > 0.5) doc.moveAtoms(ids.filter((x) => x !== m.id), dx, dy);
    }
    return ids;
  };
  // drawn in full: its own clean drawing, turned whichever way has most room among the metal's
  // other ligands (drawing out each label on the usual drawing crowds a chelate's backbone)
  const whole = full && id ? FULL?.get(id) : undefined;
  if (whole) return put(whole);
  return put(base);
}

interface RawMol { atoms: { x: number; y: number; sym: string; chg: number }[]; bonds: [number, number, number][] }

function readMolblock(mb: string): RawMol {
  const lines = mb.split(/\r?\n/);
  const na = parseInt(lines[3].slice(0, 3), 10), nb = parseInt(lines[3].slice(3, 6), 10);
  const atoms: RawMol['atoms'] = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    atoms.push({ x: parseFloat(l.slice(0, 10)), y: -parseFloat(l.slice(10, 20)), sym: l.slice(31, 34).trim(), chg: 0 });
  }
  const bonds: RawMol['bonds'] = [];
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push([parseInt(l.slice(0, 3), 10) - 1, parseInt(l.slice(3, 6), 10) - 1, parseInt(l.slice(6, 9), 10)]);
  }
  for (const l of lines) {
    if (!l.startsWith('M  CHG')) continue;
    const n = parseInt(l.slice(6, 9), 10);
    for (let k = 0; k < n; k++) {
      const at = atoms[parseInt(l.slice(10 + k * 8, 13 + k * 8), 10) - 1];
      if (at) at.chg = parseInt(l.slice(14 + k * 8, 17 + k * 8), 10);
    }
  }
  return { atoms, bonds };
}

const isDummy = (sym: string) => sym === '*' || sym === 'R' || sym === 'R#' || sym === 'A';

/**
 * Replace a label by the structure in a molfile (laid out from "*" + its SMILES, the * standing
 * for the atom the label hangs from): the * goes on that atom, the label's first atom where
 * the label was, the rest turned whichever way is least crowded. Call inside an edit.
 */
export function expandWithMolblock(doc: Doc, labelId: number, molblock: string): number[] {
  const a = doc.atoms.get(labelId)!;
  const raw = readMolblock(molblock);
  const L = doc.style.bondLength * (a.s ?? 1);
  const bondIds = doc.adj.get(a.id) ?? [];
  const old: Bond | undefined = bondIds.length === 1 ? doc.bonds.get(bondIds[0]) : undefined;
  const nb = old ? doc.atoms.get(old.a1 === a.id ? old.a2 : old.a1)! : null;
  const dummy = raw.atoms.findIndex((x) => isDummy(x.sym));
  const first = dummy >= 0 ? raw.bonds.find((b) => b[0] === dummy || b[1] === dummy) : undefined;
  const f = first ? (first[0] === dummy ? first[1] : first[0]) : 0;
  let sum = 0, n = 0;
  for (const [i, j] of raw.bonds) if (i !== dummy && j !== dummy) { sum += Math.hypot(raw.atoms[i].x - raw.atoms[j].x, raw.atoms[i].y - raw.atoms[j].y); n++; }
  const k = n ? L / (sum / n) : L;
  const origin = raw.atoms[f];
  // turned so the * → first atom bond lies along the drawn bond; either way over
  const angle = nb && dummy >= 0 ? angleOf({ x: a.x - nb.x, y: a.y - nb.y }) - angleOf({ x: origin.x - raw.atoms[dummy].x, y: origin.y - raw.atoms[dummy].y }) : 0;
  const placeAt = (mirror: boolean) => raw.atoms.map((p): Vec => {
    let x = p.x - origin.x, y = p.y - origin.y;
    if (mirror && dummy >= 0) {
      // mirrored across the line through the * and the first atom
      const ax = raw.atoms[dummy].x - origin.x, ay = raw.atoms[dummy].y - origin.y, al = Math.hypot(ax, ay) || 1;
      const ux = ax / al, uy = ay / al, dp = x * ux + y * uy;
      x = 2 * dp * ux - x; y = 2 * dp * uy - y;
    }
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: a.x + k * (x * c - y * s), y: a.y + k * (x * s + y * c) };
  });
  const crowd = (pts: Vec[]) => {
    let c = 0;
    pts.forEach((p, i) => {
      if (i === dummy || i === f) return;
      for (const o of doc.atomsNear(p, L * 1.2)) if (o.id !== a.id && o.id !== nb?.id) c += (L * 1.2 - dist(o, p)) / L;
    });
    return c;
  };
  const opts = [placeAt(false), placeAt(true)];
  const pts = crowd(opts[1]) < crowd(opts[0]) - 1e-6 ? opts[1] : opts[0];
  const extra = a.s && a.s !== 1 ? { s: a.s } : {};
  const ids: number[] = [];
  raw.atoms.forEach((p, i) => {
    if (i === dummy) { ids.push(-1); return; }
    const z = elementNumber(p.sym);
    ids.push(doc.addAtom(pts[i].x, pts[i].y, z ?? 6, { ...extra, charge: p.chg, label: z === undefined ? p.sym : null, ...(a.color ? { color: a.color } : {}) }).id);
  });
  for (const [i, j, o] of raw.bonds) {
    if (i === dummy || j === dummy) continue;
    doc.addBond(ids[i], ids[j], o === 4 ? 1.5 : o, 'solid', extra);
  }
  if (old && nb) {
    // the bond the label hung from now goes to its first atom, drawn as it was
    const { id: _id, a1, a2, ...rest } = old;
    void _id;
    doc.removeAtom(a.id);
    doc.addBond(a1 === a.id ? ids[f] : a1, a2 === a.id ? ids[f] : a2, rest.order, rest.display, rest);
  } else {
    doc.removeAtom(a.id);
  }
  return ids.filter((id) => id >= 0);
}

/** Usual number of bonds for the head atom of a label with more than one bond (PPh2 in a chelate). */
const VALENCE: Record<number, number> = { 5: 3, 6: 4, 7: 3, 13: 3, 14: 4, 15: 3, 16: 2, 32: 4, 33: 3, 50: 4, 51: 3 };

/**
 * SMILES for a label with two or more bonds that stands for one atom with groups on it (PPh2 on
 * a metal and a ring, SiMe2 in a bridge, NMe2): all its bonds stay on that atom. Null for
 * anything else (a chain such as CH2CH2, whose bonds belong to different atoms).
 */
export function inPlaceSmiles(doc: Doc, a: Atom): string | null {
  const deg = doc.degree(a.id);
  if (!a.label || deg < 2) return null;
  const smi = labelSmiles(a, deg);
  const g = smi ? labelGraph(a.label, deg) : null;
  if (!smi || !g || g.atoms.length < 2 || g.atoms.some((x) => x.dummy)) return null;
  const head = g.atoms[0];
  const sym = SYMBOLS[head.z];
  if (!sym || !a.label.startsWith(sym) || a.label[sym.length] === 'H' || head.charge) return null;
  // a bond to a metal is a dative one, not counted against the atom's valence
  const outside = (doc.adj.get(a.id) ?? []).filter((bid) => {
    const b = doc.bonds.get(bid)!;
    const o = doc.atoms.get(b.a1 === a.id ? b.a2 : b.a1);
    return !(o && isMetalAtom(o));
  }).length;
  const inside = g.bonds.filter((b) => b.a === 0 || b.b === 0).length;
  return VALENCE[head.z] !== undefined && inside + outside <= VALENCE[head.z] ? smi : null;
}

/**
 * Draw out a label with several bonds (PPh2 in BINAP) where it is: the label's atom becomes its
 * head atom (P), keeping all its bonds, and the groups on it go into the room round it. The
 * molfile is laid out from the label's SMILES, its first atom the head. Call inside an edit.
 */
export function expandInPlace(doc: Doc, labelId: number, molblock: string): number[] {
  const a = doc.atoms.get(labelId)!;
  const raw = readMolblock(molblock);
  const L = doc.style.bondLength * (a.s ?? 1);
  let sum = 0, n = 0;
  for (const [i, j] of raw.bonds) { sum += Math.hypot(raw.atoms[i].x - raw.atoms[j].x, raw.atoms[i].y - raw.atoms[j].y); n++; }
  const k = n ? L / (sum / n) : L;
  const o = raw.atoms[0];
  // the groups on the head atom: the parts left when it is taken away (two phenyls for PPh2)
  const part = raw.atoms.map(() => -1);
  const adj = raw.atoms.map(() => [] as number[]);
  for (const [i, j] of raw.bonds) { adj[i].push(j); adj[j].push(i); }
  const groups: { atoms: number[]; dir: number }[] = [];
  for (const s0 of adj[0]) {
    if (part[s0] >= 0) continue;
    const g = groups.length, atoms: number[] = [];
    const stack = [s0];
    part[s0] = g;
    while (stack.length) {
      const x = stack.pop()!;
      atoms.push(x);
      for (const y of adj[x]) if (y !== 0 && part[y] < 0) { part[y] = g; stack.push(y); }
    }
    // the way the group points from the head atom, in the layout
    const firsts = adj[0].filter((x) => part[x] === g);
    const dx = firsts.reduce((t, x) => t + raw.atoms[x].x - o.x, 0), dy = firsts.reduce((t, x) => t + raw.atoms[x].y - o.y, 0);
    groups.push({ atoms, dir: Math.atan2(dy, dx) });
  }
  // Each group turned to point its own way into the room round the atom: the angles chosen all
  // together, spread as evenly as they can be among the bonds the atom has already, and clear
  // of the atoms round it; each group flipped whichever way is less crowded.
  const pts: Vec[] = raw.atoms.map(() => ({ x: a.x, y: a.y }));
  const taken = (doc.adj.get(a.id) ?? []).map((bid) => { const b = doc.bonds.get(bid)!; const q = doc.atoms.get(b.a1 === a.id ? b.a2 : b.a1)!; return angleOf({ x: q.x - a.x, y: q.y - a.y }); });
  const gap = (u: number, v: number) => { const d = Math.abs(u - v) % (2 * Math.PI); return Math.min(d, 2 * Math.PI - d); };
  const ideal = (2 * Math.PI) / (taken.length + groups.length);
  const crowdR = L * 1.5;
  const step = groups.length > 2 ? 15 : 5;
  const angles = Array.from({ length: 360 / step }, (_, d) => d * step * DEG);
  // per group and angle: where its atoms go (the less crowded flip) and how crowded that is
  const options = groups.map((g) => angles.map((ang) => {
    let best: Vec[] = [], crowd = Infinity;
    for (const mirror of [false, true]) {
      const turn = ang - (mirror ? -g.dir : g.dir);
      const c = Math.cos(turn), s = Math.sin(turn);
      const at = g.atoms.map((i): Vec => {
        const x = raw.atoms[i].x - o.x, y = (mirror ? -1 : 1) * (raw.atoms[i].y - o.y);
        return { x: a.x + k * (x * c - y * s), y: a.y + k * (x * s + y * c) };
      });
      let sc = 0;
      // (a labelled atom, Cl or another group's label, takes up more room)
      for (const p of at) for (const q of doc.atomsNear(p, crowdR)) if (q.id !== a.id) sc += ((crowdR - dist(q, p)) / L) ** 2 * (q.label || q.z !== 6 ? 2 : 1);
      for (const t of taken) sc += Math.max(0, (ideal - gap(ang, t)) / ideal) ** 2 * 10;
      if (sc < crowd) { crowd = sc; best = at; }
    }
    return { at: best, crowd };
  }));
  const between = (p: Vec[], q: Vec[]) => { let c = 0; for (const u of p) for (const v of q) { const r = dist(u, v); if (r < crowdR) c += ((crowdR - r) / L) ** 2; } return c; };
  let pick: number[] = groups.map(() => 0), pickScore = Infinity;
  const choose = (g: number, chosen: number[], sc: number) => {
    if (sc >= pickScore) return;
    if (g === groups.length) { pick = [...chosen]; pickScore = sc; return; }
    angles.forEach((ang, ai) => {
      const opt = options[g][ai];
      let s2 = sc + opt.crowd;
      for (let h = 0; h < g; h++) {
        s2 += Math.max(0, (ideal - gap(ang, angles[chosen[h]])) / ideal) ** 2 * 10;
        s2 += between(opt.at, options[h][chosen[h]].at);
      }
      chosen.push(ai);
      choose(g + 1, chosen, s2);
      chosen.pop();
    });
  };
  choose(0, [], 0);
  groups.forEach((g, gi) => g.atoms.forEach((i, m) => { pts[i] = options[gi][pick[gi]].at[m]; }));
  const best = pts;
  const extra = a.s && a.s !== 1 ? { s: a.s } : {};
  const colour = a.color ? { color: a.color } : {};
  const head = elementNumber(o.sym) ?? 6;
  doc.updateAtom(a.id, { z: head, label: null, charge: o.chg });
  const ids: number[] = [a.id];
  raw.atoms.forEach((p, i) => {
    if (i === 0) return;
    const z = elementNumber(p.sym);
    ids.push(doc.addAtom(best[i].x, best[i].y, z ?? 6, { ...extra, charge: p.chg, label: z === undefined ? p.sym : null, ...colour }).id);
  });
  for (const [i, j, ord] of raw.bonds) doc.addBond(ids[i], ids[j], ord === 4 ? 1.5 : ord, 'solid', extra);
  return ids;
}
