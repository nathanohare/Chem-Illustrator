// The Canvas ribbon: a compact ribbon over the drawing with the chemistry commands that have no
// toolbox of their own, or that are hard to find in the menus. It is a tabbed ribbon like the
// other modes' (so collapsing, fitting a narrow window, command search and Customize work the
// same), with two rows of buttons under the tabs. Only the major commands carry words (the groups
// have no names shown); the rest are pictures, named in their tooltips. Settings ▸ Ribbon offers
// the one-row Simplified look.
//
// Tabs for one kind of object (Arrow, Ring, Bond) come up beside the others while that kind is
// being drawn or is selected, and the ribbon switches to them; it goes back to the tab you were
// on when they leave. The right end of the tab row holds the warnings, and the right end of the
// buttons a one-line Analysis drop-down (see canvas-ribbon-boxes.ts).

/** A command button (data-cmd, run as the menus run it) or a drawing tool. */
export type RibbonItem =
  | { cmd: string; label: string; major?: boolean; tip?: string }
  | { tool: string; label: string; major?: boolean; tip?: string };
/**
 * A group: its buttons, or one built specially: the Format Favorites gallery, the Clipboard (Paste,
 * Cut, Copy and Format Painter, as the Spreadsheet's Home tab has them) or the Font group (the
 * basics of the text formatting bar).
 */
export interface RibbonGroup { name: string; items: RibbonItem[]; gallery?: 'favorites'; special?: 'clipboard' | 'font' }
export interface RibbonTab { id: string; title: string; groups: RibbonGroup[]; context?: ContextKind }
export type ContextKind = 'arrow' | 'ring' | 'bond';

const c = (cmd: string, label: string, major = false): RibbonItem => ({ cmd, label, major });
const t = (tool: string, label: string, major = false): RibbonItem => ({ tool, label, major });

