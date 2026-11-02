// File > Drawing Style…: pick a journal's style or one of your own, change any number, save it
// as your own, make it the style new tabs of this kind start with, and say what happens to the
// structures already drawn (redrawn in the new style, or left as they look now).

import { previewSlot, showDialog } from './dialog-host';
import type { DocStyle } from '../style';
import { FONT_GROUPS } from '../fonts';
import { presetNamed, scaleStyle, type RestyleHow } from '../drawing-styles';
import { cardFor, styleCardList, styleCards } from './style-cards';

export interface StyleChoice {
  style: DocStyle;
  how: RestyleHow;
  /** Use this style for new tabs of this kind. */
  forNew: boolean;
  /** Your own styles after any saved or deleted here. */
  own: DocStyle[];
}

export interface StyleDialogOptions {
  current: DocStyle;
  own: DocStyle[];
  /** "drawings", "slide decks"… for the "Use for new …" box. */
  kindPlural: string;
  /** Where the structures are: "this drawing", "every slide"… */
  where: string;
  /** This style is already the one new tabs of this kind use. */
  isDefault: boolean;
  /** There are structures already, so ask what happens to them. */
  hasStructures: boolean;
  /** A sample drawing in the style shown, beside the settings (drawn again as they change). */
  preview?: (st: DocStyle) => Node;
  /** Show the drawing itself in a style while the window is open (null: as it was). */
  livePreview?(st: DocStyle | null): void;
}


