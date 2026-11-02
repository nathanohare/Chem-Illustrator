// Builds src/chem/ligand-library.json, the Ligand Library: every ligand in
// scripts/ligands/ligand-data.mjs with its abbreviations, family, how it bonds (L and X), the
// SMILES a typed abbreviation stands for, its PubChem record (scripts/ligands/pubchem.json,
// made by check-pubchem.mjs) and a drawing of it on a metal M.
//
// Drawings are laid out by RDKit (CoordGen) from the SMILES with the metal (a silicon while it is
// laid out) bonded to each donor, so chelate rings come out regular, then turned the usual way
// round: the metal on the left and the ligand to its right, a chelate's donors either side of
// the line through the metal. Diaryl- and dialkylphosphino groups on a backbone are drawn as
// labels (PPh2, PCy2, PtBu2), the way papers draw BINAP and XPhos; Expand Label draws them out.
// π ligands and ferrocenes use the 3-D drawings made by make-metal-templates.mjs.
//
// Only the structure and its drawing (atom places and bonds) are stored; the program draws it.
//
// Run with:  node scripts/make-ligand-library.mjs   (after scripts/make-metal-templates.mjs)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FAMILIES } from './ligands/ligand-data.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RDKit = await require('@rdkit/rdkit')();
const pubchem = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ligands', 'pubchem.json'), 'utf8'));
const metalTemplates = new Map(JSON.parse(fs.readFileSync(path.join(root, 'src', 'chem', 'metal-templates.json'), 'utf8')).map((t) => [t.id, t]));
const r3 = (v) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------------ SMILES atoms

/** A bracket atom's parts: [sym H? charge? :map]. */
const BRACKET = /\[(\d*)([A-Za-z][a-z]?)(@*)(H\d?)?([+-]\d?)?(?::(\d+))?\]/g;

function bracketText(p) {
  const h = p.h ? (p.h > 1 ? `H${p.h}` : 'H') : '';
  const c = p.charge ? (p.charge > 0 ? '+' : '-') + (Math.abs(p.charge) > 1 ? Math.abs(p.charge) : '') : '';
  return `[${p.iso}${p.sym}${p.chiral}${h}${c}${p.map ? `:${p.map}` : ''}]`;
}

/** Rewrite each numbered (donor) atom of a SMILES; `f` gets its parts and returns the new text. */
function eachDonor(smiles, f) {
  return smiles.replace(BRACKET, (all, iso, sym, chiral, h, chg, map) => {
    if (!map) return all;
    const p = {
      iso, sym, chiral, map: Number(map),
      h: h ? (h.length > 1 ? Number(h.slice(1)) : 1) : 0,
      charge: chg ? (chg[0] === '+' ? 1 : -1) * (chg.length > 1 ? Number(chg.slice(1)) : 1) : 0,
    };
    return f(p);
  });
}

const donorMaps = (smiles) => [...smiles.matchAll(BRACKET)].filter((m) => m[6]).map((m) => Number(m[6]));
const isX = (map) => map >= 50;

// ------------------------------------------------------------------ molfiles

function parseMolblock(mb) {
  const lines = mb.split('\n');
  const na = parseInt(lines[3].slice(0, 3), 10), nb = parseInt(lines[3].slice(3, 6), 10);
  const atoms = [], bonds = [];
  for (let i = 0; i < na; i++) {
    const l = lines[4 + i];
    const f = l.slice(34).trim().split(/\s+/).map(Number);
    // molfiles have y up; the page has y down
    atoms.push({ x: parseFloat(l.slice(0, 10)), y: -parseFloat(l.slice(10, 20)), el: l.slice(31, 34).trim(), charge: 0, map: f[9] || 0 });
  }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i];
    bonds.push({ a: parseInt(l.slice(0, 3), 10) - 1, b: parseInt(l.slice(3, 6), 10) - 1, order: parseInt(l.slice(6, 9), 10), stereo: parseInt(l.slice(9, 12), 10) || 0 });
  }
  for (const l of lines) {
    if (!l.startsWith('M  CHG')) continue;
    const n = parseInt(l.slice(6, 9), 10);
    for (let k = 0; k < n; k++) {
      const at = atoms[parseInt(l.slice(10 + k * 8, 13 + k * 8), 10) - 1];
      if (at) at.charge = parseInt(l.slice(14 + k * 8, 17 + k * 8), 10);
    }
  }
  return { atoms, bonds };
}

