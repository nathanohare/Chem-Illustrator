// Hotkeys as data. Every key is a binding from a key press to an action, in one of these
// places: pointing at an atom, at a bond, at empty space, anywhere, in slides, in sheets, in
// documents, or while typing a caption.
// The defaults copy ChemDraw (checked in ChemDraw 25, see the notes in DEFAULT_KEYS); the
// person's own changes are kept separately, as a small readable list in the settings file,
// so new defaults in later versions still reach them.

export type KeyContext = 'atom' | 'bond' | 'space' | 'command' | 'slides' | 'sheet' | 'document' | 'text';

export const CONTEXTS: { id: KeyContext; title: string; note: string }[] = [
  { id: 'atom', title: 'Pointing at an atom', note: 'Point at an atom (it highlights blue) and press the key. Letters are case-sensitive: F and f do different things.' },
  { id: 'bond', title: 'Pointing at a bond', note: 'Point at a bond and press the key.' },
  { id: 'space', title: 'Pointing at empty space', note: 'Switch tools when nothing is highlighted.' },
  { id: 'command', title: 'Anywhere', note: 'Menu commands. Plain keys here only work when nothing is highlighted.' },
  { id: 'slides', title: 'In presentations', note: 'Menu commands for presentations. While a presentation is showing, these keys come before the ones for anywhere.' },
  { id: 'sheet', title: 'In spreadsheets', note: "Excel's keys for spreadsheets. While a spreadsheet is showing, these keys come before the ones for anywhere." },
  { id: 'document', title: 'In documents', note: "Word's keys for documents. While a document is showing, these come before the ones for typing and for anywhere." },
  { id: 'text', title: 'Typing text', note: 'Styling while typing a caption, a text box or a document.' },
];

/** The parts of a KeyboardEvent a key press is read from (so tests can pass plain objects). */
export interface KeyPress {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  getModifierState?(key: string): boolean;
}

const MODIFIERS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'OS', 'Dead', 'Unidentified', 'Process', 'Compose']);

/** Physical keys whose character is the same on most layouts, for Ctrl and Alt shortcuts. */
const CODE_CHARS: Record<string, string> = {
  Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Backquote: '`',
  NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.',
};

/**
 * The name of a key press, as stored in the key map:
 * - a plain character is itself, case and all ("f", "F" for Shift+F, "+", "'");
 * - other keys go by name, with Shift written out ("Enter", "Shift+Tab", "Space", "F5");
 * - with Ctrl or Alt, the modifiers come first in a fixed order and letters are capitals
 *   ("Ctrl+Shift+K", "Ctrl+Alt+C", "Alt+ArrowUp"). Cmd on a Mac counts as Ctrl.
 * Null for a modifier on its own.
 */
export function chordOf(e: KeyPress): string | null {
  const key = e.key;
  if (!key || MODIFIERS.has(key)) return null;
  // Windows reports Ctrl+Alt as AltGr. A key that still gives its own letter or digit (Ctrl+Alt+0
  // on a US keyboard) is a shortcut; one that gives another character (AltGr+Q is @ in German) is typing.
  const own = /^(?:Key([A-Z])|Digit(\d))$/.exec(e.code ?? '');
  const altGr = !!e.getModifierState?.('AltGraph') && !(e.ctrlKey && e.altKey && own && key.toUpperCase() === (own[1] ?? own[2]));
  const ctrl = !altGr && !!(e.ctrlKey || e.metaKey);
  const alt = !altGr && !!e.altKey;
  const shift = !!e.shiftKey;
  const printable = key.length === 1 && key !== ' ';
  if (ctrl || alt) {
    // The letter or digit on the key, as the keyboard layout gives it (Ctrl+Z is Z on a German or
    // French keyboard too, wherever the key sits). Ctrl and Alt change the character on some
    // keyboards (Alt+K is ˚ on a Mac), and other alphabets have no A to Z, so then the physical
    // key is read instead.
    const code = e.code ?? '';
    let base: string;
    const m = /^Key([A-Z])$/.exec(code) || /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (/^[a-z0-9]$/i.test(key)) base = key.toUpperCase();
    else if (m) base = m[1];
    else if (CODE_CHARS[code]) base = CODE_CHARS[code];
    else if (printable) base = key.toUpperCase();
    else base = keyName(key);
    return [ctrl && 'Ctrl', alt && 'Alt', shift && 'Shift', base].filter(Boolean).join('+');
  }
  // the number pad's + and − (and a typed minus sign) work as the main keyboard's
  if (e.code === 'NumpadSubtract' || key === '−' || key === 'Subtract') return '-';
  if (e.code === 'NumpadAdd' || key === 'Add') return '+';
  if (printable) return key;
  return (shift ? 'Shift+' : '') + keyName(key);
}

function keyName(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Esc') return 'Escape';
  if (key === 'Del') return 'Delete';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

const ARROWS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };

/** A key as people read it: "Shift+F", "f", "Ctrl+Shift+K", "Alt+↑". */
export function displayChord(chord: string, mac = false): string {
  if (chord.length === 1) return /[A-Z]/.test(chord) ? `Shift+${chord}` : chord;
  const parts = chord.split('+');
  // "Ctrl++" splits into an empty last part
  if (chord.endsWith('++')) { parts.splice(parts.length - 2, 2, '+'); }
  return parts
    .map((p) => (p === 'Ctrl' && mac ? '⌘' : p === 'Alt' && mac ? '⌥' : ARROWS[p] ?? p))
    .join('+');
}

/** "label CF3" → verb "label", arg "CF3". */
export function parseAction(action: string): { verb: string; arg: string } {
  const i = action.indexOf(' ');
  return i < 0 ? { verb: action, arg: '' } : { verb: action.slice(0, i), arg: action.slice(i + 1) };
}

// ------------------------------------------------------------------ what each action is called

const ATOM_ACTIONS: Record<string, string> = {
  bond: 'Grow a bond (zig-zag)',
  'ring-bond': 'Grow a bond (ring mode: the other side; longer on busy atoms)',
  carbonyl: 'C=O (an end atom becomes C=O with the chain continuing)',
  phenyl: 'Phenyl',
  wedge: 'Wedge (plus Me on an end atom)',
  'hash-wedge': 'Hashed wedge (plus Me on an end atom)',
  cyclohexyl: 'Cyclohexyl, or spiro on a ring atom',
  cyclopentyl: 'Cyclopentyl, or spiro on a ring atom',
  cyclobutyl: 'Cyclobutyl, or spiro on a CH2',
  cyclopropyl: 'Cyclopropyl, or spiro on a CH2',
  methylidene: '=CH2 (then 1 for E, 0 for Z)',
  dimethyl: 'Two methyls (iPr, gem-dimethyl)',
  tbu: 't-Bu (on a CH2 in a chain: a wedge and a plain bond)',
  'cp-hapto': 'η⁵-Cp on a metal',
  'arene-hapto': 'η⁶-benzene on a metal',
  alkyne: 'Alkyne',
  sulfonyl: 'Sulfonyl (SO2)',
  plus: 'Charge +1',
  minus: 'Charge −1',
  number: 'Show or hide the atom number',
  attach: 'Attachment point',
  nickname: 'Choose an abbreviation…',
  properties: 'Atom properties (Style panel)',
  'edit-label': 'Type a label',
  clear: 'Remove the label, then the atom',
  select: 'Select the atom',
};

