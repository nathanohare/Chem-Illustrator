// What each drawing tool does, the steps to use it and the keys that change it: for the tool
// tips (resting the mouse on a tool) and the status bar's step-by-step hint. The keys listed
// here are the ones the editor really reads (editor.ts); keep the two in step.

import type { Tool, EditorStatus } from '../editor/editor';
import type { Arrow } from '../model';

export interface ToolHelp {
  /** What the tool does, in a sentence or two (the status bar's whole hint). */
  what: string;
  /** What to do with it, one short step at a time (the status bar shows these). */
  steps: string[];
  /** Keys that change a click or the press (the status bar shows these before you press), each with only the bare action, said once. */
  keys: [string, string][];
  /** Keys that change the drag once it is under way (the tool tip lists them; the status bar shows the drag's own while it lasts). */
  dragKeys?: [string, string][];
}

const BOND_STEPS = ['Click an atom or empty space', 'Drag to aim'];
const BOND_KEYS: [string, string][] = [['Hotkeys', 'Change the atom or bond pointed at']];
const BOND_DRAG: [string, string][] = [['Alt', 'Toggle angle snapping']];

/** Help for tools named one by one; the rest go by their kind (below). */
const BY_NAME: Record<string, ToolHelp> = {
  select: {
    what: 'Click or drag a box to select. Double-click selects a whole structure; Shift or Ctrl+click adds to the selection. Ctrl+drag copies; hold Shift while dragging to move straight. Delete removes.',
    steps: ['Click or drag a box to select'],
    keys: [['Double-click', 'Select structure'], ['Shift+click', 'Add to selection'], ['Ctrl+drag', 'Copy']],
    dragKeys: [['Shift', 'Move straight'], ['Alt', 'Toggle snapping']],
  },
  lasso: {
    what: 'Drag a loop around what to select, to pick pieces out of a crowded scheme. Then drag what is selected to move it.',
    steps: ['Drag a loop around what to select'],
    keys: [['Shift', 'Add to selection'], ['Ctrl+drag', 'Copy']],
  },
  eraser: { what: 'Click an atom, bond, caption, arrow or shape to remove it.', steps: ['Click to delete'], keys: [] },
  sketch: {
    what: 'Draw freehand: a line is a bond, a zig-zag a chain, over a bond doubles it; a loop with corners is a ring, a circle benzene; write C, N, O, Cl, Br, + or − on an atom; scribble to erase.',
    steps: ['Draw', 'Lift to convert'],
    keys: [],
  },
  connector: { what: 'Drag from one shape\'s blue connection point to another\'s; the connector stays attached as the shapes move.', steps: ['Drag from dot to dot'], keys: [] },
  'connector-elbow': { what: 'Drag from one shape\'s blue dot to another\'s: the connector bends square and follows the shapes when they move.', steps: ['Drag from dot to dot'], keys: [] },
  chain: {
    what: 'Drag from empty space or an atom; the number shows how many bonds. Click to type how many atoms; Alt+click repeats the last number.',
    steps: ['Drag from an atom or empty space', 'Let go at the length you want'],
    keys: [['Alt', 'Repeat last length']],
  },
  text: { what: 'Click an atom to type a label (OMe, CO2Et, NHBoc…), or click empty space for a caption.', steps: ['Click an atom or empty space', 'Type; Esc to finish'], keys: [['Ctrl', 'Follow a link']] },
  element: { what: 'Click atoms to change them to the element selected in the periodic table, or empty space to add one.', steps: ['Pick an element', 'Click atoms'], keys: [] },
  'bond-hapto': {
    what: 'Drag from a metal to a ring (η⁵, η⁶) or a bond (η²), or the reverse. Click a ring or bond to add a new metal; or select an allyl or diene, then click the metal. Click a hapto bond to draw it to each atom.',
    steps: ['Drag from a metal to a ring or π-bond'],
    keys: [],
  },
  'bond-variable': {
    what: 'Drag from a group (or empty space) into a ring: the group is on one of the ring\'s atoms. Then click ring atoms to add them or take them out.',
    steps: ['Drag from the group into the ring', 'Click ring atoms to add or remove'],
    keys: [],
  },
  newman: { what: 'Click a single bond to draw its Newman projection: the end you click nearer is in front. The window shows its most stable conformers (Tab steps through them).', steps: ['Click a single bond'], keys: [] },
  fragment: { what: 'Drag a line across the bonds to break (or click one bond). Each piece gets a caption with its formula and exact mass, which you can edit.', steps: ['Drag across the bonds to break'], keys: [] },
};

