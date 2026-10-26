// @vitest-environment jsdom
//
// Escape in a Document ribbon gallery or drop-down closes it and nothing more: the key doesn't
// also reach the page (where, typing in a table cell, it left the cell and picked the whole
// table, so the next key typed replaced the table), and the keys go back to the caret.

import { describe, it, expect, afterEach } from 'vitest';
import { DocTablesUI, type DocTablesHost } from '../src/ui/doc-tables-ui';
import { popupMenu } from '../src/ui/sheet-view';
import type { TableData } from '../src/model';

const table: TableData = { cols: [80, 80], rows: [[{ runs: [] }, { runs: [] }]], head: 1, lines: 'grid' };

/** The page's hidden caret field, focused, counting the keys that reach it. */
function caret() {
  const ta = document.createElement('textarea');
  document.body.append(ta);
  ta.focus();
  const keys: string[] = [];
  ta.addEventListener('keydown', (e) => keys.push(e.key));
  return { ta, keys };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const escape = (el: Element) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

afterEach(() => { document.body.innerHTML = ''; });

describe('Escape in a Document gallery or drop-down', () => {
  it('closes the table styles gallery without the key reaching the cell, and the caret keeps the keys', async () => {
    const { ta, keys } = caret();
    let left = 0;
    const host: DocTablesHost = {
      file: () => null,
      target: () => ({ id: 1, r: 0, c: 0, t: table }),
      block: () => null,
      setTable: () => {},
      textW: () => 400,
      flash: () => {},
      focus: () => ta.focus(),
      leaveCell: () => { left++; },
      startCell: () => {},
      changed: () => {},
    };
    new DocTablesUI(host).styleGallery(10, 10);
    expect(document.querySelector('.doc-table-gallery')).not.toBeNull();
    await tick();
    expect(escape(ta)).toBe(false); // the default is stopped
    expect(document.querySelector('.doc-table-gallery')).toBeNull();
    expect(keys).toEqual([]);
    expect(left).toBe(0);
    expect(document.activeElement).toBe(ta);
    // the next Escape, with the gallery gone, is the page's again
    escape(ta);
    expect(keys).toEqual(['Escape']);
  });

  it('closes the borders menu the same way', async () => {
    const { ta, keys } = caret();
    const host = {
      file: () => null, target: () => ({ id: 1, r: 0, c: 0, t: table }), block: () => ({ r0: 0, c0: 0, r1: 0, c1: 1 }), setTable: () => {}, textW: () => 400,
      flash: () => {}, focus: () => ta.focus(), leaveCell: () => {}, startCell: () => {}, changed: () => {},
    } satisfies DocTablesHost;
    new DocTablesUI(host).bordersMenu(10, 10);
    const menu = document.querySelector('.popup-menu');
    expect(menu).not.toBeNull();
    await tick();
    escape(document.activeElement ?? ta);
    expect(document.querySelector('.popup-menu')).toBeNull();
    expect(keys).toEqual([]);
    expect(document.activeElement).toBe(ta);
  });

  it('closes a ribbon drop-down menu (Home > Select and the like) and gives the keys back to the caret', async () => {
    const { ta, keys } = caret();
    let ran = 0;
    popupMenu(10, 10, [['Select All', () => { ran++; }], null, ['Go To…', () => { ran++; }]]);
    // the menu takes the keys while it is open, for the arrow keys
    expect(document.activeElement?.closest('.popup-menu')).not.toBeNull();
    await tick();
    escape(document.activeElement!);
    expect(document.querySelector('.popup-menu')).toBeNull();
    expect(ran).toBe(0);
    expect(keys).toEqual([]);
    expect(document.activeElement).toBe(ta);
  });

  it('still lets other keys through while a gallery is open', async () => {
    const { ta, keys } = caret();
    const host = {
      file: () => null, target: () => ({ id: 1, r: 0, c: 0, t: table }), block: () => null, setTable: () => {}, textW: () => 400,
      flash: () => {}, focus: () => ta.focus(), leaveCell: () => {}, startCell: () => {}, changed: () => {},
    } satisfies DocTablesHost;
    new DocTablesUI(host).styleGallery(10, 10);
    await tick();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(keys).toEqual(['a']);
    expect(document.querySelector('.doc-table-gallery')).not.toBeNull();
  });
});
