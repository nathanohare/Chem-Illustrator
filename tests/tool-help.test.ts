import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/editor/editor';
import { toolHelp, allKeys, statusHint, arrowFamily, splitTitle, arrowHandleHelp, withoutKeys, type KeyLookup } from '../src/ui/tool-help';
import type { EditorStatus } from '../src/editor/editor';

describe('tool help', () => {
  it('gives every tool steps and a description of its own kind', () => {
    for (const [name, t] of Object.entries(TOOLS)) {
      const h = toolHelp(name, t);
      expect(h.what.length, name).toBeGreaterThan(10);
      expect(h.steps.length, name).toBeGreaterThan(0);
      // marks, symbols and the perspective tools no longer get the bond tool's help
      if (t.kind !== 'bond') expect(h.what, name).not.toMatch(/^Click empty space or an atom to draw/);
    }
  });

  it('lists the keys the editor reads for curved arrows, rings and shapes', () => {
    const curved = allKeys(toolHelp('arrow-curved', TOOLS['arrow-curved'])).map(([k]) => k);
    expect(curved).toEqual(expect.arrayContaining(['Alt', 'Ctrl', 'Shift']));
    expect(allKeys(toolHelp('ring-benzene', TOOLS['ring-benzene'])).map(([k]) => k)).toContain('Ctrl');
    expect(allKeys(toolHelp('ring-6', TOOLS['ring-6'])).map(([k]) => k)).not.toContain('Ctrl');
    expect(allKeys(toolHelp('perspective', TOOLS.perspective))[0][0]).toBe('Shift');
  });

  it('splits a tool tip into its name and the rest, leaving out what the keys list says', () => {
    expect(splitTitle('Wedge. Click again to reverse', true)).toEqual({ name: 'Wedge', rest: 'Click again to reverse' });
    expect(splitTitle('Oval (Shift: circle)', true)).toEqual({ name: 'Oval', rest: '' });
    expect(splitTitle('Partial positive charge (δ+): click an atom', true)).toEqual({ name: 'Partial positive charge (δ+)', rest: 'Click an atom' });
    expect(splitTitle('Curved arrow (electron pair). Drag from an atom or bond to an atom or bond and it snaps like a mechanism arrow; hold Alt to draw freely', true).rest)
      .toBe('Drag from an atom or bond to an atom or bond and it snaps like a mechanism arrow');
    expect(splitTitle('Chain: drag to draw a zig-zag chain, or click to type how many atoms (Alt+click: the same number again)', true).rest)
      .toBe('Drag to draw a zig-zag chain, or click to type how many atoms');
    expect(splitTitle('Reaction arrow. Shift+drag from an arrow\'s end or middle to branch a new arrow off it', true)).toEqual({ name: 'Reaction arrow', rest: '' });
    expect(withoutKeys('Drag to aim (hold Alt or Space: any angle). Point at an atom')).toBe('Drag to aim. Point at an atom');
    expect(splitTitle('Hapto (η) bond: drag from a metal', false).name).toBe('Hapto (η) bond');
  });

  it('tells a selected arrow\'s handles apart by its kind', () => {
    expect(arrowHandleHelp({ sweep: 0, equilibrium: false }).handles[1]).toMatch(/bend/);
    expect(arrowHandleHelp({ sweep: 1, equilibrium: false }).name).toBe('Curved arrow selected');
    expect(arrowHandleHelp({ sweep: 0, bez: [{ x: 0, y: 0 }], equilibrium: false }).name).toMatch(/^S-shaped/);
  });
});

// the default keys, as keysOf gives them in main.ts
const DEFAULTS: Record<string, string> = {
  'command reaction-left': 'Ctrl+←', 'command reaction-right': 'Ctrl+→', 'command reaction-up': 'Ctrl+↑', 'command reaction-down': 'Ctrl+↓',
  'command turn-ccw-1': 'Alt+←', 'command turn-cw-1': 'Alt+→', 'command turn-ccw-15': 'Alt+↑', 'command turn-cw-15': 'Alt+↓',
  'command nudge-left': '←', 'command nudge-right': '→', 'command nudge-up': '↑', 'command nudge-down': '↓',
  'command nudge-far-left': 'Shift+←', 'command nudge-far-right': 'Shift+→', 'command nudge-far-up': 'Shift+↑', 'command nudge-far-down': 'Shift+↓',
  'hotspot left': '←', 'hotspot right': '→', 'hotspot up': '↑', 'hotspot down': '↓',
  'command join': 'Ctrl+J', 'command select-all': 'Ctrl+A', 'command next-structure': 'Tab',
};
const key: KeyLookup = (a) => DEFAULTS[a];
const idle: EditorStatus = { drag: 'none', dragKeys: [], copying: false, highlight: null, atoms: 0, bonds: 0, others: 0, whole: false, joinable: false, partOfOne: false };
const hint = (name: string, st: Partial<EditorStatus>, one: { name: string; handles: string[] } | null = null, k: KeyLookup = key) =>
  statusHint({ name, label: name, t: TOOLS[name], st: { ...idle, ...st }, step: 0, one, key: k });
const keysOf = (h: { keys: [string, string][] }) => h.keys.map(([k]) => k);

