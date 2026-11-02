// The Knowledge Base window (Chemistry > Knowledge Base…, in every mode): reference tables to look
// things up in while working, without a drawing. One search box finds rows by name, CAS number,
// formula or SMILES, and a number typed alone (2.17) finds the chemical shifts near it. Each table
// can be filtered by a column (Solvent, Kind), sorted by any column, and copied to paste into a
// sheet or document. Every abbreviation shows what it means when the mouse rests on it.
//
// Tables you import (a CSV or tab-separated file, or text pasted from a spreadsheet) are kept on
// this computer only, for data you have a copy of but the program can't carry.

import { BUILT_IN_TABLES } from '../kb/data';
import { explainPieces, glossaryEntry } from '../kb/glossary';
import { PRESENT, filterValues, findRows, isCas, parseUserTable, searchedShift, sortRows, tableTsv, type KbColumn, type KbTable, type RowMatch } from '../kb/tables';
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

/** Text with its abbreviations explained on hover (each one an <abbr> with its meaning as the tooltip). */
export function explained(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const p of explainPieces(text)) f.append(p.tip ? el('abbr', { textContent: p.text, title: p.tip }) : p.text);
  return f;
}

/**
 * A cell's text with its abbreviations explained. A short list cell (multiplicities "sept, s")
 * is explained piece by piece, so a lone "s" or "t" gets its tooltip there and nowhere else.
 */
function cellExplained(text: string, list: boolean): DocumentFragment {
  if (!list) return explained(text);
  const f = document.createDocumentFragment();
  for (const part of text.split(/(,\s*)/)) f.append(/^,/.test(part) ? part : explained(part));
  return f;
}

export interface KnowledgeBaseHost {
  flash(msg: string, ms?: number): void;
  /** The canonical SMILES of a structure, or null when it can't be read. */
  canonical(smiles: string): Promise<string | null>;
  /** The tables imported before (JSON), or null. */
  readImported(): Promise<string | null>;
  writeImported(json: string): Promise<void>;
  /** A text file the user picks (CSV or tab-separated), or null. */
  pickTable(): Promise<{ name: string; text: string } | null>;
  copyText(text: string): Promise<void>;
  openUrl(url: string): void;
}

