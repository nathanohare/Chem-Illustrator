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

export const FLYERS: DesignTemplate[] = [seminar(), defense(), joinLab(), safety(), journalClub(), outreach()];
