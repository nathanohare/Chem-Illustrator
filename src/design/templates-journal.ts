// Journal graphics for Design mode: graphical abstracts (Elsevier's 13 × 5 cm unless said),
// TOC graphics (the ACS size) and figures (one or two journal columns). Dashed spots mark where
// structures, schemes and pictures go; arrows are free arrows, so they stay level.

import { type Box, type DesignTemplate, type FreeArrow, type Theme, GREY, THEMES, band, icon, spot, words } from './template-kit';

const T = THEMES;

/** A rounded label with a light fill and a colored outline. */
const badge = (x: number, y: number, w: number, h: number, text: string, size: number, th: Theme): Box =>
  ({ geo: 'roundRect', x, y, w, h, text, size, bold: true, ink: th.dark, fill: th.soft, line: th.dark, lw: 0.6 });

/** A level arrow from x1 to x2 at height y. */
const across = (x1: number, x2: number, y: number, color?: string, width = 1): FreeArrow => [x1, y, x2, y, { width, ...(color ? { color } : {}) }];

// ---------------------------------------------------------------- graphical abstracts (368.5 × 141.7)

const GA_W = 368.5, GA_H = 141.7;

function oneReaction(): DesignTemplate {
  const th = T.navy;
  return {
    id: 'ga-one-reaction', name: 'One reaction', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'A title bar, the reaction with its conditions, and three badges for what makes it useful.',
    boxes: [
      band(0, 0, GA_W, 22, th.dark, { text: 'Title of the work, in a few words', size: 10, bold: true, ink: th.onDark, name: 'Title' }),
      spot(10, 30, 108, 76, 'Starting material', 8),
      words(122, 48, 120, 18, 'catalyst, solvent, rt', 7.5, { ink: th.dark }),
      spot(250, 30, 108, 76, 'Product', 8),
      badge(10, 114, 108, 20, 'Mild conditions', 7.5, th), badge(130, 114, 108, 20, 'Broad scope', 7.5, th), badge(250, 114, 108, 20, 'Gram scale', 7.5, th),
    ],
    links: [],
    arrows: [across(126, 242, 70, th.dark, 1.2)],
  };
}

function previousThis(): DesignTemplate {
  const th = T.crimson;
  const rowY = [8, 75], rowH = 58;
  const boxes: Box[] = [];
  const arrows: FreeArrow[] = [];
  rowY.forEach((y, i) => {
    const color = i ? th.dark : '#7f7f7f';
    boxes.push(band(6, y, 70, rowH, i ? th.dark : '#d9d9d9', { text: i ? 'This work' : 'Previous work', size: 9, bold: true, ink: i ? th.onDark : '#404040' }));
    boxes.push(spot(84, y + 4, 96, rowH - 8, 'Starting material', 7), spot(264, y + 4, 96, rowH - 8, 'Product', 7));
    boxes.push(words(184, y + 8, 76, 16, i ? 'new conditions' : 'harsh conditions', 7, { ink: color }));
    arrows.push(across(186, 258, y + rowH / 2, color, 1));
  });
  return { id: 'ga-previous-this', name: 'Previous work and this work', category: 'abstract', sizeId: 'ga-elsevier', blurb: 'Two rows: what was done before in gray, the new reaction in color.', boxes, links: [], arrows };
}

function cycle(): DesignTemplate {
  const th = T.teal;
  const cx = GA_W / 2, cy = 72, R = 52;
  return {
    id: 'ga-cycle', name: 'Catalytic cycle', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'Starting material and product either side of a catalytic cycle with three intermediates.',
    boxes: [
      spot(8, 36, 86, 72, 'Starting material', 7.5),
      spot(GA_W - 94, 36, 86, 72, 'Product', 7.5),
      { geo: 'ellipse', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: null, line: th.accent, lw: 1.2, dashed: true, name: 'Cycle' },
      words(cx - 30, cy - 9, 60, 18, 'Catalyst', 9, { bold: true, ink: th.dark }),
      spot(cx - 22, cy - R - 16, 44, 30, 'Int. 1', 6, { fill: '#ffffff' }),
      spot(cx + R - 26, cy + 14, 44, 30, 'Int. 2', 6, { fill: '#ffffff' }),
      spot(cx - R - 18, cy + 14, 44, 30, 'Int. 3', 6, { fill: '#ffffff' }),
    ],
    links: [],
    arrows: [across(98, cx - R - 4, 60, th.dark, 1), across(cx + R + 4, GA_W - 98, 60, th.dark, 1)],
  };
}

