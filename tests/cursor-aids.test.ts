import { describe, expect, it } from 'vitest';
import { angleText, hintLines, lengthText, modifierHints, parseCursorAids, readoutText, type HintState } from '../src/editor/cursor-aids';
import { parseArrowLook, parseSettings } from '../src/settings';

const base: HintState = { tool: 'bond', drag: 'draw', fixedAngles: true, fixedLength: true, snapping: false, asksChain: true };
const none = { shift: false, alt: false, ctrl: false };

describe('angle and length beside the pointer', () => {
  it('reads angles counter-clockwise from pointing right, as a protractor does (the page runs down)', () => {
    expect(angleText({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe('0°');
    expect(angleText({ x: 0, y: 0 }, { x: 0, y: -10 })).toBe('90°');
    expect(angleText({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe('180°');
    expect(angleText({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe('270°');
    expect(angleText({ x: 0, y: 0 }, { x: 10, y: -5.7735 })).toBe('30°');
  });
  it('writes lengths in the rulers\' units', () => {
    expect(lengthText(72, 'in')).toBe('1.00 in');
    expect(lengthText(72, 'cm')).toBe('2.54 cm');
    expect(readoutText({ x: 0, y: 0 }, { x: 36, y: 0 }, { angle: true, length: true, units: 'in' })).toBe('0°  0.50 in');
    expect(readoutText({ x: 0, y: 0 }, { x: 36, y: 0 }, { angle: false, length: false, units: 'in' })).toBe('');
  });
  it('keeps only sensible saved settings, angle and hints on and length off to start', () => {
    expect(parseCursorAids(undefined)).toMatchObject({ angle: true, length: false, hints: true });
    expect(parseCursorAids({ angle: false, length: true, look: 'odd' })).toMatchObject({ angle: false, length: true, look: 'box' });
    expect(parseSettings('{}').cursorAids.hints).toBe(true);
  });
});

describe('modifier hints', () => {
  it('a bond: Alt for any angle and length, while the fixed settings are on', () => {
    expect(modifierHints(base, none)).toEqual([{ key: 'Alt', text: 'any angle and length', on: false }]);
    expect(modifierHints({ ...base, fixedLength: false }, { ...none, alt: true })).toEqual([{ key: 'Alt', text: 'any angle', on: true }]);
    expect(modifierHints({ ...base, fixedLength: false, fixedAngles: false }, none)).toEqual([]);
  });
  it('an arrow: Alt, and Ctrl for a freehand path with a curved arrow; Shift on an arrow to branch', () => {
    expect(modifierHints({ ...base, tool: 'arrow', curved: true }, none).map((h) => h.key)).toEqual(['Alt', 'Ctrl']);
    expect(modifierHints({ ...base, tool: 'arrow', drag: 'none', over: 'arrow' }, none)[0]).toMatchObject({ key: 'Shift', text: 'drag to branch from this arrow' });
  });
  it('moving, turning and resizing', () => {
    expect(modifierHints({ ...base, drag: 'move', snapping: true }, { ...none, shift: true }).map((h) => [h.key, h.on])).toEqual([['Shift', true], ['Alt', false]]);
    expect(modifierHints({ ...base, drag: 'rotate' }, none)[0].text).toBe('15° steps');
    expect(modifierHints({ ...base, drag: 'handle', handle: { kind: 'shape', which: 'se' } }, none).map((h) => h.key)).toEqual(['Shift', 'Ctrl']);
    expect(modifierHints({ ...base, drag: 'handle', handle: { kind: 'shape', which: 'p2', line: true } }, none)[0].text).toBe('any angle');
  });
  it('shapes and rings', () => {
    expect(modifierHints({ ...base, tool: 'shape', shape: 'oval' }, none)[0].text).toBe('circle');
    expect(modifierHints({ ...base, tool: 'shape', shape: 'line' }, none)[0].text).toBe('any angle');
    expect(modifierHints({ ...base, tool: 'ring', aromatic: true, over: 'atom' }, none).map((h) => h.key)).toEqual(['Alt', 'Shift', 'Ctrl']);
  });
  it('names keys as a Mac keyboard does', () => {
    const h = modifierHints({ ...base, tool: 'arrow', curved: true }, none);
    expect(hintLines(h, false).map((l) => l.text)).toEqual(['Alt: any angle', 'Ctrl: drag a path freehand']);
    expect(hintLines(h, true).map((l) => l.text)).toEqual(['⌥ any angle', '⌘ drag a path freehand']);
  });
});

describe('arrow sizes', () => {
  it('keeps widths in points, dropping nonsense', () => {
    expect(parseArrowLook({ width: 1, headLength: 'x', headWidth: -2 })).toEqual({ width: 1, headLength: null, headWidth: null });
    expect(parseArrowLook({ width: 100 })).toEqual({ width: 30, headLength: null, headWidth: null });
    expect(parseSettings('{}').arrowLook).toEqual({ width: null, headLength: null, headWidth: null });
  });
});
