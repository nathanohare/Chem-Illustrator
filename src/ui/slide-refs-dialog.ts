// Insert > Presentation > References on Slide (also the slide's right-click menu): tick which of the
// presentation's references the slide shows at its foot, and how the lines look: the short form,
// the first author and the short form, or the full reference; numbered or not; where on the slide;
// their size and colour. Apply keeps the look for the slides picked; Apply to All uses it on every
// slide. The lines are written, placed and formatted by the app, like the slide number and footer.

import type { CiteFormat } from '../document/cite-styles';
import { shortLabel, type Piece, type Reference } from '../document/references';
import { REF_FORMS, REF_NUMBERINGS, REF_PLACES, slideRefPieces, type RefForm, type RefLook, type RefNumbering, type RefPlace } from '../deck/slide-refs';
import { showDialog } from './dialog-host';

export interface SlideRefsResult {
  /** The references the slides show, in order. */
  ids: string[];
  look: RefLook;
  /** Apply (the look for the slides picked) or Apply to All (the look for every slide). */
  scope: 'picked' | 'all';
}

export interface SlideRefsInput {
  /** The presentation's references (the window asks again after Manage References). */
  refs(): Reference[];
  /** The citation style the lines are written in. */
  format(): CiteFormat;
  /** The references the slide shows now, in order. */
  chosen: string[];
  /** How its lines look now. */
  look: RefLook;
  /** The master's footer colour (the lines' colour unless another is picked). */
  footerColor: string;
  /** How many slides are picked. */
  picked: number;
  /** Open the References window on this presentation (resolves when it is closed). */
  manage(): Promise<void>;
  /** The numbers the lines would have ("(1)"…, or "" each when not numbered), for the preview. */
  labels(ids: string[], look: RefLook): string[];
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Pieces of text with their italics and bold. */
function pieces(into: HTMLElement, ps: Piece[]): void {
  into.replaceChildren(...ps.map((p) => {
    if (!p.italic && !p.bold) return document.createTextNode(p.text);
    let n: HTMLElement = el('span', '', p.text);
    if (p.italic) { const i = el('i'); i.append(n); n = i; }
    if (p.bold) { const b = el('b'); b.append(n); n = b; }
    return n;
  }));
}

export function editSlideRefs(input: SlideRefsInput): Promise<SlideRefsResult | null> {
  return new Promise((resolve) => {
    const d = el('dialog', 'ask slide-refs-dialog');
    const form = el('form');
    form.method = 'dialog';
    d.append(form);
    let order = [...input.chosen];
    const ticked = new Set(order);

    const list = el('div', 'slide-refs-list');
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', 'References on this slide');
    const select = <T extends string>(names: Record<T, string>, value: T) => {
      const s = el('select');
      for (const [k, v] of Object.entries(names)) s.add(new Option(v as string, k));
      s.value = value;
      return s;
    };
    const formSel = select<RefForm>(REF_FORMS, input.look.form);
    const numSel = select<RefNumbering>(REF_NUMBERINGS, input.look.numbering);
    const placeSel = select<RefPlace>(REF_PLACES, input.look.place);
    const size = el('input');
    size.type = 'number'; size.min = '6'; size.max = '32'; size.step = '0.5'; size.value = String(input.look.size);
    const ownColour = el('input');
    ownColour.type = 'checkbox';
    ownColour.checked = !!input.look.color;
    const colour = el('input');
    colour.type = 'color';
    colour.value = input.look.color ?? input.footerColor;
    colour.disabled = !ownColour.checked;
    ownColour.addEventListener('change', () => { colour.disabled = !ownColour.checked; });
    const row = (label: string, ...kids: HTMLElement[]) => {
      const l = el('label', 'ask-row');
      l.append(el('span', '', label), ...kids);
      return l;
    };
    const colourBox = el('span', 'slide-refs-colour');
    const colourLabel = el('label');
    colourLabel.append(ownColour, ' Own colour ');
    colourBox.append(colourLabel, colour);

    const look = (): RefLook => ({
      form: formSel.value as RefForm, numbering: numSel.value as RefNumbering, place: placeSel.value as RefPlace,
      size: Math.max(6, Math.min(32, Number(size.value) || input.look.size)),
      ...(ownColour.checked ? { color: colour.value } : {}),
    });

    const preview = el('div', 'slide-refs-preview');
    preview.setAttribute('aria-label', 'How the lines look');
    const showPreview = () => {
      const refs = new Map(input.refs().map((r) => [r.id, r]));
      const l = look();
      const ids = order.filter((id) => ticked.has(id) && refs.has(id));
      const labels = input.labels(ids, l);
      const lines = ids.map((id, k) => {
        const p = el('p');
        pieces(p, slideRefPieces(refs.get(id)!, l.form, input.format()));
        if (labels[k]) p.prepend(`${labels[k]} `);
        return p;
      });
      preview.replaceChildren(...(lines.length ? lines : [el('p', 'muted', 'Tick references to show them at the foot of the slide.')]));
      preview.style.color = l.color ?? input.footerColor;
      preview.style.textAlign = l.place === 'bottom-centre' ? 'center' : l.place.endsWith('right') ? 'right' : 'left';
    };

    const fillList = () => {
      const refs = input.refs();
      const known = new Set(refs.map((r) => r.id));
      order = order.filter((id) => known.has(id));
      for (const id of [...ticked]) if (!known.has(id)) ticked.delete(id);
      list.replaceChildren(...refs.map((r) => {
        const l = el('label', 'slide-refs-row');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = ticked.has(r.id);
        box.addEventListener('change', () => {
          if (box.checked) { ticked.add(r.id); if (!order.includes(r.id)) order.push(r.id); } else ticked.delete(r.id);
          showPreview();
        });
        const text = el('span');
        pieces(text, slideRefPieces(r, 'author', input.format()));
        text.title = shortLabel(r) + (r.title ? ` — ${r.title}` : '');
        l.append(box, text);
        return l;
      }));
      if (!refs.length) list.append(el('p', 'muted', 'This presentation has no references yet. Add them with Manage References (by DOI, by hand, from a BibTeX or RIS file, or copied from another open file).'));
      showPreview();
    };

    const manage = el('button', '', 'Manage References…');
    manage.type = 'button';
    manage.title = 'The References window: add references to this presentation, or copy them from another open file';
    manage.addEventListener('click', () => {
      d.close();
      void input.manage().then(() => { fillList(); showDialog(d); });
    });
    form.addEventListener('input', showPreview);
    form.addEventListener('change', showPreview);

    const note = el('p', 'muted small', `Ticks are for the ${input.picked > 1 ? `${input.picked} slides picked` : 'slide being edited'}. Apply gives ${input.picked > 1 ? 'them' : 'it'} this look of its own; Apply to All uses the look on every slide. The References slide (Insert > Presentation > References Slide) lists them all.`);
    const buttons = el('p', 'ask-buttons');
    const cancel = el('button', '', 'Cancel');
    cancel.type = 'button';
    const apply = el('button', '', 'Apply');
    apply.type = 'button';
    apply.title = input.picked > 1 ? `The look for the ${input.picked} slides picked only` : 'The look for this slide only';
    const all = el('button', 'primary', 'Apply to All');
    all.type = 'submit';
    all.title = 'The look for every slide (the ticks are for the slides picked)';
    const spacer = el('span', 'spacer');
    buttons.append(manage, spacer, cancel, apply, all);
    form.append(
      el('h2', '', 'References on Slide'),
      list,
      row('Write each as', formSel),
      row('Numbers', numSel),
      row('Place', placeSel),
      row('Size (pt)', size, colourBox),
      el('h3', 'slide-refs-sub', 'On the slide'),
      preview, note, buttons,
    );
    fillList();

    let finished = false;
    const done = (v: SlideRefsResult | null) => {
      if (finished) return;
      finished = true;
      if (d.open) d.close();
      d.remove();
      resolve(v);
    };
    const result = (scope: 'picked' | 'all'): SlideRefsResult => ({ ids: order.filter((id) => ticked.has(id)), look: look(), scope });
    cancel.addEventListener('click', () => done(null));
    apply.addEventListener('click', () => done(result('picked')));
    form.addEventListener('submit', (e) => { e.preventDefault(); done(result('all')); });
    d.addEventListener('cancel', () => done(null));
    d.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(d);
    showDialog(d);
  });
}
