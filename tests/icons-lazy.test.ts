// @vitest-environment jsdom
//
// The icon library (2.7 MB) is loaded the first time something needs an icon, not at every start:
// an icon drawn (a file with icons in it), Design > Icons, or a diagram.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const fetched = vi.fn();
vi.mock('../src/design/icons/mdi.json', () => {
  fetched();
  return { default: { set: 'mdi', version: '7', groups: ['Lab and science'], icons: [['flask', [0], '', 'M0 0L24 24']] } };
});

describe('the icon library', () => {
  it('is not loaded at start-up', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).not.toMatch(/\bloadIcons\s*\(/);
  });

  it('is loaded when an icon is first drawn', async () => {
    const { geoDef } = await import('../src/design/geo');
    const { iconsLoaded, whenIconsLoaded } = await import('../src/design/icons');
    expect(fetched).not.toHaveBeenCalled();
    expect(iconsLoaded()).toBe(false);
    geoDef('icon:flask').draw(72, 72);
    await new Promise<void>((ok) => whenIconsLoaded(ok));
    expect(fetched).toHaveBeenCalledOnce();
    expect(geoDef('icon:flask').draw(72, 72).body.length).toBeGreaterThan(0);
  });
});
