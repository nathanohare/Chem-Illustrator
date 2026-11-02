// Format Favorites: a complete look (fill, pattern, shadow, transparency, line, effects, and the
// text's font and colour) kept under a name and given to the selection with one click, like your
// own colour palettes. Saved from what is selected (right-click ▸ Save Format as Favorite…),
// kept in your settings, so they are there in every drawing, slide, design and document. Shown
// on the Home tab as a gallery of small pictures of each look.

import { Doc } from '../model';
import { paintObjects, type ObjectLook } from '../format-painter';
import { recordPicture, pictureSvg } from '../render/picture';

export type { FormatFavorite } from '../favorites';
export { FAVORITES_MAX, parseFavorites, withFavorite } from '../favorites';
import type { FormatFavorite } from '../favorites';

/** A name not yet taken: "Favorite 3". */
export function freshFavoriteName(list: FormatFavorite[], base = 'Favorite'): string {
  for (let n = list.length + 1; ; n++) if (!list.some((f) => f.name === `${base} ${n}`)) return `${base} ${n}`;
}

/** What a look covers, in words (for a card's tooltip). */
export function favoriteSummary(look: ObjectLook): string {
  const parts: string[] = [];
  const s = look.shape;
  if (s) {
    if (s.filled && s.fill === 'gradient') parts.push('gradient fill');
    else if (s.filled) parts.push('fill');
    if (s.pattern) parts.push('pattern');
    if (s.transparency) parts.push(`${Math.round(s.transparency * 100)}% transparent`);
    if (s.lineWidth === 0) parts.push('no outline'); else parts.push(s.dashed ? 'dashed line' : 'line');
    if (s.shadow) parts.push('shadow');
    if (s.glow || s.softEdge || s.bevel || s.reflection) parts.push('effects');
  }
  if (look.arrow) parts.push('arrows');
  if (look.atom || look.bond) parts.push(look.atom?.highlight || look.bond?.highlight || look.atom?.hl || look.bond?.hl ? 'structure colour and highlight' : 'structure colour');
  if (look.picture) parts.push('picture look');
  if (look.text) parts.push('text');
  return parts.join(', ');
}

/** A small drawing that shows a look: a box (with text when the look has some), or an arrow, or a bond, painted with it. */
function sampleFor(look: ObjectLook): Doc {
  const doc = new Doc();
  const sel = { atoms: new Set<number>(), bonds: new Set<number>(), captions: new Set<number>(), arrows: new Set<number>(), shapes: new Set<number>() };
  doc.bulk(() => {
    if (look.shape || (!look.arrow && !look.atom && !look.bond && !look.text)) {
      const s = doc.addShape({ kind: 'geo', geo: 'roundRect', x1: 0, y1: 0, x2: 60, y2: 34, filled: true, fillColor: '#dbe7f6', color: '#2f5597', ...(look.text ? { text: { runs: [{ text: 'Aa' }] } } : {}) });
      sel.shapes.add(s.id);
    } else if (look.arrow) {
      sel.arrows.add(doc.addArrow({ tail: { x: 0, y: 17 }, head: { x: 60, y: 17 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 6, headWidth: 2.2 }).id);
    } else if (look.atom || look.bond) {
      const a = doc.addAtom(4, 24), b = doc.addAtom(30, 9), c = doc.addAtom(56, 24);
      sel.atoms.add(a.id); sel.atoms.add(b.id); sel.atoms.add(c.id);
      sel.bonds.add(doc.addBond(a.id, b.id).id);
      sel.bonds.add(doc.addBond(b.id, c.id).id);
    }
    if (look.text && !look.shape) sel.captions.add(doc.addCaption({ x: 0, y: 30, runs: [{ text: 'Aa' }], justify: 'left' }).id);
  });
  doc.edit('look', () => { paintObjects(doc, sel, look); });
  return doc;
}

const thumbs = new Map<string, string>();

/** A picture of a look, as SVG markup fitted to w × h. */
export function favoriteThumb(look: ObjectLook, w = 58, h = 30): string {
  const key = JSON.stringify([look, w, h]);
  const had = thumbs.get(key);
  if (had !== undefined) return had;
  let svg = '';
  try {
    const p = recordPicture(sampleFor(look), 1.5);
    if (p) {
      const pw = p.box.x2 - p.box.x1, ph = p.box.y2 - p.box.y1;
      const k = Math.min(1, w / pw, h / ph);
      svg = pictureSvg(p)
        .replace(/^<\?xml[^>]*>\s*/, '')
        .replace(/ width="[^"]*" height="[^"]*"/, ` width="${(pw * k).toFixed(1)}" height="${(ph * k).toFixed(1)}" aria-hidden="true" focusable="false"`);
    }
  } catch {
    svg = '';
  }
  thumbs.set(key, svg);
  return svg;
}

export interface RibbonFavoritesOptions {
  list(): FormatFavorite[];
  /** Give the selection this look. */
  apply(f: FormatFavorite): void;
  /** Save the selection's look as a new favorite. */
  save(): void;
  /** A favorite's own menu: rename, update from the selection, delete (at the card). */
  menu(f: FormatFavorite, at: HTMLElement): void;
}

/** The Home tab's Format Favorites gallery: a card for each favorite, and + to save the selection's look. */
export function ribbonFavorites(host: HTMLElement, o: RibbonFavoritesOptions): { refresh(): void } {
  host.classList.add('rb-styles', 'rb-favorites');
  const strip = document.createElement('div');
  strip.className = 'rbs-strip rbf-strip';
  strip.setAttribute('role', 'list');
  strip.setAttribute('aria-label', 'Format favorites');
  const side = document.createElement('div');
  side.className = 'rbs-side';
  const mk = (txt: string, title: string, run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = txt;
    b.title = title;
    b.addEventListener('click', run);
    side.append(b);
    return b;
  };
  mk('▲', 'Earlier favorites', () => strip.scrollBy({ top: -strip.clientHeight, behavior: 'smooth' }));
  mk('▼', 'More favorites', () => strip.scrollBy({ top: strip.clientHeight, behavior: 'smooth' }));
  const add = mk('+', 'Save Format as Favorite: keep the look of what is selected under a name', () => o.save());
  add.className = 'rbs-all';
  host.replaceChildren(strip, side);
  const refresh = () => {
    strip.replaceChildren();
    const list = o.list();
    for (const f of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rbs-card rbf-card';
      b.setAttribute('role', 'listitem');
      const what = favoriteSummary(f.look);
      b.title = `${f.name}${what ? `: ${what}` : ''}. Click to give the selection this look; right-click to rename, update or delete it`;
      b.innerHTML = `<span class="sc-pic">${favoriteThumb(f.look)}</span>`;
      const name = document.createElement('span');
      name.className = 'sc-name';
      name.textContent = f.name;
      b.append(name);
      b.addEventListener('click', () => o.apply(f));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); o.menu(f, b); });
      strip.append(b);
    }
    if (!list.length) {
      const hint = document.createElement('button');
      hint.type = 'button';
      hint.className = 'rbf-empty';
      hint.textContent = 'Select something formatted, then + (or right-click it ▸ Save Format as Favorite)';
      hint.addEventListener('click', () => o.save());
      strip.append(hint);
    }
  };
  refresh();
  return { refresh };
}
