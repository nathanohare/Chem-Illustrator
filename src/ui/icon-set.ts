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
  // ================================================================ more commands
  // ---------------------------------------------------------------- spreadsheet: data and chemistry
  'property-column': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path d="M2.75 8.75h18.5M9 3.75v16.5"/><path class="f a" d="M14.75 3.75h4.5a2 2 0 0 1 2 2v12.5a2 2 0 0 1-2 2h-4.5z"/>' + hex(5.9, 14.5, 2.4) },
  'isotope-pattern': { hue: 'green', d: '<path d="M2.75 20.25h18.5"/><path class="a" d="M6 20.25V5.75M10 20.25V9.25M14 20.25v-6.5M18 20.25v-3"/>' },
  'get-data': { hue: 'green', d: '<ellipse class="f a" cx="9.25" cy="5.5" rx="6.5" ry="2.75"/><path d="M2.75 5.5v11c0 1.5 2.9 2.75 6.5 2.75M15.75 5.5v4M2.75 11c0 1.5 2.9 2.75 6.5 2.75"/><path class="a" d="M13.5 17.25h7.5M18 14.25l3 3-3 3"/>' },
  'refresh-all': { hue: 'green', d: '<path d="M19.75 10.5A8 8 0 0 0 5 7.5M4.25 13.5A8 8 0 0 0 19 16.5"/><path class="a" d="M4.25 3.25v4.5h4.5M19.75 20.75v-4.5h-4.5"/>' },
  compound: { hue: 'green', d: '<rect class="p" x="2.75" y="5.75" width="18.5" height="14.5" rx="2"/>' + hex(8.5, 13, 3.75, 'f a') + '<path d="M14 10.75h4.5M14 13.75h4.5M14 16.75h3"/><path d="M7.25 5.75V3.75M16.75 5.75V3.75"/>' },
  'custom-sort': { hue: 'green', d: '<path d="M3.25 5.25h9M3.25 10h6.5M3.25 14.75h4"/><path class="a" d="M17.25 4v16M14 16.75l3.25 3.25 3.25-3.25"/>' },
  'text-to-columns': { hue: 'green', d: '<path d="M3.25 6.25h17.5M3.25 12h17.5M3.25 17.75h17.5" stroke-opacity=".5"/><path class="a" d="M9 3.25v17.5M15 3.25v17.5" stroke-dasharray="2 2"/>' },
  'what-if': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path d="M2.75 8.75h18.5M8.25 3.75v16.5"/><path class="a" d="M12.75 13a2.25 2.25 0 1 1 3 2.1c-.6.25-.75.65-.75 1.15M15 18.5v.05"/>' },
  'data-analysis': { hue: 'green', d: '<path d="M2.75 20.25h18.5"/><path class="f a" d="M2.75 20.25C7 20.25 8 5.25 12 5.25s5 15 9.25 15z"/><path d="M12 5.25v15" stroke-dasharray="1.5 2"/>' },
  solver: { hue: 'green', d: '<circle cx="11" cy="13" r="8.25"/><circle class="f a" cx="11" cy="13" r="4.25"/><circle class="s" cx="11" cy="13" r="1.25"/><path class="a" d="M11 13l9.5-9.5M17.25 3.5h3.25v3.25"/>' },
  'sheet-view-normal': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="a" d="M2.75 9h18.5M2.75 14.5h18.5M9 3.75v16.5M15 3.75v16.5"/>' },
  'view-break-preview': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path d="M2.75 9h18.5M2.75 14.5h18.5M9 3.75v16.5" stroke-opacity=".45"/><path class="a" d="M15 3.75v16.5M2.75 14.5h18.5" stroke-dasharray="2.25 2" stroke-width="1.75"/>' },
  'view-page-layout': { hue: 'green', d: '<path d="M2.75 3.25h18.5M2.75 3.25v2M7.5 3.25v1.25M12 3.25v2M16.5 3.25v1.25M21.25 3.25v2"/>' + '<rect class="p" x="5.75" y="7.75" width="12.5" height="13.5" rx="1.5"/><path class="a" d="M8.25 11h7.5M8.25 14h7.5M8.25 17h4.5"/>' },
  'freeze-panes-menu': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path d="M14.75 9.25v11M9.25 14.75h12" stroke-opacity=".45"/><path class="a" d="M2.75 9.25h18.5M8.25 3.75v16.5" stroke-width="2.25"/>' },
  'split-window': { hue: 'gray', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="a" d="M12 3.75v16.5M2.75 12h18.5" stroke-width="1.75"/>' },
  'new-window': { hue: 'gray', d: '<path d="M7.25 6.75V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-1.75"/><rect class="p" x="2.75" y="7.25" width="14.5" height="12.5" rx="2"/><path class="a" d="M2.75 10.75h14.5"/>' },
  'insert-pivot': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path d="M2.75 8.75h18.5M8.25 3.75v16.5"/><path class="a" d="M12 17.25h4.25a1.5 1.5 0 0 0 1.5-1.5V12.5M15.75 14.5l2-2 2 2M14 15.25l-2 2 2 2"/>' },
  'insert-pivot-chart': { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h7"/><rect class="f a" x="6.75" y="11" width="2.75" height="6.5" rx=".75"/><rect class="f a" x="11.25" y="6" width="2.75" height="11.5" rx=".75"/><path class="a" d="M15.5 20.75h2.75a1.5 1.5 0 0 0 1.5-1.5v-3M17.75 18.25l2-2 2 2"/>' },
  'chart-scatter': { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h15.5"/><circle class="s" cx="8" cy="15.5" r="1.5"/><circle class="s" cx="11.5" cy="11" r="1.5"/><circle class="s" cx="14.5" cy="13.5" r="1.5"/><circle class="s" cx="17" cy="7.5" r="1.5"/><circle class="s" cx="19.25" cy="10.5" r="1.5"/>' },
  'chart-line': { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h15.5"/><path class="a" d="M6.5 16l4-5.5 3.5 3 6-7.75" stroke-width="1.75"/>' },
  'chart-column': { hue: 'green', d: '<path d="M3.25 20.75h17.5"/><rect class="f a" x="5" y="11" width="3.5" height="9.75" rx=".75"/><rect class="f a" x="10.25" y="4.5" width="3.5" height="16.25" rx=".75"/><rect class="f a" x="15.5" y="8" width="3.5" height="12.75" rx=".75"/>' },
  'chart-bar': { hue: 'green', d: '<path d="M3.25 3.25v17.5"/><rect class="f a" x="3.25" y="5" width="9.75" height="3.5" rx=".75"/><rect class="f a" x="3.25" y="10.25" width="16.25" height="3.5" rx=".75"/><rect class="f a" x="3.25" y="15.5" width="12.75" height="3.5" rx=".75"/>' },
  'chart-area': { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h15.5"/><path class="f a" d="M3.25 20.75V15l5-6 4.5 4 7.5-7.5v15.25z"/>' },
  'chart-pie': { hue: 'green', d: '<circle class="p" cx="11" cy="13" r="8.25"/><path class="f a" d="M13.25 2.75a8.25 8.25 0 0 1 8 8h-8z"/><path d="M11 13V4.75M11 13l6.25 5.25"/>' },
  'chart-combo': { hue: 'green', d: '<path d="M3.25 20.75h17.5"/><rect class="f" x="5" y="12" width="3.5" height="8.75" rx=".75"/><rect class="f" x="10.25" y="9" width="3.5" height="11.75" rx=".75"/><rect class="f" x="15.5" y="13.5" width="3.5" height="7.25" rx=".75"/><path class="a" d="M4 9.5l6-5 4.5 3.25L20.5 4" stroke-width="1.75"/>' },
  'chart-histogram': { hue: 'green', d: '<path d="M3.25 20.75h17.5"/><path class="f a" d="M4.25 20.75v-6h3.5v-6h3.5V4.5h3.5v7h3.5v4.25h2.5v5"/>' },
  'chart-box': { hue: 'green', d: '<path d="M7.75 3.25v4M7.75 15.25v5.5M5.5 3.25h4.5M5.5 20.75h4.5M16.25 6.25v3M16.25 16.5v3M14 6.25h4.5M14 19.5h4.5"/><rect class="f a" x="5" y="7.25" width="5.5" height="8" rx="1"/><rect class="f a" x="13.5" y="9.25" width="5.5" height="7.25" rx="1"/><path d="M5 11.5h5.5M13.5 13h5.5"/>' },
  'chart-bubble': { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h15.5"/><circle class="f a" cx="9" cy="14" r="3.25"/><circle class="f a" cx="16" cy="8.5" r="4.25"/><circle class="s" cx="17.5" cy="16.75" r="1.5"/>' },
  'chart-radar': { hue: 'green', d: '<polygon points="' + hexPts(12, 12, 9) + '" stroke-opacity=".5"/><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" stroke-opacity=".35"/><path class="f a" d="M12 6l5.5 3.25-1.25 6.5L12 18l-5-3.25-1.25-5.25z"/>' },
  'chart-sankey': { hue: 'green', d: '<path d="M3.25 4v7M3.25 13v7M20.75 3.5v10M20.75 16v4.5" stroke-width="2.25"/><path class="f a" d="M3.25 4c9 0 8.5 0 17.5 0v4c-9 0-8.5 8.5-17.5 8.5zM3.25 18.5c9 0 8.5-1 17.5-1V20c-9 0-8.5.5-17.5.5z"/>' },
  'chart-treemap': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M4.75 3.75H12v16.5H4.75a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2z"/><path d="M12 11.5h9.25M16.5 11.5v8.75"/>' },
  'chart-decomp': { hue: 'green', d: '<rect class="f a" x="2.75" y="9.75" width="5" height="4.5" rx="1"/><rect class="p" x="16.25" y="3.25" width="5" height="4.5" rx="1"/><rect class="p" x="16.25" y="9.75" width="5" height="4.5" rx="1"/><rect class="p" x="16.25" y="16.25" width="5" height="4.5" rx="1"/><path d="M7.75 12h3.5M11.25 5.5v13M11.25 5.5h5M11.25 12h5M11.25 18.5h5"/>' },
  'spark-line': { hue: 'green', d: '<rect class="p" x="2.75" y="6.75" width="18.5" height="10.5" rx="1.5"/><path class="a" d="M5.25 14l3.5-3.5 3 2 3.5-4.5 3.5 2.5"/>' },
  'spark-column': { hue: 'green', d: '<rect class="p" x="2.75" y="6.75" width="18.5" height="10.5" rx="1.5"/><path class="a" d="M6.25 15v-3M9.75 15v-5.5M13.25 15v-2M16.75 15v-4.5" stroke-width="2.25" stroke-linecap="butt"/>' },
  'spark-winloss': { hue: 'green', d: '<rect class="p" x="2.75" y="6.75" width="18.5" height="10.5" rx="1.5"/><path d="M4.75 12h14.5" stroke-opacity=".4"/><path class="a" d="M6.75 12V9.25M10.25 12V9.25M17.25 12V9.25" stroke-width="2.25" stroke-linecap="butt"/><path d="M13.75 12v2.75" stroke-width="2.25" stroke-linecap="butt"/>' },
  'spark-edit': { hue: 'green', d: '<rect class="p" x="2.75" y="5.75" width="14.5" height="9.5" rx="1.5"/><path class="a" d="M5 12.75l3-3 2.5 1.75 3.5-3.75"/><path d="M13.25 21.25l.75-3 5.5-5.5 2.25 2.25-5.5 5.5z"/>' },
  'insert-dashboard': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><rect class="f a" x="5.25" y="6.25" width="6" height="4.5" rx="1"/><path d="M14 8.5h4.75M5.25 13.75h13.5v4h-13.5z"/>' },
  themes: { hue: 'purple', d: '<path class="p" d="M12 3a9 9 0 1 0 0 18c1.25 0 1.75-.75 1.75-1.75 0-1.5-1.25-1.75-1.25-3 0-1 .75-1.75 1.75-1.75h2.5A4.25 4.25 0 0 0 21 10.25C21 6.25 17 3 12 3z"/><circle class="s" cx="7.5" cy="11" r="1.5"/><circle class="s" cx="10" cy="7" r="1.5"/><circle class="s" cx="15" cy="7.25" r="1.5"/>' },
  'page-margins': { hue: 'blue', d: page() + '<rect class="a" x="8" y="8.25" width="8" height="10" stroke-dasharray="1.75 1.75"/>' },
  'page-orientation': { hue: 'blue', d: '<rect class="p" x="3.25" y="2.75" width="10" height="14" rx="1.5"/><rect class="p a" x="8.25" y="11.25" width="13" height="10" rx="1.5"/>' },
  'page-size': { hue: 'blue', d: '<rect class="p" x="5.75" y="5.75" width="12.5" height="15.5" rx="1.5"/><path class="a" d="M5.75 2.75h12.5M5.75 1.75v2M18.25 1.75v2M21.25 5.75v15.5M20.25 5.75h2M20.25 21.25h2"/>' },
  'print-area': { hue: 'blue', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><rect class="f a" x="5.75" y="6.75" width="9" height="8.5" stroke-dasharray="2 1.75"/>' },
  'page-breaks': { hue: 'blue', d: '<path class="p" d="M5 9.5V4.25a1.5 1.5 0 0 1 1.5-1.5h11a1.5 1.5 0 0 1 1.5 1.5V9.5zM5 14.5v5.25a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V14.5z"/><path class="a" d="M2.75 12h18.5" stroke-dasharray="2.25 2"/>' },
  'print-titles': { hue: 'blue', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M2.75 5.75a2 2 0 0 1 2-2h14.5a2 2 0 0 1 2 2V9H2.75z"/><path d="M2.75 14.5h18.5M9 9v11.25" stroke-opacity=".45"/>' },
  'print-preview': { hue: 'blue', d: page(3.75, 2.75, 12.5, 16.5, 4) + '<circle class="p a" cx="15.5" cy="15.5" r="3.75"/><path class="a" d="M18.25 18.25l3 3"/>' },
  'insert-function': { hue: 'green', d: '<path class="a" d="M13.25 4.25c-1.5-.75-3.75-.5-4 2l-1.5 12.5c-.25 2-2.25 2.5-3.75 1.5M5.75 10h7.5"/><path d="M14.25 12.25l5.5 6.5M19.75 12.25l-5.5 6.5"/>' },
  'name-manager': { hue: 'green', d: '<path class="f a" d="M2.75 6.75v4l7 7a1.25 1.25 0 0 0 1.75 0l4-4a1.25 1.25 0 0 0 0-1.75l-7-7h-4a1.75 1.75 0 0 0-1.75 1.75z"/><circle class="p" cx="6.5" cy="8.5" r="1.25"/><path d="M15.5 4.75h5.75M17.5 8.75h3.75M19.5 12.75h1.75"/>' },
  'new-note': { hue: 'amber', d: '<path class="f a" d="M4.75 3.25h14.5a1.5 1.5 0 0 1 1.5 1.5v10l-6 6h-10a1.5 1.5 0 0 1-1.5-1.5v-14.5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M14.75 20.75v-4.5a1.5 1.5 0 0 1 1.5-1.5h4.5M7 8h10M7 11.5h6"/>' },
  'dash-add-kpi': { hue: 'green', d: '<rect class="p" x="2.75" y="4.75" width="18.5" height="14.5" rx="2"/><path class="a" d="M6.25 9.25l1.75-1.25v8M11 9a1.75 1.75 0 0 1 3.25.75c0 1.5-3.25 3.5-3.25 6.25h3.5M16.5 8h3l-2 3a2.25 2.25 0 1 1-1.25 4"/>' },
  'dash-add-table': { hue: 'green', d: '<rect class="p" x="2.75" y="4.75" width="18.5" height="14.5" rx="2"/><path class="a" d="M6 9h12"/><path d="M6 12.25h12M6 15.5h12" stroke-opacity=".55"/>' },
  'dash-add-slicer': { hue: 'green', d: '<path class="f a" d="M3.25 3.75h17.5l-6.5 7.5v6.5l-4.5 2.5v-9z"/>' },
  'dash-add-gallery': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="8" height="7.5" rx="1.25"/><rect class="p" x="13.25" y="3.75" width="8" height="7.5" rx="1.25"/><rect class="p" x="2.75" y="12.75" width="8" height="7.5" rx="1.25"/><rect class="p" x="13.25" y="12.75" width="8" height="7.5" rx="1.25"/>' + hex(6.75, 7.5, 2.1, 'a') + hex(17.25, 7.5, 2.1, 'a') + hex(6.75, 16.5, 2.1, 'a') + hex(17.25, 16.5, 2.1, 'a') },
  'dash-add-text': { hue: 'green', d: '<rect class="p" x="2.75" y="4.75" width="18.5" height="14.5" rx="2"/><path class="a" d="M6 8.75h7"/><path d="M6 12.25h12M6 15.5h9"/>' },
  'table-style': { hue: 'blue', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M2.75 5.75a2 2 0 0 1 2-2h14.5a2 2 0 0 1 2 2V8.5H2.75zM2.75 12.25h18.5v3.75H2.75z"/>' },
  'pivot-fields': { hue: 'green', d: '<rect class="p" x="3.25" y="2.75" width="17.5" height="18.5" rx="2"/><rect class="f a" x="6" y="6" width="3" height="3" rx=".5"/><rect x="6" y="10.5" width="3" height="3" rx=".5"/><rect class="f a" x="6" y="15" width="3" height="3" rx=".5"/><path d="M11.5 7.5h6M11.5 12h6M11.5 16.5h6"/>' },
  'pivot-refresh': { hue: 'green', d: '<rect class="p" x="2.75" y="3.75" width="12.5" height="11.5" rx="1.5"/><path d="M2.75 7.75h12.5M7 3.75v11.5"/><path class="a" d="M21 15.5a4.5 4.5 0 1 1-1.5-3.4M20.25 9.5v3h-3"/>' },
  'chart-type': { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h4"/><rect class="f" x="6.75" y="11" width="2.75" height="6.5" rx=".75"/><rect class="f" x="11.25" y="6" width="2.75" height="6" rx=".75"/><path class="a" d="M12.75 16.25h8M18.25 13.75l2.5 2.5-2.5 2.5M20.75 20.75h-8"/>' },
  'chart-fit': { hue: 'green', d: '<path d="M3.25 3.25v15.5a2 2 0 0 0 2 2h15.5"/><circle class="s" cx="7.5" cy="15" r="1.25"/><circle class="s" cx="10.5" cy="13.5" r="1.25"/><circle class="s" cx="13" cy="10" r="1.25"/><circle class="s" cx="16.5" cy="9" r="1.25"/><path class="a" d="M5.5 17.5l15-12" stroke-width="1.75"/>' },
  // ---------------------------------------------------------------- document: pages and insert
  'cover-page': { hue: 'blue', d: '<rect class="p" x="4.75" y="2.75" width="14.5" height="18.5" rx="2"/><path class="f a" d="M6.75 2.75h10.5a2 2 0 0 1 2 2V11H4.75V4.75a2 2 0 0 1 2-2z"/><path d="M7.5 14.5h9M7.5 17.5h5"/>' },
  'blank-page': { hue: 'blue', d: page() + '<path class="a" d="M12 10.75v6M9 13.75h6"/>' },
  'page-break': { hue: 'blue', d: '<path class="p" d="M5.25 9.5V4.25a1.5 1.5 0 0 1 1.5-1.5h10.5a1.5 1.5 0 0 1 1.5 1.5V9.5"/><path class="p" d="M5.25 14.5v5.25a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V14.5"/><path class="a" d="M2.75 12h3.5M10 12h4M17.75 12h3.5"/>' },
  'edit-figure': { hue: 'blue', d: hex(10, 11.5, 7.5) + '<path class="f a" d="M13 21.25l.75-3.25 6-6 2.5 2.5-6 6z"/>' },
  'text-to-table': { hue: 'blue', d: '<path d="M2.75 5.25h7.5M2.75 9h5.5M2.75 12.75h7.5"/><path class="a" d="M10.5 18.25h3M12.5 16.25l2 2-2 2" stroke-width="1.5"/><rect class="p" x="14.25" y="3.75" width="7" height="10" rx="1.25"/><path d="M14.25 7.25h7M14.25 10.5h7M17.75 3.75v10"/>' },
  'insert-object': { hue: 'blue', d: page() + '<rect class="f a" x="8" y="10.25" width="8" height="7.25" rx="1"/>' },
  'insert-bookmark': { hue: 'blue', d: '<path class="f a" d="M6.25 2.75h11.5a1 1 0 0 1 1 1v17.5l-6.75-4.75-6.75 4.75V3.75a1 1 0 0 1 1-1z"/>' },
  'quick-parts': { hue: 'blue', d: page() + '<rect class="f a" x="7.75" y="9.5" width="8.5" height="3.5" rx=".75"/><rect class="f a" x="7.75" y="14.75" width="5.5" height="3.5" rx=".75"/>' },
  'insert-date': { hue: 'blue', d: '<rect class="p" x="2.75" y="4.25" width="18.5" height="17" rx="2"/><path class="f a" d="M2.75 6.25a2 2 0 0 1 2-2h14.5a2 2 0 0 1 2 2V9.5H2.75z"/><path d="M7.5 2.25v4M16.5 2.25v4"/><circle class="s" cx="8" cy="14" r="1.1"/><circle class="s" cx="12" cy="14" r="1.1"/><circle class="s" cx="16" cy="14" r="1.1"/><circle class="s" cx="8" cy="17.75" r="1.1"/>' },
  'insert-caption': { hue: 'blue', d: '<rect class="p" x="3.75" y="2.75" width="16.5" height="12" rx="1.75"/><path d="M3.75 12.5l4.5-4.25 3.5 3.5 2.25-2.25 6.25 5"/><path class="a" d="M5.25 18.5h13.5M8 21.25h8"/>' },
  'insert-toc': { hue: 'blue', d: '<path class="a" d="M3.25 5.25h7"/><path d="M3.25 10.25h4.5M5.75 15.25h4.5M5.75 20.25h4.5" /><path d="M12 5.25h6M10 10.25h8M12.25 15.25h5.75M12.25 20.25h5.75" stroke-dasharray=".1 2.25"/><path d="M20.75 5.25v0M20.75 10.25v0M20.75 15.25v0M20.75 20.25v0" stroke-width="2.25"/>' },
  'insert-footnote': { hue: 'blue', d: page() + '<path d="M8.25 8.75h5M8.25 11.75h7.5"/><path class="a" d="M14.5 7l1.25-.75v3.5M8.25 17.75h3.5"/>' },
  'insert-endnote': { hue: 'blue', d: page() + '<path d="M8.25 8.75h7.5M8.25 11.75h7.5" stroke-opacity=".45"/><path class="a" d="M8.25 15.5h7.5M8.25 18.25h4.5" /><path d="M14.25 17.25v1.5" stroke-width="2"/>' },
  'note-options': { hue: 'gray', d: '<circle class="p" cx="12" cy="12" r="3.25"/><path class="a" d="M12 2.75v2.5M12 18.75v2.5M2.75 12h2.5M18.75 12h2.5M5.45 5.45l1.75 1.75M16.8 16.8l1.75 1.75M5.45 18.55l1.75-1.75M16.8 7.2l1.75-1.75"/><circle cx="12" cy="12" r="6.75"/>' },
  'insert-tof': { hue: 'blue', d: '<rect class="f a" x="2.75" y="3.25" width="5.5" height="4.5" rx="1"/><rect class="f a" x="2.75" y="9.75" width="5.5" height="4.5" rx="1"/><rect class="f a" x="2.75" y="16.25" width="5.5" height="4.5" rx="1"/><path d="M10.75 5.5h10.5M10.75 12h10.5M10.75 18.5h10.5"/>' },
  'cross-reference': { hue: 'blue', d: page(9.25, 2.75, 12, 15, 3.5) + '<path class="a" d="M2.75 21.25c0-6 2.5-9.5 8-9.5M8.25 9l2.5 2.75-2.5 2.75"/>' },
  'mark-entry': { hue: 'blue', d: '<path d="M2.75 5.25h11M2.75 10.25h7M2.75 15.25h5"/><path class="a" d="M10.75 16.75l3.25 3.25 7.25-7.75"/>' },
  'insert-index': { hue: 'blue', d: '<path class="a" d="M3 11.25L5.5 4.25 8 11.25M3.75 9.25h3.5M3.5 13.75h4.5l-4.5 6.5h4.5"/><path d="M11.75 5h9.5M11.75 9.25h9.5M11.75 13.5h9.5M11.75 17.75h6.5"/>' },
  'mark-citation': { hue: 'blue', d: '<path class="a" d="M11.25 4.25c-1.25-1.5-6-1.25-4.5 1.5s5.75 3 5.25 6c-.5 2.5-5.25 2.75-5.25 2.75M6.5 8.75c-1.75 2.5 3.5 3 3.5 3"/><path d="M12.75 18.25l2.75 2.75 5.75-6.25"/>' },
  'insert-toa': { hue: 'blue', d: '<path class="a" d="M8.75 3.75c-1-1.25-4.75-1-3.5 1.25s4.5 2.25 4.25 4.75c-.5 2-4.25 2.25-4.25 2.25M5 7.25c-1.5 2 2.75 2.5 2.75 2.5"/><path d="M12.75 4.75h8.5M12.75 9h8.5M3.25 15.25h18M3.25 19.5h18"/>' },
  'compound-number': { hue: 'blue', d: hex(12, 8.25, 5.75) + '<path class="a" d="M10.25 17.75l2.25-1.5v6" stroke-width="2"/>' },
  'insert-citation': { hue: 'blue', d: '<path d="M3.25 14.25c0-4 1.25-6.5 4.75-7.5M3.25 14.25h4v4.5h-4zM10.75 14.25c0-4 1.25-6.5 4.75-7.5M10.75 14.25h4v4.5h-4z"/><path class="a" d="M18.25 5.25l2-1.25v5.5"/>' },
  'insert-bibliography': { hue: 'blue', d: '<rect class="f a" x="3.25" y="3.25" width="4.5" height="17.5" rx="1"/><rect class="p" x="7.75" y="3.25" width="4.5" height="17.5" rx="1"/><path class="p" d="M14.25 4.25l4.25-1.25 4 16.75-4.25 1.25z"/><path d="M3.25 7h4.5M7.75 7h4.5"/>' },
  'manage-references': { hue: 'blue', d: '<rect class="f a" x="2.75" y="3.25" width="4.5" height="15" rx="1"/><rect class="p" x="7.25" y="3.25" width="4.5" height="15" rx="1"/><path d="M2.75 21.25h9"/><circle class="p" cx="17.5" cy="15.5" r="2.25"/><path class="a" d="M17.5 10.75v1.5M17.5 18.75v1.5M12.75 15.5h1.5M20.75 15.5h1.5M14.15 12.15l1.05 1.05M19.8 17.8l1.05 1.05M14.15 18.85l1.05-1.05M19.8 13.2l1.05-1.05"/>' },
  'zotero-cite': { hue: 'red', d: '<path class="a" d="M3.75 4.25h9l-9 12h9"/><path d="M15.25 14.25c0-3 1-5 3.5-5.75M15.25 14.25h3v3.5h-3z"/>' },
  'zotero-bib': { hue: 'red', d: '<path class="a" d="M3.75 4.25h7.5l-7.5 10h7.5"/><path d="M14.25 4.75h7M14.25 9.25h7M3.75 18.75h17.5M14.25 14h7"/>' },
  // ---------------------------------------------------------------- review
  'track-changes': { hue: 'amber', d: page(3.75, 2.75, 13.5, 18.5, 4) + '<path d="M6.75 10.5h7M6.75 13.5h4.5"/><path class="a" d="M6.25 16.75h6" /><path class="f a" d="M13.25 21.25l.75-3.25 5.5-5.5 2.5 2.5-5.5 5.5z"/>' },
  'review-name': { hue: 'amber', d: '<circle class="f a" cx="12" cy="8" r="4.25"/><path d="M4 20.75c.75-4 4-6.25 8-6.25s7.25 2.25 8 6.25"/>' },
  'accept-change': { hue: 'green', d: page() + '<circle class="s" cx="16.25" cy="17" r="4.75"/><path class="k" d="M14 17l1.5 1.5 3-3"/>' },
  'reject-change': { hue: 'red', d: page() + '<circle class="s" cx="16.25" cy="17" r="4.75"/><path class="k" d="M14.5 15.25l3.5 3.5M18 15.25l-3.5 3.5"/>' },
  'compare-docs': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="8" height="12" rx="1.5"/><rect class="p" x="13.25" y="8.25" width="8" height="12" rx="1.5"/><path class="a" d="M8.25 19.25h3.5M10.25 17.25l2 2-2 2M15.75 4.75h-3.5M13.75 2.75l-2 2 2 2"/>' },
  'combine-docs': { hue: 'amber', d: '<rect class="p" x="2.75" y="2.75" width="7.5" height="9.5" rx="1.5"/><rect class="p" x="13.75" y="2.75" width="7.5" height="9.5" rx="1.5"/><path class="a" d="M6.5 12.25c0 3.5 5.5 3 5.5 6.5M17.5 12.25c0 3.5-5.5 3-5.5 6.5M9.75 19l2.25 2.25L14.25 19"/>' },
  'show-comments': { hue: 'amber', d: '<path class="f a" d="M4.75 2.75h10.5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9.5l-3.75 2.75v-2.75h-1a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z"/><path d="M19.75 8.75a1.5 1.5 0 0 1 1.5 1.5v6a2 2 0 0 1-2 2h-1v2.75l-3.75-2.75H10.5a2 2 0 0 1-1.75-1"/>' },
  'restrict-editing': { hue: 'amber', d: page(4.75, 2.75, 12.5, 16.5, 4) + '<rect class="f a" x="12.75" y="14.25" width="8.5" height="7" rx="1.5"/><path class="a" d="M14.75 14.25v-1.5a2 2 0 0 1 4 0v1.5"/>' },
  'zoom-actual': { hue: 'gray', d: '<circle class="p" cx="10.25" cy="10.25" r="7"/><path class="a" d="M15.25 15.25l5.75 5.75"/><path d="M7.75 8.5l1.25-.75v5.25M12.5 8.75v.05M12.5 12.25v.05"/>' },
  'view-split': { hue: 'gray', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="a" d="M2.75 12h18.5" stroke-width="1.75"/><path d="M6 7.5h9M6 15.75h9" stroke-opacity=".45"/>' },
  'nav-pane': { hue: 'gray', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M4.75 3.75H9.5v16.5H4.75a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2z"/><path d="M4.75 8h2.75M4.75 11h2.75M4.75 14h2.75"/>' },
  // ---------------------------------------------------------------- presentation
  'add-keyframe': { hue: 'amber', d: '<rect x="2.75" y="4.75" width="15.5" height="11" rx="1.5" stroke-dasharray="2.25 2"/>' + hex(10.5, 10.25, 3, 'a') + plus(17.75, 17.5) },
  'shape-styles': { hue: 'purple', d: '<rect class="f a" x="2.75" y="2.75" width="8" height="8" rx="1.5"/><rect class="p" x="13.25" y="2.75" width="8" height="8" rx="1.5" stroke-width="2.25"/><rect class="p a" x="2.75" y="13.25" width="8" height="8" rx="1.5" stroke-dasharray="2 1.75"/><circle class="s" cx="17.25" cy="17.25" r="4"/>' },
  'selection-pane': { hue: 'gray', d: '<path class="p" d="M12 3.25l9 4.5-9 4.5-9-4.5z"/><path class="a" d="M3 12l9 4.5 9-4.5M3 16.25l9 4.5 9-4.5"/>' },
  'present-current': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="12.5" rx="2"/><path d="M12 16.25v4M8.5 20.75h7"/><path class="f a" d="M11.25 7.25v5.5l4.5-2.75z"/><path class="a" d="M7.25 7.25v5.5"/>' },
  'presenter-view': { hue: 'amber', d: '<rect class="p" x="2.75" y="5.75" width="10.5" height="8" rx="1.5"/><rect class="p" x="15.25" y="5.75" width="6" height="8" rx="1.5"/><path class="f a" d="M6.75 7.75v4l3.25-2z"/><path d="M5.5 16.5v3.75M18.25 16.5v3.75M3 20.25h18"/>' },
  'custom-show-menu': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.25" width="7" height="5" rx="1"/><rect class="p" x="2.75" y="10.25" width="7" height="5" rx="1"/><rect class="p" x="2.75" y="17.25" width="7" height="3.5" rx="1"/><path class="f a" d="M13.75 7.25v9.5l7.5-4.75z"/>' },
  'set-up-show': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="14.5" height="10.5" rx="1.75"/><path d="M10 14.25v3.5M6.5 18.25h4.5"/><circle class="p" cx="17.75" cy="17.25" r="2"/><path class="a" d="M17.75 12.75v1.25M17.75 20.5v1.25M13.25 17.25h1.25M21 17.25h1.25M14.6 14.1l.9.9M20 19.5l.9.9M14.6 20.4l.9-.9M20 15l.9-.9"/>' },
  'canvas-show-options': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="12.5" rx="2"/><path d="M12 16.25v4M8.5 20.75h7"/><path class="a" d="M5.5 13c2.5 0 2.75-6 6-6s3.5 4 7 4" stroke-dasharray="2 1.75"/>' + hex(17.5, 7.5, 1.9, 'f a') },
  'rehearse-timings': { hue: 'amber', d: '<circle class="p" cx="12" cy="13.25" r="8"/><path d="M9.5 2.75h5M12 2.75v2.5M18.75 6.5l1.5-1.5"/><path class="a" d="M12 13.25V8.5M12 13.25l3 2"/>' },
  'record-show': { hue: 'red', d: '<circle class="p" cx="12" cy="12" r="9.25"/><circle class="s" cx="12" cy="12" r="4.75"/>' },
  'clear-show-menu': { hue: 'red', d: '<path class="f a" d="M13.25 3.75l7 7-8 8-7-7z"/><path class="p" d="M5.25 11.75l7 7-1.75 1.75H7.25L3.5 16.75a1.5 1.5 0 0 1 0-2.25z"/><path d="M12.5 20.5h8.75"/>' },
  'slides-view-normal': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M4.75 3.75H8.5v16.5H4.75a2 2 0 0 1-2-2V5.75a2 2 0 0 1 2-2z"/><rect x="10.75" y="7" width="8" height="6" rx="1"/><path d="M10.75 16.5h8"/>' },
  'view-sorter': { hue: 'amber', d: '<rect class="p" x="2.75" y="4.75" width="8" height="6" rx="1.25"/><rect class="p a" x="13.25" y="4.75" width="8" height="6" rx="1.25"/><rect class="p" x="2.75" y="13.25" width="8" height="6" rx="1.25"/><rect class="p" x="13.25" y="13.25" width="8" height="6" rx="1.25"/>' },
  'view-outline': { hue: 'amber', d: '<rect class="f a" x="2.75" y="3.75" width="5" height="3.5" rx=".75"/><path d="M10.25 5.5h11M10.25 10.75h11M13.25 15.25h8M13.25 19.75h8"/><rect class="f a" x="2.75" y="9" width="5" height="3.5" rx=".75"/><path d="M5.25 12.5v7.25h4"/>' },
  'view-notes-page': { hue: 'amber', d: '<rect class="p" x="4.25" y="2.75" width="15.5" height="18.5" rx="2"/><rect class="f a" x="6.75" y="5.25" width="10.5" height="6.5" rx="1"/><path d="M7 14.75h10M7 17.75h7"/>' },
  'reading-view': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="14.5" rx="2"/><path class="a" d="M5.75 11s2.25-4 6.25-4 6.25 4 6.25 4-2.25 4-6.25 4-6.25-4-6.25-4z"/><circle class="s" cx="12" cy="11" r="1.75"/><path d="M8.5 21.25h7"/>' },
  'view-notes': { hue: 'amber', d: '<rect class="p" x="2.75" y="2.75" width="18.5" height="11" rx="2"/><path class="f a" d="M2.75 16.25h18.5v3a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2z"/><path d="M5.5 18.75h8"/>' },
  'slide-master': { hue: 'amber', d: '<rect class="p" x="2.75" y="2.75" width="13" height="9" rx="1.5"/><path class="f a" d="M4.25 2.75h10a1.5 1.5 0 0 1 1.5 1.5v2H2.75v-2a1.5 1.5 0 0 1 1.5-1.5z"/><rect class="p" x="9.25" y="14.25" width="5.5" height="4" rx=".75"/><rect class="p" x="16" y="14.25" width="5.5" height="4" rx=".75"/><path d="M9.25 11.75v1M12 12.75v1.5M18.75 11.75v2.5"/>' },
  'edit-layouts': { hue: 'amber', d: slide(2.75, 3.75, 16.5, 12.5) + '<path d="M5.25 6.75h11.5M5.25 9.75h5.5v4h-5.5z"/><path class="f a" d="M13.25 21.25l.75-3.25 5.5-5.5 2.5 2.5-5.5 5.5z"/>' },
  'slide-templates': { hue: 'amber', d: slide(2.75, 3.75, 18.5, 13) + '<path class="f a" d="M2.75 12.75h18.5v2.5a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2z"/><path d="M6 7.25h8M6 9.75h5"/><circle class="s" cx="7" cy="20.5" r="1.25"/><circle class="s" cx="12" cy="20.5" r="1.25"/><circle class="s" cx="17" cy="20.5" r="1.25"/>' },
  'compare-slides': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.25" width="10" height="7" rx="1.25"/><rect class="p" x="11.25" y="13.75" width="10" height="7" rx="1.25"/><path class="a" d="M16.25 5.25v4.5M14.25 7.75l2 2 2-2M7.75 18.75v-4.5M5.75 16.25l2-2 2 2"/>' },
  'format-background': { hue: 'amber', d: slide(2.75, 3.75, 18.5, 13) + '<path class="f a" d="M6.5 10.25l4-4 5 5-4 4z"/><path class="a" d="M18.25 12.25s1.5 1.75 1.5 2.75a1.5 1.5 0 0 1-3 0c0-1 1.5-2.75 1.5-2.75z"/><path d="M8 20.25h8"/>' },
  'canvas-background': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2" stroke-dasharray="2.5 2"/><path class="a" d="M7 8v0M12 8v0M17 8v0M7 12v0M12 12v0M17 12v0M7 16v0M12 16v0M17 16v0" stroke-width="2"/>' },
  'animation-preview': { hue: 'amber', d: '<path class="f a" d="M10 2.75l1.9 3.85 4.25.6-3.1 3 .75 4.25L10 12.45l-3.8 2 .75-4.25-3.1-3 4.25-.6z"/><path d="M14.75 14.25v7l5.75-3.5z"/>' },
  'animation-pane': { hue: 'amber', d: '<rect class="p" x="2.75" y="3.75" width="18.5" height="16.5" rx="2"/><path class="f a" d="M7 7l.9 1.8 2 .3-1.45 1.4.35 2L7 11.55l-1.8.95.35-2-1.45-1.4 2-.3z"/><path d="M12.25 9h6M5.5 15.5h13M5.5 18h9"/>' },
  'animation-painter': { hue: 'amber', d: '<rect class="f a" x="2.75" y="7.75" width="12.5" height="4.5" rx="1.25"/><path d="M15.25 10h1a1.25 1.25 0 0 1 1.25 1.25v2a1.25 1.25 0 0 1-1.25 1.25H10a1 1 0 0 0-1 1v1.25"/><rect x="7.5" y="16.75" width="3" height="4.5" rx=".75"/><path class="a" d="M18.75 2.5l.75 1.5 1.5.25-1.1 1 .3 1.5-1.45-.75-1.4.75.25-1.5-1.1-1 1.55-.25z"/>' },
  // ---------------------------------------------------------------- design
  'connector-tool': { hue: 'purple', d: '<circle class="s" cx="5" cy="19" r="2"/><circle class="p" cx="19" cy="5" r="2"/><path class="a" d="M6.5 17.5l9.5-9.5M11.25 8h4.75v4.75"/>' },
  'connector-elbow-tool': { hue: 'purple', d: '<circle class="s" cx="4.5" cy="19.5" r="2"/><circle class="p" cx="19.5" cy="4.5" r="2"/><path class="a" d="M6.5 19.5h5.5V4.5h5M14.75 2.25l2.25 2.25-2.25 2.25"/>' },
  'catalytic-cycle': { hue: 'purple', d: '<path d="M12 3.75a8.25 8.25 0 0 1 8.25 8.25M20.25 12A8.25 8.25 0 0 1 12 20.25M12 20.25A8.25 8.25 0 0 1 3.75 12M3.75 12A8.25 8.25 0 0 1 12 3.75"/><path class="a" d="M18.25 9.75l2 2.25 2-2.25M14.25 18.25l-2.25 2 2.25 2M5.75 14.25l-2-2.25-2 2.25M9.75 5.75L12 3.75 9.75 1.75"/>' },
  'energy-diagram': { hue: 'purple', d: '<path d="M3.25 3.25v17.5h17.5" stroke-width="1.25"/><path class="a" d="M5.5 16.5h3M10.5 6.5h3M15.5 12.5h3" stroke-width="2.25"/><path d="M8.5 16.5l2-10M13.5 6.5l2 6" stroke-dasharray="1.5 1.5" stroke-width="1.1"/>' },
  'export-pdf': { hue: 'red', d: page(3.75, 2.75, 13.5, 18.5, 4) + '<path d="M6.75 11.5h5M6.75 14.5h3.5" stroke-opacity=".5"/><circle class="s" cx="17" cy="17" r="4.75"/><path class="k" d="M17 14.5v4.5M15 17.25l2 2 2-2"/>' },
  'export-picture': { hue: 'teal', d: '<rect class="p" x="2.75" y="3.75" width="15.5" height="13.5" rx="2"/><path d="M2.75 14l4.5-4.5 3.5 3.5 2-2 5.5 5.5"/><circle class="s" cx="17" cy="17" r="4.75"/><path class="k" d="M17 14.5v4.5M15 17.25l2 2 2-2"/>' },
  preflight: { hue: 'green', d: page(3.75, 2.75, 13.5, 18.5, 4) + '<path d="M6.75 11h7.5M6.75 14h4.5" stroke-opacity=".5"/><circle class="s" cx="17" cy="17" r="4.75"/><path class="k" d="M14.75 17l1.5 1.5 3-3"/>' },
};

/** An icon from the set as an SVG element's markup, at the given size in pixels. */
export function iconSvg(name: string, size = 24): string | undefined {
  const ic = ICON_SET[name];
  if (!ic) return undefined;
  return `<svg class="ci-ic" data-hue="${ic.hue}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${ic.d}</svg>`;
}

/**
 * Which drawing each ribbon button shows, by its command: "sh:" for a Spreadsheet command
 * (data-sh), "doc:" for a Document one (data-doc), "tr:" and "an:" for the transition and
 * animation buttons, and the plain name for the others (data-cmd). A command not listed here
 * uses the drawing of the same name, if there is one.
 */
export const ICON_FOR: Record<string, string> = {
  'draw-structure': 'structure', 'insert-structure': 'structure', 'structure-from-name-doc': 'structure-from-name',
  'insert-picture': 'picture', 'insert-picture-sheet': 'picture', 'insert-table': 'table', 'insert-chart': 'chart', 'dash-add-chart': 'chart',
  'insert-shapes': 'shapes', 'slide-shapes': 'shapes', 'design-shapes': 'shapes', 'insert-icons': 'icons', 'slide-icons': 'icons', 'design-icons': 'icons',
  'insert-text-box': 'text-box', 'insert-symbol': 'symbol', 'insert-diagram': 'diagram', 'insert-equation': 'equation', 'insert-link': 'link',
  'insert-video': 'video', 'insert-audio': 'audio', 'sh:view-normal': 'sheet-view-normal', 'view-normal': 'slides-view-normal',
  'sheet-new-window': 'new-window', 'doc-new-window': 'new-window', 'table-styles': 'table-style', 'new-comment': 'comment',
  'spelling-grammar': 'spelling', 'check-accessibility': 'accessibility', 'design-size': 'page-size', 'shape-front': 'bring-front', 'shape-back': 'send-back',
  'rotate-dialog': 'rotate-by', 'duplicate-slide': 'duplicate-slide', 'tr:preview': 'animation-preview', 'an:preview': 'animation-preview',
  'an:pane': 'animation-pane', 'an:painter': 'animation-painter', 'structure-from-name': 'structure-from-name',
};

/** The drawing for a button, from its data-sh, data-doc, data-tr, data-an or data-cmd. */
export function iconForButton(b: HTMLElement): string | undefined {
  const d = b.dataset;
  const keys = d.sh ? ['sh:' + d.sh, d.sh] : d.doc ? ['doc:' + d.doc, d.doc] : d.tr ? ['tr:' + d.tr] : d.an ? ['an:' + d.an] : d.cmd ? [d.cmd] : [];
  for (const k of keys) {
    const n = ICON_FOR[k] ?? k;
    if (ICON_SET[n]) return n;
  }
  return undefined;
}

/**
 * Put the set's drawings on the ribbons: in each large button's picture, and on the small
 * buttons that show a picture (in place of the one they had). Buttons without a drawing in the
 * set keep what they had.
 */
export function applyIconSet(root: ParentNode = document): void {
  for (const b of root.querySelectorAll<HTMLElement>('.ribbon button')) {
    const n = iconForButton(b);
    if (!n) continue;
    const big = b.querySelector<HTMLElement>(':scope > .rb-icon');
    if (big) {
      if (big.dataset.set !== n) { big.innerHTML = iconSvg(n, 24)!; big.dataset.set = n; }
      continue;
    }
    const lead = b.querySelector<HTMLElement>(':scope > .rb-lead');
    if (lead) { lead.innerHTML = iconSvg(n, 16)!; continue; }
    const pic = b.querySelector<SVGElement>(':scope > svg.fp-icon');
    if (pic) { pic.outerHTML = iconSvg(n, 16)!.replace('class="ci-ic"', 'class="ci-ic fp-icon"'); continue; }
    if (b.classList.contains('rb-iconbtn') && b.dataset.set !== n) { b.innerHTML = iconSvg(n, 16)!; b.dataset.set = n; }
  }
}

/** The looks the set can be shown in (Settings > Appearance > Icons). */
export type IconLook = 'accent' | 'colour' | 'mono';
export const ICON_LOOKS: readonly IconLook[] = ['accent', 'colour', 'mono'];
export function setIconLook(look: IconLook): void {
  document.documentElement.dataset.icons = look;
}
