// The Smart Scheme pane: the species of the selected Smart Scheme in order, beside it on the page,
// like SmartArt's text pane. It works both ways: typing in a row changes the drawing, and a change
// on the drawing shows in the rows. Rows drag to put the species in another order; × takes one
// out and + Add Species puts one on the end. The pictures along the top lay the scheme out again
// (in a line, in rows, as a snake, down the page or round a cycle). ‹ folds it to a tab.

import type { Doc } from '../model';
import type { Rect } from '../geom';
import type { Measure } from '../editor/arrange';
import { readSmart, slotName, SMART_LAYOUTS, type SmartData, type SmartLayout, type SmartLink, type StepPart, type TextPart } from '../chem/smart-scheme';
import type { TextRun } from '../model';
import { RichField } from './rich-field';
import { dropTarget, type BoxPlace } from './toolboxes';
import { PIN_ICON, PINNED_ICON } from './float-box';

export interface SmartPaneHooks {
  doc(): Doc;
  measure(): Measure;
  /** The Smart Scheme selected (its frame), or null. */
  selected(): number | null;
  /** Where a box on the page is on the screen (CSS pixels, the window's coordinates). */
  screenRect(r: Rect): Rect;
  /** Where the drawing shows on the screen (the pane keeps inside it). */
  area(): Rect;
  slotRuns(id: number, k: number, parts: TextPart[]): void;
  stepRuns(id: number, k: number, part: StepPart, parts: TextPart[]): void;
  /** Make species k a dashed box to draw or paste its structure in. */
  toStructure(id: number, k: number): void;
  /** Make species k's dashed box a text label again. */
  toText(id: number, k: number): void;
  /** Select a dashed species box on the page (a paste then goes into it). */
  selectHolder(shape: number): void;
  /** Make the list a toolbox at this place (a dock, or floating where it was dropped); null: float it beside the scheme again. */
  dock(where: Partial<BoxPlace> | null): void;
  /** The drawing area (its edges dock toolboxes), on the screen. */
  work(): DOMRect;
  add(id: number, after: number): void;
  remove(id: number, k: number): void;
  move(id: number, from: number, to: number): void;
  arrange(id: number, patch: Partial<SmartData>): void;
  /** Add a second loop to a cycle (the Catalytic Cycle window, filled with this one). */
  secondLoop(id: number): void;
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

/** Chemical interpretation of what is typed in the rows (remembered between uses). */
let chemOn = (() => { try { return localStorage.getItem('smartPaneChem') !== 'off'; } catch { return true; } })();

/** The symbols the Ω button offers, with their names. */
const SYMBOLS: [string, string][] = [
  ['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'epsilon'], ['η', 'eta'], ['θ', 'theta'], ['κ', 'kappa'],
  ['λ', 'lambda'], ['μ', 'mu'], ['ν', 'nu'], ['π', 'pi'], ['σ', 'sigma'], ['τ', 'tau'], ['φ', 'phi'], ['χ', 'chi'],
  ['ψ', 'psi'], ['ω', 'omega'], ['Δ', 'Delta (heat)'], ['Σ', 'Sigma'], ['Ω', 'Omega'], ['→', 'arrow'], ['⇌', 'equilibrium'], ['↑', 'gas given off'],
  ['↓', 'precipitate'], ['⊕', 'circled plus'], ['⊖', 'circled minus'], ['+', 'plus'], ['−', 'minus'], ['±', 'plus or minus'], ['·', 'middle dot'], ['×', 'times'],
  ['≡', 'triple bond'], ['≈', 'about'], ['″', 'double prime'], ['‰', 'per mille'], ['℃', 'degrees Celsius'], ['Å', 'ångström'], ['ħ', 'h-bar'], ['ν̃', 'wavenumber'],
];

/** Caption runs as the pieces a row shows. */
const runParts = (runs: TextRun[]): TextPart[] => runs.map((r) => ({ text: r.text, ...(r.sub ? { sub: true } : r.sup ? { sup: true } : {}) }));

/** The first text box of a step's conditions above or below its arrow (or its name inside a cycle), as pieces. */
function stepParts(doc: Doc, l: SmartLink, part: StepPart): TextPart[] {
  const it = l[part].find((x) => x.caption !== undefined);
  const c = it ? doc.captions.get(it.caption!) : undefined;
  return c ? runParts(c.runs) : [];
}

const HEXAGON = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 L13.6 4.75 L13.6 11.25 L8 14.5 L2.4 11.25 L2.4 4.75 Z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

export class SmartPane {
  private el: HTMLDivElement;
  private shown: number | null = null;
  /** What the rows were drawn from, so they are drawn again only when the scheme changes. */
  private drawnFor = '';
  private dragFrom: number | null = null;
  /** The row last typed in (the formatting bar works on it), by its key. */
  private active: RichField | null = null;
  private activeKey = '';
  private fields = new Map<string, RichField>();
  private bar: HTMLDivElement | null = null;
  private symbols = false;
  /** Docked: the toolbox body it shows in (it is then there whether or not a scheme is selected). */
  private host: HTMLElement | null = null;

  get isDocked(): boolean { return this.host !== null; }

  /** Show the list in a toolbox's body instead of beside the scheme. */
  dockInto(body: HTMLElement): void {
    this.host = body;
    body.append(this.el);
    this.el.classList.add('docked');
    this.el.style.left = this.el.style.top = '';
    this.shown = null;
    this.drawnFor = '';
    this.refresh();
  }

  /** Back to floating beside the selected scheme. */
  float(): void {
    this.host = null;
    this.el.classList.remove('docked');
    document.body.append(this.el);
    this.shown = null;
    this.drawnFor = '';
    this.el.hidden = true;
    this.refresh();
  }

  /** Docked with no scheme selected: what the list is for. */
  private showEmpty(): void {
    if (this.drawnFor === 'empty') return;
    this.shown = null;
    this.drawnFor = 'empty';
    this.el.hidden = false;
    const p = document.createElement('p');
    p.className = 'sp-note sp-empty';
    p.textContent = 'Select a Smart Scheme to list its species and steps here.';
    this.el.replaceChildren(p);
  }

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
    // its toolbox was put away: back beside the scheme
    if (this.host && !this.host.isConnected) { this.float(); return; }
    const id = this.hooks.selected();
    if (id === null) { this.hide(); return; }
    const doc = this.hooks.doc();
    const key = `${id} ${doc.version} ${folded}`;
    // a row being typed in is left alone until it is finished
    const typing = document.activeElement as HTMLElement | null;
    if (this.shown === id && typing && this.el.contains(typing) && (typing.tagName === 'INPUT' || typing.isContentEditable)) { this.place(); return; }
    if (this.shown !== id || key !== this.drawnFor) this.render(id);
    this.place();
  }

  hide(): void {
    if (this.host) { this.showEmpty(); return; }
    if (this.shown === null) return;
    this.shown = null;
    this.drawnFor = '';
    this.el.hidden = true;
  }

  /** Keep it against the scheme's left edge (or its right, when there is no room on the left). */
  place(): void {
    if (this.shown === null || this.host) return;
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
    this.el.classList.toggle('folded', folded && !this.host);
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
    if (folded && !this.host) {
      this.el.append(btn('›', 'Show the species list', 'sp-unfold', () => { folded = false; this.render(id); this.place(); }));
      return;
    }
    // one compact row: the title (drag it to an edge of the drawing to dock the list), the layouts as small pictures, dock and fold
    const head = document.createElement('div');
    head.className = 'sp-head';
    if (!this.host) {
      const title = document.createElement('span');
      title.className = 'sp-title';
      title.textContent = 'Smart Scheme';
      head.append(title);
      head.title = 'Drag to an edge of the drawing to dock this list there, like a toolbox';
      this.wireDrag(head);
    }
    const lay = document.createElement('div');
    lay.className = 'sp-layouts';
    lay.setAttribute('role', 'radiogroup');
    lay.setAttribute('aria-label', 'Layout');
    for (const l of SMART_LAYOUTS) {
      const on = data.layout === l.id && !data.free;
      const b = btn(`<svg viewBox="0 0 27 24" width="20" height="18" aria-hidden="true"><g fill="currentColor" stroke="currentColor" stroke-width="1.2">${ICONS[l.id]}</g></svg>`, `${l.name}: ${l.tip}`, 'sp-layout', () => this.hooks.arrange(id, { layout: l.id }));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on));
      lay.append(b);
    }
    head.append(lay);
    const pin = btn(this.host ? PINNED_ICON : PIN_ICON, this.host ? 'Undock: float the list beside the scheme again' : 'Dock the list as a toolbox at the right (or drag its title to any edge)', 'sp-pin', () => this.hooks.dock(this.host ? null : { dock: 'right' }));
    pin.setAttribute('aria-pressed', String(!!this.host));
    head.append(pin);
    if (!this.host) head.append(btn('‹', 'Fold the species list away', 'sp-fold', () => { folded = true; this.render(id); this.place(); }));
    this.el.append(head);
    this.el.append(this.formatBar(btn));
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
      if (read.chain && read.closed) {
        const two = btn('+ Second loop…', 'Add a second loop: two cycles turning together where two steps meet, sharing a species, or side by side', 'sp-loop2', () => this.hooks.secondLoop(id));
        opts.append(two);
      }
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
    this.fields.clear();
    const field = (key: string, value: TextPart[], placeholder: string, label: string, done: (v: TextPart[]) => void): HTMLDivElement => {
      const f = new RichField(value, { placeholder, label, chem: () => chemOn, done, onState: (x) => { if (x === this.active) this.showState(); } });
      this.fields.set(key, f);
      f.el.dataset.key = key;
      f.el.addEventListener('focus', () => { this.active = f; this.activeKey = key; this.showState(); });
      f.el.addEventListener('blur', () => setTimeout(() => { if (!this.el.contains(document.activeElement)) this.showState(); this.refresh(); }, 0));
      if (key === this.activeKey && this.active) this.active = f;
      return f.el;
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
      let name: HTMLElement;
      if (slot.caption !== undefined) name = field(`s${k}`, runParts(doc.captions.get(slot.caption)?.runs ?? []), 'Species', `Species ${k + 1}`, (v) => this.hooks.slotRuns(id, k, v));
      else if (slot.holder !== undefined) {
        const h = slot.holder;
        name = btn(slotName(doc, slot), 'Select the box on the page: draw the structure in it, or paste one (Ctrl+V)', 'sp-holder', () => this.hooks.selectHolder(h));
      } else name = Object.assign(document.createElement('span'), { className: 'sp-fixed', textContent: slotName(doc, slot), title: 'A drawn structure: edit it on the page' });
      li.append(grip, num, name);
      if (slot.caption !== undefined) li.append(btn(HEXAGON, 'Make this species a structure (a box to draw or paste in)', 'sp-struct', () => this.hooks.toStructure(id, k)));
      else if (slot.holder !== undefined) {
        const b = btn(HEXAGON, 'Back to a text label', 'sp-struct', () => this.hooks.toText(id, k));
        b.setAttribute('aria-pressed', 'true');
        li.append(b);
      }
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
      // A "T" text mark: this row holds the words written on the arrow.
      arrow.innerHTML = '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M2.5 2.75h9M7 2.75v8.5"/></svg>';
      arrow.title = `Text on the arrow for step ${k + 1}`;
      arrow.setAttribute('aria-hidden', 'true');
      const part = (p: StepPart, ph: string, label: string) => field(`p${k}${p}`, stepParts(doc, l, p), ph, `${label}, step ${k + 1}`, (v) => this.hooks.stepRuns(id, k, p, v));
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

  /** Dragging the title moves the list; let go at an edge of the drawing and it docks there, elsewhere it stays as a floating toolbox. */
  private wireDrag(head: HTMLElement): void {
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button') || e.button !== 0) return;
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      let moved = false;
      head.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent) => {
        if (!moved && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 4) return;
        moved = true;
        this.el.style.left = `${Math.round(m.clientX - dx)}px`;
        this.el.style.top = `${Math.round(m.clientY - dy)}px`;
      };
      const up = (u: PointerEvent) => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
        if (!moved) return;
        const w = this.hooks.work();
        const dock = dropTarget(u.clientX, u.clientY, { left: w.left, top: w.top, right: w.right, bottom: w.bottom });
        this.hooks.dock(dock === 'float' ? { dock, x: Math.round(u.clientX - dx), y: Math.round(u.clientY - dy) } : { dock });
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
  }

