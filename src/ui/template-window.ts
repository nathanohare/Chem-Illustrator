// The template window that opens over a new file (File > New, the + tab menu, the start view):
// categories in a list on the left, the chosen category's templates as cards on the right. It
// doesn't block the file: the new, blank file is already open behind it, and a click anywhere
// outside the window (or Esc, or ×) closes it and keeps the blank file. A checkbox at the bottom
// turns it off for that kind of file (the same setting as in Settings ▸ Preferences ▸ New Files).
// Shared by Document, Spreadsheet, Presentation and Design; each mode supplies its own cards.

import { foldIntoInfo } from './info-tip';

/** One template: a small picture, a name, and what picking it does. */
export interface TemplateCard {
  id: string;
  name: string;
  /** A short second line (a size, the fonts). */
  detail?: string;
  /** Longer words, shown when the pointer rests on the card. */
  tip?: string;
  /** Draw the card's picture into `host`; called when the card first scrolls into view. */
  preview(host: HTMLElement): void | Promise<void>;
  pick(): void | Promise<void>;
}

export interface TemplateCategory {
  id: string;
  name: string;
  cards(): TemplateCard[] | Promise<TemplateCard[]>;
}

export interface TemplateWindowOptions {
  /** The mode the window is for: its edge and the picked category take that mode's color. */
  mode: 'drawing' | 'slides' | 'sheet' | 'document' | 'design';
  title: string;
  /** Help behind the "i" beside the title. */
  note?: string;
  categories: TemplateCategory[];
  /** An "All" category first, with every category's cards. */
  all?: boolean;
  /** The category shown first (else the one last used, else the first). */
  initial?: string;
  /** Where the category last used is kept (a localStorage key). */
  remember?: string;
  /** The "Show templates when creating new …" checkbox. */
  showPref?: { label: string; get(): boolean; set(on: boolean): void };
  /** Block the program until a card is picked or the window closed (Design's New window). */
  modal?: boolean;
}

export interface TemplateWindow {
  close(): void;
  /** True when a card was picked, false when closed without one. */
  closed: Promise<boolean>;
}

/** The window open now (one at a time: opening another closes it). */
let current: TemplateWindow | null = null;

export function closeTemplateWindow(): void {
  current?.close();
}