function scope(): DesignTemplate {
  const th = T.blue;
  const boxes: Box[] = [
    spot(60, 6, 80, 48, 'Starting material', 7),
    words(150, 10, 70, 16, 'conditions', 7),
    spot(230, 6, 80, 48, 'Product', 7),
  ];
  for (let i = 0; i < 5; i++) boxes.push(spot(8 + i * 71, 62, 65, 50, `Example ${i + 1}\nyield`, 6.5));
  boxes.push(badge(84, 118, 200, 18, '30 examples · up to 99% yield', 8, th));
  return { id: 'ga-scope', name: 'Scope at a glance', category: 'abstract', sizeId: 'ga-elsevier', blurb: 'The reaction on top, five examples under it and a badge with the count and best yield.', boxes, links: [], arrows: [across(146, 224, 30, th.dark, 1)] };
}

function divergent(): DesignTemplate {
  const th = T.plum;
  const ys = [8, 52, 96];
  return {
    id: 'ga-divergent', name: 'Divergent synthesis', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'One starting material, three arrows fanning out to three different products.',
    boxes: [
      spot(10, 40, 100, 62, 'Common intermediate', 7.5),
      ...ys.map((y, i) => spot(258, y, 100, 38, `Product ${String.fromCharCode(65 + i)}`, 7)),
      ...ys.map((y, i) => words(150, y + (i === 1 ? 2 : i ? 22 : 6), 80, 14, `conditions ${String.fromCharCode(65 + i)}`, 6.5, { ink: th.dark })),
    ],
    links: [],
    arrows: ys.map((y): FreeArrow => [116, 71, 252, y + 19, { color: th.dark, width: 1 }]),
  };
}

function photo(): DesignTemplate {
  const th = T.plum;
  return {
    id: 'ga-photo', name: 'Light-driven reaction', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'Starting material to product under light, with a lamp icon over the arrow and the photocatalyst named.',
    boxes: [
      band(0, 0, GA_W, GA_H, '#f6f2fa', { name: 'Background' }),
      spot(10, 34, 110, 80, 'Starting material', 8),
      icon('lightbulb-on-outline', 164, 12, 40, '#7b4fa0'),
      words(130, 56, 108, 16, 'photocatalyst, blue LEDs', 7, { ink: th.dark, bold: true }),
      spot(248, 34, 110, 80, 'Product', 8),
      words(10, 120, 348, 16, 'One line on what light makes possible', 8, { italic: true, ink: th.dark }),
    ],
    links: [],
    arrows: [across(128, 240, 82, '#7b4fa0', 1.4)],
  };
}

function bio(): DesignTemplate {
  const th = T.forest;
  return {
    id: 'ga-bio', name: 'Biological activity', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'The compound beside its target (a protein or cell picture), with its activity in a badge.',
    boxes: [
      spot(10, 12, 120, 92, 'Compound', 8),
      spot(222, 12, 136, 118, 'Target: protein or cell picture', 8),
      badge(10, 112, 120, 22, '{i:IC}{sub:50} = 12 nM', 8, th),
      words(136, 30, 82, 18, 'binds', 8, { ink: th.dark, bold: true }),
    ],
    links: [],
    arrows: [across(136, 216, 58, th.dark, 1.4)],
  };
}

function convergent(): DesignTemplate {
  const th = T.orange;
  return {
    id: 'ga-convergent', name: 'Convergent synthesis', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'Two fragments joined in a key step to the target, with the step count beneath.',
    boxes: [
      spot(10, 8, 100, 56, 'Fragment A', 7.5), spot(10, 78, 100, 56, 'Fragment B', 7.5),
      words(126, 58, 100, 26, 'key coupling', 8, { bold: true, ink: th.dark }),
      spot(236, 22, 122, 88, 'Target', 8),
      words(236, 116, 122, 18, '12 steps, 9% overall', 7.5, { ink: th.dark }),
    ],
    links: [],
    arrows: [[116, 36, 228, 62, { color: th.dark, width: 1 }], [116, 106, 228, 74, { color: th.dark, width: 1 }]],
  };
}

/** Two thin axis arrows meeting at (x, y): up to top and right to right. */
const axes = (x: number, y: number, top: number, right: number): FreeArrow[] =>
  [[x, y, x, top, { color: '#404040', width: 0.6 }], [x, y, right, y, { color: '#404040', width: 0.6 }]];

const GRAY: Theme = { dark: '#595959', accent: GREY, soft: '#f2f2f2', ink: '#404040', onDark: '#ffffff' };

