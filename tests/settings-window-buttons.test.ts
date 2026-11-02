// @vitest-environment jsdom
//
// Settings: one Apply / Set as Default bar on every page, a question before leaving changes
// unapplied, pictures of the choices, and the Hotkeys keyboard.

import { describe, it, expect } from 'vitest';
import { changedKeys, findPages } from '../src/ui/settings-window';
import { BOARD, chordFor, kindOf, shortName } from '../src/ui/key-board';
import { DEFAULT_KEYS } from '../src/editor/keymap';

describe('what a page changed', () => {
  it('lists the settings that differ, by value', () => {
    expect(changedKeys({ a: 1, b: { x: [1, 2] }, c: 'k' }, { a: 1, b: { x: [1, 3] }, d: true })).toEqual(['b', 'c', 'd']);
    expect(changedKeys({ a: { p: 1 } }, { a: { p: 1 } })).toEqual([]);
  });
  it('still finds pages by their words', () => {
    const pages = [{ id: 'drawing', title: 'Drawing', words: 'arrow width arrowhead', open: () => {} }, { id: 'style', title: 'Drawing Style', words: 'bond length', open: () => {} }];
    expect(findPages(pages, 'arrowhead').map((p) => p.id)).toEqual(['drawing']);
  });
});

describe('the Hotkeys keyboard', () => {
  const find = (key: string) => BOARD.flat().find((b) => b.key === key)!;
  const none = { shift: false, ctrl: false, alt: false };
  it('names each key as a key press of it would', () => {
    expect(chordFor(find('f'), none)).toBe('f');
    expect(chordFor(find('f'), { ...none, shift: true })).toBe('F');
    expect(chordFor(find('='), { ...none, shift: true })).toBe('+');
    expect(chordFor(find('s'), { ...none, ctrl: true })).toBe('Ctrl+S');
    expect(chordFor(find('z'), { ...none, ctrl: true, shift: true })).toBe('Ctrl+Shift+Z');
    expect(chordFor(find('ArrowUp'), { ...none, alt: true })).toBe('Alt+ArrowUp');
    expect(chordFor(find('Tab'), { ...none, shift: true })).toBe('Shift+Tab');
    expect(chordFor(find(' '), none)).toBe('Space');
    expect(chordFor(find('Shift'), none)).toBeNull();
  });
  it('reaches every default key for atoms, bonds and empty space that a US keyboard has', () => {
    const chords = new Set<string>();
    for (const shift of [false, true]) for (const b of BOARD.flat()) { const c = chordFor(b, { ...none, shift }); if (c) chords.add(c); }
    for (const ctx of ['atom', 'bond', 'space'] as const) {
      for (const k of Object.keys(DEFAULT_KEYS[ctx])) expect(chords.has(k) || /^Shift\+Arrow/.test(k), `${ctx} ${k}`).toBe(true);
    }
  });
  it('colours keys by kind and fits short names on them', () => {
    expect(kindOf('label CF3')).toBe('label');
    expect(kindOf('atom bond')).toBe('grow');
    expect(kindOf('atom plus')).toBe('mark');
    expect(kindOf('bond double')).toBe('bond');
    expect(kindOf('fuse benzene')).toBe('ring');
    expect(kindOf('tool arrow')).toBe('tool');
    expect(kindOf('command save')).toBe('file');
    expect(kindOf('command zoom-in')).toBe('view');
    expect(kindOf('command flip-h')).toBe('arrange');
    expect(shortName('label CF3')).toBe('CF3');
    expect(shortName('atom carbonyl')).toBe('C=O');
    expect(shortName('command save').length).toBeLessThanOrEqual(9);
  });
});
