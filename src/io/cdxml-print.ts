// ChemDraw keeps the paper size and orientation (File > Page Setup) only in the document's
// MacPrintInfo, a 120-byte Macintosh print record (TPrint, as the CDX documentation says), and
// takes no notice of the page's box. Written here from a record ChemDraw 25 saves for A4 landscape,
// with the paper's size, orientation and kind put in; checked against its A4 and Letter records.

/** ChemDraw 25's record for A4 landscape at 600 dpi. */
const TEMPLATE = '00030000025802580000000013611B680000000013611B680365057B03E000020000025802580000000013611B68000100000064000000010001010100020001270F000100010000000000000000000000000002001901900000000000600000000000000000000100000000000000000000000000000000';
const DPI = 600;

/** The sheets of PAPER (in model.ts), portrait, in points. */
export const SHEETS: Record<string, { w: number; h: number }> = {
  letter: { w: 612, h: 792 }, a4: { w: 595.28, h: 841.89 }, legal: { w: 612, h: 1008 }, a3: { w: 841.89, h: 1190.55 }, tabloid: { w: 792, h: 1224 },
};

const word = (n: number) => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
const put = (hex: string, byte: number, w: string) => hex.slice(0, byte * 2) + w + hex.slice(byte * 2 + w.length);
const at = (hex: string, byte: number) => { const v = parseInt(hex.slice(byte * 2, byte * 2 + 4), 16); return v >= 0x8000 ? v - 0x10000 : v; };

/** The print record for paper `w` × `h` points (landscape when wider than tall); `a4` marks A4 paper. */
export function macPrintInfo(w: number, h: number, a4: boolean): string {
  const land = w > h;
  const dots = (pt: number) => Math.round((pt / 72) * DPI);
  const rect = word(0) + word(0) + word(dots(h)) + word(dots(w));
  let hex = put(TEMPLATE, 8, rect);
  hex = put(hex, 16, rect);
  // the style: landscape or portrait, then the paper's long and short sides in 1/120 inch
  hex = put(hex, 24, land ? '0365' : '0367');
  hex = put(hex, 26, word(Math.round((Math.max(w, h) / 72) * 120)));
  hex = put(hex, 28, word(Math.round((Math.min(w, h) / 72) * 120)));
  hex = put(hex, 38, rect);
  hex = put(hex, 60, word(a4 ? 2 : 0));
  return hex;
}

/** The paper size, in points as it lies on the page, from a print record (null when it can't be read). */
export function paperOf(hex: string | null): { w: number; h: number } | null {
  if (!hex || !/^[0-9a-f]{240}$/i.test(hex)) return null;
  const vres = at(hex, 4), hres = at(hex, 6);
  if (vres <= 0 || hres <= 0) return null;
  const w = ((at(hex, 22) - at(hex, 18)) * 72) / hres, h = ((at(hex, 20) - at(hex, 16)) * 72) / vres;
  return w > 0 && h > 0 ? { w, h } : null;
}
