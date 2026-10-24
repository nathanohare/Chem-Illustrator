// The review screen File > Import > From PDF and From Picture share: each picture found, beside
// the structure read from it, its SMILES and anything to look at closely. Ticked ones are placed.
// Reading happens while the window is open, one picture after another; a structure can be read
// again with the person's AI model (when linked), or its SMILES typed in.

import type { ReadResult } from '../recognise/reader';
import type { Checked } from '../recognise/check';
import type { Pixels } from '../recognise/picture';
import { recordPicture, pictureSvg } from '../render/picture';

export interface FoundPicture {
  /** Where it was found: "Page 3", or the file's name. */
  where: string;
  pixels: Pixels;
}

export interface ReviewOptions {
  title: string;
  note: string;
  found: FoundPicture[];
  read: (p: Pixels) => Promise<ReadResult>;
  /** The other reader (the linked AI model, or the one on this computer), and its name; absent when there's none. */
  alt?: { name: string; read: (p: Pixels) => Promise<ReadResult>; sends: boolean };
  check: (r: ReadResult) => Promise<Checked>;
  /** SMILES typed in, as a result. */
  typed: (smiles: string) => ReadResult;
  /** Tick doubtful ones too (a single picture); a PDF's are left for the person to tick. */
  tickDoubtful: boolean;
  place: (chosen: { result: ReadResult; checked: Checked }[]) => void;
}

interface Row {
  found: FoundPicture;
  result?: ReadResult;
  checked?: Checked;
  el: HTMLElement;
  tick: HTMLInputElement;
  out: HTMLElement;
  smiles: HTMLInputElement;
  notes: HTMLElement;
  aiButton?: HTMLButtonElement;
}

export function pixelsCanvas(p: Pixels): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = p.width;
  c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return c;
}

