// The Ligand Library window (Chemistry > Metals > Ligand Library, and the first button on the
// Ligands palette): several hundred ligands by family, searched by abbreviation, name, PubChem
// number or bonding type (LX, L2X…). Each one's drawing on a metal M, its names, how it bonds
// and its PubChem record; Use Template picks its drawing as the tool, to click on a metal (or
// anywhere) in the drawing. The window stays open beside the drawing while you work.

import { LIGAND_FAMILIES, bondingType, denticity, familyOf, searchLigands, type Ligand } from '../chem/ligands';
import { templateById } from '../chem/templates';
import { templateIcon } from './template-icons';

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

export interface LigandLibraryHost {
  /** Make this template the tool, to click where it goes. */
  useTemplate(id: string): void;
  /** Open a web page in the browser. */
  openUrl(url: string): void;
  /** Copy text, saying what was copied. */
  copyText(text: string, what: string): void;
}

const CARD = 72;

/** The usual abbreviation, with the enantiomer drawn in front for a chiral ligand: (R)-BINAP. */
const shownAs = (l: Ligand): string => (l.drawn ? `${l.drawn}-${l.abbr[0]}` : l.abbr[0]);
const BIG = 200;

export class LigandLibraryWindow {
  private d: HTMLDialogElement | null = null;
  private search!: HTMLInputElement;
  private families!: HTMLElement;
  private grid!: HTMLElement;
  private details!: HTMLElement;
  private count!: HTMLElement;
  private useBtn!: HTMLButtonElement;
  private family = '';
  private current: Ligand | null = null;
  private shown: Ligand[] = [];

  constructor(private host: LigandLibraryHost) {}

  get isOpen(): boolean { return !!this.d; }

