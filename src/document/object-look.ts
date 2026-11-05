// Format Favorites on a document's page: a picked shape, text box, figure or picture gives and
// takes a favorite's fill and outline (the same favorite gives them to shapes on a drawing, a
// slide or a sheet). Only text boxes and shapes have a fill on the page; figures and pictures
// take the outline (their frame).

import type { ObjectLook } from '../format-painter';
import type { DocObject, FigureLook } from './document';

type Lookable = Extract<DocObject, { kind: 'textbox' | 'drawing' | 'picture' }>;
const lookable = (o: DocObject | undefined): o is Lookable => o?.kind === 'textbox' || o?.kind === 'drawing' || o?.kind === 'picture';

/** The fill and outline of a shape, text box, figure or picture; null for anything else. */
export function docObjectLook(o: DocObject | undefined): ObjectLook | null {
  if (!lookable(o)) return null;
  const fill = o.kind === 'textbox' && o.fill && o.fill !== 'none' ? o.fill : undefined;
  const line = o.look?.frame ?? 0;
  return { shape: { filled: !!fill, ...(fill ? { fillColor: fill } : {}), lineWidth: line, ...(line ? { color: o.look?.frameColor ?? '#000000' } : {}) } };
}

/** The object with a favorite's fill and outline; null when it can't take them (or the favorite has neither). */
export function withObjectLook(o: DocObject | undefined, look: ObjectLook): DocObject | null {
  const sh = look.shape;
  if (!lookable(o) || !sh) return null;
  const next = { ...o } as Lookable;
  if (next.kind === 'textbox' && sh.filled !== undefined) next.fill = sh.filled && sh.fillColor ? sh.fillColor : undefined;
  if (sh.lineWidth !== undefined || sh.color) {
    const lk: FigureLook = { ...o.look };
    if (sh.lineWidth !== undefined) lk.frame = sh.lineWidth > 0 ? sh.lineWidth : undefined;
    if (sh.color && (lk.frame ?? 0) > 0) lk.frameColor = sh.color;
    if (!lk.frame) delete lk.frameColor;
    for (const k of Object.keys(lk) as (keyof FigureLook)[]) if (lk[k] === undefined) delete lk[k];
    next.look = Object.keys(lk).length ? lk : undefined;
  }
  return next;
}
