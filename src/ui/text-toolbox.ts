// The Text Formatting toolbox (View > Toolboxes): font and size, bold, italic, underline, sub- and superscript,
// formula subscripts in one click, stereodescriptors in italics in one click, and the symbols a
// chemist types most (‡, °, Greek letters). It docks at any edge or floats like the other
// toolboxes, and works on the text being typed (its selection), or on the whole of each picked
// caption or text box, or in a document, as the ribbon's buttons do.

import type { RunStyle, Toggle } from '../richtext';
import { savableChar } from '../richtext';
import { FONT_STEPS, type TextFormat } from '../text/format';

export interface TextToolboxHooks {
  /** Make the change; false when there is no text to change. */
  format(f: TextFormat): boolean;
  /** Type a character where the caret is (or start a caption with it); false when it can't go anywhere. */
  type(ch: string): boolean;
  /** How the text the buttons would change looks now, for showing which are on (null: no text). */
  look(): RunStyle | null;
  /** The size and font that text without its own has there (the caption's or the drawing style's). */
  defaults?(): { size?: number; font?: string } | null;
  /** Insert > Symbol, for every other character. */
  moreSymbols(): void;
  /** A short message in the status bar. */
  say(text: string): void;
}

/** The symbol groups, each a row (or a block of rows when docked at a side). */
export const TEXT_SYMBOLS: { name: string; chars: string }[] = [
  { name: 'Chemistry', chars: '‡°±×·•→⇌⇄↑↓ΔνλµÅ≈≤≥≡′″–—' },
  { name: 'Greek', chars: 'αβγδεζηθικμξπρστφχψω' },
  { name: 'Capital Greek', chars: 'ΓΘΛΞΠΣΦΨΩ' },
];

/** What a symbol is called on its button's tip. */
const SYMBOL_NAMES: Record<string, string> = {
  '‡': 'Double dagger (transition state, ΔG‡)', '°': 'Degree', '±': 'Plus or minus (racemic)', '×': 'Times', '·': 'Middle dot (solvates, ·HCl)',
  '•': 'Bullet (radical)', '→': 'Arrow', '⇌': 'Equilibrium', '⇄': 'Exchange', '↑': 'Gas evolved', '↓': 'Precipitate', 'Δ': 'Delta (heat)',
  'ν': 'Nu (frequency)', 'λ': 'Lambda (wavelength)', 'µ': 'Micro', 'Å': 'Ångström', '≈': 'About', '≤': 'At most', '≥': 'At least', '≡': 'Triple bond',
  '′': 'Prime', '″': 'Double prime', '–': 'En dash (ranges)', '—': 'Em dash',
};

const BUTTONS: { id: Toggle | 'stereo'; html: string; title: string }[] = [
  { id: 'bold', html: '<b>B</b>', title: 'Bold (Ctrl+B)' },
  { id: 'italic', html: '<i>I</i>', title: 'Italic (Ctrl+I)' },
  { id: 'underline', html: '<u>U</u>', title: 'Underline (Ctrl+U)' },
  { id: 'sub', html: 'x<sub>2</sub>', title: 'Subscript (Ctrl+=)' },
  { id: 'sup', html: 'x<sup>2</sup>', title: 'Superscript (Ctrl+Shift+=)' },
  { id: 'formula', html: 'CH<sub>3</sub>', title: 'Formula in one click: numbers after letters go down, charges go up (CH2Cl2 → CH₂Cl₂)' },
  { id: 'stereo', html: '(<i>R</i>)', title: 'Stereodescriptors in italics in one click: (2R,3S)-, (E)-, cis-, tert-, n-Bu, p- (again: back to upright)' },
];

