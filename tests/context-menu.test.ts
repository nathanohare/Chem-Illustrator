// @vitest-environment jsdom
// The right-click menu's list: lines and groups tidied so it never shows a line at either end,
// two lines together, or a group with nothing in it. And its highlight: a group's row is lit only
// while its group is open.

import { describe, it, expect, afterEach } from 'vitest';
import { tidyItems, showContextMenu, closeContextMenu, type MenuItem } from '../src/ui/context-menu';

describe('right-click menu items', () => {
  it('drops doubled lines, lines at the ends and empty groups', () => {
    const items: MenuItem[] = [null, { cmd: 'cut' }, null, null, { label: 'Order', items: [null] }, null, { cmd: 'copy' }, null];
    expect(tidyItems(items)).toEqual([{ cmd: 'cut' }, null, { cmd: 'copy' }]);
  });
  it('tidies inside groups too', () => {
    expect(tidyItems([{ label: 'Align', items: [{ cmd: 'a' }, null, null, { cmd: 'b' }, null] }]))
      .toEqual([{ label: 'Align', items: [{ cmd: 'a' }, null, { cmd: 'b' }] }]);
  });
});

describe('right-click menu highlight', () => {
  afterEach(() => closeContextMenu());
  const hooks = { run: () => {}, key: () => undefined };
  const items: MenuItem[] = [
    { cmd: 'cut', label: 'Cut' },
    { label: 'Copy As', items: [{ cmd: 'copy-smiles', label: 'SMILES' }] },
    { label: 'Arrange', items: [{ cmd: 'front', label: 'Bring to Front' }] },
    { cmd: 'style', label: 'Show Style Panel' },
  ];
  const rows = () => [...document.querySelectorAll<HTMLButtonElement>('.context-menu')[0].querySelectorAll('button')];
  const row = (name: string) => rows().find((b) => b.textContent === name)!;
  const lit = () => rows().filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.textContent);
  const enter = (b: HTMLElement) => b.dispatchEvent(new Event('pointerenter'));

  it('takes the highlight off a group row when the mouse moves on to a command', () => {
    showContextMenu(10, 10, items, hooks);
    enter(row('Copy As'));
    expect(lit()).toEqual(['Copy As']);
    expect(document.querySelectorAll('.context-menu')).toHaveLength(2);
    enter(row('Show Style Panel'));
    expect(lit()).toEqual([]);
    expect(document.querySelectorAll('.context-menu')).toHaveLength(1);
  });
  it('moves the highlight from one group row to the next', () => {
    showContextMenu(10, 10, items, hooks);
    enter(row('Copy As'));
    enter(row('Arrange'));
    expect(lit()).toEqual(['Arrange']);
    expect(document.querySelectorAll('.context-menu')).toHaveLength(2);
  });
  it('moves keyboard focus to the row under the mouse', () => {
    showContextMenu(10, 10, items, hooks);
    expect(document.activeElement).toBe(row('Cut'));
    enter(row('Show Style Panel'));
    expect(document.activeElement).toBe(row('Show Style Panel'));
  });
  it('unlights the row when the arrow key shuts its group', () => {
    showContextMenu(10, 10, items, hooks);
    row('Copy As').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const sub = document.querySelectorAll<HTMLElement>('.context-menu')[1];
    expect(document.activeElement?.textContent).toBe('SMILES');
    sub.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(lit()).toEqual([]);
    expect(document.activeElement).toBe(row('Copy As'));
  });
});
