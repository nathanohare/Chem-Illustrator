// The program's commands in one place: each one's id (what command() runs), its name, what it
// does (the tooltip) and the kinds of tab it works in, and the menus built from them. The first
// step of moving every command here (design critique #18): the Insert menu is made from this
// list, so a new command is written once and shows in the menu, Search and the quick bar with
// one name. The other menus still come from index.html until they move here too.

/** A command: its id, its name in the menus, what it does, and the kinds of tab it works in (all when left out). */
export interface CommandDef {
  id: string;
  label: string;
  title?: string;
  /** The tabs it works in, as the menus' data-modes: drawing, slides, sheet, document, design. */
  modes?: string;
  /** Classes on its menu item (keyframes-only: shown only for canvas slides). */
  className?: string;
}

/** A menu's entries: commands, '-' for a line, and submenus. */
export type MenuEntry = CommandDef | '-' | { submenu: string; modes?: string; items: MenuEntry[] };

/** Insert. */
export const INSERT_MENU: MenuEntry[] = [
  { id: 'name-to-structure', label: 'Structure from Name or SMILES…', title: 'A structure from its name or SMILES: in the drawing, in the text at the caret, or in the selected cell' },
  { id: 'insert-structure', label: 'Structure', modes: 'document', title: 'Draw a structure or scheme to put in the text at the caret' },
  { id: 'draw-structure', label: 'Structure in Cell', modes: 'sheet' },
  '-',
  { id: 'insert-picture', label: 'Picture…', modes: 'drawing slides design document' },
  { submenu: 'Picture Tools', modes: 'drawing slides design document', items: [
    { id: 'crop', label: 'Crop Picture', modes: 'drawing slides design', title: 'Cut the edges off the selected picture' },
    { id: 'picture-format', label: 'Picture Format…', modes: 'drawing slides design document', title: 'Brightness, contrast, sharpen, recolour, transparency, Remove Background, crop to a shape or proportions' },
  ] },
  { id: 'text-box', label: 'Text Box', modes: 'drawing slides design' },
  { id: 'insert-table', label: 'Table…', modes: 'drawing slides design document', title: 'A table in the ACS style; or paste cells from Excel or a sheet' },
  { id: 'insert-chart', label: 'Chart…', modes: 'drawing slides design document', title: 'A chart with its own data (type or paste it in a grid), saved as a Word or PowerPoint chart' },
  { id: 'insert-shapes', label: 'Shapes…', modes: 'slides design document', title: 'Basic shapes, block arrows, flowchart shapes, callouts and lab glassware' },
  { id: 'insert-icons', label: 'Icons…', modes: 'slides design document', title: 'About 7,000 icons, lab and science ones first: glassware, molecules, hazard and safety signs' },
  { id: 'insert-diagram', label: 'Diagram…', modes: 'drawing slides design document', title: 'Lists, processes, cycles, hierarchies, Venn diagrams, matrices and pyramids drawn from lines of text, like PowerPoint\'s SmartArt' },
  { id: 'insert-equation', label: 'Equation…', modes: 'slides design document', title: 'An equation typed as LaTeX (x^2, \\frac{a}{b}, \\alpha), shown as maths; a Word or PowerPoint equation in .docx and .pptx files' },
  '-',
  { id: 'insert-symbol', label: 'Symbol…', title: 'Greek letters, arrows, maths and chemistry signs, accented letters: find one by name (degree, angstrom) or code, with the ones you used lately first' },
  { id: 'insert-link', label: 'Link…', title: 'Link the selected text to a web page, a DOI, a file or a place in this file (Ctrl+K while typing). Ctrl+click a link to follow it' },
  { id: 'alt-text', label: 'Alt Text…', title: 'Alt text for the picture, chart or structure picked: what it shows, for people who can\'t see it (screen readers). Kept as its alt text in Word, PowerPoint and Excel' },
  { id: 'new-comment', label: 'New Comment', modes: 'slides sheet' },
  '-',
  { submenu: 'Presentation', modes: 'slides', items: [
    { id: 'new-slide', label: 'New Slide', modes: 'slides' },
    { id: 'new-canvas-slide', label: 'New Canvas Slide', modes: 'slides', title: 'A slide with no edge: draw a whole route across it, then add keyframes, the windows the slide show steps through' },
    { id: 'duplicate-slide', label: 'Duplicate Slide', modes: 'slides' },
    { id: 'add-keyframe', label: 'Add Keyframe', className: 'keyframes-only', title: 'A new keyframe after the one picked, half a slide along to the right' },
    { id: 'keyframe-here', label: 'Keyframe from Window', className: 'keyframes-only', title: 'A new keyframe showing what is in the window now' },
    { id: 'fit-keyframe', label: 'Fit Keyframe to Selection', className: 'keyframes-only', title: 'The keyframe picked shows what is selected' },
    { id: 'delete-keyframe', label: 'Delete Keyframe', className: 'keyframes-only', title: 'Take away the keyframe picked' },
    { id: 'keyframe-title', label: 'Keyframe Title…', className: 'keyframes-only', title: 'The title shown fixed to the screen while the show is at the keyframe picked' },
    { id: 'keyframe-zone', label: 'Zone Colour…', className: 'keyframes-only', title: 'A soft tint in the background round the keyframe picked: give a part of the route its own colour' },
    { id: 'canvas-heading', label: 'Canvas Heading', className: 'keyframes-only', title: 'A large, faint label marking a part of the route, such as Fragment A or Endgame' },
    { id: 'keyframe-spotlight', label: 'Spotlight Selection', className: 'keyframes-only', title: 'In the show, what is selected stays bright and the rest of the keyframe picked dims (nothing selected: take the spotlight away)' },
    { id: 'keyframe-detour', label: 'Mark as Detour', className: 'keyframes-only', title: 'The keyframe picked is a detour off the route (a side reaction, a failed attempt): after it the show glides back to where it left the route. Again to put it back on the route' },
    { id: 'canvas-show-options', label: 'Canvas Show Options…', className: 'keyframes-only', title: 'In the show: dim what is outside the keyframe, a mini-map of the whole canvas, compound numbers that fly back to where the compound was made' },
    { id: 'reuse-slides', label: 'Reuse Slides…', modes: 'slides', title: 'Slides from another PowerPoint file: see them all, pick the ones you want' },
    { id: 'insert-slide-zoom', label: 'Slide Zoom…', modes: 'slides', title: 'Pictures of other slides that zoom into them in the slide show' },
    { id: 'insert-summary-zoom', label: 'Summary Zoom…', modes: 'slides', title: 'A slide of zooms, one for each part of the talk' },
    { id: 'action-settings', label: 'Action…', modes: 'slides', title: 'What a click on the selected shape or action button does in the slide show' },
    { id: 'insert-video', label: 'Video…', modes: 'slides', title: 'A video from a file that plays in the slide show and in PowerPoint' },
    { id: 'insert-audio', label: 'Audio…', modes: 'slides', title: 'A sound from a file that plays in the slide show and in PowerPoint' },
    { id: 'header-footer', label: 'Header & Footer…', modes: 'slides', title: 'The date, slide number and footer on the slides, and the header and footer of notes pages and handouts' },
  ] },
  { submenu: 'Spreadsheet', modes: 'sheet', items: [
    { id: 'new-note', label: 'New Note', modes: 'sheet' },
    { id: 'property-column', label: 'Insert Property Columns…', modes: 'sheet' },
    { id: 'isotope-pattern', label: 'Isotope Pattern…', modes: 'sheet' },
    { id: 'reagent-table', label: 'New Reagent Table', modes: 'sheet' },
    '-',
    { id: 'chart-scatter', label: 'Insert Scatter Chart', modes: 'sheet' },
    { id: 'chart-column', label: 'Insert Column Chart', modes: 'sheet' },
    { id: 'insert-pivot', label: 'Insert PivotTable…', modes: 'sheet' },
    { id: 'insert-pivot-chart', label: 'Insert PivotChart…', modes: 'sheet' },
    { id: 'insert-dashboard', label: 'Insert Dashboard', modes: 'sheet' },
    '-',
    { id: 'insert-picture-sheet', label: 'Insert Picture…', modes: 'sheet' },
    { id: 'insert-text-box', label: 'Insert Text Box', modes: 'sheet' },
    { id: 'insert-cells', label: 'Insert Rows or Columns', modes: 'sheet' },
    { id: 'insert-sheet', label: 'Insert Worksheet', modes: 'sheet' },
  ] },
  { submenu: 'Document', modes: 'document', items: [
    { id: 'insert-object', label: 'Object…', modes: 'document', title: 'Another program\'s file kept whole in the document (an Excel workbook, a PDF, anything): shown as its cells, first page or an icon; double-click it to open it in its program' },
    { id: 'insert-caption', label: 'Caption…', modes: 'document', title: 'A numbered caption: Figure 1, Scheme 2, Table S1…' },
    { id: 'cross-reference', label: 'Cross-reference…', modes: 'document', title: '"Figure 2" in the text, which follows the caption\'s number' },
    { id: 'compound-number', label: 'Compound Number…', modes: 'document', title: 'A bold compound number that renumbers itself' },
    { id: 'insert-citation', label: 'Citation…', modes: 'document', title: 'Cite references: superscript numbers in order of first citation' },
    { id: 'insert-bibliography', label: 'Bibliography', modes: 'document', title: 'The references cited, numbered, in the journal style' },
    '-',
    { id: 'insert-footnote', label: 'Footnote', modes: 'document', title: 'A footnote at the foot of the page (Ctrl+Alt+F)' },
    { id: 'insert-endnote', label: 'Endnote', modes: 'document', title: 'An endnote after the text (Ctrl+Alt+D)' },
    { id: 'insert-bookmark', label: 'Bookmark…', modes: 'document', title: 'Name the paragraph the caret is in, so links can go to it (Ctrl+Shift+F5)' },
    '-',
    { id: 'page-break', label: 'Page Break', modes: 'document' },
    { id: 'breaks-nextPage', label: 'Section Break (Next Page)', modes: 'document', title: 'A new section on a new page: it can have its own paper, margins, columns, header and footer, page numbers and line numbers' },
    { id: 'breaks-continuous', label: 'Section Break (Continuous)', modes: 'document', title: 'A new section on the same page (one column of title and abstract, then two columns of text)' },
    '-',
    { submenu: 'Tables and Indexes', items: [
      { id: 'insert-toc', label: 'Table of Contents…', modes: 'document', title: 'The headings (Heading 1, 2, 3) with their page numbers; it updates by itself' },
      { id: 'insert-tof', label: 'Table of Figures…', modes: 'document', title: 'The Figure, Scheme, Table or Chart captions with their page numbers; it updates by itself' },
      { id: 'mark-entry', label: 'Mark Index Entry…', modes: 'document', title: 'Mark the selected word or phrase as an index entry (Alt+Shift+X)' },
      { id: 'insert-index', label: 'Index…', modes: 'document', title: 'The entries marked, A to Z, with their page numbers; it updates by itself' },
      { id: 'mark-citation', label: 'Mark Citation…', modes: 'document', title: 'Mark the selected authority for the table of authorities (Alt+Shift+I)' },
      { id: 'insert-toa', label: 'Table of Authorities…', modes: 'document', title: 'The authorities marked, by category, with their pages; it updates by itself' },
    ] },
    { submenu: 'Form Fields', items: [
      { id: 'insert-form-text', label: 'Text Form Field…', modes: 'document', title: 'A text form field to fill in' },
      { id: 'insert-form-check', label: 'Check Box Form Field…', modes: 'document', title: 'A check box form field' },
      { id: 'insert-form-drop', label: 'Drop-Down Form Field…', modes: 'document', title: 'A drop-down form field' },
    ] },
  ] },
];

