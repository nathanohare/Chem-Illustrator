// Flyers for Design mode: one-page notices for a chemistry department (seminars, defenses, lab
// openings, safety reminders, journal club, outreach). Letter size, portrait, unless said.

import { type Box, type DesignTemplate, type Theme, THEMES, band, dot, icon, spot, words } from './template-kit';

const T = THEMES;
const W = 612, H = 792;

/** Date, time and place, each with its icon, one under the other. */
function details(x: number, y: number, w: number, th: Theme, size = 16, lines = ['Thursday, March 12', '4:00 PM', 'Room 101, Chemistry Building']): Box[] {
  const ic = ['calendar', 'clock-outline', 'map-marker-outline'];
  return lines.flatMap((t, i): Box[] => [
    icon(ic[i], x, y + i * (size * 2.1), size * 1.4, th.accent),
    words(x + size * 2, y + i * (size * 2.1) - size * 0.1, w - size * 2, size * 1.6, t, size, { align: 'left', ink: th.ink }),
  ]);
}

function seminar(): DesignTemplate {
  const th = T.navy;
  return {
    id: 'flyer-seminar', name: 'Seminar', category: 'flyer', sizeId: 'letter',
    blurb: 'A department seminar: speaker photo, name and affiliation, talk title, and when and where.',
    boxes: [
      band(0, 0, W, 96, th.dark, { text: 'Department of Chemistry Seminar', size: 26, bold: true, ink: th.onDark }),
      band(0, 96, W, 8, th.accent),
      { geo: 'ellipse', x: 216, y: 136, w: 180, h: 180, fill: null, line: '#7f7f7f', dashed: true, text: 'Speaker photo', size: 12, ink: '#7f7f7f', name: 'Placeholder: Speaker photo' },
      words(48, 330, 516, 40, 'Professor Speaker Name', 28, { bold: true, ink: th.dark }),
      words(48, 370, 516, 26, 'Department of Chemistry, University', 15, { ink: '#595959' }),
      words(48, 420, 516, 90, '“Title of the Talk: A Clear Subtitle That Says What It Is About”', 22, { italic: true, ink: th.accent }),
      spot(156, 520, 300, 110, 'A structure or picture from the talk', 11),
      ...details(170, 648, 300, th),
      band(0, H - 34, W, 34, th.soft, { text: 'Hosted by Professor Host Name · Refreshments at 3:45 PM', size: 11, ink: th.dark }),
    ],
    links: [],
  };
}

function defense(): DesignTemplate {
  const th = T.crimson;
  return {
    id: 'flyer-defense', name: 'Thesis defense', category: 'flyer', sizeId: 'letter',
    blurb: 'A PhD or MS defense: the candidate, the thesis title, a structure from the work, the committee.',
    boxes: [
      band(36, 36, 8, 720, th.dark, { name: 'Side rule' }),
      words(68, 48, 500, 30, 'PhD DISSERTATION DEFENSE', 16, { bold: true, ink: th.accent, align: 'left' }),
      words(68, 86, 500, 50, 'Candidate Name', 36, { bold: true, ink: th.dark, align: 'left' }),
      words(68, 150, 500, 110, 'Title of the Dissertation, Which May Run to Two or Three Lines', 22, { ink: th.ink, align: 'left', valign: 'top' }),
      spot(68, 280, 476, 210, 'A structure or scheme from the work', 12),
      ...details(68, 520, 476, th),
      words(68, 640, 476, 100, 'Advisor: Professor Name\nCommittee: Professor One, Professor Two, Professor Three', 12, { align: 'left', valign: 'top', ink: '#404040' }),
    ],
    links: [],
  };
}

