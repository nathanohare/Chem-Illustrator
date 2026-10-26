// @vitest-environment jsdom
// Undo after typing into a table cell, text box or footnote of a document: when the typing was
// all undone there, the box's own step of the document's Undo is gone too, so every Ctrl+Z
// changes something, and Redo still brings the typing back.
import { describe, it, expect } from 'vitest';
import { docMode, type } from './doc-mode-harness';
import { objectRun, type DocText } from '../src/document/document';
import * as rt from '../src/richtext';

type Private = { startCell(id: number, r: number, c: number): boolean; startBox(id: number): boolean; stopBox(): void };
/** Whether the object is in the text (Undo of its insertion takes its place in the text away). */
const placed = (t: DocText) => rt.plainText(t.runs).includes(String.fromCharCode(0xfffc));

describe('Undo after typing into a box', () => {
  it('in a table cell: every Ctrl+Z changes something, and Ctrl+Y brings the typing back', async () => {
    const { dm, f, ta } = await docMode({ runs: [{ text: 'Table 1. ' }], paras: [{}], objects: { 2: { kind: 'table', table: { cols: [100, 100], rows: [[{ runs: [{ text: 'Entry' }] }, { runs: [{ text: 'Yield' }] }]], head: 1 } } } as never });
    f.ed.update({ ...f.t, runs: [...f.t.runs, objectRun(2, {})] }, 'Insert table');
    // the cell's text, null when the table isn't in the text
    const cellText = () => (placed(f.t) ? rt.plainText((f.t.objects[2] as { table: { rows: { runs: never }[][] } }).table.rows[0][1].runs) : null);
    (dm as never as Private).startCell(2, 0, 1);
    type(ta, ' (%)');
    expect(cellText()).toBe('Yield (%)');
    dm.run('undo');
    expect(cellText()).toBe('Yield');
    // the step before: the table goes
    dm.run('undo');
    expect(cellText()).toBe(null);
    dm.run('redo');
    expect(cellText()).toBe('Yield');
    dm.run('redo');
    expect(cellText()).toBe('Yield (%)');
  }, 60000);

  for (const [what, o] of [
    ['a text box', { kind: 'textbox', runs: [{ text: 'Box' }], w: 100 }],
    ['a footnote', { kind: 'note', runs: [{ text: 'Note' }] }],
  ] as const) {
    it(`in ${what}: the first Ctrl+Z after leaving it takes back the step before`, async () => {
      const { dm, f, ta } = await docMode({ runs: [{ text: 'See this. ' }], paras: [{}], objects: { 1: o } as never });
      f.ed.update({ ...f.t, runs: [...f.t.runs, objectRun(1, {})] }, 'Insert');
      const text = () => rt.plainText((f.t.objects[1] as { runs: never }).runs);
      const p = dm as never as Private;
      p.startBox(1);
      const was = text();
      type(ta, ' more');
      expect(text()).toBe(`${was} more`);
      dm.run('undo');
      expect(text()).toBe(was);
      // click out, then Ctrl+Z: the object's insertion is taken back
      p.stopBox();
      dm.run('undo');
      expect(placed(f.t)).toBe(false);
      // and Redo brings it back, then the typing
      dm.run('redo');
      expect(placed(f.t)).toBe(true);
      dm.run('redo');
      expect(text()).toBe(`${was} more`);
    }, 60000);
  }
});