function electro(): DesignTemplate {
  const th = T.blue;
  return {
    id: 'ga-electro', name: 'Electrochemistry', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'Starting material to product with electrode icons over the arrow and the cell conditions under it.',
    boxes: [
      spot(10, 26, 108, 80, 'Starting material', 8),
      icon('lightning-bolt', 162, 14, 34, '#e0a800'),
      words(126, 48, 30, 16, '(+) C', 7, { bold: true, ink: th.dark, align: 'left' }),
      words(204, 48, 36, 16, 'Pt (−)', 7, { bold: true, ink: th.dark, align: 'right' }),
      words(122, 80, 124, 28, 'undivided cell, 10 mA\n{f:n-Bu4NBF4}, MeCN, rt', 7, { ink: th.dark }),
      spot(250, 26, 108, 80, 'Product', 8),
      badge(84, 116, 200, 20, 'No chemical oxidant · electrons as the reagent', 7.5, th),
    ],
    links: [],
    arrows: [across(126, 242, 70, th.dark, 1.4)],
  };
}

function flow(): DesignTemplate {
  const th = T.teal;
  const coil: Box[] = [0, 1, 2, 3, 4, 5].map((i) => ({ geo: 'ellipse', x: 136 + i * 11, y: 46, w: 16, h: 44, fill: null, line: th.dark, lw: 1.2, name: 'Coil' }));
  return {
    id: 'ga-flow', name: 'Flow chemistry', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'Two inlets feeding a coil reactor, the product leaving it, with the residence time beneath.',
    boxes: [
      spot(8, 10, 76, 52, 'Inlet A', 7.5), spot(8, 80, 76, 52, 'Inlet B', 7.5),
      ...coil,
      words(118, 22, 102, 16, '60 °C, 10 bar', 7.5, { bold: true, ink: th.dark }),
      words(110, 96, 118, 16, 'residence time 5 min', 7.5, { ink: th.dark }),
      spot(252, 28, 106, 84, 'Product', 8),
      badge(252, 116, 106, 20, '2.4 g per hour', 7.5, th),
    ],
    links: [],
    arrows: [[88, 36, 130, 62, { color: th.dark, width: 1 }], [88, 106, 130, 74, { color: th.dark, width: 1 }], across(208, 246, 68, th.dark, 1)],
  };
}

function asym(): DesignTemplate {
  const th = T.plum;
  return {
    id: 'ga-asym', name: 'Enantioselective catalysis', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'The chiral catalyst highlighted above the arrow, and an er badge on the product.',
    boxes: [
      spot(10, 40, 104, 84, 'Starting material', 8),
      spot(124, 6, 116, 60, 'Chiral catalyst', 8, { fill: th.soft, line: th.dark, ink: th.dark }),
      words(122, 84, 122, 16, 'conditions', 7.5, { ink: th.dark }),
      spot(252, 32, 106, 84, 'Product', 8),
      badge(296, 106, 62, 22, '98:2 er', 8, th),
    ],
    links: [],
    arrows: [across(122, 244, 78, th.dark, 1.2)],
  };
}

function lateStage(): DesignTemplate {
  const th = T.forest;
  const ring = (x: number, y: number): Box => ({ geo: 'ellipse', x, y, w: 28, h: 28, fill: null, line: th.accent, lw: 1.4, name: 'New bond site' });
  return {
    id: 'ga-late-stage', name: 'Late-stage functionalization', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'A drug scaffold with the new bond sites ringed, and three functionalized examples beside it.',
    boxes: [
      spot(10, 10, 150, 122, 'Drug scaffold', 8.5),
      ring(30, 26), ring(112, 44), ring(62, 96),
      words(166, 46, 70, 16, 'C–H to C–X', 7.5, { bold: true, ink: th.dark }),
      words(166, 80, 70, 16, 'one step', 7, { ink: th.dark }),
      ...[8, 52, 96].map((y, i) => spot(244, y, 114, 38, `Example ${i + 1}, yield`, 7)),
    ],
    links: [],
    arrows: [across(168, 236, 71, th.dark, 1.2)],
  };
}