/** The toolbox's contents, built into `body`. `vertical`: docked at a side, so it is narrow. */
export function buildTextToolbox(body: HTMLElement, vertical: boolean, h: TextToolboxHooks): { refresh(): void } {
  const d = body.ownerDocument;
  body.classList.add('tt-box');
  body.classList.toggle('tt-vertical', vertical);
  // a click here keeps the text being typed open (the caption editor ends on a click anywhere else)
  body.dataset.keepsTyping = '';
  const keep = (b: HTMLElement) => b.addEventListener('mousedown', (e) => e.preventDefault());

  // font and size, as on the Home tab (any installed font can be typed)
  const faces = d.createElement('div');
  faces.className = 'tt-faces';
  const font = d.createElement('input');
  font.className = 'tt-font font-box';
  font.setAttribute('list', 'ci-fonts');
  font.spellcheck = false;
  font.placeholder = 'Font';
  font.title = 'Font of the selected text, or of the whole of each picked caption (type any installed font)';
  font.setAttribute('aria-label', 'Font');
  const size = d.createElement('input');
  size.className = 'tt-size';
  size.inputMode = 'decimal';
  size.placeholder = 'Size';
  size.title = 'Font size in points';
  size.setAttribute('aria-label', 'Font size');
  const sizes = d.createElement('datalist');
  sizes.id = `tt-sizes-${Math.random().toString(36).slice(2, 8)}`;
  for (const n of FONT_STEPS) sizes.append(new Option(String(n)));
  size.setAttribute('list', sizes.id);
  const field = (input: HTMLInputElement, apply: () => void) => {
    input.addEventListener('change', apply);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); apply(); }
      if (e.key === 'Escape') { e.preventDefault(); refresh(); }
    });
  };
  const run = (f: TextFormat) => { if (!h.format(f)) h.say('Click into some text, or pick a caption or text box, first.'); refresh(); };
  field(font, () => {
    const v = font.value.trim();
    run({ kind: 'style', patch: { font: v && v !== h.defaults?.()?.font ? v : undefined } });
  });
  field(size, () => {
    const v = parseFloat(size.value);
    if (Number.isFinite(v) && v > 0) run({ kind: 'style', patch: { size: Math.min(400, v) } });
    else refresh();
  });
  faces.append(font, size, sizes);
  body.append(faces);

  const fmt = d.createElement('div');
  fmt.className = 'tt-format';
  const pressed = new Map<string, HTMLButtonElement>();
  for (const spec of BUTTONS) {
    const b = d.createElement('button');
    b.type = 'button';
    b.className = 'tt-btn';
    b.innerHTML = spec.html;
    b.title = spec.title;
    b.setAttribute('aria-label', spec.title);
    keep(b);
    b.addEventListener('click', () => run(spec.id === 'stereo' ? { kind: 'stereo' } : { kind: 'toggle', key: spec.id }));
    if (spec.id !== 'stereo') { b.setAttribute('aria-pressed', 'false'); pressed.set(spec.id, b); }
    fmt.append(b);
  }
  body.append(fmt);

  for (const g of TEXT_SYMBOLS) {
    const row = d.createElement('div');
    row.className = 'tt-symbols';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', g.name);
    for (const ch of [...g.chars].filter(savableChar)) {
      const b = d.createElement('button');
      b.type = 'button';
      b.className = 'tt-sym';
      b.textContent = ch;
      b.title = SYMBOL_NAMES[ch] ? `${SYMBOL_NAMES[ch]}: ${ch}` : `Insert ${ch}`;
      b.setAttribute('aria-label', b.title);
      keep(b);
      b.addEventListener('click', () => { if (!h.type(ch)) h.say('Click where the symbol should go first.'); });
      row.append(b);
    }
    body.append(row);
  }
  const more = d.createElement('button');
  more.type = 'button';
  more.className = 'tt-more';
  more.textContent = 'More symbols…';
  more.title = 'Insert > Symbol: every character, with the ones you used last';
  keep(more);
  more.addEventListener('click', () => h.moreSymbols());
  body.append(more);

  function refresh(): void {
    const s = h.look();
    for (const [id, b] of pressed) {
      const on = !!s && !!s[id as Toggle];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const dflt = s ? h.defaults?.() ?? null : null;
    const active = d.activeElement;
    if (active !== font) { font.value = s?.font ?? ''; font.placeholder = s ? (s.font === undefined ? dflt?.font ?? 'Font' : '') : 'Font'; }
    if (active !== size) { const z = s?.size ?? dflt?.size; size.value = z !== undefined ? String(+z.toFixed(2)) : ''; }
  }
  refresh();
  return { refresh };
}