const BOND_ACTIONS: Record<string, string> = {
  single: 'Single', double: 'Double', triple: 'Triple', dashed: 'Dashed', partial: 'Partial (transition state)', 'dashed-double': 'Dashed double',
  bold: 'Bold', 'bold-double': 'Bold double', wavy: 'Wavy', wedge: 'Wedge (again to reverse)',
  'hash-wedge': 'Hashed wedge (again to reverse)', hashed: 'Hashed', left: 'Double bond: second line left',
  center: 'Double bond: centered', right: 'Double bond: second line right', properties: 'Bond properties (Style panel)',
  select: 'Select the bond', delete: 'Delete the bond',
};

const FUSE_ACTIONS: Record<string, string> = {
  benzene: 'Fuse benzene', cyclopentadiene: 'Fuse cyclopentadiene', '3': 'Fuse cyclopropane', '4': 'Fuse cyclobutane',
  '5': 'Fuse cyclopentane', '6': 'Fuse cyclohexane', '7': 'Fuse cycloheptane', '8': 'Fuse cyclooctane',
  chair: 'Fuse a chair cyclohexane (trans on a chair)', 'chair-2': 'Fuse the other chair cyclohexane (cis on a chair)',
};

const HOTSPOT_ACTIONS: Record<string, string> = {
  left: 'Move the highlight left', right: 'Move the highlight right', up: 'Move the highlight up', down: 'Move the highlight down',
  'far-left': 'Move the highlight about 3 bonds left', 'far-right': 'Move the highlight about 3 bonds right',
  'far-up': 'Move the highlight about 3 bonds up', 'far-down': 'Move the highlight about 3 bonds down',
};

