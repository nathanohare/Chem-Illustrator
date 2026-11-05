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
import { DRAWN, FAMILIES } from './ligands/ligand-data.mjs';

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
  ['[At]C(C)C', 'i-Pr', 'P(i-Pr)2'], ['[At]C', 'Me', 'PMe2'], ['[At]CC', 'Et', 'PEt2'],
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
  const bondLines = bonds.map((b) => `${String(at.get(b.a) + 1).padStart(3)}${String(at.get(b.b) + 1).padStart(3)}${String(b.order === 1.5 ? 4 : b.order).padStart(3)}  0`);
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

// ------------------------------------------------------------------ groups written short

/**
 * Groups every drawing writes short (Nate, 2026-11-02): phenyl as Ph, isopropyl, tert-butyl and
 * CF₃ wherever they are; ethyl as Et on a heteroatom or a ring (not the end of a longer chain,
 * nor IPent's 3-pentyls, drawn out as Nate's picture has them); methyls on N and O (NMe₂, NMe, OMe); and on a heteroatom the groups go
 * into its label (Oi-Pr, PPh₃, N(i-Pr)₂). Phosphorus and arsenic also take the groups of GROUPS.
 */
const canOf = (smi) => { const m = RDKit.get_mol(smi); const c = m.get_smiles(); m.delete(); return c; };
const EVERYWHERE = new Map([['[At]c1ccccc1', 'Ph'], ['[At]C(C)C', 'i-Pr'], ['[At]C(C)(C)C', 't-Bu'], ['[At]C(F)(F)F', 'CF3'], ['[At]CC', 'Et']].map(([s, n]) => [canOf(s), n]));
const METHYL = canOf('[At]C');
const ON_P = new Map(GROUPS.map((g) => [g.can, g.name]));
const HETERO = new Set(['N', 'O', 'P', 'As']);
const VALENCE = { N: 3, O: 2, P: 3, As: 3 };
/**
 * A group's name as written after its atom: Ph2, Cy2Ph, (t-Bu)2. A hyphenated name after N, P
 * or As is bracketed, P(t-Bu), N(i-Pr)2, so it never reads as Pt or Ni; after O it isn't (Oi-Pr).
 */
function groupText(names, el) {
  const count = new Map();
  for (const n of names) count.set(n, (count.get(n) ?? 0) + 1);
  const plain = (n) => /^[A-Z][a-z]*$/.test(n);
  return [...count].sort((a, b) => b[1] - a[1])
    .map(([n, k]) => (k === 1 ? (plain(n) || el === 'O' ? n : `(${n})`) : plain(n) ? `${n}${k}` : `(${n})${k}`)).join('');
}

/** Older labels in make-metal-templates.mjs's drawings, written the library's way. */
const RELABEL = { iPr: 'i-Pr', tBu: 't-Bu', PiPr2: 'P(i-Pr)2', PtBu2: 'P(t-Bu)2', iPr2P: '(i-Pr)2P', tBu2P: '(t-Bu)2P' };

/** Whether atom `i` is in a ring of the ligand's own (not one closed through its metal). */
function inRing(t, i, metal) {
  const ns = neighbours(t, i).filter((n) => n !== metal && !t.atoms[n].metal);
  return ns.some((n) => {
    const seen = new Set([n]);
    const todo = [n];
    while (todo.length) for (const k of neighbours(t, todo.pop())) if (k !== i && k !== metal && !t.atoms[k].metal && !seen.has(k)) { seen.add(k); todo.push(k); }
    return ns.some((m) => m !== n && seen.has(m));
  });
}

/** Write groups short (see EVERYWHERE); returns the atoms to take away. */
function abbreviate(t, metal, gone = new Set()) {
  const drop = new Set();
  const out = (i) => gone.has(i) || drop.has(i);
  /** The terminal group reached from `near` through `far`: its atoms and its name, or null. */
  const groupAt = (near, far, names) => {
    if (far === metal || out(far) || t.atoms[far].label || t.atoms[far].metal) return null;
    const part = reach(t, far, near);
    if (part.has(near) || part.has(metal) || part.size > 24) return null;
    for (const i of part) if (out(i) || t.atoms[i].label || t.atoms[i].metal) return null;
    const name = names(branchSmiles(t, [...part], near));
    return name ? { part, name } : null;
  };
  // a heteroatom's groups go into its label: OMe, NMe2, Oi-Pr, PPh3
  t.atoms.forEach((h, i) => {
    if (i === metal || out(i) || h.label || h.charge || !HETERO.has(h.el)) return;
    const pOrAs = h.el === 'P' || h.el === 'As';
    const names = (s) => EVERYWHERE.get(s) ?? (s === METHYL ? 'Me' : pOrAs ? ON_P.get(s) : undefined);
    const all = neighbours(t, i).filter((n) => n !== metal && !t.atoms[n].virtual);
    // a wedge on it (P-stereogenic TangPhos, QuinoxP*) keeps its groups drawn on their bonds
    if (t.bonds.some((b) => (b.a === i || b.b === i) && b.stereo)) return;
    const groups = all.map((n) => groupAt(i, n, names));
    let found = groups.filter(Boolean);
    // a ligand that would be one label (PMe3, PPh3) keeps its atom drawn, its groups named on their own
    if (!found.length || found.length === all.length) return;
    // in a ring or chain (two bonds of its own) only its methyls join it (NMe); an i-Pr or Ph is
    // named on its own bond (N–i-Pr, never Ni-Pr)
    if (all.length - found.length >= 2) found = found.filter((g) => g.name === 'Me');
    if (!found.length) return;
    // hydrogens it keeps: its valence less its bonds (a bond to the metal counts for an X donor)
    const bonds = t.bonds.filter((b) => (b.a === i || b.b === i) && !b.virtual && (b.a !== metal && b.b !== metal || isX(h.map)))
      .reduce((s, b) => s + (b.order === 4 || b.order === 1.5 ? 1.5 : b.order), 0);
    // (an isocyanide's N⁺, with its charge not drawn, keeps its t-Bu drawn on its own)
    if (bonds > VALENCE[h.el] + 0.01) return;
    const hs = Math.max(0, Math.round(VALENCE[h.el] - bonds));
    h.label = h.el + (hs ? (hs > 1 ? `H${hs}` : 'H') : '') + groupText(found.map((g) => g.name), h.el);
    for (const g of found) for (const a of g.part) drop.add(a);
  });
  // on carbon (and anything else): the group's first atom carries its name
  for (const b of t.bonds) {
    if (b.virtual) continue;
    for (const [near, far] of [[b.a, b.b], [b.b, b.a]]) {
      if (near === metal || out(near)) continue;
      const g = groupAt(near, far, (s) => EVERYWHERE.get(s));
      if (!g) continue;
      // the biaryl of JohnPhos and its kin (a phenyl next to the donor's carbon) stays drawn
      const donorP = (j) => j !== metal && (t.atoms[j].el === 'P' || t.atoms[j].el === 'As') && neighbours(t, j).includes(metal);
      if (g.name === 'Ph' && t.atoms[near].el === 'C' && neighbours(t, near).some((n) => n !== far && t.atoms[n].el === 'C' && neighbours(t, n).some(donorP))) continue;
      // (an ethyl only off a ring or a heteroatom: n-butyl stays a chain, IPent's 3-pentyl stays drawn out)
      if (g.name === 'Et' && t.atoms[near].el === 'C' && !inRing(t, near, metal)) continue;
      t.atoms[far].label = g.name;
      for (const a of g.part) if (a !== far) drop.add(a);
    }
  }
  return drop;
}

/**
 * A drawing from make-metal-templates.mjs (3-D ferrocenes, XPhos, IPr…) with its groups written
 * short: the same places, the groups' other atoms taken away. Null when nothing changes.
 */
