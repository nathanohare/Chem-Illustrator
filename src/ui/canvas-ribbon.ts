// The Canvas ribbon: a compact ribbon over the drawing with the chemistry commands that have no
// toolbox of their own, or that are hard to find in the menus. It is a tabbed ribbon like the
// other modes' (so collapsing, fitting a narrow window, command search and Customize work the
// same), with two rows of buttons under the tabs. Only the major commands carry words (the groups
// have no names shown); the rest are pictures, named in their tooltips. Settings ▸ Ribbon offers
// the one-row Simplified look.
//
// The tabs stay put whatever is drawn or selected: the Canvas has no tabs that come and go with an
// object (the arrow commands are on Chemistry, the ring and bond tools in the toolbox, and all of
// them on the right-click menu). The right end of the tab row holds the warnings, and the right
// end of the buttons a one-line Analysis drop-down (see canvas-ribbon-boxes.ts).

/** A command button (data-cmd, run as the menus run it) or a drawing tool. */
export type RibbonItem =
  | { cmd: string; label: string; major?: boolean; tip?: string }
  | { tool: string; label: string; major?: boolean; tip?: string };
/**
 * A group: its buttons, or one built specially: the Format Favorites gallery, the Clipboard (Paste,
 * Cut, Copy and Format Painter, as the Spreadsheet's Home tab has them), or the Font and Paragraph
 * groups (every button and box of the text formatting bar, which hides while they show).
 */
export interface RibbonGroup { name: string; items: RibbonItem[]; gallery?: 'favorites'; special?: 'clipboard' | 'font' | 'paragraph' }
export interface RibbonTab { id: string; title: string; groups: RibbonGroup[] }

const c = (cmd: string, label: string, major = false): RibbonItem => ({ cmd, label, major });

