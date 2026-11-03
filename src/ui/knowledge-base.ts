// The Knowledge Base window (Chemistry > Knowledge Base…, in every mode): reference tables to look
// things up in while working, without a drawing. One search box finds rows by name, CAS number,
// formula or SMILES, and a number typed alone (2.17) finds the chemical shifts near it. Each table
// can be filtered by a column (Solvent, Kind), sorted by any column, and copied to paste into a
// sheet or document. Every abbreviation shows what it means when the mouse rests on it.
//
// Tables you import (a CSV or tab-separated file, or text pasted from a spreadsheet) are kept on
// this computer only, for data you have a copy of but the program can't carry.

import { BUILT_IN_TABLES, LATER_ROWS, LATER_TABLES } from '../kb/data';
import type { SafetyRecord } from '../kb/safety';
import { safetyRow, sortSafety } from '../kb/safety-tables';
import { explainPieces, glossaryEntry } from '../kb/glossary';
import { CANONICAL_ROWS, PRESENT, filterValues, findRows, isCas, looksLikeSmiles, parseUserTable, sortRows, tableTsv, type KbColumn, type KbTable, type RowMatch } from '../kb/tables';
import { ask } from './ask';
import { infoIcon, setInfo } from './info-tip';
import { templateIcon } from './template-icons';
import { svgNode } from './svg-node';
import { prettyChem } from '../kb/pretty';

/** A structure picture in a table cell, in pixels. */
const PIC = 48;

/** Rows built when a table is shown, and how many more each time it is scrolled near its end. */
const FIRST_ROWS = 60;
const MORE_ROWS = 300;

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
export function explained(text: string, nuclei = false): DocumentFragment {
  const f = document.createDocumentFragment();
  // formulas with real subscripts (CDCl₃), nuclei with superscripts (¹H): shown so, searched as typed
  for (const p of explainPieces(text)) { const t = prettyChem(p.text, nuclei); f.append(p.tip ? el('abbr', { textContent: t, title: p.tip }) : withSigma(t)); }
  return f;
}

/** Text with the m and p of Hammett's σm and σp as italic subscripts. */
function withSigma(text: string): DocumentFragment | string {
  if (!/σ[mpoIR]/.test(text)) return text;
  const f = document.createDocumentFragment();
  for (const part of text.split(/(σ[mpoIR](?![A-Za-z]))/)) {
    if (/^σ[mpoIR]$/.test(part)) f.append('σ', el('sub', {}, el('i', { textContent: part[1] })));
    else if (part) f.append(part);
  }
  return f;
}

/**
 * A cell's text with its abbreviations explained. A short list cell (multiplicities "sept, s")
 * is explained piece by piece, so a lone "s" or "t" gets its tooltip there and nowhere else.
 */
function cellExplained(text: string, list: boolean, nuclei = false): DocumentFragment {
  if (!list) return explained(text, nuclei);
  const f = document.createDocumentFragment();
  for (const part of text.split(/(,\s*)/)) f.append(/^,/.test(part) ? part : explained(part, nuclei));
  return f;
}

/** A table's Solvent filter column (an impurity table's NMR solvent), if it has one. */
function solventColumn(t: KbTable): KbColumn | undefined {
  return t.columns.find((c) => c.filter === true && /^(nmr )?solvent$/i.test(c.label));
}

/** The same NMR solvent under another name: "CDCl3", "Chloroform-d", "cdcl3". */
const SOLVENT_NAMES = [
  ['cdcl3', 'chloroform-d', 'chloroform'], ['acetone-d6', '(cd3)2co', 'acetone'], ['dmso-d6', '(cd3)2so', 'dmso', 'dimethyl sulfoxide-d6'],
  ['cd3cn', 'acetonitrile-d3', 'acetonitrile'], ['cd3od', 'methanol-d4', 'methanol'], ['d2o', 'deuterium oxide'], ['c6d6', 'benzene-d6', 'benzene'],
  ['thf-d8', 'tetrahydrofuran-d8', 'c4d8o'], ['toluene-d8', 'c6d5cd3', 'c7d8'], ['cd2cl2', 'dichloromethane-d2'], ['c5d5n', 'pyridine-d5'],
];
export function matchSolvent(values: string[], wanted: string): string | null {
  const key = (v: string) => { const l = v.trim().toLowerCase(); return SOLVENT_NAMES.find((n) => n.includes(l))?.[0] ?? l; };
  const w = key(wanted);
  return values.find((v) => key(v) === w) ?? null;
}

