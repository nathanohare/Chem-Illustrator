// Journal graphics for Design mode: graphical abstracts (Elsevier's 13 × 5 cm unless said),
// TOC graphics (the ACS size) and figures (one or two journal columns). Dashed spots mark where
// structures, schemes and pictures go; arrows are free arrows, so they stay level.

import { type Box, type DesignTemplate, type FreeArrow, type Theme, THEMES, band, icon, spot, words } from './template-kit';

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

export const JOURNAL: DesignTemplate[] = [
  oneReaction(), previousThis(), cycle(), scope(), divergent(), convergent(), photo(), bio(),
  tocHero(), tocTwoStep(), tocPicture(),
  figTwoPanel(), figFour(), figSchemeTable(), figScope(),
];