export function showTemplateWindow(o: TemplateWindowOptions): TemplateWindow {
  current?.close();
  let done: (picked: boolean) => void = () => {};
  const closed = new Promise<boolean>((r) => { done = r; });
  const root = document.createElement(o.modal ? 'dialog' : 'div');
  root.className = `template-window tw-${o.mode}${o.modal ? ' tw-modal' : ''}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', o.title);
  root.tabIndex = -1;

  const head = document.createElement('div');
  head.className = 'tw-head';
  const h = document.createElement('h2');
  h.textContent = o.title;
  head.append(h);
  if (o.note) {
    const note = document.createElement('p');
    note.textContent = o.note;
    head.append(note);
    foldIntoInfo(note, h);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'tw-close';
  x.title = o.modal ? 'Close (Esc)' : 'Close (Esc): keep the blank file';
  x.setAttribute('aria-label', 'Close');
  x.textContent = '×';
  head.append(x);

  const body = document.createElement('div');
  body.className = 'tw-body';
  const list = document.createElement('div');
  list.className = 'tw-cats';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-orientation', 'vertical');
  const grid = document.createElement('div');
  grid.className = 'tw-grid';
  grid.setAttribute('role', 'tabpanel');
  body.append(list, grid);
  root.append(head, body);

  if (o.showPref) {
    const foot = document.createElement('label');
    foot.className = 'tw-foot';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = o.showPref.get();
    const pref = o.showPref;
    box.addEventListener('change', () => pref.set(box.checked));
    foot.append(box, document.createTextNode(` ${pref.label}`));
    root.append(foot);
  }

  let isOpen = true;
  const finish = (picked: boolean) => {
    if (!isOpen) return;
    isOpen = false;
    document.removeEventListener('pointerdown', outside, true);
    removeEventListener('resize', place);
    io?.disconnect();
    if (root instanceof HTMLDialogElement && root.open) root.close();
    root.remove();
    if (current === win) current = null;
    done(picked);
  };
  x.addEventListener('click', () => finish(false));
  root.addEventListener('keydown', (e: Event) => {
    if ((e as KeyboardEvent).key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    finish(false);
  });
  if (root instanceof HTMLDialogElement) root.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });

  /** A press outside the window closes it (not one on a tip the window opened). */
  function outside(e: Event): void {
    const t = e.target as Element | null;
    if (!t || root.contains(t) || t.closest?.('.info-pop, dialog')) return;
    finish(false);
  }

  /** Over the work area (the page, sheet or slide), in the middle. */
  function place(): void {
    if (o.modal) return;
    const work = document.getElementById('work')?.getBoundingClientRect();
    const r = work && work.width > 200 && work.height > 200 ? work : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const w = Math.min(r.width - 24, 900), hgt = Math.min(r.height - 24, 580);
    root.style.left = `${Math.round(r.left + (r.width - w) / 2)}px`;
    root.style.top = `${Math.round(r.top + Math.max(12, (r.height - hgt) / 2))}px`;
    root.style.width = `${Math.round(w)}px`;
    root.style.height = `${Math.round(hgt)}px`;
  }

  // pictures are drawn as their cards come into view
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((seen) => {
      for (const s of seen) {
        if (!s.isIntersecting) continue;
        io!.unobserve(s.target);
        (s.target as HTMLElement & { draw?: () => void }).draw?.();
      }
    }, { root: grid, rootMargin: '120px' })
    : null;

  const makeCard = (c: TemplateCard): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tw-card';
    b.dataset.id = c.id;
    if (c.tip) b.title = c.tip;
    const pic = document.createElement('span') as HTMLElement & { draw?: () => void };
    pic.className = 'tw-thumb';
    pic.setAttribute('aria-hidden', 'true');
    pic.draw = () => { try { void c.preview(pic); } catch { /* the card stays plain */ } };
    const name = document.createElement('strong');
    name.textContent = c.name;
    b.append(pic, name);
    if (c.detail) {
      const d = document.createElement('span');
      d.className = 'tw-detail';
      d.textContent = c.detail;
      b.append(d);
    }
    b.addEventListener('click', async () => {
      if (!isOpen) return;
      try { await c.pick(); } finally { finish(true); }
    });
    if (io) io.observe(pic); else pic.draw();
    return b;
  };

  type Cat = { id: string; name: string; cards: () => Promise<TemplateCard[]> };
  const load = (c: TemplateCategory) => async () => c.cards();
  const cats: Cat[] = o.categories.map((c) => ({ id: c.id, name: c.name, cards: load(c) }));
  if (o.all) {
    cats.unshift({
      id: 'all', name: 'All', cards: async () => {
        const seen = new Set<string>();
        return (await Promise.all(o.categories.map((c) => c.cards()))).flat().filter((c) => !seen.has(c.id) && !!seen.add(c.id));
      },
    });
  }
  const tabs = new Map<string, HTMLButtonElement>();
  let showing = '';
  const show = async (id: string, focus = false) => {
    showing = id;
    for (const [k, b] of tabs) { b.setAttribute('aria-selected', String(k === id)); b.tabIndex = k === id ? 0 : -1; }
    if (focus) tabs.get(id)?.focus();
    if (o.remember) try { localStorage.setItem(o.remember, id); } catch { /* not kept */ }
    const cards = await cats.find((c) => c.id === id)!.cards();
    if (showing !== id || !isOpen) return;
    io?.disconnect();
    grid.replaceChildren(...cards.map(makeCard));
    grid.scrollTop = 0;
  };
  for (const c of cats) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tw-cat';
    b.setAttribute('role', 'tab');
    const n = document.createElement('span');
    n.textContent = c.name;
    const k = document.createElement('span');
    k.className = 'tw-count';
    b.append(n, k);
    void c.cards().then((list) => { k.textContent = list.length ? String(list.length) : ''; });
    b.addEventListener('click', () => void show(c.id));
    b.addEventListener('keydown', (e) => {
      const i = cats.indexOf(c);
      const j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? cats.length - 1 : -1;
      if (j < 0 || j >= cats.length || j === i) return;
      e.preventDefault();
      void show(cats[j].id, true);
    });
    tabs.set(c.id, b);
    list.append(b);
  }

  const win: TemplateWindow = { close: () => finish(false), closed };
  current = win;
  document.body.append(root);
  if (root instanceof HTMLDialogElement) root.showModal();
  else {
    place();
    addEventListener('resize', place);
    // (added after the click that opened the window has finished)
    setTimeout(() => { if (isOpen) document.addEventListener('pointerdown', outside, true); }, 0);
  }
  let first = o.initial ?? '';
  if (!first && o.remember) try { first = localStorage.getItem(o.remember) ?? ''; } catch { /* the first */ }
  if (!tabs.has(first)) first = cats[0]?.id ?? '';
  if (first) void show(first, true);
  return win;
}
