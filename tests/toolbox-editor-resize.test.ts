// @vitest-environment jsdom
// Customize Toolboxes, changing a grid's size (laptop bench, PR #139): a narrower grid with room
// moves the buttons into empty cells; when some must go it asks first and changes nothing until
// answered (Cancel keeps the grid as it was); a hidden toolbox stays hidden while it is changed.

import { beforeAll, describe, expect, it } from 'vitest';
import { ToolboxEditor } from '../src/ui/toolbox-editor';
import { defaultToolboxes, withGrid, type ToolboxState } from '../src/ui/toolboxes';
import { gridItems } from '../src/ui/toolbox-grid';

beforeAll(() => {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement;
  proto.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  proto.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});

const tick = () => new Promise((r) => setTimeout(r, 0));
const keys = 'abcdefghijkl'.split('').map((c) => `cmd:${c}`);

function setUp(): { ed: ToolboxEditor; state: () => ToolboxState } {
  const g = { cols: 8, rows: 3, cells: [...keys, ...Array(12).fill(null)] };
  let st = withGrid(defaultToolboxes(), 'custom', g);
  expect(st.places.custom?.shown).toBeFalsy();
  const ed = new ToolboxEditor({
    get: () => st, set: (s) => { st = s; }, catalogue: () => [], describe: (key) => ({ key, label: key.slice(4).toUpperCase() }),
    title: () => 'My Toolbox', given: () => [], palette: () => null, flyGrid: () => ({ cols: 1, rows: 1, cells: [null] }), newPlace: () => ({ x: 0, y: 0 }),
  });
  ed.open('custom');
  return { ed, state: () => st };
}

const size = (cols: number, rows: number) => {
  const c = document.querySelector<HTMLInputElement>('.tbe [data-act=cols]')!;
  const r = document.querySelector<HTMLInputElement>('.tbe [data-act=rows]')!;
  r.value = String(rows);
  c.value = String(cols);
  c.dispatchEvent(new Event('change'));
};
const question = () => [...document.querySelectorAll<HTMLDialogElement>('dialog.keep-choose')].find((d) => d.open);

describe('Customize Toolboxes grid size', () => {
  it('moves buttons a narrower grid cuts off into its empty cells, and keeps a hidden toolbox hidden', async () => {
    const { state } = setUp();
    size(6, 3);
    await tick();
    expect(question()).toBeUndefined();
    const g = state().grids!.custom;
    expect([g.cols, g.rows]).toEqual([6, 3]);
    expect(gridItems(g).sort()).toEqual([...keys].sort());
    expect(state().places.custom?.shown).toBeFalsy();
    expect(document.querySelector('.tbe-say, [class*=say]')?.textContent).toMatch(/hidden/);
    document.querySelector<HTMLDialogElement>('dialog.tbe')!.close();
    document.querySelector('dialog.tbe')?.remove();
  });

  it('asks before taking buttons out, and changes nothing until it is answered; Cancel keeps the grid', async () => {
    const { state } = setUp();
    const before = state().grids!.custom;
    size(3, 3);
    await tick();
    const q = question();
    expect(q?.textContent).toMatch(/too few/);
    // nothing has changed while the question is up
    expect(state().grids!.custom).toBe(before);
    [...q!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!.click();
    await tick();
    expect(state().grids!.custom).toBe(before);
    size(3, 3);
    await tick();
    [...question()!.querySelectorAll('button')].find((b) => /Take/.test(b.textContent ?? ''))!.click();
    await tick();
    expect(gridItems(state().grids!.custom)).toHaveLength(9);
  });
});
