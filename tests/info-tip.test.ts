// @vitest-environment jsdom
// UI rule 2 (Nate, 2026-11-02): help text sits behind an "i" beside its header, never on a line
// of its own.
import { describe, expect, it, vi } from 'vitest';
import { addInfo, foldIntoInfo, infoFromAttrs, setInfo } from '../src/ui/info-tip';
import { ask } from '../src/ui/ask';

// jsdom has no showModal
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
HTMLDialogElement.prototype.show ??= function (this: HTMLDialogElement) { this.open = true; };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; };

describe('info tips', () => {
  it('puts an "i" with the text at the end of the header, before a close button', () => {
    const h = document.createElement('h2');
    h.append('Title', Object.assign(document.createElement('button'), { textContent: '×' }));
    const i = addInfo(h, 'How it works')!;
    expect(i.textContent).toBe('i');
    expect(i.dataset.tip).toBe('How it works');
    expect(i.nextElementSibling?.tagName).toBe('BUTTON');
    expect(addInfo(h, '')).toBeNull();
  });

  it('folds a help line into an "i" that follows the line as it changes', async () => {
    const h = document.createElement('h3');
    const p = document.createElement('p');
    p.textContent = 'First';
    const i = foldIntoInfo(p, h)!;
    expect(p.hidden).toBe(true);
    expect(i.dataset.tip).toBe('First');
    p.textContent = 'Second';
    await Promise.resolve();
    expect(i.dataset.tip).toBe('Second');
    setInfo(i, '');
    expect(i.hidden).toBe(true);
  });

  it('turns data-info attributes into "i" tips once', () => {
    const d = document.createElement('div');
    d.innerHTML = '<h2 data-info="Help here">Window</h2>';
    infoFromAttrs(d);
    infoFromAttrs(d);
    expect(d.querySelectorAll('.info-icon').length).toBe(1);
  });

  it('a click on the "i" inside a label does not tick the box', () => {
    const l = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    const name = document.createElement('span');
    name.textContent = 'Option';
    l.append(box, name);
    document.body.append(l);
    addInfo(name, 'What it does')!.click();
    expect(box.checked).toBe(false);
    expect(document.querySelector('.info-pop')?.textContent).toBe('What it does');
    l.remove();
  });

  it('resting the pointer on the "i" shows its tip, and leaving hides it unless it was clicked', () => {
    vi.useFakeTimers();
    try {
      document.body.click();
      document.dispatchEvent(new Event('pointerdown'));
      const h = document.createElement('h3');
      h.textContent = 'Section';
      document.body.append(h);
      const i = addInfo(h, 'Hover help')!;
      expect(i.hasAttribute('title')).toBe(false); // no second, native tooltip
      const pop = () => [...document.querySelectorAll('.info-pop')].find((p) => p.textContent === 'Hover help');
      i.dispatchEvent(new Event('pointerenter'));
      expect(pop()).toBeUndefined();
      vi.advanceTimersByTime(200);
      expect(pop()).toBeDefined();
      i.dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(200);
      expect(pop()).toBeUndefined();
      // hover, then click: the tip stays after the pointer leaves
      i.dispatchEvent(new Event('pointerenter'));
      vi.advanceTimersByTime(200);
      i.click();
      i.dispatchEvent(new Event('pointerleave'));
      vi.advanceTimersByTime(200);
      expect(pop()).toBeDefined();
      i.click(); // a second click closes it
      expect(pop()).toBeUndefined();
      h.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a window focusing its "i" on opening does not open the tip; Tab onto it does', () => {
    vi.useFakeTimers();
    try {
      document.dispatchEvent(new Event('pointerdown'));
      const h = document.createElement('h2');
      document.body.append(h);
      const i = addInfo(h, 'Focus help')!;
      const pop = () => [...document.querySelectorAll('.info-pop')].find((p) => p.textContent === 'Focus help');
      i.focus();
      vi.advanceTimersByTime(200);
      expect(pop()).toBeUndefined();
      i.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab' }));
      vi.advanceTimersByTime(10);
      expect(pop()).toBeDefined();
      i.blur();
      vi.advanceTimersByTime(200);
      expect(pop()).toBeUndefined();
      h.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('ask() puts its note beside the title and field help beside the field name', () => {
    void ask('Page Setup', [{ name: 'w', label: 'Width', value: '1', help: 'In inches' }], { note: 'About the page' });
    const d = document.querySelector('dialog.ask')!;
    expect(d.querySelector('h2 .info-icon')?.getAttribute('data-tip')).toBe('About the page');
    expect(d.querySelector('.ask-name .info-icon')?.getAttribute('data-tip')).toBe('In inches');
    expect(d.querySelector('p.muted, .ask-help')).toBeNull();
    d.querySelector<HTMLButtonElement>('.ask-buttons button')!.click();
  });

  it('ask() with nothing to fill in keeps its note as the message', () => {
    void ask('Saved', [], { note: 'The file was saved.', noCancel: true });
    const d = document.querySelector('dialog.ask')!;
    expect(d.querySelector('p.muted')?.textContent).toBe('The file was saved.');
    expect(d.querySelector('.info-icon')).toBeNull();
  });
});
