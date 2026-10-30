// Insert > Reference… (a canvas, a slide or a design): references from any open file (or one
// looked up by its DOI) put on the drawing as formatted text, in a citation style and form
// picked here: full, short (journal, year, volume, page) or the first author and the short form,
// numbered or not. The text is ordinary text afterwards, to move and edit.

import { CITE_PRESETS, citeFormat, preferredStyle } from '../document/cite-styles';
import { describe, shortLabel, type Reference } from '../document/references';
import { REF_FORMS, referenceRuns, type RefForm } from '../deck/slide-refs';
import { showDialog } from './dialog-host';

export interface RefGroup { name: string; refs: Reference[]; style?: string }

export interface InsertRefsResult { refs: Reference[]; form: RefForm; style: string; numbered: boolean }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** Choose references to insert, and how they are written. `byDoi` looks one up when asked (null when cancelled). */
export function chooseRefsToInsert(groups: RefGroup[], byDoi: () => Promise<Reference | null>, manage: () => Promise<RefGroup[]>): Promise<InsertRefsResult | null> {
  return new Promise((resolve) => {
    const d = el('dialog', 'ask insert-refs-dialog');
    const form = el('form');
    form.method = 'dialog';
    d.append(form);
    const picked: Reference[] = [];
    const extra: Reference[] = [];
    const list = el('div', 'slide-refs-list');
    const styleSel = el('select');
    for (const [k, p] of Object.entries(CITE_PRESETS)) styleSel.add(new Option(`${p.name} (${p.journals})`, k));
    styleSel.value = preferredStyle().style;
    const formSel = el('select');
    for (const [k, v] of Object.entries(REF_FORMS)) formSel.add(new Option(v, k));
    formSel.value = 'full';
    const numbered = el('input');
    numbered.type = 'checkbox';
    const preview = el('div', 'slide-refs-preview');
    const show = () => {
      const f = citeFormat(styleSel.value, styleSel.value === preferredStyle().style ? preferredStyle().options : undefined);
      const runs = referenceRuns(picked, formSel.value as RefForm, f, numbered.checked);
      const p = el('p');
      for (const r of runs) {
        if (r.text === '\n') { p.append(el('br')); continue; }
        let n: Node = document.createTextNode(r.text);
        if (r.italic) { const i = el('i'); i.append(n); n = i; }
        if (r.bold) { const b = el('b'); b.append(n); n = b; }
        p.append(n);
      }
      preview.replaceChildren(picked.length ? p : el('p', 'muted', 'Tick the references to insert.'));
      ok.disabled = !picked.length;
    };
    const fill = (gs: RefGroup[]) => {
      const kids: HTMLElement[] = [];
      const all = [...gs, ...(extra.length ? [{ name: 'Looked up by DOI', refs: extra }] : [])];
      for (const g of all) {
        kids.push(el('h3', 'slide-refs-sub', g.name));
        for (const r of g.refs) {
          const l = el('label', 'slide-refs-row');
          const box = el('input');
          box.type = 'checkbox';
          box.checked = picked.includes(r);
          box.addEventListener('change', () => {
            const i = picked.indexOf(r);
            if (box.checked && i < 0) picked.push(r); else if (!box.checked && i >= 0) picked.splice(i, 1);
            if (box.checked && g.style && g.style in CITE_PRESETS && picked.length === 1) styleSel.value = g.style;
            show();
          });
          l.append(box, el('span', '', describe(r)));
          l.title = shortLabel(r);
          kids.push(l);
        }
        if (!g.refs.length) kids.push(el('p', 'muted small', 'No references.'));
      }
      if (!all.length) kids.push(el('p', 'muted', 'No open document or presentation has references. Look one up by its DOI, or add references with Manage References.'));
      list.replaceChildren(...kids);
      show();
    };
    const doi = el('button', '', 'By DOI…');
    doi.type = 'button';
    doi.title = 'Look a reference up on Crossref by its DOI (needs the internet) and insert it';
    doi.addEventListener('click', () => {
      d.close();
      void byDoi().then((r) => {
        if (r) { extra.push(r); picked.push(r); }
        fill(groups);
        showDialog(d);
      });
    });
    const manageBtn = el('button', '', 'Manage References…');
    manageBtn.type = 'button';
    manageBtn.addEventListener('click', () => {
      d.close();
      void manage().then((gs) => { groups = gs; fill(gs); showDialog(d); });
    });
    const row = (label: string, ...kids: HTMLElement[]) => { const l = el('label', 'ask-row'); l.append(el('span', '', label), ...kids); return l; };
    const numRow = el('label', 'hf-check');
    numRow.append(numbered, ' Number them');
    const buttons = el('p', 'ask-buttons');
    const cancel = el('button', '', 'Cancel');
    cancel.type = 'button';
    const ok = el('button', 'primary', 'Insert');
    ok.type = 'submit';
    buttons.append(doi, manageBtn, el('span', 'spacer'), cancel, ok);
    form.append(
      el('h2', '', 'Insert Reference'),
      el('p', 'muted', 'References from the open files, put here as formatted text in the style picked. Tick them in the order you want them.'),
      list, row('Style', styleSel), row('Write each as', formSel), numRow, preview, buttons,
    );
    form.addEventListener('change', show);
    fill(groups);
    let finished = false;
    const done = (v: InsertRefsResult | null) => {
      if (finished) return;
      finished = true;
      if (d.open) d.close();
      d.remove();
      resolve(v);
    };
    cancel.addEventListener('click', () => done(null));
    form.addEventListener('submit', (e) => { e.preventDefault(); if (picked.length) done({ refs: [...picked], form: formSel.value as RefForm, style: styleSel.value, numbered: numbered.checked }); });
    d.addEventListener('cancel', () => done(null));
    d.addEventListener('keydown', (e) => e.stopPropagation());
    document.body.append(d);
    showDialog(d);
  });
}
