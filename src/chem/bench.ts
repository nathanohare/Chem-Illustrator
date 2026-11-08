// Numbers for the bench: a compound's density, boiling and melting points, vapor pressure, flash
// point and refractive index, read from the values PubChem's sources write out ("115.2 °C",
// "0.9819 g/cu cm at 20 °C", "20.8 mm Hg at 25 °C"), and the lab calculations the Analysis panel
// shows (the mass and volume of 0.5 mmol, say).

const NUM = String.raw`([−-]?\d+(?:\.\d+)?)`;
const toNum = (s: string) => Number(s.replace('−', '-'));

/** A temperature in °C from text such as "115.2 °C", "239 °F (NTP, 1992)" or "388 K"; null if none is written. */
export function readTemperature(texts: string[]): number | null {
  for (const t of texts) {
    // (a range "-42 to -41 °C" or "40-42 °C": the first number)
    const m = new RegExp(`${NUM}(?:\\s*(?:to|–|-)\\s*[−-]?\\d+(?:\\.\\d+)?)?\\s*(?:°|deg(?:rees?)?\\s*)?\\s*([CFK])\\b`, 'i').exec(t);
    if (!m) continue;
    const v = toNum(m[1]);
    const u = m[2].toUpperCase();
    return u === 'C' ? v : u === 'F' ? ((v - 32) * 5) / 9 : v - 273.15;
  }
  return null;
}

/** A density in g/mL from text such as "0.9819 g/cu cm at 20 °C", "1.05 g/mL", "Relative density (water = 1): 0.98" or "0.98". */
export function readDensity(texts: string[]): number | null {
  for (const t of texts) {
    const unit = new RegExp(`${NUM}\\s*(g\\s*\\/\\s*(?:cu\\s*cm|cm3|cm³|ml|mL)|kg\\s*\\/\\s*(?:m3|m³|cu\\s*m))`, 'i').exec(t);
    if (unit) { const v = toNum(unit[1]); return /^kg/i.test(unit[2]) ? v / 1000 : v; }
    const rel = new RegExp(`(?:relative density|specific gravity)(?:\\s*\\([^)]*\\))?[^:\\d]*:?\\s*${NUM}`, 'i').exec(t);
    if (rel) return toNum(rel[1]);
    // a bare number that can only be a density
    const bare = /^\s*(\d+(?:\.\d+)?)\b/.exec(t);
    if (bare && !/[°]|mm|Pa|atm|bar/i.test(t)) { const v = Number(bare[1]); if (v > 0.3 && v < 25) return v; }
  }
  return null;
}

/** A vapor pressure in kPa from text such as "20.8 mm Hg at 25 °C", "2.8 kPa" or "0.03 atm". */
export function readPressure(texts: string[]): number | null {
  for (const t of texts) {
    const text = t.replace(/(\d)\s*[xX×]\s*10\^?([−-]?\d+)/, (_, a, e) => `${a}e${e.replace('−', '-')}`);
    // scientific notation first ("1.2e-3 mm Hg"), so its exponent isn't read as the number
    const e = /(\d+(?:\.\d+)?e[−-]?\d+)\s*(mm\s*Hg|mmHg|torr|kPa|hPa|MPa|Pa|atm|bar|mbar)\b/i.exec(text);
    if (e) return toKpa(Number(e[1].replace('−', '-')), e[2]);
    const m = new RegExp(`${NUM}\\s*(mm\\s*Hg|mmHg|torr|kPa|hPa|MPa|Pa|atm|bar|mbar)\\b`, 'i').exec(text);
    if (m) return toKpa(toNum(m[1]), m[2]);
  }
  return null;
}

function toKpa(v: number, unit: string): number {
  const u = unit.toLowerCase().replace(/\s/g, '');
  if (u === 'mmhg' || u === 'torr') return v * 0.133322;
  if (u === 'kpa') return v;
  if (u === 'hpa' || u === 'mbar') return v / 10;
  if (u === 'mpa') return v * 1000;
  if (u === 'pa') return v / 1000;
  if (u === 'atm') return v * 101.325;
  return v * 100; // bar
}

/** A refractive index (n, about 1.3–1.8) from text such as "1.5095 at 20 °C/D". */
export function readRefractiveIndex(texts: string[]): number | null {
  for (const t of texts) {
    const m = /(?:^|[^\d.])(1\.\d{2,5})\b/.exec(t);
    if (m) return Number(m[1]);
  }
  return null;
}

// ---------------------------------------------------------------- lab calculations

