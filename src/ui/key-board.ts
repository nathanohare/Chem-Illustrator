// The Hotkeys page's keyboard: a picture of the keyboard with what each key does written on it,
// coloured by kind (atom labels, growing a structure, bond types, tools, file and editing
// commands, zoom and view, arranging, text). Pick where the pointer is (an atom, a bond, empty
// space, anywhere) and hold Shift, Ctrl or Alt to see those keys; rest on a key to read its
// action in full, and click it to give it another one or take it away.

import { keymap, CONTEXTS, DEFAULT_KEYS, actionName, actionsFor, chordOf, parseAction, type KeyContext } from '../editor/keymap';

/** A key on the board: what it types plain and with Shift, its physical code, and its width in key units. */
interface BoardKey { key: string; shift?: string; code: string; w?: number; label?: string }

const k = (key: string, shift: string | undefined, code: string, w?: number, label?: string): BoardKey => ({ key, shift, code, w, label });
const letter = (c: string): BoardKey => k(c, c.toUpperCase(), `Key${c.toUpperCase()}`);

/** A US keyboard, row by row (the layout most of the default keys are named on). */
export const BOARD: BoardKey[][] = [
  [k('Escape', undefined, 'Escape', 1.25, 'Esc'), ...Array.from({ length: 12 }, (_, i) => k(`F${i + 1}`, undefined, `F${i + 1}`))],
  [k('`', '~', 'Backquote'), ...'1234567890'.split('').map((d, i) => k(d, '!@#$%^&*()'[i], `Digit${d}`)), k('-', '_', 'Minus'), k('=', '+', 'Equal'), k('Backspace', undefined, 'Backspace', 1.75, '⌫')],
  [k('Tab', undefined, 'Tab', 1.4), ...'qwertyuiop'.split('').map(letter), k('[', '{', 'BracketLeft'), k(']', '}', 'BracketRight'), k('\\', '|', 'Backslash', 1.35)],
  [k('CapsLock', undefined, 'CapsLock', 1.7, 'Caps'), ...'asdfghjkl'.split('').map(letter), k(';', ':', 'Semicolon'), k("'", '"', 'Quote'), k('Enter', undefined, 'Enter', 2.05, 'Enter')],
  [k('Shift', undefined, 'ShiftLeft', 2.25), ...'zxcvbnm'.split('').map(letter), k(',', '<', 'Comma'), k('.', '>', 'Period'), k('/', '?', 'Slash'), k('Shift', undefined, 'ShiftRight', 2.5)],
  [k('Control', undefined, 'ControlLeft', 1.5, 'Ctrl'), k('Alt', undefined, 'AltLeft', 1.25, 'Alt'), k(' ', undefined, 'Space', 6.1, 'Space'), k('Alt', undefined, 'AltRight', 1.25, 'Alt'), k('Delete', undefined, 'Delete', 1.25, 'Del'),
    k('ArrowLeft', undefined, 'ArrowLeft', 1, '←'), k('ArrowUp', undefined, 'ArrowUp', 1, '↑'), k('ArrowDown', undefined, 'ArrowDown', 1, '↓'), k('ArrowRight', undefined, 'ArrowRight', 1, '→')],
];

const MOD_KEYS = new Set(['Shift', 'Control', 'Alt', 'CapsLock']);

/** The kinds keys are coloured by. */
export const KINDS: { id: string; name: string; colour: string }[] = [
  { id: 'label', name: 'Atom labels', colour: '#2f6fdf' },
  { id: 'grow', name: 'Growing a structure', colour: '#1e8a50' },
  { id: 'ring', name: 'Rings', colour: '#0f8f8f' },
  { id: 'bond', name: 'Bond types', colour: '#7b3fbf' },
  { id: 'mark', name: 'Charges and marks', colour: '#c2410c' },
  { id: 'move', name: 'Moving the highlight', colour: '#8a6d1f' },
  { id: 'tool', name: 'Tools', colour: '#b0337a' },
  { id: 'file', name: 'File and editing', colour: '#475569' },
  { id: 'view', name: 'Zoom and view', colour: '#0369a1' },
  { id: 'arrange', name: 'Arranging', colour: '#a16207' },
  { id: 'chem', name: 'Chemistry commands', colour: '#15803d' },
  { id: 'text', name: 'Text and formatting', colour: '#9333ea' },
  { id: 'other', name: 'Other', colour: '#6b7280' },
];

