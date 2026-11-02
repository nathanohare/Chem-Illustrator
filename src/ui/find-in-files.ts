// File > Find Structure in Files (desktop app): search a folder of ChemDraw drawings (CDXML,
// CDX), Word documents, PowerPoint presentations and Excel workbooks for a structure drawn or
// typed (a name or SMILES): the same structure, or any structure containing it. Each find says
// the file and where in it (slide 3, figure 2, Sheet1!B4) and the number under it; Open opens
// the file there with the structure selected. Files that haven't changed since the last search
// aren't read again (the index, see file-index.ts).

import { emptyIndex, searchFiles, type FileIndex, type Hit, type SearchDeps, type SearchMode } from '../library/file-index';
import { SEARCHED_EXTENSIONS, spotText } from '../library/structures';

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

export interface ListedFile { path: string; size: number; modified: number }

export interface FindInFilesHost {
  flash(msg: string, ms?: number): void;
  pickFolder(start: string): Promise<string | null>;
  listFolder(path: string, extensions: string[], sub: boolean): Promise<{ files: ListedFile[]; complete: boolean }>;
  /** The structure selected in the drawing showing, as SMILES; a string says why there is none. */
  selected(): Promise<{ smiles: string; label?: string } | string>;
  /** RDKit's SMILES for a name or SMILES typed. */
  toSmiles(text: string): Promise<string | { error: string }>;
  /** How files are read and searched. */
  deps: Pick<SearchDeps, 'read' | 'found' | 'smiles' | 'contains'>;
  index: { read(): Promise<FileIndex>; write(ix: FileIndex): Promise<void> };
  /** Open a file found, at the structure. */
  open(h: Hit): Promise<void>;
  /** The folder last searched (kept on this computer). */
  lastFolder: { get(): string; set(path: string): void };
}

const fileOf = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);

export class FindInFilesWindow {
  private d: HTMLDialogElement | null = null;
  private folder!: HTMLInputElement;
  private sub!: HTMLInputElement;
  private query!: HTMLInputElement;
  private mode!: HTMLSelectElement;
  private status!: HTMLElement;
  private body!: HTMLTableSectionElement;
  private go!: HTMLButtonElement;
  private hits: Hit[] = [];
  private picked = -1;
  private running = false;
  private stop = false;
  /** The SMILES searched for, when it came from a drawing (else what is typed is read). */
  private drawn: { smiles: string; text: string } | null = null;

  constructor(private host: FindInFilesHost) {}

  /** Show the window; `smiles` (a compound from the library, say) starts in the box. */
  async open(start?: { smiles: string; label?: string }): Promise<void> {
    if (!this.d) this.build();
    if (start) this.setQuery(start.smiles, start.label);
    else if (!this.query.value) {
      const sel = await this.host.selected();
      if (typeof sel !== 'string') this.setQuery(sel.smiles, sel.label);
    }
    if (!this.d!.open) this.d!.showModal();
    (this.folder.value ? this.query : this.folder).focus();
  }

  private setQuery(smiles: string, label?: string): void {
    const text = label ? `${label}: ${smiles}` : smiles;
    this.drawn = { smiles, text };
    this.query.value = text;
  }

