// Small windows that ask for a value or two (Rotate…, Scale…). The desktop app can't rely on
// the browser's own prompt boxes, so these are drawn by the page.

import { keepInRange } from './num-range';
import { previewSlot, showDialog } from './dialog-host';
import { addInfo } from './info-tip';
export interface Field {
  name: string;
  label: string;
  value: string;
  /** Text after the box, such as a unit. */
  unit?: string;
  /** A checkbox gives 'true' or 'false'. A heading is a subheading over the fields after it (no box; its help goes in an "i" beside it). */
  type?: 'number' | 'text' | 'textarea' | 'checkbox' | 'color' | 'password' | 'heading';
  /** Grey example text shown in an empty box. */
  placeholder?: string;
  /** A number box's range: what is typed outside it is brought back to the nearest end. */
  min?: number;
  max?: number;
  /** Pick one of these instead of typing. */
  options?: { value: string; label: string }[];
  /** Offered in a list under a text box, which can still be typed in. */
  suggestions?: string[];
  /** Help for the field, behind an "i" beside its name. */
  help?: string;
  /** A small picture of the choice beside the box, drawn again as it changes. */
  inline?: (value: string) => Node;
  /** A drop-down list only as wide as its choices, with its picture (`inline`) right beside it. */
  short?: boolean;
  /** A drop-down list of its own on the same row, after the label (a checkbox's units, say); its value comes back under its own name. */
  beside?: { name: string; value: string; options: { value: string; label: string }[]; label: string };
}

/** A bigger picture of what the settings will look like, beside them (the Settings window's right-hand pane), drawn again as anything changes. */
export interface AskPreview {
  title: string;
  /** Under the fields, rather than in the Settings window's right-hand pane. */
  below?: boolean;
  /** `focus` names the field being hovered or typed in (a preview can show what it sets). */
  draw: (values: Record<string, string>, focus?: string) => Node;
}

/** Buttons in an ask window that act at once rather than when it is saved. */
export interface AskActions {
  label: string;
  help?: string;
  buttons: { text: string; run: (say: (text: string) => void) => void }[];
}