/** The kind an action is, for its colour. */
export function kindOf(action: string): string {
  const { verb, arg } = parseAction(action);
  if (verb === 'label') return 'label';
  if (verb === 'hotspot') return 'move';
  if (verb === 'fuse') return 'ring';
  if (verb === 'tool') return /^ring|^tpl-/.test(arg) ? 'ring' : 'tool';
  if (verb === 'text') return 'text';
  if (verb === 'bond') return /^(select|delete|properties)$/.test(arg) ? 'file' : 'bond';
  if (verb === 'atom') {
    if (/^(plus|minus|number|attach)$/.test(arg)) return 'mark';
    if (/^(cyclo|phenyl|cp-hapto|arene-hapto)/.test(arg)) return 'ring';
    if (/^(select|clear|edit-label|properties|nickname)$/.test(arg)) return 'file';
    return 'grow';
  }
  if (verb === 'command') {
    if (/^(new|open|save|save-as|print|close-tab|undo|redo|cut|copy|paste|select-all|copy-|paste-|find|replace|preferences|command-search|help-here|next-tab|prev-tab|next-region|prev-region|new-)/.test(arg)) return 'file';
    if (/^(zoom|ui-scale|focus-view|view-|present|presenter|selection-pane|styles-pane|next-slide|prev-slide|go-to|doc-go-to|outline-)/.test(arg)) return 'view';
    if (/^(nudge|align|distribute|flip|turn|rotate|scale|reaction-|group|ungroup|join|next-structure|prev-structure)/.test(arg)) return 'arrange';
    if (/^(clean-up|aromatic|fixed-|name-to-structure|structure-from-name|compound-number)/.test(arg)) return 'chem';
    if (/^(cell-|doc-|font-|line-|style-|format-|insert-|change-case|clear-char|page-break|col-break|track-changes|spelling|thesaurus|word-count|mark-)/.test(arg)) return 'text';
  }
  return 'other';
}

/** Names short enough for a key, where the full name is long. */
const SHORT: Record<string, string> = {
  'atom bond': 'Bond', 'atom ring-bond': 'Bond ⟲', 'atom carbonyl': 'C=O', 'atom phenyl': 'Ph', 'atom wedge': 'Wedge', 'atom hash-wedge': 'Hash',
  'atom cyclohexyl': 'C₆ ring', 'atom cyclopentyl': 'C₅ ring', 'atom cyclobutyl': 'C₄ ring', 'atom cyclopropyl': 'C₃ ring', 'atom methylidene': '=CH₂',
  'atom dimethyl': 'Me₂', 'atom tbu': 'tBu', 'atom cp-hapto': 'η⁵-Cp', 'atom arene-hapto': 'η⁶-Ar', 'atom alkyne': 'C≡C', 'atom sulfonyl': 'SO₂',
  'atom plus': '+1', 'atom minus': '−1', 'atom number': 'Number', 'atom attach': 'Attach', 'atom nickname': 'Nickname', 'atom properties': 'Style',
  'atom edit-label': 'Label', 'atom clear': 'Clear', 'atom select': 'Select',
  'bond left': 'Left', 'bond center': 'Center', 'bond right': 'Right', 'bond dashed-double': 'Dash dbl', 'bond bold-double': 'Bold dbl', 'bond hash-wedge': 'Hash',
  'bond properties': 'Style', 'bond select': 'Select', 'bond delete': 'Delete',
  'fuse benzene': 'Benzene', 'fuse cyclopentadiene': 'Cp', 'fuse 3': 'C₃', 'fuse 4': 'C₄', 'fuse 5': 'C₅', 'fuse 6': 'C₆', 'fuse 7': 'C₇', 'fuse 8': 'C₈', 'fuse chair': 'Chair', 'fuse chair-2': 'Chair 2',
  'hotspot left': '←', 'hotspot right': '→', 'hotspot up': '↑', 'hotspot down': '↓', 'hotspot far-left': '⇐', 'hotspot far-right': '⇒', 'hotspot far-up': '⇑', 'hotspot far-down': '⇓',
  'command reaction-right': 'Rxn →', 'command reaction-left': 'Rxn ←', 'command reaction-up': 'Rxn ↑', 'command reaction-down': 'Rxn ↓',
  'command zoom-in': 'Zoom +', 'command zoom-out': 'Zoom −', 'command zoom-fit': 'Fit', 'command zoom-actual': '100 %', 'command zoom-selection': 'Zoom sel.',
  'command nudge-left': 'Nudge', 'command nudge-right': 'Nudge', 'command nudge-up': 'Nudge', 'command nudge-down': 'Nudge',
  'command next-structure': 'Next', 'command prev-structure': 'Previous', 'command next-tab': 'Next tab', 'command prev-tab': 'Prev tab',
  'command fixed-length': 'Fix length', 'command fixed-angles': 'Fix angles', 'command copy-smiles': 'SMILES', 'command copy-cdxml': 'CDXML',
  'command rotate-dialog': 'Rotate', 'command preferences': 'Settings', 'command command-search': 'Search', 'command help-here': 'Help',
};

