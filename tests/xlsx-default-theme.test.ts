// @vitest-environment jsdom
//
// A workbook whose theme part is Office's own default theme reads as the default (no theme of its
// own), however the theme objects were put together.

import { describe, it, expect } from 'vitest';
import { readWorkbookTheme, themeXml } from '../src/io/xlsx-view';
import { DEFAULT_THEME, WORKBOOK_THEMES, sameTheme } from '../src/sheet/themes';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('Office\'s default theme in a file', () => {
  it('reads as the default theme', () => {
    expect(readWorkbookTheme(parse(themeXml(DEFAULT_THEME)))).toBeNull();
  });

  it('still reads another theme as itself', () => {
    const other = WORKBOOK_THEMES[1];
    const t = readWorkbookTheme(parse(themeXml(other)));
    expect(t && sameTheme(t, other)).toBe(true);
  });

  it('compares themes by their fonts and colors, whatever order their parts were set in', () => {
    const { name, major, minor, colors } = DEFAULT_THEME;
    expect(sameTheme({ colors: colors.slice(), minor, major, name }, DEFAULT_THEME)).toBe(true);
    expect(sameTheme({ name, major, minor: 'Arial', colors }, DEFAULT_THEME)).toBe(false);
  });
});
