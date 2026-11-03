// Document drawing style: the handful of numbers that set the look of every drawing
// (ChemDraw User Guide pp. 40–42, 59). Values are in points.

export interface DocStyle {
  name: string;
  bondLength: number;
  lineWidth: number;
  boldWidth: number;
  /** Clearance around atom labels and at bond crossings. */
  marginWidth: number;
  hashSpacing: number;
  /** Distance between the lines of a double bond, as a percentage of bond length. */
  bondSpacing: number;
  chainAngle: number;
  labelFont: string;
  labelSize: number;
  captionFont: string;
  captionSize: number;
  /** How new captions look, as ChemDraw's face bits (1 bold, 2 italic, 4 underline, 96 formula). */
  captionFace: number;
  /** Text above and below reaction arrows (reagents, conditions): its size and font, where not the captions'. */
  arrowTextSize?: number;
  arrowTextFont?: string;
  /** Reaction arrows' line width and head length and width (each side), in points, where not the usual (the line width; a head 10 and 2.5 line widths). */
  arrowWidth?: number;
  arrowHeadLength?: number;
  arrowHeadWidth?: number;
  /**
   * How reaction arrows sit in a scheme, where not the usual (each distance in points; absent:
   * it scales with the bond length): the gap to the structures, either side of a +, between the
   * arrow and its text, how the lines of text line up, whether the arrow fits its text, and the
   * arrow beyond the text before it starts and before the head.
   */
  scheme?: StyleScheme;
  /**
   * How this drawing's atom-map number boxes look, and its own box format, saved with the file so
   * a figure looks the same on any computer (Nate, 2026-11-03). Absent: the program's default
   * (mapLookPrefs), as in files from before.
   */
  mapLook?: MapLook;
  mapBox?: MapBoxStyle;
}

export interface StyleScheme {
  structGap?: number;
  plusGap?: number;
  textGap?: number;
  textAlign?: 'left' | 'center' | 'right';
  fit?: boolean;
  lead?: number;
  headGap?: number;
}

export const ACS_1996: DocStyle = {
  name: 'ACS Document 1996',
  bondLength: 14.4,
  lineWidth: 0.6,
  boldWidth: 2,
  marginWidth: 1.6,
  hashSpacing: 2.5,
  bondSpacing: 18,
  chainAngle: 120,
  labelFont: 'Arial',
  labelSize: 10,
  captionFont: 'Arial',
  captionSize: 10,
  captionFace: 96,
};

export function doubleBondGap(s: DocStyle): number {
  return (s.bondSpacing / 100) * s.bondLength;
}

/** Width of a wedge's wide end: 1.5 × bold width (User Guide p. 41). */
export function wedgeWidth(s: DocStyle): number {
  return 1.5 * s.boldWidth;
}

/**
 * How round the free ends of bond lines are, an app setting (not saved with drawings): 1 is a
 * half circle (a round cap), 0 a square end cut off at the atom (a butt cap); in between, the end
 * reaches past by that fraction of the line's half width with its corners rounded to match.
 * Below 1, lines that meet at an atom are mitred rather than overlapping round ends.
 */
/** Slightly round: square-cut ends with softened corners (Nate's pick, 2026-10-30). */
export const DEFAULT_BOND_ENDS = 0.25;
export const bondEndPrefs: { round: number } = { round: DEFAULT_BOND_ENDS };

/**
 * How atom-map numbers look (Chemistry ▸ Map Atoms), saved with each drawing (DocStyle.mapLook),
 * with the last one chosen as the default for drawings that have none of their own: a small rounded box beside
 * the atom with ChemDraw's gray outline (Nate's pick, 2026-11-02), a light tint of the number's own
 * color (so an atom and where it goes match at a glance), or a format of the user's own
 * (Map Number Format…) used for every box.
 */
export type MapLook = 'grey' | 'tint' | 'custom';
export const MAP_LOOKS: { value: MapLook; label: string }[] = [
  { value: 'grey', label: 'Gray outline (ChemDraw style)' },
  { value: 'tint', label: 'Each number in its own light color' },
  { value: 'custom', label: 'Custom (Map Number Format…)' },
];

/** A format of the user's own for every map-number box. Colors are #rrggbb; '' is none. */
export interface MapBoxStyle {
  fill: string;
  pattern: 'none' | 'lines' | 'cross' | 'dots';
  patternColor: string;
  border: string;
  /** Outline width in points (0 for none). */
  borderWidth: number;
  text: string;
  bold: boolean;
  shadow: boolean;
  /** Rounded corners (else square). */
  rounded: boolean;
}
/** The custom format to start from: light peach with a dark outline, as in Nate's picture. */
export const DEFAULT_MAP_BOX: MapBoxStyle = { fill: '#fbdcc2', pattern: 'none', patternColor: '#c96a2b', border: '#000000', borderWidth: 0.6, text: '#000000', bold: false, shadow: false, rounded: true };
export const MAP_PATTERNS: { value: MapBoxStyle['pattern']; label: string }[] = [
  { value: 'none', label: 'None' }, { value: 'lines', label: 'Diagonal lines' }, { value: 'cross', label: 'Cross-hatch' }, { value: 'dots', label: 'Dots' },
];

/** A stored map-box format, checked, with anything missing or wrong from the default. */
export function mapBoxStyle(raw: unknown): MapBoxStyle {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const color = (v: unknown, d: string, empty = true) => typeof v === 'string' && (/^#[0-9a-f]{6}$/i.test(v) || (empty && v === '')) ? v : d;
  const d = DEFAULT_MAP_BOX;
  return {
    fill: color(r.fill, d.fill),
    pattern: MAP_PATTERNS.some((p) => p.value === r.pattern) ? r.pattern as MapBoxStyle['pattern'] : d.pattern,
    patternColor: color(r.patternColor, d.patternColor, false),
    border: color(r.border, d.border),
    borderWidth: typeof r.borderWidth === 'number' && isFinite(r.borderWidth) ? Math.max(0, Math.min(5, r.borderWidth)) : d.borderWidth,
    text: color(r.text, d.text, false),
    bold: typeof r.bold === 'boolean' ? r.bold : d.bold,
    shadow: typeof r.shadow === 'boolean' ? r.shadow : d.shadow,
    rounded: typeof r.rounded === 'boolean' ? r.rounded : d.rounded,
  };
}
/** The default for drawings with no map-number look of their own (a program setting). */
export const mapLookPrefs: { look: MapLook; custom: MapBoxStyle } = { look: 'grey', custom: { ...DEFAULT_MAP_BOX } };

/** The map-number look a drawing uses: its own, else the program's default. */
export function docMapLook(st: DocStyle): { look: MapLook; custom: MapBoxStyle } {
  return { look: st.mapLook ?? mapLookPrefs.look, custom: st.mapBox ?? mapLookPrefs.custom };
}

/** The choices offered for it (Settings > Drawing), from round to square. */
export const BOND_END_CHOICES: { value: number; label: string }[] = [
  { value: 1, label: 'Round' },
  { value: 0.5, label: 'Half round' },
  { value: 0.25, label: 'Slightly round' },
  { value: 0, label: 'Square' },
];
