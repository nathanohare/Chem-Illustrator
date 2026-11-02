// The Font group's corner box (Presentation, Design and Document): Change Case, character spacing
// and kerning, and the text effects PowerPoint and Word have in their Font and Format Text Effects
// boxes: the letters' fill (solid, see-through or none), an outline round them, and a shadow.

import type * as rt from '../richtext';
import { FloatBox } from './float-box';
import { OUTLINE_W } from '../text/fx';

export interface FontBoxHooks {
  /** How the text picked (or at the caret) looks now; null when there is no text. */
  look(): rt.RunStyle | null;
  /** Change the text picked. Unset values (undefined) take the effect off. */
  apply(patch: Partial<rt.RunStyle>): void;
  changeCase(mode: rt.CaseMode): void;
  /** Documents: All Caps, shown without changing the text itself. */
  allCaps?(): void;
}

/** Change Case's choices, as Word words them. */
const CASES: [rt.CaseMode, string, string][] = [
  ['sentence', 'Sentence case.', 'A capital at the start of each sentence'],
  ['lower', 'lowercase', 'Every letter small'],
  ['upper', 'UPPERCASE', 'Every letter a capital'],
  ['title', 'Capitalize Each Word', 'A capital at the start of each word'],
  ['toggle', 'tOGGLE cASE', 'Capitals made small and small letters made capitals'],
];

export class FontBox {
  private box: FloatBox;
  private spacing!: HTMLInputElement;
  private kern!: HTMLInputElement;
  private fill!: HTMLSelectElement;
  private fillColour!: HTMLInputElement;
  private see!: HTMLInputElement;
  private line!: HTMLSelectElement;
  private lineColour!: HTMLInputElement;
  private lineW!: HTMLInputElement;
  private shadow!: HTMLInputElement;
  private caps?: HTMLInputElement;

  constructor(private hooks: FontBoxHooks) {
    this.box = new FloatBox('Font', () => {});
    this.box.el.classList.add('fb-font');
    this.box.el.querySelector<HTMLElement>('.fb-pin')!.hidden = true;
    this.build(this.box.body);
  }

  get open(): boolean {
    return this.box.open;
  }

  /** Open it under its corner button, or close it when it is open. */
  toggle(near: HTMLElement | null): void {
    if (this.box.open) { this.box.close(); return; }
    this.refresh();
    this.box.show(near);
  }

  close(): void {
    this.box.close();
  }

  /** Show how the text picked looks now. */
  refresh(): void {
    const s = this.hooks.look() ?? {};
    const active = document.activeElement;
    const set = (el: HTMLInputElement | HTMLSelectElement, v: string) => { if (el !== active) el.value = v; };
    set(this.spacing, String(s.spacing ?? 0));
    this.kern.checked = !s.noKern;
    set(this.fill, s.noFill ? 'none' : 'solid');
    set(this.fillColour, s.color ?? '#000000');
    set(this.see, String(Math.round((s.transparency ?? 0) * 100)));
    set(this.line, s.outline ? 'solid' : 'none');
    set(this.lineColour, s.outline ?? '#000000');
    set(this.lineW, String(s.outlineW ?? OUTLINE_W));
    this.shadow.checked = !!s.shadow;
    if (this.caps) this.caps.checked = !!s.allCaps;
    const noFill = this.fill.value === 'none', noLine = this.line.value === 'none';
    this.fillColour.disabled = this.see.disabled = noFill;
    this.lineColour.disabled = this.lineW.disabled = noLine;
  }

  private build(body: HTMLElement): void {
    const apply = (patch: Partial<rt.RunStyle>) => { this.hooks.apply(patch); this.refresh(); };
    const section = (title: string) => {
      const h = document.createElement('div');
      h.className = 'fb-section';
      h.textContent = title;
      body.append(h);
    };
    const row = (label: string, el: HTMLElement, tip?: string) => {
      const l = document.createElement('label');
      l.className = 'fb-row';
      const span = document.createElement('span');
      span.textContent = label;
      l.append(span, el);
      if (tip) l.title = tip;
      body.append(l);
    };
    const check = (label: string, tip: string, on: (v: boolean) => void) => {
      const l = document.createElement('label');
      l.className = 'fb-check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.addEventListener('change', () => on(box.checked));
      l.append(box, document.createTextNode(label));
      l.title = tip;
      body.append(l);
      return box;
    };
    const num = (step: number, min: number, max: number, on: (v: number) => void) => {
      const el = document.createElement('input');
      el.type = 'number';
      el.step = String(step);
      el.min = String(min);
      el.max = String(max);
      el.addEventListener('change', () => { const v = parseFloat(el.value); if (Number.isFinite(v)) on(Math.min(max, Math.max(min, v))); });
      el.addEventListener('keydown', (e) => e.stopPropagation());
      return el;
    };
    const colour = (on: (v: string) => void) => {
      const el = document.createElement('input');
      el.type = 'color';
      el.addEventListener('change', () => on(el.value));
      return el;
    };
    const select = (opts: [string, string][], on: (v: string) => void) => {
      const el = document.createElement('select');
      for (const [v, t] of opts) el.add(new Option(t, v));
      el.addEventListener('change', () => on(el.value));
      return el;
    };

    section('Change Case');
    const list = document.createElement('div');
    list.className = 'fb-case';
    for (const [mode, label, tip] of CASES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = tip;
      // keep the text picked while clicking
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => this.hooks.changeCase(mode));
      list.append(b);
    }
    body.append(list);
    if (this.hooks.allCaps) {
      const allCaps = this.hooks.allCaps.bind(this.hooks);
      this.caps = check('All caps', 'Shown as capitals; the text itself stays as typed', () => { allCaps(); this.refresh(); });
    }

    section('Character Spacing');
    this.spacing = num(0.5, -20, 100, (v) => apply({ spacing: v || undefined }));
    row('Spacing (pt)', this.spacing, 'More than 0 spreads the letters out; less than 0 draws them closer');
    this.kern = check('Kerning', 'Pairs such as AV and To drawn closer, as the font asks', (v) => apply({ noKern: v ? undefined : true }));

    section('Text Fill');
    this.fill = select([['solid', 'Solid fill'], ['none', 'No fill']], (v) => apply({ noFill: v === 'none' || undefined }));
    row('Fill', this.fill);
    this.fillColour = colour((v) => apply({ color: v.toLowerCase() === '#000000' ? undefined : v }));
    row('Color', this.fillColour);
    this.see = num(5, 0, 100, (v) => apply({ transparency: v ? v / 100 : undefined }));
    row('Transparency (%)', this.see, 'How much shows through the letters: 0 is solid');

    section('Text Outline');
    this.line = select([['none', 'No line'], ['solid', 'Solid line']], (v) => apply(v === 'none' ? { outline: undefined, outlineW: undefined } : { outline: this.lineColour.value || '#000000' }));
    row('Line', this.line);
    this.lineColour = colour((v) => apply({ outline: v }));
    row('Color', this.lineColour);
    this.lineW = num(0.25, 0.25, 10, (v) => apply({ outlineW: Math.abs(v - OUTLINE_W) < 1e-6 ? undefined : v }));
    row('Width (pt)', this.lineW);

    section('Effects');
    this.shadow = check('Shadow', 'A soft shadow down and to the right of the letters', (v) => apply({ shadow: v || undefined }));
  }
}