export type CalcUnit = 'mmol' | 'mol' | 'equiv' | 'mg' | 'g' | 'uL' | 'mL';
export const CALC_UNITS: { value: CalcUnit; label: string }[] = [
  { value: 'mmol', label: 'mmol' }, { value: 'mol', label: 'mol' }, { value: 'equiv', label: 'equiv' },
  { value: 'mg', label: 'mg' }, { value: 'g', label: 'g' }, { value: 'uL', label: 'µL' }, { value: 'mL', label: 'mL' },
];

/** A row the Analysis panel works out for what is selected: an amount, and what to show for it. */
export interface LabCalc {
  id: string;
  /** Its name in the panel ("0.5 mmol"); blank: made from the amount. */
  name: string;
  amount: number;
  unit: CalcUnit;
  /** For equiv: the reaction's scale, mmol. */
  scale: number;
  mass: boolean;
  /** The neat volume (liquids, from the density). */
  volume: boolean;
  /** The volume of a solution of this molarity (M); null: not shown. */
  solution: number | null;
  /** The amount in mmol (when given as a mass or volume). */
  mmol: boolean;
  /** Significant figures. */
  sig: number;
}

export const unitLabel = (u: CalcUnit) => CALC_UNITS.find((x) => x.value === u)?.label ?? u;

/** The calculation's name: its own, or the amount ("0.5 mmol", "1.2 equiv"). */
export function calcName(c: LabCalc): string {
  return c.name.trim() || `${c.amount} ${unitLabel(c.unit)}`;
}

/** A number to `sig` significant figures, without a trailing ".0" a chemist wouldn't write. */
export function sigFig(x: number, sig: number): string {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const digits = Math.min(8, Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(x)))));
  // halves round up (39.55 → 39.6), as on paper, not down as the float 39.549999… would
  const f = 10 ** digits;
  return (Math.round(x * f * (1 + 1e-12)) / f).toFixed(digits);
}

/** A mass in mg, written in mg, g or µg as suits its size. */
function massText(mg: number, sig: number): string {
  if (mg >= 1000) return `${sigFig(mg / 1000, sig)} g`;
  if (mg < 1) return `${sigFig(mg * 1000, sig)} µg`;
  return `${sigFig(mg, sig)} mg`;
}

/** A volume in µL, written in µL or mL. */
function volumeText(uL: number, sig: number): string {
  return uL >= 1000 ? `${sigFig(uL / 1000, sig)} mL` : `${sigFig(uL, sig)} µL`;
}

export interface CalcInput {
  /** Molecular weight, g/mol. */
  mw: number;
  /** Density, g/mL, if known. */
  density: number | null;
  /** False for a solid at room temperature (no neat volume), true or null otherwise. */
  liquid: boolean | null;
}

/**
 * The parts a calculation shows for a compound ("39.6 mg", "40.3 µL"), in order; empty when it
 * can't be worked out (an amount by volume with no density, say).
 */
export function labCalc(c: LabCalc, x: CalcInput): string[] {
  if (!(x.mw > 0) || !(c.amount > 0)) return [];
  const d = x.density && x.density > 0 ? x.density : null;
  let mmol: number;
  switch (c.unit) {
    case 'mmol': mmol = c.amount; break;
    case 'mol': mmol = c.amount * 1000; break;
    case 'equiv': mmol = c.amount * (c.scale > 0 ? c.scale : 1); break;
    case 'mg': mmol = c.amount / x.mw; break;
    case 'g': mmol = (c.amount * 1000) / x.mw; break;
    case 'uL': if (!d) return []; mmol = (c.amount * d) / x.mw; break;
    case 'mL': if (!d) return []; mmol = (c.amount * 1000 * d) / x.mw; break;
  }
  const mg = mmol * x.mw;
  const out: string[] = [];
  const given = c.unit;
  if (c.mmol && given !== 'mmol' && given !== 'mol') out.push(`${sigFig(mmol, c.sig)} mmol`);
  if (c.mass && given !== 'mg' && given !== 'g') out.push(massText(mg, c.sig));
  if (c.volume && d && x.liquid !== false && given !== 'uL' && given !== 'mL') out.push(volumeText(mg / d, c.sig));
  if (c.solution && c.solution > 0) out.push(`${volumeText((mmol / c.solution) * 1000, c.sig)} of ${c.solution} M`);
  return out;
}

/** A new calculation: 0.5 mmol, its mass and neat volume. */
export function newCalc(id: string): LabCalc {
  return { id, name: '', amount: 0.5, unit: 'mmol', scale: 1, mass: true, volume: true, solution: null, mmol: true, sig: 3 };
}
