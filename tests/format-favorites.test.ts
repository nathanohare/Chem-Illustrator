// @vitest-environment jsdom
//
// Format Favorites: a complete look kept under a name, given to the selection with one click,
// kept in the settings so it is there in every mode.

import { describe, expect, it } from 'vitest';
import { Doc } from '../src/model';
import { paintObjects, pickObjectLook } from '../src/format-painter';
import { parseSettings } from '../src/settings';
import { cellFavoriteLook, favoriteCellLook } from '../src/favorites';
import { FAVORITES_MAX, favoriteSummary, favoriteThumb, freshFavoriteName, parseFavorites, ribbonFavorites, withFavorite, type FormatFavorite } from '../src/ui/format-favorites';

const none = () => ({ atoms: [] as number[], bonds: [] as number[], captions: [] as number[], arrows: [] as number[], shapes: [] as number[] });

/** A box with a full look: gradient fill, pattern, shadow, transparency, line and effects. */
function styledBox(doc: Doc): number {
  let id = 0;
  doc.edit('box', () => {
    const s = doc.addShape({ kind: 'geo', geo: 'rect', x1: 0, y1: 0, x2: 80, y2: 40, filled: true, fillColor: '#ffcc00', color: '#aa2200' });
    doc.updateShape(s.id, { lineWidth: 2.5, dashed: true, transparency: 0.3, shadow: true, pattern: 'dkDnDiag', glow: { color: '#00ff00', size: 4 } } as never);
    id = s.id;
  });
  return id;
}

describe('a favorite', () => {
  it('is the whole look of what is selected, and gives it to something else in one step', () => {
    const doc = new Doc();
    const from = styledBox(doc);
    const look = pickObjectLook(doc, { ...none(), shapes: [from] })!;
    expect(look.shape).toBeTruthy();
    const fav: FormatFavorite = { name: 'Highlight box', look: JSON.parse(JSON.stringify(look)) };
    let to = 0;
    doc.edit('plain', () => { to = doc.addShape({ kind: 'geo', geo: 'ellipse', x1: 100, y1: 0, x2: 160, y2: 40 }).id; });
    doc.edit(`Format Favorite “${fav.name}”`, () => { paintObjects(doc, { ...none(), shapes: [to] }, fav.look); });
    const a = doc.shapes.get(from)!, b = doc.shapes.get(to)!;
    for (const k of ['fillColor', 'color', 'lineWidth', 'dashed', 'transparency', 'shadow', 'pattern', 'glow'] as const) expect(b[k]).toEqual(a[k]);
    // the shape's own kind and place stay
    expect(b.geo).toBe('ellipse');
    expect(b.x1).toBe(100);
    // one undo takes it back
    doc.undo();
    expect(doc.shapes.get(to)!.fillColor).not.toBe('#ffcc00');
  });

  it('says what it covers, and draws a small picture of itself', () => {
    const doc = new Doc();
    const look = pickObjectLook(doc, { ...none(), shapes: [styledBox(doc)] })!;
    const words = favoriteSummary(look);
    expect(words).toContain('pattern');
    expect(words).toContain('30% transparent');
    expect(words).toContain('shadow');
    expect(words).toContain('dashed line');
    expect(words).toContain('effects');
    expect(favoriteThumb(look)).toMatch(/^<svg/);
  });
});

describe('the list of favorites', () => {
  const look = { shape: { filled: true, fillColor: '#123456' } } as FormatFavorite['look'];

  it('keeps only well-formed favorites, names unique, at most the limit', () => {
    expect(parseFavorites('nope')).toEqual([]);
    const got = parseFavorites([{ name: ' A ', look }, { name: 'A', look }, { name: '', look }, { name: 'B', look: [] }, { name: 'C' }, null, { name: 'D', look }]);
    expect(got.map((f) => f.name)).toEqual(['A', 'D']);
    expect(parseFavorites(Array.from({ length: FAVORITES_MAX + 5 }, (_, i) => ({ name: `F${i}`, look })))).toHaveLength(FAVORITES_MAX);
  });

  it('replaces one of the same name in its place, and names new ones', () => {
    const list = [{ name: 'A', look }, { name: 'B', look }];
    const other = { shape: { filled: false } } as FormatFavorite['look'];
    const after = withFavorite(list, { name: 'A', look: other });
    expect(after.map((f) => f.name)).toEqual(['A', 'B']);
    expect(after[0].look).toBe(other);
    expect(withFavorite(list, { name: 'C', look }).map((f) => f.name)).toEqual(['A', 'B', 'C']);
    expect(freshFavoriteName(list)).toBe('Favorite 3');
    expect(freshFavoriteName([{ name: 'Favorite 2', look }])).toBe('Favorite 3');
  });

  it('is kept in the settings, so it is there in every mode', () => {
    const s = parseSettings(JSON.stringify({ formatFavorites: [{ name: 'Mine', look }] }));
    expect(s.formatFavorites).toEqual([{ name: 'Mine', look }]);
    expect(parseSettings(null).formatFavorites).toEqual([]);
    expect(parseSettings(JSON.stringify({ formatFavorites: 7 })).formatFavorites).toEqual([]);
  });
});

describe('the Home tab gallery', () => {
  it('shows a card for each favorite; clicking gives its look, + saves a new one', () => {
    const host = document.createElement('div');
    let list: FormatFavorite[] = [];
    const applied: string[] = [];
    let saved = 0;
    const g = ribbonFavorites(host, { list: () => list, apply: (f) => applied.push(f.name), save: () => saved++, menu: () => {} });
    expect(host.querySelector('.rbf-empty')).toBeTruthy();
    list = [{ name: 'Blue', look: { shape: { filled: true, fillColor: '#0000ff' } } as FormatFavorite['look'] }];
    g.refresh();
    const card = host.querySelector<HTMLButtonElement>('.rbf-card')!;
    expect(card.textContent).toContain('Blue');
    card.click();
    expect(applied).toEqual(['Blue']);
    host.querySelector<HTMLButtonElement>('.rbs-all')!.click();
    expect(saved).toBe(1);
  });

  it('a favorite gives cells its fill, font and outline, and cells give one back', () => {
    const got = favoriteCellLook({ shape: { filled: true, fillColor: '#ffd966', color: '#c00000', lineWidth: 1 }, text: { run: { bold: true, color: '#1f4e79', size: 12 }, justify: 'center' } })!;
    expect(got.patch).toEqual({ fill: '#ffd966', bold: true, size: 12, color: '#1f4e79', align: 'center' });
    expect(got.borders?.top).toEqual({ style: 'thin', color: '#c00000' });
    // a black outline is the default line of a shape: cells keep their own borders
    expect(favoriteCellLook({ shape: { filled: true, fillColor: '#eeeeee', color: '#000000' } })!.borders).toBeUndefined();
    expect(favoriteCellLook({ bond: { color: '#000000' } as never })).toBeNull();
    const back = cellFavoriteLook({ fill: '#ffd966', bold: true, color: '#1f4e79', align: 'right' });
    expect(back.shape).toMatchObject({ filled: true, fillColor: '#ffd966' });
    expect(back.text?.run).toMatchObject({ bold: true, color: '#1f4e79' });
    expect(favoriteCellLook(back)!.patch).toMatchObject({ fill: '#ffd966', bold: true, color: '#1f4e79', align: 'right' });
  });
});
