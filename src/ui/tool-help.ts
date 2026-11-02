// What each drawing tool does, the steps to use it and the keys that change it: for the tool
// tips (resting the mouse on a tool) and the status bar's step-by-step hint. The keys listed
// here are the ones the editor really reads (editor.ts); keep the two in step.

import type { Tool } from '../editor/editor';
import type { Arrow } from '../model';

export interface ToolHelp {
  /** What the tool does, in a sentence or two (the status bar's whole hint). */
  what: string;
  /** What to do with it, one step at a time. */
  steps: string[];
  /** Keys held (or pressed) while using it, and what each does. */
  keys: [string, string][];
}

const BOND_STEPS = ['Click empty space or an atom to draw a bond', 'Drag to aim it; let go on an atom to join them'];
const BOND_KEYS: [string, string][] = [
  ['Alt', 'any angle and length while dragging (or hold Space)'],
  ['Hotkey', 'point at an atom or bond and press a key to change it (Edit ▸ Hotkeys)'],
];

/** Help for tools named one by one; the rest go by their kind (below). */
const BY_NAME: Record<string, ToolHelp> = {
  select: {
    what: 'Click to select (Shift or Ctrl+click adds), drag to box-select or move. Ctrl+drag copies; Shift keeps a drag straight. Double-click selects a whole structure. Delete removes.',
    steps: ['Click something, or drag a box round it', 'Drag what is selected to move it'],
    keys: [['Shift', 'click: add or take out; drag: keep the move straight'], ['Ctrl', 'click: add or take out; drag: move a copy'], ['Alt', 'drag without snapping to guides or onto atoms'], ['Double-click', 'select the whole structure']],
  },
  lasso: {
    what: 'Drag a loop round what to select, to pick pieces out of a crowded scheme. Then drag what is selected to move it.',
    steps: ['Drag a loop round what to select', 'Drag what is selected to move it'],
    keys: [['Shift', 'add to what is selected'], ['Ctrl', 'drag the selection: move a copy']],
  },
  eraser: { what: 'Click an atom, bond, caption, arrow or shape to remove it.', steps: ['Click what to remove'], keys: [] },
  sketch: {
    what: 'Draw freehand: a line is a bond, a zig-zag a chain, over a bond doubles it; a loop with corners is a ring, a circle benzene; write C, N, O, Cl, Br, + or − on an atom; scribble to erase.',
    steps: ['Draw with the pen or mouse', 'Lift: what you drew becomes bonds, rings and labels'],
    keys: [],
  },
  connector: { what: 'Drag from one shape\'s blue dot to another\'s: the connector sticks to both and follows them when they move.', steps: ['Press on a shape\'s blue dot', 'Drag to another shape\'s dot and let go'], keys: [] },
  'connector-elbow': { what: 'Drag from one shape\'s blue dot to another\'s: the connector bends square and follows the shapes when they move.', steps: ['Press on a shape\'s blue dot', 'Drag to another shape\'s dot and let go'], keys: [] },
  chain: {
    what: 'Drag from empty space or an atom; the number shows how many bonds. Click to type how many atoms; Alt+click repeats the last number.',
    steps: ['Press on empty space or an atom', 'Drag: the number counts the bonds; let go'],
    keys: [['Alt', 'click: the same number of atoms as last time']],
  },
  text: { what: 'Click an atom to type a label (OMe, CO2Et, NHBoc…), or click empty space for a caption.', steps: ['Click an atom or empty space', 'Type; Esc or a click outside ends it'], keys: [['Ctrl', 'click a link in a caption to follow it']] },
  element: { what: 'Click atoms to make them the element picked in the periodic table, or empty space to add one.', steps: ['Pick an element in the periodic table', 'Click atoms to change them'], keys: [] },
  'bond-hapto': {
    what: 'Drag from a metal into a ring (η⁵, η⁶) or onto a bond (η²), or the other way. Click inside a ring or on a bond for a new metal M there; select an allyl or diene, then click the metal. Click a hapto bond to draw it to each atom.',
    steps: ['Press on a metal', 'Drag into a ring or onto a π-bond and let go'],
    keys: [],
  },
  fragment: { what: 'Drag a line across the bonds to break (or click one bond). Each piece gets a caption with its formula and exact mass, which you can edit.', steps: ['Press beside the bonds to break', 'Drag a line across them and let go'], keys: [] },
};

const CURVE_WHAT = 'Drag from where the electrons start to where they go. They start at a lone pair, bond, radical or charge and go to an atom, a bond, or the gap where a new bond forms; swing out to one side to bend that way. Or click where it starts, click points it goes through, and click where it ends. Ctrl+drag (or the pen) draws it freehand. The arrow sticks to the structure. Drag the middle dot (an S: its diamonds, or its line) to change the curve.';
const GEO_HELP: ToolHelp = {
  what: 'Click on the page to put the shape down, or drag to draw it at any size (Shift keeps its shape). Double-click a shape to type in it.',
  steps: ['Click on the page, or press and drag', 'Let go; double-click it to type in it'],
  keys: [['Shift', 'keep its shape']],
};