const CURVE_WHAT = 'Drag from where the electrons start (lone pair, bond, radical or charge) to where they go (atom, bond, or the gap where a bond forms); drag sideways to bend the curve. Or click the start, any points along the way, and the end. Ctrl+drag or a pen draws freehand. Drag the middle handle to reshape.';
const GEO_HELP: ToolHelp = {
  what: 'Click on the page to put the shape down, or drag to draw it at any size (Shift keeps its shape). Double-click a shape to type in it.',
  steps: ['Click or drag', 'Double-click to type'],
  keys: [],
  dragKeys: [['Shift', 'Keep proportions']],
};

/** What a tool does, step by step, and the keys that change it. */
export function toolHelp(name: string, t: Tool | undefined): ToolHelp {
  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith('geo:') || !t) return GEO_HELP;
  switch (t.kind) {
    case 'ring':
      return {
        what: 'Click empty space, an atom (spiro; Alt+click to attach by a bond) or a bond (fused). Drag to orient.',
        steps: ['Click a space, atom or bond', 'Drag to turn'],
        keys: [['Alt', 'Attach by a bond'], ['Shift', 'Swap double bonds'], ...(t.aromatic ? [['Ctrl', 'Aromatic circle'] as [string, string]] : [])],
        dragKeys: [['Shift', 'Swap double bonds'], ...(t.aromatic ? [['Ctrl', 'Aromatic circle'] as [string, string]] : [])],
      };
    case 'arrow':
      if (t.style.sweep) {
        return {
          what: CURVE_WHAT,
          steps: ['Press where the electrons start', 'Drag to where they go'],
          keys: [['Ctrl', 'Freehand'], ['Shift', 'Branch from an arrow']],
          dragKeys: [['Alt', 'Toggle snapping']],
        };
      }
      return {
        what: 'Drag to draw an arrow (hold Alt or Space: any angle); click for a standard one. Drag the ends to move them, the middle to bend it.',
        steps: ['Click, or drag to draw'],
        keys: [['Shift', 'Branch from an arrow']],
        dragKeys: [['Alt', 'Toggle angle snapping']],
      };
    case 'shape':
      if (t.shape.kind === 'line') return { what: 'Drag to draw a line, in 15° steps. Drag its ends to move them.', steps: ['Drag to draw'], keys: [], dragKeys: [['Alt', 'Toggle angle snapping']] };
      return {
        what: 'Drag to draw. Drag the corner squares to resize; the Style panel changes dashes, fill, corners and shadow.',
        steps: [t.from === 'center' ? 'Drag out from the center' : 'Drag from a corner'],
        keys: [],
        dragKeys: t.from === 'center' ? [] : [['Shift', 'Square or circle']],
      };
    case 'bracket':
      return { what: 'Drag a box to put brackets around it, or click a structure to bracket it.', steps: ['Click a structure, or drag a box'], keys: [] };
    case 'template':
      return {
        what: 'Click empty space to place it (drag to rotate), a bond to fuse it, or an atom to attach it (Alt: attach by a new bond, or spiro at the atom).',
        steps: ['Click a space, bond or atom', 'Drag to turn'],
        keys: [['Alt', 'Join the other way']],
        dragKeys: [['Tab', 'Next fit (Shift+Tab: back)']],
      };
    case 'symbol':
      return {
        what: 'Click an atom to put the mark in its most open space, or press on the atom and drag around it to aim it.',
        steps: ['Click an atom', 'Drag to aim'],
        keys: [],
        dragKeys: [['Shift', 'Snap to 15°']],
      };
    case 'mark':
      return { what: `Click where the ${t.text} goes: it is set as a caption.`, steps: ['Click to place'], keys: [] };
    case 'perspective':
      return {
        what: t.real
          ? 'Drag a structure to rotate its 3-D shape; wedges and bold bonds set which shape is meant.'
          : 'Drag a structure to tilt it in 3-D as a flat sheet.',
        steps: ['Drag a structure to rotate it'],
        keys: [],
        dragKeys: [['Shift', 'Snap to 15°']],
      };
    case 'pen':
      return {
        what: 'Draw a freeform shape point by point. Click for a corner; drag out from a point to curve through it.',
        steps: ['Click each point', 'Click the first point to close', 'Double-click to end open'],
        keys: [],
        dragKeys: [['Enter', 'End open'], ['Backspace', 'Take back a point'], ['Esc', 'Stop']],
      };
    case 'bond':
    default:
      return { what: 'Click empty space or an atom to draw; drag to aim (hold Alt or Space: any angle). Point at an atom or bond and press a hotkey (Edit > Keyboard Shortcuts lists them).', steps: BOND_STEPS, keys: BOND_KEYS, dragKeys: BOND_DRAG };
  }
}