function joinLab(): DesignTemplate {
  const th = T.teal;
  const areas = ['Research area one', 'Research area two', 'Research area three'];
  return {
    id: 'flyer-join', name: 'Join our lab', category: 'flyer', sizeId: 'letter',
    blurb: 'Recruiting students: three research areas with pictures, what you will learn, and how to apply.',
    boxes: [
      band(0, 0, W, 170, th.dark, { name: 'Header' }),
      words(40, 26, 532, 60, 'Join our lab!', 44, { bold: true, ink: th.onDark, align: 'left' }),
      words(40, 92, 532, 60, 'The Name Group is looking for undergraduate and graduate researchers.', 16, { ink: th.onDark, align: 'left', valign: 'top' }),
      ...areas.flatMap((a, i): Box[] => [
        spot(40 + i * 184, 196, 164, 120, 'Picture', 11),
        words(40 + i * 184, 322, 164, 40, a, 13, { bold: true, ink: th.dark }),
      ]),
      band(40, 380, 532, 190, th.soft),
      words(60, 392, 492, 30, 'What you will learn', 18, { bold: true, ink: th.dark, align: 'left' }),
      words(60, 426, 492, 140, '• Synthesis and purification\n• NMR, MS and chromatography\n• Presenting your work at meetings', 14, { align: 'left', valign: 'top', ink: th.ink }),
      words(40, 600, 380, 120, 'How to apply\nEmail name@university.edu with a short note about your interests.', 18, { bold: true, align: 'left', valign: 'top', ink: th.dark }),
      spot(452, 596, 120, 120, 'QR code', 11),
    ],
    links: [],
  };
}

function safety(): DesignTemplate {
  const red = '#c00000';
  const items: [string, string][] = [['safety-goggles', 'Safety glasses'], ['tshirt-crew', 'Lab coat'], ['hand-back-left', 'Gloves'], ['shoe-formal', 'Closed shoes']];
  return {
    id: 'flyer-safety', name: 'Safety reminder', category: 'flyer', sizeId: 'letter',
    blurb: 'A lab-door notice: the protective equipment to wear, with a large icon for each, and who to call.',
    boxes: [
      band(0, 0, W, 130, red, { text: 'Safety first', size: 48, bold: true, ink: '#ffffff' }),
      words(40, 150, 532, 40, 'Wear these at all times in this lab', 22, { bold: true }),
      ...items.flatMap(([ic, t], i): Box[] => {
        const x = 70 + (i % 2) * 250, y = 220 + Math.floor(i / 2) * 230;
        return [dot(x + 86, y + 80, 80, '#fbe5e5'), icon(ic, x + 36, y + 30, 100, red), words(x, y + 172, 172, 30, t, 18, { bold: true })];
      }),
      band(40, 690, 532, 66, '#f2f2f2', { text: 'Emergency: 911 · Lab manager: Name, ext. 0000', size: 16, bold: true }),
    ],
    links: [],
  };
}

function journalClub(): DesignTemplate {
  const th = T.orange;
  return {
    id: 'flyer-journal-club', name: 'Journal club', category: 'flyer', sizeId: 'letter',
    blurb: 'The paper being discussed (title, authors, journal and its TOC graphic), the presenter and when.',
    boxes: [
      words(40, 40, 532, 60, 'Journal Club', 44, { bold: true, ink: th.dark, align: 'left' }),
      band(40, 104, 120, 6, th.accent),
      spot(40, 140, 532, 250, 'The paper’s TOC graphic', 12),
      words(40, 404, 532, 70, '“Title of the Paper Being Discussed”', 20, { bold: true, align: 'left', valign: 'top' }),
      words(40, 476, 532, 44, 'Author, A.; Author, B. {i:J. Am. Chem. Soc.} {b:2026}, {i:148}, 1234.', 13, { align: 'left', valign: 'top', ink: '#404040' }),
      band(40, 540, 532, 200, th.soft),
      words(60, 556, 492, 30, 'Presented by Student Name', 18, { bold: true, ink: th.dark, align: 'left' }),
      ...details(60, 606, 480, th, 15),
    ],
    links: [],
  };
}

function outreach(): DesignTemplate {
  const th = T.plum;
  return {
    id: 'flyer-outreach', name: 'Chemistry demo show', category: 'flyer', sizeId: 'letter',
    blurb: 'An outreach event for families: a bold title, three demo pictures and a free-admission banner.',
    boxes: [
      band(0, 0, W, H, '#fbf7fd', { name: 'Background' }),
      icon('flask-outline', 36, 30, 80, th.accent), icon('atom', 496, 30, 80, th.accent),
      words(120, 30, 372, 120, 'Chemistry Magic Show', 44, { bold: true, ink: th.dark }),
      words(60, 170, 492, 40, 'Explosions, color changes and liquid nitrogen!', 18, { ink: th.dark }),
      ...[0, 1, 2].map((i) => ({ ...spot(40 + i * 184, 230, 164, 164, 'Demo picture', 11), geo: 'ellipse' })),
      band(40, 420, 532, 70, th.accent, { text: 'FREE · All ages welcome', size: 26, bold: true, ink: '#ffffff' }),
      ...details(160, 520, 340, th, 18, ['Saturday, October 24', '10:00 AM – noon', 'Lecture Hall 1']),
      words(40, 690, 532, 60, 'Presented by the Chemistry Club and the Department of Chemistry', 13, { ink: '#595959' }),
    ],
    links: [],
  };
}