function abbreviateTemplate(tp, id) {
  const t = {
    atoms: tp.atoms.map(([x, y, el, charge = 0, label]) => ({ x, y, el, charge, label: label === 'M' ? undefined : RELABEL[label] ?? label, metal: label !== 'M' && /^(Fe|Ru|Co|Ni|Cr|Mn|Os|Rh|Ir|Pd|Pt|Ti|Zr|Hf|Si)$/.test(el) && !label })),
    bonds: tp.bonds.map(([a, b, order, display]) => ({ a, b, order, stereo: display === 'wedge' || display === 'hashWedge' ? 1 : 0 })),
  };
  // hapto bonds hold rings to their metal (Q-Phos's Cp rings on Fe)
  for (const [m, members] of tp.hapto ?? []) for (const a of members) t.bonds.push({ a: m, b: a, order: 1, virtual: true });
  const drop = abbreviate(t, tp.attach);
  const relabelled = tp.atoms.some((a) => a[4] && RELABEL[a[4]]);
  if (!drop.size && !relabelled) return null;
  const keep = tp.atoms.map((_, i) => i).filter((i) => !drop.has(i));
  const at = new Map(keep.map((i, k) => [i, k]));
  const out = {
    ...tp,
    id: `lig-${id}`,
    group: 'ligand-lib',
    atoms: keep.map((i) => {
      const a = tp.atoms[i].slice(0, 3);
      const label = t.atoms[i].label ?? (tp.atoms[i][4] === 'M' ? 'M' : undefined);
      const charge = tp.atoms[i][3] ?? 0;
      return label || charge ? [...a, charge, ...(label ? [label] : [])] : a;
    }),
    bonds: tp.bonds.filter(([a, b]) => at.has(a) && at.has(b)).map(([a, b, ...rest]) => [at.get(a), at.get(b), ...rest]),
    attach: at.get(tp.attach),
  };
  if (tp.hapto) out.hapto = tp.hapto.map(([m, members, ...rest]) => [at.get(m), members.map((a) => at.get(a)), ...rest]);
  if (tp.circle) out.circle = tp.circle.filter((r) => r.every((a) => at.has(a))).map((r) => r.map((a) => at.get(a)));
  if (tp.z) out.z = keep.map((i) => tp.z[i]);
  if (tp.xyz) out.xyz = keep.map((i) => tp.xyz[i]);
  if (tp.fuse) delete out.fuse;
  if (out.circle && !out.circle.length) delete out.circle;
  return out;
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

/** R/S of each atom of a SMILES, by atom index (RDKit's CIP labeller). */
function cipLabels(smiles) {
  const m = RDKit.get_mol(smiles);
  if (!m) return null;
  try {
    const atoms = JSON.parse(m.get_json()).molecules[0].atoms.length;
    return Object.assign(new Map(JSON.parse(m.get_stereo_tags()).CIP_atoms ?? []), { atoms });
  } finally { m.delete(); }
}

/**
 * The ligand bound by ring closures (`bound`) with each stereogenic donor the same way round as in
 * the free ligand. RDKit reads a lone pair on a SMILES's first atom as coming before the bond that
 * replaces it, so the first P of DIPAMP, BenzP*, QuinoxP*, TangPhos and DuanPhos came out turned
 * over and the drawings on the metal were the meso isomers. Checked with an H where the metal goes
 * (an H ranks lowest, as the lone pair does): a donor whose R/S differs from the free ligand's has
 * its @ and @@ swapped.
 */
function keepDonorStereo(smiles, bound, closures) {
  const free = cipLabels(smiles);
  if (!free?.size) return bound;
  const n = closures.length;
  const misses = (b) => {
    const got = cipLabels(`${closures.map((c) => `[H]${c}`).join('.')}.${b}`);
    if (!got) return Infinity;
    // (the H atoms come first, unless RDKit took them off and left them implicit)
    const off = got.atoms > free.atoms ? n : 0;
    let k = 0;
    for (const [i, l] of free) if (got.get(i + off) !== l) k++;
    return k;
  };
  let best = bound, worst = misses(bound);
  for (const map of donorMaps(smiles)) {
    if (!worst) break;
    const flipped = eachDonor(best, (p) => bracketText(p.map === map && p.chiral ? { ...p, chiral: p.chiral === '@' ? '@@' : '@' } : p));
    const k = misses(flipped);
    if (k < worst) { best = flipped; worst = k; }
  }
  return best;
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
  const m = RDKit.get_mol(`${metalAtom}${closures.join('')}.${keepDonorStereo(smiles, bound, closures)}`);
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
  // (P-stereogenic ones drawn in full, DIPAMP, still have their OMe and Ph written short)
  if (!opts.drawnOut) for (const i of abbreviate(t, metal, drop)) drop.add(i);
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
  // an atom standing for a group (t-Bu, Ph) gets an isotope of its own, so it isn't taken for the
  // methyl beside it: else QuinoxP*'s P(Me)(t-Bu) or Feringa's CH(Me)Ph would lose their stereo
  const iso = keep.map((i, k) => [k + 1, 200 + k]).filter(([n]) => t.atoms[keep[n - 1]].label);
  for (let k = 0; k < iso.length; k += 8) {
    const part = iso.slice(k, k + 8);
    lines.push(`M  ISO${String(part.length).padStart(3)}${part.map(([n, v]) => `${String(n).padStart(4)}${String(v).padStart(4)}`).join('')}`);
  }
  lines.push('M  END');
  return lines.join('\n');
}

/** Lay out again the atoms not in `drop` (places and wedges change; the atoms stay as they are). */
function relayOut(t, drop) {
  const keep = t.atoms.map((_, i) => i).filter((i) => !drop.has(i));
  const m = RDKit.get_mol(molfileOf(t, keep));
  // (an isocyanide, its charges not drawn, is left where it was)
  if (!m) return;
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
      // with its groups written short, the library's own copy of it
      const short = abbreviateTemplate(metalTemplates.get(tpl), id);
      if (short) {
        templates.push({ ...short, name, group: 'ligand-lib' });
        tpl = short.id;
      }
    } else {
      tpl = `lig-${id}`;
      templates.push(template(tpl, name, opts.palette ? 'ligands' : 'ligand-lib', layOut(id, smiles, opts)));
    }
    // (not a ligand with a metal of its own (dppf's iron), nor a π-ligand: drawn out label by label)
    const drawn = tpl.startsWith('lig-') ? templates[templates.length - 1] : metalTemplates.get(tpl);
    if (!smiles.includes('.') && !opts.hapto && !opts.free && !drawn.hapto && hasLabels(drawn)) {
      // on its metal, or (when that is crowded) laid out on its own with the metal in the middle
      let laid = layOut(id, smiles, { ...opts, full: true, drawnOut: true, short: undefined });
      if (tangles(laid)) {
        const alone = layOut(id, smiles, { ...opts, full: true, drawnOut: true, short: undefined, free: true });
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
      // the enantiomer drawn, for a chiral ligand
      ...(DRAWN[id] ? { drawn: DRAWN[id] } : {}),
      // the PubChem record cited (check-pubchem.mjs chooses it)
      ...(pc?.cite ? { cid: pc.cite } : {}),
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.palette ? { palette: true } : {}),
    });
  }
}

/**
 * A ligand with one donor written as a label (M–PCy2 on RuPhos): the label runs right from the
 * donor, so the rest of the ligand is turned round the donor to where the label is clearest of
 * its bonds, atoms and other labels (and the angle at the donor stays open).
 */
