// The app's own icon set: one drawing per command, drawn for this program on a 24 × 24 grid in
// a rounded outline style (1.5 strokes, round ends and joins) with a little colour. Each drawing
// marks its parts by role, and the stylesheet colours the roles, so one set of drawings gives
// every look (Settings > Appearance > Icons):
//   (no class)  the outline, in the icon ink
//   .a          the part that tells the command apart, in the icon's colour
//   .f          a soft fill behind a part, a tint of the icon's colour
//   .p          paper: the inside of a page, sheet or box, so it reads on a dark ribbon
//   .s          a solid dot or mark in the icon's colour
// Each icon has a hue (what kind of command it is) used by the "Colour" look; the other looks
// ignore it. No two commands share a drawing.

export type IconHue = 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'teal' | 'gray';

export interface IconDef {
  /** The drawing: SVG elements on a 24 × 24 grid. */
  d: string;
  hue: IconHue;
}

/** A flat-topped or pointy-topped hexagon at (cx, cy), radius r. */
export function hexPts(cx: number, cy: number, r: number, pointy = true): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (pointy ? -Math.PI / 2 : 0) + (i * Math.PI) / 3;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const hex = (cx: number, cy: number, r: number, cls = '') => `<polygon${cls ? ` class="${cls}"` : ''} points="${hexPts(cx, cy, r)}"/>`;

/** A page with its corner folded: the outline and the fold, with paper inside. */
const page = (x = 5, y = 2.75, w = 14, h = 18.5, fold = 4.5) =>
  `<path class="p" d="M${x + 1.5} ${y}h${w - fold - 1.5}l${fold} ${fold}v${h - fold - 1.5}a1.5 1.5 0 0 1-1.5 1.5h-${w - 3}a1.5 1.5 0 0 1-1.5-1.5v-${h - 3}a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M${x + w - fold} ${y}v${fold - 1}a1 1 0 0 0 1 1h${fold - 1}"/>`;