type NumKey = 'bondLength' | 'lineWidth' | 'boldWidth' | 'marginWidth' | 'hashSpacing' | 'bondSpacing' | 'chainAngle' | 'labelSize' | 'captionSize';
const NUMS: [NumKey, string, string][] = [
  ['bondLength', 'Bond length', 'pt'],
  ['lineWidth', 'Line width', 'pt'],
  ['boldWidth', 'Bold width', 'pt'],
  ['marginWidth', 'Margin width', 'pt'],
  ['hashSpacing', 'Hash spacing', 'pt'],
  ['bondSpacing', 'Double bond spacing', '% of bond length'],
  ['chainAngle', 'Chain angle', '°'],
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

/** Show the window; resolves with what was chosen, or null when cancelled. */
export function editDrawingStyle(o: StyleDialogOptions): Promise<StyleChoice | null> {
  return new Promise((resolve) => {
    let own = o.own.map((s) => ({ ...s }));
    const d = el('dialog', { className: 'master-dialog style-dialog' });
    const form = el('form');
    d.append(form);
    form.append(
      el('h2', { textContent: 'Drawing style' }),
      el('p', { className: 'muted', textContent: `How structures are drawn in ${o.where}: bond length, line widths and label fonts. Pick a journal's style or your own, and change any number.` }),
    );

    const grid = el('div', { className: 'md-grid' });
    form.append(grid);
    const row = (label: string, ...els: (HTMLElement | string)[]) => {
      const l = el('label', { className: 'md-row' }, el('span', { textContent: label }), el('span', { className: 'md-controls' }, ...els));
      grid.append(l);
      return l;
    };

    // which style: a card for each, drawn in it
    let picked = '';
    const source = el('p', { className: 'muted style-source' });
    const cardsAt = el('div', { className: 'style-cards-at' });
    grid.append(el('h3', { textContent: 'Style' }), cardsAt, source);

    // its numbers
    grid.append(el('h3', { textContent: 'Structures' }));
    const inputs = new Map<NumKey, HTMLInputElement>();
    let keepWhole!: HTMLInputElement;
    const cmNote = new Map<NumKey, HTMLSpanElement>();
    for (const [k, label, unit] of NUMS) {
      const i = el('input', { type: 'number', className: 'md-num', step: 'any', min: '0' });
      const u = el('span', { className: 'muted', textContent: unit });
      inputs.set(k, i);
      cmNote.set(k, u);
      row(label, i, u);
      if (k === 'bondLength') {
        const keep = el('input', { type: 'checkbox', checked: true });
        keepWhole = keep;
        row('', keep, el('span', { className: 'muted', textContent: 'Change widths and font sizes with it' }));
      }
    }
    const labelFont = fontSelect(), labelSize = el('input', { type: 'number', className: 'md-num', step: 'any', min: '0' });
    row('Atom labels', labelFont, labelSize, el('span', { className: 'muted', textContent: 'pt' }));
    const captionFont = fontSelect(), captionSize = el('input', { type: 'number', className: 'md-num', step: 'any', min: '0' });
    row('Captions', captionFont, captionSize, el('span', { className: 'muted', textContent: 'pt' }));
    inputs.set('labelSize', labelSize);
    inputs.set('captionSize', captionSize);

    // your own
    grid.append(el('h3', { textContent: 'Your own styles' }));
    const name = el('input', { type: 'text', placeholder: 'e.g. My group meeting style' });
    const save = el('button', { type: 'button', textContent: 'Save as My Style', title: 'Keep these settings under this name, in every mode' });
    const del = el('button', { type: 'button', textContent: 'Delete', title: 'Remove this one of your own styles' });
    row('Name', name, save, del);
    const said = el('p', { className: 'muted', textContent: '' });
    grid.append(said);

    // what happens
    grid.append(el('h3', { textContent: 'When you apply it' }));
    const redraw = el('input', { type: 'radio', name: 'how', value: 'restyle', checked: true });
    const keepLook = el('input', { type: 'radio', name: 'how', value: 'new-only' });
    if (o.hasStructures) {
      grid.append(
        el('label', { className: 'style-radio' }, redraw, ' Redraw the structures already there in the new style'),
        el('label', { className: 'style-radio' }, keepLook, ' Keep their look; only new structures use it'),
      );
    }
    const forNew = el('input', { type: 'checkbox', checked: o.isDefault });
    grid.append(el('label', { className: 'style-radio' }, forNew, ` Use this style for new ${o.kindPlural}`));

    const cancel = el('button', { type: 'button', textContent: 'Cancel' });
    const ok = el('button', { type: 'submit', className: 'primary', textContent: 'Apply' });
    form.append(el('p', { className: 'ask-buttons' }, cancel, ok));

    // ------------------------------------------------------------ filling and reading

    let shown: DocStyle = { ...o.current };
    const fill = (st: DocStyle) => {
      shown = { ...st };
      for (const [k, i] of inputs) i.value = String(+st[k].toFixed(3));
      pickFont(labelFont, st.labelFont);
      pickFont(captionFont, st.captionFont);
      name.value = st.name;
      showCm();
    };
    const showCm = () => {
      for (const [k, , unit] of NUMS) {
        if (unit !== 'pt') continue;
        const v = parseFloat(inputs.get(k)!.value);
        cmNote.get(k)!.textContent = Number.isFinite(v) ? `pt (${+(v / 28.3465).toFixed(3)} cm)` : 'pt';
      }
    };
    const read = (): DocStyle => {
      const st: DocStyle = { ...shown, name: name.value.trim() || shown.name };
      for (const [k, i] of inputs) {
        const v = parseFloat(i.value);
        if (Number.isFinite(v) && v > 0) st[k] = v;
      }
      st.labelFont = labelFont.value.trim() || shown.labelFont;
      st.captionFont = captionFont.value.trim() || shown.captionFont;
      return st;
    };

    // pointing at a card shows it on the drawing behind the window and in the sample
    let sample: (st: DocStyle) => void = () => {};
    // (the drawing itself only while a card is pointed at, so it is never left half-changed)
    const show = () => sample(read());
    let hovering = false;
    const fillPick = (select: string) => {
      const cards = styleCards({
        own,
        chosen: select,
        onPick: (c) => { picked = c.key; fill(chosen()); describe(); said.textContent = ''; show(); },
        onHover: (c) => { hovering = !!c; o.livePreview?.(c ? c.style : null); sample(c ? c.style : read()); },
        onSave: () => { name.focus(); name.select(); said.textContent = 'Type a name for it, then Save as My Style.'; },
      });
      cardsAt.replaceChildren(cards);
      picked = select;
      if (!select.startsWith('preset:') && !select.startsWith('own:')) {
        const inFile = el('p', { className: 'muted small', textContent: `In use now: ${o.current.name} (from this file; none of the cards draws the same).` });
        cardsAt.append(inFile);
      }
    };
    const chosen = (): DocStyle => {
      const v = picked;
      if (v.startsWith('preset:')) return { ...presetNamed(v.slice(7))!.style };
      if (v.startsWith('own:')) return { ...own.find((s) => s.name === v.slice(4))! };
      return { ...o.current };
    };
    const describe = () => {
      const v = picked;
      const p = v.startsWith('preset:') ? presetNamed(v.slice(7)) : undefined;
      source.textContent = p ? `From: ${p.source}.${p.note ? ' ' + p.note : ''}` : v.startsWith('own:') ? 'One of your own styles.' : 'The style this file was saved with.';
      del.disabled = !v.startsWith('own:');
    };

    // start on whatever matches what is in use now
    const now = cardFor(styleCardList(own), o.current)?.key ?? 'file:';
    fillPick(now);
    fill(o.current);
    describe();

    const bondIn = inputs.get('bondLength')!;
    let lastBond = shown.bondLength;
    bondIn.addEventListener('focus', () => { lastBond = parseFloat(bondIn.value) || shown.bondLength; });
    bondIn.addEventListener('change', () => {
      const v = parseFloat(bondIn.value);
      if (keepWhole.checked && Number.isFinite(v) && v > 0 && lastBond > 0 && Math.abs(v - lastBond) > 1e-9) {
        const scaled = scaleStyle(read(), v / lastBond);
        scaled.bondLength = v;
        const keepName = name.value;
        fill(scaled);
        name.value = keepName;
      }
      lastBond = v;
      showCm();
    });
    for (const i of inputs.values()) i.addEventListener('input', () => { showCm(); if (!hovering) show(); });
    for (const f of [labelFont, captionFont]) f.addEventListener('change', () => show());

    save.addEventListener('click', () => {
      const st = read();
      if (!name.value.trim()) { said.textContent = 'Type a name for your style first.'; name.focus(); return; }
      const had = own.findIndex((s) => s.name === st.name);
      if (had >= 0) own[had] = st; else own.push(st);
      fillPick('own:' + st.name);
      shown = { ...st };
      describe();
      said.textContent = had >= 0 ? `Updated "${st.name}".` : `Saved "${st.name}". It is in the list in every mode.`;
    });
    del.addEventListener('click', () => {
      const v = picked;
      if (!v.startsWith('own:')) return;
      own = own.filter((s) => s.name !== v.slice(4));
      fillPick(now.startsWith('own:') && now.slice(4) === v.slice(4) ? 'file:' : now);
      fill(chosen());
      describe();
      said.textContent = `Deleted "${v.slice(4)}".`;
    });

    let finished = false;
    const done = (v: StyleChoice | null) => {
      if (finished) return;
      finished = true;
      o.livePreview?.(null);
      if (d.open) d.close();
      d.remove();
      resolve(v);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      done({ style: read(), how: keepLook.checked ? 'new-only' : 'restyle', forNew: forNew.checked, own });
    });
    cancel.addEventListener('click', () => done(null));
    d.addEventListener('close', () => done(null));
    document.body.append(d);
    showDialog(d);
    if (o.preview) {
      // in the Settings window's pane on the right, or at the top of the window
      let slot = previewSlot('Preview');
      if (!slot) { slot = el('div', { className: 'ask-preview' }); form.insertBefore(slot, grid); }
      const box = slot;
      let queued = 0;
      const redraw = () => { cancelAnimationFrame(queued); queued = requestAnimationFrame(() => box.replaceChildren(o.preview!(read()))); };
      box.replaceChildren(o.preview(read()));
      form.addEventListener('input', redraw);
      form.addEventListener('change', redraw);
      sample = (st) => { cancelAnimationFrame(queued); queued = requestAnimationFrame(() => box.replaceChildren(o.preview!(st))); };
    }
    (cardsAt.querySelector<HTMLButtonElement>('[aria-checked=true]') ?? cardsAt.querySelector<HTMLButtonElement>('button'))?.focus();
  });
}

/** A list of the fonts the app can draw with: those bundled with it, then the usual ones on a computer. */
function fontSelect(): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'style-font';
  for (const g of FONT_GROUPS) {
    const og = document.createElement('optgroup');
    og.label = g.name;
    for (const f of g.fonts) if (f !== 'Symbol') { const o = new Option(f, f); o.style.fontFamily = `"${f}", sans-serif`; og.append(o); }
    sel.append(og);
  }
  return sel;
}

/** Choose a font in the list, adding it first (under "In this file") when it is not one of the usual ones. */
function pickFont(sel: HTMLSelectElement, font: string): void {
  sel.querySelector('optgroup[data-own]')?.remove();
  const has = [...sel.options].find((o) => o.value.toLowerCase() === font.toLowerCase());
  if (has) { sel.value = has.value; return; }
  const og = document.createElement('optgroup');
  og.label = 'In this file';
  og.dataset.own = 'true';
  og.append(new Option(font, font));
  sel.prepend(og);
  sel.value = font;
}
