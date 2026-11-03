// A reaction step's roles (which things are its starting materials, products and conditions) name
// those things by id. On a slide saved for PowerPoint, a scheme can be split over several
// pictures (Auto-Animate Steps makes each step a picture of its own, so it can come in on its
// own), and a role naming something in another picture would be lost: every picture's drawing
// is read back on its own, with new ids. So the slide keeps those steps in a tag, with each
// arrow and each thing it names by where it is, and they are joined up again once every picture
// is back on the slide. (A picture moved in PowerPoint leaves its steps to be read afresh.)

import type { Doc, StepRoles } from '../model';
import type { Selection } from '../editor/arrange';
import type { Vec } from '../geom';

type At = [number, number];
interface SavedStep { t: At; h: At; roles: Partial<Record<keyof StepRoles, unknown>> }

const ROLE_LISTS = ['reactants', 'products', 'above', 'below', 'plusses', 'inside'] as const;
const r2 = (v: number) => Math.round(v * 100) / 100;
const at = (p: Vec): At => [r2(p.x), r2(p.y)];

/** Where the thing a role names is: an atom's place, a text box's anchor, a shape's first corner. */
function placeOf(doc: Doc, ref: string): At | null {
  const id = Number(ref.slice(1));
  if (ref[0] === 'a') { const a = doc.atoms.get(id); return a ? at(a) : null; }
  if (ref[0] === 'c') { const c = doc.captions.get(id); return c ? at(c) : null; }
  if (ref[0] === 's') { const s = doc.shapes.get(id); return s ? at({ x: s.x1, y: s.y1 }) : null; }
  return null;
}

const holds = (sel: Partial<Selection>, ref: string): boolean => {
  const id = Number(ref.slice(1));
  return ref[0] === 'a' ? !!sel.atoms?.has(id) : ref[0] === 'c' ? !!sel.captions?.has(id) : ref[0] === 's' ? !!sel.shapes?.has(id) : false;
};

/**
 * The tag for a slide's steps whose roles name things in another picture than their arrow's
 * (`drawings`: what each picture holds), or null when there are none.
 */
export function stepsTag(doc: Doc, drawings: Partial<Selection>[]): string | null {
  const out: SavedStep[] = [];
  for (const r of doc.arrows.values()) {
    const st = r.step;
    if (!st) continue;
    const home = drawings.find((d) => d.arrows?.has(r.id));
    const refs = ROLE_LISTS.flatMap((k) => st[k] ?? []);
    if (!home || refs.every((ref) => holds(home, ref))) continue;
    const roles: SavedStep['roles'] = {};
    for (const k of ROLE_LISTS) {
      const list = st[k];
      if (!list) continue;
      roles[k] = list.map((ref) => { const p = placeOf(doc, ref); return p ? [ref[0], ...p] : null; }).filter(Boolean);
    }
    if (st.manual) roles.manual = true;
    out.push({ t: at(r.tail), h: at(r.head), roles });
  }
  return out.length ? JSON.stringify(out) : null;
}

/** Join the steps in a slide's tag up again with the things now on the slide (call once every picture is read). */
export function restoreSteps(doc: Doc, tag: string): void {
  let saved: unknown;
  try { saved = JSON.parse(tag); } catch { return; }
  if (!Array.isArray(saved)) return;
  const near = (p: Vec, q: unknown) => Array.isArray(q) && Math.abs(p.x - Number(q[0])) < 0.05 && Math.abs(p.y - Number(q[1])) < 0.05;
  const find = (kind: unknown, x: number, y: number): string | null => {
    const p = { x, y };
    if (kind === 'a') { for (const a of doc.atoms.values()) if (near(a, [p.x, p.y])) return 'a' + a.id; }
    else if (kind === 'c') { for (const c of doc.captions.values()) if (near(c, [p.x, p.y])) return 'c' + c.id; }
    else if (kind === 's') { for (const s of doc.shapes.values()) if (near({ x: s.x1, y: s.y1 }, [p.x, p.y])) return 's' + s.id; }
    return null;
  };
  for (const e of saved as SavedStep[]) {
    if (!e || typeof e !== 'object' || !e.roles) continue;
    const arrow = [...doc.arrows.values()].find((r) => near(r.tail, e.t) && near(r.head, e.h));
    if (!arrow) continue;
    const roles: StepRoles = { reactants: [], products: [], above: [], below: [] };
    let whole = true;
    for (const k of ROLE_LISTS) {
      const list = e.roles[k];
      if (!Array.isArray(list)) continue;
      const refs: string[] = [];
      for (const it of list) {
        const ref = Array.isArray(it) && it.length === 3 ? find(it[0], Number(it[1]), Number(it[2])) : null;
        if (ref) refs.push(ref); else whole = false;
      }
      roles[k] = refs;
    }
    // something it named was moved or taken away (in PowerPoint): the step is read afresh from where things are
    if (!whole || !roles.reactants.length || !roles.products.length) continue;
    if (e.roles.manual === true) roles.manual = true;
    doc.updateArrow(arrow.id, { step: roles });
  }
}
