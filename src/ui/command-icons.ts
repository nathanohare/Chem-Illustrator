// Icons for menu commands on toolbox buttons (24×24 SVG in the current text colour, like the
// drawing tools). Drawn for this app in the usual style for these commands; a command without
// one shows its name instead.

import { ICONS } from '../icons';

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** A flat-sided hexagon centred at (cx, cy). */
function hex(cx: number, cy: number, r: number, extra = ''): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}"${extra}/>`;
}

const filled = (opacity = 0.35) => ` fill="currentColor" fill-opacity="${opacity}"`;
const txt = (x: number, y: number, s: string, size = 8, weight = 600) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" font-family="system-ui, sans-serif" fill="currentColor" stroke="none" text-anchor="middle">${s}</text>`;

export const COMMAND_ICONS: Record<string, string> = {
  // ---- the Canvas ribbon (drawn for this app)
  'smart-scheme': svg('<rect x="2" y="8" width="6" height="8" stroke-dasharray="2 1.6"/><rect x="16" y="8" width="6" height="8" stroke-dasharray="2 1.6"/><path d="M9.5 12h5"/><path d="M13 10l2 2-2 2"/>'),
  'convert-smart-scheme': svg('<rect x="2.5" y="8.5" width="5" height="7" stroke-dasharray="2 1.6"/><rect x="16.5" y="8.5" width="5" height="7" stroke-dasharray="2 1.6"/><path d="M9 12h6M13 10l2 2-2 2"/><path d="M19 2.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/>'),
  'stoichiometry-table': svg('<rect x="3" y="4" width="18" height="16"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16" stroke-width="1.1"/>'),
  'check-balance': svg('<path d="M12 4v16M6 20h12M4 8h16"/><path d="M4 8l-2 6h4zM20 8l-2 6h4z"/>'),
  'mo-diagram': svg('<path d="M3 7h5M3 17h5M16 5h5M16 12h5M16 19h5" stroke-width="2"/><path d="M8 7l8-2M8 7l8 5M8 17l8 2M8 17l8-5" stroke-width="1" stroke-dasharray="1.5 1.5"/>'),
  'orbital': svg('<ellipse cx="12" cy="7" rx="3.5" ry="5"/><ellipse cx="12" cy="17" rx="3.5" ry="5" fill="currentColor" fill-opacity=".3"/>'),
  'ts-brackets': svg('<path d="M7 5H4v15h3M14 5h3v15h-3"/><path d="M20.5 1.5v8M18.3 3.6h4.4M18.3 6.8h4.4" stroke-width="1.3"/>'),
  'check-arrows': svg('<path d="M3 15A7 7 0 0 1 16 11"/><path d="M16 14l.4-3.6-3.4.6"/><path d="M14 18l2.5 2.5 5-5"/>'),
  'draw-from-arrows': svg('<path d="M3 9A6 6 0 0 1 14 7"/><path d="M14 10l.3-3.3-3.2.6"/><polyline points="8,20 11,15 15,20 18,15"/>'),
  'homolysis-arrows': svg('<path d="M8 12h8" stroke-width="2"/><path d="M12 12a5 5 0 0 0-8-4"/><path d="M12 12a5 5 0 0 1 8-4"/><path d="M4 8.2l2.4-.2M20 8.2l-2.4-.2" />'),
  'model-3d': svg('<circle cx="7" cy="15" r="3.2"/><circle cx="17" cy="7" r="2.6" fill="currentColor" fill-opacity=".35"/><circle cx="17.5" cy="17.5" r="2"/><path d="M9.6 13.2l5.3-4.2M10 16l5.6 1"/>'),
  'tlc-plate': svg('<rect x="6" y="2.5" width="12" height="19"/><path d="M6 18h12" stroke-dasharray="1.5 1.3"/><circle cx="10" cy="13" r="1.4" fill="currentColor"/><circle cx="14" cy="7" r="1.4" fill="currentColor"/>'),
  'rgroup-table': svg('<rect x="3" y="5" width="18" height="14"/><path d="M3 10h18M10 5v14" stroke-width="1.1"/><text x="6.5" y="9" font-size="5" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">R</text>'),
  'insert-table': svg('<rect x="3" y="5" width="18" height="14"/><path d="M3 10h18M9 5v14"/>'),
  'arrow-shape-u': svg('<path d="M5 18V10a7 7 0 0 1 14 0v4"/><path d="M19 19l-2.9-5.4h5.8z" fill="currentColor" stroke="none"/>'),
  'arrow-shape-loop': svg('<path d="M4 18c0-9 14-12 14-4 0 4-6 4-6 0 0-3 4-5 8-3"/><path d="M21 12.8l-4.3-.5 2.4-4z" fill="currentColor" stroke="none"/>'),
  'flip-arrow-bend': svg('<path d="M4 9a8 8 0 0 1 16 0" /><path d="M4 15a8 8 0 0 0 16 0" stroke-dasharray="2 1.6"/><path d="M12 10v4M10.5 12.5L12 14l1.5-1.5"/>'),
  'arrow-reverse': svg('<path d="M4 15a8 8 0 0 1 16 0"/><path d="M4 18.5l-2.9-5.4h5.8z" fill="currentColor" stroke="none"/><path d="M9 4h6M13 2l2 2-2 2" stroke-width="1.3"/>'),
  'arrow-smooth-path': svg('<path d="M3 17c4-12 14-12 18 0"/><circle cx="12" cy="8" r="1.6" fill="currentColor" stroke="none"/>'),
  'arrow-simplify-path': svg('<path d="M3 17l4-7 3 4 4-8 3 5 4 6" stroke-dasharray="1.6 1.6" opacity=".55"/><path d="M3 17c5-12 13-12 18 0"/>'),
  'arrow-add-bend': svg('<path d="M3 17c4-10 14-10 18 0"/><circle cx="12" cy="9.5" r="2.2"/><path d="M18 2v5M15.5 4.5h5"/>'),
  'arrow-remove-bend': svg('<path d="M3 17c4-10 14-10 18 0"/><circle cx="12" cy="9.5" r="2.2"/><path d="M15.5 4.5h5"/>'),
  'attach-arrow': svg('<circle cx="6" cy="17" r="3"/><path d="M8 14.5A9 9 0 0 1 20 8"/><path d="M20 4.5l1 4.6-4.6.7"/>'),
  'detach-arrow': svg('<circle cx="6" cy="17" r="3"/><path d="M10 12.5A9 9 0 0 1 20 8"/><path d="M20 4.5l1 4.6-4.6.7"/><path d="M7.5 10l2.5 2.5M10 10l-2.5 2.5" stroke-width="1.3"/>'),
  'conformer-search': svg('<path d="M2 14l4-4 5 2 4-4 5 2" /><path d="M6 10v-4M15 8v-5M11 12v5M20 10v5" stroke-width="1.2"/>'),
  'turn-3d': svg('<ellipse cx="12" cy="12" rx="9" ry="4"/><path d="M12 3v18" stroke-dasharray="2 1.6"/><path d="M19 9.5l2 2.5-3 .5"/>'),
  'map-atoms': svg('<polygon points="6,5 9.5,7 9.5,11 6,13 2.5,11 2.5,7"/><polygon points="18,11 21.5,13 21.5,17 18,19 14.5,17 14.5,13"/><path d="M9.5 7Q15 5 18 11" stroke-dasharray="2 1.6"/><circle cx="9.5" cy="7" r="1.3" fill="currentColor"/><circle cx="18" cy="11" r="1.3" fill="currentColor"/>'),
  'animate-reaction': svg('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><polygon points="10,8.5 16,12 10,15.5" fill="currentColor"/>'),
  'import-picture': svg('<rect x="2.5" y="4.5" width="11" height="9" rx="1"/><path d="M4 12l3-3 2 2 2-2 2 3" /><path d="M15 15l2.5 2.5L22 13" stroke-linecap="round"/>'),
  'sequence-to-structure': svg('<text x="12" y="10" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" font-family="ui-monospace,monospace">GAV</text><path d="M4 15l3 3 3-3 3 3 3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'),
  'structure-to-name': svg('<polygon points="7,4 11,6.3 11,10.7 7,13 3,10.7 3,6.3"/><path d="M13 9h3l-1.5-1.5M16 9l-1.5 1.5" stroke-linecap="round"/><path d="M3 17h18M3 20.5h12" stroke-linecap="round"/>'),
  'find-cas': svg('<text x="12" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" font-family="system-ui">CAS</text>'),
  'pubchem-lookup': svg('<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5l6 6" stroke-linecap="round"/><polygon points="10,7 12.6,8.5 12.6,11.5 10,13 7.4,11.5 7.4,8.5" stroke-width="1.1"/>'),
  'knowledge-base': svg('<path d="M12 6C9 4 5 4 3 5v14c2-1 6-1 9 1 3-2 7-2 9-1V5c-2-1-6-1-9 1z"/><path d="M12 6v14"/>'),
  'compound-library': svg('<rect x="3" y="4" width="4" height="16"/><rect x="8.5" y="4" width="4" height="16"/><path d="M14.5 5.5l3.8-1 3.2 14.6-3.8 1z"/>'),
  'torsion-chart': svg('<path d="M3 20h18M3 4v16" stroke-width="1.2"/><path d="M4 9c2 9 4 9 6 0s4-9 6 0 3 6 5 4"/>'),
  'newman-projection': svg('<circle cx="12" cy="12" r="6"/><path d="M12 12V3M12 12l-7.8 4.5M12 12l7.8 4.5"/><path d="M12 6l0 0M6.8 9l-4.3-2.5M17.2 9l4.3-2.5M12 18v3.5" />'),
  'crystal-structure': svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" stroke-dasharray="1.6 1.6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
  'ligand-library': svg('<rect x="3" y="4" width="4" height="16"/><rect x="8.5" y="4" width="4" height="16"/><circle cx="18" cy="9" r="2.4"/><path d="M18 11.4v3M15.5 17.5l2.5-3 2.5 3"/>'),
  'arrow-single-curve': svg('<path d="M4 17A8 8 0 0 1 20 16"/><path d="M20 19.5l-2.9-5.6h5.8z" fill="currentColor" stroke="none"/>'),
  'arrow-s-shape': svg('<path d="M3 16C4.5 6 10.5 6 12 12S19.6 19 20 10.6"/><path d="M20 5l2.9 5.6h-5.8z" fill="currentColor" stroke="none"/>'),
  'clean-up-arrow': svg('<path d="M3 18A8 8 0 0 1 17 12"/><path d="M17 15.5l.2-4.5-4.2 1" /><path d="M19 2.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" stroke="none"/>'),
  // ---- object: align (the line is the edge or centre they line up on)
  'align-left': svg('<line x1="4" y1="3" x2="4" y2="21"/><rect x="6" y="6" width="13" height="4"/><rect x="6" y="14" width="8" height="4"/>'),
  'align-hcenter': svg('<line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 2"/><rect x="5" y="6" width="14" height="4"/><rect x="8" y="14" width="8" height="4"/>'),
  'align-right': svg('<line x1="20" y1="3" x2="20" y2="21"/><rect x="5" y="6" width="13" height="4"/><rect x="10" y="14" width="8" height="4"/>'),
  'align-top': svg('<line x1="3" y1="4" x2="21" y2="4"/><rect x="6" y="6" width="4" height="13"/><rect x="14" y="6" width="4" height="8"/>'),
  'align-vcenter': svg('<line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2"/><rect x="6" y="5" width="4" height="14"/><rect x="14" y="8" width="4" height="8"/>'),
  'align-bottom': svg('<line x1="3" y1="20" x2="21" y2="20"/><rect x="6" y="5" width="4" height="13"/><rect x="14" y="10" width="4" height="8"/>'),
  // ---- object: spread out evenly
  'distribute-h': svg('<line x1="3" y1="4" x2="3" y2="20"/><line x1="21" y1="4" x2="21" y2="20"/><rect x="6" y="8" width="3" height="8"/><rect x="10.5" y="8" width="3" height="8"/><rect x="15" y="8" width="3" height="8"/>'),
  'arrange-row': svg('<rect x="2" y="9" width="5" height="6"/><rect x="9.5" y="9" width="5" height="6"/><rect x="17" y="9" width="5" height="6"/>'),
  'arrange-column': svg('<rect x="9" y="2" width="6" height="5"/><rect x="9" y="9.5" width="6" height="5"/><rect x="9" y="17" width="6" height="5"/>'),
  'arrange-grid': svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  'distribute-v': svg('<line x1="4" y1="3" x2="20" y2="3"/><line x1="4" y1="21" x2="20" y2="21"/><rect x="8" y="6" width="8" height="3"/><rect x="8" y="10.5" width="8" height="3"/><rect x="8" y="15" width="8" height="3"/>'),
  // ---- object: flip and turn
  'flip-h': svg('<line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 2"/><path d="M10 6v12L4 18z"' + filled() + '/><path d="M14 6v12l6 0z"/>'),
  'flip-v': svg('<line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2"/><path d="M6 10h12L18 4z"' + filled() + '/><path d="M6 14h12l0 6z"/>'),
  'rotate-cw': svg('<path d="M18.5 12.5a6.5 6.5 0 1 1-2.2-5"/><path d="M17 3.5v4h-4"/>'),
  'rotate-ccw': svg('<path d="M5.5 12.5a6.5 6.5 0 1 0 2.2-5"/><path d="M7 3.5v4h4"/>'),
  'rotate-180': svg('<path d="M5 12a7 7 0 0 1 14 0"/><path d="M15.5 11.5L19 12l.6-3.6"/><path d="M8 17h8" stroke-dasharray="2 2"/>'),
  // ---- object: front and back
  'shape-front': svg('<rect x="3.5" y="3.5" width="11" height="11"/><rect x="9.5" y="9.5" width="11" height="11"' + filled(0.55) + '/>'),
  'shape-back': svg('<rect x="9.5" y="9.5" width="11" height="11"' + filled(0.55) + '/><rect x="3.5" y="3.5" width="11" height="11" fill="var(--panel, #fff)"/>'),
  'shape-forward': svg('<rect x="3.5" y="3.5" width="11" height="11"/><rect x="9.5" y="9.5" width="11" height="11"' + filled(0.25) + '/><path d="M15 2.5v4M13 4.5l2-2 2 2"/>'),
  'shape-backward': svg('<rect x="9.5" y="9.5" width="11" height="11"' + filled(0.25) + '/><rect x="3.5" y="3.5" width="11" height="11" fill="var(--panel, #fff)"/><path d="M19 2.5v4M17 4.5l2 2 2-2"/>'),
  group: svg('<rect x="3" y="3" width="18" height="18" stroke-dasharray="2.5 2"/><rect x="6" y="6" width="6" height="6"/><circle cx="15" cy="15" r="3"/>'),
  ungroup: svg('<rect x="3" y="3" width="8" height="8" stroke-dasharray="2.5 2"/><rect x="13" y="13" width="8" height="8" stroke-dasharray="2.5 2"/>'),
  scale: svg('<rect x="3" y="11" width="10" height="10"/><path d="M8 3h13v13" stroke-dasharray="2 2"/><path d="M12 12l7-7M14 5h5v5"/>'),
  'rotate-dialog': svg('<path d="M18.5 12.5a6.5 6.5 0 1 1-2.2-5"/><path d="M17 3.5v4h-4"/>' + txt(11.5, 15.5, '°', 9)),
  // ---- structure
  'clean-up': svg(hex(10.5, 13, 7) + '<path d="M19 2.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor" stroke="none"/>'),
  // three small layouts to pick from
  'clean-up-options': svg(hex(6.5, 7.5, 4) + hex(17.5, 7.5, 4) + hex(12, 17, 4)),
  // ---- scheme: a cycle of four species with arrows round it; levels over a reaction coordinate
  'catalytic-cycle': svg('<path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5"/><path d="M19.5 12a7.5 7.5 0 0 1-7.5 7.5"/><path d="M12 19.5a7.5 7.5 0 0 1-7.5-7.5"/><path d="M4.5 12a7.5 7.5 0 0 1 7.5-7.5"/><path d="M17.6 9.6l1.9 2.4 1.9-2.4M14.4 17.6l-2.4 1.9 2.4 1.9M6.4 14.4l-1.9-2.4-1.9 2.4M9.6 6.4l2.4-1.9-2.4-1.9"/>'),
  'energy-diagram': svg('<path d="M3 3v18h18" stroke-width="1.2"/><path d="M5 17h3M10 8h3M15 13h3M20 18.5h1.5" stroke-width="2.2"/><path d="M8 17l2-9M13 8l2 5M18 13l2 5.5" stroke-dasharray="1.5 1.5" stroke-width="1"/>'),
  // ---- a diagram: a box over two, joined
  'insert-diagram': svg('<rect x="8" y="2.5" width="8" height="5" rx="1"/><rect x="2.5" y="16.5" width="8" height="5" rx="1"/><rect x="13.5" y="16.5" width="8" height="5" rx="1"/><path d="M12 7.5v4.5M6.5 16.5V12h11v4.5"/>'),
  'add-frame': svg('<rect x="2.5" y="3.5" width="19" height="17" rx="1"/>' + hex(12, 12, 5)),
  'fill-rings': svg(hex(12, 12.5, 8.5, filled(0.4))),
  highlight: svg('<path d="M3 15.5L13 5.5" stroke-width="7" stroke-opacity="0.35"/><path d="M3 15.5L13 5.5"/><path d="M13 5.5l7 4"/>'),
  'remove-highlight': svg('<path d="M3 15.5L13 5.5" stroke-width="7" stroke-opacity="0.35"/><path d="M3 15.5L13 5.5"/><path d="M15 15l6 6M21 15l-6 6"/>'),
  'chain-ends': svg('<polyline points="2,16 6,12 10,16"/>' + txt(17, 15.5, 'Me', 8.5)),
  'explicit-h': svg('<line x1="3" y1="18" x2="10" y2="11"/>' + txt(15, 11, 'H', 10)),
  'aromatic-circles': svg(hex(12, 12.5, 8.5) + '<circle cx="12" cy="12.5" r="4.6"/>'),
  'stereo-labels': svg(txt(12, 15.5, 'R/S', 9, 700)),
  'enhanced-stereo': svg(txt(12, 15.5, '&amp;1', 9, 700)),
  'contract-label': svg('<polyline points="2,15 5.5,11 9,15 12.5,11"/><path d="M14 13h4"/><path d="M16.5 11l2 2-2 2"/>' + txt(21, 9.5, 'R', 7)),
  'expand-label': svg(txt(4.5, 9.5, 'R', 7) + '<path d="M3 13h4"/><path d="M5.5 11l2 2-2 2"/><polyline points="10,15 13.5,11 17,15 20.5,11"/>'),
  'expand-label-full': svg(txt(4.5, 9.5, 'R', 7) + '<path d="M3 13h4"/><path d="M5.5 11l2 2-2 2"/><polyline points="10,12 13.5,8 17,12 20.5,8"/><polyline points="10,18 13.5,14 17,18 20.5,14"/>'),
  'hapto-bond': svg('<polygon points="5,6 12,3.5 19,6 16.5,9 7.5,9"/><path d="M12 6.5V17"/>' + txt(12, 22.5, 'M', 7, 700)),
  'name-to-structure': svg(txt(6.5, 9, 'abc', 7) + '<path d="M6 11v4M4.5 13.5L6 15l1.5-1.5"/>' + hex(15.5, 15, 5)),
  'check-structure': svg(hex(11, 12.5, 8) + '<path d="M14.5 17.5l2.5 2.5 5-6"/>'),
  'periodic-table': ICONS.element ?? svg(txt(12, 15, 'Pt', 9)),
  // ---- text tied under a structure
  'add-id-label': svg(hex(12, 7, 5) + txt(12, 22, '1', 10.5, 800)),
  'add-caption': svg(hex(12, 7, 5) + '<path d="M4 16.5h16M6.5 20.5h11"/>'),
  'attach-descriptors': svg(hex(12, 7, 5) + txt(12, 21.5, 'MW', 8.5, 700)),
  'number-compounds': svg(hex(6.5, 7, 4.2) + hex(17.5, 7, 4.2) + txt(6.5, 21.5, '1', 9, 800) + txt(17.5, 21.5, '2', 9, 800)),
  'clean-up-reaction': svg('<path d="M3 12h14"/><path d="M14 9l3 3-3 3"/><path d="M19.5 3.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z" fill="currentColor" stroke="none"/>'),
  // ---- file, edit and view (the quick bar beside the menus)
  new: svg('<path d="M6 2.5h8l4 4v15H6z"/><path d="M14 2.5v4h4"/><path d="M12 11v7M8.5 14.5h7"/>'),
  open: svg('<path d="M2.5 6.5v13h16l3-9H7l-2.5 9"/><path d="M2.5 6.5V4.5h6l2 2h7v4"/>'),
  save: svg('<path d="M4 3.5h13l3 3v14H4z"/><path d="M7.5 3.5v5h8v-5"/><rect x="7.5" y="13" width="9" height="7.5"/>'),
  'save-as': svg('<path d="M14 20.5H4v-17h13l3 3v4"/><path d="M7.5 3.5v5h8v-5"/><path d="M7.5 20.5V13h5"/><path d="M14.5 21.5l.6-2.6 5.3-5.3 2 2-5.3 5.3z"/>'),
  print: svg('<path d="M6.5 9V3.5h11V9"/><rect x="3" y="9" width="18" height="8" rx="1"/><path d="M6.5 14.5h11v6h-11z"/>'),
  undo: svg('<path d="M9 5L4 10l5 5"/><path d="M4 10h10a6 6 0 0 1 0 12h-3"/>'),
  redo: svg('<path d="M15 5l5 5-5 5"/><path d="M20 10H10a6 6 0 0 0 0 12h3"/>'),
  cut: svg('<circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><path d="M8.6 15.3L18 3.5M15.4 15.3L6 3.5"/>'),
  copy: svg('<rect x="8" y="8" width="12.5" height="13" rx="1"/><path d="M16 8V3.5H3.5V17H8"/>'),
  paste: svg('<rect x="4" y="4.5" width="16" height="17" rx="1"/><path d="M9 4.5V2.5h6v2M8.5 6.5h7"/>'),
  'zoom-fit': svg('<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>' + hex(12, 12, 4.5)),
  'focus-view': svg('<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/><path d="M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6"/>'),
  find: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5l5 5"/>'),
  'ungroup-smart-scheme': svg('<rect x="2" y="8" width="6" height="8" stroke-dasharray="2 1.6"/><rect x="16" y="8" width="6" height="8" stroke-dasharray="2 1.6"/><path d="M10.5 12h3M11.2 10l-1.7 2 1.7 2M12.8 10l1.7 2-1.7 2"/>'),
  'arrange-scheme': svg('<rect x="2" y="4" width="5" height="5"/><rect x="17" y="4" width="5" height="5"/><rect x="2" y="15" width="5" height="5"/><rect x="17" y="15" width="5" height="5"/><path d="M8.5 6.5h6.5M13.5 5l1.5 1.5L13.5 8M8.5 17.5h6.5M13.5 16l1.5 1.5-1.5 1.5"/>'),
  'scheme-settings': svg('<path d="M3 6h18M3 18h18"/><circle cx="8" cy="6" r="2.2"' + filled() + '/><circle cx="16" cy="18" r="2.2"' + filled() + '/><path d="M6 12h10M14 10l2 2-2 2"/>'),
  'p-orbitals': svg('<path d="M7 12C4.5 9 4.5 3.5 7 3.5S9.5 9 7 12z"' + filled() + '/><path d="M7 12c-2.5 3-2.5 8.5 0 8.5S9.5 15 7 12z"/><path d="M17 12C14.5 9 14.5 3.5 17 3.5S19.5 9 17 12z"' + filled() + '/><path d="M17 12c-2.5 3-2.5 8.5 0 8.5s2.5-5.5 0-8.5z"/>'),
  'copy-torsion-data': svg('<rect x="8" y="8" width="12.5" height="13" rx="1"/><path d="M16 8V3.5H3.5V17H8"/><path d="M10 17c1.2-5 2.4-5 3.6 0s2.4 4 3.6 0" stroke-width="1.2"/>'),
  'unlink-newman': svg('<path d="M9.5 7.5L11 6a3.5 3.5 0 0 1 5 5l-1.5 1.5M14.5 16.5L13 18a3.5 3.5 0 0 1-5-5l1.5-1.5"/><path d="M3 3l3 3M21 21l-3-3M16.5 3v2.5M3 16.5h2.5"/>'),
  'diagram-to-shapes': svg('<rect x="2.5" y="3" width="6" height="6"/><rect x="2.5" y="15" width="6" height="6" stroke-dasharray="2 1.6"/><circle cx="17.5" cy="17.5" r="3.5"/><path d="M11 6h4.5a2 2 0 0 1 2 2v3M15.5 9.5l2 2 2-2"/>'),
  'insert-chart': svg('<path d="M3 3v18h18" stroke-width="1.2"/><rect x="6" y="12" width="3" height="6"/><rect x="11" y="6.5" width="3" height="11.5"/><rect x="16" y="9.5" width="3" height="8.5"/>'),
  gel: svg('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M6 6h3M10.5 6h3M15 6h3" stroke-width="1.2"/><path d="M6 10.5h3M6 16h3M10.5 13h3M15 9.5h3M15 17.5h3" stroke-width="2.2"/>'),
  'flatten-3d': svg('<ellipse cx="12" cy="7" rx="8" ry="3.5" stroke-dasharray="2 1.6"/><path d="M4 19h16" stroke-width="2"/><path d="M12 11.5v4.5M10 14l2 2 2-2"/>'),
  'depth-shading': svg('<path d="M3 18l6-11" stroke-width="2.6"/><path d="M9 7l6 11" stroke-width="2" stroke-opacity=".65"/><path d="M15 18l6-11" stroke-width="1.4" stroke-opacity=".35"/>'),
  'ring-chair': svg('<path d="M1.5 13L7 15.5 14 12 22.5 10 17 7.5 10 11z"/>'),
  'ring-chair-flip': svg('<path d="M1.5 13L7 15.5 14 12 22.5 10 17 7.5 10 11z"/><path d="M5 5a9 9 0 0 1 14 0M17.2 2.8l1.8 2.2-2.7.6M19 19a9 9 0 0 1-14 0M6.8 21.2L5 19l2.7-.6"/>'),
  navigator: svg('<rect x="2.5" y="4" width="19" height="16" rx="1"/><rect x="11" y="11" width="8" height="6.5"' + filled(0.2) + '/><path d="M5 7.5h5M5 10.5h4M5 13.5h3" stroke-width="1.2"/>'),
  'show-stereo': svg(hex(9, 13, 6) + '<path d="M15 4.5h6.5" stroke-width="1.2"/><text x="18.2" y="10" font-size="7" font-style="italic" font-family="serif" text-anchor="middle" fill="currentColor" stroke="none">R</text>'),
  'dark-page': svg('<path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3.5"/>'),
};