function cascade(): DesignTemplate {
  const th = T.orange;
  const bonds = ['new C–C', 'new C–N', 'new C–C'];
  return {
    id: 'ga-cascade', name: 'Cascade reaction', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'One arrow from starting material to product, with a callout for each bond the cascade forms.',
    boxes: [
      spot(10, 40, 96, 84, 'Starting material', 8),
      words(112, 60, 88, 16, 'one pot', 8, { bold: true, ink: th.dark }),
      words(112, 90, 88, 28, '3 bonds, 2 rings\n1 stereocenter', 7, { ink: th.dark }),
      spot(206, 46, 152, 90, 'Product', 8),
      ...bonds.map((b, i): Box => ({ geo: 'calloutRect', x: 210 + i * 50, y: 4, w: 46, h: 34, text: b, size: 7, bold: true, ink: th.dark, fill: th.soft, line: th.dark, lw: 0.6 })),
    ],
    links: [],
    arrows: [across(112, 200, 84, th.dark, 1.4)],
  };
}

function materials(): DesignTemplate {
  const th = T.slate;
  return {
    id: 'ga-materials', name: 'Materials and devices', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'From the molecule to a device picture, with the measured property in a badge.',
    boxes: [
      spot(10, 24, 100, 92, 'Molecule', 8),
      spot(152, 8, 140, 126, 'Device picture', 8, { fill: '#eceff1' }),
      { geo: 'roundRect', x: 300, y: 38, w: 60, h: 64, text: '22%\nEQE', size: 22, bold: true, ink: '#ffffff', fill: th.accent, line: null },
    ],
    links: [],
    arrows: [across(114, 146, 70, th.dark, 1.2)],
  };
}

function computational(): DesignTemplate {
  const th = T.navy;
  return {
    id: 'ga-computational', name: 'Computational insight', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'A small energy profile with the key transition state beside it and its barrier in a badge.',
    boxes: [
      words(0, 2, 13, 16, '{i:G}', 8, { ink: '#404040' }),
      spot(24, 8, 186, 114, 'Energy profile', 8),
      words(24, 126, 186, 14, 'reaction coordinate', 7, { ink: '#404040' }),
      spot(222, 8, 136, 98, 'Key transition state', 8),
      badge(222, 112, 136, 22, 'ΔG‡ = 18.4 kcal/mol', 8, th),
    ],
    links: [],
    arrows: axes(16, 124, 6, 214),
  };
}

function dataGlance(): DesignTemplate {
  const th = T.teal;
  return {
    id: 'ga-data', name: 'Data at a glance', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'A plot beside the structure it describes, with one line saying what the plot shows.',
    boxes: [
      spot(10, 10, 120, 98, 'Structure', 8),
      words(10, 112, 120, 22, '{b:3}: one line on what it does', 7.5, { ink: th.dark }),
      spot(162, 8, 192, 112, 'Plot', 8),
      words(162, 124, 192, 14, 'x-axis label', 7, { ink: '#404040' }),
    ],
    links: [],
    arrows: axes(154, 122, 4, 362),
  };
}

function totalSynthesis(): DesignTemplate {
  const th = T.forest;
  return {
    id: 'ga-total', name: 'Total synthesis', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'A commercial starting material to the natural product, with the step count and overall yield.',
    boxes: [
      spot(10, 40, 80, 62, 'Starting material', 7),
      words(10, 104, 80, 14, 'commercial', 7, { italic: true, ink: '#595959' }),
      words(96, 44, 130, 20, '14 steps', 11, { bold: true, ink: th.dark }),
      words(96, 76, 130, 16, '6% overall yield', 8, { ink: th.dark }),
      spot(232, 6, 126, 106, 'Natural product', 8),
      words(232, 116, 126, 18, 'Natural product name', 8.5, { bold: true, italic: true, ink: th.dark }),
    ],
    links: [],
    arrows: [across(98, 224, 70, th.dark, 1.6)],
  };
}

function keyIntermediate(): DesignTemplate {
  const th = T.crimson;
  return {
    id: 'ga-key-int', name: 'Key intermediate', category: 'abstract', sizeId: 'ga-elsevier',
    blurb: 'The intermediate large in the middle, how it forms on the left and what it becomes on the right.',
    boxes: [
      spot(8, 40, 76, 62, 'Precursor', 7),
      { geo: 'ellipse', x: 112, y: 4, w: 144, h: 134, fill: th.soft, line: null, name: 'Backdrop' },
      spot(130, 26, 108, 90, 'Key intermediate', 8.5),
      words(84, 48, 32, 14, 'forms', 6.5, { ink: th.dark }),
      words(252, 48, 32, 14, 'gives', 6.5, { ink: th.dark }),
      spot(284, 40, 76, 62, 'Product', 7),
    ],
    links: [],
    arrows: [across(88, 110, 71, th.dark, 1), across(258, 280, 71, th.dark, 1)],
  };
}

