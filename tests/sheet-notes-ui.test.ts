// @vitest-environment jsdom
//
// Sheet notes being typed: a new note on another cell keeps the one being typed and starts its
// own, and a note's card sits clear of the cells beside its cell.

import { describe, it, expect, beforeEach } from 'vitest';
import { Workbook } from '../src/sheet/workbook';
import { SheetNotes } from '../src/ui/sheet-notes-ui';
import { setReviewAuthor } from '../src/document/revisions';
import type { SheetView } from '../src/ui/sheet-view';

const W = 64, H = 20;

function setUp() {
  const wb = new Workbook(['Sheet1']);
  const sheet = wb.sheets[0];
  const view = {
    sheet,
    sel: { active: { r: 0, c: 0 } },
    commitEdit() {},
    reveal() {},
    focus() { (document.activeElement as HTMLElement | null)?.blur?.(); },
    refresh() {},
    screenRect: (r: number, c: number) => new DOMRect(44 + c * W, 22 + r * H, W, H),
  };
  const notes = new SheetNotes({ view: view as unknown as SheetView, edit: (_l, fn) => fn(sheet), flash() {}, askName: async () => true });
  return { sheet, view, notes };
}

const typeInto = (text: string) => {
  const ta = document.querySelector<HTMLTextAreaElement>('.sh-note-input')!;
  ta.value = text;
  return ta;
};

describe('sheet notes', () => {
  beforeEach(() => { document.body.replaceChildren(); setReviewAuthor('Nate'); });

  it('New Note on another cell keeps the note being typed and opens one on the new cell', async () => {
    const { sheet, view, notes } = setUp();
    await notes.newNote();
    await Promise.resolve();
    typeInto('Note on A1');
    view.sel.active = { r: 1, c: 1 };
    await notes.newNote();
    await Promise.resolve();
    expect(sheet.noteAt(0, 0)?.text).toBe('Note on A1');
    expect(document.querySelectorAll('.sh-note-input')).toHaveLength(1);
    typeInto('Note on B2').blur();
    expect(sheet.noteAt(1, 1)?.text).toBe('Note on B2');
    expect(sheet.noteAt(0, 0)?.text).toBe('Note on A1');
  });

  it("puts a note's card past the next column, so the cells beside it can be clicked", async () => {
    const { notes } = setUp();
    await notes.newNote();
    const card = document.querySelector<HTMLElement>('.sh-note-card')!;
    expect(parseFloat(card.style.left)).toBeGreaterThanOrEqual(44 + 2 * W);
  });
});
