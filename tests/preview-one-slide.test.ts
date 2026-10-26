// @vitest-environment jsdom
// Transitions / Animations > Preview of a slide set to advance after a time: the preview stays on
// that slide (its "After" time doesn't take it on to the next slides).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/deck/slide-view', () => ({ paintSlide: () => ({ x: 0, y: 0, k: 1 }), drawDrawing: () => undefined }));

import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { Player } from '../src/deck/playback';
import { AnimationUI } from '../src/ui/animation-ui';

const noop = () => undefined;
const ctx = new Proxy({}, { get: () => noop, set: () => true });
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;
(HTMLDialogElement.prototype as unknown as { showModal: () => void }).showModal ??= noop;

describe('Preview of one slide', () => {
  it('stays on the slide being previewed when it has an After time', () => {
    vi.useFakeTimers();
    (globalThis as any).requestAnimationFrame = (cb: () => void) => setTimeout(cb, 16) as unknown as number;
    (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
    const host = new Doc();
    const d = Deck.blank(host);
    d.attach();
    d.addSlide(); d.addSlide();
    d.go(1);
    // slide 2 moves on by itself after 2 seconds in the show
    d.setTransition({ kind: 'fade', dur: 0.5, advanceAfter: 2 } as never);
    let player: Player | null = null;
    const show = Player.prototype.show;
    vi.spyOn(Player.prototype, 'show').mockImplementation(function (this: Player, ...a) { player = this; return show.apply(this, a); });
    // the preview needs only the deck from its hooks
    AnimationUI.prototype.preview.call({ hooks: { deck: () => d, finishTyping: noop } } as never, true);
    expect(player!.i).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(player!.i).toBe(1);
    document.querySelector('dialog')?.dispatchEvent(new Event('close'));
    vi.useRealTimers();
  });
});