  open(query = ''): void {
    if (this.d) {
      if (query) { this.search.value = query; this.fill(); }
      this.search.focus();
      return;
    }
    const d = (this.d = el('dialog', { className: 'refs-dialog kb-window ligand-library' }));
    d.setAttribute('aria-label', 'Ligand Library');
    d.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); d.close(); return; }
      // in the search box, only Down (into the cards) and Enter (use the first) are taken
      const typing = e.target instanceof HTMLInputElement;
      if (typing && e.key !== 'ArrowDown' && e.key !== 'Enter') return;
      if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return;
      if (e.key === 'Enter' && this.current) { e.preventDefault(); this.use(true); }
      else if (e.key.startsWith('Arrow')) { e.preventDefault(); this.step(typing ? 'ArrowNone' : e.key); }
    });
    this.search = el('input', { type: 'search', placeholder: 'Abbreviation, name, PubChem CID or LX', value: query });
    this.search.title = 'Find a ligand by its abbreviation (dppf, XPhos), part of its name (bipyridine, oxazoline), its PubChem number, or how it bonds (L2, LX, L2X)';
    this.search.setAttribute('aria-label', 'Find a ligand');
    this.search.addEventListener('input', () => this.fill());
    this.families = el('div', { className: 'kb-list', role: 'listbox' });
    this.families.setAttribute('aria-label', 'Families');
    this.grid = el('div', { className: 'lig-grid', role: 'listbox', tabIndex: 0 });
    this.grid.setAttribute('aria-label', 'Ligands');
    // (a double-click is told by the click's count: the cards are made again after the first click)
    this.grid.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.lig-card');
      if (!card?.dataset.id) return;
      const l = this.shown.find((x) => x.id === card.dataset.id);
      if (!l) return;
      this.pick(l);
      if (e.detail === 2) this.use(true);
    });
    this.details = el('div', { className: 'lig-details' });
    this.count = el('span', { className: 'muted' });
    this.useBtn = button('Use Template', 'Pick the ligand\'s drawing as the tool, then click a metal in the drawing to put it on (or click anywhere). Double-click a ligand, or press Enter, to do the same and close this window', () => this.use(false), true);
    d.append(
      el('div', { className: 'refs-head' }, el('h2', { textContent: 'Ligand Library' }), this.search),
      el('div', { className: 'kb-body lig-body' }, this.families, this.grid, this.details),
      el('div', { className: 'refs-buttons' },
        el('span', { className: 'muted lig-hint', textContent: 'Each abbreviation also works typed as a label: type dppf, XPhos or salen on a metal\'s bond.' }),
        el('span', { className: 'refs-edit' }, this.count, this.useBtn, button('Close', '', () => d.close()))),
    );
    d.addEventListener('close', () => { d.remove(); this.d = null; });
    document.body.append(d);
    this.showFamilies();
    this.fill();
    d.show();
    this.search.focus();
  }

  close(): void { this.d?.close(); }

  private showFamilies(): void {
    const tab = (id: string, name: string, title: string, n: number) => {
      const b = el('button', { type: 'button', className: 'kb-tab' + (id === this.family ? ' on' : ''), title }, el('span', { textContent: name }), el('span', { className: 'muted', textContent: String(n) }));
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(id === this.family));
      b.addEventListener('click', () => { this.family = id; this.showFamilies(); this.fill(); });
      return b;
    };
    this.families.replaceChildren(
      tab('', 'All ligands', 'Every ligand in the library', searchLigands('').length),
      ...LIGAND_FAMILIES.map((f) => tab(f.id, f.name, f.note, searchLigands('', f.id).length)),
    );
  }

  private fill(): void {
    this.shown = searchLigands(this.search.value, this.family);
    const cards = this.shown.map((l) => {
      const t = templateById(l.tpl);
      const card = el('div', { className: 'lig-card' + (l === this.current ? ' on' : ''), title: `${l.name}\n${bondingType(l)}${l.drawn ? `\nDrawn as ${shownAs(l)}` : ''}` });
      card.dataset.id = l.id;
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', String(l === this.current));
      card.setAttribute('aria-label', `${shownAs(l)}: ${l.name}`);
      const pic = el('div', { className: 'lig-pic' });
      pic.innerHTML = t ? templateIcon(t, CARD) : '';
      card.append(pic, el('span', { className: 'lig-abbr', textContent: shownAs(l) }));
      return card;
    });
    this.grid.replaceChildren(...(cards.length ? cards : [el('p', { className: 'muted kb-empty', textContent: this.search.value.trim() ? `No ligand matches “${this.search.value.trim()}”. Try part of its name, or another family.` : 'No ligands in this family.' })]));
    this.count.textContent = `${this.shown.length} ligand${this.shown.length === 1 ? '' : 's'}`;
    if (!this.current || !this.shown.includes(this.current)) this.current = this.shown[0] ?? null;
    this.mark();
    this.showDetails();
  }

  private pick(l: Ligand): void {
    this.current = l;
    this.mark();
    this.showDetails();
  }

  /** Shows which card is picked, and brings it into view. */
  private mark(): void {
    for (const c of this.grid.querySelectorAll<HTMLElement>('.lig-card')) {
      const on = c.dataset.id === this.current?.id;
      c.classList.toggle('on', on);
      c.setAttribute('aria-selected', String(on));
      if (on) c.scrollIntoView?.({ block: 'nearest' });
    }
    this.useBtn.disabled = !this.current;
  }

  /** The arrow keys move through the cards: across a row, and down a column. */
  private step(key: string): void {
    if (!this.shown.length) return;
    const cards = [...this.grid.querySelectorAll<HTMLElement>('.lig-card')];
    const top = cards[0]?.offsetTop ?? 0;
    const perRow = Math.max(1, cards.filter((c) => c.offsetTop === top).length);
    const i = this.current ? this.shown.indexOf(this.current) : -1;
    // (from the search box: to the card picked, as it is)
    const by = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : key === 'ArrowDown' ? perRow : key === 'ArrowUp' ? -perRow : 0;
    const j = i < 0 ? 0 : Math.min(this.shown.length - 1, Math.max(0, i + by));
    this.pick(this.shown[j]);
    this.grid.focus();
  }

  private showDetails(): void {
    const l = this.current;
    if (!l) { this.details.replaceChildren(el('p', { className: 'muted', textContent: 'Pick a ligand to see it here.' })); return; }
    const t = templateById(l.tpl);
    const pic = el('div', { className: 'lig-big' });
    pic.innerHTML = t ? templateIcon(t, BIG) : '';
    const row = (k: string, v: Node | string) => [el('dt', { textContent: k }), el('dd', {}, v)];
    const smiles = el('code', { className: 'lig-smiles', textContent: l.smiles, title: 'What the abbreviation stands for when typed as a label, starting at the atom that bonds. Click to copy' });
    smiles.addEventListener('click', () => this.host.copyText(l.smiles, `Copied the SMILES for ${l.abbr[0]}.`));
    const cid = l.cid
      ? (() => { const a = el('a', { href: `https://pubchem.ncbi.nlm.nih.gov/compound/${l.cid}`, textContent: `CID ${l.cid}`, title: 'Open the ligand\'s record on PubChem, in the browser' }); a.addEventListener('click', (e) => { e.preventDefault(); this.host.openUrl(a.href); }); return a; })()
      : el('span', { className: 'muted', textContent: 'not in PubChem' });
    this.details.replaceChildren(
      pic,
      el('h3', { textContent: shownAs(l) }),
      el('p', { className: 'lig-name', textContent: l.name }),
      el('dl', {},
        ...(l.abbr.length > 1 ? row('Also', l.abbr.slice(1).join(', ')) : []),
        ...row('Family', familyOf(l)?.name ?? ''),
        ...row('Bonds as', `${bondingType(l)}, ${denticity(l)}`),
        ...(l.drawn ? row('Drawn as', el('span', { textContent: `the ${l.drawn} enantiomer`, title: 'A chiral ligand is drawn as one enantiomer; its mirror image is the other. Flip the drawing to get it' })) : []),
        ...row('PubChem', cid),
        ...row('SMILES', smiles),
      ),
      ...(l.note ? [el('p', { className: 'muted lig-note', textContent: l.note })] : []),
    );
  }

  /** Picks the ligand's drawing as the tool; `close` closes the window too. */
  private use(close: boolean): void {
    if (!this.current) return;
    this.host.useTemplate(this.current.tpl);
    if (close) this.d?.close();
  }
}