export const COMMAND_NAMES: Record<string, string> = {
  new: 'New Canvas', open: 'Open…', save: 'Save', 'save-as': 'Save As…', 'export-mol': 'Export Molfile…',
  undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste',
  'copy-smiles': 'Copy as SMILES', 'paste-smiles': 'Paste SMILES', 'copy-mol': 'Copy as Molfile', 'copy-cdxml': 'Copy as CDXML Text',
  'select-all': 'Select All', 'next-structure': 'Select the Next Structure', 'prev-structure': 'Select the Previous Structure',
  'nudge-left': 'Nudge Left 1 pt', 'nudge-right': 'Nudge Right 1 pt', 'nudge-up': 'Nudge Up 1 pt', 'nudge-down': 'Nudge Down 1 pt',
  'nudge-far-left': 'Nudge Left 10 pt', 'nudge-far-right': 'Nudge Right 10 pt', 'nudge-far-up': 'Nudge Up 10 pt', 'nudge-far-down': 'Nudge Down 10 pt',
  'align-left': 'Align Left', 'align-hcenter': 'Align Center', 'align-right': 'Align Right',
  'align-top': 'Align Top', 'align-vcenter': 'Align Middle', 'align-bottom': 'Align Bottom',
  'distribute-h': 'Distribute Horizontally', 'distribute-v': 'Distribute Vertically', 'arrange-row': 'Arrange in a Row', 'arrange-column': 'Arrange in a Column', 'arrange-grid': 'Arrange in a Grid…',
  'flip-h': 'Flip Horizontal (left-right)', 'flip-v': 'Flip Vertical (top-bottom)',
  'rotate-cw': 'Rotate 90° Clockwise', 'rotate-ccw': 'Rotate 90° Counterclockwise', 'rotate-180': 'Rotate 180°',
  'turn-ccw-1': 'Rotate 1° Counterclockwise', 'turn-cw-1': 'Rotate 1° Clockwise',
  'turn-ccw-15': 'Rotate 15° Counterclockwise', 'turn-cw-15': 'Rotate 15° Clockwise',
  'rotate-dialog': 'Rotate by an Angle…', scale: 'Scale…',
  'attach-wavy': 'Attachment Point: Wavy Bond', 'attach-star': 'Attachment Point: Star', 'attach-numbered': 'Attachment Point: Numbered', 'attach-remove': 'Remove Attachment Point',
  'turn-3d': '3-D Rotation…', 'flatten-3d': 'Flatten (forget 3-D depth)', 'newman-projection': 'Newman Projection…', 'edit-newman': 'Edit Newman Projection…', 'unlink-newman': 'Unlink from Structure', 'torsion-chart': 'Torsional Energy Chart…', 'edit-torsion': 'Edit Torsional Energy Chart…', 'copy-torsion-data': 'Copy Chart Data',
  'depth-shading': 'Depth Shading (on or off)', 'depth-shading-settings': 'Depth Shading Settings…',
  'reaction-right': 'Reaction: Arrow and Copy to the Right', 'reaction-left': 'Reaction: Arrow and Copy to the Left',
  'reaction-down': 'Reaction: Arrow and Copy Below', 'reaction-up': 'Reaction: Arrow and Copy Above',
  'fixed-length': 'Fixed Bond Lengths (on or off)', 'fixed-angles': 'Fixed Angles (on or off)',
  join: 'Join Two Selected Atoms or Bonds',
  'clean-up': 'Clean Up Structure', 'clean-up-options': 'Clean Up Options…', 'aromatic-circles': 'Aromatic Rings: Circle or Kekulé', 'periodic-table': 'Periodic Table…', 'chain-ends': 'Show/Hide Terminal Methyls', 'methyls-ch3': 'Terminal Methyls as CH3', 'methyls-me': 'Terminal Methyls as Me', highlight: 'Highlight', 'remove-highlight': 'Remove Highlight', 'smooth-highlight': 'Smooth Highlight (on or off)', 'centre-highlight': 'Center Highlight on Double Bonds (on or off)', 'soft-highlight': 'Soft Highlight Edges (on or off)', 'outline-highlight': 'Outline-Only Highlight (on or off)', 'shadow-highlight': 'Highlight Shadow (on or off)', 'glow-highlight': 'Highlight Glow (on or off)', 'highlight-look': 'Highlight Style…', 'select-highlight': 'Select Highlight', 'save-highlight-look': 'Save Highlight Style…', 'save-format-favorite': 'Save Format as Favorite…', 'format-favorites': 'Format Favorites…', 'delete-highlight-look': 'Delete Highlight Style…', 'fill-rings': 'Fill Rings', 'ring-shadow': 'Ring Fill Shadow (on or off)', 'show-style': 'Show Style Panel', 'contract-label': 'Contract Label…', 'expand-label': 'Expand Label', 'expand-label-full': 'Expand Label Fully', 'repeat-label': 'Repeat Last Label', 'hapto-bond': 'Add Hapto Bond (η)', 'split-hapto': 'Split Hapto Bond', 'hapto-kekule': 'Kekulé Form for η Ligand (or delocalized)', 'ring-flat': 'Ring Shape: Flat (\\ on a chair)', 'ring-chair': 'Ring Shape: Chair (\\ on a flat ring)', 'ring-chair-flip': 'Ring Shape: Flipped Chair', 'ring-boat': 'Ring Shape: Boat', 'ring-flip': 'Ring Flip (Shift+Tab on a chair)', 'ring-walk-cw': 'Walk Ring Clockwise (Tab on a chair)', 'ring-walk-ccw': 'Walk Ring Counterclockwise ([ on a chair)', 'define-nickname': 'Define Abbreviation…', 'delete-nickname': 'Delete Abbreviation…', 'save-template': 'Save as Template…', 'delete-template': 'Delete Template…', 'explicit-h': 'Show/Hide Explicit Hydrogens', 'clean-up-reaction': 'Clean Up Reaction', 'clean-up-arrow': 'Clean Up Arrow', 'clean-up-cycle': 'Clean Up Cycle', 'arrow-s-shape': 'Make S-Shaped Arrow', 'arrow-single-curve': 'Make Single-Curve Arrow', 'flip-arrow-bend': 'Flip Arrow Bend', 'arrow-shape-u': 'U-Turn Arrow', 'arrow-shape-loop': 'Loop Arrow', 'arrow-reverse': 'Reverse Arrow Direction', 'arrow-smooth-path': 'Smooth Arrow Path', 'arrow-simplify-path': 'Simplify Arrow Path', 'arrow-add-bend': 'Add Bend Here', 'arrow-remove-bend': 'Remove Bend', 'arrow-smooth-join': 'Smooth Join', 'arrow-symmetric-join': 'Symmetric Join', 'homolysis-arrows': 'Homolysis Arrows (fishhook pair)', 'attach-arrow': 'Attach to Structure', 'detach-arrow': 'Detach from Structure', 'command-search': 'Search Commands…', assistant: 'Assistant…', 'help-here': 'Help on This Tool or Mode', 'focus-view': 'Focus View (hide toolboxes, panel and ribbon)', 'one-column-tools': 'Toolboxes in One Column Outside Canvas', group: 'Group', ungroup: 'Ungroup', 'link-text': 'Link Text to Structure', 'unlink-text': 'Unlink Text', 'next-region': 'Next Pane', 'prev-region': 'Previous Pane', print: 'Print…', 'arrange-scheme': 'Arrange Scheme…', 'stoichiometry-table': 'Stoichiometry Table…', 'check-balance': 'Check Balance…', 'map-atoms': 'Map Atoms…', 'clear-atom-map': 'Clear Atom Map', 'map-format': 'Map Number Format…', 'copy-reaction-smiles': 'Copy Reaction as SMILES', 'copy-rxn': 'Copy Reaction as RXN', 'lab-calculator': 'Lab Calculator…', 'batch-convert': 'Batch Convert…', 'tlc-plate': 'TLC Plate…', 'crystal-structure': 'Crystal Structure (CIF)…', 'edit-plate': 'Edit Lab Figure…', 'p-orbitals': 'p Orbitals on Selected Atoms', 'edit-orbital': 'Edit Orbital…', 'mo-diagram': 'MO Diagram…', 'catalytic-cycle': 'Catalytic Cycle…', 'smart-scheme': 'Smart Scheme', 'convert-smart-scheme': 'Convert to Smart Scheme', 'fold-side': 'Side Panel (show or close)', 'ungroup-smart-scheme': 'Ungroup Smart Scheme', 'energy-diagram': 'Energy Diagram…', 'ts-brackets': 'Transition State Brackets ‡', 'edit-energy': 'Edit Energy Diagram…', 'insert-diagram': 'Diagram…', 'edit-diagram': 'Edit Diagram…', 'diagram-to-shapes': 'Convert Diagram to Shapes', 'animate-reaction': 'Animate Reaction…', 'animate-step': 'Animate This Step…', 'auto-animate-steps': 'Auto-Animate Steps…', 'insert-action-button': 'Action Button…', 'number-compounds': 'Number Compounds…', 'scheme-settings': 'Scheme Settings…', 'add-id-label': 'Add ID Label', 'lock-structures': 'Lock Structures (Presentation)', 'add-caption': 'Add Caption', 'bring-front': 'Bring Bond to Front', 'send-back': 'Send Bond to Back', 'show-roles': 'Show Reaction Roles (on or off)', 'check-structure': 'Check Structure', 'stereo-labels': 'Show Stereo Labels',
  'name-to-structure': 'Name to Structure…',
  'sequence-to-structure': 'Structure from Sequence…',
  'ui-scale-in': 'Interface Size Larger (menus, ribbons, toolboxes)', 'ui-scale-out': 'Interface Size Smaller', 'ui-scale-reset': 'Interface Size Back to 100%',
  'zoom-in': 'Zoom in', 'zoom-out': 'Zoom Out', 'zoom-fit': 'Fit the Drawing in the Window', 'zoom-selection': 'Go to Selection', 'zoom-actual': 'Actual Size', navigator: 'Document Map (on or off)', 'edge-arrows': 'Edge Arrows (on or off)', 'dot-grid': 'Dot Grid (on or off)', 'outside-tint': 'Tint Outside the Drawing (on or off)', 'navigation-settings': 'Navigation Settings…', 'page-grid': 'Page Grid (on or off)', 'page-grid-settings': 'Page Grid Settings…',
  hotkeys: 'Keyboard Shortcuts…', 'typing-spelling': 'Typing and Spelling…', 'mode-colours': 'Mode Colors…', 'edit-palettes': 'Color Palettes…', preferences: 'Settings…',
  'new-slides': 'New Presentation', 'close-tab': 'Close the File', 'next-tab': 'Next File', 'prev-tab': 'Previous File',
  'export-pdf': 'Export PDF…', 'insert-picture': 'Insert a Picture…', 'import-pdf': 'Import Structures from PDF…', 'import-picture': 'Import Structures from Picture…', 'import-paste': 'Paste Picture as Structure', crop: 'Crop the Selected Picture',
  'new-slide': 'New Slide', 'duplicate-slide': 'Duplicate Slide', 'delete-slide': 'Delete Slide',
  'new-canvas-slide': 'New Canvas Slide (no edge; the show steps through its keyframes)', 'add-keyframe': 'Add Keyframe', 'keyframe-here': 'Keyframe from Window', 'fit-keyframe': 'Fit Keyframe to Selection', 'delete-keyframe': 'Delete Keyframe', 'keyframe-title': 'Keyframe Title…', 'keyframe-zone': 'Zone Color…', 'canvas-background': 'Canvas Background…', 'canvas-heading': 'Canvas Heading', 'keyframe-spotlight': 'Spotlight Selection', 'keyframe-unspot': 'Remove Spotlight', 'keyframe-detour': 'Mark as Detour', 'canvas-show-options': 'Canvas Show Options…',
  'cut-slides': 'Cut Slides', 'copy-slides': 'Copy Slides', 'paste-slides': 'Paste Slides', 'paste-slides-keep': 'Paste Slides Keeping Their Own Look',
  'hide-slide': 'Hide Slide (or show it again)', 'selection-pane': 'Selection Pane: Every Object on the Slide, to Pick, Hide or Rename', 'reuse-slides': 'Reuse Slides from Another PowerPoint File…',
  'next-slide': 'Next Slide', 'prev-slide': 'Previous Slide', 'slide-master': 'Slide Master…',
  'edit-layouts': 'Edit Slide Layouts… (placeholders, your own layouts)', 'size-custom': 'Custom Slide Size…', 'view-normal': 'Normal View (slides)', 'view-sorter': 'Slide Sorter View',
  'add-section': 'Add Section', 'rename-section': 'Rename Section…', 'remove-section': 'Remove Section', 'remove-section-slides': 'Remove Section and Its Slides', 'remove-all-sections': 'Remove All Sections',
  'section-up': 'Move Section Up', 'section-down': 'Move Section Down', 'collapse-sections': 'Collapse All Sections', 'expand-sections': 'Expand All Sections', 'format-background': 'Format Background… (color, gradient, picture or pattern)',
  present: 'Present from the First Slide', 'present-current': 'Present from This Slide', 'presenter-view': 'Presenter View (notes, next slide and timer)',
  'dev-tools': 'Developer Tools on or off (speed panel, stress test)',
  // sheets
  'new-sheet': 'New Spreadsheet', 'insert-sheet': 'Insert a Worksheet',
  'cell-bold': 'Bold (cells)', 'cell-italic': 'Italic (cells)', 'cell-underline': 'Underline (cells)',
  'fill-down': 'Fill Down', 'fill-right': 'Fill Right', autosum: 'AutoSum', find: 'Find…',
  'format-cells': 'Number Format (in the panel)', 'format-general': 'General Number Format', 'format-number': 'Number with 2 Decimal Places',
  'format-percent': 'Percentage', 'format-scientific': 'Scientific Notation', 'format-chem': 'Formula Style in Cells (on or off)',
  'insert-cells': 'Insert Rows or Columns', 'delete-cells': 'Delete Rows or Columns',
  'hide-rows': 'Hide Rows', 'unhide-rows': 'Show Hidden Rows', 'hide-cols': 'Hide Columns', 'unhide-cols': 'Show Hidden Columns',
  'sort-up': 'Sort Smallest to Largest', 'sort-down': 'Sort Largest to Smallest', filter: 'Filter (on or off)',
  'filter-structure': 'Filter by a Substructure…', 'freeze-header': 'Freeze the Header Row (on or off)',
  'property-column': 'Insert Property Column…', 'isotope-pattern': 'Isotope Pattern…', 'structure-from-name': 'Structure from Name or SMILES…',
  'draw-structure': 'Draw a Structure in the Cell', 'reset-calculated': 'Reset to the Calculated Value',
  'merge-cells': 'Merge and Center',
  'new-note': 'New Note on the Cell (or change its note)', 'edit-note': 'Change the cell\'s note', 'delete-note': 'Delete the Notes and Comments in the Selection',
  'show-note': 'Show the cell\'s note all the time (or only when pointed at)', 'show-all-notes': 'Show All Notes (on or off)', 'convert-notes': 'Convert Notes to Comments',
  'data-validation': 'Data Validation…', 'circle-invalid': 'Circle Invalid Data (on or off)', 'pick-from-list': 'Pick from the Drop-Down List',
  'find-next': 'Find Next', 'go-to': 'Go To…', 'go-to-special': 'Go To Special…', 'fill-series': 'Fill a Series…', 'flash-fill': 'Flash Fill',
  'paste-special': 'Paste Special…', 'paste-values': 'Paste Values', 'paste-transpose': 'Paste Transposed', 'text-to-columns': 'Text to Columns…', 'remove-duplicates': 'Remove Duplicates…',
  'custom-sort': 'Sort by Several Columns…', 'advanced-filter': 'Advanced Filter…', 'clear-filter': 'Clear the Filter (show every row)',
  'freeze-panes': 'Freeze Panes Above and Left of the Cell', 'freeze-top-row': 'Freeze the Top Row', 'freeze-first-col': 'Freeze the First Column', 'unfreeze-panes': 'Unfreeze Panes',
  'split-window': 'Split the Window (on or off)',
  'insert-picture-sheet': 'Insert a Picture Over the Cells…', 'insert-text-box': 'Insert a Text Box Over the Cells', 'format-object': 'Format the Picked Shape or Picture…',
  'page-setup': 'Page Setup…', 'header-footer': 'Header and Footer…', 'print-titles': 'Print Titles…', 'page-scale': 'Print Scale…',
  'set-print-area': 'Set the Print Area to the Selection', 'clear-print-area': 'Clear the Print Area', 'insert-page-break': 'Insert a Page Break',
  'print-gridlines': 'Print Gridlines (on or off)', 'print-headings': 'Print Row and Column Headings (on or off)', 'show-page-breaks': 'Show Page Breaks (on or off)', 'print-preview': 'Print Preview',
  'add-print-area': 'Add the Selection to the Print Area', 'remove-page-break': 'Remove a Page Break', 'reset-page-breaks': 'Reset All Page Breaks',
  'sheet-margins-normal': 'Print Margins: Normal', 'sheet-margins-wide': 'Print Margins: Wide', 'sheet-margins-narrow': 'Print Margins: Narrow', 'sheet-margins-custom': 'Custom Print Margins…',
  'sheet-portrait': 'Print in Portrait', 'sheet-landscape': 'Print in Landscape',
  'sheet-paper-letter': 'Paper Size: Letter', 'sheet-paper-legal': 'Paper Size: Legal', 'sheet-paper-tabloid': 'Paper Size: Tabloid', 'sheet-paper-a4': 'Paper Size: A4', 'sheet-paper-a3': 'Paper Size: A3', 'sheet-paper-a5': 'Paper Size: A5',
  'sheet-no-scaling': 'Print with No Scaling', 'sheet-fit-page': 'Fit the Sheet on One Page', 'sheet-fit-columns': 'Fit All Columns on One Page', 'sheet-fit-rows': 'Fit All Rows on One Page',
  // documents
  'new-document': 'New Document', 'doc-align-left': 'Align Text Left', 'doc-align-center': 'Center Text', 'doc-align-right': 'Align Text Right',
  'doc-justify': 'Justify Text', 'style-normal': 'Normal Style', 'style-title': 'Title Style', 'style-h1': 'Heading 1 Style', 'style-h2': 'Heading 2 Style',
  'style-h3': 'Heading 3 Style', 'style-caption': 'Caption Style', 'page-break': 'Page Break', 'col-break': 'Column Break', 'breaks-nextPage': 'Section Break (next page)', 'breaks-continuous': 'Section Break (continuous)', 'breaks-evenPage': 'Section Break (even page)', 'breaks-oddPage': 'Section Break (odd page)', 'linenums-continuous': 'Line Numbers', 'linenums-none': 'No Line Numbers', 'linenums-options': 'Line Numbering Options…', 'page-number-format': 'Page Number Format…', 'line-single': 'Single Line Spacing',
  'line-1-5': '1.5 Line Spacing', 'line-double': 'Double Line Spacing', 'font-bigger': 'Larger Text', 'font-smaller': 'Smaller Text',
  'doc-bullets': 'Bullets', 'doc-numbering': 'Numbering', replace: 'Find and Replace…', 'insert-structure': 'Insert a Structure (draw it)', 'insert-figure': 'Insert a Figure (an area for structures, drawn on the page)', 'make-figure': 'Make the Structure a Figure', 'make-figures': 'Make the document\'s structures figures (with a preview)', 'figure-fit': 'Fit the Figure to Its Structure', 'remove-figure': 'Remove the Figure (a plain structure again)',
  'insert-caption': 'Insert a Caption…', 'cross-reference': 'Insert a Cross-Reference…', 'compound-number': 'Insert a Compound Number…', 'structure-from-name-doc': 'Insert a Structure from a Name or SMILES…',
  'insert-citation': 'Insert a Citation…', 'insert-bibliography': 'Insert the Bibliography', 'manage-references': 'Manage References…',
  'zotero-menu': 'Zotero (menu)', 'zotero-cite': 'Zotero: Add or Edit a Citation…', 'zotero-bib': 'Zotero: Add or Edit the Bibliography…', 'zotero-refresh': 'Zotero: Refresh Citations and Bibliography', 'zotero-prefs': 'Zotero: Document Preferences (citation style)…', 'zotero-unlink': 'Zotero: Unlink Citations (plain text)…',
  references: 'References of Every Open File…', 'slide-references': 'References on the Slide…', 'references-slide': 'Insert a References Slide…', 'insert-reference': 'Insert a Formatted Reference…',
  'doc-go-to': 'Go to a Page, Section, Line, Bookmark, Comment, Note, Table, Figure, Equation or Heading…', 'doc-select': 'Select (menu)', 'select-similar': 'Select Text with Similar Formatting',
  'spelling-grammar': 'Spelling and Grammar…', 'thesaurus': 'Thesaurus…', 'word-count': 'Word Count…', 'insert-date': 'Insert the Date and Time…', 'insert-field': 'Insert a Field…',
  'doc-property': 'Insert a Document Property…', 'doc-properties': 'Document Properties (title, author…)…', 'quick-parts': 'Quick Parts (menu)', 'cover-page': 'Cover Page (menu)', 'blank-page': 'Insert a Blank Page', 'remove-cover': 'Remove the Cover Page',
  'para-borders': 'Paragraph Borders (menu)', 'borders-shading': 'Borders and Shading…', 'shading-none': 'No Paragraph Shading', 'para-sort': 'Sort Paragraphs or Table Rows…',
  'insert-toc': 'Insert a Table of Contents…', 'insert-tof': 'Insert a Table of Figures…', 'mark-entry': 'Mark an Index Entry…', 'insert-index': 'Insert an Index…', 'mark-citation': 'Mark a Citation for the Table of Authorities…', 'insert-toa': 'Insert a Table of Authorities…', 'restrict-editing': 'Restrict Editing (protect the document), or Stop the Protection…', 'insert-form-text': 'Insert a Text Form Field…', 'insert-form-check': 'Insert a Check Box Form Field…', 'insert-form-drop': 'Insert a Drop-Down Form Field…', 'insert-footnote': 'Insert a Footnote', 'insert-link': 'Insert or Change a Link (web page, DOI, file, place in the file)…', 'remove-link': 'Remove the Link', 'open-link': 'Open the Link', 'insert-bookmark': 'Insert, Go to or Delete a Bookmark…', 'insert-endnote': 'Insert an Endnote', 'note-options': 'Footnote and Endnote Options…', 'insert-equation': 'Insert an Equation…', 'edit-equation': 'Change the Equation…', 'track-changes': 'Track Changes (on or off)', 'accept-change': 'Accept the Change', 'reject-change': 'Reject the Change',
  'accept-all': 'Accept All Changes', 'reject-all': 'Reject All Changes', 'next-change': 'Next Change', 'prev-change': 'Previous Change', 'review-name': 'Your Name on Changes…', 'compare-docs': 'Compare Two Versions of a Document…', 'combine-docs': 'Combine reviewers\' copies of a document…', 'new-comment': 'New Comment', 'delete-comment': 'Delete the Comment', 'delete-all-comments': 'Delete All Comments', 'resolve-comment': 'Resolve the Comment (or reopen it)', 'next-comment': 'Next Comment', 'prev-comment': 'Previous Comment', 'show-comments': 'Show Comments (on or off)', 'compare-slides': 'Compare Two Versions of a Slide Deck…', 'check-accessibility': 'Check Accessibility (alt text, contrast, slide titles, reading order)', 'rehearse-here': 'Rehearse Timings from This Slide', 'record-show-here': 'Record Narration and Timings from This Slide', 'clear-timings-slide': 'Clear the Rehearsed Timing on This Slide', 'clear-timings-all': 'Clear the Rehearsed Timings on All Slides', 'clear-narration-slide': 'Clear the Recorded Narration on This Slide', 'clear-narration-all': 'Clear the Recorded Narration on All Slides', 'preflight': 'Check the Figure Against a journal\'s author guidelines (width, text size, line weight, fonts, resolution)', 'alt-text': 'Alt Text for the Picture, Chart or Structure Picked…', 'new-from-template': 'New Document or Spreadsheet from a Template…',
  'view-print': 'Print Layout View', 'view-read': 'Read Mode', 'view-web': 'Web Layout View', 'view-outline': 'Outline View', 'view-draft': 'Draft View',
  'view-sideways': 'Pages Side to Side (on or off)', 'view-multiple': 'Multiple Pages (on or off)', 'view-one-page': 'One Page', 'view-split': 'Split the Window (on or off)',
  'doc-new-window': 'New Window on the Document', 'outline-promote': 'Promote (outline)', 'outline-demote': 'Demote (outline)', 'outline-heading1': 'Promote to Heading 1',
  'outline-body': 'Demote to Body Text', 'outline-up': 'Move the Paragraph Up (outline)', 'outline-down': 'Move the Paragraph Down (outline)',
  'outline-expand': 'Expand the Heading (outline)', 'outline-collapse': 'Collapse the Heading (outline)', 'outline-all': 'Show All Levels (outline)',
  'outline-level-1': 'Show Level 1 (outline)', 'outline-level-2': 'Show Levels 1 and 2 (outline)', 'outline-level-3': 'Show Levels 1 to 3 (outline)',
  'outline-level-4': 'Show Levels 1 to 4 (outline)', 'outline-level-5': 'Show Levels 1 to 5 (outline)', 'outline-level-6': 'Show Levels 1 to 6 (outline)',
  'outline-level-7': 'Show Levels 1 to 7 (outline)', 'outline-level-8': 'Show Levels 1 to 8 (outline)', 'outline-level-9': 'Show Levels 1 to 9 (outline)',
  'doc-strike': 'Strikethrough', 'doc-small-caps': 'Small Capitals', 'doc-all-caps': 'All Capitals', 'change-case': 'Change Case (UPPERCASE, lowercase, Capitalize Each Word in turn)',
  'clear-char-formatting': 'Clear the Text Formatting (back to the paragraph style)', 'clear-formatting': 'Clear All Formatting (back to Normal)', 'styles-pane': 'Show the Styles Pane',
  'style-h4': 'Heading 4 Style', 'style-h5': 'Heading 5 Style', 'style-h6': 'Heading 6 Style',
  'outline-first': 'Show the First Line Only (outline, on or off)', 'outline-format': 'Show Text Formatting (outline, on or off)',
};