/** A slide: a wide rounded box with paper inside. */
const slide = (x = 2.75, y = 4.75, w = 18.5, h = 12.5) => `<rect class="p" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
/** A small round badge with a plus, at (cx, cy), in the icon's colour. */
const plus = (cx = 17.5, cy = 17.5, r = 4.25) => `<circle class="s" cx="${cx}" cy="${cy}" r="${r}"/><path class="k" d="M${cx} ${cy - 2}v4M${cx - 2} ${cy}h4"/>`;

export const ICON_SET: Record<string, IconDef> = {
  // ---------------------------------------------------------------- clipboard
  paste: { hue: 'amber', d: '<rect class="p" x="4.75" y="4.75" width="12.5" height="16.5" rx="2"/><path class="a" d="M8.5 4.75V3.75a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1"/><rect class="f a" x="8.5" y="3.25" width="5" height="3" rx="1"/><path class="p" d="M12.75 11.75h6.5v9.5h-6.5z"/><path d="M14.5 15h3M14.5 17.75h3"/>' },
  cut: { hue: 'gray', d: '<circle class="a" cx="6.5" cy="17.5" r="3"/><circle class="a" cx="17.5" cy="17.5" r="3"/><path d="M8.5 15.25L17.5 3.25M15.5 15.25L6.5 3.25"/>' },
  copy: { hue: 'blue', d: '<path d="M15.25 7.25V4.75a2 2 0 0 0-2-2h-8.5a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2h2.5"/><rect class="p a" x="8.75" y="7.25" width="12.5" height="14" rx="2"/>' },
  'format-painter': { hue: 'amber', d: '<rect class="f a" x="3.75" y="2.75" width="14.5" height="5.5" rx="1.5"/><path d="M18.25 5.5h1a1.5 1.5 0 0 1 1.5 1.5v2.5a1.5 1.5 0 0 1-1.5 1.5H12a1 1 0 0 0-1 1v2"/><rect x="9.25" y="14" width="3.5" height="7.25" rx="1"/>' },
  delete: { hue: 'red', d: '<path d="M3.75 6.25h16.5"/><path class="a" d="M9 6.25V4.25a1.5 1.5 0 0 1 1.5-1.5h3a1.5 1.5 0 0 1 1.5 1.5v2"/><path class="p" d="M5.75 6.25l1 13.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5l1-13.5"/><path class="a" d="M10 10.5v6.5M14 10.5v6.5"/>' },
  // ---------------------------------------------------------------- slides
  'new-slide': { hue: 'amber', d: slide(2.75, 3.75, 16.5, 11.5) + '<path d="M6 8h7M6 11h4.5"/>' + plus(17.75, 17.25) },
  'new-canvas-slide': { hue: 'amber', d: slide(2.75, 3.75, 16.5, 11.5) + hex(9, 9.5, 3.4, 'a') + plus(17.75, 17.25) },
  'duplicate-slide': { hue: 'amber', d: '<rect x="2.75" y="3.25" width="14.5" height="10" rx="2"/>' + slide(6.75, 8.75, 14.5, 10) },
  'hide-slide': { hue: 'gray', d: slide(2.75, 4.75, 18.5, 12.5) + '<path class="a" d="M4.5 20.5l15-15"/>' },
  section: { hue: 'amber', d: '<path class="a" d="M3 4.75h18"/><rect class="p" x="5.75" y="8.25" width="12.5" height="5" rx="1.25"/><rect class="p" x="5.75" y="15.75" width="12.5" height="5" rx="1.25"/><path d="M3 8.25v12.5"/>' },
  'reuse-slides': { hue: 'amber', d: slide(2.75, 3.25, 13, 9) + slide(8.25, 11.75, 13, 9) + '<path class="a" d="M14 9h4.5v2.5M17 10l1.5 1.5L20 10"/>' },
  layout: { hue: 'amber', d: slide(2.75, 4.75, 18.5, 14.5) + '<path class="f a" d="M5.25 7.25h13.5v3H5.25zM5.25 12.25h6v4.5h-6zM13.25 12.25h5.5v4.5h-5.5z"/>' },
  // ---------------------------------------------------------------- insert
  picture: { hue: 'teal', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><circle class="s" cx="15.5" cy="8.75" r="1.75"/><path class="f a" d="M2.75 17.5l5.5-6 4.5 4.5 2.75-2.75 5.75 5.75v-0a2 2 0 0 1-2 1.25h-14.5a2 2 0 0 1-2-2z"/>' },
  'text-box': { hue: 'blue', d: '<rect class="p" x="2.75" y="4.75" width="18.5" height="14.5" rx="2"/><path class="a" d="M8 9h8M12 9v7"/>' },
  table: { hue: 'blue', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M2.75 5.75a2 2 0 0 1 2-2h14.5a2 2 0 0 1 2 2V9H2.75z"/><path d="M2.75 14.5h18.5M9 9v11.25M15 9v11.25"/>' },
  chart: { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h15.5"/><rect class="f a" x="7.25" y="12" width="3" height="5.75" rx=".75"/><rect class="f a" x="12.25" y="6.5" width="3" height="11.25" rx=".75"/><rect class="f a" x="17.25" y="9.5" width="3" height="8.25" rx=".75"/>' },
  shapes: { hue: 'purple', d: '<circle class="f a" cx="8" cy="8" r="5.25"/><rect class="p" x="10.75" y="10.75" width="10.5" height="10.5" rx="1.5"/>' },
  icons: { hue: 'teal', d: '<path class="p" d="M9.25 2.75h5.5M10.25 2.75v6.5L4.5 18.5a1.75 1.75 0 0 0 1.5 2.75h12a1.75 1.75 0 0 0 1.5-2.75l-5.75-9.25v-6.5"/><path class="f a" d="M6.75 15h10.5l2.25 3.5a1.75 1.75 0 0 1-1.5 2.75H6a1.75 1.75 0 0 1-1.5-2.75z"/>' },
  diagram: { hue: 'purple', d: '<rect class="f a" x="8.25" y="2.75" width="7.5" height="5.5" rx="1.25"/><rect class="p" x="2.75" y="15.75" width="7.5" height="5.5" rx="1.25"/><rect class="p" x="13.75" y="15.75" width="7.5" height="5.5" rx="1.25"/><path d="M12 8.25v3.75M6.5 15.75V12h11v3.75"/>' },
  equation: { hue: 'blue', d: '<path class="a" d="M4.25 7.25h15.5M8.25 7.25v12M15.25 7.25v10.5a1.5 1.5 0 0 0 1.5 1.5h1"/>' },
  symbol: { hue: 'blue', d: '<path class="a" d="M4.25 20.25h4.5v-2.5a7 7 0 1 1 6.5 0v2.5h4.5"/>' },
  link: { hue: 'blue', d: '<path d="M10.25 13.75a4 4 0 0 0 5.75.25l3-3a4 4 0 0 0-5.75-5.75l-1.5 1.5"/><path class="a" d="M13.75 10.25a4 4 0 0 0-5.75-.25l-3 3a4 4 0 0 0 5.75 5.75l1.5-1.5"/>' },
  video: { hue: 'red', d: '<rect class="p" x="2.75" y="5.75" width="13" height="12.5" rx="2"/><path class="f a" d="M15.75 10.25l5.5-3v9.5l-5.5-3z"/>' },
  audio: { hue: 'red', d: '<path class="f a" d="M3.25 9.25h3.5l5-4.5v14.5l-5-4.5h-3.5z"/><path d="M15.25 9a4 4 0 0 1 0 6M18 6.25a8 8 0 0 1 0 11.5"/>' },
  media: { hue: 'red', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M10 8.75v6.5l5.5-3.25z"/>' },
  'header-footer': { hue: 'blue', d: '<rect class="p" x="4.75" y="2.75" width="14.5" height="18.5" rx="2"/>' + '<path class="a" d="M7.75 6h8.5M7.75 18h8.5"/><path d="M7.75 10h8.5M7.75 13h5" stroke-opacity=".45"/>' },
  'slide-references': { hue: 'blue', d: slide(2.75, 4.75, 18.5, 14.5) + '<path d="M5.75 9h9M5.75 12h6"/><path class="a" d="M5.75 16.25h5M14.5 13.75l1.5-1v4.5"/>' },
  crop: { hue: 'gray', d: '<path d="M6.75 2.75v13.5a1 1 0 0 0 1 1h13.5"/><path class="a" d="M2.75 6.75h13.5a1 1 0 0 1 1 1v13.5"/>' },
  'picture-format': { hue: 'teal', d: '<rect class="p" x="2.75" y="3.75" width="14" height="12.5" rx="2"/><path class="f a" d="M2.75 14l4-4.25 3.5 3.5 2-2 4.5 4.5"/><circle class="s" cx="17.5" cy="17.5" r="3.75"/><path class="k" d="M17.5 15.25v4.5M15.25 17.5h4.5"/>' },
  // ---------------------------------------------------------------- arrange
  'rotate-cw': { hue: 'gray', d: '<path d="M19.25 12a7.25 7.25 0 1 1-2.5-5.5"/><path class="a" d="M17.25 2.75v4h-4"/>' },
  'rotate-ccw': { hue: 'gray', d: '<path d="M4.75 12a7.25 7.25 0 1 0 2.5-5.5"/><path class="a" d="M6.75 2.75v4h4"/>' },
  'rotate-by': { hue: 'gray', d: '<path d="M3.25 20.75h17.5M3.25 20.75L15.75 4.5"/><path class="a" d="M10.5 20.75a7.25 7.25 0 0 0-2.25-5.25"/>' },
  'flip-h': { hue: 'gray', d: '<path d="M12 2.75v18.5" stroke-dasharray="2 2.5"/><path class="f a" d="M9.25 6.5v11.5H3.5z"/><path d="M14.75 6.5v11.5h5.75z"/>' },
  'flip-v': { hue: 'gray', d: '<path d="M2.75 12h18.5" stroke-dasharray="2 2.5"/><path class="f a" d="M6.5 9.25h11.5V3.5z"/><path d="M6.5 14.75h11.5v5.75z"/>' },
  'bring-front': { hue: 'gray', d: '<rect x="2.75" y="2.75" width="11" height="11" rx="1.5" stroke-dasharray="2 2"/><rect class="f a" x="10.25" y="10.25" width="11" height="11" rx="1.5"/>' },
  'send-back': { hue: 'gray', d: '<rect class="f a" x="10.25" y="10.25" width="11" height="11" rx="1.5" stroke-dasharray="2 2"/><rect class="p" x="2.75" y="2.75" width="11" height="11" rx="1.5"/>' },
  'lock-structures': { hue: 'blue', d: hex(10, 10.5, 7.5) + '<rect class="f a" x="12.75" y="14.25" width="8.5" height="7" rx="1.5"/><path class="a" d="M14.75 14.25v-1.5a2 2 0 0 1 4 0v1.5"/>' },
  // ---------------------------------------------------------------- chemistry
  structure: { hue: 'blue', d: hex(12, 12, 8.75) + '<path class="a" d="M8 8.25l4-2.3M17 9.75v4.5M8 15.75l4 2.3"/>' },
  'structure-from-name': { hue: 'blue', d: '<path class="a" d="M3 9.5l2.25-6 2.25 6M3.75 7.5h3"/><path d="M5.25 12.5v4.75h3.5M7.25 15.75l1.5 1.5-1.5 1.5"/>' + hex(16, 14.5, 5.25) },
  // ---------------------------------------------------------------- views
  'view-read': { hue: 'blue', d: '<path class="f a" d="M12 6.25C10 4.5 7 4 3.25 4.25v14C7 18 10 18.5 12 20.25z"/><path class="p" d="M12 6.25c2-1.75 5-2.25 8.75-2v14c-3.75-.25-6.75.25-8.75 2z"/><path d="M14.75 8.75c1.25-.5 2.75-.75 3.75-.75M14.75 12c1.25-.5 2.75-.75 3.75-.75"/>' },
  'view-print': { hue: 'blue', d: page() + '<path class="a" d="M8.25 11h7.5M8.25 14h7.5M8.25 17h4.5"/>' },
  'view-web': { hue: 'blue', d: '<circle class="p" cx="12" cy="12" r="9.25"/><path class="a" d="M12 2.75c-3 3-3 15.5 0 18.5M12 2.75c3 3 3 15.5 0 18.5"/><path d="M3.25 9h17.5M3.25 15h17.5"/>' },
  // ---------------------------------------------------------------- review
  comment: { hue: 'amber', d: '<path class="f a" d="M4.75 3.75h14.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-4.75 3.5v-3.5H4.75a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/><path d="M7 8.25h10M7 11.75h6.5"/>' },
  spelling: { hue: 'green', d: '<path d="M3 13.25l2.5-8.5 2.5 8.5M3.75 10.75h3.5M10.25 4.75v8.5h2.5a2.25 2.25 0 0 0 0-4.5h-2.5M10.25 8.75h2a2 2 0 0 0 0-4h-2"/><path class="a" d="M10.5 18.25l3 3 7.75-8"/>' },
  accessibility: { hue: 'blue', d: '<circle class="s" cx="12" cy="4.5" r="1.75"/><path d="M4.75 8.25l7.25 1.5 7.25-1.5"/><path class="a" d="M12 9.75v4.5l-3.5 7M12 14.25l3.5 7"/>' },
  'alt-text': { hue: 'gray', d: '<path class="f a" d="M2.75 4.75v6.5l9.5 9.5a1.5 1.5 0 0 0 2 0l6.5-6.5a1.5 1.5 0 0 0 0-2l-9.5-9.5h-6.5a2 2 0 0 0-2 2z"/><circle class="p" cx="7.5" cy="7.5" r="1.75"/>' },
  // ---------------------------------------------------------------- editing
  find: { hue: 'gray', d: '<circle class="p" cx="10.25" cy="10.25" r="6.5"/><path class="a" d="M15 15l6 6"/>' },
  replace: { hue: 'gray', d: '<path d="M3.25 7.25h11.5M11.75 4.25l3 3-3 3"/><path class="a" d="M20.75 16.75H9.25M12.25 13.75l-3 3 3 3"/>' },
  select: { hue: 'gray', d: '<rect x="2.75" y="2.75" width="13.5" height="13.5" rx="1.5" stroke-dasharray="2.25 2.25"/><path class="f a" d="M11.25 11.25l9.25 3.5-4 1.75-1.75 4z"/>' },
  present: { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="12.5" rx="2"/><path d="M12 16.25v4M8.5 20.75h7"/><path class="f a" d="M10.25 7.25v5.5l4.5-2.75z"/>' },
};

/** An icon from the set as an SVG element's markup, at the given size in pixels. */
export function iconSvg(name: string, size = 24): string | undefined {
  const ic = ICON_SET[name];
  if (!ic) return undefined;
  return `<svg class="ci-ic" data-hue="${ic.hue}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ic.d}</svg>`;
}