/** A table of text cells: a dark header row, then rows with every other one shaded. */
function table(x: number, y: number, widths: number[], rh: number, head: string[], rows: string[][], th: Theme, size = 12): Box[] {
  const out: Box[] = [];
  const W = widths.reduce((a, b) => a + b, 0);
  out.push(band(x, y, W, rh, th.dark, { name: 'Header row' }));
  rows.forEach((_, r) => { if (r % 2 === 0) out.push(band(x, y + (r + 1) * rh, W, rh, th.soft, { name: 'Row shading' })); });
  let cx = x;
  widths.forEach((w, c) => {
    out.push(words(cx + 6, y, w - 12, rh, head[c], size, { bold: true, ink: th.onDark, align: 'left' }));
    rows.forEach((row, r) => out.push(words(cx + 6, y + (r + 1) * rh, w - 12, rh, row[c] ?? '', size, { align: 'left', ink: th.ink })));
    cx += w;
  });
  out.push({ geo: 'rect', x, y, w: W, h: (rows.length + 1) * rh, fill: null, line: th.dark, lw: 1, name: 'Table border' });
  return out;
}

/** A number in a filled circle. */
const numbered = (n: number, x: number, y: number, d: number, th: Theme): Box =>
  ({ geo: 'ellipse', x, y, w: d, h: d, fill: th.dark, line: null, text: `${n}`, size: d * 0.5, bold: true, ink: th.onDark });

function colloquium(): DesignTemplate {
  const th = T.navy;
  const talks = [['Jan 15', 'Professor Name, University', 'Title of the talk'], ['Jan 29', 'Professor Name, University', 'Title of the talk'], ['Feb 12', 'Dr. Name, Company', 'Title of the talk'],
    ['Feb 26', 'Professor Name, University', 'Title of the talk'], ['Mar 12', 'Professor Name, University', 'Title of the talk'], ['Mar 26', 'Professor Name, University', 'Title of the talk'],
    ['Apr 9', 'Dr. Name, National Lab', 'Title of the talk'], ['Apr 23', 'Professor Name, University', 'Title of the talk']];
  return {
    id: 'flyer-colloquium', name: 'Colloquium series', category: 'flyer', sizeId: 'letter',
    blurb: 'A semester of speakers as a list: date, speaker and affiliation, and talk title.',
    boxes: [
      band(0, 0, W, 120, th.dark, { name: 'Header' }),
      words(40, 22, 532, 50, 'Spring 2027 Colloquium Series', 28, { bold: true, ink: th.onDark, align: 'left' }),
      words(40, 72, 532, 30, 'Department of Chemistry · Thursdays at 4:00 PM · Room 101', 15, { ink: th.onDark, align: 'left' }),
      ...talks.flatMap(([d, who, what], i): Box[] => {
        const y = 150 + i * 72;
        return [
          band(40, y, 92, 60, i % 2 ? th.accent : th.dark, { text: d, size: 18, bold: true, ink: '#ffffff' }),
          words(148, y + 2, 424, 28, who, 16, { bold: true, ink: th.dark, align: 'left' }),
          words(148, y + 30, 424, 26, `“${what}”`, 13, { italic: true, align: 'left', ink: '#404040' }),
        ];
      }),
      band(0, H - 34, W, 34, th.soft, { text: 'Refreshments at 3:45 PM · Host: Professor Name', size: 11, ink: th.dark }),
    ],
    links: [],
  };
}

