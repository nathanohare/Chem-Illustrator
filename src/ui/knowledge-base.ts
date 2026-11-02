// The Knowledge Base window (Chemistry > Knowledge Base…, in every mode): reference tables to look
// things up in while working, without a drawing. One search box finds rows by name, CAS number,
// formula or SMILES, and a number typed alone (2.17) finds the chemical shifts near it. Each table
// can be filtered by a column (Solvent, Kind), sorted by any column, and copied to paste into a
// sheet or document. Every abbreviation shows what it means when the mouse rests on it.
//
// Tables you import (a CSV or tab-separated file, or text pasted from a spreadsheet) are kept on
// this computer only, for data you have a copy of but the program can't carry. So are your PDFs
// (a book, papers, SI files): each one's text is read once and searched as a table of pages, with
// an excerpt around the words found, and the file opens from its row.

import { BUILT_IN_TABLES, LATER_ROWS, LATER_TABLES } from '../kb/data';
import type { SafetyRecord } from '../kb/safety';
import { safetyRow, sortSafety } from '../kb/safety-tables';
import { explainPieces, glossaryEntry } from '../kb/glossary';
import { CANONICAL_ROWS, PRESENT, cellShown, filterValues, findRows, isCas, parseUserTable, searchedShift, sortRows, tableTsv, type KbColumn, type KbTable, type RowMatch } from '../kb/tables';
import { pdfTable, type PdfIndex } from '../kb/pdf-library';
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
  /** PDFs the user picks, with where each is on this computer when the app can tell. */
  pickPdfs?(): Promise<{ name: string; bytes: Uint8Array; path?: string }[]>;
  /** The text of each page of a PDF. */
  readPdfPages?(bytes: Uint8Array, progress: (done: number, of: number) => void): Promise<string[]>;
  /** The PDFs read before (each a PdfIndex as JSON). */
  readPdfs?(): Promise<string[]>;
  writePdf?(id: string, json: string): Promise<void>;
  removePdf?(id: string): Promise<void>;
  /** Open a file on this computer in the program that opens it. */
  openFile?(path: string): Promise<void>;
  /** PubChem's compound number for a CAS number (the big tables carry no CAS numbers). */
  cidForCas?(cas: string): Promise<number | null>;
  /** A compound's hazard record read live from PubChem (a name, CAS number or SMILES), or null. */
  lookUpSafety?(query: string): Promise<SafetyRecord | null>;
}