function labelRoom(tp) {
  if (tp.hapto || tp.z || tp.xyz) return null;
  const A = tp.atoms, M = tp.attach;
  const nb = (i) => tp.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
  const donors = nb(M);
  if (donors.length !== 1) return null;
  const d = donors[0];
  const label = A[d][4];
  if (!label || label.length <= A[d][2].length) return null;
  const rest = nb(d).filter((i) => i !== M);
  if (rest.length !== 1) return null;
  if (A[M][0] > A[d][0] - 0.5) return null;
  const seen = new Set([rest[0]]);
  const todo = [rest[0]];
  while (todo.length) for (const n of nb(todo.pop())) if (n !== d && n !== M && !seen.has(n)) { seen.add(n); todo.push(n); }
  if (seen.has(M)) return null;
  // a label's box, in bond lengths: about 0.4 a letter, written right from its atom (left when
  // it starts with a bracket or a group, as (t-Bu)2P does)
  const W = 0.38, H = 0.45;
  const boxOf = (x, y, text, right = true) => {
    const w = W * text.replace(/[0-9]/g, '').length + 0.15 * (text.match(/[0-9]/g)?.length ?? 0);
    return right ? { x1: x - 0.3, x2: x - 0.2 + w, y1: y - H, y2: y + H } : { x1: x + 0.2 - w, x2: x + 0.3, y1: y - H, y2: y + H };
  };
  const inBox = (r, x, y) => x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2;
  const overlap = (r, q) => Math.max(0, Math.min(r.x2, q.x2) - Math.max(r.x1, q.x1)) * Math.max(0, Math.min(r.y2, q.y2) - Math.max(r.y1, q.y1));
  // turned round the donor, and (with no wedges to keep) maybe mirrored in its bond first
  const axis = Math.atan2(A[rest[0]][1] - A[d][1], A[rest[0]][0] - A[d][0]);
  const place = (turn, mirror = false) => {
    const c = Math.cos(turn), sn = Math.sin(turn);
    const c2 = Math.cos(2 * axis), s2 = Math.sin(2 * axis);
    return A.map((p, i) => {
      if (!seen.has(i)) return [p[0], p[1]];
      let x = p[0] - A[d][0], y = p[1] - A[d][1];
      if (mirror) [x, y] = [x * c2 + y * s2, x * s2 - y * c2];
      return [A[d][0] + x * c - y * sn, A[d][1] + x * sn + y * c];
    });
  };
  const chiral = tp.bonds.some((b) => b[3] === 'wedge' || b[3] === 'hashWedge');
  const score = (P) => {
    const box = boxOf(P[d][0], P[d][1], label);
    let f = 0;
    for (const [a, b] of tp.bonds) {
      if (a === d || b === d) continue;
      for (let k = 0; k <= 10; k++) if (inBox(box, P[a][0] + (P[b][0] - P[a][0]) * k / 10, P[a][1] + (P[b][1] - P[a][1]) * k / 10)) f += 1;
    }
    P.forEach((p, i) => {
      if (i === d || !A[i][4]) return;
      f += 40 * overlap(box, boxOf(p[0], p[1], A[i][4], p[0] >= P[d][0]));
    });
    // nothing turned onto the metal's label or the donor–metal bond
    const mBox = { x1: P[M][0] - 0.35, x2: P[M][0] + 0.35, y1: P[M][1] - 0.4, y2: P[M][1] + 0.4 };
    for (const i of seen) {
      if (A[i][4]) f += 40 * overlap(mBox, boxOf(P[i][0], P[i][1], A[i][4], P[i][0] >= P[d][0]));
      for (const j of [M, d]) if (Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < 0.75 && i !== rest[0]) f += 5;
    }
    for (const [a, b] of tp.bonds) {
      if (!seen.has(a) && !seen.has(b)) continue;
      for (let k = 0; k <= 10; k++) {
        const x = P[a][0] + (P[b][0] - P[a][0]) * k / 10, y = P[a][1] + (P[b][1] - P[a][1]) * k / 10;
        if (inBox(mBox, x, y)) f += 1;
        // across the donor–metal bond
        const t = ((x - P[d][0]) * (P[M][0] - P[d][0]) + (y - P[d][1]) * (P[M][1] - P[d][1])) / ((P[M][0] - P[d][0]) ** 2 + (P[M][1] - P[d][1]) ** 2);
        if (t > 0.15 && t < 0.85) {
          const px = P[d][0] + t * (P[M][0] - P[d][0]), py = P[d][1] + t * (P[M][1] - P[d][1]);
          if (Math.hypot(x - px, y - py) < 0.2) f += 1;
        }
      }
    }
    // the bond from the donor into its own label
    const r = P[rest[0]];
    for (let k = 1; k <= 10; k++) if (inBox({ ...box, x1: box.x1 + 0.45 }, P[d][0] + (r[0] - P[d][0]) * k / 10, P[d][1] + (r[1] - P[d][1]) * k / 10)) f += 2;
    return f;
  };
  const angleAt = (P) => {
    const u = [P[M][0] - P[d][0], P[M][1] - P[d][1]], v = [P[rest[0]][0] - P[d][0], P[rest[0]][1] - P[d][1]];
    return Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v));
  };
  return { place, score, angleAt, chiral, apply: (P) => P.forEach(([x, y], i) => { A[i][0] = r3(x); A[i][1] = r3(y); }) };
}

/**
 * One turn (and mirror) for all of `rooms` together, the one with their labels clearest: one
 * ligand's own, or a whole family's, which then stays drawn one way round.
 */
function bestTurn(rooms) {
  let best = null, bestF = rooms.reduce((s, r) => s + r.score(r.place(0)), 0) - 1e-9;
  if (bestF <= 0) return;
  const n = rooms.length;
  for (const mirror of rooms.some((r) => r.chiral) ? [false] : [false, true]) for (let k = -36; k <= 36; k++) {
    const turn = (k * 5 * Math.PI) / 180;
    const Ps = rooms.map((r) => r.place(turn, mirror));
    if (rooms.some((r, i) => r.angleAt(Ps[i]) < (95 * Math.PI) / 180)) continue;
    const f = rooms.reduce((s, r, i) => s + r.score(Ps[i]), 0) + n * (Math.abs(k) * 0.01 + (mirror ? 0.5 : 0));
    if (f < bestF) { best = Ps; bestF = f; }
  }
  if (best) rooms.forEach((r, i) => r.apply(best[i]));
}
function clearDonorLabel(tp) {
  const room = labelRoom(tp);
  if (room) bestTurn([room]);
}
// ------------------------------------------------------------------ laid out as Nate draws them

// Nate's lab drawings (his ligand inventory, and pictures he sent): each ligand's atoms with their
// places, in bond lengths (atoms only drawn inside a label have no place), and its bonds
const REFS = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'ligands', 'reference-layouts.json'), 'utf8'));
const pad3 = (n) => String(n).padStart(3);