function greener(): DesignTemplate {
  const th = T.forest;
  const rows: [number, Theme, string, string, string][] = [[8, GRAY, 'Old route', 'Pd, DMF, 120 °C', 'E-factor 85'], [76, th, 'This work', 'Fe, water, rt', 'E-factor 6']];
  const boxes: Box[] = [];
  const arrows: FreeArrow[] = [];
  for (const [y, t, name, cond, e] of rows) {
    boxes.push(words(4, y, 64, 58, name, 8.5, { bold: true, ink: t.dark }));
    boxes.push(spot(68, y + 3, 80, 52, 'Starting material', 6.5), spot(218, y + 3, 64, 52, 'Product', 6.5));
    boxes.push(words(150, y + 6, 66, 14, cond, 6.5, { ink: t.dark }));
    boxes.push(badge(288, y + 18, 74, 22, e, 7.5, t));
    arrows.push(across(152, 214, y + 29, t.dark, 1));
  }
  boxes.push(icon('leaf', 172, 108, 20, '#548235'));
  return { id: 'ga-greener', name: 'Greener method', category: 'abstract', sizeId: 'ga-elsevier', blurb: 'The new route beside the old one, with a leaf and E-factor (or PMI) badges for both.', boxes, links: [], arrows };
}

// ---------------------------------------------------------------- TOC graphics (234 × 126)

function tocHero(): DesignTemplate {
  const th = T.navy;
  return {
    id: 'toc-hero', name: 'Product in the spotlight', category: 'toc', sizeId: 'toc-acs',
    blurb: 'A short title on top and the product large in the middle, on a soft round backdrop.',
    boxes: [
      words(6, 4, 222, 18, 'Short title of the work', 10, { bold: true, ink: th.dark }),
      { geo: 'ellipse', x: 47, y: 24, w: 140, h: 92, fill: th.soft, line: null, name: 'Backdrop' },
      spot(67, 34, 100, 72, 'Product', 8),
    ],
    links: [],
  };
}

function tocTwoStep(): DesignTemplate {
  const th = T.teal;
  return {
    id: 'toc-two-step', name: 'Two steps', category: 'toc', sizeId: 'toc-acs',
    blurb: 'Starting material, intermediate and product joined by two arrows with their conditions.',
    boxes: [
      spot(4, 28, 64, 56, 'Starting material', 6.5), words(68, 38, 30, 12, 'step 1', 6),
      spot(98, 28, 40, 56, 'Int.', 6.5), words(138, 38, 30, 12, 'step 2', 6),
      spot(168, 28, 62, 56, 'Product', 6.5),
      band(4, 96, 226, 22, th.dark, { text: 'One line on what is new', size: 8.5, bold: true, ink: th.onDark }),
    ],
    links: [],
    arrows: [across(70, 96, 56, th.dark, 0.8), across(140, 166, 56, th.dark, 0.8)],
  };
}

function tocPicture(): DesignTemplate {
  const th = T.slate;
  return {
    id: 'toc-picture', name: 'Picture and structure', category: 'toc', sizeId: 'toc-acs',
    blurb: 'A photo or rendering on the left, the structure on the right, a message band under both.',
    boxes: [
      spot(0, 0, 117, 100, 'Picture', 8, { fill: '#eceff1' }),
      spot(121, 8, 109, 86, 'Structure', 8),
      band(0, 102, 234, 24, th.accent, { text: 'One line on what is new', size: 9, bold: true, ink: '#ffffff' }),
    ],
    links: [],
  };
}

function tocCatalyst(): DesignTemplate {
  const th = T.plum;
  return {
    id: 'toc-catalyst', name: 'Catalyst on the arrow', category: 'toc', sizeId: 'toc-acs',
    blurb: 'Starting material and product with the catalyst drawn large over the arrow.',
    boxes: [
      spot(4, 34, 70, 62, 'Starting material', 6.5),
      spot(80, 4, 76, 46, 'Catalyst', 7, { fill: th.soft, line: th.dark, ink: th.dark }),
      words(78, 74, 80, 12, 'conditions', 6, { ink: th.dark }),
      spot(162, 34, 68, 62, 'Product', 6.5),
      band(4, 102, 226, 20, th.dark, { text: 'One line on what is new', size: 8.5, bold: true, ink: th.onDark }),
    ],
    links: [],
    arrows: [across(78, 158, 66, th.dark, 1)],
  };
}

