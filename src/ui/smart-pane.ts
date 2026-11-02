// The Smart Scheme pane: the species of the selected Smart Scheme in order, beside it on the page,
// like SmartArt's text pane. It works both ways: typing in a row changes the drawing, and a change
// on the drawing shows in the rows. Rows drag to put the species in another order; × takes one
// out and + Add Species puts one on the end. The pictures along the top lay the scheme out again
// (in a line, in rows, as a snake, down the page or round a cycle). ‹ folds it to a tab.

import type { Doc } from '../model';
import type { Rect } from '../geom';
import type { Measure } from '../editor/arrange';
import { readSmart, runsMarkup, slotName, stepText, SMART_LAYOUTS, type SmartData, type SmartLayout, type StepPart } from '../chem/smart-scheme';

export interface SmartPaneHooks {
  doc(): Doc;
  measure(): Measure;
  /** The Smart Scheme selected (its frame), or null. */
  selected(): number | null;
  /** Where a box on the page is on the screen (CSS pixels, the window's coordinates). */
  screenRect(r: Rect): Rect;
  /** Where the drawing shows on the screen (the pane keeps inside it). */
  area(): Rect;
  slotText(id: number, k: number, text: string): void;
  stepText(id: number, k: number, part: StepPart, text: string): void;
  add(id: number, after: number): void;
  remove(id: number, k: number): void;
  move(id: number, from: number, to: number): void;
  arrange(id: number, patch: Partial<SmartData>): void;
  ungroup(id: number): void;
}

const ICONS: Record<SmartLayout, string> = {
  line: '<rect x="2" y="9" width="5" height="5"/><rect x="11" y="9" width="5" height="5"/><rect x="20" y="9" width="5" height="5"/><path d="M7.5 11.5h3M16.5 11.5h3" fill="none"/>',
  rows: '<rect x="3" y="4" width="5" height="5"/><rect x="12" y="4" width="5" height="5"/><rect x="3" y="14" width="5" height="5"/><rect x="12" y="14" width="5" height="5"/><path d="M8.5 6.5h3M8.5 16.5h3" fill="none"/>',
  snake: '<rect x="3" y="4" width="5" height="5"/><rect x="14" y="4" width="5" height="5"/><rect x="14" y="14" width="5" height="5"/><rect x="3" y="14" width="5" height="5"/><path d="M8.5 6.5h5M16.5 9.5v4M13.5 16.5h-5" fill="none"/>',
  down: '<rect x="11" y="1.5" width="5" height="5"/><rect x="11" y="9.5" width="5" height="5"/><rect x="11" y="17.5" width="5" height="5"/><path d="M13.5 6.5v3M13.5 14.5v3" fill="none"/>',
  cycle: '<rect x="11" y="1.5" width="5" height="5"/><rect x="19.5" y="9.5" width="5" height="5"/><rect x="11" y="17.5" width="5" height="5"/><rect x="2.5" y="9.5" width="5" height="5"/><circle cx="13.5" cy="12" r="7.5" fill="none" stroke-dasharray="2 2"/>',
};

let folded = false;

export class SmartPane {
  private el: HTMLDivElement;
  private shown: number | null = null;
  /** What the rows were drawn from, so they are drawn again only when the scheme changes. */
  private drawnFor = '';
  private dragFrom: number | null = null;

  constructor(private hooks: SmartPaneHooks) {
    this.el = document.createElement('div');
    this.el.className = 'smart-pane';
    this.el.hidden = true;
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Smart Scheme species');
    // keys typed here are the pane's, not the drawing's shortcuts
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(this.el);
  }

  /** The selection or the drawing changed: show the pane for the selected scheme, with its rows up to date. */
  refresh(): void {
    const id = this.hooks.selected();
    if (id === null) { this.hide(); return; }
    const doc = this.hooks.doc();
    const key = `${id} ${doc.version} ${folded}`;
    // a row being typed in is left alone until it is finished
    if (this.shown === id && this.el.contains(document.activeElement) && (document.activeElement as HTMLElement).tagName === 'INPUT') { this.place(); return; }
    if (this.shown !== id || key !== this.drawnFor) this.render(id);
    this.place();
  }

  hide(): void {
    if (this.shown === null) return;
    this.shown = null;
    this.drawnFor = '';
    this.el.hidden = true;
  }

