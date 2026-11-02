// The Compound Library window (Chemistry > Compound Library, Insert > Compound from Library):
// your own compounds, kept between sessions and shared by every file: each one's number,
// structure, names, notes and tags, and the files it appears in (noted as files are saved and
// opened). Add the structures selected, or a name or SMILES, or every numbered structure in the
// file showing, or an SD file; find one by number, name, formula or tag, or by a drawn
// substructure; insert it into the drawing, slide, document or cell showing, as it was drawn.

import {
  compoundBySmiles, compoundText, compoundTitle, newId, parseTags, tagsOf,
  type LibCompound, type LibraryData,
} from '../library/library';
import type { Library } from '../library/library-store';
import type { Contents } from '../model';
import { ask } from './ask';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

const button = (label: string, title: string, on: () => void, primary = false): HTMLButtonElement => {
  const b = el('button', { type: 'button', textContent: label, title });
  if (primary) b.className = 'primary';
  b.addEventListener('click', on);
  return b;
};

/** A structure ready to keep: what the chemistry engine made of it, and how it was drawn. */
export interface StructureIn {
  molfile: string;
  smiles: string;
  formula: string;
  mw: number;
  drawing?: Contents;
  /** Its compound number in the file, when it has one. */
  label?: string;
  /** Its name, when it came from one. */
  name?: string;
  /** Its CAS RN, when it came from one. */
  cas?: string;
}

export interface CompoundLibraryHost {
  flash(msg: string, ms?: number): void;
  /** The structures selected in the file showing; a string says why there are none. */
  selected(): Promise<StructureIn[] | string>;
  /** Every structure with a compound number in the file showing; a string says why there are none. */
  numbered(): Promise<StructureIn[] | string>;
  /** A structure from a name or SMILES (with the name as its name, when it was one). */
  fromText(text: string): Promise<StructureIn | { error: string }>;
  /** Structures from molfiles (an SD file's records). */
  fromMolfiles(molfiles: string[]): Promise<(StructureIn | null)[]>;
  /** Put a compound into the file showing (with its number under it on a drawing or slide). Returns a message, or '' when done. */
  insert(c: LibCompound): string;
  /** What Insert puts it in ("the drawing", "the cell B4"), or null when it can't (nothing that takes a structure is showing). */
  insertsInto(): string | null;
  /** A picture of a compound (a data: URL), or null. */
  picture(c: LibCompound): string | null;
  /** Which of these SMILES contain the query. */
  contains(query: string, smiles: string[]): Promise<(boolean | null)[]>;
  /** Open a file it appears in, at it when it can. */
  openFile(path: string, c: LibCompound): Promise<void>;
  /** Search a folder for files with this compound in (File > Find Structure in Files), desktop app only. */
  findInFiles?(c: LibCompound): void;
  pickSdf(): Promise<{ name: string; text: string } | null>;
  saveSdf(name: string, text: string): Promise<void>;
  /** The file showing's path or name (to say which file a structure was added from). */
  fileName(): string;
  /** Library Location… */
  location(): Promise<void>;
}

