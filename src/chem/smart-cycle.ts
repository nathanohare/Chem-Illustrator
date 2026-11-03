// A second loop for a Smart Scheme's catalytic cycle (review of #318: "a way to draw more complex
// catalytic cycles, i.e. two circular intersecting pathways"). The scheme's loop is read back as
// the Catalytic Cycle window's table (structures stay as drawn), a second loop is filled in there,
// and the cycle is drawn again with both loops: turning together where two steps meet, sharing a
// species, or side by side. It is still one Smart Scheme afterwards.

import type { Doc } from '../model';
import type { Vec } from '../geom';
import { frameMembers } from '../editor/frames';
import type { Measure } from '../editor/arrange';
import { readSmart, runsMarkup, slotName, stepPartKind, stepText, ungroupSmart } from './smart-scheme';
import { buildCycle, type BuiltCycle, type CycleLook, type CycleLoop, type CycleSpec } from './cycles';

export interface SmartCycleStart {
  /** The scheme's loop as the window's table: species text with _ and ^, each step's name and what comes in and goes out. */
  loop: CycleLoop;
  /** For each species: what the window shows when it is drawn (kept as it is), or null when it is text. */
  drawn: (string | null)[];
  look: CycleLook;
}

/** What a Smart Scheme's frame holds that is not a species, a step's arrow or its conditions: the middle, and labels. */
function loose(doc: Doc, m: Measure, frameId: number) {
  const s = doc.shapes.get(frameId)!;
  const read = readSmart(doc, m, frameId)!;
  const members = frameMembers(doc, s.frame!);
  const used = new Set<number>();
  for (const sl of read.slots) for (const it of [...sl.items, ...sl.labels]) if (it.caption !== undefined) used.add(it.caption);
  for (const l of read.links) for (const it of [...l.above, ...l.below, ...l.inside, ...l.plusses]) if (it.caption !== undefined) used.add(it.caption);
  return { read, members, others: [...members.captions].filter((id) => !used.has(id)) };
}

/** A Smart Scheme laid out as one loop, read as the Catalytic Cycle window's first loop; null for any other scheme. */
export function smartCycleStart(doc: Doc, m: Measure, frameId: number): SmartCycleStart | null {
  const data = doc.shapes.get(frameId)?.smart;
  if (!data || data.layout !== 'cycle' || data.free) return null;
  const read = readSmart(doc, m, frameId);
  if (!read || !read.closed || !read.chain || read.slots.length < 2) return null;
  // what joins or leaves as a structure (or a box waiting for one) has no place in the window's
  // table, and would be left behind outside the new drawing
  if (structureReagents(doc, m, frameId)) return null;
  const { others } = loose(doc, m, frameId);
  const drawn = read.slots.map((sl, k) => (sl.caption !== undefined || sl.holder !== undefined ? null : `${slotName(doc, sl)} ${k + 1} (as drawn)`));
  const stations = read.slots.map((sl) => {
    if (sl.caption !== undefined) return runsMarkup(doc.captions.get(sl.caption)?.runs ?? []);
    if (sl.holder !== undefined) return runsMarkup(doc.shapes.get(sl.holder)?.holder?.runs ?? []);
    return '';
  });
  const steps = read.links.map((l) => ({ short: '', name: stepText(doc, l, 'inside'), inn: stepText(doc, l, 'above'), out: stepText(doc, l, 'below') }));
  // the catalyst in the middle: the one text box that isn't a species, a label or a step's
  const mid = others.length ? doc.captions.get(others[0]) : undefined;
  return {
    loop: { stations, steps, middle: mid ? runsMarkup(mid.runs) : '' },
    drawn,
    // the names are kept as they are written (short or in full)
    look: { anticlockwise: !!data.anticlockwise, names: 'full', reagentArrows: !!data.reagentArrows },
  };
}

/** Whether a step of the Smart Scheme has a structure, or a box waiting for one, joining or leaving it. */
export function structureReagents(doc: Doc, m: Measure, frameId: number): boolean {
  const read = readSmart(doc, m, frameId);
  return !!read?.links.some((l) => stepPartKind(doc, l, 'above') !== 'text' || stepPartKind(doc, l, 'below') !== 'text');
}

export interface RebuiltCycle extends BuiltCycle {
  /** The structures kept as species. */
  atoms: number[];
  /** Text and pictures that went with them (labels), and anything else of the old scheme kept. */
  kept: number[];
  shapes: number[];
}