// "Edit …" and "… Settings" commands: their object's icon, smaller, with a pencil or sliders at the corner
const inner = (cmd: string) => COMMAND_ICONS[cmd]?.replace(/^<svg[^>]*>|<\/svg>$/g, '') ?? '';
const PENCIL = '<path d="M13.5 22l.7-3.2 6-6 2.5 2.5-6 6zM18.7 14.3l2.5 2.5" stroke-width="1.4"/>';
const SLIDERS = '<path d="M13 16h9.5M13 20.5h9.5" stroke-width="1.3"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/><circle cx="19.5" cy="20.5" r="1.5" fill="currentColor"/>';
const corner = (of: string, mark: string) => svg(`<g transform="scale(.72)">${inner(of)}</g>${mark}`);
for (const [cmd, of] of [['edit-energy', 'energy-diagram'], ['edit-torsion', 'torsion-chart'], ['edit-newman', 'newman-projection'], ['edit-diagram', 'insert-diagram'], ['edit-chart', 'insert-chart'], ['edit-plate', 'tlc-plate'], ['edit-orbital', 'orbital']] as const) COMMAND_ICONS[cmd] ??= corner(of, PENCIL);
COMMAND_ICONS['depth-shading-settings'] ??= corner('depth-shading', SLIDERS);

/** Pictures used on the Canvas ribbon only (the toolboxes show these commands by name, beside others like them). */
export const RIBBON_ONLY_ICONS: Record<string, string> = {
  'centre-highlight': svg('<path d="M3 9h18M3 15h18" stroke-width="1.6"/><path d="M3 12h18" stroke-width="5" stroke-opacity=".3"/>'),
};

/** The icon for a command on a toolbox button, if it has one. */
export function commandIcon(cmd: string): string | undefined {
  return COMMAND_ICONS[cmd];
}