/** Compare compound numbers as a reader would: 2 before 10, 3a before 3b, S1 after 12. */
export function compareLabels(a: string, b: string): number {
  if (!a !== !b) return a ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** A compound new to the library, from a structure. */
export function newCompound(s: StructureIn, taken: Iterable<string>, now = Date.now()): LibCompound {
  return {
    id: newId('c', taken), label: s.label ?? '', name: s.name ?? '', synonyms: [], smiles: s.smiles, molfile: s.molfile,
    ...(s.drawing ? { drawing: s.drawing } : {}),
    formula: s.formula, mw: s.mw, cas: s.cas ?? '', notes: '', tags: [], collections: [], files: [], added: now, modified: now,
  };
}

/**
 * Add structures to the library: one already there (the same structure) is left as it is, but
 * takes the number or name given when it had none. Gives what was added and what was there.
 */
export function addStructures(lib: LibraryData, list: StructureIn[], from: string, now = Date.now()): { lib: LibraryData; added: LibCompound[]; known: LibCompound[] } {
  const compounds = lib.compounds.slice();
  const added: LibCompound[] = [], known: LibCompound[] = [];
  let filled = false;
  for (const s of list) {
    if (!s.smiles) continue;
    const had = compoundBySmiles({ ...lib, compounds }, s.smiles);
    if (had) {
      const fill = (!had.label && s.label) || (!had.name && s.name);
      const next = fill ? { ...had, label: had.label || s.label || '', name: had.name || s.name || '', modified: now } : had;
      if (fill) { compounds[compounds.indexOf(had)] = next; filled = true; }
      known.push(next);
      continue;
    }
    const c = newCompound(s, compounds.map((x) => x.id), now);
    if (from) c.files = [{ path: from, seen: now, ...(s.label ? { label: s.label } : {}) }];
    compounds.push(c);
    added.push(c);
  }
  return { lib: added.length || filled ? { ...lib, compounds } : lib, added, known };
}

/** One SD file record for a compound: its structure, with its number, names and notes as data items. */
export function compoundSdf(c: LibCompound): string {
  const lines = c.molfile.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  lines[0] = c.label || c.name || '';
  const item = (k: string, v: string) => (v.trim() ? `> <${k}>\n${v.trim().replace(/\n\s*\n/g, '\n')}\n\n` : '');
  return `${lines.join('\n')}\n${item('ID', c.label)}${item('Name', c.name)}${item('Synonyms', c.synonyms.join('\n'))}${item('CAS', c.cas)}${item('SMILES', c.smiles)}${item('Formula', c.formula)}${item('MW', c.mw ? c.mw.toFixed(2) : '')}${item('Tags', c.tags.join(', '))}${item('Notes', c.notes)}$$$$\n`;
}

/** A path's file name. */
const fileOf = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);

export class CompoundLibraryWindow {
  private d: HTMLDialogElement | null = null;
  private body!: HTMLTableSectionElement;
  private search!: HTMLInputElement;
  private tagSel!: HTMLSelectElement;
  private queryNote!: HTMLElement;
  private problem!: HTMLElement;
  private count!: HTMLElement;
  private insertBtn!: HTMLButtonElement;
  private selected = new Set<string>();
  private anchor: string | null = null;
  /** A drawn structure the list is cut down to (compounds containing it): its SMILES, and the ids that match. */
  private query: { smiles: string; ids: Set<string> } | null = null;
  private tag = '';
  private pictures = new Map<string, string | null>();
  private off: (() => void) | null = null;

  constructor(private lib: Library, private host: CompoundLibraryHost) {}

  get isOpen(): boolean { return !!this.d; }