/** The status bar's guide to a selected arrow's handles: which handle does what, and the keys. */
export function arrowHandleHelp(r: Pick<Arrow, 'sweep' | 'bez' | 'equilibrium'> & Partial<Pick<Arrow, 'ellipse'>>): { name: string; handles: string[]; keys: [string, string][] } {
  // (the keys work while a handle is dragged: the status bar shows them then, from the pointer's hints)
  if (r.bez?.length && r.ellipse) {
    return {
      name: 'Elliptical arrow selected',
      handles: ['Drag ends to reattach', 'Drag diamonds to stretch the ellipse'],
      keys: [['Alt', 'Toggle snapping to a circle']],
    };
  }
  if (r.bez?.length) {
    return {
      name: 'S-shaped arrow selected',
      handles: ['Drag ends to reattach', 'Drag diamonds to reshape'],
      keys: [['Alt', 'Sharp corner'], ['Shift', 'Snap to 15°']],
    };
  }
  if (r.sweep) {
    return {
      name: 'Curved arrow selected',
      handles: ['Drag ends to reattach', 'Drag middle dot to bend', 'Drag diamonds to stretch into an ellipse'],
      keys: [['Alt', 'Toggle snapping']],
    };
  }
  return {
    name: 'Arrow selected',
    handles: ['Drag ends to move', 'Drag middle to bend'],
    keys: [['Alt', 'Toggle angle snapping']],
  };
}

/** The status bar's guide to a selected box, oval or line's handles. */
export function shapeHandleHelp(line: boolean): { name: string; handles: string[]; keys: [string, string][] } {
  return line
    ? { name: 'Line selected', handles: ['Drag ends to move'], keys: [['Alt', 'Toggle angle snapping']] }
    : { name: 'Shape selected', handles: ['Drag squares to resize', 'Drag round handle to turn'], keys: [['Shift', 'Keep proportions; snap to 15°'], ['Ctrl', 'Resize from center']] };
}

/** Every key a tool reads, before and during the drag, each once (for its tool tip). */
export function allKeys(h: ToolHelp): [string, string][] {
  const out = [...h.keys];
  for (const k of h.dragKeys ?? []) if (!out.some(([key, what]) => key === k[0] && what === k[1])) out.push(k);
  return out;
}

/** What the status bar shows: a name, steps (the one in hand marked when numbered), then keys. */
export interface StatusHint { name: string; steps: string[]; numbered: boolean; at: number; keys: [string, string][]; full: string }

/** The key that does an action ("command join", "hotspot left"), as people read it, or undefined when none does. */
export type KeyLookup = (action: string, ctx?: 'command' | 'atom' | 'bond') => string | undefined;

const ARROW_GLYPHS = ['←', '→', '↑', '↓'];

/**
 * One name for the four keys of an arrow-key family ("Ctrl+←", "Ctrl+→", "Ctrl+↑", "Ctrl+↓" →
 * "Ctrl+Arrow"; plain arrows → "Arrow keys"); a remapped family shows its first key instead.
 */
export function arrowFamily(key: KeyLookup, actions: string[], ctx: 'command' | 'atom' | 'bond' = 'command'): string | undefined {
  const ks = actions.map((a) => key(a, ctx));
  const prefix = ks[0]?.slice(0, -1);
  if (ks.every((k, i) => k && k.endsWith(ARROW_GLYPHS[i]) && k.slice(0, -1) === prefix)) return prefix ? `${prefix}Arrow` : 'Arrow keys';
  return ks.find(Boolean);
}

