// Starter decks for the template window over a new presentation: a deck's worth of slides with
// their titles and bullets in [brackets] to type over, in the look new decks start with (or the
// theme picked). Written here for this app.

import type { LayoutId } from './deck';

export interface StarterDeck {
  id: string;
  name: string;
  blurb: string;
  /** Each slide's layout and its placeholders' text in frame order (title, then subtitle or body). */
  slides: { layout: LayoutId; text: string[]; notes?: string }[];
}

const slide = (title: string, body?: string, notes?: string) => ({ layout: 'title-content' as LayoutId, text: body ? [title, body] : [title], ...(notes ? { notes } : {}) });

export const STARTER_DECKS: StarterDeck[] = [
  {
    id: 'lecture',
    name: 'Lecture',
    blurb: 'Title, learning goals, a recap, three topics each with a worked example, a check question, summary and reading.',
    slides: [
      { layout: 'title', text: ['[Lecture Title]', '[Course] · Lecture [N] · [Date]'] },
      slide('Learning Goals', 'By the end of this lecture you can:\n[Goal 1]\n[Goal 2]\n[Goal 3]'),
      slide('Last Time', '[Key idea from the last lecture]\n[A question to start with]'),
      slide('[Topic 1]', '[Key idea]\n[Scheme or mechanism: Insert > Structure]', '[What to say, and where students usually get stuck]'),
      slide('Worked Example', '[Problem]\n[Step 1]\n[Step 2]'),
      slide('[Topic 2]', '[Key idea]\n[Scheme or mechanism]'),
      slide('Worked Example', '[Problem]\n[Step 1]\n[Step 2]'),
      slide('[Topic 3]', '[Key idea]\n[Scheme or mechanism]'),
      slide('Check Your Understanding', '[A quick question to answer in pairs]'),
      slide('Summary', '[Main point 1]\n[Main point 2]\n[Main point 3]'),
      slide('Reading and Practice', '[Textbook sections]\n[Problems to try]'),
    ],
  },
  {
    id: 'problem-session',
    name: 'Problem session (worked mechanisms)',
    blurb: 'For each problem, a question slide and an answer slide to fill with the arrow-pushing steps, then a summary.',
    slides: [
      { layout: 'title', text: ['Problem Session [N]', '[Topic] · [Course] · [Date]'] },
      slide('How This Works', 'Try each problem for [5] minutes before the answer\nDraw every curved arrow\nCompare with your neighbor'),
      slide('Problem 1', '[Draw the starting material and conditions]\nWhat is the product? Give the mechanism.'),
      slide('Problem 1: Answer', '[Step 1: arrows and intermediate]\n[Step 2]\n[Why this selectivity]'),
      slide('Problem 2', '[Draw the starting material and conditions]\nWhat is the product? Give the mechanism.'),
      slide('Problem 2: Answer', '[Step 1: arrows and intermediate]\n[Step 2]\n[Why this selectivity]'),
      slide('Problem 3', '[Draw the starting material and conditions]\nWhat is the product? Give the mechanism.'),
      slide('Problem 3: Answer', '[Step 1: arrows and intermediate]\n[Step 2]\n[Why this selectivity]'),
      slide('Common Mistakes', '[Arrows from atoms without lone pairs]\n[Charges that don\'t balance]\n[Ignoring stereochemistry]'),
      slide('Summary', '[The patterns to remember]'),
    ],
  },
];
