// File > New > New Design: the shared template window (ui/template-window.ts) with Design's
// categories on the left (a blank page in the size you want, posters, graphical abstracts, TOC
// graphics, figures, flyers, flowcharts, workup schemes and timelines) and the chosen category's
// templates on the right, each a small picture of the page it makes. It blocks until a card is
// picked or the window is closed, since a design has no blank file open behind it.

import { Doc } from '../model';
import { Deck, DESIGN_SIZES, type SlideSize } from '../deck/deck';
import { paintSlide } from '../deck/slide-view';
import { DESIGN_TEMPLATES, TEMPLATE_CATEGORIES, type DesignTemplate, fillTemplate, readyTemplate, templateSize } from '../design/templates';
import { sizeLabel } from './design-panel';
import { type TemplateCard, showTemplateWindow } from './template-window';

/** What was picked: a template, a blank page of a size, 'blank' for a blank page of a size still to choose, or null (cancelled). */
export type TemplatePick = DesignTemplate | { blank: SlideSize } | 'blank' | null;

/** The sizes offered under Blank page (the rest are in Custom size…). */
const BLANK_SIZES = ['toc-acs', 'ga-elsevier', 'figure-2', 'poster-48x36', 'poster-36x48', 'poster-a0', 'slide-wide', 'letter', 'letter-wide', 'a4'];

export async function pickTemplate(): Promise<TemplatePick> {
  let result: TemplatePick = null;
  const pick = (p: TemplatePick) => () => { result = p; };
  const win = showTemplateWindow({
    mode: 'design',
    title: 'New Design',
    note: 'Pick a category on the left, then a blank page or a ready-made layout. Everything in a layout can be moved, retyped, recolored or deleted, and Page Size changes the page later.',
    categories: [
      { id: 'blank', name: 'Blank page', cards: () => blankCards(pick) },
      ...TEMPLATE_CATEGORIES.map((c) => ({ id: c.id, name: c.name, cards: () => DESIGN_TEMPLATES.filter((t) => t.category === c.id).map((t) => templateCard(t, pick)) })),
    ],
    remember: 'newDesignCategory',
    modal: true,
  });
  await win.closed;
  return result;
}

function templateCard(t: DesignTemplate, pick: (p: TemplatePick) => () => void): TemplateCard {
  return { id: t.id, name: t.name, detail: sizeName(t), tip: t.blurb, preview: (host) => host.append(thumb(t)), pick: pick(t) };
}

function blankCards(pick: (p: TemplatePick) => () => void): TemplateCard[] {
  const out: TemplateCard[] = BLANK_SIZES.map((id) => {
    const s = DESIGN_SIZES.find((x) => x.id === id)!;
    return { id: `blank-${id}`, name: s.name, detail: sizeLabel(s.size), preview: (host) => host.append(blank(s.size)), pick: pick({ blank: s.size }) };
  });
  out.push({ id: 'blank-custom', name: 'Custom size…', detail: 'Any size, in the unit you like', preview: (host) => host.append(blank(null)), pick: pick('blank') });
  return out;
}

/** The page a template is laid out on, by name ("Poster 48 × 36 in, landscape", "TOC graphic, ACS"). */
function sizeName(t: DesignTemplate): string {
  return DESIGN_SIZES.find((s) => s.id === t.sizeId)?.name ?? sizeLabel(templateSize(t));
}

const THUMB_W = 138, THUMB_H = 92;

function sizeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = THUMB_W * devicePixelRatio;
  c.height = THUMB_H * devicePixelRatio;
  c.style.width = `${THUMB_W}px`;
  c.style.height = `${THUMB_H}px`;
  return c;
}

/** An empty white page of the size (in proportion), or a dashed one for any size. */
function blank(size: SlideSize | null): HTMLCanvasElement {
  const c = sizeCanvas();
  const g = c.getContext('2d');
  if (!g) return c;
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
  return c;
}

/** Pictures already drawn, so going back to a category is instant. */
const drawn = new Map<string, HTMLCanvasElement>();

/** A small picture of the page a template makes. */
function thumb(t: DesignTemplate): HTMLCanvasElement {
  const c = sizeCanvas();
  const had = drawn.get(t.id);
  if (had) { c.getContext('2d')?.drawImage(had, 0, 0); return c; }
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
  return c;
}
