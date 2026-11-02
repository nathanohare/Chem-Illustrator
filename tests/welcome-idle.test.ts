// The first-start welcome card goes away when drawing starts. That is looked for when the drawing
// changes, not on every screen frame (60 times a second, for as long as the card stays open).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('the welcome card', () => {
  it('runs no code on each frame while it shows', () => {
    // (Windows line endings, as git checks the file out on Windows, read as plain ones)
    const main = readFileSync('src/main.ts', 'utf8').replace(/\r\n/g, '\n');
    const at = main.indexOf('function showWelcome(');
    expect(at).toBeGreaterThan(0);
    const body = main.slice(at, main.indexOf('\n}\n', at));
    expect(body).not.toMatch(/requestAnimationFrame|setInterval/);
    // and is put away from the drawing's own change notice
    expect(main).toMatch(/editor\.onChange = \(\) => \{ welcomeWatch\?\.\(\);/);
  });
});
