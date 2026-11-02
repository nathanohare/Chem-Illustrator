// @vitest-environment jsdom
//
// Review item 17: a long hover on a tool such as the curved arrow plays a short scripted demo,
// drawn by the app's own engine. Every demo's frames build, its picture holds still while it plays,
// and the card shows after a second's rest, takes the place of the button's own tip, and goes away.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEMO_TOOLS, demoFor, demoView, watchToolHover } from '../src/ui/tool-demos';
import { DEMO_LOOKS, parseDemoLook, type DemoLook } from '../src/settings';

// jsdom has no canvas: a context that takes every call and draws nothing
const noop = () => {};
const ctx = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? undefined : noop), set: () => true });
(HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext = () => ctx;
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { constructor() { return new Proxy({}, { get: () => noop }); } };

describe('the demos', () => {
  it('cover the tools that take more than a click', () => {
    for (const tool of ['arrow-curved', 'arrow-fishhook', 'bond-hapto', 'chain', 'ring-6', 'sym-lonepair', 'fragment']) expect(DEMO_TOOLS).toContain(tool);
    expect(demoFor('select')).toBeNull();
  });
  for (const tool of DEMO_TOOLS) {
    it(`${tool}: every step draws, from start to finish, inside one view`, () => {
      const demo = demoFor(tool)!;
      expect(demo.steps.length).toBeGreaterThan(1);
      for (const s of demo.steps) expect(s.say.length).toBeGreaterThan(10);
      const view = demoView(demo);
      for (const v of [view.x1, view.y1, view.x2, view.y2]) expect(Number.isFinite(v)).toBe(true);
      demo.steps.forEach((_, i) => {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const f = demo.frame(i, t);
          // the pointer stays in sight
          if (f.pointer) {
            expect(f.pointer.x).toBeGreaterThan(view.x1 - 40);
            expect(f.pointer.x).toBeLessThan(view.x2 + 40);
          }
        }
      });
      // each step ends with something drawn
      expect(demo.frame(demo.steps.length - 1, 1).doc.atoms.size).toBeGreaterThan(0);
    });
  }
  it('the ring demo ends each Tab on a new shape of the same molecule', () => {
    const demo = demoFor('ring-6')!;
    const xs = (i: number, t: number) => [...demo.frame(i, t).doc.atoms.values()].map((a) => Math.round(a.x)).join(',');
    // flat, then chair, then the shapes after it all differ
    expect(xs(1, 1)).not.toBe(xs(2, 1));
    expect(xs(3, 0.4)).not.toBe(xs(3, 0.7));
    expect(demo.frame(2, 1).doc.atoms.size).toBe(demo.frame(1, 1).doc.atoms.size);
  });
});

describe('the setting', () => {
  it('defaults to the card, and reads back each choice', () => {
    expect(parseDemoLook(undefined)).toBe('card');
    expect(parseDemoLook('nonsense')).toBe('card');
    for (const l of DEMO_LOOKS) expect(parseDemoLook(l.value)).toBe(l.value);
  });
});

describe('a long hover', () => {
  let look: DemoLook = 'card';
  let stop: () => void = () => {};
  let button: HTMLButtonElement;
  const over = (el: Element, type: string, related: Element | null = null) => {
    const e = new Event(type, { bubbles: true }) as Event & { pointerType: string; relatedTarget: Element | null };
    Object.assign(e, { pointerType: 'mouse' });
    Object.defineProperty(e, 'relatedTarget', { value: related });
    el.dispatchEvent(e);
  };
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    button = document.createElement('button');
    button.dataset.tool = 'chain';
    button.title = 'Chain: drag to draw a zig-zag chain';
    document.body.append(button);
    look = 'card';
    stop = watchToolHover(document, () => look);
  });
  afterEach(() => { stop(); vi.useRealTimers(); });

  it('shows the card after a second, in place of the tip, and puts it away on leaving', () => {
    over(button, 'pointerover');
    vi.advanceTimersByTime(600);
    expect(document.querySelector('.tool-demo')).toBeNull();
    vi.advanceTimersByTime(500);
    const card = document.querySelector('.tool-demo')!;
    expect(card.classList.contains('tool-demo-card')).toBe(true);
    expect(card.querySelectorAll('.td-steps li').length).toBe(3);
    expect(button.hasAttribute('title')).toBe(false);
    over(button, 'pointerout', document.body);
    vi.advanceTimersByTime(300);
    expect(document.querySelector('.tool-demo')).toBeNull();
    expect(button.title).toContain('Chain');
  });
  it('goes away when the tool is picked or Escape is pressed', () => {
    over(button, 'pointerover');
    vi.advanceTimersByTime(1100);
    button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(document.querySelector('.tool-demo')).toBeNull();
    over(button, 'pointerout', document.body);
    over(button, 'pointerover');
    vi.advanceTimersByTime(1100);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.tool-demo')).toBeNull();
  });
  it('shows still pictures of each step, or nothing, as chosen', () => {
    look = 'frames';
    over(button, 'pointerover');
    vi.advanceTimersByTime(1100);
    expect(document.querySelectorAll('.tool-demo .td-strip figure').length).toBe(3);
    over(button, 'pointerout', document.body);
    vi.advanceTimersByTime(300);
    look = 'off';
    over(button, 'pointerover');
    vi.advanceTimersByTime(2000);
    expect(document.querySelector('.tool-demo')).toBeNull();
  });
  it('a tool without a demo keeps its usual tip', () => {
    button.dataset.tool = 'eraser';
    over(button, 'pointerover');
    vi.advanceTimersByTime(2000);
    expect(document.querySelector('.tool-demo')).toBeNull();
  });
});
