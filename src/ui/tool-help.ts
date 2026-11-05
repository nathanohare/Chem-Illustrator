// What each drawing tool does, the steps to use it and the keys that change it: for the tool
// tips (resting the mouse on a tool) and the status bar's step-by-step hint. The keys listed
// here are the ones the editor really reads (editor.ts); keep the two in step.

import type { Tool } from '../editor/editor';
import type { Arrow } from '../model';

export interface ToolHelp {
  /** What the tool does, in a sentence or two (the status bar's whole hint). */
  what: string;
  /** What to do with it, one short step at a time (the status bar shows these). */
  steps: string[];
  /** Keys held (or pressed) while using it, each with only the bare action, said once. */
  keys: [string, string][];
}

const BOND_STEPS = ['Click an atom or empty space', 'Drag to aim'];
const BOND_KEYS: [string, string][] = [['Alt', 'Toggle angle snapping'], ['Hotkeys', 'Change the atom or bond pointed at']];

/** Help for tools named one by one; the rest go by their kind (below). */
const BY_NAME: Record<string, ToolHelp> = {
  select: {
    what: 'Ctrl+drag to copy. Hold Shift while dragging to lock orientation. Double-click selects a whole structure; Shift or Ctrl+click adds to the selection. Delete removes.',
    steps: ['Ctrl+drag to copy', 'Hold Shift while dragging to lock orientation'],
    keys: [['Shift', 'Add to selection; move straight'], ['Ctrl', 'Move a copy'], ['Alt', 'Toggle snapping'], ['Double-click', 'Select whole structure']],
  },
  lasso: {
    what: 'Drag a loop around what to select, to pick pieces out of a crowded scheme. Then drag what is selected to move it.',
    steps: ['Drag a loop', 'Drag to move'],
    keys: [['Shift', 'Add to selection'], ['Ctrl', 'Move a copy']],
  },
  eraser: { what: 'Click an atom, bond, caption, arrow or shape to remove it.', steps: ['Click to delete'], keys: [] },
  sketch: {
    what: 'Draw freehand: a line is a bond, a zig-zag a chain, over a bond doubles it; a loop with corners is a ring, a circle benzene; write C, N, O, Cl, Br, + or − on an atom; scribble to erase.',
    steps: ['Draw', 'Lift to convert'],
    keys: [],
  },
  connector: { what: 'Drag from one shape\'s blue dot to another\'s: the connector sticks to both and follows them when they move.', steps: ['Drag from dot to dot'], keys: [] },
  'connector-elbow': { what: 'Drag from one shape\'s blue dot to another\'s: the connector bends square and follows the shapes when they move.', steps: ['Drag from dot to dot'], keys: [] },
  chain: {
    what: 'Drag from empty space or an atom; the number shows how many bonds. Click to type how many atoms; Alt+click repeats the last number.',
    steps: ['Drag from an atom or empty space', 'Let go at the length you want'],
    keys: [['Alt', 'Repeat last length']],
  },
  text: { what: 'Click an atom to type a label (OMe, CO2Et, NHBoc…), or click empty space for a caption.', steps: ['Click an atom or empty space', 'Type; Esc to finish'], keys: [['Ctrl', 'Follow a link']] },
  element: { what: 'Click atoms to make them the element picked in the periodic table, or empty space to add one.', steps: ['Pick an element', 'Click atoms'], keys: [] },
  'bond-hapto': {
    what: 'Drag from a metal into a ring (η⁵, η⁶) or onto a bond (η²), or the other way. Click inside a ring or on a bond for a new metal M there; select an allyl or diene, then click the metal. Click a hapto bond to draw it to each atom.',
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

const CURVE_WHAT = 'Drag from where the electrons start to where they go. They start at a lone pair, bond, radical or charge and go to an atom, a bond, or the gap where a new bond forms; swing out to one side to bend that way. Or click where it starts, click points it goes through, and click where it ends. Ctrl+drag (or the pen) draws it freehand. The arrow sticks to the structure. Drag the middle dot (an S: its diamonds, or its line) to change the curve.';
const GEO_HELP: ToolHelp = {
  what: 'Click on the page to put the shape down, or drag to draw it at any size (Shift keeps its shape). Double-click a shape to type in it.',
  steps: ['Click or drag', 'Double-click to type'],
  keys: [['Shift', 'Keep proportions']],
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
      };
    case 'arrow':
      if (t.style.sweep) {
        return {
          what: CURVE_WHAT,
          steps: ['Press where the electrons start', 'Drag to where they go'],
          keys: [['Alt', 'Toggle snapping'], ['Ctrl', 'Freehand'], ['Shift', 'Branch from an arrow']],
        };
      }
      return {
        what: 'Drag to draw an arrow (hold Alt or Space: any angle); click for a standard one. Drag the ends to move them, the middle to bend it.',
        steps: ['Click, or drag to draw'],
        keys: [['Alt', 'Toggle angle snapping'], ['Shift', 'Branch from an arrow']],
      };
    case 'shape':
      if (t.shape.kind === 'line') return { what: 'Drag to draw a line, in 15° steps. Drag its ends to move them.', steps: ['Drag to draw'], keys: [['Alt', 'Toggle angle snapping']] };
      return {
        what: 'Drag to draw. Drag the corner squares to resize; the Style panel changes dashes, fill, corners and shadow.',
        steps: [t.from === 'center' ? 'Drag out from the center' : 'Drag from a corner'],
        keys: t.from === 'center' ? [] : [['Shift', 'Square or circle']],
      };
    case 'bracket':
      return { what: 'Drag a box to put brackets around it, or click a structure to bracket it.', steps: ['Click a structure, or drag a box'], keys: [] };
    case 'template':
      return {
        what: 'Click empty space to place it (drag to turn it), a bond to fuse it on, or an atom to join it there (Alt: the other way: by a new bond, or sharing the atom).',
        steps: ['Click a space, bond or atom', 'Drag to turn'],
        keys: [['Alt', 'Join the other way'], ['Tab', 'Next fit (Shift+Tab: back)']],
      };
    case 'symbol':
      return {
        what: 'Click an atom to put the mark in its most open space, or press on the atom and drag around it to aim it.',
        steps: ['Click an atom', 'Drag to aim'],
        keys: [['Shift', 'Snap to 15°']],
      };
    case 'mark':
      return { what: `Click where the ${t.text} goes: it is set as a caption.`, steps: ['Click to place'], keys: [] };
    case 'perspective':
      return {
        what: t.real
          ? 'Drag a structure to turn its real 3-D shape, built from the drawing; wedges and bold bonds say which shape is meant.'
          : 'Drag a structure to turn it in 3-D as a flat sheet, the way it is drawn.',
        steps: ['Drag a structure to turn it'],
        keys: [['Shift', 'Snap to 15°']],
      };
    case 'pen':
      return {
        what: 'Draw a freeform shape point by point. Click for a corner; drag out from a point to curve through it.',
        steps: ['Click each point', 'Click the first point to close', 'Double-click to end open'],
        keys: [['Enter', 'End open'], ['Backspace', 'Take back a point'], ['Esc', 'Stop']],
      };
    case 'bond':
    default:
      return { what: 'Click empty space or an atom to draw; drag to aim (hold Alt or Space: any angle). Point at an atom or bond and press a hotkey (Edit > Keyboard Shortcuts lists them).', steps: BOND_STEPS, keys: BOND_KEYS };
  }
}

/** The status bar's guide to a selected arrow's handles: which handle does what, and the keys. */
export function arrowHandleHelp(r: Pick<Arrow, 'sweep' | 'bez' | 'equilibrium'> & Partial<Pick<Arrow, 'ellipse'>>): { name: string; handles: string[]; keys: [string, string][] } {
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