/**
 * Draw a Smart Scheme's cycle again as `spec` (from the window that smartCycleStart filled):
 * `rows[k]` is the scheme's species that row k of loop 1 keeps (its structure stays as drawn), or
 * null for one typed there. The old arrows, conditions and text species go; the frame goes too,
 * for the caller to make a Smart Scheme of what is drawn. Call inside an edit.
 */
export function rebuildSmartCycle(doc: Doc, m: Measure, frameId: number, spec: CycleSpec, look: CycleLook, rows: (number | null)[]): RebuiltCycle | null {
  if (!smartCycleStart(doc, m, frameId)) return null;
  const { read, members, others } = loose(doc, m, frameId);
  // where the loop was: the new drawing goes there
  const boxes = read.slots.map((sl) => sl.box);
  const at: Vec = {
    x: (Math.min(...boxes.map((b) => b.x1)) + Math.max(...boxes.map((b) => b.x2))) / 2,
    y: (Math.min(...boxes.map((b) => b.y1)) + Math.max(...boxes.map((b) => b.y2))) / 2,
  };
  // the structures kept, and what rides along with each (labels, text or pictures beside it)
  const kept = { atoms: [] as number[], kept: [] as number[], shapes: [] as number[] };
  const riders: { anchor: number; captions: [number, Vec][]; shapes: [number, Vec][] }[] = [];
  const stations = rows.map((r) => {
    const sl = r === null ? undefined : read.slots[r];
    if (!sl || sl.caption !== undefined || sl.holder !== undefined) return { atoms: [] as number[] };
    const atoms = sl.items.flatMap((it) => it.atoms);
    if (!atoms.length) return { atoms };
    const anchor = doc.atoms.get(atoms[0])!;
    const along = [...sl.labels, ...sl.items.filter((it) => !it.atoms.length)];
    riders.push({
      anchor: anchor.id,
      // where each is, from the structure (the arranging may move them too: they end up here)
      captions: along.flatMap((it) => { const c = it.caption !== undefined ? doc.captions.get(it.caption) : undefined; return c ? [[c.id, { x: c.x - anchor.x, y: c.y - anchor.y }] as [number, Vec]] : []; }),
      shapes: along.flatMap((it) => { const h = it.shape !== undefined ? doc.shapes.get(it.shape) : undefined; return h ? [[h.id, { x: h.x1 - anchor.x, y: h.y1 - anchor.y }] as [number, Vec]] : []; }),
    });
    kept.atoms.push(...atoms);
    return { atoms };
  });
  const riding = new Set(riders.flatMap((r) => r.captions.map(([id]) => id)));
  const ridingShapes = new Set(riders.flatMap((r) => r.shapes.map(([id]) => id)));
  // the frame goes, then everything of the old loop that is drawn afresh
  ungroupSmart(doc, frameId);
  for (const id of members.arrows) if (doc.arrows.has(id)) doc.removeArrow(id);
  for (const id of members.captions) if (!riding.has(id) && (others[0] === id || !others.includes(id)) && doc.captions.has(id)) doc.removeCaption(id);
  for (const id of members.shapes) if (!ridingShapes.has(id) && doc.shapes.get(id)?.holder) doc.removeShape(id);
  const made = buildCycle(doc, m, spec, look, at, stations);
  // labels and the like follow their structure
  for (const r of riders) {
    const a = doc.atoms.get(r.anchor);
    if (!a) continue;
    for (const [id, off] of r.captions) if (doc.captions.has(id)) { doc.updateCaption(id, { x: a.x + off.x, y: a.y + off.y }); kept.kept.push(id); }
    for (const [id, off] of r.shapes) {
      const s = doc.shapes.get(id);
      if (!s) continue;
      const dx = a.x + off.x - s.x1, dy = a.y + off.y - s.y1;
      doc.updateShape(id, { x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, ...(s.poly ? { poly: s.poly.map((p) => ({ x: p.x + dx, y: p.y + dy })) } : {}) });
      kept.shapes.push(id);
    }
  }
  // what wasn't anything else (a second label, a note) stays where it was, in the scheme
  for (const id of others.slice(1)) if (doc.captions.has(id) && !kept.kept.includes(id)) kept.kept.push(id);
  return { ...made, ...kept };
}
