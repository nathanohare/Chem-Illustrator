// Format Favorites as kept in the settings (see ui/format-favorites.ts): a look under a name.

import type { ObjectLook } from './format-painter';

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

