// The step before reading, for File > Import Structures from PDF: each page as a picture with
// the drawings found on it (found on this computer, nothing sent anywhere) outlined. Click a
// drawing to tick it or tick it off; only the ticked ones are then read, by the AI model or by
// the reader on this computer, so nothing else leaves the computer.

import type { FoundPicture } from './import-review';

/** A page as a small picture, and how its drawings' boxes map onto it. */
export interface PagePreview {
  /** The page number, from 1. */
  n: number;
  /** A picture of the page (an object URL, or a data URL). */
  url: string;
  /** The page's size in the pixels the drawings' boxes are given in. */
  width: number;
  height: number;
}

export interface PickOptions {
  title: string;
  note: string;
  pages: PagePreview[];
  found: FoundPicture[];
  /** The readers to choose from (the first is the one suggested); one or none shows no choice. */
  readers: { value: string; label: string }[];
}

export interface Picked {
  chosen: FoundPicture[];
  reader: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

/** Show the pages and their drawings; resolves with the ticked ones and the reader, or null if cancelled. */
export function pickDrawings(o: PickOptions): Promise<Picked | null> {
  return new Promise((resolve) => {
    const d = el('dialog', { className: 'ask import-pick' });
    const status = el('p', { className: 'muted import-status' });
    status.setAttribute('role', 'status');
    const list = el('div', { className: 'import-pages' });
    const go = el('button', { type: 'button', className: 'primary' });
    const cancel = el('button', { type: 'button', textContent: 'Cancel' });
    const all = el('button', { type: 'button', textContent: 'Tick All' });
    const none = el('button', { type: 'button', textContent: 'Tick None' });
    const reader = el('select', { className: 'import-reader' });
    for (const r of o.readers) reader.append(el('option', { value: r.value, textContent: r.label }));
    const readWith = el('label', { className: 'import-read-with', hidden: o.readers.length < 2 }, 'Read with ', reader);
    d.append(el('h2', { textContent: o.title }), el('p', { className: 'muted', textContent: o.note }), status, list,
      el('p', { className: 'ask-buttons' }, all, none, readWith, el('span', { className: 'grow' }), cancel, go));

    const ticked = new Set<FoundPicture>(o.found);
    const marks = new Map<FoundPicture, HTMLButtonElement>();
    const byPage = new Map<number, FoundPicture[]>();
    for (const f of o.found) if (f.page !== undefined && f.box) byPage.set(f.page, [...(byPage.get(f.page) ?? []), f]);
    for (const p of o.pages) {
      const here = byPage.get(p.n);
      if (!here?.length) continue;
      const sheet = el('div', { className: 'import-page' }, el('img', { src: p.url, alt: `Page ${p.n}`, draggable: false }));
      for (const f of here) {
        const b = f.box!;
        const mark = el('button', { type: 'button', className: 'import-mark', title: f.where });
        mark.setAttribute('aria-label', f.where);
        Object.assign(mark.style, { left: `${(100 * b.x) / p.width}%`, top: `${(100 * b.y) / p.height}%`, width: `${(100 * b.w) / p.width}%`, height: `${(100 * b.h) / p.height}%` });
        mark.addEventListener('click', () => { if (ticked.has(f)) ticked.delete(f); else ticked.add(f); show(); });
        marks.set(f, mark);
        sheet.append(mark);
      }
      list.append(el('div', { className: 'import-page-label', textContent: `Page ${p.n}` }), sheet);
    }

    function show(): void {
      for (const [f, m] of marks) {
        m.classList.toggle('on', ticked.has(f));
        m.setAttribute('aria-pressed', String(ticked.has(f)));
      }
      const n = ticked.size;
      go.textContent = n === 1 ? 'Read 1 Structure' : `Read ${n} Structures`;
      go.disabled = n === 0;
      const pages = new Set(o.found.map((f) => f.page)).size;
      status.textContent = `Found ${o.found.length} ${o.found.length === 1 ? 'drawing' : 'drawings'} on ${pages} ${pages === 1 ? 'page' : 'pages'}; ${n} ticked.`
        + (o.readers.length && reader.value === 'ai' ? ' Only the ticked ones are sent to the AI model.' : '');
    }

    let done = false;
    const finish = (r: Picked | null) => {
      if (done) return;
      done = true;
      if (d.open) d.close();
      d.remove();
      resolve(r);
    };
    go.addEventListener('click', () => finish({ chosen: o.found.filter((f) => ticked.has(f)), reader: reader.value }));
    cancel.addEventListener('click', () => finish(null));
    d.addEventListener('close', () => finish(null));
    all.addEventListener('click', () => { for (const f of o.found) ticked.add(f); show(); });
    none.addEventListener('click', () => { ticked.clear(); show(); });
    reader.addEventListener('change', show);
    show();
    document.body.append(d);
    d.showModal();
  });
}
