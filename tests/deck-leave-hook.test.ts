// Drawing fix from the 26 October code review: a pen letter still waiting to be read when the
// slide changes is read into its own slide. The deck tells the editor before it puts the slide away.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';

describe('Deck.onLeave', () => {
  it('runs before the slide being edited is put away, while its drawing is still in the host', () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.addSlide();
    d.go(0);
    const first = d.slides[0];
    let seen: unknown = null;
    d.onLeave = () => { seen = d.current; };
    d.go(1);
    expect(seen).toBe(first);
  });
});
