// Settings ▸ Newman Projections: how projections look (the circle, the bonds, and how the largest,
// middle and smallest group on each atom are written) and the defaults for torsion energy charts.
// Kept apart from the drawing code so the settings file can read them.

/** How one rank of group (largest, middle, smallest on its atom) is written. */
export interface RankLook {
  color: string;
  bold: boolean;
  italic: boolean;
  /** Colour the group's bond too, not only its label. */
  bond: boolean;
}

export interface NewmanLook {
  /** The circle's radius, as a fraction of the drawing's bond length. */
  radius: number;
  /** How far the bonds reach past the circle, as a fraction of its radius. */
  reach: number;
  /** Degrees an eclipsed back group is turned so it shows beside the front one (0: drawn on top). */
  offset: number;
  /** A dot on the front atom, where its three bonds meet. */
  dot: boolean;
  /** Largest, middle and smallest group on each atom, by A-value. */
  ranks: [RankLook, RankLook, RankLook];
}

export const NEWMAN_LOOK: NewmanLook = {
  radius: 0.62,
  reach: 0.78,
  offset: 12,
  dot: false,
  ranks: [
    { color: '#e00000', bold: false, italic: false, bond: false },
    { color: '#000000', bold: false, italic: false, bond: false },
    { color: '#000000', bold: false, italic: false, bond: false },
  ],
};

/** Settings ▸ Newman Projections: how new projections and torsion charts look. */
export interface NewmanPrefs {
  look: NewmanLook;
  kind: 'newman' | 'sawhorse';
  /** Mark the viewing direction on the structure (eye and dotted arrow), and its colour. */
  mark: boolean;
  markColor: string;
  /** Where conformer energies come from: MMFF94s+ in the app, or GFN2-xTB (the desktop app runs the person's xtb). */
  method: 'mmff' | 'xtb';
  chart: { unit: 'kcal/mol' | 'kJ/mol'; insets: 'all' | 'minima' | 'none'; names: 'textbook' | 'klyne' | 'none'; barriers: boolean; barrierColor: string };
}

export const DEFAULT_NEWMAN_PREFS: NewmanPrefs = {
  look: NEWMAN_LOOK,
  kind: 'newman',
  mark: true,
  markColor: '#1a56db',
  method: 'mmff',
  chart: { unit: 'kcal/mol', insets: 'all', names: 'textbook', barriers: true, barrierColor: '#1a56db' },
};

const isColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);

/** Newman settings read back from storage, anything missing or wrong taken from the defaults. */
export function parseNewmanPrefs(raw: unknown): NewmanPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const D = DEFAULT_NEWMAN_PREFS, l = (r.look && typeof r.look === 'object' ? r.look : {}) as Record<string, any>;
  const ranks = D.look.ranks.map((d, i) => {
    const x = (Array.isArray(l.ranks) && l.ranks[i] && typeof l.ranks[i] === 'object' ? l.ranks[i] : {}) as Record<string, unknown>;
    return { color: isColour(x.color) ? x.color : d.color, bold: typeof x.bold === 'boolean' ? x.bold : d.bold, italic: typeof x.italic === 'boolean' ? x.italic : d.italic, bond: typeof x.bond === 'boolean' ? x.bond : d.bond };
  }) as NewmanLook['ranks'];
  const c = (r.chart && typeof r.chart === 'object' ? r.chart : {}) as Record<string, unknown>;
  return {
    look: { radius: num(l.radius, 0.2, 2, D.look.radius), reach: num(l.reach, 0.1, 3, D.look.reach), offset: num(l.offset, -45, 45, D.look.offset), dot: typeof l.dot === 'boolean' ? l.dot : D.look.dot, ranks },
    kind: pick(r.kind, ['newman', 'sawhorse'], D.kind),
    mark: typeof r.mark === 'boolean' ? r.mark : D.mark,
    markColor: isColour(r.markColor) ? r.markColor : D.markColor,
    method: pick(r.method, ['mmff', 'xtb'], D.method),
    chart: {
      unit: pick(c.unit, ['kcal/mol', 'kJ/mol'], D.chart.unit),
      insets: pick(c.insets, ['all', 'minima', 'none'], D.chart.insets),
      names: pick(c.names, ['textbook', 'klyne', 'none'], D.chart.names),
      barriers: typeof c.barriers === 'boolean' ? c.barriers : D.chart.barriers,
      barrierColor: isColour(c.barrierColor) ? c.barrierColor : D.chart.barrierColor,
    },
  };
}