  /** Keep it against the scheme's left edge (or its right, when there is no room on the left). */
  place(): void {
    if (this.shown === null) return;
    const s = this.hooks.doc().shapes.get(this.shown);
    if (!s) { this.hide(); return; }
    const r = this.hooks.screenRect({ x1: Math.min(s.x1, s.x2), y1: Math.min(s.y1, s.y2), x2: Math.max(s.x1, s.x2), y2: Math.max(s.y1, s.y2) });
    const area = this.hooks.area();
    const w = this.el.offsetWidth || 300, h = this.el.offsetHeight || 200;
    let x = r.x1 - w - 10;
    if (x < area.x1 + 4) x = Math.min(r.x2 + 10, area.x2 - w - 4);
    x = Math.max(area.x1 + 4, x);
    const y = Math.max(area.y1 + 4, Math.min(r.y1, area.y2 - h - 4));
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }

  private render(id: number): void {
    const doc = this.hooks.doc(), m = this.hooks.measure();
    const s = doc.shapes.get(id);
    const read = readSmart(doc, m, id);
    if (!s?.smart || !read) { this.hide(); return; }
    this.shown = id;
    this.drawnFor = `${id} ${doc.version} ${folded}`;
    this.el.hidden = false;
    this.el.classList.toggle('folded', folded);
    this.el.replaceChildren();
    const data = s.smart;
    const btn = (label: string, title: string, cls: string, f: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.innerHTML = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', (e) => { e.preventDefault(); f(); });
      return b;
    };
    if (folded) {
      this.el.append(btn('›', 'Show the species list', 'sp-unfold', () => { folded = false; this.render(id); this.place(); }));
      return;
    }
    const head = document.createElement('div');
    head.className = 'sp-head';
    const title = document.createElement('span');
    title.textContent = 'Smart Scheme';
    head.append(title, btn('‹', 'Fold the species list away', 'sp-fold', () => { folded = true; this.render(id); this.place(); }));
    this.el.append(head);

    // the layouts, as small pictures
    const lay = document.createElement('div');
    lay.className = 'sp-layouts';
    lay.setAttribute('role', 'radiogroup');
    lay.setAttribute('aria-label', 'Layout');
    for (const l of SMART_LAYOUTS) {
      const on = data.layout === l.id && !data.free;
      const b = btn(`<svg viewBox="0 0 27 24" width="27" height="24" aria-hidden="true"><g fill="currentColor" stroke="currentColor" stroke-width="1.2">${ICONS[l.id]}</g></svg><span>${l.name}</span>`, `${l.name}: ${l.tip}`, 'sp-layout', () => this.hooks.arrange(id, { layout: l.id }));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on));
      lay.append(b);
    }
    this.el.append(lay);
    if (data.free) {
      const p = document.createElement('p');
      p.className = 'sp-note';
      p.textContent = read.chain ? 'Laid out by hand. Pick a layout to lay it out again.' : 'This scheme branches or has two loops, so it keeps the layout it has. You can still retype its species and conditions.';
      this.el.append(p);
    }
    // the layout's own settings
    const opts = document.createElement('div');
    opts.className = 'sp-opts';
    if (data.layout === 'cycle' && !data.free) {
      const check = (label: string, on: boolean, f: (v: boolean) => void) => {
        const l = document.createElement('label');
        const i = document.createElement('input');
        i.type = 'checkbox';
        i.checked = on;
        i.addEventListener('change', () => f(i.checked));
        l.append(i, document.createTextNode(' ' + label));
        return l;
      };
      opts.append(check('Counterclockwise', !!data.anticlockwise, (v) => this.hooks.arrange(id, { anticlockwise: v })), check('Small arrows for reagents', !!data.reagentArrows, (v) => this.hooks.arrange(id, { reagentArrows: v })));
    } else if ((data.layout === 'rows' || data.layout === 'snake') && !data.free) {
      const l = document.createElement('label');
      const i = document.createElement('input');
      i.type = 'number';
      i.min = '1';
      i.max = '12';
      i.value = String(data.perRow ?? 3);
      i.addEventListener('change', () => { const n = Math.round(Number(i.value)); if (n >= 1 && n <= 12) this.hooks.arrange(id, { perRow: n }); });
      l.append(document.createTextNode('Steps in each row '), i);
      opts.append(l);
    }
    if (opts.childElementCount) this.el.append(opts);

    // the species and the steps between them
    const cycle = data.layout === 'cycle';
    const list = document.createElement('ol');
    list.className = 'sp-list';
    const field = (value: string, placeholder: string, label: string, done: (v: string) => void): HTMLInputElement => {
      const i = document.createElement('input');
      i.type = 'text';
      i.value = value;
      i.placeholder = placeholder;
      i.setAttribute('aria-label', label);
      i.spellcheck = false;
      let was = value;
      const commit = () => { if (i.value !== was) { was = i.value; done(i.value); } };
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); i.blur(); } else if (e.key === 'Escape') { i.value = was; i.blur(); } });
      i.addEventListener('blur', () => { commit(); setTimeout(() => this.refresh(), 0); });
      return i;
    };
    read.slots.forEach((slot, k) => {
      const li = document.createElement('li');
      li.className = 'sp-slot';
      li.draggable = read.chain;
      li.dataset.k = String(k);
      const grip = document.createElement('span');
      grip.className = 'sp-grip';
      grip.textContent = '⋮⋮';
      grip.title = 'Drag to put this species somewhere else in the scheme';
      const num = document.createElement('span');
      num.className = 'sp-num';
      num.textContent = String(k + 1);
      const name = slot.caption !== undefined
        ? field(runsMarkup(doc.captions.get(slot.caption)?.runs ?? []), 'Species', `Species ${k + 1}`, (v) => this.hooks.slotText(id, k, v))
        : Object.assign(document.createElement('span'), { className: 'sp-fixed', textContent: slotName(doc, slot), title: 'A drawn structure: edit it on the page' });
      li.append(grip, num, name);
      if (read.chain && read.slots.length > 2) li.append(btn('×', `Remove species ${k + 1} and the step after it`, 'sp-x', () => this.hooks.remove(id, k)));
      list.append(li);
      li.addEventListener('dragstart', (e) => { this.dragFrom = k; e.dataTransfer?.setData('text/plain', String(k)); li.classList.add('dragging'); });
      li.addEventListener('dragend', () => { this.dragFrom = null; li.classList.remove('dragging'); });
      li.addEventListener('dragover', (e) => { if (this.dragFrom !== null) { e.preventDefault(); li.classList.add('drop'); } });
      li.addEventListener('dragleave', () => li.classList.remove('drop'));
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drop');
        const from = this.dragFrom;
        this.dragFrom = null;
        if (from !== null && from !== k) this.hooks.move(id, from, k);
      });
      const l = read.links.find((x) => x.from === k);
      if (!l) return;
      const step = document.createElement('li');
      step.className = 'sp-step';
      const arrow = document.createElement('span');
      arrow.className = 'sp-arrow';
      arrow.textContent = cycle && k === read.slots.length - 1 ? '↺' : '↓';
      arrow.setAttribute('aria-hidden', 'true');
      const part = (p: StepPart, ph: string, label: string) => field(stepText(doc, l, p), ph, `${label}, step ${k + 1}`, (v) => this.hooks.stepText(id, k, p, v));
      const parts = cycle
        ? [part('inside', 'step name (OA)', 'Step name'), part('above', 'in', 'Comes in'), part('below', 'out', 'Goes out')]
        : [part('above', 'above the arrow', 'Above the arrow'), part('below', 'below the arrow', 'Below the arrow')];
      const box = document.createElement('div');
      box.className = 'sp-step-fields';
      box.append(...parts);
      step.append(arrow, box);
      list.append(step);
    });
    this.el.append(list);
    const foot = document.createElement('div');
    foot.className = 'sp-foot';
    if (read.chain) foot.append(btn('+ Add Species', 'Add a species at the end, with an arrow to it', 'sp-add', () => this.hooks.add(id, read.slots.length - 1)));
    foot.append(btn('Ungroup', 'Make it ordinary structures, text and arrows again', 'sp-ungroup', () => this.hooks.ungroup(id)));
    this.el.append(foot);
  }

  /** Put the caret in the row of a species just added. */
  focusCaption(frame: number, caption: number): void {
    this.refresh();
    if (this.shown !== frame) return;
    const read = readSmart(this.hooks.doc(), this.hooks.measure(), frame);
    const k = read?.slots.findIndex((s) => s.caption === caption) ?? -1;
    const input = this.el.querySelector<HTMLInputElement>(`li.sp-slot[data-k="${k}"] input`);
    input?.focus();
    input?.select();
  }
}