// ------------------------------------------------------------------ phosphino groups kept as labels

/** Groups on a donor P drawn as one label: the group (attached at [At]) and how it is written. */
const GROUPS = [
  ['[At]c1ccccc1', 'Ph', 'PPh2'], ['[At]C1CCCCC1', 'Cy', 'PCy2'], ['[At]C(C)(C)C', 't-Bu', 'P(t-Bu)2'],
  ['[At]C(C)C', 'iPr', 'PiPr2'], ['[At]C', 'Me', 'PMe2'], ['[At]CC', 'Et', 'PEt2'],
  ['[At]c1ccccc1C', 'o-Tol', 'P(o-Tol)2'], ['[At]c1ccc(C)cc1', 'p-Tol', 'P(p-Tol)2'],
  ['[At]c1cc(C)cc(C)c1', '3,5-Xyl', 'P(3,5-Xyl)2'], ['[At]c1cc(C(C)(C)C)c(OC)c(C(C)(C)C)c1', 'DTBM', 'P(DTBM)2'],
  ['[At]C12CC3CC(CC(C3)C1)C2', 'Ad', 'PAd2'], ['[At]c1ccco1', '2-Fur', 'P(2-Fur)2'], ['[At]c1ccc(OC)cc1', 'PMP', 'P(PMP)2'],
].map(([smi, name, label]) => {
  const m = RDKit.get_mol(smi);
  const can = m.get_smiles();
  m.delete();
  return { can, name, label };
});