/** What a tool does, step by step, and the keys that change it. */
export function toolHelp(name: string, t: Tool | undefined): ToolHelp {
  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith('geo:') || !t) return GEO_HELP;
  switch (t.kind) {
    case 'ring':
      return {
        what: 'Click empty space, an atom (spiro; Alt+click to attach by a bond) or a bond (fused). Drag to orient.',
        steps: ['Click empty space, an atom (spiro) or a bond (fused)', 'Or press and drag to turn it'],
        keys: [['Alt', 'click an atom: join the ring to it by a bond'], ['Shift', 'click: the other set of double bonds'], ...(t.aromatic ? [['Ctrl', 'click: draw it with a circle'] as [string, string]] : [])],
      };
    case 'arrow':
      if (t.style.sweep) {
        return {
          what: CURVE_WHAT,
          steps: ['Press on the lone pair, bond or charge the electrons leave', 'Drag to the atom, bond or gap they go to, then let go'],
          keys: [['Alt', 'draw it freely, not snapped to the structure'], ['Ctrl', 'drag: draw it freehand'], ['Shift', 'drag from an arrow: branch a new one off it'], ['Click', 'the start, points on the way, then the end']],
        };
      }
      return {
        what: 'Drag to draw an arrow (hold Alt or Space: any angle); click for a standard one. Drag the ends to move them, the middle to bend it.',
        steps: ['Press where the arrow starts (or just click)', 'Drag to where it ends and let go'],
        keys: [['Alt', 'any angle, not 15° steps (or hold Space)'], ['Shift', 'drag from an arrow\'s end or middle: branch a new one off it']],
      };
    case 'shape':
      if (t.shape.kind === 'line') return { what: 'Drag to draw a line, in 15° steps. Drag its ends to move them.', steps: ['Press where the line starts', 'Drag to where it ends and let go'], keys: [['Alt', 'any angle']] };
      return {
        what: 'Drag to draw. Drag the corner squares to resize; the Style panel changes dashes, fill, corners and shadow.',
        steps: [t.from === 'center' ? 'Press where its centre goes' : 'Press at one corner', 'Drag out and let go'],
        keys: t.from === 'center' ? [] : [['Shift', 'a square or circle']],
      };
    case 'bracket':
      return { what: 'Drag a box to put brackets round it, or click a structure to bracket it.', steps: ['Click a structure, or press at a corner', 'Drag a box round what to bracket and let go'], keys: [] };
    case 'template':
      return {
        what: 'Click empty space to place it (drag to turn it), a bond to fuse it on, or an atom to join it there (Alt: the other way: by a new bond, or sharing the atom).',
        steps: ['Click empty space, a bond (fused) or an atom', 'Or hold and drag to turn it; Tab tries the next way it fits'],
        keys: [['Alt', 'on an atom: join by a bond, or share the atom; dragging: any angle'], ['Tab', 'while held: the next way it can go (Shift+Tab: back)']],
      };
    case 'symbol':
      return {
        what: 'Click an atom to put the mark in its most open space, or press on the atom and drag round it to aim it.',
        steps: ['Click an atom', 'Or press on it and drag round it to aim the mark'],
        keys: [['Alt', 'aim in 15° steps'], ['Shift', 'aim in 15° steps']],
      };
    case 'mark':
      return { what: `Click where the ${t.text} goes: it is set as a caption.`, steps: ['Click where it goes'], keys: [] };
    case 'perspective':
      return {
        what: t.real
          ? 'Drag a structure to turn its real 3-D shape, built from the drawing; wedges and bold bonds say which shape is meant.'
          : 'Drag a structure to turn it in 3-D as a flat sheet, the way it is drawn.',
        steps: ['Press on an atom or bond of the structure', 'Drag to turn it, and let go'],
        keys: [['Shift', 'turn in 15° steps, one way at a time']],
      };
    case 'bond':
    default:
      return { what: 'Click empty space or an atom to draw; drag to aim (hold Alt or Space: any angle). Point at an atom or bond and press a hotkey (Edit > Hotkeys lists them).', steps: BOND_STEPS, keys: BOND_KEYS };
  }
}

/** The status bar's guide to a selected arrow's handles: which handle does what, and the keys. */
export function arrowHandleHelp(r: Pick<Arrow, 'sweep' | 'bez' | 'equilibrium'>): { name: string; handles: string[]; keys: [string, string][] } {
  if (r.bez?.length) {
    return {
      name: 'S-shaped arrow selected',
      handles: ['Ends: drag to another atom or bond', 'Diamonds: drag to reshape each bend', 'Line: drag with a curved arrow tool to reshape it'],
      keys: [['Alt', 'a sharp corner; ends go anywhere'], ['Shift', 'turn in 15° steps']],
    };
  }
  if (r.sweep) {
    return {
      name: 'Curved arrow selected',
      handles: ['Ends: drag to another atom, bond or lone pair', 'Middle dot: drag to change the curve'],
      keys: [['Alt', 'any bend, not 15° steps; ends go anywhere']],
    };
  }
  return {
    name: 'Arrow selected',
    handles: ['Ends: drag to move them', 'Middle: drag to bend it into a curve'],
    keys: [['Alt', 'any angle or bend, not 15° steps']],
  };
}

/** The status bar's guide to a selected box, oval or line's handles. */
export function shapeHandleHelp(line: boolean): { name: string; handles: string[]; keys: [string, string][] } {
  return line
    ? { name: 'Line selected', handles: ['Ends: drag to move them'], keys: [['Alt', 'any angle']] }
    : { name: 'Shape selected', handles: ['Squares: drag to resize', 'Round handle: drag to turn it'], keys: [['Shift', 'keep its proportions; turn in 15° steps'], ['Ctrl', 'resize about the middle']] };
}

/**
 * A tool's name and the rest of its tool tip: "Wedge. Click again to reverse" → "Wedge",
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