/** What the Canvas ribbon holds. Home is the essentials; the other tabs take the rest. */
export const CANVAS_TABS: RibbonTab[] = [
  {
    id: 'home', title: 'Home', groups: [
      // first, as the Spreadsheet's Home tab starts
      { name: 'Clipboard', items: [], special: 'clipboard' },
      { name: 'Font', items: [], special: 'font' },
      // (filled by the shared Format Favorites gallery, as on every mode's Home tab)
      { name: 'Format Favorites', items: [], gallery: 'favorites' },
      { name: 'Schemes', items: [c('smart-scheme', 'Smart Scheme', true), c('catalytic-cycle', 'Catalytic Cycle', true), c('convert-smart-scheme', 'Convert to Smart Scheme'), c('stoichiometry-table', 'Stoichiometry Table…'), c('check-balance', 'Check Balance…'), c('map-atoms', 'Map Atoms…')] },
      { name: 'Diagrams', items: [c('energy-diagram', 'Energy Diagram', true), c('mo-diagram', 'MO Diagram…'), c('orbital', 'Orbital…'), c('ts-brackets', 'Transition State Brackets ‡'), c('torsion-chart', 'Torsional Energy Chart…')] },
      { name: 'Mechanism', items: [c('animate-reaction', 'Animate', true), c('check-arrows', 'Check Arrows'), c('draw-from-arrows', 'Draw Next Intermediate'), c('homolysis-arrows', 'Homolysis Arrows'), c('model-3d', '3-D Model…')] },
      { name: 'Insert', items: [c('name-to-structure', 'Name to Structure…'), c('import-picture', 'Structures from Picture…'), c('sequence-to-structure', 'Structure from Sequence…'), c('tlc-plate', 'TLC Plate…'), c('insert-table', 'Table'), c('rgroup-table', 'R-Group Table…')] },
      { name: 'Look Up', items: [c('structure-to-name', 'Structure to Name'), c('find-cas', 'Find CAS RN'), c('pubchem-lookup', 'Look Up on PubChem'), c('knowledge-base', 'Knowledge Base…'), c('compound-library', 'Compound Library…'), c('periodic-table', 'Periodic Table…')] },
    ],
  },
  {
    id: 'insert', title: 'Insert', groups: [
      { name: 'Structures', items: [c('name-to-structure', 'Name to Structure', true), c('import-picture', 'Structures from Picture…'), c('sequence-to-structure', 'Structure from Sequence…'), c('crystal-structure', 'Crystal Structure (CIF)…'), c('ligand-library', 'Ligand Library…'), c('compound-library', 'Compound Library…')] },
      { name: 'Projections', items: [c('newman-projection', 'Newman Projection', true), c('model-3d', '3-D Model…'), c('turn-3d', '3-D Rotation…')] },
      { name: 'Lab', items: [c('tlc-plate', 'TLC Plate', true), c('insert-table', 'Table'), c('rgroup-table', 'R-Group Table…'), c('stoichiometry-table', 'Stoichiometry Table…')] },
    ],
  },
  {
    id: 'chemistry', title: 'Chemistry', groups: [
      { name: 'Structure', items: [c('clean-up', 'Clean Up', true), c('check-structure', 'Check Structure'), c('expand-label', 'Expand Label'), c('contract-label', 'Contract Label'), c('stereo-labels', 'Stereo Labels'), c('explicit-h', 'Show Hydrogens')] },
      { name: 'Reaction', items: [c('clean-up-reaction', 'Clean Up Reaction', true), c('number-compounds', 'Number Compounds'), c('add-frame', 'Add Frame'), c('attach-descriptors', 'Attach Descriptors')] },
      { name: 'Rings', items: [c('aromatic-circles', 'Aromatic Circles'), c('fill-rings', 'Fill Rings'), c('hapto-bond', 'Add Hapto Bond (η)')] },
    ],
  },
  {
    id: 'arrange', title: 'Arrange', groups: [
      { name: 'Align', items: [c('align-left', 'Align Left'), c('align-hcenter', 'Align Center'), c('align-right', 'Align Right'), c('align-top', 'Align Top'), c('align-vcenter', 'Align Middle'), c('align-bottom', 'Align Bottom')] },
      { name: 'Distribute', items: [c('distribute-h', 'Distribute Horizontally'), c('distribute-v', 'Distribute Vertically'), c('arrange-row', 'Arrange in a Row'), c('arrange-column', 'Arrange in a Column'), c('arrange-grid', 'Arrange in a Grid…')] },
      { name: 'Turn', items: [c('flip-h', 'Flip Horizontal'), c('flip-v', 'Flip Vertical'), c('rotate-cw', 'Rotate Right 90°'), c('rotate-ccw', 'Rotate Left 90°'), c('rotate-dialog', 'Rotate…')] },
      { name: 'Order', items: [c('shape-front', 'Bring to Front'), c('shape-forward', 'Bring Forward'), c('shape-back', 'Send to Back'), c('shape-backward', 'Send Backward')] },
    ],
  },
  {
    id: 'view', title: 'View', groups: [
      { name: 'Zoom', items: [c('zoom-fit', 'Fit', true), c('focus-view', 'Focus View')] },
      { name: 'Show', items: [c('navigator', 'Document Map'), c('dark-page', 'Reading Mode'), c('show-stereo', 'Stereo Labels')] },
    ],
  },
  {
    id: 'arrow', title: 'Arrow', context: 'arrow', groups: [
      { name: 'Shape', items: [c('arrow-single-curve', 'Single Curve'), c('arrow-s-shape', 'S-Shape'), c('arrow-shape-u', 'U-Turn'), c('arrow-shape-loop', 'Loop'), c('flip-arrow-bend', 'Flip Bend'), c('arrow-reverse', 'Reverse Direction')] },
      { name: 'Path', items: [c('arrow-add-bend', 'Add Bend'), c('arrow-remove-bend', 'Remove Bend'), c('arrow-smooth-path', 'Smooth Path'), c('arrow-simplify-path', 'Simplify Path')] },
      { name: 'Structure', items: [c('attach-arrow', 'Attach to Structure'), c('detach-arrow', 'Detach from Structure'), c('check-arrows', 'Check Arrows'), c('clean-up-arrow', 'Clean Up Arrow', true)] },
    ],
  },
  {
    id: 'ring', title: 'Ring', context: 'ring', groups: [
      { name: 'Rings', items: [t('ring-benzene', 'Benzene'), t('ring-cp', 'Cyclopentadiene'), t('ring-3', 'Cyclopropane'), t('ring-4', 'Cyclobutane'), t('ring-5', 'Cyclopentane'), t('ring-6', 'Cyclohexane'), t('ring-7', 'Cycloheptane'), t('ring-8', 'Cyclooctane')] },
      { name: 'Aromatic', items: [c('aromatic-circles', 'Aromatic Circles'), c('fill-rings', 'Fill Rings'), c('hapto-bond', 'Add Hapto Bond (η)')] },
    ],
  },
  {
    id: 'bond', title: 'Bond', context: 'bond', groups: [
      { name: 'Order', items: [t('bond-single', 'Single'), t('bond-double', 'Double'), t('bond-triple', 'Triple'), t('bond-dative', 'Dative'), t('bond-wavy', 'Wavy'), t('bond-bold', 'Bold')] },
      { name: 'Stereo', items: [t('bond-wedge', 'Wedge'), t('bond-hashWedge', 'Hashed Wedge'), t('bond-hollowWedge', 'Hollow Wedge'), t('bond-wavyWedge', 'Wavy Wedge'), t('bond-hash', 'Hashed')] },
      { name: 'Non-Covalent', items: [t('bond-hydrogen', 'Hydrogen Bond'), t('bond-ionic', 'Ionic Bond')] },
      { name: 'Highlight', items: [c('centre-highlight', 'Center Highlight on Double Bonds')] },
    ],
  },
];