/** Every command in the menus made here, by id. */
const BY_ID = new Map<string, CommandDef>();
function collect(items: MenuEntry[]): void {
  for (const it of items) {
    if (it === '-') continue;
    if ('submenu' in it) collect(it.items);
    else BY_ID.set(it.id, it);
  }
}
collect(INSERT_MENU);

/** A command's entry, if it is one of the commands here. */
export function commandDef(id: string): CommandDef | undefined {
  return BY_ID.get(id);
}

/** Every command here. */
export function commandDefs(): CommandDef[] {
  return [...BY_ID.values()];
}

/** Fill a menu with its entries: the same buttons, lines and submenus as the menus written in index.html. */
export function renderMenu(menu: HTMLElement, items: MenuEntry[]): void {
  const doc = menu.ownerDocument;
  for (const it of items) {
    if (it === '-') { menu.append(doc.createElement('hr')); continue; }
    if ('submenu' in it) {
      const wrap = doc.createElement('div');
      wrap.className = 'submenu';
      if (it.modes) wrap.dataset.modes = it.modes;
      const head = doc.createElement('button');
      head.setAttribute('role', 'menuitem');
      head.className = 'has-sub';
      head.setAttribute('aria-haspopup', 'menu');
      head.setAttribute('aria-expanded', 'false');
      head.textContent = it.submenu;
      const sub = doc.createElement('div');
      sub.className = 'menu sub';
      sub.setAttribute('role', 'menu');
      sub.hidden = true;
      renderMenu(sub, it.items);
      wrap.append(head, sub);
      menu.append(wrap);
      continue;
    }
    const b = doc.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.dataset.cmd = it.id;
    if (it.modes) b.dataset.modes = it.modes;
    if (it.className) b.className = it.className;
    if (it.title) b.title = it.title;
    b.textContent = it.label;
    menu.append(b);
  }
}