/** What the Canvas ribbon holds. Home is the essentials; the other tabs take the rest. */
export const CANVAS_TABS: RibbonTab[] = [
  {
    id: 'home', title: 'Home', groups: [
      // first, as the Spreadsheet's Home tab starts
      { name: 'Clipboard', items: [], special: 'clipboard' },
      { name: 'Font', items: [], special: 'font' },
      { name: 'Paragraph', items: [], special: 'paragraph' },
      // (filled by the shared Format Favorites gallery, as on every mode's Home tab)
      { name: 'Format Favorites', items: [], gallery: 'favorites' },
      { name: 'Schemes', items: [c('smart-scheme', 'Smart Scheme', true), c('catalytic-cycle', 'Catalytic Cycle', true), c('convert-smart-scheme', 'Convert to Smart Scheme'), c('stoichiometry-table', 'Stoichiometry Table…'), c('check-balance', 'Check Balance…'), c('map-atoms', 'Map Atoms…')] },
      { name: 'Diagrams', items: [c('energy-diagram', 'Energy Diagram', true), c('mo-diagram', 'MO Diagram…'), c('orbital', 'Orbital…'), c('ts-brackets', 'Transition State Brackets ‡'), c('torsion-chart', 'Torsional Energy Chart…')] },
      { name: 'Mechanism', items: [c('animate-reaction', 'Animate', true), c('check-arrows', 'Check Arrows'), c('draw-from-arrows', 'Draw Next Intermediate'), c('homolysis-arrows', 'Homolysis Arrows'), c('model-3d', '3-D Model…')] },
      { name: 'Insert', items: [c('name-to-structure', 'Name to Structure…'), c('import-picture', 'Structures from Picture…'), c('sequence-to-structure', 'Structure from Sequence…'), c('tlc-plate', 'TLC Plate…'), c('insert-table', 'Table'), c('rgroup-table', 'R-Group Table…')] },
      // (one button with a menu; the Chemistry tab has the whole NMR group. Left out where NMR isn't offered)
      { name: 'NMR', items: [{ cmd: 'nmr-menu', label: 'NMR', major: true, tip: 'NMR: predict, the spectrum window, shifts on the drawing, Check Data, settings' }] },
      { name: 'Look Up', items: [c('structure-to-name', 'Structure to Name'), c('find-cas', 'Find CAS RN'), c('pubchem-lookup', 'Look Up on PubChem'), c('knowledge-base', 'Knowledge Base…'), c('compound-library', 'Compound Library…'), c('periodic-table', 'Periodic Table…'), c('lab-calculator', 'Lab Calculator…')] },
    ],
  },
  {
    id: 'insert', title: 'Insert', groups: [
      { name: 'Structures', items: [c('name-to-structure', 'Name to Structure', true), c('import-picture', 'Structures from Picture…'), c('sequence-to-structure', 'Structure from Sequence…'), c('crystal-structure', 'Crystal Structure (CIF)…'), c('ligand-library', 'Ligand Library…'), c('compound-library', 'Compound Library…')] },
      { name: 'Projections', items: [c('newman-projection', 'Newman Projection', true), c('model-3d', '3-D Model…'), c('turn-3d', '3-D Rotation…')] },
      { name: 'Lab', items: [c('tlc-plate', 'TLC Plate', true), c('insert-table', 'Table'), c('rgroup-table', 'R-Group Table…'), c('stoichiometry-table', 'Stoichiometry Table…'), c('lab-calculator', 'Lab Calculator…')] },
    ],
  },
  {
    id: 'chemistry', title: 'Chemistry', groups: [
      { name: 'Structure', items: [c('clean-up', 'Clean Up', true), c('check-structure', 'Check Structure'), c('expand-label', 'Expand Label'), c('contract-label', 'Contract Label'), c('stereo-labels', 'Stereo Labels')] },
      { name: 'Reaction', items: [c('clean-up-reaction', 'Clean Up Reaction', true), c('number-compounds', 'Number Compounds'), c('add-frame', 'Add Frame'), c('attach-descriptors', 'Attach Descriptors')] },
      { name: 'NMR', items: [c('predict-nmr', 'Predict NMR', true), { cmd: 'nmr-1h', label: '¹H', tip: 'Show the ¹H prediction' }, { cmd: 'nmr-13c', label: '¹³C', tip: 'Show the ¹³C prediction' }, { cmd: 'nmr-solvent', label: 'Solvent…', tip: 'Solvent for the prediction' }, c('nmr-window', 'Spectrum Window'), c('nmr-marks', 'Show on Drawing'), c('nmr-check', 'Check Data…'), c('nmr-settings', 'NMR Settings…')] },
      { name: 'Rings', items: [c('aromatic-circles', 'Aromatic Circles'), c('fill-rings', 'Fill Rings'), c('hapto-bond', 'Add Hapto Bond (η)')] },
      // (once on an Arrow tab that came up with a selected arrow)
      { name: 'Arrows', items: [c('clean-up-arrow', 'Clean Up Arrow', true), c('arrow-reverse', 'Reverse Direction'), c('flip-arrow-bend', 'Flip Bend'), c('arrow-single-curve', 'Single Curve'), c('arrow-s-shape', 'S-Shape'), c('arrow-shape-u', 'U-Turn'), c('arrow-shape-loop', 'Loop'), c('arrow-add-bend', 'Add Bend'), c('arrow-remove-bend', 'Remove Bend'), c('arrow-smooth-path', 'Smooth Path'), c('arrow-simplify-path', 'Simplify Path'), c('attach-arrow', 'Attach to Structure'), c('detach-arrow', 'Detach from Structure')] },
    ],
  },
  {
    id: 'arrange', title: 'Arrange', groups: [
      { name: 'Align', items: [c('align-left', 'Align Left'), c('align-hcenter', 'Align Center'), c('align-right', 'Align Right'), c('align-top', 'Align Top'), c('align-vcenter', 'Align Middle'), c('align-bottom', 'Align Bottom')] },
      { name: 'Distribute', items: [c('distribute-h', 'Distribute Horizontally'), c('distribute-v', 'Distribute Vertically'), c('arrange-row', 'Arrange in a Row'), c('arrange-column', 'Arrange in a Column'), c('arrange-grid', 'Arrange in a Grid…')] },
      { name: 'Rotate', items: [c('flip-h', 'Flip Horizontal'), c('flip-v', 'Flip Vertical'), c('rotate-cw', 'Rotate Right 90°'), c('rotate-ccw', 'Rotate Left 90°'), c('rotate-dialog', 'Rotate…')] },
      { name: 'Order', items: [c('shape-front', 'Bring to Front'), c('shape-forward', 'Bring Forward'), c('shape-back', 'Send to Back'), c('shape-backward', 'Send Backward')] },
    ],
  },
  {
    id: 'view', title: 'View', groups: [
      { name: 'Zoom', items: [c('zoom-fit', 'Fit', true), c('focus-view', 'Focus View')] },
      { name: 'Show', items: [c('navigator', 'Document Map'), c('dark-page', 'Reading Mode'), c('show-stereo', 'Stereo Labels')] },
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
  /** Fill the Font and Paragraph groups' rows with the text formatting bar's buttons and boxes. */
  textGroups(font: HTMLElement, paragraph: HTMLElement): void;
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
      b.addEventListener('click', () => this.pick(tab.id));
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
    const text: Partial<Record<'font' | 'paragraph', HTMLElement>> = {};
    for (const g of tab.groups) {
      const items = g.items.filter((it) => !('tool' in it) || this.host.hasTool(it.tool));
      if (!items.length && !g.gallery && !g.special) continue;
      const group = document.createElement('div');
      group.className = 'rb-group';
      const row = document.createElement('div');
      row.className = 'rb-row cr-rows';
      if (g.special === 'clipboard') this.clipboard(row);
      if (g.special === 'font' || g.special === 'paragraph') {
        row.className = 'rb-row cr-font';
        // (a click in them keeps text being typed open, as the Text Formatting toolbox does, and so
        // does a click on the button they fold into in a narrow window)
        group.dataset.keepsTyping = '';
        text[g.special] = row;
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
    if (text.font && text.paragraph) this.host.textGroups(text.font, text.paragraph);
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
}