const TEXT_ACTIONS: Record<string, string> = {
  bold: 'Bold', italic: 'Italic', underline: 'Underline', sub: 'Subscript', sup: 'Superscript', formula: 'Formula style', link: 'Insert or change a link…',
};

/** Tool names, filled in by the app (the tool bar knows what each tool is called). */
let toolNames: Record<string, string> = {};
export function registerToolNames(names: Record<string, string>): void {
  toolNames = { ...names };
}

const TABLES: Record<string, Record<string, string>> = {
  atom: ATOM_ACTIONS, bond: BOND_ACTIONS, fuse: FUSE_ACTIONS, hotspot: HOTSPOT_ACTIONS, command: COMMAND_NAMES, text: TEXT_ACTIONS,
};

/** What an action is called in the Hotkeys window and tool tips. */
export function actionName(action: string): string {
  const { verb, arg } = parseAction(action);
  if (verb === 'label') return `Label ${arg}`;
  if (verb === 'tool') return toolNames[arg] ? `${toolNames[arg]} tool` : `Tool: ${arg}`;
  return TABLES[verb]?.[arg] ?? action;
}

/** Every action that can have a key in a place, whether or not it has one now. */
export function actionsFor(ctx: KeyContext): string[] {
  const pre = (verb: string, table: Record<string, string>) => Object.keys(table).map((k) => `${verb} ${k}`);
  switch (ctx) {
    case 'atom': return [...pre('atom', ATOM_ACTIONS), ...pre('hotspot', HOTSPOT_ACTIONS)];
    case 'bond': return [...pre('bond', BOND_ACTIONS), ...pre('fuse', FUSE_ACTIONS), ...pre('hotspot', HOTSPOT_ACTIONS)];
    case 'space': return Object.keys(toolNames).map((t) => `tool ${t}`);
    case 'command': case 'slides': case 'sheet': case 'document': return pre('command', COMMAND_NAMES);
    case 'text': return pre('text', TEXT_ACTIONS);
  }
}

