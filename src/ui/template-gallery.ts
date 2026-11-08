// File > New > New Design: template categories in a list on the left (a blank page in the size
// you want, posters, graphical abstracts, TOC graphics, figures, flyers, flowcharts, workup
// schemes and timelines), and the chosen category's templates on the right, each shown as a small
// picture of the page it makes. Pictures are drawn when their category is first shown.

import { foldIntoInfo } from './info-tip';
import { Doc } from '../model';
import { Deck, DESIGN_SIZES, type SlideSize } from '../deck/deck';
import { paintSlide } from '../deck/slide-view';
import { DESIGN_TEMPLATES, TEMPLATE_CATEGORIES, type DesignTemplate, fillTemplate, readyTemplate, templateSize } from '../design/templates';
import { sizeLabel } from './design-panel';

/** What was picked: a template, a blank page of a size, 'blank' for a blank page of a size still to choose, or null (cancelled). */
export type TemplatePick = DesignTemplate | { blank: SlideSize } | 'blank' | null;

/** The sizes offered under Blank page (the rest are in Custom size…). */
const BLANK_SIZES = ['toc-acs', 'ga-elsevier', 'figure-2', 'poster-48x36', 'poster-36x48', 'poster-a0', 'slide-wide', 'letter', 'letter-wide', 'a4'];

const REMEMBER = 'newDesignCategory';

export function pickTemplate(): Promise<TemplatePick> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask template-gallery';
    const h = document.createElement('h2');
    h.textContent = 'New Design';
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Pick a category on the left, then a blank page or a ready-made layout. Everything in a layout can be moved, retyped, recolored or deleted, and Page Size changes the page later.';
    foldIntoInfo(note, h);
    let result: TemplatePick = null;
    const pick = (p: TemplatePick) => { result = p; d.close(); };

    const body = document.createElement('div');
    body.className = 'tg-body';
    const list = document.createElement('div');
    list.className = 'tg-cats';
    list.setAttribute('role', 'tablist');
    list.setAttribute('aria-orientation', 'vertical');
    const grid = document.createElement('div');
    grid.className = 'tg-grid';
    grid.setAttribute('role', 'tabpanel');
    body.append(list, grid);

    const cats: { id: string; name: string; count: number }[] = [
      { id: 'blank', name: 'Blank page', count: 0 },
      ...TEMPLATE_CATEGORIES.map((c) => ({ ...c, count: DESIGN_TEMPLATES.filter((t) => t.category === c.id).length })),
    ];
    const tabs = new Map<string, HTMLButtonElement>();
    const show = (id: string, focus = false) => {
      for (const [k, b] of tabs) { b.setAttribute('aria-selected', String(k === id)); b.tabIndex = k === id ? 0 : -1; }
      if (focus) tabs.get(id)?.focus();
      try { localStorage.setItem(REMEMBER, id); } catch { /* not kept */ }
      grid.replaceChildren(...(id === 'blank' ? blankCards(pick) : DESIGN_TEMPLATES.filter((t) => t.category === id).map((t) => templateCard(t, pick))));
      grid.scrollTop = 0;
    };
    for (const c of cats) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tg-cat';
      b.setAttribute('role', 'tab');
      const n = document.createElement('span');
      n.textContent = c.name;
      b.append(n);
      if (c.count) {
        const k = document.createElement('span');
        k.className = 'tg-count';
        k.textContent = String(c.count);
        b.append(k);
      }
      b.addEventListener('click', () => show(c.id));
      b.addEventListener('keydown', (e) => {
        const i = cats.indexOf(c);
        const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? cats.length - 1 : -1;
        if (j < 0 || j >= cats.length || j === i && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        show(cats[j].id, true);
      });
      tabs.set(c.id, b);
      list.append(b);
    }

    const buttons = document.createElement('p');
    buttons.className = 'ask-buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => d.close());
    buttons.append(cancel);
    d.append(h, note, body, buttons);
    d.addEventListener('close', () => { d.remove(); resolve(result); });
    document.body.append(d);
    let first = 'poster';
    try { first = localStorage.getItem(REMEMBER) ?? first; } catch { /* the default */ }
    if (!tabs.has(first)) first = 'poster';
    d.showModal();
    show(first, true);
  });
}