function groupMeeting(): DesignTemplate {
  const th = T.teal;
  const dates = ['Sep 4', 'Sep 11', 'Sep 18', 'Sep 25', 'Oct 2', 'Oct 9', 'Oct 16', 'Oct 23', 'Oct 30', 'Nov 6', 'Nov 13', 'Nov 20', 'Dec 4', 'Dec 11'];
  const rows = dates.map((d, i) => [d, `Name ${i + 1}`, `Name ${((i + 5) % 14) + 1}`, i % 4 === 3 ? 'Cleanup after' : '']);
  return {
    id: 'flyer-group-meeting', name: 'Group meeting schedule', category: 'flyer', sizeId: 'letter',
    blurb: 'A semester of group meetings as a table: date, research update, literature talk and notes.',
    boxes: [
      words(40, 32, 532, 44, 'Group Meeting Schedule', 30, { bold: true, ink: th.dark, align: 'left' }),
      words(40, 76, 532, 26, 'Fall 2026 · Mondays at 9:00 AM · Room 205', 14, { ink: '#404040', align: 'left' }),
      band(40, 106, 532, 4, th.accent, { name: 'Rule' }),
      ...table(40, 128, [110, 150, 150, 122], 36, ['Date', 'Research update', 'Literature talk', 'Notes'], rows, th, 13),
      words(40, 690, 532, 60, 'Swap with someone if you can’t make your date, and tell the group by Friday.', 12, { align: 'left', valign: 'top', ink: '#404040' }),
    ],
    links: [],
  };
}

function waste(): DesignTemplate {
  const th = T.slate;
  const kinds: [string, string, string, string][] = [
    ['fire', '#c55a11', 'Non-halogenated solvents', 'Acetone, hexanes, ethyl acetate, alcohols'],
    ['skull-crossbones', '#7030a0', 'Halogenated solvents', 'Dichloromethane, chloroform'],
    ['water', '#2f5597', 'Aqueous waste', 'Neutralized washes, no heavy metals'],
    ['alert-outline', '#bf9000', 'Heavy metals', 'Pd, Cu, Cr, Hg residues and solutions'],
    ['trash-can-outline', '#548235', 'Solid waste', 'Silica, Celite, filter paper, gloves'],
    ['alert-octagon', '#c00000', 'Sharps and broken glass', 'Needles in sharps bins; glass in the glass box'],
  ];
  return {
    id: 'flyer-waste', name: 'Chemical waste guide', category: 'flyer', sizeId: 'letter',
    blurb: 'Where each kind of waste goes: six containers, each with a hazard icon and examples.',
    boxes: [
      band(0, 0, W, 100, th.dark, { name: 'Header' }),
      words(40, 18, 532, 44, 'Where does it go?', 32, { bold: true, ink: th.onDark, align: 'left' }),
      words(40, 60, 532, 28, 'Chemical waste guide for this lab', 15, { ink: th.onDark, align: 'left' }),
      ...kinds.flatMap(([ic, c, t, ex], i): Box[] => {
        const x = 40 + (i % 2) * 272, y = 124 + Math.floor(i / 2) * 182;
        return [
          { geo: 'rect', x, y, w: 260, h: 170, fill: '#ffffff', line: c, lw: 2, name: 'Card' },
          band(x, y, 260, 56, c, { name: 'Card header' }),
          icon(ic, x + 12, y + 8, 40, '#ffffff'),
          words(x + 60, y, 192, 56, t, 15, { bold: true, ink: '#ffffff', align: 'left' }),
          words(x + 14, y + 64, 232, 44, ex, 12, { align: 'left', valign: 'top', ink: '#262626' }),
          words(x + 14, y + 116, 232, 44, 'Container: color, label, where it is', 11, { align: 'left', valign: 'top', italic: true, ink: '#595959' }),
        ];
      }),
      band(40, 690, 532, 66, '#fbe5e5', { text: 'Never pour solvents down the drain. Keep containers closed and labeled.', size: 15, bold: true, ink: '#c00000' }),
    ],
    links: [],
  };
}

