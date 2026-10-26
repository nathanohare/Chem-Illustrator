// Ctrl+Z (or Ctrl+Y) pressed while a structure is being dragged on a slide: the drawing turns it
// down (a step is still being made), and the deck keeps the step on its list, so no Undo is lost.
import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';

describe('deck undo during a drag', () => {
  it('does not lose an undo step when Ctrl+Z is pressed mid-drag', () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    host.edit('Atom 1', () => host.addAtom(0, 0));
    host.edit('Atom 2', () => host.addAtom(50, 0));
    expect(host.atoms.size).toBe(2);
    // a drag starts (the editor opens a step), and Ctrl+Z is pressed before the mouse is let go
    host.begin('Move');
    expect(d.undo()).toBe(false);
    host.commit(); // nothing moved: the drag leaves no step
    // two Ctrl+Z take both atoms away
    expect(d.undo()).toBe(true);
    expect(d.undo()).toBe(true);
    expect(host.atoms.size).toBe(0);
  });

  it('does not lose a redo step when Ctrl+Y is pressed mid-drag', () => {
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    host.edit('Atom 1', () => host.addAtom(0, 0));
    host.edit('Atom 2', () => host.addAtom(50, 0));
    d.undo();
    d.undo();
    expect(host.atoms.size).toBe(0);
    host.begin('Move');
    expect(d.redo()).toBe(false);
    host.commit();
    expect(d.redo()).toBe(true);
    expect(d.redo()).toBe(true);
    expect(host.atoms.size).toBe(2);
  });
});
