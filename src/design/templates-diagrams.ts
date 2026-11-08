// Flowcharts, workup schemes and timelines for Design mode. Flowchart boxes are joined by
// connectors (they follow the boxes when moved); the glassware in workup schemes is drawn at one
// line width in proportion to its size (WORKUP_LW in design/templates.ts is the same).

import { type Box, type DesignTemplate, type FreeArrow, type Link, type Theme, THEMES, band, dot, glass, spot, words } from './template-kit';

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

const DEC = { fill: '#fff2cc', line: '#bf9000' };
const yes = (x: number, y: number, t = 'Yes'): Box => words(x, y, 40, 18, t, 11, { bold: true });
/** Links down a column: each box's bottom to the next one's top. */
const chain = (...ids: number[]): Link[] => ids.slice(1).map((to, i) => ({ from: ids[i], fp: 2, to, tp: 0 }));

function characterize(): DesignTemplate {
  const th = T.blue;
  return {
    id: 'flow-characterize', name: 'Characterizing a compound', category: 'flowchart', sizeId: 'letter',
    blurb: 'From a new compound to the data for the SI: purity check, NMR and HRMS, and an X-ray if it crystallizes.',
    boxes: [
      step('fcTerminator', 221, 30, 170, 44, 'New compound', th),
      step('fcProcess', 206, 104, 200, 56, 'TLC and crude {sup:1}H NMR', th),
      step('fcDecision', 216, 190, 180, 90, 'Pure?', th, DEC),
      step('fcProcess', 426, 207, 150, 56, 'Purify: column or recrystallize', th, { size: 11 }),
      step('fcProcess', 206, 310, 200, 56, '{sup:1}H and {sup:13}C NMR, HRMS', th),
      step('fcProcess', 206, 396, 200, 56, 'IR, melting point, optical rotation', th, { size: 11 }),
      step('fcDecision', 216, 482, 180, 90, 'Crystals?', th, DEC),
      step('fcProcess', 426, 499, 150, 56, 'X-ray structure', th),
      step('fcTerminator', 206, 620, 200, 50, 'Report the data in the SI', th),
      yes(312, 284), yes(394, 212, 'No'), yes(394, 504), yes(312, 576, 'No'),
    ],
    links: [...chain(0, 1, 2), { from: 2, fp: 1, to: 3, tp: 3 }, { from: 3, fp: 0, to: 1, tp: 1, elbow: true }, ...chain(2, 4, 5, 6, 8), { from: 6, fp: 1, to: 7, tp: 3 }, { from: 7, fp: 2, to: 8, tp: 1, elbow: true }],
  };
}

function literature(): DesignTemplate {
  const th = T.navy;
  return {
    id: 'flow-literature', name: 'Literature search', category: 'flowchart', sizeId: 'letter',
    blurb: 'From a question to a summary: search the databases, narrow the hits, read reviews, follow the references.',
    boxes: [
      step('fcTerminator', 211, 30, 190, 44, 'Research question', th),
      step('fcProcess', 196, 104, 220, 56, 'Search SciFinder, Reaxys and Web of Science', th, { size: 11 }),
      step('fcDecision', 206, 190, 200, 90, 'Too many hits?', th, DEC),
      step('fcProcess', 436, 207, 150, 56, 'Narrow by substructure, year or type', th, { size: 11 }),
      step('fcProcess', 196, 310, 220, 56, 'Read the recent reviews first', th),
      step('fcProcess', 196, 396, 220, 56, 'Follow the references and the citing papers', th, { size: 11 }),
      step('fcDocument', 196, 482, 220, 64, 'Save to your reference manager', th),
      step('fcTerminator', 211, 586, 190, 44, 'Write the summary', th),
      yes(414, 212), yes(312, 284, 'No'),
    ],
    links: [...chain(0, 1, 2), { from: 2, fp: 1, to: 3, tp: 3 }, { from: 3, fp: 0, to: 1, tp: 1, elbow: true }, ...chain(2, 4, 5, 6, 7)],
  };
}

