import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/editor/editor';
import { toolHelp, splitTitle, arrowHandleHelp, withoutKeys } from '../src/ui/tool-help';

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
    const curved = toolHelp('arrow-curved', TOOLS['arrow-curved']).keys.map(([k]) => k);
    expect(curved).toEqual(expect.arrayContaining(['Alt', 'Ctrl', 'Shift']));
    expect(toolHelp('ring-benzene', TOOLS['ring-benzene']).keys.map(([k]) => k)).toContain('Ctrl');
    expect(toolHelp('ring-6', TOOLS['ring-6']).keys.map(([k]) => k)).not.toContain('Ctrl');
    expect(toolHelp('perspective', TOOLS.perspective).keys[0][0]).toBe('Shift');
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