/** Does this look like SMILES rather than a word or number (has ring digits, bonds or brackets)? */
export function looksLikeSmiles(q: string): boolean {
  const s = q.trim();
  if (!s || /\s/.test(s) || isCas(s) || searchedShift(s) !== null) return false;
  return /[=#()[\]@]|[a-z]\d|\d[A-Za-z]/.test(s) && /^[A-Za-z0-9@+\-[\]()=#$/\\%.:*]+$/.test(s);
}

export class KnowledgeBaseWindow {
  private d: HTMLDialogElement | null = null;
  private tables: KbTable[] = [...BUILT_IN_TABLES];
  private current: KbTable = BUILT_IN_TABLES[0];
  private search!: HTMLInputElement;
  private list!: HTMLDivElement;
  private filters!: HTMLDivElement;
  private about!: HTMLParagraphElement;
  private wrap!: HTMLDivElement;
  private sources!: HTMLParagraphElement;
  private count!: HTMLSpanElement;
  private removeBtn!: HTMLButtonElement;
  private picked: Record<string, string> = {};
  private sort: { key: string; down: boolean } | null = null;
  /** Canonical SMILES of each row's structure (worked out once, when a SMILES is first searched). */
  private canon = new Map<string, string | null>();
  /** The canonical form of the SMILES typed, when the search is one. */
  private queryCanon: string | null = null;
  private searchToken = 0;
  private loaded = false;

  constructor(private host: KnowledgeBaseHost) {}

  get isOpen(): boolean { return !!this.d; }

  async open(query = ''): Promise<void> {
    if (!this.loaded) await this.loadImported();
    if (this.d) { if (query) { this.search.value = query; this.searchChanged(); } this.search.focus(); return; }
    const d = (this.d = el('dialog', { className: 'refs-dialog kb-window' }));
    d.setAttribute('aria-label', 'Knowledge Base');
    d.addEventListener('keydown', (e) => { e.stopPropagation(); });
    this.search = el('input', { type: 'search', placeholder: 'Name, CAS, SMILES or a shift (2.17)', title: 'Search every table by name, CAS number, SMILES, any word, or a chemical shift (2.17 finds peaks within 0.05 ppm in 1H, 0.5 in 13C)', value: query });
    this.search.setAttribute('aria-label', 'Search the Knowledge Base');
    this.search.addEventListener('input', () => this.searchChanged());
    this.list = el('div', { className: 'kb-list', role: 'tablist' });
    this.list.setAttribute('aria-label', 'Tables');
    this.filters = el('div', { className: 'refs-filter kb-filters' });
    this.about = el('p', { className: 'muted kb-about' });
    this.wrap = el('div', { className: 'refs-table-wrap kb-table-wrap' });
    this.sources = el('p', { className: 'muted kb-sources' });
    this.count = el('span', { className: 'muted' });
    this.removeBtn = button('Remove Table…', 'Remove the imported table showing (only from this computer)', () => void this.removeImported());
    d.append(
      el('div', { className: 'refs-head' }, el('h2', { textContent: 'Knowledge Base' }), this.search),
      el('div', { className: 'kb-body' },
        this.list,
        el('div', { className: 'kb-main' }, this.about, this.filters, this.wrap, this.sources)),
      el('div', { className: 'refs-buttons' },
        el('span', { className: 'refs-add' },
          button('Import Table…', 'Add a table of your own from a CSV or tab-separated file (or paste one from a spreadsheet). It is kept on this computer only', () => void this.importTable()),
          this.removeBtn),
        el('span', { className: 'refs-edit' },
          this.count,
          button('Copy Table', 'Copy the rows showing, to paste into a sheet, a document table, Word or Excel', () => void this.copy()),
          button('Close', '', () => d.close()))),
    );
    d.addEventListener('close', () => { d.remove(); this.d = null; });
    document.body.append(d);
    this.showList();
    this.showTable();
    d.show();
    this.search.focus();
    if (query) this.searchChanged();
  }

  close(): void { this.d?.close(); }

  /** The tables the window offers now (built in, then imported). */
  get allTables(): KbTable[] { return this.tables; }

  private async loadImported(): Promise<void> {
    this.loaded = true;
    try {
      const text = await this.host.readImported();
      if (!text) return;
      const got = JSON.parse(text) as KbTable[];
      if (!Array.isArray(got)) return;
      for (const t of got) if (t && typeof t.id === 'string' && Array.isArray(t.rows) && Array.isArray(t.columns)) this.tables.push({ ...t, personal: true });
    } catch { /* a damaged file: start without imported tables */ }
  }

  private async saveImported(): Promise<void> {
    await this.host.writeImported(JSON.stringify(this.tables.filter((t) => t.personal), null, 1));
  }

  /** The table list on the left, each with how many rows match the search. */
  private showList(): void {
    const q = this.search.value.trim();
    this.list.replaceChildren(...this.tables.map((t) => {
      const n = q ? this.matches(t, false).length : t.rows.length;
      const b = el('button', { type: 'button', className: `kb-tab${t === this.current ? ' on' : ''}`, title: t.about },
        el('span', { textContent: t.title }), el('span', { className: 'muted', textContent: String(n) }));
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t === this.current));
      if (t.personal) b.classList.add('personal');
      if (q && !n) b.classList.add('none');
      b.addEventListener('click', () => { this.current = t; this.picked = {}; this.sort = null; this.showList(); this.showTable(); });
      return b;
    }));
  }

  private matches(t: KbTable, withFilters = true): RowMatch[] {
    const same = this.queryCanon ? new Set(t.rows.filter((r) => typeof r.smiles === 'string' && this.canon.get(r.smiles) === this.queryCanon).map((r) => r.smiles as string)) : undefined;
    const filters = withFilters ? this.picked : {};
    const found = findRows(t, this.queryCanon ? '' : this.search.value, filters, same).filter((m) => !this.queryCanon || same?.has(m.row.smiles as string));
    // an abbreviation typed (THF, DCM, DMAP) also finds the rows that spell it out
    const full = !this.queryCanon && t.id !== 'glossary' ? glossaryEntry(this.search.value)?.full.replace(/\s*\(.*?\)/g, '').trim() : '';
    if (!full) return found;
    const seen = new Set(found.map((m) => m.row));
    return [...found, ...findRows(t, full, filters).filter((m) => !seen.has(m.row))];
  }

  private searchChanged(): void {
    const q = this.search.value.trim();
    const token = ++this.searchToken;
    this.queryCanon = null;
    if (looksLikeSmiles(q)) void this.smilesSearch(q, token);
    // jump to the first table with matches when the one showing has none
    if (q && !this.matches(this.current).length) {
      const other = this.tables.find((t) => this.matches(t, false).length);
      if (other) { this.current = other; this.picked = {}; }
    }
    this.showList();
    this.showTable();
  }

  /** A SMILES typed: match rows whose structure is the same compound (canonical SMILES equal). */
  private async smilesSearch(q: string, token: number): Promise<void> {
    const c = await this.host.canonical(q);
    if (token !== this.searchToken || !c) return;
    const todo = this.tables.flatMap((t) => t.rows.map((r) => r.smiles)).filter((s): s is string => typeof s === 'string' && !this.canon.has(s));
    for (const s of todo) this.canon.set(s, await this.host.canonical(s));
    if (token !== this.searchToken) return;
    this.queryCanon = c;
    if (!this.matches(this.current).length) {
      const other = this.tables.find((t) => this.matches(t, false).length);
      if (other) { this.current = other; this.picked = {}; }
    }
    this.showList();
    this.showTable();
  }

  private header(c: KbColumn): HTMLTableCellElement {
    const th = el('th', {}, explained(c.label));
    if (c.numeric || c.shift) th.classList.add('num');
    if (c.narrow) th.classList.add('narrow');
    th.title = `Sort by ${c.label}`;
    if (this.sort?.key === c.key) th.append(this.sort.down ? ' ▾' : ' ▴');
    th.addEventListener('click', () => {
      this.sort = this.sort?.key === c.key ? { key: c.key, down: !this.sort.down } : { key: c.key, down: false };
      this.showTable();
    });
    return th;
  }

  private showTable(): void {
    if (!this.d) return;
    const t = this.current;
    this.about.textContent = t.about;
    this.removeBtn.hidden = !t.personal;
    // filter lists
    this.filters.replaceChildren(...t.columns.filter((c) => c.filter).map((c) => {
      const s = el('select', { title: `Show only one ${c.label.toLowerCase()}` });
      s.append(el('option', { value: '', textContent: `All (${c.label})` }));
      if (c.filter === 'present') s.append(el('option', { value: PRESENT, textContent: `With ${c.label.toLowerCase()}` }));
      else s.append(...filterValues(t, c.key).map((v) => el('option', { value: v, textContent: v })));
      s.value = this.picked[c.key] ?? '';
      s.addEventListener('change', () => { this.picked = { ...this.picked, [c.key]: s.value }; this.showTable(); });
      return el('label', {}, el('span', { textContent: c.label }), s);
    }));
    this.filters.hidden = !this.filters.childElementCount;
    let rows = this.matches(t);
    const sortCol = this.sort && t.columns.find((c) => c.key === this.sort!.key);
    if (sortCol) rows = sortRows(rows, sortCol, this.sort!.down);
    const shown = rows.slice(0, 2000);
    const body = el('tbody');
    for (const m of shown) {
      const tr = el('tr');
      for (const c of t.columns) {
        const v = m.row[c.key];
        const td = el('td');
        if (c.numeric || c.shift) td.className = 'num';
        if (c.narrow) td.classList.add('narrow');
        if (c.key === 'cas') td.classList.add('cas');
        if (v !== null && v !== undefined && v !== '') td.append(typeof v === 'number' ? String(v) : cellExplained(v, !!c.narrow));
        tr.append(td);
      }
      if (t.links) {
        const td = el('td', { className: 'kb-links' });
        t.links(m.row).forEach((l, i) => {
          if (i) td.append(' · ');
          const a = el('a', { href: l.url ?? '#', textContent: l.label });
          a.addEventListener('click', (e) => { e.preventDefault(); if (l.url) this.host.openUrl(l.url); });
          td.append(a);
        });
        tr.append(td);
      }
      body.append(tr);
    }
    const table = el('table', { className: 'refs-table kb-table' }, el('thead', {}, el('tr', {}, ...t.columns.map((c) => this.header(c)), ...(t.links ? [el('th', { textContent: 'Look up' })] : []))), body);
    if (!rows.length) {
      const q = this.search.value.trim();
      this.wrap.replaceChildren(el('p', { className: 'muted kb-empty', textContent: q ? `Nothing in ${t.title} matches “${q}”.` : 'This table is empty.' }));
    } else this.wrap.replaceChildren(table);
    this.count.textContent = rows.length === t.rows.length ? `${t.rows.length} rows` : `${rows.length} of ${t.rows.length} rows`;
    // sources, each a link when it has one
    this.sources.replaceChildren(t.sources.length > 1 ? 'Sources: ' : 'Source: ');
    t.sources.forEach((s, i) => {
      if (i) this.sources.append('; ');
      if (s.url) {
        const a = el('a', { href: s.url, textContent: s.label });
        a.addEventListener('click', (e) => { e.preventDefault(); this.host.openUrl(s.url!); });
        this.sources.append(a);
      } else this.sources.append(s.label);
    });
  }

  private async copy(): Promise<void> {
    const rows = this.matches(this.current);
    await this.host.copyText(tableTsv(this.current, rows));
    this.host.flash(`Copied ${rows.length} row${rows.length === 1 ? '' : 's'} of ${this.current.title}: paste into a sheet or a table.`);
  }

  private async importTable(): Promise<void> {
    const how = await ask('Import Table', [
      { name: 'title', label: 'Name', value: '', placeholder: 'NMR impurities (my copy)' },
      { name: 'paste', label: 'Or paste the table', value: '', type: 'textarea', placeholder: 'Columns separated by tabs or commas; the first line names them', help: 'Leave this empty to pick a CSV or tab-separated file. Columns named 1H or 13C (ppm) are searched as chemical shifts.' },
    ], { ok: 'Import', note: 'A table of your own, kept on this computer only and never shared with the program. The first line names the columns.' });
    if (!how) return;
    let text = how.paste.trim(), name = how.title.trim();
    if (!text) {
      const f = await this.host.pickTable();
      if (!f) return;
      text = f.text;
      if (!name) name = f.name.replace(/\.[^.]+$/, '');
    }
    const id = `user-${Date.now().toString(36)}`;
    const t = parseUserTable(text, name || 'My table', id);
    if (!t) { this.host.flash('That table couldn\'t be read: the first line should name the columns, separated by tabs or commas.'); return; }
    this.tables.push(t);
    await this.saveImported();
    this.current = t;
    this.picked = {};
    this.sort = null;
    this.showList();
    this.showTable();
    this.host.flash(`Imported ${t.rows.length} rows into ${t.title}.`);
  }

  private async removeImported(): Promise<void> {
    const t = this.current;
    if (!t.personal) return;
    const ok = await ask('Remove Table', [], { ok: 'Remove', note: `Remove ${t.title} (${t.rows.length} rows) from this computer? The file it came from is not changed.` });
    if (!ok) return;
    this.tables = this.tables.filter((x) => x !== t);
    await this.saveImported();
    this.current = this.tables[0];
    this.showList();
    this.showTable();
  }
}