function sampleSubmission(): DesignTemplate {
  const th = T.teal;
  return {
    id: 'flow-sample', name: 'Sample submission', category: 'flowchart', sizeId: 'letter',
    blurb: 'Sending a sample to a facility: the form, sensitive samples, labels, drop-off and results.',
    boxes: [
      step('fcTerminator', 211, 30, 190, 44, 'Sample ready', th),
      step('fcProcess', 196, 104, 220, 56, 'Fill in the submission form', th),
      step('fcDecision', 196, 190, 220, 96, 'Air- or moisture-sensitive?', th, { ...DEC, size: 11 }),
      step('fcProcess', 30, 326, 160, 64, 'Seal under {f:N2}; note it on the form', th, { size: 11 }),
      step('fcProcess', 216, 330, 180, 56, 'Label the vial: name, group, date', th, { size: 11 }),
      step('fcProcess', 206, 420, 200, 56, 'Drop it off at the facility', th),
      step('fcDocument', 206, 506, 200, 64, 'Results by email', th),
      step('fcTerminator', 211, 604, 190, 44, 'Check against what you expected', th, { size: 11 }),
      yes(150, 214), yes(312, 290, 'No'),
    ],
    links: [...chain(0, 1, 2), { from: 2, fp: 3, to: 3, tp: 0, elbow: true }, { from: 2, fp: 2, to: 4, tp: 0 }, { from: 3, fp: 1, to: 4, tp: 3 }, { from: 4, fp: 2, to: 5, tp: 0 }, ...chain(5, 6, 7)],
  };
}

function screeningFunnel(): DesignTemplate {
  const th = T.plum;
  const stages: [string, string][] = [['10,000', 'Compound library'], ['500', 'Primary screen hits'], ['50', 'Confirmed by dose–response'], ['10', 'Selective, with good ADME'], ['1–2', 'Leads']];
  const fills = ['#efe7f4', '#d6c2e3', '#a983c4', '#7d4f9d', th.dark];
  const widths = [520, 430, 340, 260, 190];
  return {
    id: 'flow-funnel', name: 'Screening funnel', category: 'flowchart', sizeId: 'letter',
    blurb: 'A library narrowed stage by stage to a lead, with how many compounds are left at each stage.',
    boxes: [
      words(46, 24, 520, 40, 'Screening funnel', 26, { bold: true, ink: th.dark }),
      ...stages.map(([n, t], i): Box => ({ geo: 'rect', x: 306 - widths[i] / 2, y: 90 + i * 128, w: widths[i], h: 84, text: `${n}\n${t}`, size: 28, bold: true, fill: fills[i], line: null, ink: i < 2 ? th.dark : '#ffffff' })),
      words(46, 730, 520, 40, 'Change the numbers and the stages to fit your screen.', 12, { italic: true, ink: '#595959' }),
    ],
    links: [1, 2, 3, 4].map((i) => ({ from: i, fp: 2, to: i + 1, tp: 0 })),
  };
}

function risk(): DesignTemplate {
  const th = T.crimson;
  return {
    id: 'flow-risk', name: 'Risk assessment', category: 'flowchart', sizeId: 'letter',
    blurb: 'Before a new reaction: list the hazards, get advice on high-risk work, write the SOP, run it, review it.',
    boxes: [
      step('fcTerminator', 211, 30, 190, 44, 'Plan the reaction', th),
      step('fcProcess', 186, 104, 240, 64, 'List the hazards: reagents, scale, gas, heat, pressure', th, { size: 11 }),
      step('fcDecision', 206, 198, 200, 90, 'High risk?', th, DEC),
      step('fcProcess', 436, 215, 150, 56, 'Talk to your PI and the safety officer', th, { size: 11 }),
      step('fcProcess', 436, 330, 150, 56, 'Add controls; run it small first', th, { size: 11 }),
      step('fcProcess', 206, 330, 200, 56, 'Write the SOP', th),
      step('fcProcess', 206, 416, 200, 56, 'Run it with the controls in place', th, { size: 11 }),
      step('fcProcess', 206, 502, 200, 56, 'Note what happened; update the SOP', th, { size: 11 }),
      step('fcTerminator', 221, 588, 170, 44, 'Done', th),
      yes(414, 220), yes(312, 292, 'No'),
    ],
    links: [...chain(0, 1, 2), { from: 2, fp: 1, to: 3, tp: 3 }, { from: 3, fp: 2, to: 4, tp: 0 }, { from: 4, fp: 3, to: 5, tp: 1 }, { from: 2, fp: 2, to: 5, tp: 0 }, ...chain(5, 6, 7, 8)],
  };
}