/** A molecule of just the atoms and which are bonded (every bond single), for matching drawings. */
function skeletonMol(els, bonds) {
  const z = '    0.0000';
  const lines = ['', '  skeleton', '', `${pad3(els.length)}${pad3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`,
    ...els.map((el) => `${z}${z}${z} ${String(el).padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map(([a, b]) => `${pad3(a + 1)}${pad3(b + 1)}  1  0`), 'M  END'];
  try { return RDKit.get_mol(lines.join('\n')) || null; } catch { return null; }
}

/**
 * The drawing's stereo as isomeric SMILES (wedges read against its places), or '' when it has
 * none. The metal is read too (a silicon, an L donor charged as it takes the bond), so a
 * P-stereogenic donor's wedge is read with its bond to the metal, as a chemist reads it; each
 * label gets an isotope of its own (t-Bu isn't the methyl beside it).
 */
function stereoKey(tp) {
  const A = tp.atoms;
  const order = (i) => tp.bonds.reduce((s, b) => s + (b[0] === i || b[1] === i ? (b[2] === 1.5 ? 1.5 : b[2] || 1) : 0), 0);
  const nbM = new Set(tp.bonds.filter((b) => b[0] === tp.attach || b[1] === tp.attach).map((b) => (b[0] === tp.attach ? b[1] : b[0])));
  const f = (v) => v.toFixed(4).padStart(10);
  const lines = ['', '  stereo', '', `${pad3(A.length)}${pad3(tp.bonds.length)}  0  0  0  0  0  0  0  0999 V2000`,
    ...A.map((a, i) => `${f(a[0])}${f(-a[1])}${f(0)} ${String(i === tp.attach ? 'Si' : a[2]).padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    // (a wedge from the metal shows how the metal's bonds lie, not the ligand's stereo)
    ...tp.bonds.map(([a, b, o, d]) => `${pad3(a + 1)}${pad3(b + 1)}${pad3(o === 1.5 ? 4 : o >= 1 && o <= 3 ? o : 1)}${pad3(a === tp.attach ? 0 : d === 'wedge' ? 1 : d === 'hashWedge' ? 6 : 0)}`)];
  A.forEach((a, i) => {
    if (i === tp.attach) return;
    const extra = nbM.has(i) && !a[4] && ((a[2] === 'P' || a[2] === 'N') && order(i) >= 4 || a[2] === 'O' && order(i) >= 3) ? 1 : 0;
    if ((a[3] || 0) + extra) lines.push(`M  CHG  1${String(i + 1).padStart(4)}${String((a[3] || 0) + extra).padStart(4)}`);
    if (a[4]) lines.push(`M  ISO  1${String(i + 1).padStart(4)}${String(200 + i).padStart(4)}`);
  });
  lines.push('M  END');
  let m = null;
  try { m = RDKit.get_mol(lines.join('\n')); } catch { m = null; }
  if (!m) return '';
  const s = m.get_smiles();
  m.delete();
  return /[@/\\]/.test(s) ? s : '';
}

/** Whether the metal's letter lies on another label, or on an atom other than its donors. */
function metalCrowded(tp) {
  const A = tp.atoms, M = tp.attach;
  const nb = (i) => tp.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
  const donors = nb(M);
  const mBox = { x1: A[M][0] - 0.35, x2: A[M][0] + 0.35, y1: A[M][1] - 0.4, y2: A[M][1] + 0.4 };
  return A.some((a, i) => {
    if (i === M || donors.includes(i)) return false;
    if (Math.hypot(a[0] - A[M][0], a[1] - A[M][1]) < 0.6) return true;
    if (!a[4]) return false;
    const ends = nb(i).map((n) => [A[n][0], A[n][1]]);
    return boxOverlap(labelBox(a[0], a[1], a[4], runsRight(a[0], a[1], ends)), mBox) > 0.02;
  });
}

/**
 * After the metal has moved: a donor whose wedges now read the other way round (against
 * `turns`, from donorTurns before the move) has them turned over (wedge ↔ hash), so it is the
 * same stereoisomer with its metal where it now is.
 */
function keepTurns(tp, turns) {
  const M = tp.attach;
  const now = donorTurns(tp, tp.atoms[M][0], tp.atoms[M][1]);
  turns.forEach((t, k) => {
    if (!t.sign || !now[k].sign || now[k].sign === t.sign) return;
    for (const b of tp.bonds) if (b[0] === t.donor && b[1] !== M && b[3]) b[3] = b[3] === 'wedge' ? 'hashWedge' : 'wedge';
  });
}

/** Where the donors' lone pairs point: a bond on from each, away from its other bonds (averaged). */
function lonePairSpot(tp) {
  const A = tp.atoms, M = tp.attach;
  const ds = tp.bonds.filter((b) => b[0] === M || b[1] === M).map((b) => (b[0] === M ? b[1] : b[0]));
  const spots = ds.map((d) => {
    const ns = tp.bonds.filter((b) => (b[0] === d || b[1] === d) && b[0] !== M && b[1] !== M).map((b) => (b[0] === d ? b[1] : b[0]));
    let [ux, uy] = ns.reduce(([sx, sy], n) => { const dx = A[n][0] - A[d][0], dy = A[n][1] - A[d][1], l = Math.hypot(dx, dy) || 1; return [sx - dx / l, sy - dy / l]; }, [0, 0]);
    const l = Math.hypot(ux, uy);
    if (l < 1e-3) [ux, uy] = [A[M][0] - A[d][0], A[M][1] - A[d][1]];
    const k = Math.hypot(ux, uy) || 1;
    return [A[d][0] + ux / k, A[d][1] + uy / k];
  });
  return spots.length ? [spots.reduce((s, p) => s + p[0], 0) / spots.length, spots.reduce((s, p) => s + p[1], 0) / spots.length] : [A[M][0], A[M][1]];
}

/**
 * Which way round each stereocentre donor's wedges are, with the metal at (x, y): the sign of
 * the volume its four bonds span (a wedge up, a hash down, the rest flat; 0 when they read
 * neither way). Moving the metal must never turn a P-stereogenic donor over.
 */
function donorTurns(tp, x, y) {
  const A = tp.atoms, M = tp.attach;
  const out = [];
  for (const d of tp.bonds.filter((b) => b[0] === M || b[1] === M).map((b) => (b[0] === M ? b[1] : b[0]))) {
    const bs = tp.bonds.filter((b) => (b[0] === d || b[1] === d) && b[0] !== M && b[1] !== M);
    if (bs.length !== 3 || !bs.some((b) => b[0] === d && b[3])) continue;
    const v = bs.map((b) => {
      const n = b[0] === d ? b[1] : b[0];
      const dx = A[n][0] - A[d][0], dy = A[n][1] - A[d][1], l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l, b[0] === d ? (b[3] === 'wedge' ? 1 : b[3] === 'hashWedge' ? -1 : 0) : 0];
    });
    const lm = Math.hypot(x - A[d][0], y - A[d][1]) || 1;
    const w = [(x - A[d][0]) / lm, (y - A[d][1]) / lm, 0];
    const [a, b, c] = v.map((p) => [p[0] - w[0], p[1] - w[1], p[2] - w[2]]);
    const vol = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    out.push({ donor: d, sign: Math.abs(vol) < 0.05 ? 0 : Math.sign(vol) });
  }
  return out;
}

/**
 * Lay drawing `tp` out as `ref` is drawn: each atom where its match in ref is, the wedges kept
 * meaning what they did (a wedge may become a hash, never a different stereoisomer), then the
 * metal put where its bonds and the labels have most room. Returns whether it was laid out so.
 */
function adoptReference(tp, ref, loose = false, softM = false) {
  const A = tp.atoms, M = tp.attach;
  const nbOf = (i) => tp.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
  const donors = nbOf(M);
  const keep = A.map((_, i) => i).filter((i) => i !== M);
  const at = new Map(keep.map((i, k) => [i, k]));
  // (loose: only the donors' elements have to match, for a ligand drawn like its family's one Nate drew)
  const ours = skeletonMol(keep.map((i) => (loose && !donors.includes(i) ? '*' : A[i][2])), tp.bonds.filter(([a, b]) => at.has(a) && at.has(b)).map(([a, b]) => [at.get(a), at.get(b)]));
  const rk = ref.atoms.map((_, i) => i).filter((i) => ref.atoms[i][2] !== 'M');
  const rat = new Map(rk.map((i, k) => [i, k]));
  const theirs = skeletonMol(rk.map((i) => ref.atoms[i][2]), ref.bonds.filter(([a, b]) => rat.has(a) && rat.has(b)).map(([a, b]) => [rat.get(a), rat.get(b)]));
  if (!ours || !theirs) { ours?.delete(); theirs?.delete(); return false; }
  // (no match comes back as {})
  const found = JSON.parse(theirs.get_substruct_matches(ours) || '[]');
  const matches = Array.isArray(found) ? found : [];
  ours.delete(); theirs.delete();
  const before = stereoKey(tp);
  const xy0 = A.map((a) => [a[0], a[1]]);
  const wedge0 = tp.bonds.map((b) => b[3]);
  const ends0 = tp.bonds.map((b) => [b[0], b[1]]);
  const restore = () => {
    A.forEach((a, i) => { a[0] = xy0[i][0]; a[1] = xy0[i][1]; });
    tp.bonds.forEach((b, k) => { [b[0], b[1]] = ends0[k]; b[3] = wedge0[k]; if (!b[3]) b.length = 3; });
  };
  const wedged = tp.bonds.map((b, k) => k).filter((k) => wedge0[k] === 'wedge' || wedge0[k] === 'hashWedge');
  for (const m of matches) {
    const pos = m.atoms.map((k) => ref.atoms[rk[k]]);
    if (pos.some((p) => p[0] === null)) continue;
    keep.forEach((i, k) => { A[i][0] = pos[k][0]; A[i][1] = pos[k][1]; });
    // one donor with its groups all round it (a free PAr₃ drawn flat) leaves no room for the metal
    if (donors.length === 1) {
      const d = donors[0];
      const angs = nbOf(d).filter((n) => n !== M).map((n) => Math.atan2(A[n][1] - A[d][1], A[n][0] - A[d][0])).sort((p, q) => p - q);
      const gap = angs.length < 2 ? 2 * Math.PI : Math.max(...angs.map((a, k) => (k ? a - angs[k - 1] : a + 2 * Math.PI - angs[angs.length - 1])));
      if (gap < (125 * Math.PI) / 180) { restore(); return false; }
    }
    // the metal where the donors' lone pairs point (or where Nate drew it), so a P-stereogenic
    // donor's wedges are read with it where it will go
    const refM = ref.atoms.findIndex((p) => p[2] === 'M');
    [A[M][0], A[M][1]] = refM >= 0 && !softM ? [ref.atoms[refM][0], ref.atoms[refM][1]] : lonePairSpot(tp);
    // the same stereoisomer: some wedges may have to become hashes (and back) in the new places
    let ok = !before;
    for (let mask = 0; !ok && mask < 1 << Math.min(wedged.length, 8); mask++) {
      wedged.forEach((k, j) => { tp.bonds[k][3] = mask & (1 << j) ? (wedge0[k] === 'wedge' ? 'hashWedge' : 'wedge') : wedge0[k]; });
      ok = stereoKey(tp) === before;
    }
    if (!ok) { restore(); continue; }
    if (refM >= 0 && softM) {
      // (drawn like a ligand of its family: its metal where that one's is, unless its labels need it moved)
      const at0 = [ref.atoms[refM][0], ref.atoms[refM][1]];
      placeMetalStretched(tp, at0);
      if (stretchLabels(tp)) placeMetalStretched(tp, at0);
    } else if (refM >= 0) {
      A[M][0] = ref.atoms[refM][0]; A[M][1] = ref.atoms[refM][1];
      // its bonds drawn as there (a donor in front, one behind)
      for (const [a, b, d] of ref.bonds) {
        if (!d || (a !== refM && b !== refM)) continue;
        const other = a === refM ? b : a;
        const k = m.atoms.findIndex((x) => rk[x] === other);
        const bond = k >= 0 && tp.bonds.find((x) => (x[0] === M && x[1] === keep[k]) || (x[1] === M && x[0] === keep[k]));
        if (bond) { bond[0] = M; bond[1] = keep[k]; bond[3] = d; }
      }
    } else if (placeMetalStretched(tp) > 40) {
      // (drawn stretched out, as a free ligand often is, its donors too far apart to hold a metal)
      restore();
      return false;
    } else if (stretchLabels(tp)) placeMetalStretched(tp);
    if (stereoKey(tp) !== before) { restore(); continue; }
    // (centred, as every drawing is)
    const xs = A.map((a) => a[0]), ys = A.map((a) => a[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const a of A) { a[0] = r3(a[0] - cx); a[1] = r3(a[1] - cy); }
    return true;
  }
  return false;
}

/**
 * Lengthen the bond to each labelled end atom (a bisphosphine's PPh2) a little at a time while
 * its label overlaps another's: Nate allows bonds stretched so labels don't collide (up to 1.8
 * bond lengths). Returns whether anything moved.
 */
function stretchLabels(tp) {
  const A = tp.atoms, M = tp.attach;
  const nb = (i) => tp.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
  const ends = A.map((_, i) => i).filter((i) => i !== M && A[i][4] && A[i][4] !== 'M' && nb(i).filter((n) => n !== M).length === 1);
  if (ends.length < 2) return false;
  const boxOf = (i) => labelBox(A[i][0], A[i][1], A[i][4], runsRight(A[i][0], A[i][1], nb(i).map((n) => [A[n][0], A[n][1]])));
  let moved = false;
  const before = stereoKey(tp);
  const xy0 = A.map((a) => [a[0], a[1]]);
  for (let step = 0; step < 12; step++) {
    const hit = new Map();
    for (const i of ends) for (const j of ends) if (i < j && boxOverlap(boxOf(i), boxOf(j)) > 0.02) { hit.set(i, j); hit.set(j, i); }
    if (!hit.size) break;
    for (const [i, j] of hit) {
      // longer, and turned a little round its atom away from the label it hits
      const n = nb(i).find((k) => k !== M);
      let dx = A[i][0] - A[n][0], dy = A[i][1] - A[n][1];
      const l = Math.hypot(dx, dy);
      if (l > 1.8) continue;
      const t = (8 * Math.PI) / 180;
      const far = (sg) => Math.hypot(A[n][0] + dx * Math.cos(sg * t) - dy * Math.sin(sg * t) - A[j][0], A[n][1] + dx * Math.sin(sg * t) + dy * Math.cos(sg * t) - A[j][1]);
      const sg = far(1) >= far(-1) ? 1 : -1;
      [dx, dy] = [dx * Math.cos(sg * t) - dy * Math.sin(sg * t), dx * Math.sin(sg * t) + dy * Math.cos(sg * t)];
      A[i][0] = A[n][0] + dx * (1 + 0.06 / l); A[i][1] = A[n][1] + dy * (1 + 0.06 / l);
      moved = true;
    }
  }
  for (const a of A) { a[0] = r3(a[0]); a[1] = r3(a[1]); }
  // (never at the cost of the stereo the wedges show)
  if (moved && stereoKey(tp) !== before) { A.forEach((a, i) => { a[0] = xy0[i][0]; a[1] = xy0[i][1]; }); return false; }
  return moved;
}

// a label's box, in bond lengths: about 0.4 a letter (a digit, written small, 0.15)
const LW = 0.38, LH = 0.45;
function labelBox(x, y, text, right) {
  const w = LW * text.replace(/[0-9]/g, '').length + 0.15 * (text.match(/[0-9]/g)?.length ?? 0);
  return right ? { x1: x - 0.3, x2: x - 0.2 + w, y1: y - LH, y2: y + LH } : { x1: x + 0.2 - w, x2: x + 0.3, y1: y - LH, y2: y + LH };
}
const inBox = (r, x, y) => x > r.x1 && x < r.x2 && y > r.y1 && y < r.y2;
const boxOverlap = (r, q) => Math.max(0, Math.min(r.x2, q.x2) - Math.max(r.x1, q.x1)) * Math.max(0, Math.min(r.y2, q.y2) - Math.max(r.y1, q.y1));
/** Whether a label runs right from its atom (as labels.ts labelDir has it): left when its bonds lean right. */
function runsRight(x, y, others) {
  let sx = 0;
  for (const [ox, oy] of others) { const l = Math.hypot(ox - x, oy - y) || 1; sx += (ox - x) / l; }
  return !(sx > 1e-3);
}
function segsCross(p, q, r, s) {
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return o(p, q, r) * o(p, q, s) < 0 && o(r, s, p) * o(r, s, q) < 0;
}

/**
 * Put the metal of drawing `tp` where it fits best with its ligand fixed: its bonds to the donors
 * near a bond long (longer when the labels need room) and opening away from the donors' own
 * bonds, clear of the atoms, the bonds and the labels (each label running the way the program
 * will write it, which depends on the metal's bond too). `prefer`: a place to keep near.
 */
function placeMetal(tp, prefer) {
  const A = tp.atoms, M = tp.attach;
  const nb = (i) => tp.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
  const donors = nb(M);
  if (!donors.length) return 0;
  const others = A.map((_, i) => i).filter((i) => i !== M);
  const lig = tp.bonds.filter((b) => b[0] !== M && b[1] !== M);
  const labelled = others.filter((i) => A[i][4] && A[i][4] !== 'M');
  const P = (i) => [A[i][0], A[i][1]];
  const DEG = Math.PI / 180;
  const score = (x, y) => {
    let f = 0;
    for (const d of donors) {
      const L = Math.hypot(x - A[d][0], y - A[d][1]);
      f += L < 0.9 ? 60 * (0.9 - L) : 2 * (L - 1) ** 2;
      for (const n of nb(d)) {
        if (n === M) continue;
        const u = [x - A[d][0], y - A[d][1]], v = [A[n][0] - A[d][0], A[n][1] - A[d][1]];
        const ang = Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1))));
        if (ang < 105 * DEG) f += (105 * DEG - ang) * 12;
      }
      for (const [a, b] of lig) if (a !== d && b !== d && segsCross([x, y], P(d), P(a), P(b))) f += 30;
      for (const i of others) {
        if (i === d) continue;
        // an atom on (or nearly on) the bond
        const dx = A[d][0] - x, dy = A[d][1] - y, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((A[i][0] - x) * dx + (A[i][1] - y) * dy) / l2));
        const g = Math.hypot(A[i][0] - x - t * dx, A[i][1] - y - t * dy);
        if (g < 0.35) f += 10 * (0.35 - g) / 0.35;
      }
    }
    for (const i of others) if (!donors.includes(i)) { const g = Math.hypot(A[i][0] - x, A[i][1] - y); if (g < 1.2) f += 20 * (1.2 - g); }
    const mBox = { x1: x - 0.35, x2: x + 0.35, y1: y - 0.4, y2: y + 0.4 };
    for (const i of labelled) {
      const ends = nb(i).map((n) => (n === M ? [x, y] : P(n)));
      const right = runsRight(A[i][0], A[i][1], ends);
      const box = labelBox(A[i][0], A[i][1], A[i][4], right);
      // (without the atom's own letter, where its bonds start)
      const rest = right ? { ...box, x1: box.x1 + 0.45 } : { ...box, x2: box.x2 - 0.45 };
      f += 40 * boxOverlap(box, mBox);
      for (const d of donors) for (let k = 1; k < 10; k++) {
        const px = x + (A[d][0] - x) * k / 10, py = y + (A[d][1] - y) * k / 10;
        if (inBox(i === d ? rest : box, px, py)) f += 2;
      }
      if (!donors.includes(i)) continue;
      // a donor's label, turned by the metal's bond, onto its own bonds, other atoms and labels
      for (const [a, b] of lig) {
        for (let k = 0; k <= 10; k++) if (inBox(rest, A[a][0] + (A[b][0] - A[a][0]) * k / 10, A[a][1] + (A[b][1] - A[a][1]) * k / 10)) f += 2;
      }
      for (const j of labelled) {
        if (j === i) continue;
        const ej = nb(j).map((n) => (n === M ? [x, y] : P(n)));
        f += 40 * boxOverlap(rest, labelBox(A[j][0], A[j][1], A[j][4], runsRight(A[j][0], A[j][1], ej)));
      }
    }
    if (prefer) f += 3 * ((x - prefer[0]) ** 2 + (y - prefer[1]) ** 2);
    return f;
  };
  const mx = donors.reduce((s, d) => s + A[d][0], 0) / donors.length, my = donors.reduce((s, d) => s + A[d][1], 0) / donors.length;
  // (a P-stereogenic donor's wedges are read with its bond to the metal: not a place in line
  // with its other bonds, where they'd read neither way)
  const turns = donorTurns(tp, A[M][0], A[M][1]);
  let best = null;
  for (let gx = -2.6; gx <= 2.6; gx += 0.05) for (let gy = -2.6; gy <= 2.6; gy += 0.05) {
    const x = mx + gx, y = my + gy;
    if (donors.some((d) => Math.hypot(x - A[d][0], y - A[d][1]) > 2)) continue;
    if (turns.length && donorTurns(tp, x, y).some((t) => !t.sign)) continue;
    const f = score(x, y);
    if (!best || f < best.f) best = { f, x, y };
  }
  if (best) {
    A[M][0] = r3(best.x); A[M][1] = r3(best.y);
    keepTurns(tp, turns);
  }
  return best ? best.f : Infinity;
}