/** The picture as a PNG, base64 (for an AI model). */
export function pixelsPng(p: Pixels): string {
  return pixelsCanvas(p).toDataURL('image/png').split(',')[1];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

export function openReview(o: ReviewOptions): void {
  const d = el('dialog', { className: 'ask import-review' });
  const status = el('p', { className: 'muted import-status' });
  status.setAttribute('role', 'status');
  const list = el('div', { className: 'import-list' });
  const place = el('button', { type: 'button', className: 'primary', textContent: 'Place' });
  const cancel = el('button', { type: 'button', textContent: 'Cancel' });
  const sends = o.alt?.sends ? 'Sends the pictures to the AI model you linked (Edit > Settings > AI Model)' : 'Reads them on this computer';
  const aiAll = o.alt ? el('button', { type: 'button', textContent: `Read Doubtful Ones with ${o.alt.name}`, title: sends }) : null;
  const all = el('button', { type: 'button', textContent: 'Tick All' });
  const none = el('button', { type: 'button', textContent: 'Tick None' });
  d.append(el('h2', { textContent: o.title }), el('p', { className: 'muted', textContent: o.note }), status, list,
    el('p', { className: 'ask-buttons' }, all, none, ...(aiAll ? [aiAll] : []), el('span', { className: 'grow' }), cancel, place));

  let closed = false;
  const close = () => { closed = true; if (d.open) d.close(); d.remove(); };
  const rows: Row[] = o.found.map((found) => {
    const img = pixelsCanvas(found.pixels);
    img.className = 'import-picture';
    const tick = el('input', { type: 'checkbox', title: 'Place this structure' });
    tick.disabled = true;
    const out = el('div', { className: 'import-result', textContent: 'Waiting…' });
    const smiles = el('input', { type: 'text', className: 'import-smiles', placeholder: 'SMILES', spellcheck: false, title: 'Type a correction as SMILES and press Enter' });
    smiles.setAttribute('aria-label', 'SMILES');
    const notes = el('div', { className: 'import-notes' });
    const row: Row = { found, el: el('div', { className: 'import-row' }), tick, out, smiles, notes };
    const side = el('div', { className: 'import-side' }, el('div', { className: 'import-where', textContent: found.where }), smiles, notes);
    if (o.alt) {
      row.aiButton = el('button', { type: 'button', textContent: `Read with ${o.alt.name}`, title: sends });
      row.aiButton.addEventListener('click', () => void readRow(row, o.alt!.read));
      side.append(row.aiButton);
    }
    row.el.append(tick, img, out, side);
    tick.addEventListener('change', count);
    smiles.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const t = smiles.value.trim();
      if (t && t !== row.checked?.smiles) void show(row, o.typed(t), true);
    });
    list.append(row.el);
    return row;
  });

  function count(): void {
    const n = rows.filter((r) => r.tick.checked).length;
    place.textContent = n === 1 ? 'Place 1 Structure' : `Place ${n} Structures`;
    place.disabled = n === 0;
  }

  async function show(row: Row, result: ReadResult, tickIt: boolean): Promise<void> {
    row.out.textContent = 'Checking…';
    const checked = await o.check(result);
    if (closed) return;
    row.result = result;
    row.checked = checked;
    row.out.textContent = '';
    const pic = checked.doc.atoms.size ? recordPicture(checked.doc, 4) : null;
    if (pic) row.out.append(el('img', { className: 'import-structure', alt: checked.smiles ?? 'Structure read', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pictureSvg(pic)) }));
    else row.out.textContent = 'Nothing read';
    row.smiles.value = checked.smiles ?? '';
    row.notes.textContent = '';
    for (const p of checked.problems) row.notes.append(el('div', { className: 'import-problem', textContent: '⚠ ' + p }));
    row.el.classList.toggle('doubtful', checked.problems.length > 0);
    const usable = checked.doc.atoms.size > 0 && checked.smiles !== null;
    row.tick.disabled = !checked.doc.atoms.size;
    row.tick.checked = usable && (tickIt || o.tickDoubtful || checked.problems.length === 0);
    count();
  }

  async function readRow(row: Row, read: (p: Pixels) => Promise<ReadResult>): Promise<void> {
    row.out.textContent = 'Reading…';
    if (row.aiButton) row.aiButton.disabled = true;
    try {
      const r = await read(row.found.pixels);
      if (!closed) await show(row, r, read === o.alt?.read);
    } catch (e) {
      if (!closed) { row.out.textContent = 'Not read'; row.notes.textContent = '⚠ ' + (e instanceof Error ? e.message : String(e)); }
    } finally {
      if (row.aiButton) row.aiButton.disabled = false;
    }
  }

  place.addEventListener('click', () => {
    const chosen = rows.filter((r) => r.tick.checked && r.result && r.checked).map((r) => ({ result: r.result!, checked: r.checked! }));
    close();
    if (chosen.length) o.place(chosen);
  });
  cancel.addEventListener('click', close);
  d.addEventListener('close', () => { closed = true; d.remove(); });
  all.addEventListener('click', () => { for (const r of rows) if (!r.tick.disabled) r.tick.checked = true; count(); });
  none.addEventListener('click', () => { for (const r of rows) r.tick.checked = false; count(); });
  aiAll?.addEventListener('click', async () => {
    aiAll.disabled = true;
    for (const r of rows) if (!closed && r.checked && r.checked.problems.length) await readRow(r, o.alt!.read);
    aiAll.disabled = false;
  });
  count();
  document.body.append(d);
  d.showModal();

  void (async () => {
    let i = 0;
    for (const row of rows) {
      if (closed) return;
      status.textContent = `Reading ${++i} of ${rows.length}…`;
      if (!row.result) await readRow(row, o.read);
    }
    if (!closed) {
      const doubtful = rows.filter((r) => r.checked?.problems.length).length;
      status.textContent = `Read ${rows.length} ${rows.length === 1 ? 'picture' : 'pictures'}.` + (doubtful ? ` ${doubtful} marked ⚠ need a closer look.` : '');
    }
  })();
}
