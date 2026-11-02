// The text formatting bar: the buttons and boxes that show above text while it is typed (the
// caption editor's bar), and the same bar in the Text Formatting toolbox (View > Toolboxes). Both
// are built here, so they stay exactly alike: bold, italic, underline; sub- and superscript, a
// formula in one click, stereodescriptors in italics in one click; font, size and color; lining
// up; bullets, numbering and indents; line and paragraph spacing and the text box width; links;
// and the Greek letters and symbols chemists type.

import type { Justify } from '../model';
import * as rt from '../richtext';
import type { TextFormat } from '../text/format';

/** Sizes offered in the size box. */
export const TEXT_SIZES = [5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
/** Line spacings offered in the spacing panel. */
export const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];

/** Greek letters and signs chemists put in text, a row each; all of them can be saved for ChemDraw. */
export const TEXT_SYMBOL_ROWS: string[][] = [
  'αβγδεζηθικλμνξπρστυφχψω',
  'ΓΔΘΛΞΠΣΦΨΩ',
  '°±×÷·•→←↑↓↔⇒≤≥≠≈≡∞′″…–—‡†‰Å',
].map((row) => [...row].filter(rt.savableChar));

/** What a symbol is called on its button's tip. */
const SYMBOL_NAMES: Record<string, string> = {
  '‡': 'Double dagger (transition state, ΔG‡)', '°': 'Degree', '±': 'Plus or minus (racemic)', '×': 'Times', '÷': 'Divided by', '·': 'Middle dot (solvates, ·HCl)',
  '•': 'Bullet (radical)', '→': 'Arrow', '←': 'Arrow back', '↔': 'Resonance arrow', '⇒': 'Retrosynthesis arrow', '↑': 'Gas evolved', '↓': 'Precipitate', 'Δ': 'Delta (heat)',
  'ν': 'Nu (frequency)', 'λ': 'Lambda (wavelength)', 'μ': 'Mu (micro)', 'Å': 'Ångström', '≈': 'About', '≤': 'At most', '≥': 'At least', '≠': 'Not equal', '≡': 'Triple bond',
  '∞': 'Infinity', '′': 'Prime', '″': 'Double prime', '…': 'Ellipsis', '–': 'En dash (ranges)', '—': 'Em dash', '†': 'Dagger', '‰': 'Per mille',
};

/** How the text the bar works on looks now. */
export interface TextBarState {
  style: rt.RunStyle;
  align: Justify;
  list?: 'bullet' | 'number';
  /** Line spacing (1 = single). */
  line: number;
  /** Space before and after the paragraph, in points. */
  before: number;
  after: number;
  /** Width the lines wrap to (none: they break only at Enter). */
  wrap?: number;
  /** The caret is in a link. */
  link: boolean;
  /** The font of text without its own. */
  defaultFont?: string;
}

export interface TextBarOps {
  /** Make the change; false when there is no text to change. */
  format(f: TextFormat): boolean;
  /** Type a character where the caret is; false when it can't go anywhere. */
  type(ch: string): boolean;
  /** Add, change or take off a link. */
  link(): void;
  /** How the text looks now (null: no text to work on). */
  state(): TextBarState | null;
  /** After a click or a box is set: the keyboard back to the text. */
  back(): void;
  /** A panel opened or closed (so a floating bar can be placed again). */
  resized?(): void;
  /** Nothing to change (no text being typed or picked). */
  nothing?(): void;
}

export interface TextBar {
  /** Show which buttons are on and the text's font, size and spacing. */
  refresh(): void;
  /** Close the symbols and spacing panels. */
  closePanels(): void;
}