/** An excerpt with the words searched for marked. */
export function marked(text: string, query: string): DocumentFragment {
  const f = document.createDocumentFragment();
  const words = query.trim().toLowerCase().split(/\s+/).filter((w) => w.length > 1).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) { f.append(text); return f; }
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  text.split(re).forEach((part, i) => f.append(i % 2 ? el('mark', { textContent: part }) : part));
  return f;
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
  /** The PubChem compound a CAS number typed belongs to, for rows that carry no CAS number. */
  private casCid: number | null = null;

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
    this.removeBtn = button('Remove Table…', 'Remove the imported table or PDF showing (only from this computer; the file is not changed)', () => void this.removeImported());
    d.append(
      el('div', { className: 'refs-head' }, el('h2', { textContent: 'Knowledge Base' }), this.search),
      el('div', { className: 'kb-body' },
        this.list,
        el('div', { className: 'kb-main' }, this.about, this.filters, this.wrap, this.sources)),
      el('div', { className: 'refs-buttons' },
        el('span', { className: 'refs-add' },
          button('Import Table…', 'Add a table of your own from a CSV or tab-separated file (or paste one from a spreadsheet). It is kept on this computer only', () => void this.importTable()),
          ...(this.host.pickPdfs ? [button('Add PDFs…', 'Search your own PDFs (a book, papers, SI files) here too. Their text is read once and kept on this computer only', () => void this.addPdfs())] : []),
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
    // the big built-in tables go before the glossary, which stays last of the built-in ones
    for (const later of LATER_TABLES) {
      try {
        const t = await later();
        const at = this.tables.findIndex((x) => x.id === 'glossary');
        this.tables.splice(at < 0 ? this.tables.length : at, 0, t);
      } catch { /* not there (offline web build): the window works without it */ }
    }
    // more rows for built-in tables (the big Reagent Safety table), merged in where they belong
    for (const later of LATER_ROWS) {
      try {
        const extra = await later.rows();
        const i = this.tables.findIndex((x) => x.id === later.table);
        if (i < 0) continue;
        const t = this.tables[i];
        const have = new Set(t.rows.map((r) => r.cid));
        const rows = [...t.rows, ...extra.filter((r) => !have.has(r.cid))];
        const merged = { ...t, rows: t.id === 'reagent-safety' ? sortSafety(rows) : rows.sort((a, b) => String(a.name).localeCompare(String(b.name))) };
        this.tables[i] = merged;
        if (this.current === t) this.current = merged;
      } catch { /* not there (offline web build): the window works without it */ }
    }
    try {
      const text = await this.host.readImported();
      if (!text) return;
      const got = JSON.parse(text) as KbTable[];
      if (!Array.isArray(got)) return;
      for (const t of got) if (t && typeof t.id === 'string' && Array.isArray(t.rows) && Array.isArray(t.columns)) this.tables.push({ ...t, personal: true });
    } catch { /* a damaged file: start without imported tables */ }
    finally { await this.loadPdfs(); }
  }

  private async loadPdfs(): Promise<void> {
    const all = await this.host.readPdfs?.().catch(() => [] as string[]) ?? [];
    for (const json of all) {
      try {
        const p = JSON.parse(json) as PdfIndex;
        if (p && typeof p.id === 'string' && Array.isArray(p.pages)) this.tables.push(pdfTable(p));
      } catch { /* a damaged index: leave it out */ }
    }
  }

  private async saveImported(): Promise<void> {
    await this.host.writeImported(JSON.stringify(this.tables.filter((t) => t.personal && !t.pdf), null, 1));
  }

  /** Add PDFs: read each one's text, page by page, and keep it on this computer. */
  private async addPdfs(): Promise<void> {
    const h = this.host;
    if (!h.pickPdfs || !h.readPdfPages || !h.writePdf) return;
    const files = await h.pickPdfs().catch((e) => { h.flash(`Couldn't open the PDFs: ${e}`); return []; });
    let last: KbTable | null = null, added = 0;
    for (const f of files) {
      h.flash(`Reading ${f.name}…`, 60000);
      let pages: string[];
      try {
        pages = await h.readPdfPages(f.bytes, (done, of) => h.flash(`Reading ${f.name}: page ${done} of ${of}…`, 60000));
      } catch (e) {
        h.flash(`${f.name} couldn't be read: ${e}`);
        continue;
      }
      if (!pages.some((p) => p)) { h.flash(`${f.name} has no text to search (a scan without OCR?).`, 6000); continue; }
      const index: PdfIndex = { id: `pdf-${Date.now().toString(36)}${added}`, name: f.name, ...(f.path ? { path: f.path } : {}), added: new Date().toISOString(), pages };
      await h.writePdf(index.id, JSON.stringify(index));
      // the same file added again replaces the copy read before
      const old = this.tables.find((t) => t.pdf && t.title === pdfTable(index).title && t.pdf.path === index.path);
      if (old) { this.tables = this.tables.filter((t) => t !== old); await h.removePdf?.(old.id); }
      last = pdfTable(index);
      this.tables.push(last);
      added++;
    }
    if (!last) return;
    this.current = last;
    this.picked = {};
    this.sort = null;
    this.showList();
    this.showTable();
    h.flash(added === 1 ? `Added ${last.title} (${last.rows.length} pages with text).` : `Added ${added} PDFs.`);
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
    let found = findRows(t, this.queryCanon ? '' : this.search.value, filters, same).filter((m) => !this.queryCanon || same?.has(m.row.smiles as string));
    // a CAS number typed also finds rows without CAS numbers, by the compound PubChem gives it
    if (this.casCid !== null) {
      const seen = new Set(found.map((m) => m.row));
      found = [...found, ...findRows(t, '', filters).filter((m) => m.row.cid === this.casCid && !seen.has(m.row))];
    }
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
    this.casCid = null;
    if (looksLikeSmiles(q)) void this.smilesSearch(q, token);
    if (isCas(q)) void this.casSearch(q, token);
    // jump to the first table with matches when the one showing has none
    if (q && !this.matches(this.current).length) {
      const other = this.tables.find((t) => this.matches(t, false).length);
      if (other) { this.current = other; this.picked = {}; }
    }
    this.showList();
    this.showTable();
  }

  /** A CAS number typed: ask PubChem which compound it is, to find rows that carry no CAS number. */
  private async casSearch(q: string, token: number): Promise<void> {
    const cid = await this.host.cidForCas?.(q).catch(() => null) ?? null;
    if (token !== this.searchToken || cid === null) return;
    this.casCid = cid;
    if (!this.matches(this.current).length) {
      const other = this.tables.find((t) => this.matches(t, false).length);
      if (other) { this.current = other; this.picked = {}; }
    }
    this.showList();
    this.showTable();
  }

  /** Rate a compound that isn't in Reagent Safety, live from PubChem, and add it for this session. */
  private async rateLive(q: string): Promise<void> {
    const h = this.host;
    if (!h.lookUpSafety) return;
    h.flash(`Looking up ${q} on PubChem…`, 30000);
    let r: SafetyRecord | null;
    try {
      r = await h.lookUpSafety(q);
    } catch (e) {
      h.flash(`Couldn't rate ${q}: ${e instanceof Error ? e.message : e}`, 6000);
      return;
    }
    if (!r) { h.flash(`PubChem has no compound called “${q}”. Try another name, the CAS number or a SMILES.`, 6000); return; }
    const i = this.tables.findIndex((t) => t.id === 'reagent-safety');
    if (i < 0) return;
    const t = this.tables[i];
    if (!t.rows.some((x) => x.cid === r.cid)) {
      const row = safetyRow(r);
      row.sources = `Read live from PubChem, ${new Date().toISOString().slice(0, 10)}${row.sources ? '; ' + row.sources : ''}`;
      this.tables[i] = { ...t, rows: sortSafety([...t.rows, row]) };
    }
    this.current = this.tables[i];
    this.picked = {};
    this.search.value = r.name;
    this.searchChanged();
    h.flash(`${r.name}: rated from PubChem's open records. It stays in the table until the program closes.`, 6000);
  }

  /** A SMILES typed: match rows whose structure is the same compound (canonical SMILES equal). */
  private async smilesSearch(q: string, token: number): Promise<void> {
    const c = await this.host.canonical(q);
    if (token !== this.searchToken || !c) return;
    for (const t of this.tables) for (const r of t.rows) if ((t.canonicalSmiles || CANONICAL_ROWS.has(r)) && typeof r.smiles === 'string') this.canon.set(r.smiles, r.smiles);
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
    this.removeBtn.textContent = t.pdf ? 'Remove PDF…' : 'Remove Table…';
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
        if (c.hidden) continue;
        const v = cellShown(m.row, c, this.search.value);
        const td = el('td');
        if (c.numeric || c.shift) td.className = 'num';
        if (c.narrow) td.classList.add('narrow');
        if (c.prose) td.classList.add('prose');
        if (c.key === 'cas') td.classList.add('cas');
        if (c.excerptOf) { td.classList.add('kb-excerpt'); if (v) td.append(marked(String(v), this.search.value)); }
        else if (v !== null && v !== undefined && v !== '') td.append(typeof v === 'number' ? String(v) : cellExplained(v, !!c.narrow));
        tr.append(td);
      }
      if (t.links) {
        const td = el('td', { className: 'kb-links' });
        t.links(m.row).forEach((l, i) => {
          if (i) td.append(' · ');
          const a = el('a', { href: l.url ?? '#', textContent: l.label });
          if (l.path) a.title = l.page ? `Open the PDF (this is page ${l.page})` : 'Open the file';
          a.addEventListener('click', (e) => { e.preventDefault(); void this.follow(l); });
          td.append(a);
        });
        tr.append(td);
      }
      body.append(tr);
    }
    const table = el('table', { className: 'refs-table kb-table' }, el('thead', {}, el('tr', {}, ...t.columns.filter((c) => !c.hidden).map((c) => this.header(c)), ...(t.links ? [el('th', { textContent: 'Look up' })] : []))), body);
    if (!rows.length) {
      const q = this.search.value.trim();
      const empty = el('p', { className: 'muted kb-empty', textContent: q ? `Nothing in ${t.title} matches “${q}”.` : 'This table is empty.' });
      // a compound the table doesn't have can be rated live from PubChem
      const live = q && t.id === 'reagent-safety' && this.host.lookUpSafety && !Object.values(this.picked).some(Boolean)
        ? [button(`Rate “${q.length > 40 ? q.slice(0, 39) + '…' : q}” from PubChem`, 'Look the compound up on PubChem and rate it with the same rules, from the same open sources (needs the internet)', () => void this.rateLive(q))]
        : [];
      this.wrap.replaceChildren(empty, ...live);
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

  /** A row's link: a web page, or one of your files (a PDF opens in its own program, at its first page). */
  private async follow(l: { url?: string; path?: string; page?: number }): Promise<void> {
    if (l.url) { this.host.openUrl(l.url); return; }
    if (!l.path || !this.host.openFile) return;
    try {
      await this.host.openFile(l.path);
      if (l.page) this.host.flash(`Opened the PDF: what you searched for is on page ${l.page}.`, 5000);
    } catch (e) {
      this.host.flash(`Couldn't open ${l.path}: it may have moved. Add it again to search it from its new place. (${e})`, 7000);
    }
  }

  private async copy(): Promise<void> {
    const rows = this.matches(this.current);
    await this.host.copyText(tableTsv(this.current, rows, this.search.value));
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
    const what = t.pdf ? `the searchable text of ${t.title} (${t.rows.length} pages)` : `${t.title} (${t.rows.length} rows)`;
    const ok = await ask(t.pdf ? 'Remove PDF' : 'Remove Table', [], { ok: 'Remove', note: `Remove ${what} from this computer? The file it came from is not changed.` });
    if (!ok) return;
    this.tables = this.tables.filter((x) => x !== t);
    if (t.pdf) await this.host.removePdf?.(t.id);
    else await this.saveImported();
    this.current = this.tables[0];
    this.showList();
    this.showTable();
  }
}
