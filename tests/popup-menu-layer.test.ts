// Laptop bench (v0.1.139): right-clicking a field in the PivotTable Fields window showed no
// menu, and a field chip's menu showed only "Remove Field": the menus were drawn under the
// window. And a drag from the menu bar selected the ribbon's text.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const z = (selector: string) => {
  const m = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css);
  return m ? Number(m[2]) : NaN;
};

describe('menus at a point', () => {
  it('sit over the tool windows, floating boxes and right-click menus', () => {
    const menu = z('.menu.popup-menu');
    expect(menu).toBeGreaterThan(z('dialog.tool-window'));
    expect(menu).toBeGreaterThan(z('.context-menu'));
    expect(menu).toBeGreaterThan(z('.toolbox.floating'));
    expect(/\.menu\.popup-menu\s*\{[^}]*position:\s*fixed[^}]*max-height:\s*calc\(100vh/.test(css)).toBe(true);
  });

  it('the menu bar, ribbons and tabs select no text when dragged across', () => {
    expect(/(^|\n)header, \.ribbon, [^{]*#tabs[^{]*\{[^}]*user-select:\s*none/.test(css)).toBe(true);
  });
});