const svg = (body: string) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${body}</svg>`;

const lineIcon = (j: string) => {
  const rows = [14, 9, 14, 9].map((w0, i) => {
    const w = j === 'justify' ? 14 : w0;
    const left = j === 'left' || j === 'justify' ? 0 : j === 'center' ? (14 - w) / 2 : 14 - w;
    return `<rect x="${left + 1}" y="${2 + i * 3.5}" width="${w}" height="1.6"/>`;
  });
  return svg(rows.join(''));
};
const listIcon = (marks: string[]) => svg(marks.map((m, i) => `${m.replace(/Y/g, String(3 + i * 5))}<rect x="6" y="${2 + i * 5}" width="9" height="1.6"/>`).join(''));

/** Fill `bar` with the text formatting bar. Its groups, then the two panels, go straight into it. */
export function buildTextBar(bar: HTMLElement, ops: TextBarOps): TextBar {
  const d = bar.ownerDocument;
  const buttons = new Map<string, HTMLButtonElement>();
  const inputs = {} as Record<'font' | 'size' | 'color' | 'line' | 'before' | 'after' | 'wrap', HTMLInputElement>;
  const symbols = d.createElement('div');
  symbols.className = 'caption-symbols';
  symbols.hidden = true;
  const spacing = d.createElement('div');
  spacing.className = 'caption-spacing';
  spacing.hidden = true;

  const run = (f: TextFormat) => { if (!ops.format(f)) ops.nothing?.(); };
  const after = () => { refresh(); ops.back(); };
  const group = () => { const g = d.createElement('span'); g.className = 'cb-group'; bar.appendChild(g); return g; };
  const button = (g: HTMLElement, id: string, html: string, title: string, on: () => void) => {
    const b = d.createElement('button');
    b.type = 'button';
    b.className = 'cb-btn';
    b.innerHTML = html;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-pressed', 'false');
    // keep the caret in the text while clicking
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { on(); after(); });
    g.appendChild(b);
    buttons.set(id, b);
    return b;
  };
  const number = (g: HTMLElement, id: keyof typeof inputs, title: string, opts: { min: number; max: number; step: number; list?: number[]; cls: string; blank?: string }, apply: (v: number | null) => void) => {
    const input = d.createElement('input');
    input.type = 'number';
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    input.className = opts.cls;
    input.title = title;
    input.setAttribute('aria-label', title);
    if (opts.blank) input.placeholder = opts.blank;
    if (opts.list) {
      const list = d.createElement('datalist');
      list.id = `cb-${id}-${Math.random().toString(36).slice(2)}`;
      for (const v of opts.list) { const o = d.createElement('option'); o.value = String(v); list.appendChild(o); }
      input.setAttribute('list', list.id);
      g.appendChild(list);
    }
    const go = () => {
      const v = input.value.trim() === '' ? null : Number(input.value);
      if (v === null || (Number.isFinite(v) && v >= opts.min)) apply(v === null ? null : Math.min(opts.max, v));
    };
    input.addEventListener('change', go);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); go(); after(); }
      if (e.key === 'Escape') { e.preventDefault(); after(); }
    });
    g.appendChild(input);
    inputs[id] = input;
    return input;
  };
  const panel = (open: HTMLDivElement, shut: HTMLDivElement) => () => { open.hidden = !open.hidden; shut.hidden = true; ops.resized?.(); };

  let g = group();
  button(g, 'bold', '<b>B</b>', 'Bold (Ctrl+B)', () => run({ kind: 'toggle', key: 'bold' }));
  button(g, 'italic', '<i>I</i>', 'Italic (Ctrl+I)', () => run({ kind: 'toggle', key: 'italic' }));
  button(g, 'underline', '<u>U</u>', 'Underline (Ctrl+U)', () => run({ kind: 'toggle', key: 'underline' }));
  g = group();
  button(g, 'sub', 'x<sub>2</sub>', 'Subscript (Ctrl+=)', () => run({ kind: 'toggle', key: 'sub' }));
  button(g, 'sup', 'x<sup>2</sup>', 'Superscript (Ctrl+Shift+=)', () => run({ kind: 'toggle', key: 'sup' }));
  button(g, 'formula', 'CH<sub>3</sub>', 'Formula: numbers after letters go down, charges go up (CH2Cl2 → CH₂Cl₂)', () => run({ kind: 'toggle', key: 'formula' }));
  button(g, 'stereo', '(<i>R</i>)', 'Stereodescriptors in italics: (2R,3S)-, (E)-, cis-, tert-, n-Bu, p- (again: back to upright)', () => run({ kind: 'stereo' }));

  g = group();
  const font = d.createElement('input');
  font.type = 'text';
  font.className = 'cb-font font-box';
  font.title = 'Font: free fonts that come with the app, or any font on this computer';
  font.setAttribute('aria-label', 'Font');
  font.setAttribute('list', 'ci-fonts');
  font.spellcheck = false;
  const setFont = () => { const v = font.value.trim(); run({ kind: 'style', patch: { font: v && v !== ops.state()?.defaultFont ? v : undefined } }); };
  font.addEventListener('change', setFont);
  font.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); setFont(); after(); }
    if (e.key === 'Escape') { e.preventDefault(); after(); }
  });
  g.appendChild(font);
  inputs.font = font;
  number(g, 'size', 'Text size (points)', { min: 1, max: 400, step: 0.5, list: TEXT_SIZES, cls: 'cb-size' }, (v) => { if (v) run({ kind: 'style', patch: { size: v } }); });
  const color = d.createElement('input');
  color.type = 'color';
  color.className = 'cb-color';
  color.title = 'Text color';
  color.setAttribute('aria-label', 'Text color');
  color.addEventListener('change', () => { run({ kind: 'style', patch: { color: color.value.toLowerCase() === '#000000' ? undefined : color.value } }); after(); });
  g.appendChild(color);
  inputs.color = color;

  g = group();
  button(g, 'left', lineIcon('left'), 'Line up on the left', () => run({ kind: 'align', j: 'left' }));
  button(g, 'center', lineIcon('center'), 'Center the lines', () => run({ kind: 'align', j: 'center' }));
  button(g, 'right', lineIcon('right'), 'Line up on the right', () => run({ kind: 'align', j: 'right' }));
  button(g, 'justify', lineIcon('justify'), 'Stretch lines to both edges of the text box', () => run({ kind: 'align', j: 'justify' }));

  g = group();
  button(g, 'bullet', listIcon(['<circle cx="2.5" cy="Y" r="1.4"/>', '<circle cx="2.5" cy="Y" r="1.4"/>', '<circle cx="2.5" cy="Y" r="1.4"/>']),
    'Bullets', () => run({ kind: 'list', list: 'bullet' }));
  button(g, 'number', svg('<text x="0" y="5" font-size="5.5" font-family="Arial">1</text><text x="0" y="10" font-size="5.5" font-family="Arial">2</text><text x="0" y="15" font-size="5.5" font-family="Arial">3</text><rect x="6" y="2" width="9" height="1.6"/><rect x="6" y="7" width="9" height="1.6"/><rect x="6" y="12" width="9" height="1.6"/>'),
    'Numbering', () => run({ kind: 'list', list: 'number' }));
  button(g, 'outdent', svg('<rect x="1" y="2" width="14" height="1.6"/><rect x="7" y="6" width="8" height="1.6"/><rect x="7" y="10" width="8" height="1.6"/><rect x="1" y="14" width="14" height="1.6"/><path d="M5 6.5v4.5L1.5 8.75z"/>'),
    'Less indent (Shift+Tab)', () => run({ kind: 'indent', by: -1 }));
  button(g, 'indent', svg('<rect x="1" y="2" width="14" height="1.6"/><rect x="7" y="6" width="8" height="1.6"/><rect x="7" y="10" width="8" height="1.6"/><rect x="1" y="14" width="14" height="1.6"/><path d="M1.5 6.5v4.5L5 8.75z"/>'),
    'More indent (Tab)', () => run({ kind: 'indent', by: 1 }));
  button(g, 'spacing', svg('<rect x="7" y="2" width="8" height="1.6"/><rect x="7" y="7.2" width="8" height="1.6"/><rect x="7" y="12.4" width="8" height="1.6"/><path d="M3 1l2.5 3h-5zM3 15l2.5-3h-5z"/><rect x="2.4" y="3.5" width="1.2" height="9"/>'),
    'Line and paragraph spacing, text box width', panel(spacing, symbols));

  g = group();
  button(g, 'link', svg('<path d="M6.6 9.4a.8.8 0 0 1 0-1.1l1.7-1.7a.8.8 0 1 1 1.1 1.1L7.7 9.4a.8.8 0 0 1-1.1 0z"/><path d="M8.9 3.2a3 3 0 0 1 4.2 4.2l-1.6 1.6a.8.8 0 1 1-1.1-1.1L12 6.3a1.4 1.4 0 0 0-2-2L8.4 5.9a.8.8 0 1 1-1.1-1.1zM4 9.7l1.6-1.6a.8.8 0 1 1 1.1 1.1L5.1 10.8a1.4 1.4 0 0 0 2 2l1.6-1.6a.8.8 0 1 1 1.1 1.1l-1.6 1.6a3 3 0 0 1-4.2-4.2z"/>'),
    'Link to a web page, DOI, file or slide (Ctrl+K)', () => ops.link());
  button(g, 'symbols', 'αΩ', 'Greek letters and symbols', panel(symbols, spacing));
  for (const row of TEXT_SYMBOL_ROWS) {
    const r = d.createElement('div');
    r.className = 'cs-row';
    for (const ch of row) {
      const b = d.createElement('button');
      b.type = 'button';
      b.textContent = ch;
      b.title = SYMBOL_NAMES[ch] ? `${SYMBOL_NAMES[ch]}: ${ch}` : `Insert ${ch}`;
      b.setAttribute('aria-label', b.title);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => { if (!ops.type(ch)) ops.nothing?.(); ops.back(); });
      r.appendChild(b);
    }
    symbols.appendChild(r);
  }

  // the spacing panel: every value here can be typed in
  const row = (label: string) => {
    const l = d.createElement('label');
    l.className = 'csp-row';
    const s = d.createElement('span');
    s.textContent = label;
    l.appendChild(s);
    spacing.appendChild(l);
    return l;
  };
  number(row('Line spacing'), 'line', 'Line spacing (1 = single)', { min: 0.5, max: 10, step: 0.05, list: LINE_SPACINGS, cls: 'cb-num' }, (v) => run({ kind: 'line', v: v ?? 1 }));
  number(row('Space before (pt)'), 'before', 'Space before the selected paragraphs, in points', { min: 0, max: 200, step: 1, cls: 'cb-num' }, (v) => run({ kind: 'para', patch: { spaceBefore: v ?? 0 } }));
  number(row('Space after (pt)'), 'after', 'Space after the selected paragraphs, in points', { min: 0, max: 200, step: 1, cls: 'cb-num' }, (v) => run({ kind: 'para', patch: { spaceAfter: v ?? 0 } }));
  number(row('Box width (pt)'), 'wrap', 'Width the lines wrap to, in points (blank: lines break only where you press Enter)', { min: 4, max: 5000, step: 1, cls: 'cb-num', blank: 'none' }, (v) => run({ kind: 'wrap', w: v ?? undefined }));
  bar.append(symbols, spacing);

  const press = (id: string, on: boolean) => {
    const b = buttons.get(id);
    if (!b) return;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  };

  function refresh(): void {
    const s = ops.state();
    const st = s?.style ?? {};
    for (const k of ['bold', 'italic', 'underline', 'sub', 'sup', 'formula'] as const) press(k, !!st[k]);
    press('link', !!s?.link);
    for (const j of ['left', 'center', 'right', 'justify'] as const) press(j, !!s && s.align === j);
    press('bullet', s?.list === 'bullet');
    press('number', s?.list === 'number');
    press('symbols', !symbols.hidden);
    press('spacing', !spacing.hidden);
    const active = d.activeElement;
    const show = (k: keyof typeof inputs, v: string) => { if (active !== inputs[k]) inputs[k].value = v; };
    const r2 = (v: number) => String(Math.round(v * 100) / 100);
    show('font', st.font ?? '');
    inputs.font.placeholder = st.font === undefined ? s?.defaultFont ?? 'Font' : '';
    show('size', st.size !== undefined ? r2(st.size) : '');
    inputs.size.placeholder = st.size === undefined ? '—' : '';
    show('color', st.color ?? '#000000');
    show('line', s ? r2(s.line) : '');
    show('before', s ? r2(s.before) : '');
    show('after', s ? r2(s.after) : '');
    show('wrap', s?.wrap !== undefined ? r2(s.wrap) : '');
  }
  refresh();
  return { refresh, closePanels: () => { symbols.hidden = true; spacing.hidden = true; refresh(); } };
}
