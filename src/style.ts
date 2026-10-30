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

/** The choices offered for it (Settings > Drawing), from round to square. */
export const BOND_END_CHOICES: { value: number; label: string }[] = [
  { value: 1, label: 'Round' },
  { value: 0.5, label: 'Half round' },
  { value: 0.25, label: 'Slightly round' },
  { value: 0, label: 'Square' },
];