/** Show the fields; resolves with what was entered, or null if the window was cancelled. */
export function ask(title: string, fields: Field[], opts: { ok?: string; note?: string; /** Only an OK button, for a message. */ noCancel?: boolean; /** A short list under the note (two columns: what, and its value). */ lines?: [string, string][]; preview?: AskPreview; /** Called with the values as they are typed or picked (a live preview). */ onInput?: (values: Record<string, string>) => void; /** A row of buttons under the fields that act at once (Export Settings…), with a name, its help behind an "i", and a line they can write to. */ actions?: AskActions } = {}): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask';
    const form = document.createElement('form');
    form.className = 'ask-form';
    const h = document.createElement('h2');
    h.textContent = title;
    form.append(h);
    // the window's help sits in an "i" beside its title; a window with nothing to fill in is a
    // message, and its note is the message
    if (opts.note && fields.length) addInfo(h, opts.note);
    else if (opts.note) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = opts.note;
      form.append(p);
    }
    if (opts.lines?.length) {
      const t = document.createElement('table');
      t.className = 'ask-lines';
      for (const [a, b] of opts.lines) {
        const tr = t.insertRow();
        tr.insertCell().textContent = a;
        tr.insertCell().textContent = b;
      }
      form.append(t);
    }
    const inputs = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
    const inlines: (() => void)[] = [];
    for (const f of fields) {
      if (f.type === 'heading') {
        const sub = document.createElement('h3');
        sub.className = 'ask-subhead';
        sub.textContent = f.label;
        if (f.help) addInfo(sub, f.help);
        form.append(sub);
        continue;
      }
      const row = document.createElement('label');
      row.className = 'ask-row';
      row.dataset.field = f.name;
      const name = document.createElement('span');
      name.className = 'ask-name';
      name.textContent = f.label;
      let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (f.type === 'textarea') {
        const ta = document.createElement('textarea');
        ta.rows = 8;
        ta.value = f.value;
        ta.spellcheck = false;
        if (f.placeholder) ta.placeholder = f.placeholder;
        input = ta;
        row.classList.add('ask-wide');
      } else if (f.type === 'checkbox') {
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = f.value === 'true';
        input = inp;
        row.classList.add('ask-check');
      } else if (f.options) {
        const sel = document.createElement('select');
        for (const o of f.options) sel.add(new Option(o.label, o.value, false, o.value === f.value));
        input = sel;
      } else {
        const inp = document.createElement('input');
        inp.type = f.type ?? 'text';
        if (inp.type === 'number') {
          inp.step = 'any';
          if (f.min !== undefined || f.max !== undefined) keepInRange(inp, f.min ?? -Infinity, f.max ?? Infinity, f.unit);
        }
        inp.value = f.value;
        if (f.placeholder) inp.placeholder = f.placeholder;
        if (f.suggestions) {
          const dl = document.createElement('datalist');
          dl.id = `ask-list-${f.name}-${Math.random().toString(36).slice(2, 8)}`;
          for (const sg of f.suggestions) dl.append(new Option(sg));
          inp.setAttribute('list', dl.id);
          row.append(dl);
        }
        input = inp;
      }
      inputs.set(f.name, input);
      if (f.type === 'checkbox') row.append(input, name); else row.append(name, input);
      if (f.unit) {
        const u = document.createElement('span');
        u.className = 'muted';
        u.textContent = f.unit;
        row.append(u);
      }
      if (f.beside) {
        const sel = document.createElement('select');
        sel.className = 'ask-beside';
        sel.setAttribute('aria-label', f.beside.label);
        for (const o of f.beside.options) sel.add(new Option(o.label, o.value, false, o.value === f.beside.value));
        row.classList.add('ask-has-beside');
        row.append(sel);
        inputs.set(f.beside.name, sel);
      }
      if (f.inline) {
        const slot = document.createElement('span');
        slot.className = 'ask-inline';
        slot.setAttribute('aria-hidden', 'true');
        if (f.short && f.type !== 'checkbox') {
          // the list and its picture together, in the boxes' column
          const pair = document.createElement('span');
          pair.className = 'ask-pair';
          input.replaceWith(pair);
          pair.append(input, slot);
        } else row.append(slot);
        if (f.type === 'checkbox') row.classList.add('ask-has-inline');
        const el = input;
        inlines.push(() => slot.replaceChildren(f.inline!(el instanceof HTMLInputElement && el.type === 'checkbox' ? String(el.checked) : el.value)));
      }
      if (f.help) addInfo(name, f.help);
      form.append(row);
    }
    if (opts.actions) {
      const row = document.createElement('div');
      row.className = 'ask-row ask-actions';
      const name = document.createElement('span');
      name.className = 'ask-name';
      name.textContent = opts.actions.label;
      const out = document.createElement('span');
      out.className = 'muted small';
      out.setAttribute('aria-live', 'polite');
      const say = (t: string) => { out.textContent = t; };
      const btns = document.createElement('span');
      btns.className = 'ask-action-buttons';
      for (const a of opts.actions.buttons) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a.text;
        b.addEventListener('click', () => a.run(say));
        btns.append(b);
      }
      row.append(name, btns, out);
      if (opts.actions.help) addInfo(name, opts.actions.help);
      form.append(row);
    }
    const buttons = document.createElement('p');
    buttons.className = 'ask-buttons';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'primary';
    ok.textContent = opts.ok ?? 'OK';
    if (opts.noCancel) buttons.append(ok);
    else buttons.append(cancel, ok);
    form.append(buttons);
    d.append(form);

    let finished = false;
    const done = (v: Record<string, string> | null) => {
      if (finished) return;
      finished = true;
      if (d.open) d.close();
      d.remove();
      resolve(v);
    };
    const values = () => {
      const out: Record<string, string> = {};
      for (const [k, el] of inputs) out[k] = el instanceof HTMLInputElement && el.type === 'checkbox' ? String(el.checked) : el.value;
      return out;
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      done(values());
    });
    if (opts.onInput) {
      const live = () => opts.onInput!(values());
      form.addEventListener('input', live);
      form.addEventListener('change', live);
      queueMicrotask(live);
    }
    cancel.addEventListener('click', () => done(null));
    d.addEventListener('close', () => done(null));
    showDialog(d);
    // the pictures of the choices, drawn now and again as anything changes
    let big: HTMLElement | null = null;
    if (opts.preview) {
      big = opts.preview.below ? null : previewSlot(opts.preview.title);
      if (!big && opts.preview.below) {
        // a heading and the picture after the last field
        const h = document.createElement('h3');
        h.className = 'ask-preview-title';
        h.textContent = opts.preview.title;
        big = document.createElement('div');
        big.className = 'ask-preview ask-preview-below';
        form.insertBefore(h, buttons);
        form.insertBefore(big, buttons);
      } else if (!big) {
        big = document.createElement('div');
        big.className = 'ask-preview';
        form.insertBefore(big, form.querySelector('.ask-row'));
      }
    }
    // the field being pointed at, or else typed in: the preview can show what it sets
    let hovered: string | undefined, focused: string | undefined, shownFor: string | undefined;
    const fieldOf = (t: EventTarget | null) => (t instanceof Element ? (t.closest<HTMLElement>('[data-field]')?.dataset.field) : undefined);
    const drawBig = () => {
      shownFor = hovered ?? focused;
      if (big && opts.preview) big.replaceChildren(opts.preview.draw(values(), shownFor));
    };
    const redraw = () => {
      for (const f of inlines) f();
      drawBig();
    };
    if (inlines.length || big) {
      redraw();
      form.addEventListener('input', redraw);
      form.addEventListener('change', redraw);
    }
    if (big) {
      const moved = () => { if ((hovered ?? focused) !== shownFor) drawBig(); };
      form.addEventListener('mouseover', (e) => { hovered = fieldOf(e.target); moved(); });
      form.addEventListener('mouseleave', () => { hovered = undefined; moved(); });
      form.addEventListener('focusin', (e) => { focused = fieldOf(e.target); moved(); });
      form.addEventListener('focusout', (e) => { if (!fieldOf(e.relatedTarget)) { focused = undefined; moved(); } });
    }
    const first = form.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type=checkbox]), textarea');
    first?.focus();
    first?.select();
  });
}