const dirs = (verb: string, names: string[]) => names.map((n) => `${verb} ${n}`);

/**
 * The keys that act on what is selected (or highlighted), in order of use: those that apply,
 * each under the key it has now (none when it has been unbound).
 */
function selectionKeys(key: KeyLookup, o: { reaction: boolean; enter: string | null; join: boolean; double: boolean; shiftClick: boolean; rotate: boolean }): [string, string][] {
  const out: [string, string][] = [];
  const put = (k: string | undefined, what: string) => { if (k) out.push([k, what]); };
  if (o.double) out.push(['Double-click', 'Select structure']);
  if (o.join) put(key('command join'), 'Join');
  if (o.reaction) put(arrowFamily(key, dirs('command', ['reaction-left', 'reaction-right', 'reaction-up', 'reaction-down'])), 'Reaction arrow');
  if (o.rotate) put(arrowFamily(key, dirs('command', ['turn-ccw-1', 'turn-cw-1', 'turn-ccw-15', 'turn-cw-15'])), 'Rotate');
  const near = arrowFamily(key, dirs('command', ['nudge-left', 'nudge-right', 'nudge-up', 'nudge-down']));
  const far = arrowFamily(key, dirs('command', ['nudge-far-left', 'nudge-far-right', 'nudge-far-up', 'nudge-far-down']));
  if (near && far === 'Shift+Arrow') out.push([near, 'Nudge (Shift: farther)']);
  else { put(near, 'Nudge'); put(far, 'Nudge farther'); }
  if (o.enter) out.push(['Enter', o.enter]);
  if (o.shiftClick) out.push(['Shift+click', 'Add to selection']);
  return out;
}

const sentence = (keys: [string, string][]) => keys.map(([k, what]) => `${k}: ${what}`).join('. ');

/**
 * The status bar's hint for the tool in hand, the drag under way, the keyboard highlight and the
 * selection: only what a key or click does right now. A drag shows the keys that change it (the
 * same ones the pointer's label shows); a highlighted atom, the keys that act on it; a selection,
 * the keys that move, turn, copy or extend it; otherwise the tool's steps and the keys that change
 * a click or the press.
 */
