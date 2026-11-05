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

// The Document's and Spreadsheet's right-click menus are this menu too: their own actions, keys
// beside them, a row of Cut/Copy/Paste/Delete, and the keys back at the caret after Escape.
describe('right-click menu actions, rows and Escape', () => {
  afterEach(() => closeContextMenu());
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('runs an action of its own, shows its key and keeps a disabled one from running', () => {
    const ran: string[] = [];
    showContextMenu(10, 10, [
      { label: 'Clear Contents', run: () => ran.push('clear'), key: 'Delete' },
      { label: 'Reset to Calculated', run: () => ran.push('reset'), disabled: true },
      { label: 'Paste Special…', run: () => ran.push('special'), cmd: 'paste-special' },
    ], { run: () => {}, key: (cmd) => (cmd === 'paste-special' ? 'Ctrl+Alt+V' : undefined) });
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.context-menu button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Clear ContentsDelete', 'Reset to Calculated', 'Paste Special…Ctrl+Alt+V']);
    expect(buttons[1].disabled).toBe(true);
    buttons[0].click();
    expect(ran).toEqual(['clear']);
    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it('puts a row of buttons in one line, each running its command', () => {
    const ran: string[] = [];
    showContextMenu(10, 10, [{ row: [{ cmd: 'cut', label: 'Cut' }, { cmd: 'copy', label: 'Copy' }] }, null, { cmd: 'select-all', label: 'Select All' }], { run: (cmd) => ran.push(cmd), key: (cmd) => (cmd === 'cut' ? 'Ctrl+X' : undefined) });
    const row = document.querySelector('.context-menu .cm-row')!;
    const buttons = [...row.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Cut', 'Copy']);
    expect(buttons[0].title).toBe('Cut (Ctrl+X)');
    expect(document.activeElement).toBe(buttons[0]);
    buttons[1].click();
    expect(ran).toEqual(['copy']);
  });

  it('calls back when Escape shuts it', async () => {
    let back = 0;
    showContextMenu(10, 10, [{ label: 'Paste', run: () => {} }], { run: () => {}, escaped: () => { back++; } });
    await tick();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
    expect(back).toBe(1);
  });
});