function quickGuide(): DesignTemplate {
  const th = T.blue;
  const steps = ['Log in and sign the logbook', 'Insert the sample', 'Lock and shim', 'Pick the experiment and start', 'Save and process the data', 'Eject the sample and log out'];
  return {
    id: 'flyer-quick-guide', name: 'Instrument quick guide', category: 'flyer', sizeId: 'letter',
    blurb: 'Six numbered steps, each with a picture, for posting beside an instrument.',
    boxes: [
      words(40, 28, 532, 44, 'How to run the NMR', 32, { bold: true, ink: th.dark, align: 'left' }),
      words(40, 72, 532, 24, 'Quick guide · read the full instructions before your first run', 13, { ink: '#404040', align: 'left' }),
      band(40, 100, 532, 4, th.accent, { name: 'Rule' }),
      ...steps.flatMap((t, i): Box[] => {
        const x = 40 + (i % 2) * 272, y = 124 + Math.floor(i / 2) * 196;
        return [spot(x + 44, y, 216, 130, 'Picture', 11), numbered(i + 1, x, y, 34, th), words(x + 44, y + 136, 216, 46, t, 14, { bold: true, align: 'left', valign: 'top', ink: th.ink })];
      }),
      band(40, 718, 532, 44, th.soft, { text: 'Problems? Call the facility manager, ext. 0000', size: 14, bold: true, ink: th.dark }),
    ],
    links: [],
  };
}

function workshop(): DesignTemplate {
  const th = T.forest;
  return {
    id: 'flyer-workshop', name: 'Workshop or training', category: 'flyer', sizeId: 'letter',
    blurb: 'A hands-on workshop: the topic, what you will learn, when and where, and a QR code to register.',
    boxes: [
      band(0, 0, W, 210, th.dark, { name: 'Header' }),
      words(40, 30, 532, 30, 'HANDS-ON WORKSHOP', 16, { bold: true, ink: th.accent, align: 'left' }),
      words(40, 64, 532, 110, 'Topic of the Workshop in a Few Words', 36, { bold: true, ink: th.onDark, align: 'left', valign: 'top' }),
      spot(40, 236, 532, 170, 'Picture', 12),
      words(40, 426, 300, 30, 'What you will learn', 18, { bold: true, ink: th.dark, align: 'left' }),
      words(40, 460, 300, 130, '• The first skill\n• The second skill\n• The third skill\n• Bring your own sample', 14, { align: 'left', valign: 'top' }),
      ...details(360, 432, 212, th, 14),
      spot(452, 596, 120, 120, 'QR code', 11),
      words(40, 610, 390, 90, 'Free, but space is limited: register by Friday, March 6.\nLed by Name, Facility', 14, { align: 'left', valign: 'top', ink: th.dark }),
    ],
    links: [],
  };
}

function callAbstracts(): DesignTemplate {
  const th = T.plum;
  return {
    id: 'flyer-call-abstracts', name: 'Call for abstracts', category: 'flyer', sizeId: 'letter',
    blurb: 'A symposium’s call for abstracts: the theme, key dates, how to submit and a QR code.',
    boxes: [
      band(0, 0, W, 250, th.dark, { name: 'Header' }),
      words(40, 34, 532, 30, 'CALL FOR ABSTRACTS', 18, { bold: true, ink: '#e6d4ef', align: 'left' }),
      words(40, 70, 532, 100, 'Name of the Symposium 2027', 38, { bold: true, ink: th.onDark, align: 'left', valign: 'top' }),
      words(40, 180, 532, 50, 'Theme: one line on the topics the meeting covers', 16, { italic: true, ink: th.onDark, align: 'left' }),
      words(40, 276, 532, 30, 'Key dates', 20, { bold: true, ink: th.dark, align: 'left' }),
      ...table(40, 312, [300, 232], 36, ['', 'Date'], [['Abstract deadline', 'February 1'], ['Decisions sent', 'February 20'], ['Registration closes', 'March 15'], ['Symposium', 'April 10–11']], th, 14),
      words(40, 520, 380, 30, 'How to submit', 20, { bold: true, ink: th.dark, align: 'left' }),
      words(40, 554, 380, 120, 'One page, with a title, authors and a graphic. Talks and posters. Submit at the link or the QR code.\nsymposium.university.edu', 14, { align: 'left', valign: 'top' }),
      spot(452, 530, 120, 120, 'QR code', 11),
      band(0, H - 40, W, 40, th.soft, { text: 'Organized by the Department of Chemistry', size: 12, ink: th.dark }),
    ],
    links: [],
  };
}