  private build(): void {
    const d = (this.d = el('dialog', { className: 'refs-dialog find-files' }));
    d.setAttribute('aria-label', 'Find Structure in Files');
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) { e.preventDefault(); void this.search(); }
    });
    this.folder = el('input', { type: 'text', value: this.host.lastFolder.get(), placeholder: 'a folder: C:\\Users\\me\\OneDrive\\Group\\Projects' });
    this.folder.spellcheck = false;
    this.folder.setAttribute('aria-label', 'Folder');
    this.sub = el('input', { type: 'checkbox', checked: true });
    this.query = el('input', { type: 'text', placeholder: 'a name or SMILES, or select a structure and click Use Selected' });
    this.query.spellcheck = false;
    this.query.setAttribute('aria-label', 'Structure');
    this.query.addEventListener('input', () => { this.drawn = null; });
    this.mode = el('select');
    this.mode.add(new Option('Any structure containing it', 'contains'));
    this.mode.add(new Option('Only the same structure', 'exact'));
    this.mode.setAttribute('aria-label', 'Find');
    this.status = el('p', { className: 'muted', role: 'status' });
    this.body = el('tbody');
    const table = el('table', { className: 'refs-table find-table' }, el('thead', {}, el('tr', {}, ...['File', 'Where', 'Number', 'Found', 'Folder'].map((h) => el('th', { textContent: h })))), this.body);
    // (a double-click is told by the click's count: the list is made again after the first click)
    this.body.addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr');
      if (!tr?.dataset.n) return;
      this.picked = Number(tr.dataset.n);
      if (e.detail === 2) void this.openPicked(); else this.fill();
    });
    this.go = button('Search', 'Search the folder (Enter)', () => void (this.running ? (this.stop = true) : this.search()), true);
    d.append(
      el('div', { className: 'refs-head' }, el('h2', { textContent: 'Find Structure in Files' })),
      el('p', { className: 'muted', textContent: `Searches the ChemDraw drawings (CDXML, CDX), Word documents, PowerPoint presentations and Excel workbooks in a folder for a structure. Files read once aren't read again until they change, so searching the same folder again is quick.` }),
      el('div', { className: 'ask-row refs-style' }, el('label', { textContent: 'Folder' }), this.folder,
        button('Choose…', 'Pick the folder to search', () => void this.choose())),
      el('label', { className: 'ref-own' }, this.sub, el('span', { textContent: 'And the folders inside it' })),
      el('div', { className: 'ask-row refs-style' }, el('label', { textContent: 'Structure' }), this.query,
        button('Use Selected', 'Search for the structure selected in the drawing', () => void this.useSelected())),
      el('div', { className: 'ask-row refs-style' }, el('label', { textContent: 'Find' }), this.mode),
      this.status,
      el('div', { className: 'refs-table-wrap' }, table),
      el('div', { className: 'refs-buttons' },
        el('span', {}, this.go),
        el('span', {}, button('Open', 'Open the file picked at the structure found (or double-click it)', () => void this.openPicked()), button('Close', '', () => d.close()))),
    );
    d.addEventListener('close', () => { this.stop = true; });
    document.body.append(d);
    this.fill();
  }

  private async choose(): Promise<void> {
    const p = await this.host.pickFolder(this.folder.value);
    if (p) { this.folder.value = p; this.query.focus(); }
  }

  private async useSelected(): Promise<void> {
    const sel = await this.host.selected();
    if (typeof sel === 'string') { this.host.flash(sel, 6000); return; }
    this.setQuery(sel.smiles, sel.label);
  }

  private fill(): void {
    const rows = this.hits.map((h, i) => {
      const folder = h.path.slice(0, h.path.length - fileOf(h.path).length).replace(/[\\/]$/, '');
      const tr = el('tr', {},
        el('td', { textContent: fileOf(h.path) }),
        el('td', { textContent: spotText(h.structure.spot) }),
        el('td', { textContent: h.structure.label ?? '' }),
        el('td', { textContent: h.exact ? 'the same' : 'containing it' }),
        el('td', { className: 'muted', textContent: folder }));
      tr.dataset.n = String(i);
      tr.title = `${h.path}\n${h.structure.smiles ?? ''}`;
      if (i === this.picked) tr.classList.add('picked');
      return tr;
    });
    if (!rows.length) rows.push(el('tr', {}, el('td', { colSpan: 5, className: 'muted', textContent: this.running ? 'Searching…' : 'Nothing found yet.' })));
    this.body.replaceChildren(...rows);
  }

  private async openPicked(): Promise<void> {
    const h = this.hits[this.picked];
    if (!h) { this.host.flash('Click a file found first.'); return; }
    this.d?.close();
    await this.host.open(h);
  }

  async search(): Promise<void> {
    if (this.running) return;
    const folder = this.folder.value.trim();
    if (!folder) { this.host.flash('Choose a folder to search first.'); return; }
    let smiles = this.drawn?.text === this.query.value ? this.drawn.smiles : '';
    if (!smiles) {
      if (!this.query.value.trim()) { this.host.flash('Type a name or SMILES, or select a structure and click Use Selected.', 6000); return; }
      const got = await this.host.toSmiles(this.query.value.trim().replace(/^[^:\s]{1,12}:\s+/, ''));
      if (typeof got !== 'string') { this.host.flash(got.error, 8000); return; }
      smiles = got;
    }
    const mode = this.mode.value as SearchMode;
    this.running = true;
    this.stop = false;
    this.hits = [];
    this.picked = -1;
    this.go.textContent = 'Stop';
    this.status.textContent = 'Listing the files…';
    this.fill();
    try {
      const listed = await this.host.listFolder(folder, SEARCHED_EXTENSIONS, this.sub.checked);
      this.host.lastFolder.set(folder);
      if (!listed.files.length) { this.status.textContent = 'No ChemDraw, Word, PowerPoint or Excel files are in that folder.'; return; }
      const ix = await this.host.index.read().catch(() => emptyIndex());
      const t0 = Date.now();
      let lastPaint = 0;
      const r = await searchFiles(listed.files, smiles, mode, ix, {
        ...this.host.deps,
        stopped: () => this.stop,
        progress: (done, total, path) => {
          if (Date.now() - lastPaint < 120 && done < total) return;
          lastPaint = Date.now();
          this.status.textContent = `Searching ${done} of ${total}: ${fileOf(path)}`;
          this.fill();
        },
        hit: (h) => { this.hits.push(h); },
      });
      if (r.read) await this.host.index.write(ix).catch(() => {});
      const files = new Set(r.hits.map((h) => h.path)).size;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      this.status.textContent = `${r.stopped ? 'Stopped. ' : ''}Found ${r.hits.length ? `${r.hits.length} structure${r.hits.length === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}` : 'nothing'} (${listed.files.length} file${listed.files.length === 1 ? '' : 's'} searched, ${r.read} read, in ${secs} s).`
        + (r.failed.length ? ` ${r.failed.length} couldn't be read: ${r.failed.slice(0, 3).map((f) => fileOf(f.path)).join(', ')}${r.failed.length > 3 ? '…' : ''}.` : '')
        + (listed.complete ? '' : ' (Only the first 20,000 files were searched: pick a smaller folder.)');
      if (r.hits.length) this.picked = 0;
    } catch (e) {
      this.status.textContent = e instanceof Error ? e.message : String(e);
    } finally {
      this.running = false;
      this.go.textContent = 'Search';
      this.fill();
    }
  }
}
