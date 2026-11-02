// Drawing style cards: each built-in style (grouped by what it is for: Journal, Presentation,
// Poster, Thesis) and each of your own, with a small structure drawn in that style. They fill the
// top of the Drawing Style window and the Drawing Styles gallery on the ribbon, where pointing at
// a card shows your drawing in that style and clicking applies it.

import { Doc } from '../model';
import type { DocStyle } from '../style';
import { STYLE_PRESETS, presetNamed, sameLook, type StyleUse } from '../drawing-styles';
import { recordPicture, pictureSvg } from '../render/picture';

/** One card: a built-in ('preset:<name>') or your own ('own:<name>'). */
export interface StyleCard {
  key: string;
  style: DocStyle;
  use: StyleUse | 'Yours';
}

/** Every card, in gallery order: the built-in styles by use, then your own. */
export function styleCardList(own: DocStyle[]): StyleCard[] {
  return [
    ...STYLE_PRESETS.map((p) => ({ key: 'preset:' + p.style.name, style: { ...p.style }, use: p.use })),
    ...own.map((s) => ({ key: 'own:' + s.name, style: { ...s }, use: 'Yours' as const })),
  ];
}

/** The card for the style in use: your own of that name and look first, then a built-in that draws the same. */
export function cardFor(cards: StyleCard[], st: DocStyle): StyleCard | undefined {
  return cards.find((c) => c.use === 'Yours' && c.style.name === st.name && sameLook(c.style, st))
    ?? cards.find((c) => c.use !== 'Yours' && c.style.name === st.name && sameLook(c.style, st))
    ?? cards.find((c) => sameLook(c.style, st));
}

/** A card's name: a built-in's without the bracket after it (the tooltip has the whole name). */
export function cardName(c: StyleCard): string {
  return c.use === 'Yours' ? c.style.name : c.style.name.replace(/\s*\(.*\)$/, '');
}

/** A card's tip: its whole name and use, its numbers, and for a built-in where they come from. */
export function cardTip(c: StyleCard): string {
  const p = c.use === 'Yours' ? undefined : presetNamed(c.style.name);
  return `${c.style.name} (${c.use})\n${styleNumbers(c.style)}${p ? `\nFrom: ${p.source}.${p.note ? ' ' + p.note : ''}` : ''}`;
}

/** A short line of a style's numbers, for a card's tooltip. */
export function styleNumbers(st: DocStyle): string {
  const r = (v: number) => +v.toFixed(2);
  return `Bond ${r(st.bondLength)} pt · line ${r(st.lineWidth)} pt · bold ${r(st.boldWidth)} pt · ${st.labelFont} ${r(st.labelSize)} pt`;
}

/**
 * The sample drawn on each card: a benzene ring with a side chain to a stereocentre (an OH and
 * a wedged methyl) and a compound number under it, in style `st`.
 */
export function sampleDoc(st: DocStyle): Doc {
  const doc = new Doc();
  doc.style = { ...st };
  const L = st.bondLength;
  doc.edit('sample', () => {
    const ring: number[] = [];
    for (let i = 0; i < 6; i++) {
      const t = ((-90 + 60 * i) * Math.PI) / 180;
      ring.push(doc.addAtom(L * Math.cos(t), L * Math.sin(t)).id);
    }
    for (let i = 0; i < 6; i++) doc.addBond(ring[i], ring[(i + 1) % 6], i % 2 ? 1 : 2);
    const k = Math.sqrt(3) / 2;
    const c = doc.addAtom(2 * k * L, -L).id;
    doc.addBond(ring[1], c);
    const o = doc.addAtom(3 * k * L, -L / 2, 8).id;
    doc.addBond(c, o);
    const me = doc.addAtom(3 * k * L, -1.5 * L).id;
    doc.addBond(c, me, 1, 'wedge');
    doc.addCaption({ x: 0, y: L + st.captionSize * 1.1, runs: [{ text: '1', bold: true }], justify: 'center' });
  });
  return doc;
}

const thumbs = new Map<string, string>();

/**
 * A card's picture: the sample in `st`, as inline SVG no bigger than w × h pixels. Bigger
 * styles draw bigger (the bond on screen grows with the square root of the style's bond
 * length), so a poster style looks larger than a journal's, and line weights compare fairly.
 */
