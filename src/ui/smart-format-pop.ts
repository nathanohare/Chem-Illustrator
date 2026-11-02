// The gear on a Smart Scheme's species list opens this: the scheme's own font and text sizes, its
// arrows and its spacing. Each change shows on the page straight away (and can be undone); a box
// left empty follows the drawing style, whose value shows grayed in it.

import type { Arrow } from '../model';
import type { SmartFormat } from '../chem/smart-format';
import { FONT_GROUPS } from '../fonts';

export interface FormatPopOptions {
  /** What the scheme has set. */
  fmt: SmartFormat;
  /** The drawing style's values, shown in empty boxes. */
  defaults: Required<SmartFormat>;
  /** A cycle's arrows go round its loop, so it has no shortest arrow. */
  cycle: boolean;
  apply(fmt: SmartFormat | undefined): void;
}

const HEADS: { value: Arrow['headType']; label: string }[] = [
  { value: 'solid', label: 'Filled' },
  { value: 'hollow', label: 'Open' },
  { value: 'angle', label: 'Line' },
];

let open: { el: HTMLElement; close(): void } | null = null;

/** Close the format popout if it is open. */
export function closeSmartFormat(): void { open?.close(); }

/** Open (or, when open, close) the format popout under `anchor`. */
export function toggleSmartFormat(anchor: HTMLElement, o: FormatPopOptions): void {
  if (open) { const was = open.el.dataset.for === anchor.dataset.for; open.close(); if (was) return; }
  const pop = document.createElement('div');
  pop.className = 'smart-format-pop';
  pop.dataset.for = anchor.dataset.for ?? '';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Scheme format');
  let fmt: SmartFormat = { ...o.fmt };
  const d = o.defaults;

  const head = document.createElement('div');
  head.className = 'sfp-head';
  head.innerHTML = '<span>Scheme Format</span>';
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'sfp-x';
  x.textContent = '×';
  x.title = 'Close';
  x.addEventListener('click', () => close());
  head.append(x);
  pop.append(head);

  const section = (name: string) => {
    const h = document.createElement('div');
    h.className = 'sfp-sec';
    h.textContent = name;
    pop.append(h);
  };
  const row = (...cells: HTMLElement[]) => {
    const r = document.createElement('div');
    r.className = 'sfp-row';
    r.append(...cells);
    pop.append(r);
    return r;
  };
  const changed = () => o.apply(Object.keys(fmt).length ? { ...fmt } : undefined);

  /** A labelled number box in points: empty follows the drawing style. */
  const num = (key: Exclude<keyof SmartFormat, 'font' | 'headType'>, label: string, tip: string, disabled = false): HTMLLabelElement => {
    const lab = document.createElement('label');
    lab.className = 'sfp-field';
    lab.title = tip;
    const span = document.createElement('span');
    span.textContent = label;
    const box = document.createElement('input');
    box.type = 'number';
    box.min = '0';
    box.step = key === 'arrowWidth' ? '0.1' : '0.5';
    box.dataset.key = key;
    box.placeholder = String(d[key]);
    box.value = fmt[key] !== undefined ? String(fmt[key]) : '';
    box.disabled = disabled;
    box.setAttribute('aria-label', `${label} (points)`);
    box.addEventListener('change', () => {
      const v = Number(box.value);
      if (box.value.trim() === '' || !isFinite(v) || v < 0) { delete fmt[key]; box.value = ''; } else fmt[key] = Math.min(500, v);
      changed();
    });
    const unit = document.createElement('i');
    unit.textContent = 'pt';
    lab.append(span, box, unit);
    return lab;
  };

  section('Text');
  const font = document.createElement('select');
  font.className = 'sfp-font';
  font.setAttribute('aria-label', 'Font');
  font.append(new Option(`Drawing style (${d.font})`, ''));
  for (const g of FONT_GROUPS) {
    const og = document.createElement('optgroup');
    og.label = g.name;
    for (const f of g.fonts) if (f !== 'Symbol') { const op = new Option(f, f); op.style.fontFamily = `"${f}", sans-serif`; og.append(op); }
    font.append(og);
  }
  if (fmt.font && ![...font.options].some((op) => op.value === fmt.font)) font.append(new Option(fmt.font, fmt.font));
  font.value = fmt.font ?? '';
  font.addEventListener('change', () => { if (font.value) fmt.font = font.value; else delete fmt.font; changed(); });
  const fontLab = document.createElement('label');
  fontLab.className = 'sfp-field sfp-wide';
  const fl = document.createElement('span');
  fl.textContent = 'Font';
  fontLab.append(fl, font);
  row(fontLab);
  row(num('speciesSize', 'Species', 'Size of the species typed as text (structures follow the drawing style)'), num('textSize', 'Conditions', 'Size of the text above, below and beside the arrows'));

  section('Arrows');
  const headSel = document.createElement('select');
  headSel.setAttribute('aria-label', 'Arrowhead');
  headSel.append(new Option('As drawn', ''));
  for (const h of HEADS) headSel.append(new Option(h.label, h.value));
  headSel.value = fmt.headType ?? '';
  headSel.addEventListener('change', () => { if (headSel.value) fmt.headType = headSel.value as Arrow['headType']; else delete fmt.headType; changed(); });
  const headLab = document.createElement('label');
  headLab.className = 'sfp-field';
  headLab.title = 'The arrowheads: filled, open, or two lines';
  const hl = document.createElement('span');
  hl.textContent = 'Head';
  headLab.append(hl, headSel);
  row(num('arrowWidth', 'Line', 'Arrow line width'), headLab);
  row(num('headLength', 'Head length', 'Arrowhead length (its width keeps in step)'),
    num('arrowLength', 'Shortest', o.cycle ? 'A cycle\'s arrows go round its loop, so their length comes from the loop' : 'The shortest an arrow gets; arrows still grow to fit their text', o.cycle));

  section('Spacing');
  row(num('structGap', 'Arrow to species', 'Gap between an arrow\'s ends and the species'), num('textGap', 'Arrow to text', 'Gap between an arrow and the text above or below it'));

  const foot = document.createElement('div');
  foot.className = 'sfp-foot';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Use Drawing Style';
  reset.title = 'Clear everything here: the scheme follows the drawing style again';
  reset.addEventListener('click', () => {
    fmt = {};
    for (const b of pop.querySelectorAll<HTMLInputElement>('input[data-key]')) b.value = '';
    font.value = '';
    headSel.value = '';
    changed();
  });
  foot.append(reset);
  pop.append(foot);

  document.body.append(pop);
  const a = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, a.right - w));
  const top = a.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, a.top - h - 4) : a.bottom + 4;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  const outside = (e: PointerEvent) => { if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); } };
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
  pop.addEventListener('keydown', key);
  function close() {
    document.removeEventListener('pointerdown', outside, true);
    pop.remove();
    if (open?.el === pop) open = null;
  }
  open = { el: pop, close };
  font.focus();
}