export function statusHint(o: {
  name: string;
  label: string;
  t: Tool | undefined;
  st: EditorStatus;
  /** The step in hand (1 while the button is down). */
  step: number;
  /** One arrow or shape selected: what it is and what its handles do. */
  one: { name: string; handles: string[] } | null;
  key: KeyLookup;
}): StatusHint {
  const { name, t, st, one, key } = o;
  const h = toolHelp(name, t);
  const selecting = t?.kind === 'select';
  const toolHint = (at: number, keys: [string, string][]): StatusHint =>
    ({ name: o.label, steps: h.steps, numbered: h.steps.length > 1 && !selecting, at: Math.min(at, h.steps.length - 1), keys, full: h.what });
  const plain = (nm: string, steps: string[], keys: [string, string][], full?: string): StatusHint =>
    ({ name: nm, steps, numbered: false, at: -1, keys, full: full ?? [nm, ...steps, sentence(keys)].filter(Boolean).join('. ') + '.' });

  // a drag under way: only the keys that change it
  switch (st.drag) {
    case 'move': return plain(st.copying ? 'Copying' : 'Moving', [], st.dragKeys);
    case 'rotate': return plain('Rotating', [], st.dragKeys);
    case 'marquee': return selecting ? plain('Selecting', [], st.dragKeys) : toolHint(1, st.dragKeys);
    case 'handle': return plain(one?.name ?? 'Resizing', [], st.dragKeys);
    case 'draw': {
      // and keys that aren't held down but pressed (Tab: a template's next fit)
      const pressed = (h.dragKeys ?? []).filter(([k]) => !/^(Shift|Alt|Ctrl)$/.test(k));
      return toolHint(1, [...st.dragKeys, ...pressed]);
    }
    case 'other': return toolHint(1, []);
  }
  // an atom or bond highlighted from the keyboard (or just drawn): its hotkeys, Space or Tab, the arrow keys
  if (st.highlight) {
    const keys: [string, string][] = [['Space/Tab', 'Select molecule']];
    const move = arrowFamily(key, dirs('hotspot', ['left', 'right', 'up', 'down']), st.highlight);
    if (move) keys.push([move, 'Move highlight']);
    return plain(st.highlight === 'atom' ? 'Atom highlighted' : 'Bond highlighted', ['Press a hotkey to change it'], keys,
      `The ${st.highlight} is highlighted: press a hotkey (Edit > Keyboard Shortcuts lists them) to change it. Space or Tab selects its molecule; the arrow keys move the highlight.`);
  }
  const any = st.atoms + st.bonds + st.others > 0;
  // a selection, with the Select or Lasso tool (or any tool once whole structures are selected:
  // Space, Tab and Ctrl+A select those with a drawing tool still in hand)
  if (any && (selecting || st.whole)) {
    if (!st.atoms && !st.bonds && one) {
      return plain(one.name, [...one.handles, 'Ctrl+drag to copy'], selectionKeys(key, { reaction: false, enter: null, join: false, double: false, shiftClick: false, rotate: true }));
    }
    if (st.atoms && st.whole) {
      return plain('Structure selected', ['Ctrl+drag to copy'], selectionKeys(key, { reaction: true, enter: 'Highlight last atom', join: st.joinable, double: false, shiftClick: false, rotate: true }));
    }
    if (st.atoms || st.bonds) {
      const nm = st.atoms > 1 ? 'Atoms selected' : st.atoms === 1 ? 'Atom selected' : st.bonds > 1 ? 'Bonds selected' : 'Bond selected';
      // (one atom has nothing to turn about)
      return plain(nm, ['Ctrl+drag to copy'], selectionKeys(key, { reaction: false, enter: st.atoms ? 'Highlight atom' : null, join: st.joinable, double: true, shiftClick: false, rotate: st.atoms + st.bonds > 1 }));
    }
    return plain('Objects selected', ['Ctrl+drag to copy'], selectionKeys(key, { reaction: false, enter: null, join: false, double: false, shiftClick: true, rotate: true }));
  }
  // an arrow tool on a selected arrow: what its handles do
  if (one && t?.kind === 'arrow' && st.others === 1 && !st.atoms && !st.bonds && o.step === 0) {
    return plain(one.name, one.handles, [], `${one.name}. ${one.handles.join('. ')}.`);
  }
  // nothing selected: the Select and Lasso tools say how to select
  if (selecting) {
    const keys: [string, string][] = [];
    if (!(t as { lasso?: boolean }).lasso) keys.push(['Double-click', 'Select structure']);
    const all = key('command select-all');
    if (all) keys.push([all, 'Select All']);
    const next = key('command next-structure');
    if (next) keys.push([next, 'Next structure']);
    return toolHint(o.step, keys);
  }
  return toolHint(o.step, h.keys);
}

/**
 * A tool's name and the rest of its tooltip: "Wedge. Click again to reverse" → "Wedge",
 * "Click again to reverse". Parts that only say what a key does are left out of the rest when
 * the tip lists the keys itself.
 */
export function splitTitle(title: string, keysListed: boolean): { name: string; rest: string } {
  const m = /^(.*?)(?:\s*\(([^)]*)\))?(?:[.:]\s+|$)([\s\S]*)$/.exec(title);
  let name = (m?.[1] ?? title).trim(), rest = (m?.[3] ?? '').trim();
  const paren = m?.[2];
  // a bracket that is part of the name, such as "(η)" or "(δ+)", stays with it
  if (paren && !/\b(Alt|Shift|Ctrl|click|drag)\b/i.test(paren)) name = `${name} (${paren})`;
  if (keysListed) rest = withoutKeys(rest);
  if (rest) rest = rest[0].toUpperCase() + rest.slice(1);
  return { name, rest };
}

/** Text with what it says about keys (Alt, Shift, Ctrl) taken out, for a tip that lists the keys itself. */
export function withoutKeys(text: string): string {
  return text
    .replace(/\s*\((?:hold )?(?:Alt|Shift|Ctrl)[^)]*\)/g, '')
    .replace(/;\s*(?:Alt|Shift|Ctrl)[^);]*(?=\))/g, '')
    .replace(/;?\s*hold (?:Alt|Shift|Ctrl)[^.;]*/g, '')
    .split(/(?<=\.)\s+/)
    .filter((s) => !/^(Alt|Shift|Ctrl)\+/.test(s))
    .join(' ')
    .replace(/\.\s*$/, '')
    .trim();
}