/** Whether an action string means something in a place (labels on atoms, tools in space…). */
export function validAction(ctx: KeyContext, action: string): boolean {
  const { verb, arg } = parseAction(action);
  if (!arg) return false;
  switch (ctx) {
    case 'atom': return verb === 'label' || (verb === 'atom' && arg in ATOM_ACTIONS) || (verb === 'hotspot' && arg in HOTSPOT_ACTIONS);
    case 'bond': return (verb === 'bond' && arg in BOND_ACTIONS) || (verb === 'fuse' && arg in FUSE_ACTIONS) || (verb === 'hotspot' && arg in HOTSPOT_ACTIONS);
    case 'space': return verb === 'tool';
    case 'command': case 'slides': case 'sheet': case 'document': return verb === 'command' && arg in COMMAND_NAMES;
    case 'text': return verb === 'text' && arg in TEXT_ACTIONS;
  }
}

// ------------------------------------------------------------------ ChemDraw's defaults

const labels = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, `label ${v}`]));
const verbs = (verb: string, m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, `${verb} ${v}`]));
const HOTSPOT_KEYS = verbs('hotspot', {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  'Shift+ArrowLeft': 'far-left', 'Shift+ArrowRight': 'far-right', 'Shift+ArrowUp': 'far-up', 'Shift+ArrowDown': 'far-down',
});