/**
 * placeMetal, and for a chelate whose donors are labels on one bond each (BINAP's PPh2) the donors
 * also pushed out along those bonds when that gives the metal and the labels room: Nate allows
 * bisphosphine bonds lengthened (up to 0.8 longer) so labels don't collide. Returns the score.
 */
function placeMetalStretched(tp, prefer) {
  const A = tp.atoms, M = tp.attach;
  const nb = (i) => tp.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
  const donors = nb(M);
  const ends = donors.filter((d) => A[d][4] && nb(d).filter((n) => n !== M).length === 1);
  if (donors.length < 2 || ends.length !== donors.length) return placeMetal(tp, prefer);
  const xy0 = A.map((a) => [a[0], a[1]]);
  // each donor pushed out along its bond by s and turned round its backbone atom by up to `splay`
  // degrees away from the other donors (BINAP's two PPh2, stacked, spread apart)
  const away = new Map(ends.map((d) => {
    const n = nb(d).find((k) => k !== M);
    const turned = (sg) => {
      const t = (sg * 10 * Math.PI) / 180, dx = xy0[d][0] - xy0[n][0], dy = xy0[d][1] - xy0[n][1];
      const x = xy0[n][0] + dx * Math.cos(t) - dy * Math.sin(t), y = xy0[n][1] + dx * Math.sin(t) + dy * Math.cos(t);
      return Math.min(...ends.filter((e) => e !== d).map((e) => Math.hypot(xy0[e][0] - x, xy0[e][1] - y)));
    };
    return [d, { n, sign: turned(1) >= turned(-1) ? 1 : -1 }];
  }));
  const at = (s, splay) => {
    A.forEach((a, i) => { a[0] = xy0[i][0]; a[1] = xy0[i][1]; });
    for (const d of ends) {
      const { n, sign } = away.get(d);
      const t = (sign * splay * Math.PI) / 180;
      let dx = xy0[d][0] - xy0[n][0], dy = xy0[d][1] - xy0[n][1];
      [dx, dy] = [dx * Math.cos(t) - dy * Math.sin(t), dx * Math.sin(t) + dy * Math.cos(t)];
      const l = Math.hypot(dx, dy) || 1;
      A[d][0] = r3(xy0[n][0] + dx * (1 + s / l)); A[d][1] = r3(xy0[n][1] + dy * (1 + s / l));
    }
  };
  let best = null;
  for (const s of [0, 0.2, 0.4, 0.6]) for (const splay of [0, 10, 20, 30, 40]) {
    at(s, splay);
    const f = placeMetal(tp, prefer) + 6 * s + 0.1 * splay;
    // (with the wedges as placeMetal left them for that place)
    if (!best || f < best.f - 1e-9) best = { f, s, splay, m: [A[M][0], A[M][1]], w: tp.bonds.map((b) => b[3]) };
  }
  at(best.s, best.splay);
  A[M][0] = best.m[0]; A[M][1] = best.m[1];
  tp.bonds.forEach((b, k) => { if (best.w[k]) b[3] = best.w[k]; });
  return best.f;
}