  async open(select: string[] = []): Promise<void> {
    await this.lib.load();
    if (this.d) { this.selected = new Set(select.length ? select : this.selected); this.fill(); return; }
    this.selected = new Set(select);
    this.anchor = select[0] ?? null;
    const d = (this.d = el('dialog', { className: 'refs-dialog compound-library' }));
    d.setAttribute('aria-label', 'Compound Library');
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' && this.selected.size) { e.preventDefault(); void this.remove(); }
      else if (e.key === 'Enter' && this.selected.size) { e.preventDefault(); this.insert(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.step(e.key === 'ArrowDown' ? 1 : -1); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); this.selected = new Set(this.shown().map((c) => c.id)); this.fill(); }
    });
    this.search = el('input', { type: 'search', placeholder: 'Find by number, name, formula, CAS, tag or note' });
    this.search.setAttribute('aria-label', 'Find a compound');
    this.search.addEventListener('input', () => this.fill());
    this.tagSel = el('select', { title: 'Show the compounds with one tag' });
    this.tagSel.setAttribute('aria-label', 'Tag');
    this.tagSel.addEventListener('change', () => { this.tag = this.tagSel.value; this.fill(); });
    this.queryNote = el('span', { className: 'muted' });
    this.problem = el('p', { className: 'refs-warning', role: 'status' });
    this.count = el('span', { className: 'muted' });
    this.body = el('tbody');
    const table = el('table', { className: 'refs-table compound-table' },
      el('thead', {}, el('tr', {}, ...['Structure', 'Number', 'Name', 'Formula', 'MW', 'Files'].map((h) => el('th', { textContent: h })))), this.body);
    // (a double-click is told by the click's count: the list is made again after the first click)
    this.body.addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr?.dataset.id) return;
      if (e.detail === 2) { this.pick(tr.dataset.id, false, false); void this.edit(); }
      else if (e.detail < 2) this.pick(tr.dataset.id, e.ctrlKey || e.metaKey, e.shiftKey);
    });
    this.insertBtn = button('Insert', 'Put the compound picked into the file showing, as it was drawn (Enter)', () => this.insert(), true);
    d.append(
      el('div', { className: 'refs-head' }, el('h2', { textContent: 'Compound Library' }), this.search),
      el('p', { className: 'muted', textContent: 'Your own compounds, kept between sessions and shared by every file: each one\'s number, structure, names and notes, and the files it appears in (noted as files are saved and opened). Insert puts one into the drawing, slide, document or cell showing.' }),
      el('div', { className: 'refs-filter' }, el('span', { textContent: 'Show' }), this.tagSel,
        el('span', { className: 'compound-query' },
          button('Contains Drawn Structure', 'Show only the compounds that contain the structure selected in the drawing (a substructure search)', () => void this.findDrawn()),
          button('Show All', 'Show every compound again', () => { this.query = null; this.fill(); }),
          this.queryNote)),
      this.problem,
      el('div', { className: 'refs-table-wrap' }, table),
      el('div', { className: 'refs-buttons' },
        el('span', { className: 'refs-add' },
          button('Add Selected', 'Keep the structures selected in the drawing (or the cell or figure picked), with the numbers under them', () => void this.addSelected()),
          button('Add by Name or SMILES…', 'A systematic or common name, or a SMILES string', () => void this.addByText()),
          button('Add Numbered from File', 'Keep every structure with a compound number in the file showing', () => void this.addNumbered()),
          button('Import SD File…', 'Compounds from an SD file (each record\'s title or ID becomes its number)', () => void this.importSdf()),
          button('Export SD File…', 'The compounds picked (or all of them) as an SD file, with their numbers, names and notes', () => void this.exportSdf())),
        el('span', { className: 'refs-edit' },
          this.count,
          button('Edit…', 'The number, names, CAS number, tags and notes of the compound picked, and the files it appears in (or double-click it)', () => void this.edit()),
          ...(this.host.findInFiles ? [button('Find in Files…', 'Search a folder for files with the compound picked in', () => { const c = this.current(); if (c) this.host.findInFiles!(c); else this.host.flash('Click a compound first.'); })] : []),
          button('Delete…', 'Delete the compounds picked from your library (the files they are in are not changed)', () => void this.remove()),
          this.insertBtn,
          button('Location…', 'Where your library is kept: on this computer, or in a folder such as OneDrive to use it on other computers or share it', () => void this.host.location()),
          button('Close', '', () => d.close()))),
    );
    d.addEventListener('close', () => { d.remove(); this.d = null; this.off?.(); this.off = null; });
    this.off = this.lib.onChange(() => this.fill());
    document.body.append(d);
    this.fill();
    d.showModal();
    this.search.focus();
  }

  /** The compounds the list shows, in its order. */
  private shown(): LibCompound[] {
    const q = this.search.value.trim().toLowerCase();
    return this.lib.now.compounds
      .filter((c) => (!q || compoundText(c).includes(q)) && (!this.tag || c.tags.includes(this.tag)) && (!this.query || this.query.ids.has(c.id)))
      .sort((a, b) => compareLabels(a.label, b.label) || a.name.localeCompare(b.name));
  }

  private picture(c: LibCompound): string | null {
    const key = `${c.id}@${c.modified}`;
    if (!this.pictures.has(key)) this.pictures.set(key, this.host.picture(c));
    return this.pictures.get(key)!;
  }

  fill(): void {
    if (!this.d) return;
    const data = this.lib.now;
    const tags = tagsOf(data.compounds);
    if (this.tag && !tags.some(([t]) => t === this.tag)) this.tag = '';
    this.tagSel.replaceChildren(new Option('Any tag', ''), ...tags.map(([t, n]) => new Option(`${t} (${n})`, t)));
    this.tagSel.value = this.tag;
    this.tagSel.disabled = !tags.length;
    const known = new Set(data.compounds.map((c) => c.id));
    for (const id of [...this.selected]) if (!known.has(id)) this.selected.delete(id);
    const list = this.shown();
    const rows = list.map((c) => {
      const src = this.picture(c);
      const img = src ? el('img', { src, alt: c.smiles, className: 'compound-pic' }) : el('span', { className: 'muted', textContent: c.smiles });
      const files = c.files.length ? `${c.files.length} file${c.files.length === 1 ? '' : 's'}` : '';
      const tr = el('tr', {},
        el('td', {}, img),
        el('td', { textContent: c.label }),
        el('td', { textContent: [c.name || c.synonyms[0] || '', c.tags.length ? `#${c.tags.join(' #')}` : ''].filter(Boolean).join('  ') }),
        el('td', { textContent: c.formula }),
        el('td', { textContent: c.mw ? c.mw.toFixed(2) : '' }),
        el('td', { textContent: files }));
      tr.dataset.id = c.id;
      tr.title = [compoundTitle(c), c.smiles, c.notes, ...c.files.slice(0, 8).map((f) => `• ${fileOf(f.path)}${f.label ? ` (as ${f.label})` : ''}`)].filter(Boolean).join('\n');
      if (this.selected.has(c.id)) tr.classList.add('picked');
      return tr;
    });
    if (!data.compounds.length) rows.push(el('tr', {}, el('td', { colSpan: 6, className: 'muted', textContent: 'No compounds yet. Select structures in a drawing and click Add Selected, or add one by name or SMILES, every numbered structure in a file, or an SD file.' })));
    else if (!list.length) rows.push(el('tr', {}, el('td', { colSpan: 6, className: 'muted', textContent: 'No compound matches.' })));
    this.body.replaceChildren(...rows);
    this.body.querySelector('tr.picked')?.scrollIntoView({ block: 'nearest' });
    this.count.textContent = `${data.compounds.length} compound${data.compounds.length === 1 ? '' : 's'}`;
    this.queryNote.textContent = this.query ? `Containing ${this.query.smiles}: ${this.query.ids.size} found.` : '';
    const into = this.host.insertsInto();
    this.insertBtn.disabled = !into || this.selected.size !== 1;
    this.insertBtn.title = into ? `Put the compound picked into ${into}, as it was drawn (Enter)` : 'Show a drawing, slide, document or spreadsheet to insert into';
    this.problem.textContent = this.lib.problem;
    this.problem.hidden = !this.lib.problem;
  }

  private pick(id: string, add: boolean, range: boolean): void {
    const ids = this.shown().map((c) => c.id);
    if (range && this.anchor && ids.includes(this.anchor)) {
      const [a, b] = [ids.indexOf(this.anchor), ids.indexOf(id)].sort((x, y) => x - y);
      if (!add) this.selected.clear();
      for (const x of ids.slice(a, b + 1)) this.selected.add(x);
    } else if (add) {
      if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
      this.anchor = id;
    } else {
      this.selected = new Set([id]);
      this.anchor = id;
    }
    this.fill();
  }

  private step(dir: 1 | -1): void {
    const ids = this.shown().map((c) => c.id);
    if (!ids.length) return;
    const at = this.anchor ? ids.indexOf(this.anchor) : -1;
    this.pick(ids[Math.max(0, Math.min(ids.length - 1, at < 0 ? 0 : at + dir))], false, false);
  }

  private current(): LibCompound | null {
    const id = this.anchor && this.selected.has(this.anchor) ? this.anchor : [...this.selected][0];
    return this.lib.now.compounds.find((c) => c.id === id) ?? null;
  }

  private picked(): LibCompound[] {
    return this.shown().filter((c) => this.selected.has(c.id));
  }

  /** Keep structures; say what was added and what was there already. */
  private keep(list: StructureIn[], from: string): void {
    let res: ReturnType<typeof addStructures> | null = null;
    this.lib.change((l) => (res = addStructures(l, list, from)).lib);
    const r = res as ReturnType<typeof addStructures> | null;
    if (!r) return;
    this.query = null;
    this.selected = new Set([...r.added, ...r.known].map((c) => c.id));
    this.anchor = [...this.selected][0] ?? null;
    this.fill();
    const had = r.known.map((c) => c.label || c.name || c.formula).filter(Boolean);
    this.host.flash(r.added.length
      ? `Added ${r.added.length} compound${r.added.length === 1 ? '' : 's'} to your library.${r.known.length ? ` ${r.known.length} ${r.known.length === 1 ? 'was' : 'were'} there already${had.length ? ` (${had.slice(0, 4).join(', ')})` : ''}.` : ''} Edit… gives ${r.added.length === 1 ? 'it' : 'each'} a name and notes.`
      : `${r.known.length === 1 ? 'This compound is' : 'These compounds are'} in your library already${had.length ? ` (${had.slice(0, 4).join(', ')})` : ''}.`, 7000);
  }

  private async addSelected(): Promise<void> {
    const got = await this.host.selected();
    if (typeof got === 'string') { this.host.flash(got, 7000); return; }
    this.keep(got, this.host.fileName());
  }

  private async addNumbered(): Promise<void> {
    const got = await this.host.numbered();
    if (typeof got === 'string') { this.host.flash(got, 7000); return; }
    this.keep(got, this.host.fileName());
  }

  private async addByText(): Promise<void> {
    const got = await ask('Add by Name or SMILES', [
      { name: 'text', label: 'Name, SMILES or CAS RN', value: '' },
      { name: 'label', label: 'Number', value: '', placeholder: 'its compound number, if it has one' },
    ], { ok: 'Add', note: 'A systematic or common name (4-bromoanisole, caffeine), a SMILES string or a CAS RN (50-78-2). Names are read on this computer; CAS RNs are looked up on PubChem.' });
    if (!got?.text.trim()) return;
    const s = await this.host.fromText(got.text);
    if ('error' in s) { this.host.flash(s.error, 8000); return; }
    this.keep([{ ...s, label: got.label.trim() || undefined }], '');
  }

  private async findDrawn(): Promise<void> {
    const got = await this.host.selected();
    if (typeof got === 'string' || !got.length) { this.host.flash(typeof got === 'string' ? got : 'Select a structure in the drawing to search for.', 7000); return; }
    const q = got[0].smiles;
    const all = this.lib.now.compounds;
    const res = await this.host.contains(q, all.map((c) => c.smiles));
    this.query = { smiles: q, ids: new Set(all.filter((_, i) => res[i]).map((c) => c.id)) };
    this.fill();
  }

  private async importSdf(): Promise<void> {
    const f = await this.host.pickSdf();
    if (!f) return;
    const { parseSdf } = await import('../io/sheet-files');
    const recs = parseSdf(f.text);
    if (!recs.length) { this.host.flash(`No structures were found in ${f.name}.`); return; }
    this.host.flash(`Reading ${recs.length} structure${recs.length === 1 ? '' : 's'}…`, 20000);
    const made = await this.host.fromMolfiles(recs.map((r) => r.molblock));
    const item = (r: (typeof recs)[number], ...keys: string[]) => r.data.find(([k]) => keys.includes(k.toLowerCase()))?.[1].trim() ?? '';
    const list: StructureIn[] = [];
    const extra = new Map<string, { cas: string; notes: string; synonyms: string[] }>();
    recs.forEach((r, i) => {
      const s = made[i];
      if (!s) return;
      const label = item(r, 'id', 'compound', 'compound id', 'number', 'no') || (r.title.length <= 12 ? r.title : '');
      const name = item(r, 'name', 'iupac name', 'common name') || (r.title.length > 12 ? r.title : '');
      list.push({ ...s, label: label || undefined, name: name || undefined });
      extra.set(s.smiles, { cas: item(r, 'cas', 'cas number', 'cas no'), notes: item(r, 'notes', 'comment', 'comments'), synonyms: item(r, 'synonyms').split('\n').map((x) => x.trim()).filter(Boolean) });
    });
    this.keep(list, '');
    // the CAS numbers, notes and other names of those just added
    const now = Date.now();
    this.lib.change((l) => ({ ...l, compounds: l.compounds.map((c) => {
      const x = extra.get(c.smiles);
      if (!x || !this.selected.has(c.id) || c.cas || c.notes || c.synonyms.length) return c;
      return { ...c, cas: x.cas, notes: x.notes, synonyms: x.synonyms, modified: now };
    }) }));
    const bad = made.filter((m) => !m).length;
    if (bad) this.host.flash(`${bad} record${bad === 1 ? '' : 's'} of ${f.name} could not be read as structures and ${bad === 1 ? 'was' : 'were'} left out.`, 7000);
  }

  private async exportSdf(): Promise<void> {
    const list = this.picked().length ? this.picked() : this.shown();
    if (!list.length) { this.host.flash('There are no compounds to export.'); return; }
    await this.host.saveSdf('Compound Library.sdf', list.map(compoundSdf).join(''));
  }

  private insert(): void {
    const c = this.current();
    if (!c) { this.host.flash('Click a compound first.'); return; }
    const msg = this.host.insert(c);
    if (msg) { this.host.flash(msg, 6000); return; }
    this.d?.close();
  }

  private async remove(): Promise<void> {
    const list = this.picked();
    if (!list.length) { this.host.flash('Click a compound first.'); return; }
    const ok = await ask(list.length === 1 ? 'Delete Compound' : 'Delete Compounds', [], { ok: 'Delete', note: `Delete ${list.length === 1 ? compoundTitle(list[0]) : `${list.length} compounds`} from your library? The files ${list.length === 1 ? 'it is' : 'they are'} in are not changed. This can't be undone.` });
    if (!ok) return;
    const ids = new Set(list.map((c) => c.id));
    const now = Date.now();
    this.lib.change((l) => ({ ...l, compounds: l.compounds.filter((c) => !ids.has(c.id)), deleted: { ...l.deleted, ...Object.fromEntries([...ids].map((id) => [id, now])) } }));
    this.selected.clear();
    this.fill();
  }

  /** Edit one compound: its number, names, CAS number, tags and notes; and the files it is in, to open one. */
  private async edit(): Promise<void> {
    const c = this.current();
    if (!c) { this.host.flash('Click a compound first.'); return; }
    const got = await new Promise<Partial<LibCompound> | null>((resolve) => {
      const d = el('dialog', { className: 'ref-edit compound-edit' });
      let finished = false;
      const done = (v: Partial<LibCompound> | null) => { if (finished) return; finished = true; if (d.open) d.close(); d.remove(); resolve(v); };
      d.addEventListener('close', () => done(null));
      d.addEventListener('keydown', (e) => e.stopPropagation());
      const form = el('form');
      const src = this.picture(c);
      form.append(el('h2', { textContent: 'Edit Compound' }));
      if (src) form.append(el('p', {}, el('img', { src, alt: c.smiles, className: 'compound-pic large' })));
      form.append(el('p', { className: 'muted small', textContent: `${c.formula}${c.mw ? `, ${c.mw.toFixed(2)} g/mol` : ''} · ${c.smiles}` }));
      const row = (label: string, input: HTMLElement) => form.append(el('label', { className: 'ask-row ref-row' }, el('span', { textContent: label }), input));
      const text = (label: string, value: string, placeholder = '') => { const i = el('input', { type: 'text', value, placeholder }); row(label, i); return i; };
      const label = text('Number', c.label, '12a, S3');
      label.setAttribute('autofocus', '');
      const name = text('Name', c.name, 'common or systematic');
      const syn = el('textarea', { rows: 2, value: c.synonyms.join('\n'), placeholder: 'one per line: abbreviations, trade names' });
      row('Other names', syn);
      const cas = text('CAS number', c.cas, '64-17-5');
      const tags = text('Tags', c.tags.join(', '), 'separated by commas');
      const notes = el('textarea', { rows: 4, value: c.notes, placeholder: 'notebook page, where it is kept, how it was made…' });
      row('Notes', notes);
      form.append(el('h3', { textContent: c.files.length ? 'Appears in' : 'Appears in no file yet' }));
      if (!c.files.length) form.append(el('p', { className: 'muted small', textContent: 'Files are noted as they are saved or opened with this structure in them.' }));
      const files = el('ul', { className: 'compound-files' });
      for (const f of c.files) {
        const open = button('Open', `Open ${f.path}`, () => { done(null); void this.host.openFile(f.path, c); });
        files.append(el('li', {}, el('span', { textContent: `${fileOf(f.path)}${f.label ? ` (as ${f.label})` : ''}`, title: `${f.path}\nseen ${new Date(f.seen).toLocaleString()}` }), open));
      }
      form.append(files);
      form.append(el('p', { className: 'ask-buttons' }, button('Cancel', '', () => done(null)), el('button', { type: 'submit', className: 'primary', textContent: 'OK' })));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        done({ label: label.value.trim(), name: name.value.trim(), synonyms: syn.value.split('\n').map((x) => x.trim()).filter(Boolean), cas: cas.value.trim(), tags: parseTags(tags.value), notes: notes.value });
      });
      d.append(form);
      document.body.append(d);
      d.showModal();
      label.focus();
    });
    if (!got) return;
    const now = Date.now();
    this.lib.change((l) => ({ ...l, compounds: l.compounds.map((x) => (x.id === c.id ? { ...x, ...got, modified: now } : x)) }));
  }
}