function card(name: string, detail: string, tip: string, paint: (c: HTMLCanvasElement) => void, onPick: () => void, blurb?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tg-card';
  if (tip) b.title = tip;
  const c = document.createElement('canvas');
  c.className = 'tg-thumb';
  paint(c);
  const t = document.createElement('strong');
  t.textContent = name;
  b.append(c, t);
  if (blurb) {
    const p = document.createElement('span');
    p.className = 'tg-blurb';
    p.textContent = blurb;
    b.append(p);
  }
  const s = document.createElement('span');
  s.className = 'muted tg-size';
  s.textContent = detail;
  b.append(s);
  b.addEventListener('click', onPick);
  return b;
}

function templateCard(t: DesignTemplate, pick: (p: TemplatePick) => void): HTMLButtonElement {
  return card(t.name, sizeName(t), t.blurb, (c) => thumb(c, t), () => pick(t), t.blurb);
}

function blankCards(pick: (p: TemplatePick) => void): HTMLButtonElement[] {
  const out = BLANK_SIZES.map((id) => {
    const s = DESIGN_SIZES.find((x) => x.id === id)!;
    return card(s.name, sizeLabel(s.size), '', (c) => blank(c, s.size), () => pick({ blank: s.size }));
  });
  out.push(card('Custom size…', 'Any size, in the unit you like', '', (c) => blank(c, null), () => pick('blank')));
  return out;
}

/** The page a template is laid out on, by name ("Poster 48 × 36 in, landscape", "TOC graphic, ACS"). */
function sizeName(t: DesignTemplate): string {
  return DESIGN_SIZES.find((s) => s.id === t.sizeId)?.name ?? sizeLabel(templateSize(t));
}

const THUMB_W = 168, THUMB_H = 112;

function sizeCanvas(c: HTMLCanvasElement): void {
  c.width = THUMB_W * devicePixelRatio;
  c.height = THUMB_H * devicePixelRatio;
  c.style.width = `${THUMB_W}px`;
  c.style.height = `${THUMB_H}px`;
}

/** An empty white page of the size (in proportion), or a dashed one for any size. */
function blank(c: HTMLCanvasElement, size: SlideSize | null): void {
  sizeCanvas(c);
  const g = c.getContext('2d');
  if (!g) return;
  const k = devicePixelRatio, pad = 10;
  const s = size ?? { w: 3, h: 2 };
  const f = Math.min((THUMB_W - 2 * pad) / s.w, (THUMB_H - 2 * pad) / s.h);
  const w = s.w * f, h = s.h * f, x = (THUMB_W - w) / 2, y = (THUMB_H - h) / 2;
  g.fillStyle = '#ffffff';
  g.fillRect(x * k, y * k, w * k, h * k);
  if (!size) {
    g.setLineDash([4 * k, 3 * k]);
    g.strokeStyle = '#7f7f7f';
    g.lineWidth = k;
    g.strokeRect((x + 0.5) * k, (y + 0.5) * k, (w - 1) * k, (h - 1) * k);
  }
}

/** Pictures already drawn, so going back to a category is instant. */
const drawn = new Map<string, HTMLCanvasElement>();

/** A small picture of the page a template makes. */
function thumb(c: HTMLCanvasElement, t: DesignTemplate): void {
  sizeCanvas(c);
  const had = drawn.get(t.id);
  if (had) { c.getContext('2d')?.drawImage(had, 0, 0); return; }
  void readyTemplate(t).then(() => {
    const size = templateSize(t);
    const deck = Deck.design(new Doc(), size, (d) => fillTemplate(d, t));
    const doc = deck.docOf(0);
    try {
      paintSlide(c, THUMB_W, THUMB_H, devicePixelRatio, { size, master: deck.master, layout: 'blank', index: 0 }, doc, 'rgba(0,0,0,0)');
      const keep = document.createElement('canvas');
      keep.width = c.width; keep.height = c.height;
      keep.getContext('2d')?.drawImage(c, 0, 0);
      drawn.set(t.id, keep);
    } catch {
      // a picture that can't be drawn here (no canvas) leaves the card plain
    }
  });
}