function congrats(): DesignTemplate {
  const th = T.orange;
  return {
    id: 'flyer-congrats', name: 'Congratulations', category: 'flyer', sizeId: 'letter',
    blurb: 'Celebrate an award, a defense or a paper: photo, name, the honor and a line about it.',
    boxes: [
      band(0, 0, W, H, '#fffaf3', { name: 'Background' }),
      icon('star', 60, 40, 48, '#e0a800'), icon('star', 504, 40, 48, '#e0a800'),
      words(110, 34, 392, 60, 'Congratulations!', 44, { bold: true, ink: th.dark }),
      { geo: 'ellipse', x: 186, y: 130, w: 240, h: 240, fill: null, line: '#7f7f7f', dashed: true, text: 'Photo', size: 12, ink: '#7f7f7f', name: 'Placeholder: Photo' },
      { geo: 'ellipse', x: 178, y: 122, w: 256, h: 256, fill: null, line: th.accent, lw: 4, name: 'Ring' },
      words(40, 400, 532, 50, 'Name Surname', 34, { bold: true, ink: th.dark }),
      icon('trophy', 276, 460, 60, '#e0a800'),
      words(40, 530, 532, 70, 'on winning the Name of the Award', 24, { ink: th.accent }),
      words(80, 610, 452, 100, 'One or two lines on what it is for, what the work was, and who it was with.', 15, { valign: 'top', ink: '#404040' }),
      words(40, 730, 532, 30, 'From everyone in the Name Group', 13, { italic: true, ink: '#595959' }),
    ],
    links: [],
  };
}

function position(): DesignTemplate {
  const th = T.navy;
  return {
    id: 'flyer-position', name: 'Position available', category: 'flyer', sizeId: 'letter',
    blurb: 'A postdoc or student opening: the group, the project, who should apply and how.',
    boxes: [
      band(0, 0, W, 150, th.dark, { name: 'Header' }),
      words(40, 26, 532, 28, 'POSITION AVAILABLE', 15, { bold: true, ink: '#f4b183', align: 'left' }),
      words(40, 56, 532, 80, 'Postdoctoral Researcher in Synthetic Chemistry', 30, { bold: true, ink: th.onDark, align: 'left', valign: 'top' }),
      words(40, 174, 532, 26, 'The group', 18, { bold: true, ink: th.dark, align: 'left' }),
      words(40, 202, 532, 60, 'Two lines on the group: what it works on, where, and who leads it.', 13, { align: 'left', valign: 'top' }),
      words(40, 268, 532, 26, 'The project', 18, { bold: true, ink: th.dark, align: 'left' }),
      words(40, 296, 330, 110, 'Three or four lines on the project and what the person will do day to day.', 13, { align: 'left', valign: 'top' }),
      spot(392, 274, 180, 132, 'A scheme or picture', 11),
      words(40, 420, 532, 26, 'You have', 18, { bold: true, ink: th.dark, align: 'left' }),
      words(40, 448, 532, 110, '• A PhD in chemistry or a related field\n• Experience with air-free synthesis and NMR\n• Good written and spoken English', 13, { align: 'left', valign: 'top' }),
      band(40, 576, 532, 140, th.soft),
      words(60, 590, 360, 30, 'How to apply', 18, { bold: true, ink: th.dark, align: 'left' }),
      words(60, 622, 360, 90, 'Send a CV, a cover letter and two references to name@university.edu. Review begins March 1; start date is flexible.', 13, { align: 'left', valign: 'top' }),
      spot(440, 586, 120, 120, 'QR code', 11),
    ],
    links: [],
  };
}

function glovebox(): DesignTemplate {
  const th = T.slate;
  const rules = ['Log every use in the logbook', 'Cycle the antechamber 3 times', 'No water, no open solvents with O–H', 'Close every bottle before you leave', 'Keep the balance and the floor clean', 'Check the gloves for holes before you start', 'Tell the manager if {f:O2} or {f:H2O} rises', 'Take your waste out the same day'];
  return {
    id: 'flyer-glovebox', name: 'Glovebox rules', category: 'flyer', sizeId: 'letter',
    blurb: 'Large numbered rules for posting on the glovebox, with who to call when something goes wrong.',
    boxes: [
      band(0, 0, W, 110, th.dark, { text: 'Glovebox rules', size: 44, bold: true, ink: th.onDark }),
      ...rules.flatMap((t, i): Box[] => {
        const y = 136 + i * 68;
        return [numbered(i + 1, 40, y, 48, th), words(104, y - 6, 468, 60, t, 20, { bold: true, align: 'left', ink: th.ink })];
      }),
      band(40, 700, 532, 60, '#fbe5e5', { text: 'Problems? Glovebox manager: Name, ext. 0000', size: 16, bold: true, ink: '#c00000' }),
    ],
    links: [],
  };
}

