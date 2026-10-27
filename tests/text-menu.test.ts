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
});