function tocBeforeAfter(): DesignTemplate {
  const th = T.blue;
  return {
    id: 'toc-before-after', name: 'Before and after', category: 'toc', sizeId: 'toc-acs',
    blurb: 'Two pictures, before and after, with an arrow between them and a label under each.',
    boxes: [
      spot(4, 4, 98, 98, 'Picture', 8, { fill: '#f2f2f2' }), spot(132, 4, 98, 98, 'Picture', 8, { fill: '#f2f2f2' }),
      words(4, 106, 98, 16, 'Before', 8.5, { bold: true, ink: '#595959' }), words(132, 106, 98, 16, 'After', 8.5, { bold: true, ink: th.dark }),
    ],
    links: [],
    arrows: [across(106, 128, 53, th.dark, 1.4)],
  };
}

function tocExamples(): DesignTemplate {
  const th = T.teal;
  return {
    id: 'toc-examples', name: 'Three examples', category: 'toc', sizeId: 'toc-acs',
    blurb: 'The reaction on a line across the top, three products with yields under it.',
    boxes: [
      spot(30, 4, 66, 40, 'Starting material', 6), words(98, 8, 40, 10, 'conditions', 5.5), spot(140, 4, 66, 40, 'Product', 6),
      band(4, 50, 226, 1, th.accent, { name: 'Rule' }),
      ...[0, 1, 2].map((i) => spot(4 + i * 76, 56, 72, 66, `Example ${i + 1}\nyield`, 6)),
    ],
    links: [],
    arrows: [across(98, 138, 24, th.dark, 0.8)],
  };
}

function tocBigNumber(): DesignTemplate {
  const th = T.orange;
  return {
    id: 'toc-big-number', name: 'Big number', category: 'toc', sizeId: 'toc-acs',
    blurb: 'One large figure (a yield, a selectivity, a rate) beside the product.',
    boxes: [
      spot(4, 6, 126, 114, 'Product', 8),
      words(136, 18, 96, 54, '99%', 36, { bold: true, ink: th.dark }),
      words(136, 74, 96, 36, 'yield in one step, no column', 8.5, { ink: th.ink }),
    ],
    links: [],
  };
}

function tocSquare(): DesignTemplate {
  const th = T.navy;
  return {
    id: 'toc-square', name: 'Square', category: 'toc', sizeId: 'toc-wiley',
    blurb: 'The Wiley size: a picture on top and the message under it.',
    boxes: [
      spot(0, 0, 155.9, 96, 'Picture', 8, { fill: '#eef2f8' }),
      band(0, 96, 155.9, 3, th.accent, { name: 'Rule' }),
      words(6, 102, 144, 36, 'The message in one or two short lines', 9, { bold: true, ink: th.dark }),
    ],
    links: [],
  };
}

function tocCycle(): DesignTemplate {
  const th = T.teal;
  const cx = 112, cy = 64, R = 46;
  return {
    id: 'toc-cycle', name: 'Compact cycle', category: 'toc', sizeId: 'toc-acs',
    blurb: 'A small catalytic cycle, the starting material going in and the product leaving it.',
    boxes: [
      spot(2, 4, 56, 40, 'Starting material', 5.5),
      { geo: 'ellipse', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: null, line: th.accent, lw: 1, dashed: true, name: 'Cycle' },
      words(cx - 26, cy - 8, 52, 16, 'Catalyst', 7.5, { bold: true, ink: th.dark }),
      spot(cx + R - 20, cy - R - 2, 40, 28, 'Int. 1', 5.5, { fill: '#ffffff' }),
      spot(cx - R - 18, cy + 12, 40, 28, 'Int. 2', 5.5, { fill: '#ffffff' }),
      spot(176, 78, 56, 44, 'Product', 6),
    ],
    links: [],
    arrows: [[46, 46, cx - R + 10, cy - 24, { color: th.dark, width: 0.8 }], [cx + R - 6, cy + 22, 174, 96, { color: th.dark, width: 0.8 }]],
  };
}

// ---------------------------------------------------------------- figures (two columns: 504 × 288; one: 240 × 216)

const label = (x: number, y: number, t: string): Box => words(x, y, 18, 16, t, 10, { bold: true, align: 'left' });

function figTwoPanel(): DesignTemplate {
  return {
    id: 'fig-two-panel', name: 'Two panels', category: 'figure', sizeId: 'figure-2',
    blurb: 'Panels (a) and (b) side by side, labeled in the corner the way journals ask.',
    boxes: [spot(20, 8, 228, 272, 'Panel a', 9), spot(268, 8, 228, 272, 'Panel b', 9), label(2, 4, 'a'), label(250, 4, 'b')],
    links: [],
  };
}