describe('status bar hints', () => {
  it('names a family of arrow keys once, or the first key when remapped', () => {
    expect(arrowFamily(key, ['command reaction-left', 'command reaction-right', 'command reaction-up', 'command reaction-down'])).toBe('Ctrl+Arrow');
    expect(arrowFamily(key, ['command nudge-left', 'command nudge-right', 'command nudge-up', 'command nudge-down'])).toBe('Arrow keys');
    const moved: KeyLookup = (a) => (a === 'command reaction-left' ? 'Ctrl+Shift+R' : DEFAULTS[a]);
    expect(arrowFamily(moved, ['command reaction-left', 'command reaction-right', 'command reaction-up', 'command reaction-down'])).toBe('Ctrl+Shift+R');
    expect(arrowFamily(() => undefined, ['command nudge-left'])).toBeUndefined();
  });

  it('with nothing selected, says how to select and nothing about dragging', () => {
    const h = hint('select', {});
    expect(h.steps).toEqual(['Click or drag a box to select']);
    expect(keysOf(h)).toEqual(['Double-click', 'Ctrl+A', 'Tab']);
    expect(JSON.stringify(h.keys)).not.toMatch(/Shift|Alt|snapping|orientation/);
  });

  it('with a whole structure selected: Ctrl+drag, the arrow keys, Enter; no snapping or Shift', () => {
    const h = hint('select', { atoms: 12, bonds: 12, whole: true });
    expect(h.name).toBe('Structure selected');
    expect(h.steps).toEqual(['Ctrl+drag to copy']);
    expect(h.keys).toEqual([['Ctrl+Arrow', 'Reaction arrow'], ['Alt+Arrow', 'Rotate'], ['Arrow keys', 'Nudge (Shift: farther)'], ['Enter', 'Highlight last atom']]);
    // a whole two-bond structure is no Join
    expect(keysOf(hint('select', { atoms: 3, bonds: 2, whole: true, joinable: true }))).not.toContain('Ctrl+J');
  });

  it('with part of a structure selected: double-click for the whole, Join for two atoms', () => {
    const h = hint('select', { atoms: 2, joinable: true });
    expect(h.name).toBe('Atoms selected');
    expect(keysOf(h).slice(0, 2)).toEqual(['Double-click', 'Ctrl+J']);
    expect(keysOf(h)).not.toContain('Ctrl+Arrow');
    expect(keysOf(hint('select', { atoms: 3 }))).not.toContain('Ctrl+J');
    // part of one structure: Space or Tab selects it whole (several structures: double-click)
    expect(hint('select', { atoms: 1, partOfOne: true }).keys[0]).toEqual(['Space/Tab', 'Select structure']);
    // one atom: nothing to turn
    expect(keysOf(hint('select', { atoms: 1 }))).not.toContain('Alt+Arrow');
  });

  it('with an atom highlighted: Space or Tab selects the molecule, the arrows move the highlight', () => {
    const h = hint('bond-single', { highlight: 'atom' });
    expect(h.name).toBe('Atom highlighted');
    expect(h.keys).toEqual([['Space/Tab', 'Select molecule'], ['Arrow keys', 'Move highlight']]);
  });

  it('while dragging, only the drag\'s own keys', () => {
    const move = hint('select', { drag: 'move', atoms: 5, whole: true, dragKeys: [['Shift', 'Straight across or down']] });
    expect(move.name).toBe('Moving');
    expect(move.steps).toEqual([]);
    expect(move.keys).toEqual([['Shift', 'Straight across or down']]);
    expect(hint('select', { drag: 'move', copying: true }).name).toBe('Copying');
    expect(hint('select', { drag: 'rotate', dragKeys: [['Shift', '15° steps']] }).keys).toEqual([['Shift', '15° steps']]);
    // a template's Tab (pressed, not held) shows while it is placed, not before
    const tpl = Object.keys(TOOLS).find((n) => TOOLS[n].kind === 'template')!;
    expect(keysOf(hint(tpl, {}))).not.toContain('Tab');
    expect(keysOf(hint(tpl, { drag: 'draw' }))).toContain('Tab');
  });

  it('keeps drag-only keys off a drawing tool\'s bar until the drag', () => {
    expect(keysOf(hint('bond-single', {}))).toEqual(['Hotkeys']);
    expect(keysOf(hint('bond-single', { drag: 'draw', dragKeys: [['Alt', 'Any angle']] }))).toEqual(['Alt']);
    expect(keysOf(hint('arrow', {}))).not.toContain('Alt');
  });

  it('a selected arrow says what its handles do, and its keys only while one is dragged', () => {
    const one = arrowHandleHelp({ sweep: 0, equilibrium: false });
    const h = hint('select', { others: 1 }, one);
    expect(h.name).toBe('Arrow selected');
    expect(h.steps).toEqual([...one.handles, 'Ctrl+drag to copy']);
    expect(keysOf(h)).not.toContain('Alt');
    expect(hint('select', { others: 1, drag: 'handle', dragKeys: [['Alt', 'Any angle']] }, one).keys).toEqual([['Alt', 'Any angle']]);
  });

  it('leaves out a key that has been unbound', () => {
    const h = hint('select', { atoms: 4, whole: true }, null, (a) => (a.includes('reaction') ? undefined : DEFAULTS[a]));
    expect(keysOf(h)).not.toContain('Ctrl+Arrow');
  });
});
