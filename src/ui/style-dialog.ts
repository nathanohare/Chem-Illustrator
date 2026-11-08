// File > Drawing Style…: pick a journal's style or one of your own, change any number, save it
// as your own, make it the style new tabs of this kind start with, and say what happens to the
// structures already drawn (redrawn in the new style, or left as they look now).

import { previewSlot, showDialog } from './dialog-host';
import type { DocStyle, StyleScheme } from '../style';
import { schemePrefs, spacing } from '../chem/scheme-layout';
import { FONT_GROUPS } from '../fonts';
import { STYLE_PRESETS, presetNamed, sameLook, scaleStyle, type RestyleHow } from '../drawing-styles';

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
  /** `focus` names the box being hovered or typed in (textGap, headLength…), for the preview to show what it sets. */
  preview?: (st: DocStyle, focus?: string) => Node;
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
    );

    const grid = el('div', { className: 'md-grid' });
    form.append(grid);
    const row = (label: string, ...els: (HTMLElement | string)[]) => {
      const l = el('label', { className: 'md-row' }, el('span', { textContent: label }), el('span', { className: 'md-controls' }, ...els));
      grid.append(l);
      return l;
    };

    // which style
    const pick = el('select');
    grid.append(el('h3', { textContent: 'Style' }));
    row('Start from', pick);

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
    // reagents and conditions over and under reaction arrows: often a point smaller than captions
    const arrowFont = fontSelect(), arrowSize = el('input', { type: 'number', className: 'md-num', step: 'any', min: '0' });
    arrowFont.prepend(new Option('Same as captions', ''));
    arrowSize.title = 'Leave blank for the captions\' size';
    const smaller = el('button', { type: 'button', textContent: '1 pt smaller', title: 'One point smaller than the captions' });
    smaller.addEventListener('click', () => { const c = parseFloat(captionSize.value); if (c > 1) { arrowSize.value = String(+(c - 1).toFixed(3)); arrowSize.dispatchEvent(new Event('input', { bubbles: true })); } });
    grid.append(el('h3', { textContent: 'Reaction arrows' }));
    row('Text above and below arrows', arrowFont, arrowSize, el('span', { className: 'muted', textContent: 'pt' }), smaller);
    const showArrowSize = () => { arrowSize.placeholder = captionSize.value; };
    captionSize.addEventListener('input', showArrowSize);
    // reaction arrows: their own line width and head, apart from the bonds' (blank: the usual)
    const arrowNum = (title: string) => { const i = el('input', { type: 'number', className: 'md-num', step: 'any', min: '0' }); i.title = title; return i; };
    const arrowWidth = arrowNum('Leave blank for the bonds\' line width');
    const headLength = arrowNum('Leave blank for ten line widths');
    const headWidth = arrowNum('Leave blank for 2.5 line widths each side');
    // (each box names the distance it sets, for the preview's magnifier)
    arrowWidth.dataset.span = 'arrowWidth'; headLength.dataset.span = 'headLength'; headWidth.dataset.span = 'headWidth';
    row('Line width', arrowWidth, el('span', { className: 'muted', textContent: 'pt' }));
    row('Arrowhead length, width', headLength, headWidth, el('span', { className: 'muted', textContent: 'pt' }));
    // how arrows sit in a scheme: as Clean Up Reaction and typing text by an arrow lay them out
    const align = el('select');
    for (const [v, t] of [['center', 'Centered'], ['left', 'Left'], ['right', 'Right']]) align.append(new Option(t, v));
    row('Lines of text line up', align);
    const textGap = arrowNum('Leave blank to scale with the bond length');
    textGap.dataset.span = 'textGap';
    row('Gap between arrow and text', textGap, el('span', { className: 'muted', textContent: 'pt' }));
    const fit = el('input', { type: 'checkbox' });
    row('', fit, el('span', { className: 'muted', textContent: 'Fit the arrow to its text (moves the products)' }));
    const lead = arrowNum('Leave blank to scale with the bond length'), headGap = arrowNum('Leave blank to scale with the bond length');
    lead.dataset.span = 'lead'; headGap.dataset.span = 'headGap';
    const beyond = row('Arrow before and after the text', lead, headGap, el('span', { className: 'muted', textContent: 'pt' }));
    const structGap = arrowNum('Leave blank to scale with the bond length'), plusGap = arrowNum('Leave blank to scale with the bond length');
    structGap.dataset.span = 'structGap'; plusGap.dataset.span = 'plusGap';
    row('Gap to the structures', structGap, el('span', { className: 'muted', textContent: 'pt' }));
    row('Space either side of +', plusGap, el('span', { className: 'muted', textContent: 'pt' }));
    const showScheme = () => {
      // blank: the app's scheme settings, most of them growing with the bond length
      const sp = spacing(parseFloat(inputs.get('bondLength')!.value) || shown.bondLength);
      const auto = (v: number) => String(Math.round(v * 10) / 10);
      textGap.placeholder = auto(sp.conditions); lead.placeholder = auto(sp.lead); headGap.placeholder = auto(sp.headGap);
      structGap.placeholder = auto(sp.gap); plusGap.placeholder = auto(sp.plus);
      beyond.style.opacity = fit.checked ? '' : '0.5';
    };
    fit.addEventListener('change', showScheme);
    inputs.get('bondLength')!.addEventListener('input', showScheme);
    const showArrowLook = () => {
      const lw = parseFloat(arrowWidth.value) > 0 ? parseFloat(arrowWidth.value) : parseFloat(inputs.get('lineWidth')!.value);
      arrowWidth.placeholder = inputs.get('lineWidth')!.value;
      headLength.placeholder = lw > 0 ? String(+(lw * 10).toFixed(2)) : '';
      headWidth.placeholder = lw > 0 ? String(+(lw * 2.5).toFixed(2)) : '';
    };
    for (const i of [arrowWidth, inputs.get('lineWidth')!]) i.addEventListener('input', showArrowLook);

    // your own
    grid.append(el('h3', { textContent: 'Your own styles' }));
    const name = el('input', { type: 'text', placeholder: 'e.g. My group meeting style' });
    const save = el('button', { type: 'button', textContent: 'Save', title: 'Save as My Style: keep these settings under this name, in every mode' });
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
      if (st.arrowTextFont) pickFont(arrowFont, st.arrowTextFont); else arrowFont.value = '';
      arrowSize.value = st.arrowTextSize !== undefined ? String(+st.arrowTextSize.toFixed(3)) : '';
      showArrowSize();
      const pt = (v: number | undefined) => (v !== undefined ? String(+v.toFixed(3)) : '');
      arrowWidth.value = pt(st.arrowWidth);
      headLength.value = pt(st.arrowHeadLength);
      headWidth.value = pt(st.arrowHeadWidth);
      showArrowLook();
      const sc = st.scheme ?? {};
      align.value = sc.textAlign ?? schemePrefs.textAlign;
      textGap.value = pt(sc.textGap); lead.value = pt(sc.lead); headGap.value = pt(sc.headGap);
      structGap.value = pt(sc.structGap); plusGap.value = pt(sc.plusGap);
      fit.checked = sc.fit ?? schemePrefs.fit;
      showScheme();
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
      const af = arrowFont.value.trim(), as = parseFloat(arrowSize.value);
      if (af && af !== st.captionFont) st.arrowTextFont = af; else delete st.arrowTextFont;
      if (Number.isFinite(as) && as > 0 && Math.abs(as - st.captionSize) > 1e-6) st.arrowTextSize = as; else delete st.arrowTextSize;
      const own = (i: HTMLInputElement, k: 'arrowWidth' | 'arrowHeadLength' | 'arrowHeadWidth') => { const v = parseFloat(i.value); if (Number.isFinite(v) && v >= 0.05) st[k] = Math.min(30, v); else delete st[k]; };
      own(arrowWidth, 'arrowWidth');
      own(headLength, 'arrowHeadLength');
      own(headWidth, 'arrowHeadWidth');
      const sc: StyleScheme = {};
      const dist = (i: HTMLInputElement) => { const v = parseFloat(i.value); return Number.isFinite(v) && v >= 0 ? Math.min(500, v) : undefined; };
      for (const [k, i] of [['textGap', textGap], ['lead', lead], ['headGap', headGap], ['structGap', structGap], ['plusGap', plusGap]] as const) { const v = dist(i); if (v !== undefined) sc[k] = v; }
      if (align.value !== schemePrefs.textAlign && (align.value === 'left' || align.value === 'center' || align.value === 'right')) sc.textAlign = align.value;
      if (fit.checked !== schemePrefs.fit) sc.fit = fit.checked;
      if (Object.keys(sc).length) st.scheme = sc; else delete st.scheme;
      return st;
    };

    const fillPick = (select: string) => {
      pick.replaceChildren();
      const inFile = !STYLE_PRESETS.some((p) => sameLook(p.style, o.current)) && !own.some((s) => sameLook(s, o.current));
      if (inFile) pick.add(new Option(`In this file: ${o.current.name}`, 'file:'));
      const journals = el('optgroup', { label: 'Journals and presets' });
      for (const p of STYLE_PRESETS) journals.append(new Option(p.style.name, 'preset:' + p.style.name));
      pick.append(journals);
      if (own.length) {
        const mine = el('optgroup', { label: 'My styles' });
        for (const s of own) mine.append(new Option(s.name, 'own:' + s.name));
        pick.append(mine);
      }
      pick.value = select;
      if (pick.selectedIndex < 0) pick.selectedIndex = 0;
    };
    const chosen = (): DocStyle => {
      const v = pick.value;
      if (v.startsWith('preset:')) return { ...presetNamed(v.slice(7))!.style };
      if (v.startsWith('own:')) return { ...own.find((s) => s.name === v.slice(4))! };
      return { ...o.current };
    };
    const describe = () => {
      const v = pick.value;
      const p = v.startsWith('preset:') ? presetNamed(v.slice(7)) : undefined;
      // where a journal's numbers come from shows on the list's tip, not as a line of its own
      pick.title = p ? `From: ${p.source}.${p.note ? ' ' + p.note : ''}` : v.startsWith('own:') ? 'One of your own styles.' : 'The style this file was saved with.';
      del.disabled = !v.startsWith('own:');
    };

    // start on whatever matches what is in use now
    const now = own.find((s) => s.name === o.current.name && sameLook(s, o.current)) ? 'own:' + o.current.name
      : STYLE_PRESETS.find((p) => sameLook(p.style, o.current)) ? 'preset:' + STYLE_PRESETS.find((p) => sameLook(p.style, o.current))!.style.name
      : 'file:';
    fillPick(now);
    fill(o.current);
    describe();

    pick.addEventListener('change', () => { fill(chosen()); describe(); said.textContent = ''; });
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
    for (const i of inputs.values()) i.addEventListener('input', showCm);

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
      const v = pick.value;
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
      let slot = previewSlot('Preview', true);
      if (!slot) { slot = el('div', { className: 'ask-preview' }); form.insertBefore(slot, grid); }
      const box = slot;
      let queued = 0;
      // the box pointed at, or else typed in: the preview shows the distance it sets
      let hovered: string | undefined, focused: string | undefined, shownFor: string | undefined;
      const spanOf = (t: EventTarget | null) => (t instanceof HTMLElement ? (t.dataset.span ?? t.closest('.md-row')?.querySelector<HTMLElement>('[data-span]')?.dataset.span) : undefined);
      const draw = () => { shownFor = hovered ?? focused; box.replaceChildren(o.preview!(read(), shownFor)); };
      const redraw = () => { cancelAnimationFrame(queued); queued = requestAnimationFrame(draw); };
      draw();
      form.addEventListener('input', redraw);
      form.addEventListener('change', redraw);
      pick.addEventListener('change', redraw);
      const moved = () => { if ((hovered ?? focused) !== shownFor) redraw(); };
      form.addEventListener('mouseover', (e) => { hovered = spanOf(e.target); moved(); });
      form.addEventListener('mouseleave', () => { hovered = undefined; moved(); });
      form.addEventListener('focusin', (e) => { focused = spanOf(e.target); moved(); });
      form.addEventListener('focusout', (e) => { if (!spanOf(e.relatedTarget)) { focused = undefined; moved(); } });
    }
    pick.focus();
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