export type RibbonLook = 'classic' | 'simple';
export type GroupNames = 'top' | 'side' | 'none';

export interface CanvasRibbonHost {
  /** Run a menu command. */
  command(cmd: string): void;
  /** Pick a drawing tool. */
  pickTool(name: string): void;
  /** Is there such a tool (the ribbon leaves out tools this build lacks)? */
  hasTool(name: string): boolean;
  /** A command's or tool's picture (24×24 SVG), if it has one. */
  icon(item: RibbonItem): string | undefined;
  /** Fill the Font group's row with the text formatting bar's basics. */
  fontGroup(row: HTMLElement): void;
  /** Paste's ▾: its menu, under the button. */
  pasteMenu(at: DOMRect): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export class CanvasRibbon {
  readonly el: HTMLDivElement;
  readonly tabRow: HTMLDivElement;
  /** The right end of the tab row (the warnings go here). */
  readonly tabEnd: HTMLDivElement;
  /** The right end of the buttons (the Analysis drop-down goes here). */
  readonly bodyEnd: HTMLDivElement;
  private tabs = new Map<string, HTMLButtonElement>();
  private panels = new Map<string, HTMLDivElement>();
  /** The tab picked by hand: the ribbon comes back to it when an object's tab goes. */
  private chosen = 'home';
  private context: ContextKind | null = null;

  /** Made in front of `place` (the first of the other modes' ribbons). */
  constructor(private host: CanvasRibbonHost, place: HTMLElement) {
    this.el = document.createElement('div');
    this.el.id = 'canvas-ribbon';
    this.el.className = 'ribbon tabbed canvas-ribbon cr-classic';
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', 'Canvas');
    this.tabRow = document.createElement('div');
    this.tabRow.className = 'rb-tabs';
    this.tabRow.setAttribute('role', 'tablist');
    this.tabEnd = document.createElement('div');
    this.tabEnd.className = 'cr-tab-end';
    this.bodyEnd = document.createElement('div');
    this.bodyEnd.className = 'cr-body-end';
    for (const tab of CANVAS_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.crTab = tab.id;
      b.textContent = tab.title;
      b.setAttribute('aria-selected', String(tab.id === 'home'));
      if (tab.context) { b.classList.add('cr-ctx-tab'); b.hidden = true; b.title = `${tab.title} tools: shown while you draw or select ${tab.context === 'arrow' ? 'arrows' : tab.context === 'ring' ? 'rings' : 'bonds'}`; }
      b.addEventListener('click', () => { if (!tab.context) this.chosen = tab.id; this.pick(tab.id); });
      this.tabRow.append(b);
      this.tabs.set(tab.id, b);
      this.panels.set(tab.id, this.panel(tab));
    }
    this.tabRow.append(this.tabEnd);
    this.el.append(this.tabRow, ...this.panels.values());
    this.panels.get('home')!.append(this.bodyEnd);
    place.before(this.el);
    // the buttons run the same commands as the menus, or pick their tool
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cmd], button[data-cr-tool]');
      if (!b || !this.el.contains(b)) return;
      if (b.dataset.crTool) host.pickTool(b.dataset.crTool);
      else if (b.dataset.cmd && !b.closest('.cr-body-end, .cr-tab-end')) host.command(b.dataset.cmd);
    });
  }

  private panel(tab: RibbonTab): HTMLDivElement {
    const p = document.createElement('div');
    p.className = 'rb-panel';
    p.dataset.crPanel = tab.id;
    p.hidden = tab.id !== 'home';
    p.setAttribute('role', 'tabpanel');
    if (tab.context) p.classList.add('cr-ctx-panel');
    for (const g of tab.groups) {
      const items = g.items.filter((it) => !('tool' in it) || this.host.hasTool(it.tool));
      if (!items.length && !g.gallery && !g.special) continue;
      const group = document.createElement('div');
      group.className = 'rb-group';
      const row = document.createElement('div');
      row.className = 'rb-row cr-rows';
      if (g.special === 'clipboard') this.clipboard(row);
      if (g.special === 'font') {
        row.className = 'rb-row cr-font';
        // (a click in it keeps text being typed open, as the Text Formatting toolbox does)
        row.dataset.keepsTyping = '';
        this.host.fontGroup(row);
      }
      if (g.gallery) {
        // the gallery fills its host itself (main.ts mounts every [data-favorites-gallery])
        row.className = 'rb-row cr-gallery';
        const host = document.createElement('div');
        host.className = 'rb-styles-host';
        host.dataset.favoritesGallery = '';
        row.append(host);
      }
      for (const it of items) row.append(this.button(it));
      const label = document.createElement('div');
      label.className = 'rb-label';
      label.textContent = g.name;
      group.append(row, label);
      p.append(group);
    }
    return p;
  }

  /** Paste (with its ▾), then Cut, Copy and Format Painter in a column: as the Spreadsheet's Clipboard group. */
  private clipboard(row: HTMLElement): void {
    row.className = 'rb-row cr-clipboard';
    const btn = (cmd: string, html: string, title: string, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      if (cls) b.className = cls;
      b.dataset.cmd = cmd;
      b.title = title;
      b.innerHTML = html;
      return b;
    };
    const paste = document.createElement('div');
    paste.className = 'rb-col rb-paste';
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'rb-paste-more';
    more.textContent = '▾';
    more.title = 'Paste options: Paste, or Paste SMILES (text on the clipboard read as structures)';
    more.setAttribute('aria-label', 'Paste options');
    more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', () => this.host.pasteMenu(more.getBoundingClientRect()));
    paste.append(btn('paste', '<span class="rb-icon">⎘</span>Paste', 'Paste (Ctrl+V): structures from ChemDraw, pictures or text', 'rb-big'), more);
    const col = document.createElement('div');
    col.className = 'rb-col';
    col.append(
      btn('cut', 'Cut', 'Cut (Ctrl+X)'),
      btn('copy', 'Copy', 'Copy (Ctrl+C): structures go as a drawing for ChemDraw, Word and PowerPoint'),
      btn('format-painter', '<span class="rb-lead" data-ic-lead="format-painter"></span>Format Painter', 'Format Painter: copy the look of the selection (or of the text where the caret is) to what you click next. Double-click to keep painting until Esc'),
    );
    col.lastElementChild!.setAttribute('aria-pressed', 'false');
    row.append(paste, col);
  }

  private button(it: RibbonItem): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    if ('cmd' in it) b.dataset.cmd = it.cmd; else b.dataset.crTool = it.tool;
    const pic = this.host.icon(it);
    const name = it.label.replace(/…$/, '');
    b.title = it.tip ?? it.label;
    b.setAttribute('aria-label', name);
    if (it.major) {
      // picture over its name, both rows tall; a long name breaks onto two lines
      b.className = 'rb-big cr-major';
      const words = name.split(' ');
      // (two lines in Classic, one in Simplified: the space between them shows there)
      const two = words.length > 1 ? `<span class="cr-line">${esc(words.slice(0, Math.ceil(words.length / 2)).join(' '))}</span> <span class="cr-line">${esc(words.slice(Math.ceil(words.length / 2)).join(' '))}</span>` : esc(name);
      b.innerHTML = `<span class="rb-icon">${pic ?? ''}</span><span class="cr-name">${two}</span>`;
    } else {
      b.className = 'rb-iconbtn cr-minor';
      // a command with no picture yet shows a short form of its name
      b.innerHTML = pic ?? `<span class="cr-word">${esc(name)}</span>`;
    }
    return b;
  }

  /** Show it (the Canvas) or hide it (other modes). */
  show(on: boolean): void {
    this.el.hidden = !on;
  }

  /** The look: two rows (Classic) or one (Simplified). */
  setLook(look: RibbonLook): void {
    this.el.classList.toggle('cr-classic', look === 'classic');
    this.el.classList.toggle('cr-simple', look === 'simple');
  }

  get look(): RibbonLook {
    return this.el.classList.contains('cr-simple') ? 'simple' : 'classic';
  }

  get tab(): string {
    return [...this.tabs].find(([, b]) => b.getAttribute('aria-selected') === 'true')?.[0] ?? 'home';
  }

  /** Open a tab. */
  pick(id: string): void {
    if (!this.tabs.has(id)) return;
    for (const [k, b] of this.tabs) b.setAttribute('aria-selected', String(k === id));
    for (const [k, p] of this.panels) p.hidden = k !== id;
    // (the Analysis box stays at the right end of whichever tab is open)
    this.panels.get(id)!.append(this.bodyEnd);
    this.el.dispatchEvent(new CustomEvent('cr-tab', { detail: id }));
  }

  /**
   * The kind of object being drawn or selected (or none): its tab comes up and opens; when it
   * goes, the ribbon goes back to the tab picked last.
   */
  setContext(kind: ContextKind | null): void {
    if (kind === this.context) return;
    this.context = kind;
    for (const tab of CANVAS_TABS) if (tab.context) this.tabs.get(tab.id)!.hidden = tab.context !== kind;
    this.pick(kind ?? this.chosen);
  }
}