/**
 * ChemDraw's default keys (User Guide pp. 67–84, then checked in ChemDraw 25). Where the guide
 * and ChemDraw disagree, ChemDraw wins: k on an atom makes a sulfonyl group, not a K label.
 */
export const DEFAULT_KEYS: Record<KeyContext, Record<string, string>> = {
  atom: {
    ...labels({
      f: 'F', F: 'CF3', p: 'P', P: 'Ph', A: 'Ac', h: 'H', b: 'Br', B: 'B', i: 'I', r: 'R',
      s: 'S', S: 'Si', m: 'Me', n: 'N', w: 'N', N: 'NO2', c: 'C', l: 'Cl', C: 'Cl', x: 'X',
      o: 'O', q: 'O', d: 'D', e: 'Et', E: 'CO2Me', Z: 'N3', M: 'MgBr', L: 'Li', O: 'OMe',
      Q: 'Fmoc', H: 'Cbz', y: 'Boc', Y: 'Boc',
    }),
    ...verbs('atom', {
      '0': 'ring-bond', '1': 'bond', '2': 'carbonyl', '3': 'phenyl', a: 'phenyl', '4': 'wedge', '5': 'hash-wedge',
      '6': 'cyclohexyl', '7': 'cyclopentyl', '8': 'methylidene', '9': 'dimethyl', z: 'alkyne', v: 'cyclopropyl',
      u: 'cyclobutyl', K: 'tbu', k: 'sulfonyl', '+': 'plus', '-': 'minus', "'": 'number', '.': 'attach',
      '=': 'nickname', '/': 'properties', '?': 'properties', Enter: 'edit-label', Backspace: 'clear', Delete: 'clear',
      g: 'select', j: 'cp-hapto', J: 'arene-hapto',
    }),
    ...HOTSPOT_KEYS,
  },
  bond: {
    ...verbs('bond', {
      '1': 'single', '2': 'double', '3': 'triple', d: 'dashed', p: 'partial', D: 'dashed-double', b: 'bold', B: 'bold-double',
      y: 'wavy', w: 'wedge', h: 'hash-wedge', W: 'hash-wedge', H: 'hashed', l: 'left', c: 'center', r: 'right',
      '/': 'properties', '?': 'properties', g: 'select', Delete: 'delete', Backspace: 'delete',
    }),
    ...verbs('fuse', {
      a: 'benzene', z: 'cyclopentadiene', v: '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': 'chair', '0': 'chair-2',
    }),
    ...HOTSPOT_KEYS,
  },
  space: verbs('tool', {
    Space: 'select', x: 'bond-single', X: 'chain', t: 'text', e: 'arrow', j: 'ring-benzene', J: 'ring-cp',
    T: 'bracket-square',
    // not ChemDraw's, but free keys over empty space
    w: 'bond-wedge', h: 'bond-hashWedge', '2': 'bond-double', '3': 'ring-3', '4': 'ring-4', '5': 'ring-5',
    '6': 'ring-6', '7': 'ring-7', '8': 'ring-8',
  }),
  command: verbs('command', {
    'Ctrl+N': 'new', 'Ctrl+O': 'open', 'Ctrl+S': 'save', 'Ctrl+Shift+S': 'save-as',
    'Ctrl+Z': 'undo', 'Ctrl+Y': 'redo', 'Ctrl+Shift+Z': 'redo',
    'Ctrl+X': 'cut', 'Ctrl+C': 'copy', 'Ctrl+V': 'paste',
    'Ctrl+Alt+C': 'copy-smiles', 'Ctrl+Alt+P': 'paste-smiles', 'Ctrl+Alt+O': 'copy-mol', 'Ctrl+D': 'copy-cdxml',
    'Ctrl+A': 'select-all', Tab: 'next-structure', 'Shift+Tab': 'prev-structure',
    ArrowLeft: 'nudge-left', ArrowRight: 'nudge-right', ArrowUp: 'nudge-up', ArrowDown: 'nudge-down',
    'Shift+ArrowLeft': 'nudge-far-left', 'Shift+ArrowRight': 'nudge-far-right', 'Shift+ArrowUp': 'nudge-far-up', 'Shift+ArrowDown': 'nudge-far-down',
    'Ctrl+Alt+Shift+L': 'align-left', 'Ctrl+Alt+Shift+C': 'align-hcenter', 'Ctrl+Alt+Shift+R': 'align-right',
    'Ctrl+Alt+Shift+T': 'align-top', 'Ctrl+Alt+Shift+M': 'align-vcenter', 'Ctrl+Alt+Shift+B': 'align-bottom',
    'Ctrl+Alt+Shift+H': 'distribute-h', 'Ctrl+Alt+Shift+V': 'distribute-v',
    'Ctrl+Shift+H': 'flip-h', 'Ctrl+Shift+V': 'flip-v',
    'Alt+ArrowLeft': 'turn-ccw-1', 'Alt+ArrowRight': 'turn-cw-1', 'Alt+ArrowUp': 'turn-ccw-15', 'Alt+ArrowDown': 'turn-cw-15',
    'Ctrl+R': 'rotate-dialog', 'Ctrl+K': 'scale',
    'Ctrl+ArrowRight': 'reaction-right', 'Ctrl+ArrowLeft': 'reaction-left', 'Ctrl+ArrowDown': 'reaction-down', 'Ctrl+ArrowUp': 'reaction-up',
    'Ctrl+L': 'fixed-length', 'Ctrl+E': 'fixed-angles', 'Ctrl+J': 'join', 'Ctrl+G': 'group', 'Ctrl+Shift+G': 'ungroup',
    'Ctrl+Shift+K': 'clean-up', 'Alt+K': 'aromatic-circles', 'Ctrl+Shift+R': 'clean-up-reaction', 'Ctrl+Shift+N': 'name-to-structure',
    'Ctrl+Alt+=': 'ui-scale-in', 'Ctrl+Alt+Shift+=': 'ui-scale-in', 'Ctrl+Alt++': 'ui-scale-in', 'Ctrl+Alt+-': 'ui-scale-out', 'Ctrl+Alt+0': 'ui-scale-reset',
    'Ctrl+0': 'zoom-fit', 'Ctrl+=': 'zoom-in', 'Ctrl+Shift+=': 'zoom-in', 'Ctrl++': 'zoom-in', 'Ctrl+-': 'zoom-out',
    F5: 'zoom-actual', F6: 'zoom-fit', 'Shift+F6': 'zoom-selection', F7: 'zoom-in', F8: 'zoom-out',
    'Ctrl+W': 'close-tab', 'Ctrl+Tab': 'next-tab', 'Ctrl+Shift+Tab': 'prev-tab', 'Alt+Q': 'command-search', 'Ctrl+/': 'assistant', F1: 'help-here', 'Ctrl+Shift+F1': 'focus-view', 'Ctrl+,': 'preferences', 'Ctrl+P': 'print', 'Ctrl+F6': 'next-region', 'Ctrl+Alt+B': 'fold-side', 'Ctrl+Shift+F6': 'prev-region',
  }),
  // PowerPoint's keys
  slides: verbs('command', {
    'Alt+F10': 'selection-pane', F5: 'present', 'Shift+F5': 'present-current', 'Alt+F5': 'presenter-view', 'Ctrl+M': 'new-slide', 'Ctrl+N': 'new-slides',
    PageDown: 'next-slide', PageUp: 'prev-slide', 'Ctrl+Alt+M': 'new-comment', 'Alt+=': 'insert-equation', 'Ctrl+K': 'insert-link',
  }),
  // Excel's keys
  sheet: verbs('command', {
    'Ctrl+B': 'cell-bold', 'Ctrl+I': 'cell-italic', 'Ctrl+U': 'cell-underline',
    'Ctrl+2': 'cell-bold', 'Ctrl+3': 'cell-italic', 'Ctrl+4': 'cell-underline',
    'Ctrl+D': 'fill-down', 'Ctrl+R': 'fill-right', 'Alt+=': 'autosum', 'Ctrl+F': 'find', 'Ctrl+1': 'format-cells',
    'Ctrl+Shift+`': 'format-general', 'Ctrl+Shift+1': 'format-number', 'Ctrl+Shift+5': 'format-percent', 'Ctrl+Shift+6': 'format-scientific',
    'Ctrl+Shift+=': 'insert-cells', 'Ctrl++': 'insert-cells', 'Ctrl+-': 'delete-cells',
    'Ctrl+9': 'hide-rows', 'Ctrl+Shift+9': 'unhide-rows', 'Ctrl+0': 'hide-cols', 'Ctrl+Shift+0': 'unhide-cols',
    'Ctrl+Shift+L': 'filter', 'Ctrl+N': 'new-sheet', 'Shift+F11': 'insert-sheet',
    'Ctrl+Shift+N': 'structure-from-name', 'Shift+F2': 'new-note', 'Ctrl+Alt+M': 'new-comment', 'Ctrl+K': 'insert-link',
    'Ctrl+H': 'replace', 'Shift+F4': 'find-next', 'Ctrl+G': 'go-to', F5: 'go-to', 'Ctrl+E': 'flash-fill', 'Ctrl+Alt+V': 'paste-special',
  }),
  // Word's keys
  document: verbs('command', {
    'Ctrl+L': 'doc-align-left', 'Ctrl+E': 'doc-align-center', 'Ctrl+R': 'doc-align-right', 'Ctrl+J': 'doc-justify',
    'Ctrl+Alt+1': 'style-h1', 'Ctrl+Alt+2': 'style-h2', 'Ctrl+Alt+3': 'style-h3', 'Ctrl+Shift+N': 'style-normal',
    'Ctrl+Enter': 'page-break', 'Ctrl+Shift+Enter': 'col-break', 'Ctrl+1': 'line-single', 'Ctrl+5': 'line-1-5', 'Ctrl+2': 'line-double',
    'Ctrl+]': 'font-bigger', 'Ctrl+[': 'font-smaller', 'Ctrl+Shift+L': 'doc-bullets',
    'Ctrl+F': 'find', 'Ctrl+H': 'replace', 'Ctrl+N': 'new-document', 'Ctrl+Shift+E': 'track-changes', 'Ctrl+Alt+M': 'new-comment', 'Alt+=': 'insert-equation',
    'Ctrl+Alt+F': 'insert-footnote', 'Ctrl+Alt+D': 'insert-endnote', 'Ctrl+K': 'insert-link', 'Ctrl+Shift+F5': 'insert-bookmark',
    'Ctrl+Alt+N': 'view-draft', 'Ctrl+Alt+S': 'view-split',
    'Alt+Shift+ArrowLeft': 'outline-promote', 'Alt+Shift+ArrowRight': 'outline-demote', 'Alt+Shift+ArrowUp': 'outline-up', 'Alt+Shift+ArrowDown': 'outline-down',
    'Alt+Shift+=': 'outline-expand', 'Alt+Shift+-': 'outline-collapse', 'Alt+Shift+A': 'outline-all', 'Alt+Shift+N': 'compound-number', 'Alt+Shift+X': 'mark-entry', 'Alt+Shift+I': 'mark-citation',
    'Alt+Shift+1': 'outline-level-1', 'Alt+Shift+2': 'outline-level-2', 'Alt+Shift+3': 'outline-level-3', 'Alt+Shift+4': 'outline-level-4', 'Alt+Shift+5': 'outline-level-5',
    'Alt+Shift+6': 'outline-level-6', 'Alt+Shift+7': 'outline-level-7', 'Alt+Shift+8': 'outline-level-8', 'Alt+Shift+9': 'outline-level-9',
    'Ctrl+Shift+K': 'doc-small-caps', 'Ctrl+Shift+A': 'doc-all-caps', 'Shift+F3': 'change-case', 'Ctrl+Space': 'clear-char-formatting',
    'Ctrl+Alt+Shift+S': 'styles-pane', 'Ctrl+G': 'doc-go-to', F5: 'doc-go-to', F7: 'spelling-grammar', 'Shift+F7': 'thesaurus', 'Ctrl+Shift+G': 'word-count',
    'Alt+Shift+D': 'insert-date',
  }),
  text: verbs('text', {
    'Ctrl+B': 'bold', 'Ctrl+I': 'italic', 'Ctrl+U': 'underline', 'Ctrl+=': 'sub', 'Ctrl+Shift+=': 'sup', 'Ctrl++': 'sup',
    F9: 'sub', F10: 'sup', 'Ctrl+F': 'formula', 'Ctrl+K': 'link',
  }),
};