const NMR_SOLVENT_KEY = 'chem-illustrator.kb.nmrSolvent';
function readNmrSolvent(): string {
  try { return localStorage.getItem(NMR_SOLVENT_KEY) ?? ''; } catch { return ''; }
}
function writeNmrSolvent(v: string): void {
  try { if (v) localStorage.setItem(NMR_SOLVENT_KEY, v); else localStorage.removeItem(NMR_SOLVENT_KEY); } catch { /* not kept */ }
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
  /** PubChem's compound number for a CAS number (the big tables carry no CAS numbers). */
  cidForCas?(cas: string): Promise<number | null>;
  /** A compound's hazard record read live from PubChem (a name, CAS number or SMILES), or null. */
  lookUpSafety?(query: string): Promise<SafetyRecord | null>;
}

export { looksLikeSmiles };

export class KnowledgeBaseWindow {
  private d: HTMLDialogElement | null = null;
  private tables: KbTable[] = [...BUILT_IN_TABLES];
  private current: KbTable = BUILT_IN_TABLES[0];
  private search!: HTMLInputElement;
  private list!: HTMLDivElement;
  private filters!: HTMLDivElement;
  private about!: HTMLElement;
  private title!: HTMLHeadingElement;
  private titleText!: HTMLSpanElement;
  private wrap!: HTMLDivElement;
  private sources!: HTMLParagraphElement;
  private count!: HTMLSpanElement;
  private removeBtn!: HTMLButtonElement;
  private picked: Record<string, string> = {};
  /** The NMR solvent last picked in a Solvent filter: impurity tables open showing that solvent. */
  private nmrSolvent = readNmrSolvent();
  private sort: { key: string; down: boolean } | null = null;
  /** Canonical SMILES of each row's structure (worked out once, when a SMILES is first searched). */
  private canon = new Map<string, string | null>();
  /** The canonical form of the SMILES typed, when the search is one. */
  private queryCanon: string | null = null;
  private searchToken = 0;
  /** Builds more rows of the table showing (as it is scrolled down). */
  private moreRows: ((n?: number) => void) | null = null;
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
    // a single letter matches most of every table (~110 ms): wait a moment for the next key first
    let wait = 0;
    this.search.addEventListener('input', () => {
      clearTimeout(wait);
      if (this.search.value.trim().length === 1) wait = window.setTimeout(() => this.searchChanged(), 200);
      else this.searchChanged();
    });
    this.list = el('div', { className: 'kb-list', role: 'tablist' });
    this.list.setAttribute('aria-label', 'Tables');
    this.filters = el('div', { className: 'refs-filter kb-filters' });
    // the table's name with its description behind an "i" (UI rule 2), and its filters, in the
    // title row above the table: no line of their own
    this.title = el('h3', { className: 'kb-title has-info' });
    this.titleText = el('span');
    this.about = infoIcon('');
    this.title.append(this.titleText, this.about);
    this.wrap = el('div', { className: 'refs-table-wrap kb-table-wrap' });
    this.wrap.addEventListener('scroll', () => { const w = this.wrap; if (w.scrollTop + w.clientHeight > w.scrollHeight - 600) this.moreRows?.(); }, { passive: true });
    this.sources = el('p', { className: 'muted kb-sources' });
    this.count = el('span', { className: 'muted' });
    this.removeBtn = button('Remove Table…', 'Remove the imported table showing (only from this computer)', () => void this.removeImported());
    d.append(
      el('div', { className: 'refs-head kb-head' }, el('h2', { textContent: 'Knowledge Base' }), el('div', { className: 'kb-top' }, this.title, this.filters), this.search),
      el('div', { className: 'kb-body' },
        this.list,
        el('div', { className: 'kb-main' }, this.wrap, this.sources)),
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

  /** The rows matched for each table and search, so one key typed matches each table once (the counts on the left and the table showing ask for the same). */
  private matchMemo = new Map<string, readonly RowMatch[]>();

  private matches(t: KbTable, withFilters = true): RowMatch[] {
    const filters = withFilters ? this.filtersFor(t) : {};
    const key = JSON.stringify([t.id, t.personal === true, t.rows.length, this.search.value, this.queryCanon, this.casCid, this.canon.size, filters]);
    const got = this.matchMemo.get(key);
    if (got) return [...got];
    if (this.matchMemo.size > 200) this.matchMemo.clear();
    const found = this.findMatches(t, filters);
    this.matchMemo.set(key, found);
    return [...found];
  }

  private findMatches(t: KbTable, filters: Record<string, string>): RowMatch[] {
    const same = this.queryCanon ? new Set(t.rows.filter((r) => typeof r.smiles === 'string' && this.canon.get(r.smiles) === this.queryCanon).map((r) => r.smiles as string)) : undefined;
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

  /** The filters picked, with the remembered NMR solvent in a Solvent column nobody has set yet. */
  private filtersFor(t: KbTable): Record<string, string> {
    const col = solventColumn(t);
    if (!col || this.picked[col.key] !== undefined || !this.nmrSolvent) return this.picked;
    const v = matchSolvent(filterValues(t, col.key), this.nmrSolvent);
    return v ? { ...this.picked, [col.key]: v } : this.picked;
  }

  private header(c: KbColumn): HTMLTableCellElement {
    const th = el('th', {}, explained(c.label, true));
    if (c.numeric || c.shift) th.classList.add('num');
    if (c.narrow) th.classList.add('narrow');
    // what the scale means: hover for the tip, a click pins it (and doesn't sort)
    if (c.info) th.append(' ', infoIcon(c.info));
    if (c.picture) { th.classList.add('kb-pic'); return th; }
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
    this.titleText.textContent = prettyChem(t.title);
    setInfo(this.about, prettyChem(t.about));
    this.removeBtn.hidden = !t.personal;
    // filter lists
    this.filters.replaceChildren(...t.columns.filter((c) => c.filter).map((c) => {
      const s = el('select', { title: `Show only one ${c.label.toLowerCase()}` });
      s.append(el('option', { value: '', textContent: 'All' }));
      if (c.filter === 'present') s.append(el('option', { value: PRESENT, textContent: `With ${c.label.toLowerCase()}` }));
      else s.append(...filterValues(t, c.key).map((v) => el('option', { value: v, textContent: prettyChem(v, c.key === 'nucleus') })));
      const solvent = c === solventColumn(t);
      s.value = (solvent ? this.filtersFor(t)[c.key] : this.picked[c.key]) ?? '';
      s.addEventListener('change', () => {
        this.picked = { ...this.picked, [c.key]: s.value };
        if (solvent) { this.nmrSolvent = s.value; writeNmrSolvent(s.value); }
        this.showTable();
      });
      if (solvent) s.title = 'The solvent your NMR was taken in: impurity shifts change with it. Remembered for the other impurity tables';
      return el('label', {}, el('span', { textContent: solvent ? 'NMR taken in' : c.label }), s);
    }));
    this.filters.hidden = !this.filters.childElementCount;
    let rows = this.matches(t);
    const sortCol = this.sort && t.columns.find((c) => c.key === this.sort!.key);
    if (sortCol) rows = sortRows(rows, sortCol, this.sort!.down);
    // the first rows straight away and the rest as the table is scrolled down: building every
    // row of a big table (Reagent Safety, Solubility) on each key typed took most of a second
    const body = el('tbody');
    let next = 0;
    this.moreRows = (n = MORE_ROWS) => {
      const end = Math.min(rows.length, next + n);
      for (; next < end; next++) body.append(this.rowEl(t, rows[next]));
    };
    this.moreRows(FIRST_ROWS);
    const table = el('table', { className: 'refs-table kb-table' + (t.picture ? ' kb-pictures' : '') }, el('thead', {}, el('tr', {}, ...t.columns.filter((c) => !c.hidden).map((c) => this.header(c)), ...(t.links ? [el('th', { textContent: 'Look up' })] : []))), body);
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

  /** One row of the table. */
  private rowEl(t: KbTable, m: RowMatch): HTMLTableRowElement {
    const tr = el('tr');
    for (const c of t.columns) {
      if (c.hidden) continue;
      const v = m.row[c.key];
      const td = el('td');
      if (c.numeric || c.shift) td.className = 'num';
      if (c.narrow) td.classList.add('narrow');
      if (c.prose) td.classList.add('prose');
      if (c.key === 'cas') td.classList.add('cas');
      if (c.picture) {
        const tpl = t.picture?.(m.row);
        td.className = 'kb-pic';
        { const icon = tpl ? svgNode(templateIcon(tpl, PIC, 14)) : null; if (icon) td.append(icon); }
        tr.append(td);
        continue;
      }
      if (v !== null && v !== undefined && v !== '') td.append(typeof v === 'number' ? String(v) : c.key === 'atom' ? v : cellExplained(v, !!c.narrow, c.key === 'nucleus')); // atom labels (H2, C3) are not formulas
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
    return tr;
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