/**
 * A message with a button for each choice (the primary one last, as the system's own windows
 * have it), and more about it behind an "i" beside the title; resolves with the choice picked.
 * Escape, or closing the window, picks `dismiss`.
 */
export function askChoice<T extends string>(title: string, message: string, choices: { value: T; label: string; primary?: boolean }[], dismiss: T, info?: string): Promise<T> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask';
    const form = document.createElement('form');
    form.className = 'ask-form';
    const h = document.createElement('h2');
    h.textContent = title;
    if (info) addInfo(h, info);
    const p = document.createElement('p');
    p.className = 'muted ask-message';
    p.textContent = message;
    const buttons = document.createElement('p');
    buttons.className = 'ask-buttons';
    let finished = false;
    const done = (v: T) => {
      if (finished) return;
      finished = true;
      if (d.open) d.close();
      d.remove();
      resolve(v);
    };
    let primary: HTMLButtonElement | null = null;
    for (const c of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = c.label;
      if (c.primary) { b.className = 'primary'; primary = b; }
      b.addEventListener('click', () => done(c.value));
      buttons.append(b);
    }
    form.append(h, p, buttons);
    form.addEventListener('submit', (e) => e.preventDefault());
    d.append(form);
    d.addEventListener('close', () => done(dismiss));
    showDialog(d);
    primary?.focus();
  });
}