// ------------------------------------------------------------------ the person's key map

/** The person's changes: a key bound to a different action, or null for a default key removed. */
export type KeyOverrides = Partial<Record<KeyContext, Record<string, string | null>>>;

const CTX_IDS = CONTEXTS.map((c) => c.id);

export class Keymap {
  private maps = {} as Record<KeyContext, Map<string, string>>;
  private changes: KeyOverrides = {};
  private listeners: (() => void)[] = [];

  constructor(overrides: KeyOverrides = {}) {
    this.setOverrides(overrides);
  }

  /** The action a key does in a place, if any. */
  lookup(ctx: KeyContext, chord: string): string | undefined {
    return this.maps[ctx].get(chord);
  }

  /** The keys that do an action in a place, defaults first. */
  keysFor(ctx: KeyContext, action: string): string[] {
    const out: string[] = [];
    for (const [k, a] of this.maps[ctx]) if (a === action) out.push(k);
    return out;
  }

  /** Every binding in a place. */
  entries(ctx: KeyContext): [string, string][] {
    return [...this.maps[ctx]];
  }

  /**
   * Give a key an action in a place (null takes the key away). Returns the action the key did
   * before, if it was something else, so the window can say that action lost its key.
   */
  bind(ctx: KeyContext, chord: string, action: string | null): string | undefined {
    const before = this.maps[ctx].get(chord);
    const def = DEFAULT_KEYS[ctx][chord];
    const ch = (this.changes[ctx] ??= {});
    if ((action ?? undefined) === def) delete ch[chord];
    else ch[chord] = action;
    if (!Object.keys(ch).length) delete this.changes[ctx];
    this.rebuild(ctx);
    this.emit();
    return before !== undefined && before !== action ? before : undefined;
  }