function figFour(): DesignTemplate {
  const boxes: Box[] = [];
  'abcd'.split('').forEach((l, i) => {
    const x = (i % 2) * 252, y = Math.floor(i / 2) * 144;
    boxes.push(spot(x + 18, y + 6, 230, 132, `Panel ${l}`, 9), label(x, y + 2, l));
  });
  return { id: 'fig-four', name: 'Four panels', category: 'figure', sizeId: 'figure-2', blurb: 'A 2 × 2 grid of panels (a) to (d).', boxes, links: [] };
}

function figSchemeTable(): DesignTemplate {
  return {
    id: 'fig-scheme-table', name: 'Scheme and table', category: 'figure', sizeId: 'figure-2',
    blurb: 'A reaction scheme across the top and an optimization table under it, with a footnote line.',
    boxes: [
      words(0, 0, 504, 16, '{b:Table 1.} Optimization of the reaction conditions', 9, { align: 'left' }),
      spot(110, 20, 120, 64, 'Starting material', 8), words(236, 32, 60, 14, 'conditions', 7.5), spot(304, 20, 100, 64, 'Product', 8),
      spot(0, 92, 504, 170, 'Table: entry, catalyst, solvent, temperature, yield (Insert ▸ Table)', 8),
      words(0, 266, 504, 20, 'Reaction conditions: 0.2 mmol scale. Yields of isolated product.', 7, { align: 'left', italic: true }),
    ],
    links: [],
    arrows: [across(236, 298, 52, undefined, 0.8)],
  };
}

function figScope(): DesignTemplate {
  const boxes: Box[] = [
    words(0, 0, 504, 16, '{b:Scheme 2.} Substrate scope', 9, { align: 'left' }),
    spot(130, 20, 100, 48, 'Starting material', 7.5), words(236, 28, 60, 14, 'conditions', 7), spot(304, 20, 80, 48, 'Product', 7.5),
  ];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) boxes.push(spot(c * 84 + 2, 76 + r * 70, 80, 64, `${r * 6 + c + 1}, yield`, 6.5));
  return { id: 'fig-scope', name: 'Substrate scope', category: 'figure', sizeId: 'figure-2', blurb: 'The general reaction on top and 18 products with yields in a grid.', boxes, links: [], arrows: [across(236, 298, 44, undefined, 0.8)] };
}

function figThree(): DesignTemplate {
  const boxes: Box[] = [];
  'abc'.split('').forEach((l, i) => boxes.push(spot(i * 168 + 18, 8, 148, 272, `Panel ${l}`, 9), label(i * 168, 4, l)));
  return { id: 'fig-three', name: 'Three panels', category: 'figure', sizeId: 'figure-2', blurb: 'Panels (a) to (c) in a row across two columns.', boxes, links: [] };
}

function figPrevThis(): DesignTemplate {
  const boxes: Box[] = [words(0, 0, 504, 16, '{b:Scheme 1.} Previous work and this work', 9, { align: 'left' })];
  const arrows: FreeArrow[] = [];
  [['(a) Previous work', 22], ['(b) This work', 150]].forEach(([t, y], i) => {
    const top = y as number;
    boxes.push(words(0, top, 300, 16, t as string, 9, { bold: true, align: 'left', ink: i ? '#1f3864' : '#595959' }));
    boxes.push(spot(40, top + 20, 150, 92, 'Starting material', 8), words(196, top + 44, 112, 28, i ? 'new conditions' : 'known conditions', 7.5));
    boxes.push(spot(314, top + 20, 150, 92, 'Product', 8));
    arrows.push(across(198, 306, top + 66, i ? '#1f3864' : GREY, 1));
  });
  boxes.push(band(0, 142, 504, 0.75, '#bfbfbf', { name: 'Rule' }));
  return { id: 'fig-prev-this', name: 'Previous work and this work', category: 'figure', sizeId: 'figure-2', blurb: 'A two-row scheme: (a) what was known, (b) the new work.', boxes, links: [], arrows };
}

