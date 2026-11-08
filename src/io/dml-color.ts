// DrawingML colour changes (ECMA-376 Part 1 §20.1.2.3): the lighter, darker, more or less
// saturated versions of a colour that themes, chart styles and Office's colour picker write as
// the colour element's children, as in <a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr>.
// They are applied in the order written, each in the colour space the standard's examples use:
//  - tint and shade mix with white or black in linear RGB (a 50% tint of 00FF00 is BCFFBC, as
//    scrgbClr's 50% is BCBCBC: linear 0.5 in sRGB), as LibreOffice does to match Office;
//  - hue, saturation and luminance changes work on HSL of the sRGB colour (a 20% satMod of
//    00FF00 is 669966, a -20% lumOff 009900);
//  - red, green and blue changes, inverse and gray work on the sRGB components (a 50% blueMod of
//    0000FF is 000080).
// Alpha changes are not colours and are read where see-through amounts are.

/**
 * A DrawingML percentage as a fraction (1 is 100%): thousandths of a percent as Office writes
 * them ("50000"), or with a percent sign as Strict files and the standard's examples write them
 * ("50%"), which Office also reads ([MS-OI29500] 2.1.1239 and others).
 */
export function dmlFraction(v: string | null | undefined, dflt = 0): number {
  if (v === null || v === undefined || v.trim() === '') return dflt;
  const t = v.trim();
  const n = t.endsWith('%') ? parseFloat(t) / 100 : Number(t) / 100000;
  return Number.isFinite(n) ? n : dflt;
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
/** sRGB's transfer curve (IEC 61966-2-1), each way. */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

type Rgb = [number, number, number];

function hsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number): Rgb {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

const hexOf = (c: Rgb): string => c.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

/** A colour given as linear RGB fractions (scrgbClr's r, g and b) as "RRGGBB". */
export function linearHex(r: number, g: number, b: number): string {
  return hexOf([r, g, b].map((v) => toSrgb(clamp(v))) as Rgb);
}

/** An HSL colour (hslClr: hue in 60,000ths of a degree, saturation and luminance as fractions) as "RRGGBB". */
export function hslHex(hue: number, sat: number, lum: number): string {
  return hexOf(fromHsl(clamp(hue / 21600000), clamp(sat), clamp(lum)));
}

/** A colour ("RRGGBB") with the changes in `mods` (the colour element's children) applied, as "#rrggbb". */
export function applyColorMods(hex: string, mods: Iterable<Pick<Element, 'localName' | 'getAttribute'>>): string {
  const n = parseInt(hex.padStart(6, '0').slice(-6), 16);
  let c: Rgb = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const inHsl = (fn: (h: number, s: number, l: number) => Rgb) => { const [h, s, l] = hsl(c); c = fn(h, s, l); };
  const RGB = ['red', 'green', 'blue'];
  for (const m of mods) {
    const name = m.localName;
    const raw = m.getAttribute('val');
    const f = dmlFraction(raw, 1);
    const k = RGB.findIndex((x) => name.startsWith(x));
    if (k >= 0) {
      // red, green, blue (set), redMod... (scaled), redOff... (moved)
      const op = name.slice(RGB[k].length);
      c[k] = clamp(op === 'Mod' ? c[k] * f : op === 'Off' ? c[k] + dmlFraction(raw) : f);
      continue;
    }
    switch (name) {
      case 'tint': c = c.map((v) => toSrgb(1 - (1 - toLinear(v)) * clamp(f))) as Rgb; break;
      case 'shade': c = c.map((v) => toSrgb(toLinear(v) * clamp(f))) as Rgb; break;
      case 'lumMod': inHsl((h, s, l) => fromHsl(h, s, clamp(l * f))); break;
      case 'lumOff': inHsl((h, s, l) => fromHsl(h, s, clamp(l + dmlFraction(raw)))); break;
      case 'lum': inHsl((h, s) => fromHsl(h, s, clamp(f))); break;
      case 'satMod': inHsl((h, s, l) => fromHsl(h, clamp(s * f), l)); break;
      case 'satOff': inHsl((h, s, l) => fromHsl(h, clamp(s + dmlFraction(raw)), l)); break;
      case 'sat': inHsl((h, _s, l) => fromHsl(h, clamp(f), l)); break;
      // hue: 60,000ths of a degree; an offset stops at 0 and 360 degrees
      case 'hueMod': inHsl((h, s, l) => fromHsl(clamp(h * f), s, l)); break;
      case 'hueOff': inHsl((h, s, l) => fromHsl(clamp(h + Number(raw ?? 0) / 21600000), s, l)); break;
      case 'hue': inHsl((_h, s, l) => fromHsl(clamp(Number(raw ?? 0) / 21600000), s, l)); break;
      case 'comp': inHsl((h, s, l) => fromHsl(h + 0.5, s, l)); break;
      case 'inv': c = c.map((v) => 1 - v) as Rgb; break;
      // gray: weighted as LibreOffice weighs it for Office's files
      case 'gray': { const y = c[0] * 0.22 + c[1] * 0.72 + c[2] * 0.06; c = [y, y, y]; break; }
      case 'gamma': c = c.map(toSrgb) as Rgb; break;
      case 'invGamma': c = c.map(toLinear) as Rgb; break;
    }
  }
  return '#' + hexOf(c).toLowerCase();
}