// each ligand Nate has drawn laid out as he draws it; one he hasn't drawn laid out like one in its
// family he has, when it is that drawing with other groups on it (t-Bu-Xantphos, NiXantphos)
// (each drawing's stereo as RDKit first drew it: nothing after may change it)
const firstKey = new Map(templates.map((t) => [t, stereoKey(t)]));
const changed = () => [...firstKey].filter(([t, k]) => stereoKey(t) !== k).map(([t]) => t.id);
const fixed = new Set();
{
  const byId = new Map(templates.map((t) => [t.id, t]));
  const flat = (t) => t && !t.hapto && !t.z && !t.xyz;
  // (a drawing as a reference: its metal marked M)
  const asRef = (t) => ({ atoms: t.atoms.map((a, i) => [a[0], a[1], i === t.attach ? 'M' : a[2]]), bonds: t.bonds.map(([x, y]) => [x, y]) });
  const use = (l, tp, copy) => {
    fixed.add(tp);
    if (!copy) return;
    const old = l.tpl;
    templates.push(tp);
    byId.set(tp.id, tp);
    l.tpl = tp.id;
    const f = full.find((x) => x.id === `${old}-full`);
    if (f) full.push({ ...structuredClone(f), id: `${tp.id}-full` });
  };
  const drawingOf = (l) => {
    const tp = byId.get(l.tpl);
    if (tp) return { tp, copy: false };
    // a drawing shared with the Metal Templates palette: the library's own copy of it
    const mt = metalTemplates.get(l.tpl);
    return flat(mt) ? { tp: { ...structuredClone(mt), id: `lig-${l.id}`, name: l.name, group: 'ligand-lib' }, copy: true } : { tp: null };
  };
  for (const fam of FAMILIES) {
    const ls = ligands.filter((l) => l.family === fam.id);
    // first the ones Nate drew
    const drawnHere = [];
    for (const l of ls) {
      const own = REFS[l.id];
      if (!own) continue;
      const { tp, copy } = drawingOf(l);
      if (!flat(tp)) continue;
      if (adoptReference(tp, own) || adoptReference(tp, own, true)) { use(l, tp, copy); drawnHere.push(tp); } else console.log(`${l.id}: not laid out as Nate draws it (his drawing doesn't fit)`);
    }
    // then the rest of the family, each like the first of those it is (with other groups on it)
    for (const l of ls) {
      if (REFS[l.id] || !drawnHere.length) continue;
      const { tp, copy } = drawingOf(l);
      if (!flat(tp)) continue;
      const refs = drawnHere.map(asRef);
      if (refs.some((r) => adoptReference(tp, r, false, true)) || refs.some((r) => adoptReference(tp, r, true, true))) use(l, tp, copy);
    }
  }
}