/** A short name for the action, to fit on a key: "CF3", "Bond", "Save". */
export function shortName(action: string): string {
  const { verb, arg } = parseAction(action);
  if (verb === 'label') return arg;
  const own = SHORT[`${verb} ${arg}`];
  if (own) return own;
  const full = actionName(action).replace(/\s*\(.*\)$/, '').replace(/…$/, '');
  if (full.length <= 9) return full;
  const words = full.split(/\s+/);
  return words[0].length <= 9 ? words[0] : full;
}

/** The key map's name for a board key with these modifiers held, as a key press of it would give. */
export function chordFor(b: BoardKey, mods: { shift: boolean; ctrl: boolean; alt: boolean }): string | null {
  if (MOD_KEYS.has(b.key)) return null;
  const key = mods.shift && b.shift ? b.shift : b.key;
  return chordOf({ key, code: b.code, shiftKey: mods.shift, ctrlKey: mods.ctrl, altKey: mods.alt });
}

export interface KeyBoardOptions {
  mac: boolean;
  /** A key was given an action (or null to take it away); say what changed. */
  bind: (ctx: KeyContext, chord: string, action: string | null) => void;
}

/** The keyboard, ready to put on the page; it redraws when the key map changes. */
export function keyBoard(o: KeyBoardOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'kb';
  // (choosing what the keyboard shows is not a change to apply)
  root.dataset.noDirty = '';
  const state = { ctx: 'atom' as KeyContext, shift: false, ctrl: false, alt: false, picked: null as string | null };

  const bar = document.createElement('div');
  bar.className = 'kb-bar';
  const ctxSel = document.createElement('select');
  ctxSel.setAttribute('aria-label', 'Keys used');
  for (const c of CONTEXTS) ctxSel.add(new Option(c.title, c.id));
  ctxSel.addEventListener('change', () => { state.ctx = ctxSel.value as KeyContext; state.picked = null; draw(); });
  bar.append(ctxSel);
  const modBtn = (name: 'shift' | 'ctrl' | 'alt', text: string) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'kb-mod';
    b.textContent = text;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => { state[name] = !state[name]; state.picked = null; draw(); });
    bar.append(b);
    return b;
  };
  const mods = { shift: modBtn('shift', o.mac ? '⇧ Shift' : 'Shift'), ctrl: modBtn('ctrl', o.mac ? '⌘ Cmd' : 'Ctrl'), alt: modBtn('alt', o.mac ? '⌥ Option' : 'Alt') };
  const info = document.createElement('p');
  info.className = 'kb-info muted';
  info.setAttribute('aria-live', 'polite');
  const board = document.createElement('div');
  board.className = 'kb-board';
  const edit = document.createElement('div');
  edit.className = 'kb-edit';
  const legend = document.createElement('div');
  legend.className = 'kb-legend';
  root.append(bar, board, info, edit, legend);

  const describe = (chord: string, action: string | undefined) =>
    `${chord}: ${action ? actionName(action) : 'nothing here'}`;

  const draw = () => {
    for (const [n, b] of Object.entries(mods)) { const on = state[n as 'shift' | 'ctrl' | 'alt']; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    board.replaceChildren();
    const used = new Set<string>();
    for (const row of BOARD) {
      const r = document.createElement('div');
      r.className = 'kb-row';
      for (const b of row) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'kb-key';
        el.style.flexGrow = String(b.w ?? 1);
        const cap = document.createElement('span');
        cap.className = 'kb-cap';
        const shown = b.label ?? (state.shift && b.shift ? b.shift : b.key.length === 1 ? b.key.toUpperCase() : b.key);
        cap.textContent = shown;
        el.append(cap);
        const chord = chordFor(b, state);
        if (!chord) {
          el.classList.add('kb-modkey');
          const held = (b.key === 'Shift' && state.shift) || (b.key === 'Control' && state.ctrl) || (b.key === 'Alt' && state.alt);
          el.classList.toggle('on', held);
          if (b.key === 'Shift') el.addEventListener('click', () => { state.shift = !state.shift; draw(); });
          else if (b.key === 'Control') el.addEventListener('click', () => { state.ctrl = !state.ctrl; draw(); });
          else if (b.key === 'Alt') el.addEventListener('click', () => { state.alt = !state.alt; draw(); });
          else el.disabled = true;
        } else {
          const action = keymap.lookup(state.ctx, chord);
          el.dataset.chord = chord;
          if (action) {
            const kind = kindOf(action);
            used.add(kind);
            el.style.setProperty('--kb', KINDS.find((x) => x.id === kind)!.colour);
            el.classList.add('kb-bound');
            if (!keymap.isDefault(state.ctx, chord)) el.classList.add('kb-changed');
            const name = document.createElement('span');
            name.className = 'kb-act';
            name.textContent = shortName(action);
            el.append(name);
          }
          el.title = describe(chord, action);
          el.setAttribute('aria-label', describe(chord, action));
          el.classList.toggle('picked', state.picked === chord);
          el.addEventListener('mouseenter', () => { info.textContent = describe(chord, action); });
          el.addEventListener('focus', () => { info.textContent = describe(chord, action); });
          el.addEventListener('click', () => { state.picked = chord; draw(); });
        }
        r.append(el);
      }
      board.append(r);
    }
    legend.replaceChildren(...KINDS.filter((x) => used.has(x.id)).map((x) => {
      const s = document.createElement('span');
      s.className = 'kb-kind';
      s.style.setProperty('--kb', x.colour);
      s.textContent = x.name;
      return s;
    }));
    drawEdit();
  };

  // the key clicked: its action, and a list to give it another
  const drawEdit = () => {
    edit.replaceChildren();
    const chord = state.picked;
    if (!chord) return;
    const now = keymap.lookup(state.ctx, chord);
    const label = document.createElement('label');
    label.className = 'kb-pick';
    const name = document.createElement('b');
    name.textContent = chord;
    const sel = document.createElement('select');
    sel.add(new Option('Nothing', ''));
    const list = actionsFor(state.ctx);
    if (now && !list.includes(now)) list.unshift(now);
    for (const a of list) sel.add(new Option(actionName(a), a, false, a === now));
    if (!now) sel.value = '';
    sel.addEventListener('change', () => {
      o.bind(state.ctx, chord, sel.value || null);
      draw();
    });
    label.append(name, ' does ', sel);
    edit.append(label);
    if (!keymap.isDefault(state.ctx, chord)) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Standard key';
      reset.title = 'Give this key back the action it has as standard';
      reset.addEventListener('click', () => {
        keymap.bind(state.ctx, chord, defaultFor(state.ctx, chord));
        draw();
      });
      edit.append(reset);
    }
  };

  keymap.onChange(() => { if (root.isConnected) draw(); });
  draw();
  info.textContent = 'Rest on a key to see what it does; click it to change it.';
  return root;
}

const defaultFor = (ctx: KeyContext, chord: string): string | null => DEFAULT_KEYS[ctx][chord] ?? null;