function figMechanism(): DesignTemplate {
  const boxes: Box[] = [words(0, 0, 504, 16, '{b:Scheme 3.} Proposed mechanism', 9, { align: 'left' })];
  const top = [[0, 24], [182, 24], [364, 24]], bottom = [[364, 152], [182, 152], [0, 152]];
  const pos = [...top, ...bottom];
  pos.forEach(([x, y], i) => boxes.push(spot(x + 10, y, 120, 92, i === 0 ? 'Starting material' : i === 5 ? 'Product' : `Intermediate ${String.fromCharCode(64 + i)}`, 7.5)));
  const steps = ['step 1', 'step 2', '', 'step 4', 'step 5'];
  const arrows: FreeArrow[] = [across(134, 188, 70, undefined, 0.8), across(316, 370, 70, undefined, 0.8), [434, 120, 434, 148, { width: 0.8 }], across(370, 316, 198, undefined, 0.8), across(188, 134, 198, undefined, 0.8)];
  [[136, 54], [318, 54], [440, 126], [318, 182], [136, 182]].forEach(([x, y], i) => boxes.push(words(x, y, 50, 12, i === 2 ? 'step 3' : steps[i], 6.5, i === 2 ? { align: 'left' } : {})));
  boxes.push(words(0, 262, 504, 22, 'Calculated free energies in kcal/mol. One line on the evidence for each step.', 7, { align: 'left', italic: true }));
  return { id: 'fig-mechanism', name: 'Proposed mechanism', category: 'figure', sizeId: 'figure-2', blurb: 'Numbered intermediates across two rows joined by arrows, with a caption line.', boxes, links: [], arrows };
}

function figSpectra(): DesignTemplate {
  const boxes: Box[] = [];
  for (let i = 0; i < 4; i++) {
    const y = 6 + i * 60;
    boxes.push(spot(90, y, 400, 54, `Spectrum ${i + 1}`, 8), words(0, y + 6, 86, 40, i === 3 ? 'Product' : i ? `After ${i} h` : 'Starting material', 8, { align: 'right', bold: true }));
  }
  boxes.push(band(90, 248, 400, 0.75, '#000000', { name: 'Axis' }));
  for (let k = 0; k <= 10; k += 2) boxes.push(words(90 + (10 - k) * 40 - 10, 250, 20, 14, `${k}`, 7.5), band(90 + (10 - k) * 40, 248, 0.75, 4, '#000000', { name: 'Tick' }));
  boxes.push(words(245, 266, 90, 16, 'δ (ppm)', 8.5, { italic: true }));
  return { id: 'fig-spectra', name: 'Stacked spectra', category: 'figure', sizeId: 'figure-2', blurb: 'Four spectra stacked over a shared ppm axis, each labeled on the left.', boxes, links: [] };
}

function figCrystal(): DesignTemplate {
  return {
    id: 'fig-crystal', name: 'Crystal structure', category: 'figure', sizeId: 'figure-2',
    blurb: 'The X-ray structure beside the drawn structure, with the CCDC number and ellipsoid line.',
    boxes: [
      label(0, 4, 'a'), spot(18, 8, 236, 244, 'X-ray structure', 8, { fill: '#f7f7f7' }),
      label(262, 4, 'b'), spot(280, 40, 200, 180, 'Drawn structure', 8),
      words(0, 258, 504, 28, 'Thermal ellipsoids at 50% probability; hydrogen atoms omitted for clarity. CCDC 0000000.', 7.5, { align: 'left', italic: true }),
    ],
    links: [],
  };
}

function figInset(): DesignTemplate {
  return {
    id: 'fig-inset', name: 'Plot with inset', category: 'figure', sizeId: 'figure-1',
    blurb: 'One column: a large plot with axes and a smaller inset in its upper right corner.',
    boxes: [
      words(0, 2, 16, 16, '{i:y}', 9),
      spot(26, 6, 208, 176, 'Plot', 9),
      spot(138, 14, 88, 70, 'Inset', 7, { fill: '#ffffff' }),
      words(26, 192, 208, 18, 'x-axis label (unit)', 8),
    ],
    links: [],
    arrows: axes(20, 186, 2, 238),
  };
}

export const JOURNAL: DesignTemplate[] = [
  oneReaction(), previousThis(), cycle(), scope(), divergent(), convergent(), photo(), bio(),
  electro(), flow(), asym(), lateStage(), cascade(), materials(), computational(), dataGlance(), totalSynthesis(), keyIntermediate(), greener(),
  tocHero(), tocTwoStep(), tocPicture(), tocCatalyst(), tocBeforeAfter(), tocExamples(), tocBigNumber(), tocSquare(), tocCycle(),
  figTwoPanel(), figFour(), figSchemeTable(), figScope(), figThree(), figPrevThis(), figMechanism(), figSpectra(), figCrystal(), figInset(),
];