function researchCycle(): DesignTemplate {
  const th = T.forest;
  const cx = 306, cy = 400, R = 200;
  const names = ['Ask a question', 'Read and plan', 'Run the experiments', 'Analyze the data', 'Share: talk or paper'];
  const boxes: Box[] = names.map((t, i) => {
    const a = (-90 + i * 72) * Math.PI / 180;
    return step('fcAltProcess', cx + R * Math.cos(a) - 75, cy + R * Math.sin(a) - 32, 150, 64, t, th, { size: 14, bold: true });
  });
  boxes.push(words(46, 30, 520, 40, 'The research cycle', 26, { bold: true, ink: th.dark }));
  boxes.push(words(cx - 90, cy - 30, 180, 60, 'Each answer raises the next question', 13, { italic: true, ink: '#595959' }));
  return {
    id: 'flow-cycle', name: 'Research cycle', category: 'flowchart', sizeId: 'letter',
    blurb: 'Five steps in a loop: question, plan, experiment, analysis, sharing, and back to a new question.',
    boxes,
    links: [{ from: 0, fp: 1, to: 1, tp: 0, elbow: true }, { from: 1, fp: 2, to: 2, tp: 0, elbow: true }, { from: 2, fp: 3, to: 3, tp: 1 }, { from: 3, fp: 0, to: 4, tp: 2, elbow: true }, { from: 4, fp: 0, to: 0, tp: 3, elbow: true }],
  };
}

