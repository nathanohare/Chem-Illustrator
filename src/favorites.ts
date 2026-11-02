// Format Favorites as kept in the settings (see ui/format-favorites.ts): a look under a name.

import type { ObjectLook, RunLook } from './format-painter';
import type { Border, CellStyle, Side } from './sheet/workbook';

export interface FormatFavorite { name: string; look: ObjectLook }

export const FAVORITES_MAX = 60;

/** Favorites read from the settings: only well-formed ones, at most FAVORITES_MAX, names unique. */
export function parseFavorites(raw: unknown): FormatFavorite[] {
  if (!Array.isArray(raw)) return [];
  const out: FormatFavorite[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const { name, look } = f as { name?: unknown; look?: unknown };
    if (typeof name !== 'string' || !name.trim() || !look || typeof look !== 'object' || Array.isArray(look)) continue;
    if (out.some((x) => x.name === name.trim())) continue;
    out.push({ name: name.trim().slice(0, 60), look: JSON.parse(JSON.stringify(look)) as ObjectLook });
    if (out.length >= FAVORITES_MAX) break;
  }
  return out;
}

/** A favorite added (or one of the same name replaced, keeping its place). */
export function withFavorite(list: FormatFavorite[], f: FormatFavorite): FormatFavorite[] {
  const at = list.findIndex((x) => x.name === f.name);
  if (at >= 0) return list.map((x, i) => (i === at ? f : x));
  return [...list, f].slice(-FAVORITES_MAX);
}


// ---------------------------------------------------------------- in a spreadsheet's cells

/**
 * A favorite's look as cells take it: the fill of its shape, its text's font, size, colour,
 * bold, italics and underline, and the alignment; a shape with an outline gives the cells thin
 * borders of its colour. Null when it has nothing cells can show.
 */
export function favoriteCellLook(look: ObjectLook): { patch: CellStyle; borders?: Partial<Record<Side, Border>> } | null {
  const patch: CellStyle = {};
  const sh = look.shape, run = look.text?.run;
  if (sh) {
    if (sh.filled && sh.fillColor && /^#[0-9a-f]{6}$/i.test(sh.fillColor)) patch.fill = sh.fillColor;
    else if (sh.filled === false) patch.fill = undefined;
  }
  if (run) {
    for (const k of ['bold', 'italic', 'underline'] as const) if (run[k] !== undefined) patch[k] = !!run[k];
    if (run.font) patch.font = run.font;
    if (run.size) patch.size = run.size;
  }
  const color = run?.color ?? look.colour?.color;
  if (color && /^#[0-9a-f]{6}$/i.test(color)) patch.color = color;
  const j = look.text?.justify;
  if (j === 'left' || j === 'center' || j === 'right') patch.align = j;
  let borders: Partial<Record<Side, Border>> | undefined;
  if (sh && (sh.lineWidth ?? 1) > 0 && sh.color && sh.color !== '#000000' && /^#[0-9a-f]{6}$/i.test(sh.color)) {
    const b: Border = { style: sh.dashed ? 'dashed' : (sh.lineWidth ?? 1) >= 2 ? 'medium' : 'thin', color: sh.color };
    borders = { top: b, right: b, bottom: b, left: b };
  }
  if (!Object.keys(patch).length && !borders) return null;
  return { patch, ...(borders ? { borders } : {}) };
}

/** A cell's look as a favorite (Save Format as Favorite in a sheet): its fill as a shape's, its font as text's. */
export function cellFavoriteLook(s: CellStyle): ObjectLook {
  const run: Record<string, unknown> = {};
  for (const k of ['bold', 'italic', 'underline', 'font', 'size', 'color'] as const) if (s[k] !== undefined) run[k] = s[k];
  const edge = s.borders?.top ?? s.borders?.left ?? s.borders?.bottom ?? s.borders?.right;
  return {
    shape: { filled: !!s.fill, ...(s.fill ? { fillColor: s.fill } : {}), ...(edge?.color ? { color: edge.color } : {}), ...(edge?.style === 'dashed' ? { dashed: true } : {}) },
    text: { run: run as RunLook, ...(s.align ? { justify: s.align } : {}) },
    ...(s.color ? { colour: { color: s.color } } : {}),
  };
}