/** Canonical SMILES of the atoms `ids` of a structure, the atom `from` (outside them) written as [At]. */
function branchSmiles(t, ids, from) {
  const list = [from, ...ids];
  const at = new Map(list.map((i, k) => [i, k]));
  const bonds = t.bonds.filter((b) => at.has(b.a) && at.has(b.b));
  const atomLines = list.map((i, k) => {
    const el = k === 0 ? 'At' : t.atoms[i].el;
    return `${'0.0000'.padStart(10)}${'0.0000'.padStart(10)}${'0.0000'.padStart(10)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`;
  });
  const bondLines = bonds.map((b) => `${String(at.get(b.a) + 1).padStart(3)}${String(at.get(b.b) + 1).padStart(3)}${String(b.order).padStart(3)}  0`);
  const chg = list.map((i, k) => [k + 1, k ? t.atoms[i].charge : 0]).filter(([, c]) => c);
  const mb = ['', '  ligand', '', `${String(list.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atomLines, ...bondLines, ...(chg.length ? [`M  CHG${String(chg.length).padStart(3)}${chg.map(([k, c]) => `${String(k).padStart(4)}${String(c).padStart(4)}`).join('')}`] : []), 'M  END'].join('\n');
  const m = RDKit.get_mol(mb);
  if (!m) return null;
  const s = m.get_smiles();
  m.delete();
  return s;
}

const neighbours = (t, i) => t.bonds.filter((b) => b.a === i || b.b === i).map((b) => (b.a === i ? b.b : b.a));

/** The atoms reached from `start` without going through `stop`. */
function reach(t, start, stop) {
  const seen = new Set([start]);
  const todo = [start];
  while (todo.length) for (const n of neighbours(t, todo.pop())) if (n !== stop && !seen.has(n)) { seen.add(n); todo.push(n); }
  return seen;
}

/**
 * Draw each donor P's two like groups as a label (PPh2 on BINAP, PCy2 on XPhos) when the P
 * hangs from a backbone; a P with three groups of the kind we write (PPh3, PCy2Ph) is drawn out.
 * Returns the atoms to take away.
 */
function keepGroupsAsLabels(t, metal) {
  const drop = new Set();
  t.atoms.forEach((p, i) => {
    // a benzhydryl carbon (IPr*'s four CHPh₂) is drawn as CHPh2 the same way
    const benzhydryl = p.el === 'C' && !p.map;
    if (!benzhydryl && (!p.map || isX(p.map) || (p.el !== 'P' && p.el !== 'As'))) return;
    const nbrs = neighbours(t, i).filter((n) => n !== metal);
    if (nbrs.length !== 3) return;
    const kinds = nbrs.map((n) => {
      const part = reach(t, n, i);
      // a branch back to the metal or round to another of the P's groups is backbone
      if (part.has(metal) || nbrs.some((o) => o !== n && part.has(o)) || part.size > 24) return { n, part, group: null };
      const s = branchSmiles(t, [...part], i);
      return { n, part, group: GROUPS.find((g) => g.can === s) ?? null };
    });
    for (const k of kinds) {
      if (!k.group) continue;
      const same = kinds.filter((o) => o.group === k.group);
      if (same.length !== 2) continue;
      const other = kinds.find((o) => o.group !== k.group);
      if (other.group) continue; // PMe2Ph, PCy2Ph: small enough to draw out
      if (benzhydryl && k.group.name !== 'Ph') continue;
      p.label = benzhydryl ? 'CHPh2' : k.group.label;
      for (const o of same) for (const a of o.part) drop.add(a);
      break;
    }
  });
  return drop;
}

/**
 * Groups written as a label where the ligand is too crowded to draw them out (Ph-BPE's four
 * phenyls as Ph, the C₆F₅ of P(C₆F₅)₃): `names` from SHORT. Returns the atoms to take away.
 */
const SHORT = Object.fromEntries([['Ph', '[At]c1ccccc1'], ['C6F5', '[At]c1c(F)c(F)c(F)c(F)c1F']].map(([name, smi]) => {
  const m = RDKit.get_mol(smi);
  const can = m.get_smiles();
  m.delete();
  return [name, can];
}));
function shortGroups(t, metal, names) {
  const drop = new Set();
  for (const b of t.bonds) {
    for (const [near, far] of [[b.a, b.b], [b.b, b.a]]) {
      if (near === metal || far === metal || drop.has(far) || drop.has(near)) continue;
      const part = reach(t, far, near);
      if (part.has(near) || part.has(metal) || part.size > 16) continue;
      const s = branchSmiles(t, [...part], near);
      const name = names.find((n) => SHORT[n] === s);
      if (!name) continue;
      // the atom it joins by carries the label, the rest go
      t.atoms[far].label = name;
      for (const i of part) if (i !== far) drop.add(i);
    }
  }
  return drop;
}

// ------------------------------------------------------------------ one ligand

/**
 * What is wrong with a layout: how far its bonds stray from their usual length and how many
 * atoms crowd each other (bonds to the metal, atom `metal`, may be long: a crown ether's).
 */
function layoutFaults(t, metal) {
  const ls = t.bonds.filter((b) => b.a !== metal && b.b !== metal).map((b) => Math.hypot(t.atoms[b.a].x - t.atoms[b.b].x, t.atoms[b.a].y - t.atoms[b.b].y));
  if (!ls.length) return 0;
  const bl = [...ls].sort((p, q) => p - q)[Math.floor(ls.length / 2)];
  let f = 0;
  for (const l of ls) if (l > 1.35 * bl || l < 0.6 * bl) f++;
  for (let i = 0; i < t.atoms.length; i++) for (let j = i + 1; j < t.atoms.length; j++) {
    if (Math.hypot(t.atoms[i].x - t.atoms[j].x, t.atoms[i].y - t.atoms[j].y) < 0.35 * bl) f += 5;
  }
  return f;
}

/**
 * CoordGen sometimes leaves a group hanging on a long bond (Ph-BPE's phenyls, a C₆F₅) where there
 * was no room for it: a group joined by one bond (cutting it leaves the metal on the other side)
 * is brought in to the usual length, turned round the atom it hangs from to where it has most room.
 */
function shortenLongBranches(t, metal) {
  const ls = t.bonds.filter((b) => b.a !== metal && b.b !== metal).map((b) => Math.hypot(t.atoms[b.a].x - t.atoms[b.b].x, t.atoms[b.a].y - t.atoms[b.b].y));
  if (!ls.length) return;
  const bl = [...ls].sort((p, q) => p - q)[Math.floor(ls.length / 2)];
  for (const b of t.bonds) {
    if (b.a === metal || b.b === metal) continue;
    const l = Math.hypot(t.atoms[b.a].x - t.atoms[b.b].x, t.atoms[b.a].y - t.atoms[b.b].y);
    if (l < 1.3 * bl) continue;
    // the side away from the metal, if the bond is the only way to it
    for (const [near, far] of [[b.a, b.b], [b.b, b.a]]) {
      const side = reach(t, far, near);
      if (side.has(near) || side.has(metal)) continue;
      const c = t.atoms[near], f = t.atoms[far];
      const now = Math.atan2(f.y - c.y, f.x - c.x);
      const place = (ang) => {
        const d = ang - now, cs = Math.cos(d), sn = Math.sin(d);
        // turned round `near` by d, then drawn in so the bond is bl long
        const k = bl / l;
        return new Map([...side].map((i) => {
          const p = t.atoms[i];
          const x = c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y = c.y + (p.x - c.x) * sn + (p.y - c.y) * cs;
          const fx = c.x + (f.x - c.x) * cs - (f.y - c.y) * sn, fy = c.y + (f.x - c.x) * sn + (f.y - c.y) * cs;
          return [i, { x: x - (fx - c.x) * (1 - k), y: y - (fy - c.y) * (1 - k) }];
        }));
      };
      const room = (moved) => Math.min(...[...moved.values()].flatMap((q) => t.atoms.filter((_, j) => !side.has(j)).map((o) => Math.hypot(o.x - q.x, o.y - q.y))));
      let best = null, bestRoom = 0.4 * bl;
      for (let k = 0; k < 36; k++) {
        const moved = place(now + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 18));
        const r = room(moved);
        if (r > bestRoom + 1e-6) { best = moved; bestRoom = r; }
      }
      if (best) for (const [i, q] of best) Object.assign(t.atoms[i], q);
      break;
    }
  }
}

/**
 * The ligand laid out by CoordGen, or by RDKit's own depiction when that one comes out cleaner
 * (CoordGen stretches some bonds of a big chelate ring: Ph-BPE, VANOL). `metal` is the metal's
 * atom, or -1 when it is not in the layout.
 */
function bestLayout(m, metal, faults = layoutFaults) {
  m.set_new_coords(true);
  const a = parseMolblock(m.get_molblock());
  const fa = faults(a, metal);
  if (!fa) return a;
  const mb = m.get_molblock();
  m.set_new_coords(false);
  const b = parseMolblock(m.get_molblock());
  if (faults(b, metal) < fa) return b;
  // keep CoordGen's (the molecule holds the last layout made, so put it back)
  const back = RDKit.get_mol(mb);
  const out = parseMolblock(back.get_molblock());
  back.delete();
  return out;
}

/** The ligand on a metal, laid out by RDKit: atoms with places, bonds with wedges. */
function layOut(id, smiles, opts) {
  const maps = donorMaps(smiles);
  // the metal: a silicon (laid out like any atom), bonded to each donor by a ring closure across
  // the dot; an iron for crown ethers and cryptands, more donors than silicon takes
  const closures = maps.map((_, k) => `%${81 + k}`);
  const metalAtom = maps.length > 4 ? '[Fe]' : '[Si]';
  const bound = eachDonor(smiles, (p) => {
    const k = maps.indexOf(p.map);
    const q = { ...p };
    if (isX(p.map)) { if (q.h) q.h -= 1; else q.charge += 1; } else q.charge += 1;
    // the ring closure sits where the lone pair (or lost hydrogen) was, so stereo is kept
    return bracketText(q) + closures[k];
  });
  const m = RDKit.get_mol(`${metalAtom}${closures.join('')}.${bound}`);
  if (!m) throw new Error(`${id}: RDKit cannot read the ligand on its metal`);
  // (drawn in full: whichever layout has fewer crossing bonds and atoms on top of each other)
  const t = bestLayout(m, opts.free ? -1 : 0, opts.full ? tangles : layoutFaults);
  m.delete();
  const metal = 0;
  // charges as the free ligand has them (the + on L donors was only so RDKit takes the bond)
  for (const p of t.atoms) if (p.map && !isX(p.map)) p.charge -= 1;
  for (const p of t.atoms) if (p.map && isX(p.map) && p.charge > 0) p.charge -= 1;
  // a charge on a donor balanced by its neighbour (M–C≡N–R from C⁻≡N⁺R) isn't drawn
  t.atoms.forEach((p, i) => {
    if (!p.map || !p.charge) return;
    const n = neighbours(t, i).find((j) => j !== metal && t.atoms[j].charge === -p.charge);
    if (n !== undefined) { t.atoms[n].charge = 0; p.charge = 0; }
  });
  const drop = opts.full ? new Set() : keepGroupsAsLabels(t, metal);
  if (opts.short) for (const i of shortGroups(t, metal, opts.short)) drop.add(i);
  // with groups taken off, lay it out again so each label has room (P–M and P–backbone at 120°)
  if (opts.free) {
    // a macrocycle or a tetradentate chain wrapped round its metal: the free ligand laid out on
    // its own, the metal then put in the middle of its donors
    relayOut(t, new Set([...drop, metal]));
    const ds = t.atoms.filter((p) => p.map);
    t.atoms[metal].x = ds.reduce((s, p) => s + p.x, 0) / ds.length;
    t.atoms[metal].y = ds.reduce((s, p) => s + p.y, 0) / ds.length;
  } else if (drop.size) relayOut(t, drop);
  shortenLongBranches(t, metal);
  // the standard way round: metal on the left, the donors (or the whole ligand) to its right
  const M = t.atoms[metal];
  const donors = t.atoms.filter((p) => p.map);
  const mid = (ps) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length - M.x, y: ps.reduce((s, p) => s + p.y, 0) / ps.length - M.y });
  let v = mid(donors);
  // the usual bond length: the middle one of the ligand's own bonds (a crown's long bonds to its
  // metal, and bonds to atoms that are going, don't count)
  const own = t.bonds.filter((b) => b.a !== metal && b.b !== metal && !drop.has(b.a) && !drop.has(b.b))
    .map((b) => Math.hypot(t.atoms[b.a].x - t.atoms[b.b].x, t.atoms[b.a].y - t.atoms[b.b].y)).sort((p, q) => p - q);
  const bl = own.length ? own[Math.floor(own.length / 2)] : 1;
  if (Math.hypot(v.x, v.y) < 0.3 * bl) v = mid(t.atoms.filter((p, i) => i !== metal && !drop.has(i)));
  const turn = Math.hypot(v.x, v.y) < 0.3 * bl ? 0 : -Math.atan2(v.y, v.x);
  const a = turn + ((opts.turn ?? 0) * Math.PI) / 180;
  const mx = M.x, my = M.y;
  for (const p of t.atoms) {
    const x = (p.x - mx) * Math.cos(a) - (p.y - my) * Math.sin(a), y = (p.x - mx) * Math.sin(a) + (p.y - my) * Math.cos(a);
    p.x = x / bl; p.y = (opts.flip ? -y : y) / bl;
  }
  // wedges from RDKit stay right through turning; a flip swaps them
  const swap = (s) => (opts.flip ? (s === 1 ? 6 : s === 6 ? 1 : s) : s);
  const keep = t.atoms.map((_, i) => i).filter((i) => !drop.has(i));
  const at = new Map(keep.map((i, k) => [i, k]));
  return {
    atoms: keep.map((i) => t.atoms[i]),
    bonds: t.bonds.filter((b) => at.has(b.a) && at.has(b.b)).map((b) => ({ a: at.get(b.a), b: at.get(b.b), order: b.order, stereo: swap(b.stereo) })),
    metal: at.get(metal),
  };
}

/** A molfile of the atoms `keep` of `t`, with their places and wedges (so RDKit keeps the stereo). */
function molfileOf(t, keep) {
  const at = new Map(keep.map((i, k) => [i, k]));
  const bonds = t.bonds.filter((b) => at.has(b.a) && at.has(b.b));
  const f = (v) => v.toFixed(4).padStart(10);
  const atomLines = keep.map((i) => { const p = t.atoms[i]; return `${f(p.x)}${f(-p.y)}${f(0)} ${p.el.padEnd(3)} 0  0  0  0  0  0  0  0  0${String(p.map || 0).padStart(3)}  0  0`; });
  const bondLines = bonds.map((b) => `${String(at.get(b.a) + 1).padStart(3)}${String(at.get(b.b) + 1).padStart(3)}${String(b.order).padStart(3)}${String(b.stereo || 0).padStart(3)}`);
  // the L donors' + back on, so RDKit takes their bond to the metal
  const chg = keep.map((i, k) => [k + 1, t.atoms[i].charge + (t.atoms[i].map && !isX(t.atoms[i].map) ? 1 : 0)]).filter(([, c]) => c);
  const lines = ['', '  ligand', '', `${String(keep.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  1  0  0  0  0  0999 V2000`, ...atomLines, ...bondLines];
  for (let k = 0; k < chg.length; k += 8) {
    const part = chg.slice(k, k + 8);
    lines.push(`M  CHG${String(part.length).padStart(3)}${part.map(([n, c]) => `${String(n).padStart(4)}${String(c).padStart(4)}`).join('')}`);
  }
  lines.push('M  END');
  return lines.join('\n');
}

/** Lay out again the atoms not in `drop` (places and wedges change; the atoms stay as they are). */
function relayOut(t, drop) {
  const keep = t.atoms.map((_, i) => i).filter((i) => !drop.has(i));
  const m = RDKit.get_mol(molfileOf(t, keep));
  if (!m) throw new Error('RDKit cannot read the ligand with its labels:\n' + molfileOf(t, keep));
  const r = bestLayout(m, drop.has(0) ? -1 : 0);
  m.delete();
  keep.forEach((i, k) => { t.atoms[i].x = r.atoms[k].x; t.atoms[i].y = r.atoms[k].y; });
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const wedge = new Map(r.bonds.map((b) => [key(keep[b.a], keep[b.b]), b]));
  for (const b of t.bonds) {
    const w = wedge.get(key(b.a, b.b));
    if (!w) continue;
    // a wedge starts at its stereocentre: keep the bond's direction as RDKit now has it
    b.stereo = w.stereo;
    if (w.stereo && keep[w.a] !== b.a) { const x = b.a; b.a = b.b; b.b = x; }
  }
}

function template(id, name, group, laid) {
  const { atoms, bonds, metal } = laid;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of atoms) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); }
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  return {
    id, name, group,
    atoms: atoms.map((p, i) => {
      const el = i === metal ? 'C' : p.el;
      const label = i === metal ? 'M' : p.label;
      return [r3(p.x - cx), r3(p.y - cy), el, ...(p.charge || label ? [p.charge] : []), ...(label ? [label] : [])];
    }),
    bonds: bonds.map((b) => [b.a, b.b, b.order, ...(b.stereo === 1 ? ['wedge'] : b.stereo === 6 ? ['hashWedge'] : [])]),
    attach: metal,
    onMetal: true,
  };
}

/**
 * What a typed abbreviation stands for: the free ligand as SMILES (Kekulé, no stereo) starting at
 * the donor where it joins: its first X donor (acac's O, ppy's C), else its first L donor. X
 * donors written as anions (Cp⁻) get their hydrogen back.
 */
function nicknameSmiles(id, smiles) {
  const maps = donorMaps(smiles);
  const first = maps.filter(isX).sort((a, b) => a - b)[0] ?? Math.min(...maps);
  const neutral = eachDonor(smiles, (p) => (isX(p.map) && p.charge < 0 ? bracketText({ ...p, charge: p.charge + 1, h: p.h + 1 }) : bracketText(p)));
  const m = RDKit.get_mol(neutral);
  if (!m) throw new Error(`${id}: RDKit cannot read ${neutral}`);
  // the root: the atom numbered `first`, found by its place among the numbered atoms
  const mb = parseMolblock(m.get_molblock());
  const rootedAtAtom = mb.atoms.findIndex((p) => p.map === first);
  m.delete();
  const plain = RDKit.get_mol(neutral.replace(/:\d+\]/g, ']'));
  let s = plain.get_smiles(JSON.stringify({ rootedAtAtom, canonical: false, doKekule: true, doIsomericSmiles: false }));
  plain.delete();
  // RDKit writes carbons bonded to Sb as radicals ([C]); only a carbene donor is one
  if (!/\[C:\d+\]/.test(smiles)) s = s.replace(/\[C\]/g, 'C');
  return s;
}

// ------------------------------------------------------------------ everything

const ligands = [];
const templates = [];
// each ligand drawn out in full (Expand Label Fully): every phenyl on its P, the same way round
const full = [];
// (labels with more than an H on them: en's NH2 drawn out is only an N)
const hasLabels = (t) => t.atoms.some((p, i) => i !== t.attach && p[4] && !/^[A-Z][a-z]?H\d*$/.test(p[4]));
const skipped = [];

/** How tangled a drawing is: bonds that cross, and (much worse) atoms closer than half a bond. */
function tangles(t) {
  const P = t.atoms;
  const ls = t.bonds.map((b) => Math.hypot(P[b.a].x - P[b.b].x, P[b.a].y - P[b.b].y)).sort((p, q) => p - q);
  const bl = ls.length ? ls[Math.floor(ls.length / 2)] : 1;
  let n = 0;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y) < 0.5 * bl) n += 10;
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  const B = t.bonds;
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const [a, b, c, d] = [B[i].a, B[i].b, B[j].a, B[j].b];
    if (a === c || a === d || b === c || b === d) continue;
    if (cross(P[a], P[b], P[c], P[d])) n++;
  }
  return n;
}
const ids = new Set();
const abbrs = new Map();
for (const fam of FAMILIES) {
  for (const [id, abbrText, name, smiles, opts = {}] of fam.items) {
    if (ids.has(id)) throw new Error(`two ligands called ${id}`);
    ids.add(id);
    const abbr = abbrText.split('|').filter((a, i, all) => a && all.indexOf(a) === i);
    for (const a of abbr) {
      if (abbrs.has(a)) throw new Error(`${a} is the abbreviation of both ${abbrs.get(a)} and ${id}`);
      abbrs.set(a, id);
    }
    const maps = donorMaps(smiles);
    const l = opts.lx?.l ?? maps.filter((m) => !isX(m)).length;
    const x = opts.lx?.x ?? maps.filter(isX).length;
    let tpl = opts.tpl;
    if (tpl) {
      if (!metalTemplates.has(tpl)) throw new Error(`${id}: no template ${tpl} (run make-metal-templates.mjs)`);
    } else {
      tpl = `lig-${id}`;
      templates.push(template(tpl, name, opts.palette ? 'ligands' : 'ligand-lib', layOut(id, smiles, opts)));
    }
    // (not a ligand with a metal of its own (dppf's iron), nor a π-ligand: drawn out label by label)
    const drawn = tpl.startsWith('lig-') ? templates[templates.length - 1] : metalTemplates.get(tpl);
    if (!smiles.includes('.') && !opts.hapto && !opts.free && !drawn.hapto && hasLabels(drawn)) {
      // on its metal, or (when that is crowded) laid out on its own with the metal in the middle
      let laid = layOut(id, smiles, { ...opts, full: true, short: undefined });
      if (tangles(laid)) {
        const alone = layOut(id, smiles, { ...opts, full: true, short: undefined, free: true });
        if (tangles(alone) < tangles(laid)) laid = alone;
      }
      // (a crowded one is still kept: drawing out its labels one by one would be worse)
      if (tangles(laid) > 21) skipped.push(id);
      full.push(template(`${tpl}-full`, name, 'ligand-lib', laid));
    }
    const pc = pubchem[id];
    ligands.push({
      id, family: fam.id, abbr, name,
      smiles: nicknameSmiles(id, smiles),
      tpl, l, x,
      ...(opts.hapto ? { hapto: opts.hapto } : {}),
      // the PubChem record cited (check-pubchem.mjs chooses it)
      ...(pc?.cite ? { cid: pc.cite } : {}),
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.palette ? { palette: true } : {}),
    });
  }
}

const out = {
  families: FAMILIES.map(({ id, name, note }) => ({ id, name, note })),
  ligands,
  templates,
};
const file = path.join(root, 'src', 'chem', 'ligand-library.json');
fs.writeFileSync(file, JSON.stringify(out).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
console.log(`Wrote ${ligands.length} ligands (${templates.length} drawings) to ${path.relative(root, file)}`);
// kept apart, loaded only when Expand Label Fully needs it
const fullFile = path.join(root, 'src', 'chem', 'ligand-library-full.json');
fs.writeFileSync(fullFile, JSON.stringify(full).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
console.log(`Wrote ${full.length} drawings in full to ${path.relative(root, fullFile)} (crowded: ${skipped.join(', ')})`);