function optimize(): DesignTemplate {
  const th = T.orange;
  return {
    id: 'flow-optimize', name: 'Optimizing a reaction', category: 'flowchart', sizeId: 'letter',
    blurb: 'From hit conditions to optimized ones: screen catalyst, solvent and temperature, then check on scale.',
    boxes: [
      step('fcTerminator', 221, 30, 170, 44, 'Hit conditions', th),
      step('fcProcess', 206, 104, 200, 50, 'Screen catalysts and ligands', th, { size: 11 }),
      step('fcProcess', 206, 184, 200, 50, 'Screen solvents and bases', th, { size: 11 }),
      step('fcProcess', 206, 264, 200, 50, 'Vary temperature and concentration', th, { size: 11 }),
      step('fcDecision', 196, 344, 220, 100, 'Yield and selectivity good enough?', th, { ...DEC, size: 11 }),
      step('fcProcess', 206, 484, 200, 56, 'Run on 1 g scale', th),
      step('fcDecision', 216, 570, 180, 90, 'Same result?', th, DEC),
      step('fcTerminator', 221, 700, 170, 44, 'Optimized conditions', th),
      yes(150, 366, 'No'), yes(312, 446), yes(312, 662), yes(400, 592, 'No'),
    ],
    links: [...chain(0, 1, 2, 3, 4, 5, 6, 7), { from: 4, fp: 3, to: 1, tp: 3, elbow: true }, { from: 6, fp: 1, to: 3, tp: 1, elbow: true }],
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

function vertical(): DesignTemplate {
  const th = T.teal;
  const ev = [['Sep 2022', 'Started the project'], ['Mar 2023', 'First result: a route to the core'], ['Jan 2024', 'First paper published'], ['Aug 2024', 'Scale-up and substrate scope'], ['May 2025', 'Second paper submitted'], ['Dec 2025', 'Next: mechanism studies']];
  return {
    id: 'timeline-vertical', name: 'Vertical timeline', category: 'timeline', sizeId: 'slide-wide',
    blurb: 'Dates down the left of a line, what happened on the right, a dot for each event.',
    boxes: [
      words(60, 24, 840, 50, 'Project timeline', 32, { bold: true, ink: th.dark }),
      band(218, 112, 4, 390, th.soft, { name: 'Line' }),
      ...ev.flatMap(([d, t], i): Box[] => {
        const y = 110 + i * 66;
        return [
          words(60, y, 140, 34, d, 18, { bold: true, ink: th.dark, align: 'right' }),
          dot(220, y + 17, 11, i === ev.length - 1 ? '#ffffff' : th.accent, i === ev.length - 1 ? { line: th.accent, lw: 3 } : {}),
          words(250, y, 650, 34, t, 18, { align: 'left' }),
        ];
      }),
    ],
    links: [],
  };
}

function aims(): DesignTemplate {
  const th = T.navy;
  const colors = [th.dark, th.accent, '#548235'];
  const rows: [string, number, number, number][] = [
    ['Aim 1: Make the catalysts', 0, -1, -1], ['1a. Ligand library', 0, 0, 1.5], ['1b. Structure and mechanism', 0, 1, 2.5],
    ['Aim 2: Use them in synthesis', 1, -1, -1], ['2a. Substrate scope', 1, 1.5, 3.5], ['2b. Natural product targets', 1, 2.5, 4],
    ['Aim 3: Scale and transfer', 2, -1, -1], ['3a. Flow conditions', 2, 3, 4.5], ['3b. Industry partner tests', 2, 3.5, 5],
  ];
  const x0 = 330, cw = 114, y0 = 120, rh = 42;
  const boxes: Box[] = [words(60, 24, 840, 50, 'Specific aims and timeline', 32, { bold: true, ink: th.dark })];
  for (let yr = 0; yr < 5; yr++) {
    if (yr % 2 === 0) boxes.push(band(x0 + yr * cw, y0, cw, rows.length * rh, '#f4f6fa', { name: 'Year shading' }));
    boxes.push(band(x0 + yr * cw, y0 - 32, cw - 2, 28, th.dark, { text: `Year ${yr + 1}`, size: 14, bold: true, ink: th.onDark }));
  }
  rows.forEach(([t, a, s0, s1], i) => {
    const y = y0 + i * rh;
    if (s0 < 0) boxes.push(words(60, y, 260, rh, t, 16, { bold: true, ink: colors[a], align: 'left' }));
    else {
      boxes.push(words(80, y, 240, rh, t, 14, { align: 'left' }));
      boxes.push({ geo: 'roundRect', x: x0 + s0 * cw, y: y + 9, w: (s1 - s0) * cw - 4, h: rh - 18, fill: colors[a], line: null });
    }
  });
  return { id: 'timeline-aims', name: 'Grant aims', category: 'timeline', sizeId: 'slide-wide', blurb: 'Aims 1 to 3 with their parts as bars across five years, for a grant proposal.', boxes, links: [] };
}

function semester(): DesignTemplate {
  const th = T.forest;
  const x0 = 210, cw = 43, y0 = 130, rh = 64;
  const lanes = ['Lectures', 'Labs', 'Problem sets', 'Exams', 'Project'];
  const boxes: Box[] = [words(60, 24, 840, 50, 'Semester plan', 32, { bold: true, ink: th.dark })];
  for (let w = 0; w < 16; w++) {
    const brk = w === 9;
    boxes.push(band(x0 + w * cw, y0 - 30, cw - 2, 26, brk ? '#bfbfbf' : w % 2 ? th.soft : '#ffffff', { text: brk ? 'Break' : `${w + 1 - (w > 9 ? 1 : 0)}`, size: brk ? 9 : 12, ink: th.dark, name: 'Week' }));
    if (brk) boxes.push(band(x0 + w * cw, y0, cw - 2, lanes.length * rh, '#ededed', { name: 'Break' }));
  }
  boxes.push(words(x0 - 70, y0 - 30, 64, 26, 'Week', 12, { bold: true, ink: th.dark, align: 'right' }));
  lanes.forEach((l, i) => boxes.push(words(60, y0 + i * rh, 140, rh, l, 16, { bold: true, align: 'left', ink: th.ink }), band(60, y0 + (i + 1) * rh - 1, 840, 1, '#d9d9d9', { name: 'Lane line' })));
  const bar = (lane: number, a: number, b: number, color: string, text = ''): Box => ({ geo: 'roundRect', x: x0 + a * cw, y: y0 + lane * rh + 16, w: (b - a) * cw - 4, h: rh - 32, fill: color, line: null, text, size: 11, bold: true, ink: '#ffffff' });
  const mark = (lane: number, w: number, color: string, text = ''): Box[] => [
    { geo: 'diamond', x: x0 + w * cw + cw / 2 - 12, y: y0 + lane * rh + 12, w: 22, h: 22, fill: color, line: null },
    ...(text ? [words(x0 + w * cw - 20, y0 + lane * rh + 36, cw + 40, 18, text, 10, { ink: color, bold: true })] : []),
  ];
  boxes.push(bar(0, 0, 9, th.dark, 'Units 1–4'), bar(0, 10, 16, th.dark, 'Units 5–7'), bar(1, 1, 9, th.accent, 'Labs 1–7'), bar(1, 10, 15, th.accent, 'Labs 8–12'));
  for (const w of [1, 3, 5, 7, 11, 13, 14]) boxes.push(...mark(2, w, '#548235'));
  boxes.push(...mark(3, 4, '#c00000', 'Exam 1'), ...mark(3, 8, '#c00000', 'Exam 2'), ...mark(3, 15, '#c00000', 'Final'));
  boxes.push(bar(4, 6, 9, '#7f6000', 'Proposal'), bar(4, 10, 15, '#7f6000', 'Project'), ...mark(4, 15, '#7f6000', 'Report'));
  return { id: 'timeline-semester', name: 'Semester plan', category: 'timeline', sizeId: 'slide-wide', blurb: 'Fifteen weeks and a break across, with lectures, labs, problem sets, exams and a project in lanes.', boxes, links: [] };
}

function history(): DesignTemplate {
  const th = T.crimson;
  const ev = [['1952', 'First report'], ['1978', 'Catalytic version'], ['1994', 'Asymmetric version'], ['2008', 'Mechanism solved'], ['2021', 'Light-driven variant']];
  const boxes: Box[] = [
    words(60, 16, 840, 44, 'History of the Name reaction', 28, { bold: true, ink: th.dark }),
    band(40, 290, 880, 5, th.dark, { name: 'Axis' }),
  ];
  ev.forEach(([yr, t], i) => {
    const xc = 110 + i * 185, up = i % 2 === 0, y = up ? 70 : 318;
    boxes.push(band(xc - 1, up ? y + 196 : 295, 2, up ? 292 - y - 196 : y - 295, th.dark, { name: 'Tick' }));
    boxes.push(dot(xc, 292, 9, th.accent));
    boxes.push({ geo: 'roundRect', x: xc - 82, y, w: 164, h: 196, fill: th.soft, line: th.dark, lw: 1, name: 'Card' });
    boxes.push(words(xc - 78, y + 4, 156, 28, yr, 20, { bold: true, ink: th.dark }));
    boxes.push(spot(xc - 70, y + 34, 140, 80, 'Structure or scheme', 9, { fill: '#ffffff' }));
    boxes.push(words(xc - 78, y + 118, 156, 24, t, 13, { bold: true }));
    boxes.push(words(xc - 78, y + 144, 156, 46, `Author, A. {i:J. Am. Chem. Soc.} {b:${yr}}, {i:00}, 000.`, 9, { ink: '#404040' }));
  });
  return { id: 'timeline-history', name: 'History of a reaction', category: 'timeline', sizeId: 'slide-wide', blurb: 'Key papers by year along a line, each with a structure and its reference.', boxes, links: [] };
}

function annual(): DesignTemplate {
  const th = T.plum;
  const cx = 480, cy = 300, R = 160;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const boxes: Box[] = [
    words(40, 16, 400, 44, 'The group’s year', 28, { bold: true, ink: th.dark, align: 'left' }),
    { geo: 'ellipse', x: cx - R, y: cy - R, w: 2 * R, h: 2 * R, fill: null, line: th.soft, lw: 22, name: 'Ring' },
  ];
  months.forEach((m, i) => {
    const a = (-90 + i * 30 + 15) * Math.PI / 180;
    boxes.push(words(cx + R * Math.cos(a) - 18, cy + R * Math.sin(a) - 9, 36, 18, m, 10, { bold: true, ink: th.dark }));
  });
  for (let q = 0; q < 4; q++) {
    const a = (-90 + q * 90) * Math.PI / 180;
    boxes.push(dot(cx + R * Math.cos(a), cy + R * Math.sin(a), 9, th.accent));
  }
  boxes.push(words(cx - 100, cy - 40, 200, 80, 'Plan the year around these', 16, { italic: true, ink: '#595959' }));
  const q: [number, number, string][] = [
    [672, 80, 'Jan–Mar\n• Grant deadlines\n• Set the group’s goals'], [672, 330, 'Apr–Jun\n• ACS spring meeting\n• Defenses and graduation'],
    [40, 330, 'Jul–Sep\n• Summer students\n• Write papers'], [40, 80, 'Oct–Dec\n• Recruit new students\n• Group retreat'],
  ];
  for (const [x, y, t] of q) boxes.push({ geo: 'roundRect', x, y, w: 248, h: 150, text: t, size: 24, bold: true, ink: th.dark, fill: th.soft, line: null, align: 'left', valign: 'top' });
  return { id: 'timeline-annual', name: 'Annual cycle', category: 'timeline', sizeId: 'slide-wide', blurb: 'The twelve months around a circle, with what happens in each quarter beside it.', boxes, links: [] };
}

function milestones(): DesignTemplate {
  const th = T.blue;
  const ev = [['2022', 'The idea'], ['2023', 'First molecule made'], ['2024', 'Device works'], ['2025', 'Patent filed'], ['2026', 'Company founded']];
  const boxes: Box[] = [words(60, 20, 840, 50, 'Milestones', 32, { bold: true, ink: th.dark })];
  ev.forEach(([d, t], i) => {
    const xc = 130 + i * 175;
    boxes.push(spot(xc - 75, 96, 150, 150, 'Picture', 11, { fill: '#f2f2f2' }));
    boxes.push(band(xc - 1, 246, 2, 80, th.dark, { name: 'Tick' }));
    boxes.push(dot(xc, 336, 12, th.accent, { line: '#ffffff', lw: 3 }));
    boxes.push(words(xc - 80, 360, 160, 30, d, 20, { bold: true, ink: th.dark }));
    boxes.push(words(xc - 80, 392, 160, 60, t, 15, { valign: 'top' }));
  });
  return { id: 'timeline-milestones', name: 'Milestones with pictures', category: 'timeline', sizeId: 'slide-wide', blurb: 'Five milestones along an arrow, a picture above each and the date and event below.', boxes, links: [], arrows: [[50, 336, 920, 336, { color: th.dark, width: 4 }]] };
}

function twoTrack(): DesignTemplate {
  const th = T.slate;
  const x0 = 230, cw = 140;
  const boxes: Box[] = [
    words(60, 20, 840, 50, 'Two tracks', 32, { bold: true, ink: th.dark }),
    band(60, 96, 860, 170, th.soft, { name: 'Track 1' }), band(60, 316, 860, 170, '#e0f2f1', { name: 'Track 2' }),
    band(60, 96, 150, 170, th.dark, { text: 'Research', size: 18, bold: true, ink: th.onDark }),
    band(60, 316, 150, 170, th.accent, { text: 'Teaching and service', size: 16, bold: true, ink: '#ffffff' }),
    band(x0, 288, 700, 6, '#bfbfbf', { name: 'Axis' }),
  ];
  ['2022', '2023', '2024', '2025', '2026'].forEach((y, i) => boxes.push(words(x0 + i * cw, 268, cw, 18, y, 13, { bold: true, ink: th.dark, align: 'left' }), band(x0 + i * cw, 282, 2, 18, '#7f7f7f', { name: 'Tick' })));
  const chip = (t: number, y: number, text: string, fill: string): Box => ({ geo: 'roundRect', x: x0 + t * cw, y, w: 150, h: 46, text, size: 13, bold: true, ink: '#ffffff', fill, line: null });
  boxes.push(chip(0.1, 116, 'Project 1 starts', th.dark), chip(1.3, 196, 'First paper', th.dark), chip(2.5, 116, 'Fellowship', th.dark), chip(3.7, 196, 'Second paper', th.dark));
  boxes.push(chip(0.4, 336, 'TA, General Chemistry', th.accent), chip(1.7, 416, 'Mentored 2 students', th.accent), chip(2.9, 336, 'Outreach lead', th.accent), chip(3.7, 416, 'Guest lecture', th.accent));
  return { id: 'timeline-two-track', name: 'Two-track timeline', category: 'timeline', sizeId: 'slide-wide', blurb: 'Two lanes over one year axis, such as research above and teaching and service below.', boxes, links: [] };
}

export const DIAGRAMS: DesignTemplate[] = [
  purification(), troubleshoot(), characterize(), literature(), sampleSubmission(), screeningFunnel(), risk(), researchCycle(), optimize(),
  acidBase(), filtration(),
  phdRoadmap(), gantt(), vertical(), aims(), semester(), history(), annual(), milestones(), twoTrack(),
];