export function styleThumb(st: DocStyle, w = 104, h = 58): string {
  const key = JSON.stringify([st.bondLength, st.lineWidth, st.boldWidth, st.marginWidth, st.hashSpacing, st.bondSpacing, st.labelFont, st.labelSize, st.captionFont, st.captionSize, w, h]);
  const had = thumbs.get(key);
  if (had !== undefined) return had;
  let svg = '';
  try {
    const p = recordPicture(sampleDoc(st), 1.5);
    if (p) {
      const pw = p.box.x2 - p.box.x1, ph = p.box.y2 - p.box.y1;
      const want = (14 * Math.sqrt(st.bondLength / 14.4)) / st.bondLength;
      const k = Math.min(want, w / pw, h / ph);
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

export interface StyleCardsOptions {
  own: DocStyle[];
  /** The key of the card shown as chosen. */
  chosen?: string;
  onPick(card: StyleCard): void;
  /** Pointing at a card (null when the pointer leaves the cards). */
  onHover?(card: StyleCard | null): void;
  /** Shows a last "+ Save current" card that calls this. */
  onSave?(): void;
}

/** The cards as a grid of radio buttons; `select(key)` marks another one as chosen. */
export function styleCards(o: StyleCardsOptions): HTMLDivElement & { select(key: string): void } {
  const grid = document.createElement('div') as HTMLDivElement & { select(key: string): void };
  grid.className = 'style-cards';
  grid.setAttribute('role', 'radiogroup');
  grid.setAttribute('aria-label', 'Drawing styles');
  const buttons: HTMLButtonElement[] = [];
  for (const c of styleCardList(o.own)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'style-card';
    b.dataset.key = c.key;
    b.setAttribute('role', 'radio');
    b.title = cardTip(c);
    const head = document.createElement('span');
    head.className = 'sc-use';
    head.textContent = c.use === 'Yours' ? 'Yours ★' : c.use;
    const pic = document.createElement('span');
    pic.className = 'sc-pic';
    pic.innerHTML = styleThumb(c.style);
    const name = document.createElement('span');
    name.className = 'sc-name';
    name.textContent = cardName(c);
    b.append(head, pic, name);
    b.addEventListener('click', () => { grid.select(c.key); o.onPick(c); });
    if (o.onHover) {
      b.addEventListener('pointerenter', () => o.onHover!(c));
      b.addEventListener('focus', () => o.onHover!(c));
    }
    buttons.push(b);
    grid.append(b);
  }
  if (o.onSave) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'style-card sc-save';
    b.title = 'Keep the style in use now as one of your own, under a name, in every mode';
    b.innerHTML = '<span class="sc-plus" aria-hidden="true">+</span><span class="sc-name">Save current</span>';
    b.addEventListener('click', () => o.onSave!());
    grid.append(b);
  }
  if (o.onHover) {
    grid.addEventListener('pointerleave', () => o.onHover!(null));
    grid.addEventListener('focusout', (e) => { if (!grid.contains(e.relatedTarget as Node)) o.onHover!(null); });
  }
  // arrow keys move between cards
  grid.addEventListener('keydown', (e) => {
    const all = [...grid.querySelectorAll<HTMLButtonElement>('.style-card')];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    all[(i + step + all.length) % all.length].focus();
  });
  grid.select = (key: string) => {
    for (const b of buttons) b.setAttribute('aria-checked', String(b.dataset.key === key));
  };
  grid.select(o.chosen ?? '');
  return grid;
}

export interface StylePresetsPopOptions {
  own: DocStyle[];
  current: DocStyle;
  /** Apply a card's style. */
  pick(st: DocStyle): void;
  /** Show the drawing in a style while a card is pointed at (null: as it was). */
  preview?(st: DocStyle | null): void;
  /** Keep the style in use as one of your own. */
  save(): void;
  /** Open the Drawing Style window. */
  more(): void;
}

/** The Drawing Styles gallery, dropped down under a ribbon button. */
export function showStylePresets(anchor: HTMLElement | { left: number; bottom: number }, o: StylePresetsPopOptions): void {
  document.querySelector('.style-preset-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'style-preset-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Drawing Styles');
  const head = document.createElement('div');
  head.className = 'spp-head';
  head.textContent = 'Drawing Styles: point at one to see your drawing in it, click to use it';
  let previewing = false;
  const preview = (st: DocStyle | null) => {
    if (!o.preview) return;
    if (!st && !previewing) return;
    previewing = !!st;
    o.preview(st);
  };
  const cards = styleCards({
    own: o.own,
    chosen: cardFor(styleCardList(o.own), o.current)?.key,
    onPick: (c) => { close(); o.pick(c.style); },
    onHover: (c) => preview(c ? c.style : null),
    onSave: () => { close(); o.save(); },
  });
  const foot = document.createElement('div');
  foot.className = 'spp-foot';
  const more = document.createElement('button');
  more.type = 'button';
  more.textContent = 'More Settings…';
  more.title = 'The Drawing Style window: every number, your own styles, and the style new files start in';
  more.addEventListener('click', () => { close(); o.more(); });
  foot.append(more);
  pop.append(head, cards, foot);
  document.body.append(pop);
  const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : anchor;
  pop.style.left = `${Math.max(4, Math.min(r.left, innerWidth - pop.offsetWidth - 4))}px`;
  pop.style.top = `${r.bottom + 4}px`;
  (cards.querySelector<HTMLButtonElement>('[aria-checked=true]') ?? cards.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
  const outside = (e: Event) => {
    if (e instanceof KeyboardEvent ? e.key === 'Escape' : !pop.contains(e.target as Node)) close();
  };
  function close() {
    preview(null);
    pop.remove();
    removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', outside, true);
  }
  setTimeout(() => { addEventListener('pointerdown', outside, true); addEventListener('keydown', outside, true); });
}

export interface RibbonStylesOptions {
  own(): DocStyle[];
  current(): DocStyle;
  pick(st: DocStyle): void;
  preview?(st: DocStyle | null): void;
  /** The ▾ button: the whole gallery. */
  more(anchor: HTMLElement): void;
}

/**
 * The Drawing Styles gallery inline on a ribbon, as Word shows its Styles: a row of small cards
 * that scrolls, with ▾ for the whole gallery. Point at a card to see the drawing in it; click to
 * use it. `refresh()` redraws it (after your own styles or the style in use change).
 */
export function ribbonStyles(host: HTMLElement, o: RibbonStylesOptions): { refresh(): void } {
  host.classList.add('rb-styles');
  const strip = document.createElement('div');
  strip.className = 'rbs-strip';
  strip.setAttribute('role', 'radiogroup');
  strip.setAttribute('aria-label', 'Drawing styles');
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
  mk('▲', 'Earlier styles', () => strip.scrollBy({ top: -strip.clientHeight, behavior: 'smooth' }));
  mk('▼', 'More styles', () => strip.scrollBy({ top: strip.clientHeight, behavior: 'smooth' }));
  const all = mk('▾', 'All drawing styles, saving your own, and More Settings', () => o.more(all));
  all.className = 'rbs-all';
  host.replaceChildren(strip, side);
  let previewing = false;
  const preview = (st: DocStyle | null) => {
    if (!o.preview || (!st && !previewing)) return;
    previewing = !!st;
    o.preview(st);
  };
  const refresh = (scroll = false) => {
    const cards = styleCardList(o.own());
    const on = cardFor(cards, o.current())?.key;
    strip.replaceChildren();
    for (const c of cards) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rbs-card';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(c.key === on));
      b.title = cardTip(c);
      b.innerHTML = `<span class="sc-pic">${styleThumb(c.style, 58, 30)}</span>`;
      const name = document.createElement('span');
      name.className = 'sc-name';
      name.textContent = cardName(c);
      b.append(name);
      b.addEventListener('pointerenter', () => preview(c.style));
      b.addEventListener('focus', () => preview(c.style));
      b.addEventListener('click', () => { preview(null); o.pick(c.style); refresh(); });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); o.more(b); });
      strip.append(b);
    }
    // show the style in use when it changed (another tab, or picked elsewhere)
    const at = strip.querySelector<HTMLElement>('[aria-checked=true]');
    if ((scroll || on !== lastOn) && at) strip.scrollTop = at.offsetTop - strip.offsetTop;
    lastOn = on;
  };
  let lastOn: string | undefined;
  strip.addEventListener('pointerleave', () => preview(null));
  strip.addEventListener('focusout', (e) => { if (!strip.contains(e.relatedTarget as Node)) preview(null); });
  host.addEventListener('pointerenter', () => { if (!previewing) refresh(); });
  refresh(true);
  return { refresh: () => refresh(true) };
}