function cleanup(): DesignTemplate {
  const th = T.teal;
  const tasks = ['Empty the waste containers', 'Clean the fume hoods', 'Throw out old samples', 'Wipe the benches and balances', 'Restock gloves and pipettes', 'Check the solvent stills'];
  return {
    id: 'flyer-cleanup', name: 'Lab cleanup day', category: 'flyer', sizeId: 'letter',
    blurb: 'A cleanup day: when, a checklist of jobs, and pizza afterwards.',
    boxes: [
      band(0, 0, W, 170, th.dark, { name: 'Header' }),
      icon('broom', 40, 30, 110, '#ffffff'),
      words(170, 36, 402, 60, 'Lab Cleanup Day', 40, { bold: true, ink: th.onDark, align: 'left' }),
      words(170, 98, 402, 40, 'Everyone helps · about two hours', 16, { ink: th.onDark, align: 'left' }),
      ...details(60, 204, 500, th, 18, ['Friday, May 8', '1:00 – 3:00 PM', 'All group labs, Room 210–214']),
      words(40, 340, 532, 30, 'The jobs', 22, { bold: true, ink: th.dark, align: 'left' }),
      ...tasks.flatMap((t, i): Box[] => {
        const y = 382 + i * 44;
        return [{ geo: 'rect', x: 50, y: y + 4, w: 24, h: 24, fill: '#ffffff', line: th.dark, lw: 2, name: 'Check box' }, words(88, y, 300, 32, t, 16, { align: 'left' })];
      }),
      band(400, 400, 172, 190, th.soft),
      icon('pizza', 446, 420, 80, th.accent),
      words(400, 508, 172, 70, 'Pizza for everyone afterwards!', 16, { bold: true, ink: th.dark }),
      words(40, 680, 532, 60, 'Sign up for a job on the sheet by the door. Wear your lab coat and goggles.', 14, { ink: '#404040' }),
    ],
    links: [],
  };
}

function posterSession(): DesignTemplate {
  const th = T.blue;
  return {
    id: 'flyer-poster-session', name: 'Poster session', category: 'flyer', sizeId: 'letter',
    blurb: 'A department poster session: when and where, sessions by research area, and prizes.',
    boxes: [
      band(0, 0, W, 230, th.dark, { name: 'Header' }),
      icon('presentation', 40, 36, 120, '#ffffff'),
      words(180, 40, 392, 110, 'Graduate Poster Session', 38, { bold: true, ink: th.onDark, align: 'left', valign: 'top' }),
      words(180, 160, 392, 50, 'Come see what everyone is working on', 16, { ink: th.onDark, align: 'left' }),
      ...details(60, 262, 500, th, 18, ['Wednesday, April 15', '3:00 – 5:00 PM', 'Atrium, Chemistry Building']),
      ...table(40, 390, [180, 352], 34, ['Time', 'Session'], [['3:00 – 3:40', 'Organic and medicinal chemistry'], ['3:40 – 4:20', 'Inorganic and materials chemistry'], ['4:20 – 5:00', 'Physical, analytical and biochemistry']], th, 14),
      band(40, 560, 532, 120, th.soft),
      icon('trophy', 60, 580, 80, '#bf9000'),
      words(160, 574, 392, 100, 'Prizes for the best posters\nJudged by faculty; announced at 5:00 PM', 20, { bold: true, align: 'left', ink: th.dark }),
      words(40, 700, 532, 50, 'Refreshments provided. Presenters set up by 2:45 PM.', 14, { ink: '#404040' }),
    ],
    links: [],
  };
}