for (const tp of templates) if (!fixed.has(tp)) clearDonorLabel(tp);

// ------------------------------------------------------------------ one family, one way round

/** A drawing as an RDKit molecule, without its metal: the molecule and its atoms' places in the drawing. */
function drawingMol(tp) {
  const keep = tp.atoms.map((_, i) => i).filter((i) => i !== tp.attach && !(tp.atoms[i][4] === 'M'));
  const at = new Map(keep.map((i, k) => [i, k]));
  const bonds = tp.bonds.filter(([a, b]) => at.has(a) && at.has(b));
  const f = (v) => v.toFixed(4).padStart(10);
  const lines = ['', '  drawing', '', `${String(keep.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...keep.map((i) => { const a = tp.atoms[i]; return `${f(a[0])}${f(-a[1])}${f(0)} ${String(a[2]).padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`; }),
    ...bonds.map(([a, b, o]) => `${String(at.get(a) + 1).padStart(3)}${String(at.get(b) + 1).padStart(3)}${String(o === 1.5 ? 4 : o >= 1 && o <= 3 ? o : 1).padStart(3)}  0`)];
  const chg = keep.map((i, k) => [k + 1, tp.atoms[i][3] || 0]).filter(([, c]) => c);
  for (let k = 0; k < chg.length; k += 8) {
    const part = chg.slice(k, k + 8);
    lines.push(`M  CHG${String(part.length).padStart(3)}${part.map(([n, c]) => `${String(n).padStart(4)}${String(c).padStart(4)}`).join('')}`);
  }
  lines.push('M  END');
  let m = null;
  try { m = RDKit.get_mol(lines.join('\n')); } catch { m = null; }
  return m ? { m, keep } : null;
}

const hasWedge = (tp) => tp.bonds.some((b) => b[3] === 'wedge' || b[3] === 'hashWedge');

/**
 * Turn drawing `t` (and mirror it, when it has no wedges) so the part it shares with drawing
 * `ref` lies as it does there: the shared part is their largest common substructure, and at
 * least `min` atoms of it. Its metal goes where ref's is from the donors they share. Returns
 * whether it was turned.
 */
function alignTo(t, ref, min = 6) {
  const A = drawingMol(t), B = drawingMol(ref);
  if (!A || !B) { A?.m.delete(); B?.m.delete(); return false; }
  let done = false;
  try {
    const list = new RDKit.MolList();
    list.append(A.m); list.append(B.m);
    const mcs = JSON.parse(RDKit.get_mcs_as_json(list, JSON.stringify({ RingMatchesRingOnly: true, CompleteRingsOnly: true, Timeout: 2 })));
    list.delete();
    if (!mcs.smarts || mcs.numAtoms < min) return false;
    const q = RDKit.get_qmol(mcs.smarts);
    const ma = JSON.parse(A.m.get_substruct_matches(q) || '[]').slice(0, 60);
    const mb = JSON.parse(B.m.get_substruct_matches(q) || '[]')[0];
    q.delete();
    if (!ma.length || !mb) return false;
    const P = t.atoms, Q = ref.atoms;
    const mirrorOk = !hasWedge(t);
    const nb = (tp, i) => tp.bonds.filter((x) => x[0] === i || x[1] === i).map((x) => (x[0] === i ? x[1] : x[0]));
    /** The best turn (and mirror) of places `xy` onto ref for the atom pairs, and how far off it is. */
    const fit = (xy, pairs) => {
      let best = null;
      for (const mirror of mirrorOk ? [false, true] : [false]) {
        const pt = (i) => [xy[i][0], mirror ? -xy[i][1] : xy[i][1]];
        const n = pairs.length;
        const pc = pairs.reduce((s, [i]) => [s[0] + pt(i)[0] / n, s[1] + pt(i)[1] / n], [0, 0]);
        const qc = pairs.reduce((s, [, j]) => [s[0] + Q[j][0] / n, s[1] + Q[j][1] / n], [0, 0]);
        let sxx = 0, sxy = 0;
        for (const [i, j] of pairs) {
          const [px, py] = [pt(i)[0] - pc[0], pt(i)[1] - pc[1]], [qx, qy] = [Q[j][0] - qc[0], Q[j][1] - qc[1]];
          sxx += px * qx + py * qy; sxy += px * qy - py * qx;
        }
        const th = Math.atan2(sxy, sxx), c = Math.cos(th), sn = Math.sin(th);
        const move = (x, y) => { const [px, py] = [x - pc[0], (mirror ? -y : y) - pc[1]]; return [qc[0] + px * c - py * sn, qc[1] + px * sn + py * c]; };
        let err = 0;
        for (const [i, j] of pairs) { const [x, y] = move(xy[i][0], xy[i][1]); err += (x - Q[j][0]) ** 2 + (y - Q[j][1]) ** 2; }
        if (!best || err < best.err) best = { err, move };
      }
      return best;
    };
    // a group on a single bond may be flipped over it (a biaryl's far ring, its 2′ group up or
    // down): no bond changes length, so the drawing stays the same structure
    const flips = [];
    for (const [a, b, o] of t.bonds) {
      if (o !== 1) continue;
      for (const [near, far] of [[a, b], [b, a]]) {
        const side = new Set([far]);
        const todo = [far];
        while (todo.length) for (const n of nb(t, todo.pop())) if (n !== near && !side.has(n)) { side.add(n); todo.push(n); }
        if (side.has(near) || side.has(t.attach) || side.size < 2) continue;
        if (t.bonds.some((x) => (side.has(x[0]) || side.has(x[1])) && (x[3] === 'wedge' || x[3] === 'hashWedge'))) continue;
        flips.push([near, far, side]);
      }
    }
    const flip = (xy, [near, far, side]) => {
      const out = xy.map((p) => [p[0], p[1]]);
      const [ax, ay] = xy[near], dx = xy[far][0] - ax, dy = xy[far][1] - ay, l2 = dx * dx + dy * dy;
      for (const i of side) {
        const px = xy[i][0] - ax, py = xy[i][1] - ay, k = (px * dx + py * dy) / l2;
        out[i] = [ax + 2 * k * dx - px, ay + 2 * k * dy - py];
      }
      return out;
    };
    let best = null;
    for (const match of ma) {
      const pairs = match.atoms.map((ai, k) => [A.keep[ai], B.keep[mb.atoms[k]]]);
      let xy = P.map((p) => [p[0], p[1]]);
      let f = fit(xy, pairs);
      for (let pass = 0; pass < 3; pass++) {
        let better = false;
        for (const fl of flips) {
          const xy2 = flip(xy, fl);
          const f2 = fit(xy2, pairs);
          if (f2.err < f.err - 0.05) { xy = xy2; f = f2; better = true; }
        }
        if (!better) break;
      }
      if (!best || f.err < best.err) best = { ...f, xy, pairs };
    }
    best.xy.forEach(([x, y], i) => { [P[i][0], P[i][1]] = best.move(x, y); });
    const map = new Map(best.pairs);
    // the metal: where ref's is, from the donors they share
    const shared = nb(t, t.attach).filter((d) => map.has(d) && nb(ref, ref.attach).includes(map.get(d)));
    if (shared.length) {
      const M = P[t.attach];
      const turns = donorTurns(t, M[0], M[1]);
      M[0] = shared.reduce((s, d) => s + P[d][0] + Q[ref.attach][0] - Q[map.get(d)][0], 0) / shared.length;
      M[1] = shared.reduce((s, d) => s + P[d][1] + Q[ref.attach][1] - Q[map.get(d)][1], 0) / shared.length;
      keepTurns(t, turns);
    }
    for (const a of P) { a[0] = r3(a[0]); a[1] = r3(a[1]); }
    done = true;
  } finally {
    A.m.delete(); B.m.delete();
  }
  return done;
}
// each family drawn the same way round (Nate, 2026-11-02): every ligand turned so the part it
// shares with the family's most alike ligand already placed (its biaryl, its imidazolylidene)
// lies as it does there; the family's palette ligand (XPhos) or else its first sets the way
{
  const byId = new Map(templates.map((t) => [t.id, t]));
  for (const fam of FAMILIES) {
    const ls = ligands.filter((l) => l.family === fam.id);
    const ts = ls.map((l) => byId.get(l.tpl)).filter((t) => t && !t.hapto && !t.z && !t.xyz);
    // (the ones laid out as Nate draws them set the way, when there are any)
    const drawn = ts.filter((t) => fixed.has(t));
    const first = ts.find((t) => ls.find((l) => l.tpl === t.id)?.palette) ?? ts[0];
    if (!first) continue;
    const placed = drawn.length ? drawn : [first];
    const aligned = [...placed];
    for (const t of ts) {
      if (placed.includes(t)) continue;
      // (a PR₃, its one donor with three groups round it, has nothing to turn to match)
      const tn = (i) => t.bonds.filter((b) => b[0] === i || b[1] === i).map((b) => (b[0] === i ? b[1] : b[0]));
      const td = tn(t.attach);
      if (td.length === 1 && tn(td[0]).length >= 4) continue;
      // the placed ligand it shares most with
      let ref = null, most = 0;
      for (const o of placed) {
        const A = drawingMol(t), B = drawingMol(o);
        if (A && B) {
          const list = new RDKit.MolList();
          list.append(A.m); list.append(B.m);
          const n = JSON.parse(RDKit.get_mcs_as_json(list, JSON.stringify({ RingMatchesRingOnly: true, CompleteRingsOnly: true, Timeout: 1 }))).numAtoms ?? 0;
          list.delete();
          if (n > most) { most = n; ref = o; }
        }
        A?.m.delete(); B?.m.delete();
      }
      // (a shared part of at least a ring and its donor, and most of the smaller one)
      if (ref && most >= 7 && most >= 0.5 * Math.min(t.atoms.length, ref.atoms.length) - 1 && alignTo(t, ref)) {
        aligned.push(t);
        // turned to match one Nate drew: its metal then moved (a little) to where its labels have room
        if (drawn.length) placeMetalStretched(t, [t.atoms[t.attach][0], t.atoms[t.attach][1]]);
      }
      placed.push(t);
    }
    // then the family's labels made clear together, all turned the same way (with none drawn as Nate does)
    const rooms = drawn.length ? [] : aligned.map(labelRoom).filter(Boolean);
    if (rooms.length >= 2) bestTurn(rooms);
  }
}

// and in any drawing, labels that still collide pulled apart on longer bonds, the metal moved to suit
for (const tp of templates) {
  if (fixed.has(tp) || tp.hapto || tp.z || tp.xyz) continue;
  const m0 = [tp.atoms[tp.attach][0], tp.atoms[tp.attach][1]];
  if (stretchLabels(tp)) placeMetal(tp, m0);
  // (a chelate's labelled donors also given room round their metal)
  else if (tp.bonds.filter((b) => b[0] === tp.attach || b[1] === tp.attach).length >= 2) placeMetalStretched(tp, m0);
  // (and an M on top of a label or an atom moved off it: BippyPhos's M was on a Ph)
  else if (metalCrowded(tp)) placeMetal(tp, m0);
}

if (changed().length) throw new Error(`stereo changed while laying out: ${changed().join(', ')}`);
const out = {
  families: FAMILIES.map(({ id, name, note }) => ({ id, name, note })),
  ligands,
  templates,
};
const file = path.join(root, 'src', 'chem', 'ligand-library.json');
fs.writeFileSync(file, JSON.stringify(out).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
console.log(`Wrote ${ligands.length} ligands (${templates.length} drawings) to ${path.relative(root, file)}`);
// kept apart, loaded only when Expand Label Fully needs it
// each full drawing the same way round as the ligand's usual one
{
  const byId = new Map(templates.map((t) => [t.id, t]));
  for (const f of full) {
    const base = byId.get(f.id.replace(/-full$/, '')) ?? metalTemplates.get(f.id.replace(/-full$/, ''));
    if (base) alignTo(f, base, 4);
  }
}
const fullFile = path.join(root, 'src', 'chem', 'ligand-library-full.json');
fs.writeFileSync(fullFile, JSON.stringify(full).replace(/\},\{"id"/g, '},\n{"id"') + '\n');
console.log(`Wrote ${full.length} drawings in full to ${path.relative(root, fullFile)} (crowded: ${skipped.join(', ')})`);
