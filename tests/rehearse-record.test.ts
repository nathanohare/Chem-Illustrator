// @vitest-environment jsdom
//
// Rehearse Timings and Record, finished to PowerPoint's level: rehearsing again from one slide
// keeps the other slides' times, Clear takes times or narration off one slide or all of them
// (one undo each), and the window that asks to keep a rehearsal lists each slide's time.

import { describe, it, expect } from 'vitest';
import { Doc } from '../src/model';
import { Deck } from '../src/deck/deck';
import { rehearsalLines } from '../src/ui/present';

function deck3(): Deck {
  const d = Deck.blank(new Doc());
  d.attach();
  d.addSlide('blank');
  d.addSlide('blank');
  return d;
}

const times = (d: Deck) => d.slides.map((s) => s.transition?.advanceAfter);

describe('rehearsed timings', () => {
  it('a rehearsal from one slide changes only the slides it played', () => {
    const d = deck3();
    d.setTimings(new Map([[0, 10], [1, 20], [2, 30]]));
    d.setTimings(new Map([[1, 25.04], [2, 31]]));
    expect(times(d)).toEqual([10, 25, 31]);
  });

  it('Clear takes the time off one slide or all, keeping the transition, and undoes in one step', () => {
    const d = deck3();
    d.slides[1].transition = { kind: 'fade', dur: 0.5 };
    d.setTimings(new Map([[0, 10], [1, 20], [2, 30]]));
    expect(d.clearTimings([1])).toBe(true);
    expect(times(d)).toEqual([10, undefined, 30]);
    expect(d.slides[1].transition).toEqual({ kind: 'fade', dur: 0.5 });
    expect(d.clearTimings([0, 1, 2])).toBe(true);
    expect(times(d)).toEqual([undefined, undefined, undefined]);
    // a slide given a time with no transition of its own goes back to none
    expect(d.slides[0].transition).toBeUndefined();
    d.undo();
    expect(times(d)).toEqual([10, undefined, 30]);
    d.undo();
    expect(times(d)).toEqual([10, 20, 30]);
    // nothing to clear
    expect(d.clearTimings([])).toBe(false);
  });

  it('knows which slides have narration on them', () => {
    const d = deck3();
    expect(d.narrated(0)).toBe(false);
    d.editSlides('Record narration', [2], (sd) => {
      sd.addShape({ kind: 'picture', x1: 0, y1: 0, x2: 10, y2: 10, src: 'data:,', name: 'Narration', video: { src: 'data:audio/wav;base64,', audio: true, narration: true } });
    });
    expect(d.narrated(2)).toBe(true);
    expect(d.narrated(1)).toBe(false);
    d.editSlides('Clear narration', [2], (sd) => { for (const sh of [...sd.shapes.values()]) if (sh.video?.narration) sd.removeShape(sh.id); });
    expect(d.narrated(2)).toBe(false);
  });

  it('lists each slide\'s time, in order, marking the recorded ones', () => {
    const lines = rehearsalLines(new Map([[2, 75], [0, 9.6]]), new Map([[2, 'blob']]), 3);
    expect(lines).toEqual([['Slide 1', '0:09'], ['Slide 3', '1:15  🎙']]);
  });
});
