// @vitest-environment jsdom
// Start-up work left until it's wanted (review 2026-11-03, start-up speed).
import { describe, expect, it, vi } from 'vitest';
import { DesignLibrary } from '../src/ui/design-panel';
import { madeLater } from '../src/lazy';

describe('the shapes library draws its pictures only once it can be seen', () => {
  it('draws nothing while hidden, and every shape when shown', () => {
    const el = document.createElement('div');
    el.hidden = true;
    document.body.append(el);
    const lib = new DesignLibrary(el, () => {});
    expect(el.querySelectorAll('.dl-shape').length).toBe(0);
    el.hidden = false;
    lib.refresh();
    expect(el.querySelectorAll('.dl-shape').length).toBeGreaterThan(40);
  });

  it('draws at once when it is showing', () => {
    const el = document.createElement('div');
    document.body.append(el);
    new DesignLibrary(el, () => {});
    expect(el.querySelectorAll('.dl-shape').length).toBeGreaterThan(40);
  });

  it('inside a hidden drop-down, waits for the drop-down', () => {
    const pop = document.createElement('div');
    pop.hidden = true;
    const body = document.createElement('div');
    pop.append(body);
    document.body.append(pop);
    const lib = new DesignLibrary(body, () => {});
    expect(body.querySelectorAll('.dl-shape').length).toBe(0);
    pop.hidden = false;
    lib.showTab('shapes');
    expect(body.querySelectorAll('.dl-shape').length).toBeGreaterThan(40);
  });
});

describe('a window loaded on first use', () => {
  it('is made once, even when asked for twice while it loads', async () => {
    const make = vi.fn(async () => ({ id: Math.random() }));
    const w = madeLater(make);
    expect(w.now()).toBeNull();
    const [a, b] = await Promise.all([w.get(), w.get()]);
    expect(a).toBe(b);
    expect(w.now()).toBe(a);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('is tried again after a failed load', async () => {
    let n = 0;
    const w = madeLater(async () => { if (n++ === 0) throw new Error('offline'); return 'ok'; });
    await expect(w.get()).rejects.toThrow('offline');
    expect(w.now()).toBeNull();
    await expect(w.get()).resolves.toBe('ok');
  });
});
