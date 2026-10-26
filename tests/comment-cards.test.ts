// @vitest-environment jsdom
//
// Comment cards: Escape keeps the text of a new comment (as Word does) and takes back an edit.

import { describe, it, expect, vi } from 'vitest';
import { threadCard, type ThreadActions } from '../src/ui/comment-cards';
import { freeSpot } from '../src/ui/slide-comments';

const actions = (): ThreadActions => ({ edit: vi.fn(), reply: vi.fn(), removeReply: vi.fn(), resolve: vi.fn(), remove: vi.fn(), focus: vi.fn(), cancelNew: vi.fn() });

function typeAndEscape(text: string, typed: string, a: ThreadActions): void {
  const card = threadCard({ id: 1, author: 'Nate', date: '', text }, { active: true, editing: true, actions: a });
  const ta = card.querySelector('textarea')!;
  ta.value = typed;
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('comment cards', () => {
  it('keeps what was typed into a new comment on Escape', () => {
    const a = actions();
    typeAndEscape('', 'Check the yield', a);
    expect(a.edit).toHaveBeenCalledWith('Check the yield');
    expect(a.cancelNew).not.toHaveBeenCalled();
  });

  it('takes away a new comment left empty on Escape', () => {
    const a = actions();
    typeAndEscape('', '  ', a);
    expect(a.cancelNew).toHaveBeenCalled();
  });

  it('takes back changes to an old comment on Escape', () => {
    const a = actions();
    typeAndEscape('Old text', 'New text', a);
    expect(a.edit).toHaveBeenCalledWith('Old text');
  });
});

describe('slide comment markers', () => {
  const size = { w: 960, h: 540 };
  it('puts a new marker where asked when the place is free', () => {
    expect(freeSpot({ x: 8, y: 8 }, [], size)).toEqual({ x: 8, y: 8 });
  });
  it('moves a new marker below the ones already there', () => {
    const a = freeSpot({ x: 8, y: 8 }, [{ x: 8, y: 8 }], size);
    expect(a.x).toBe(8);
    expect(a.y).toBeGreaterThanOrEqual(30);
    const b = freeSpot({ x: 8, y: 8 }, [{ x: 8, y: 8 }, a], size);
    expect(b.y).toBeGreaterThan(a.y);
  });
});
