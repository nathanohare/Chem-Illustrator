// A cell's structure drawn in its box (Spreadsheet, and the same box in Document, Canvas,
// Presentation and Design): white right to the box's edge, with no Document Map in its corner.
// And the Insert Structure button on the dark dock of the Dark Gray look reads light on dark.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

describe("a structure's box", () => {
  it('leaves off the tint and page shading round the drawing', () => {
    const at = main.indexOf('editor.underlay = (ctx) => {');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(main.slice(at, main.indexOf('};', at))).toMatch(/if \(!drawingShown\(\) \|\| cellEdit\) return;/);
  });

  it('shows no Document Map', () => {
    const at = main.indexOf('function updateOrientation(): void {');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(main.slice(at, main.indexOf('\n}', at))).toMatch(/navMap\.update\(on && !cellEdit\)/);
  });
});

describe('the Insert Structure button in Dark Gray', () => {
  it('takes light text on the dark dock', () => {
    const sel = ":root[data-gray]:not([data-shadows='off']) #dock-left > #structure-start {";
    const at = css.indexOf(sel);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(css.slice(at, css.indexOf('}', at))).toMatch(/--text:\s*#eceef2/);
  });
});
