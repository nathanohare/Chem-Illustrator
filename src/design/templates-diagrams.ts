// Flowcharts, workup schemes and timelines for Design mode. Flowchart boxes are joined by
// connectors (they follow the boxes when moved); the glassware in workup schemes is drawn at one
// line width in proportion to its size (WORKUP_LW in design/templates.ts is the same).

import { type Box, type DesignTemplate, type FreeArrow, type Theme, THEMES, band, glass, words } from './template-kit';

const T = THEMES;
const LW = 1.5;

// ---------------------------------------------------------------- flowcharts (letter)

const step = (geo: string, x: number, y: number, w: number, h: number, text: string, th: Theme, more: Partial<Box> = {}): Box =>
  ({ geo, x, y, w, h, text, size: 12, fill: th.soft, line: th.dark, lw: 1, ...more });

function purification(): DesignTemplate {
  const th = T.teal;
  const dec = { fill: '#fff2cc', line: '#bf9000' };
  return {
    id: 'flow-purify', name: 'Choosing a purification', category: 'flowchart', sizeId: 'letter',
    blurb: 'A decision tree from crude product to recrystallization, distillation or a column.',
    boxes: [
      step('fcTerminator', 226, 40, 160, 44, 'Crude product', th),
      step('fcDecision', 216, 120, 180, 90, 'Solid?', th, dec),
      step('fcDecision', 60, 250, 180, 90, 'Crystallizes from a solvent?', th, { ...dec, size: 11 }),
      step('fcDecision', 372, 250, 180, 90, 'Volatile and stable to heat?', th, { ...dec, size: 11 }),
      step('fcProcess', 30, 400, 130, 56, 'Recrystallize', th),
      step('fcProcess', 240, 400, 132, 56, 'Column chromatography', th),
      step('fcProcess', 452, 400, 130, 56, 'Distill', th),
      step('fcTerminator', 226, 520, 160, 44, 'Pure product', th),
      words(150, 140, 50, 18, 'Yes', 11, { bold: true }), words(412, 140, 50, 18, 'No', 11, { bold: true }),
      words(50, 352, 50, 18, 'Yes', 11, { bold: true }), words(200, 352, 50, 18, 'No', 11, { bold: true }),
      words(510, 352, 50, 18, 'Yes', 11, { bold: true }), words(362, 352, 50, 18, 'No', 11, { bold: true }),
    ],
    links: [
      { from: 0, fp: 2, to: 1, tp: 0 },
      { from: 1, fp: 3, to: 2, tp: 0, elbow: true }, { from: 1, fp: 1, to: 3, tp: 0, elbow: true },
      { from: 2, fp: 3, to: 4, tp: 0, elbow: true }, { from: 2, fp: 1, to: 5, tp: 0, elbow: true },
      { from: 3, fp: 1, to: 6, tp: 0, elbow: true }, { from: 3, fp: 3, to: 5, tp: 0, elbow: true },
      { from: 4, fp: 2, to: 7, tp: 3, elbow: true }, { from: 5, fp: 2, to: 7, tp: 0 }, { from: 6, fp: 2, to: 7, tp: 1, elbow: true },
    ],
  };
}

function troubleshoot(): DesignTemplate {
  const th = T.crimson;
  const dec = { fill: '#fff2cc', line: '#bf9000' };
  return {
    id: 'flow-troubleshoot', name: 'Troubleshooting a reaction', category: 'flowchart', sizeId: 'letter',
    blurb: 'What to check when a reaction fails: starting material left, new spots, or nothing at all.',
    boxes: [
      step('fcTerminator', 211, 36, 190, 44, 'Reaction did not work', th),
      step('fcDecision', 206, 110, 200, 90, 'Starting material left?', th, dec),
      step('fcProcess', 40, 250, 170, 70, 'Check reagent quality, dryness and temperature', th, { size: 11 }),
      step('fcDecision', 372, 240, 200, 90, 'New spots by TLC?', th, dec),
      step('fcProcess', 300, 380, 150, 70, 'Isolate and identify the side products', th, { size: 11 }),
      step('fcProcess', 470, 380, 120, 70, 'Check workup: is the product in the water?', th, { size: 11 }),
      step('fcProcess', 40, 380, 170, 70, 'Run a control with a known substrate', th, { size: 11 }),
      words(150, 132, 50, 18, 'Yes', 11, { bold: true }), words(412, 132, 50, 18, 'No', 11, { bold: true }),
      words(330, 340, 50, 18, 'Yes', 11, { bold: true }), words(540, 340, 50, 18, 'No', 11, { bold: true }),
    ],
    links: [
      { from: 0, fp: 2, to: 1, tp: 0 }, { from: 1, fp: 3, to: 2, tp: 0, elbow: true }, { from: 1, fp: 1, to: 3, tp: 0, elbow: true },
      { from: 3, fp: 3, to: 4, tp: 0, elbow: true }, { from: 3, fp: 1, to: 5, tp: 0, elbow: true }, { from: 2, fp: 2, to: 6, tp: 0 },
    ],
  };
}

// ---------------------------------------------------------------- workup schemes (letter, landscape)

const level = (x1: number, x2: number, y = 290): FreeArrow => [x1, y, x2, y, { width: 1 }];