function moleDay(): DesignTemplate {
  const th = T.plum;
  return {
    id: 'flyer-mole-day', name: 'Mole Day', category: 'flyer', sizeId: 'letter',
    blurb: 'A Mole Day celebration on October 23: the number, the events and the time (6:02).',
    boxes: [
      band(0, 0, W, H, '#f6f0fa', { name: 'Background' }),
      words(40, 40, 532, 40, 'Celebrate', 26, { italic: true, ink: th.accent }),
      words(40, 80, 532, 80, 'Mole Day!', 64, { bold: true, ink: th.dark }),
      dot(306, 290, 110, th.dark, { name: 'Circle' }),
      words(206, 250, 200, 50, '6.02 × 10{sup:23}', 32, { bold: true, ink: '#ffffff' }),
      words(206, 300, 200, 30, 'October 23 · 6:02', 16, { ink: '#ffffff' }),
      icon('atom', 60, 220, 90, th.accent), icon('flask-outline', 462, 220, 90, th.accent),
      words(40, 430, 532, 30, 'What’s on', 22, { bold: true, ink: th.dark }),
      words(110, 466, 392, 140, '• Mole-themed treats\n• Demos and a chemistry quiz\n• Make your own mole plush\n• Prizes for the best mole pun', 16, { align: 'left', valign: 'top' }),
      ...details(160, 620, 340, th, 16, ['Friday, October 23', '6:02 PM', 'Chemistry Building lobby']),
      words(40, 740, 532, 30, 'Hosted by the Chemistry Club', 12, { ink: '#595959' }),
    ],
    links: [],
  };
}

function equipmentNotice(): DesignTemplate {
  const red = '#c00000';
  const L = 792;
  return {
    id: 'flyer-equipment', name: 'Equipment notice', category: 'flyer', sizeId: 'letter-wide',
    blurb: 'A landscape sign for an instrument: out of order (or change it to In use), the problem and who to call.',
    boxes: [
      band(0, 0, L, 180, red, { name: 'Header' }),
      icon('alert-octagon', 40, 30, 120, '#ffffff'),
      words(180, 30, 580, 120, 'OUT OF ORDER', 60, { bold: true, ink: '#ffffff', align: 'left' }),
      words(40, 210, 712, 50, 'Name of the instrument', 34, { bold: true, align: 'left' }),
      ...[['Problem', 'What is wrong, in a line'], ['Since', 'Date'], ['Do not', 'Turn it on, open it or move it'], ['Contact', 'Name, ext. 0000']].flatMap(([k, v], i): Box[] => [
        words(40, 284 + i * 56, 160, 44, k, 22, { bold: true, ink: red, align: 'left' }),
        words(200, 284 + i * 56, 552, 44, v, 22, { align: 'left' }),
      ]),
      band(0, 590, L, 22, red, { name: 'Footer' }),
    ],
    links: [],
  };
}

function signUp(): DesignTemplate {
  const th = T.teal;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const hours = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];
  const x0 = 96, y0 = 164, cw = 95, rh = 52;
  const boxes: Box[] = [
    words(40, 28, 532, 44, 'Instrument Sign-up', 30, { bold: true, ink: th.dark, align: 'left' }),
    words(40, 76, 300, 26, 'Instrument: ________________', 14, { align: 'left' }),
    words(340, 76, 232, 26, 'Week of: ____________', 14, { align: 'left' }),
    words(40, 104, 532, 22, 'Write your name and group in a slot. One hour at a time when others are waiting.', 11, { align: 'left', italic: true, ink: '#595959' }),
    band(x0, y0 - 30, cw * 5, 30, th.dark, { name: 'Header row' }),
  ];
  days.forEach((d, i) => boxes.push(words(x0 + i * cw, y0 - 30, cw, 30, d, 12, { bold: true, ink: th.onDark })));
  hours.forEach((h, r) => {
    boxes.push(words(36, y0 + r * rh, 56, rh, h, 12, { bold: true, ink: th.dark, align: 'right' }));
    if (r % 2 === 0) boxes.push(band(x0, y0 + r * rh, cw * 5, rh, th.soft, { name: 'Row shading' }));
  });
  for (let r = 0; r < hours.length; r++) for (let c = 0; c < 5; c++) boxes.push({ geo: 'rect', x: x0 + c * cw, y: y0 + r * rh, w: cw, h: rh, fill: null, line: '#a6a6a6', lw: 0.75, name: 'Slot' });
  return { id: 'flyer-signup', name: 'Instrument sign-up sheet', category: 'flyer', sizeId: 'letter', blurb: 'A week of hourly time slots, Monday to Friday, 8 AM to 6 PM, to print and post.', boxes, links: [] };
}

export const FLYERS: DesignTemplate[] = [
  seminar(), defense(), joinLab(), safety(), journalClub(), outreach(),
  colloquium(), groupMeeting(), waste(), quickGuide(), workshop(), callAbstracts(), congrats(), position(), glovebox(), cleanup(), posterSession(), moleDay(), equipmentNotice(), signUp(),
];
