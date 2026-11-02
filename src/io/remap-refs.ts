// Things copied into a drawing get new ids. What points at other things by id has to follow:
// an arrow's chosen roles (reaction steps, a Smart Scheme's order) and a frame's members.

import type { Doc, StepRoles } from '../model';
import { structureKey } from '../design/newman';

export interface IdMaps {
  atoms: Map<number, number>;
  captions: Map<number, number>;
  shapes: Map<number, number>;
  arrows: Map<number, number>;
}

/** An arrow's roles naming the new copies; things not copied drop out. */
export function remapStep(st: StepRoles, maps: IdMaps): StepRoles {
  const ref = (r: string): string | null => {
    const n = Number(r.slice(1));
    const to = r[0] === 'a' ? maps.atoms.get(n) : r[0] === 'c' ? maps.captions.get(n) : r[0] === 's' ? maps.shapes.get(n) : undefined;
    return to === undefined ? null : r[0] + to;
  };
  const refs = (list: string[]) => list.map(ref).filter((r): r is string => r !== null);
  const out: StepRoles = { ...st, reactants: refs(st.reactants), products: refs(st.products), above: refs(st.above), below: refs(st.below) };
  if (st.plusses) out.plusses = refs(st.plusses);
  if (st.inside) out.inside = refs(st.inside);
  return out;
}

/** The copied frames (Smart Schemes, energy diagrams) holding the copies of what they held. */
export function remapFrames(doc: Doc, maps: IdMaps): void {
  const keep = (list: number[], by: Map<number, number>) => list.map((x) => by.get(x)).filter((x): x is number => x !== undefined);
  for (const id of maps.shapes.values()) {
    const f = doc.shapes.get(id)?.frame;
    if (!f) continue;
    doc.updateShape(id, { frame: { ...f, atoms: keep(f.atoms, maps.atoms), captions: keep(f.captions, maps.captions), arrows: keep(f.arrows, maps.arrows), shapes: keep(f.shapes, maps.shapes) } });
    // a Newman projection copied with its structure follows the copy; copied alone it lets go
    const d = doc.shapes.get(id)?.newman;
    if (d?.link) {
      const front = maps.atoms.get(d.link.front), back = maps.atoms.get(d.link.back);
      if (front === undefined || back === undefined) { const { link: _l, mark: _m, ...rest } = d; doc.updateShape(id, { newman: rest }); continue; }
      const atoms = [...doc.fragmentOf(front)];
      const arrows = d.mark?.arrows.map((x) => maps.arrows.get(x)), shapes = d.mark?.shapes.map((x) => maps.shapes.get(x));
      const mark = d.mark && arrows!.every((x) => x !== undefined) && shapes!.every((x) => x !== undefined) ? { ...d.mark, arrows: arrows as number[], shapes: shapes as number[] } : undefined;
      const { mark: _m, ...rest } = d;
      doc.updateShape(id, { newman: { ...rest, link: { atoms, front, back, key: structureKey(doc, atoms) }, ...(mark ? { mark } : {}) } });
    }
  }
}