  /** Whether a key in a place is as ChemDraw has it. */
  isDefault(ctx: KeyContext, chord: string): boolean {
    return !this.changes[ctx] || !(chord in this.changes[ctx]!);
  }

  /** Whether an action's keys are as ChemDraw has them. */
  actionIsDefault(ctx: KeyContext, action: string): boolean {
    const ch = this.changes[ctx];
    if (!ch) return true;
    for (const [k, a] of Object.entries(ch)) if (a === action || DEFAULT_KEYS[ctx][k] === action) return false;
    return true;
  }

  /** Put one action's keys back to ChemDraw's. */
  resetAction(ctx: KeyContext, action: string): void {
    const ch = this.changes[ctx];
    if (!ch) return;
    for (const [k, a] of Object.entries(ch)) if (a === action || DEFAULT_KEYS[ctx][k] === action) delete ch[k];
    if (!Object.keys(ch).length) delete this.changes[ctx];
    this.rebuild(ctx);
    this.emit();
  }

  /** Back to ChemDraw's keys everywhere. */
  resetAll(): void {
    this.setOverrides({});
  }

  /** The person's changes, ready to save. */
  overrides(): KeyOverrides {
    return JSON.parse(JSON.stringify(this.changes));
  }

  /** Load saved changes. Anything that doesn't make sense is skipped, never fatal. */
  setOverrides(o: KeyOverrides): void {
    this.changes = {};
    for (const ctx of CTX_IDS) {
      const src = o?.[ctx];
      if (!src || typeof src !== 'object') continue;
      const ch: Record<string, string | null> = {};
      for (const [k, v] of Object.entries(src)) {
        if (!k) continue;
        if (v === null) { if (k in DEFAULT_KEYS[ctx]) ch[k] = null; }
        else if (typeof v === 'string' && validAction(ctx, v)) ch[k] = v;
      }
      if (Object.keys(ch).length) this.changes[ctx] = ch;
    }
    for (const ctx of CTX_IDS) this.rebuild(ctx);
    this.emit();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private rebuild(ctx: KeyContext): void {
    const m = new Map(Object.entries(DEFAULT_KEYS[ctx]));
    for (const [k, v] of Object.entries(this.changes[ctx] ?? {})) {
      if (v === null) m.delete(k);
      else m.set(k, v);
    }
    this.maps[ctx] = m;
  }

  private emit(): void {
    for (const f of this.listeners) f();
  }
}

/** The app's key map. */
export const keymap = new Keymap();