function acidBase(): DesignTemplate {
  return {
    id: 'workup-acid-base', name: 'Acid–base extraction', category: 'workup', sizeId: 'letter-wide',
    blurb: 'A mixture split by extraction: the neutral compound in the organic layer, the amine taken into acid and back out.',
    boxes: [
      words(40, 60, 712, 36, 'Acid–base extraction', 20, { bold: true }),
      glass('labErlenmeyer', 40, 200, 81, 108, LW),
      glass('labSepFunnel', 186, 164, 66, 144, LW),
      glass('labErlenmeyer', 330, 110, 66, 88, LW),
      glass('labBeaker', 330, 260, 70, 83, LW),
      glass('labSepFunnel', 480, 220, 56, 122, LW),
      glass('labVial', 640, 128, 40, 80, LW),
      glass('labVial', 640, 262, 40, 80, LW),
      words(20, 318, 121, 44, 'Mixture in ether', 11),
      words(160, 318, 120, 44, 'Shake with 1 M HCl', 11),
      words(420, 130, 200, 30, 'Organic layer: dry, concentrate', 10),
      words(300, 350, 130, 44, 'Aqueous layer: basify with NaOH', 10),
      words(456, 350, 110, 44, 'Extract into ether', 10),
      words(690, 148, 90, 40, 'Neutral compound', 10, { align: 'left' }),
      words(690, 282, 90, 40, 'Amine', 10, { align: 'left' }),
    ],
    links: [],
    arrows: [level(129, 178, 260), [258, 230, 322, 160, { width: 1 }], [258, 260, 322, 300, { width: 1 }], level(408, 472, 300), level(408, 632, 168), level(544, 632, 300)],
  };
}

function filtration(): DesignTemplate {
  // the Büchner funnel sits in the filter flask's neck
  const fx = 470, fy = 236, fw = 83, fh = 94;
  const bw = 70, bh = 83;
  const bx = fx + 0.42 * fw - bw / 2, by = fy + 0.1 * fh - bh;
  return {
    id: 'workup-recrystallize', name: 'Recrystallization', category: 'workup', sizeId: 'letter-wide',
    blurb: 'Dissolve hot, cool in an ice bath, collect the crystals by vacuum filtration and dry them.',
    boxes: [
      words(40, 60, 712, 36, 'Recrystallization', 20, { bold: true }),
      glass('labErlenmeyer', 60, 200, 81, 108, LW),
      glass('labStirPlate', 50, 308, 101, 44, LW),
      glass('labBath', 236, 270, 120, 54, LW),
      { ...glass('labErlenmeyer', 256, 196, 81, 108, LW), fill: '#ffffff' },
      glass('labBuchner', bx, by, bw, bh, LW),
      glass('labFilterFlask', fx, fy, fw, fh, LW),
      glass('labVial', 650, 236, 45, 96, LW),
      words(30, 362, 141, 44, 'Dissolve in the least hot solvent', 11),
      words(236, 360, 121, 44, 'Cool slowly, then in ice', 11),
      words(440, 360, 140, 44, 'Collect by vacuum filtration', 11),
      words(612, 360, 121, 44, 'Dry the crystals', 11),
    ],
    links: [],
    arrows: [level(158, 228, 260), level(364, 432, 260), level(574, 640, 280)],
  };
}

// ---------------------------------------------------------------- timelines (slide 16:9)

function phdRoadmap(): DesignTemplate {
  const th = T.navy;
  const years = ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5'];
  const what = ['Courses\nChoose a lab\nFirst project', 'Candidacy exam\nFirst paper', 'Second project\nConference talk', 'Main paper\nInternship', 'Write the thesis\nDefend'];
  const colors = ['#2f5597', '#2e75b6', '#0f6b6b', '#548235', '#bf9000'];
  return {
    id: 'timeline-phd', name: 'PhD roadmap', category: 'timeline', sizeId: 'slide-wide',
    blurb: 'Five years as chevrons across the slide, with the milestones of each year under it.',
    boxes: [
      words(60, 40, 840, 50, 'PhD roadmap', 32, { bold: true, ink: th.dark }),
      ...years.flatMap((y, i): Box[] => [
        { geo: i ? 'chevron' : 'homePlate', x: 60 + i * 170, y: 150, w: 180, h: 70, text: y, size: 20, bold: true, ink: '#ffffff', fill: colors[i], line: null },
        words(70 + i * 170, 240, 150, 200, what[i], 15, { valign: 'top', align: 'left' }),
      ]),
    ],
    links: [],
  };
}

function gantt(): DesignTemplate {
  const th = T.teal;
  const tasks: [string, number, number][] = [['Literature review', 0, 2], ['Route scouting', 1, 4], ['Optimization', 3, 7], ['Substrate scope', 6, 10], ['Mechanism studies', 8, 11], ['Write the paper', 10, 12]];
  const x0 = 250, cw = 52, y0 = 130, rh = 52;
  const boxes: Box[] = [words(60, 30, 840, 50, 'Project plan', 32, { bold: true, ink: th.dark })];
  for (let m = 0; m < 12; m++) {
    boxes.push(band(x0 + m * cw, y0 - 30, cw - 2, 26, m % 2 ? th.soft : '#ffffff', { text: `M${m + 1}`, size: 11, ink: th.dark }));
  }
  tasks.forEach(([t, a, b], i) => {
    const y = y0 + i * rh;
    boxes.push(words(60, y, 180, rh - 8, t, 15, { align: 'left' }));
    boxes.push({ geo: 'roundRect', x: x0 + a * cw, y: y + 8, w: (b - a) * cw - 4, h: rh - 24, fill: i % 2 ? th.accent : th.dark, line: null });
  });
  boxes.push(band(x0, y0 - 4, 1.5, tasks.length * rh, '#bfbfbf'));
  return { id: 'timeline-gantt', name: 'Project plan (Gantt)', category: 'timeline', sizeId: 'slide-wide', blurb: 'Tasks down the side and twelve months across, each task a bar from start to end.', boxes, links: [] };
}

export const DIAGRAMS: DesignTemplate[] = [purification(), troubleshoot(), acidBase(), filtration(), phdRoadmap(), gantt()];