  /** Put the caret in the row of a species just added (all its text selected, to type over). */
  focusCaption(frame: number, caption: number): void {
    this.refresh();
    if (this.shown !== frame) return;
    const read = readSmart(this.hooks.doc(), this.hooks.measure(), frame);
    const k = read?.slots.findIndex((s) => s.caption === caption) ?? -1;
    this.fields.get(`s${k}`)?.focusAll();
  }

  /**
   * The formatting bar: subscript, superscript, chemical interpretation and symbols, for the row
   * being typed in. Its buttons keep the caret in the row.
   */
  private formatBar(btn: (label: string, title: string, cls: string, f: () => void) => HTMLButtonElement): HTMLElement {
    const wrap = document.createElement('div');
    const bar = document.createElement('div');
    bar.className = 'sp-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Text formatting');
    const on = (f: (r: RichField) => void) => () => { const r = this.active; if (r && document.activeElement === r.el) f(r); };
    const sub = btn('X<sub>2</sub>', 'Subscript (Ctrl+=)', 'sp-fmt sp-sub', on((r) => r.toggle('sub')));
    const sup = btn('X<sup>2</sup>', 'Superscript (Ctrl+Shift+=)', 'sp-fmt sp-sup', on((r) => r.toggle('sup')));
    const chem = btn('Chem', 'Chemical interpretation: numbers in formulas become subscripts as you type (off: the text stays as typed)', 'sp-fmt sp-chem', () => {
      chemOn = !chemOn;
      try { localStorage.setItem('smartPaneChem', chemOn ? 'on' : 'off'); } catch { /* not kept */ }
      const r = this.active;
      if (r && document.activeElement === r.el) r.rechem();
      this.showState();
    });
    const gap = document.createElement('span');
    gap.className = 'sp-bar-gap';
    const sym = (c: string, name: string) => btn(c, `Insert ${name}`, 'sp-fmt sp-sym', on((r) => r.insert(c)));
    const more = btn('Ω ▾', 'Symbol… (Greek letters, arrows, charges and more)', 'sp-fmt sp-more', () => { this.symbols = !this.symbols; this.showState(); });
    bar.append(sub, sup, chem, gap, sym('‡', '‡ (transition state)'), sym('′', 'prime'), sym('°', 'degree sign'), sym('•', 'dot (radical)'), more);
    const grid = document.createElement('div');
    grid.className = 'sp-symbols';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Symbols');
    for (const [c, name] of SYMBOLS) grid.append(sym(c, name));
    // pressing a button doesn't take the caret out of the row
    wrap.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    wrap.append(bar, grid);
    this.bar = wrap;
    this.showState();
    return wrap;
  }

  /** The bar shows what is on where the caret is, and is usable only while a row is being typed in. */
  private showState(): void {
    const w = this.bar;
    if (!w) return;
    const r = this.active && document.activeElement === this.active.el ? this.active : null;
    for (const b of w.querySelectorAll<HTMLButtonElement>('.sp-sub, .sp-sup, .sp-sym')) b.disabled = !r;
    const press = (cls: string, v: boolean) => w.querySelector(cls)?.setAttribute('aria-pressed', String(v));
    press('.sp-sub', !!r?.state('sub'));
    press('.sp-sup', !!r?.state('sup'));
    press('.sp-chem', chemOn);
    press('.sp-more', this.symbols);
    w.querySelector<HTMLElement>('.sp-symbols')!.hidden = !this.symbols;
  }
}
