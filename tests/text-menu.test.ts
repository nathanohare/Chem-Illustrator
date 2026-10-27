// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { placeTextMenu } from '../src/ui/text-menu';

describe('placeTextMenu', () => {
  it('puts the menu on the page, kept inside the window, and arrow keys step through its buttons', () => {
    const menu = document.createElement('div');
    for (const t of ['Cut', 'Copy', 'Paste']) { const b = document.createElement('button'); b.textContent = t; menu.append(b); }
    (menu.children[1] as HTMLButtonElement).disabled = true;
    Object.defineProperty(menu, 'offsetWidth', { value: 200 });
    Object.defineProperty(menu, 'offsetHeight', { value: 300 });
    const done = placeTextMenu(menu, innerWidth - 10, innerHeight - 10);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.classList.contains('at-point')).toBe(true);
    expect(parseFloat(menu.style.left)).toBe(innerWidth - 204);
    expect(parseFloat(menu.style.top)).toBe(innerHeight - 304);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('Cut');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('Paste');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('Cut');
    done();
    (menu.children[2] as HTMLElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('Paste');
  });

  it('closes on Escape, and moves back inside the window when the window gets smaller (Interface Size)', () => {
    const menu = document.createElement('div');
    menu.append(document.createElement('button'));
    Object.defineProperty(menu, 'offsetWidth', { value: 200 });
    Object.defineProperty(menu, 'offsetHeight', { value: 300 });
    let closed = 0;
    const done = placeTextMenu(menu, 600, 400, document, () => { closed++; });
    const was = { w: innerWidth, h: innerHeight };
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect([menu.style.left, menu.style.top]).toEqual(['296px', '196px']);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(esc);
    expect(closed).toBe(1);
    expect(esc.defaultPrevented).toBe(true);
    done();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(1);
    Object.defineProperty(window, 'innerWidth', { value: was.w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: was.h, configurable: true });
  });
});
