// The cards in the template window over a new document, spreadsheet or presentation: our own
// document and sheet templates (each shown as a small page of its headings, or its first row of
// column headings), the slide themes (a title slide over a content slide) and starter decks.

import { DOC_CATEGORIES, DOC_TEMPLATES, type DocTemplate } from '../document/templates';
import { SHEET_CATEGORIES, SHEET_TEMPLATES, type SheetTemplate } from '../sheet/templates';
import { SLIDE_TEMPLATES, applyTemplate, type SlideTemplate } from '../deck/templates';
import { STARTER_DECKS, type StarterDeck } from '../deck/starters';
import type { Master, SlideSize } from '../deck/deck';
import { keyOf } from '../sheet/refs';
import { forgetTextWidths } from '../render/renderer';
import type { TemplateCategory, TemplateCard } from './template-window';

/** A small page showing a document template's title and headings. */
export function docPreview(t: DocTemplate): HTMLElement {
  const page = document.createElement('div');
  page.className = 'ft-page';
  page.setAttribute('aria-hidden', 'true');
  const d = t.make();
  const text = d.runs.map((r) => r.text).join('').split('\n');
  d.paras.slice(0, 40).forEach((p, i) => {
    const s = p.style;
    if (s !== 'Title' && s !== 'Heading1' && s !== 'Heading2') return;
    const line = document.createElement('div');
    line.className = s === 'Title' ? 'ft-title' : s === 'Heading1' ? 'ft-h1' : 'ft-h2';
    line.textContent = text[i] ?? '';
    page.append(line);
  });
  return page;
}

/** A small grid showing a sheet template's first rows. */
export function sheetPreview(t: SheetTemplate): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'ft-sheet';
  grid.setAttribute('aria-hidden', 'true');
  const sh = t.make().sheets[0];
  // the heading row: the first row with three or more cells filled (else the first)
  let head = 0;
  for (let r = 0; r < 10; r++) {
    let n = 0;
    for (let c = 0; c < 5; c++) if (sh.cells.get(keyOf(r, c))?.input) n++;
    if (n >= 3) { head = r; break; }
  }
  for (let r = head; r < head + 6; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement('span');
      const v = sh.cells.get(keyOf(r, c))?.input ?? '';
      cell.textContent = v.startsWith('=') ? '' : v;
      if (r === head) cell.className = 'ft-head';
      grid.append(cell);
    }
  }
  return grid;
}

const docCard = (t: DocTemplate, use: (t: DocTemplate) => void): TemplateCard => ({
  id: t.id, name: t.name, tip: t.blurb,
  preview: (host) => { host.replaceChildren(docPreview(t)); },
  pick: () => use(t),
});

const sheetCard = (t: SheetTemplate, use: (t: SheetTemplate) => void): TemplateCard => ({
  id: t.id, name: t.name, tip: t.blurb,
  preview: (host) => { host.replaceChildren(sheetPreview(t)); },
  pick: () => use(t),
});

export function documentCategories(use: (t: DocTemplate) => void): TemplateCategory[] {
  return DOC_CATEGORIES.map((c) => ({ id: c.id, name: c.name, cards: () => DOC_TEMPLATES.filter((t) => t.category === c.id).map((t) => docCard(t, use)) }));
}

export function sheetCategories(use: (t: SheetTemplate) => void): TemplateCategory[] {
  return SHEET_CATEGORIES.map((c) => ({ id: c.id, name: c.name, cards: () => SHEET_TEMPLATES.filter((t) => t.category === c.id).map((t) => sheetCard(t, use)) }));
}

export interface SlideChoices {
  master: Master;
  size: SlideSize;
  /** Your own themes. */
  mine: SlideTemplate[];
  useTheme(t: SlideTemplate): void;
  useStarter(s: StarterDeck): void;
  /** Draw a look's title slide over a content slide (from the slide templates window). */
  paint(c: HTMLCanvasElement, m: Master, size: SlideSize, w: number, h: number, stacked: boolean): void;
}

/** Slide themes by group, your own first, then the starter decks. */
export function slideCategories(o: SlideChoices): TemplateCategory[] {
  const themeCard = (t: SlideTemplate): TemplateCard => ({
    id: `theme-${t.id}`, name: t.name, detail: t.titleFont === t.bodyFont ? t.titleFont : `${t.titleFont} and ${t.bodyFont}`,
    preview: (host) => {
      const c = document.createElement('canvas');
      o.paint(c, applyTemplate(o.master, t), o.size, 96, 54, true);
      host.replaceChildren(c);
      // the fonts that come with the app load when first used: draw again once they have, with the
      // widths measured in the stand-in font forgotten (else a centered title sits off center)
      if (typeof document.fonts?.load === 'function') {
        void Promise.allSettled([t.titleFont, t.bodyFont].flatMap((f) => [document.fonts.load(`12px "${f}"`), document.fonts.load(`bold 12px "${f}"`)]))
          .then(() => { if (!c.isConnected) return; forgetTextWidths(); o.paint(c, applyTemplate(o.master, t), o.size, 96, 54, true); });
      }
    },
    pick: () => o.useTheme(t),
  });
  const groups = ['Mine', 'Light', 'Dark title slide', 'Bright', 'Minimal', 'Bold', 'Classic', 'Chemistry'] as const;
  const out: TemplateCategory[] = [];
  for (const g of groups) {
    const list = g === 'Mine' ? o.mine : SLIDE_TEMPLATES.filter((t) => t.group === g);
    if (list.length) out.push({ id: `themes-${g.toLowerCase().replace(/ /g, '-')}`, name: g === 'Mine' ? 'Your themes' : g, cards: () => list.map(themeCard) });
  }
  out.push({
    id: 'teaching', name: 'Teaching', cards: () => STARTER_DECKS.map((s) => ({
      id: `starter-${s.id}`, name: s.name, detail: `${s.slides.length} slides`, tip: s.blurb,
      preview: (host) => {
        const page = document.createElement('div');
        page.className = 'ft-page ft-deck';
        page.setAttribute('aria-hidden', 'true');
        for (const p of s.slides.slice(0, 9)) {
          const line = document.createElement('div');
          line.className = p.layout === 'title' ? 'ft-title' : 'ft-h2';
          line.textContent = p.text[0] ?? '';
          page.append(line);
        }
        host.replaceChildren(page);
      },
      pick: () => o.useStarter(s),
    })),
  });
  return out;
}
