// The template window over a new document: our own starting points for a chemist's writing (lab
// reports and notebook pages, papers' companions, theses, proposals, safety, teaching, career). Each is headings in the standard
// styles with a line or two in brackets saying what goes there, so the Navigation pane, the
// table of contents and the accessibility checker work from the start. All are written here for
// this app; none is taken from another program's templates.

import { newDocument, objectRun, paraFromStyle, runStyleOf, styleOf, INCH, type DocText, type DocObject } from './document';
import * as rt from '../richtext';
import type { TextRun, TableCell, ParaStyle } from '../model';

/** The categories in the template window, in order. */
export const DOC_CATEGORIES = [
  { id: 'lab', name: 'Lab and notebook' },
  { id: 'papers', name: 'Papers and SI' },
  { id: 'theses', name: 'Theses' },
  { id: 'grants', name: 'Grants and fellowships' },
  { id: 'safety', name: 'Safety' },
  { id: 'teaching', name: 'Teaching' },
  { id: 'career', name: 'Career' },
] as const;
export type DocCategory = typeof DOC_CATEGORIES[number]['id'];

export interface DocTemplate {
  id: string;
  name: string;
  blurb: string;
  category: DocCategory;
  make(): DocText;
}

/** A paragraph of a template: its style and its text (an object in a paragraph of its own instead, with `obj`). */
type Line = { style?: string; text?: string; bold?: boolean; italic?: boolean; obj?: DocObject; para?: Partial<ParaStyle> };

const cell = (text: string, bold = false): TableCell => ({ runs: text ? [{ text, ...(bold ? { bold: true } : {}) }] : [] });

/** A table with a heading row and `rows` empty rows. */
function table(heads: string[], widths: number[], rows: number, first?: string[][]): DocObject {
  return {
    kind: 'table',
    table: {
      cols: widths,
      head: 1,
      lines: 'acs',
      rows: [heads.map((h) => cell(h, true)), ...Array.from({ length: rows }, (_, r) => heads.map((_, c) => cell(first?.[r]?.[c] ?? '')))],
    },
  };
}

/** Build a document from its lines, on a fresh document of the standard styles (changed by `setup`). */
function build(lines: Line[], setup?: (t: DocText) => void): DocText {
  const t = newDocument();
  setup?.(t);
  const runs: TextRun[] = [];
  const paras: ParaStyle[] = [];
  const objects: Record<number, DocObject> = {};
  let id = 1;
  lines.forEach((l, i) => {
    const s = styleOf(t, l.style ? { style: l.style } : undefined);
    const look = { ...runStyleOf(s), ...(l.bold ? { bold: true } : {}), ...(l.italic ? { italic: true } : {}) };
    if (l.obj) {
      objects[id] = l.obj;
      runs.push(objectRun(id++, runStyleOf(styleOf(t, undefined))));
    } else if (l.text) runs.push({ ...look, text: l.text });
    if (i < lines.length - 1) runs.push({ ...look, text: '\n' });
    paras.push({ ...paraFromStyle(s, {}), ...(l.para ?? {}) });
  });
  return { ...t, runs: rt.normalizeRuns(runs), paras, objects };
}

const H1 = (text: string): Line => ({ style: 'Heading1', text });
const H2 = (text: string): Line => ({ style: 'Heading2', text });
const P = (text: string): Line => ({ text });
const CAPTION = (text: string): Line => ({ style: 'Caption', text });
const BULLET = (text: string): Line => ({ text, para: { list: 'bullet', align: 'left' } });
const NUM = (text: string): Line => ({ text, para: { list: 'number', align: 'left' } });
const CENTER = (text: string, look: { bold?: boolean; italic?: boolean } = {}): Line => ({ text, ...look, para: { align: 'center' } });
const LEFT = (text: string, look: { bold?: boolean; italic?: boolean } = {}): Line => ({ text, ...look, para: { align: 'left' } });

function labReport(): DocText {
  return build([
    { style: 'Title', text: '[Experiment title]' },
    { text: '[Your name] · [Date] · Notebook [book], page [page]', para: { align: 'center' } },
    H1('Aim'),
    P('[What this reaction or experiment is meant to show or make, in a sentence or two.]'),
    H1('Reaction'),
    P('[Draw the scheme here: Insert > Structure, or paste from a canvas.]'),
    CAPTION('Scheme 1. [What the scheme shows.]'),
    H1('Reagents'),
    { obj: table(['Reagent', 'MW (g/mol)', 'equiv', 'mmol', 'Amount', 'Supplier / lot'], [118, 66, 46, 50, 70, 118], 4, [['[limiting reagent]', '', '1.0']]) },
    H1('Procedure'),
    P('[What was done, in order, with times and temperatures: set-up, addition, monitoring (TLC, eluent, Rf), work-up and purification.]'),
    H1('Observations'),
    P('[Color changes, exotherms, precipitates, anything unexpected.]'),
    H1('Results'),
    P('[Product, appearance, mass, yield (mmol and %), and the data that show what it is.]'),
    H1('Discussion'),
    P('[What worked, what did not, and what to change next time.]'),
    H1('Safety'),
    P('[Hazards of the reagents and how they were handled; waste streams.]'),
    H1('References'),
    P('[Literature procedures followed or adapted.]'),
  ]);
}

function supportingInformation(): DocText {
  return build([
    { style: 'Title', text: 'Supporting Information' },
    { text: '[Title of the paper]', bold: true, para: { align: 'center' } },
    { text: '[Authors]', para: { align: 'center' } },
    { text: '[Affiliations]', italic: true, para: { align: 'center' } },
    { text: 'Contents', bold: true, para: { keepNext: true } },
    { obj: { kind: 'toc', levels: 2 } },
    H1('General Information'),
    P('[Materials and their sources, how solvents were dried, the instruments used (NMR, HRMS, IR, melting point, optical rotation, HPLC) and how spectra are referenced.]'),
    H1('Experimental Procedures'),
    H2('General Procedure A'),
    P('[A procedure used for several compounds, written once.]'),
    H2('[Compound name] ([number])'),
    P('[Procedure or "Following General Procedure A with…", amounts, purification, and the yield.]'),
    P('[Appearance]; Rf = [value] ([eluent]); ¹H NMR ([MHz] MHz, [solvent]) δ [shifts]; ¹³C NMR ([MHz] MHz, [solvent]) δ [shifts]; HRMS ([method]) m/z [M+H]⁺ calcd for [formula] [mass], found [mass].'),
    H1('NMR Spectra'),
    P('[One spectrum per compound, each labeled with its number, nucleus and solvent.]'),
    H1('References'),
    P('[References cited in this document.]'),
  ]);
}

function thesisChapter(): DocText {
  return build([
    { style: 'Title', text: 'Chapter [N]. [Chapter title]' },
    H1('[N].1 Introduction'),
    P('[The problem, why it matters, and what this chapter sets out to do.]'),
    H2('[N].1.1 Background'),
    P('[The work this chapter builds on.]'),
    H1('[N].2 Results and Discussion'),
    H2('[N].2.1 [First part]'),
    P('[What was found, with schemes, tables and figures as they come up.]'),
    { obj: table(['Entry', 'Conditions', 'Yield (%)', 'Notes'], [44, 200, 64, 140], 3, [['1'], ['2'], ['3']]) },
    CAPTION('Table [N].1. [What was varied, and the conditions held constant.]'),
    H2('[N].2.2 [Second part]'),
    P('[…]'),
    H1('[N].3 Conclusions and Outlook'),
    P('[What the chapter showed, and what comes next.]'),
    H1('[N].4 Experimental'),
    P('[Procedures and data for the compounds in this chapter, or where to find them.]'),
    H1('[N].5 References'),
    P('[References cited in this chapter.]'),
  ], (t) => {
    // a bound thesis: a wider margin on the binding side, and text one and a half lines apart
    t.page = { ...t.page, left: 1.5 * INCH };
    t.styles = { ...t.styles, Normal: { ...t.styles.Normal, line: 1.5 } };
  });
}

// ---------------------------------------------------------------- lab and notebook

function notebookEntry(): DocText {
  return build([
    { style: 'Title', text: '[Notebook code, e.g. NO-3-145]: [Short title]' },
    CENTER('[Your name] · [Date] · Project [name]'),
    H1('Reaction'),
    P('[Draw the scheme: Insert > Structure, or paste from a canvas.]'),
    { obj: table(['Reagent', 'MW (g/mol)', 'equiv', 'mmol', 'Mass or volume', 'Lot'], [124, 66, 46, 50, 90, 92], 4, [['[limiting reagent]', '', '1.0']]) },
    H1('Procedure'),
    P('[Time-stamped steps as they happen: 09:40 added…, 10:15 TLC (eluent) shows…]'),
    H1('Work-up and Purification'),
    P('[Quench, extraction, drying agent, column (silica, eluent, Rf of the product).]'),
    H1('Result'),
    P('[Mass, yield, appearance. Spectra saved as: file names.]'),
    H1('Next Time'),
    P('[What to change, and why.]'),
  ]);
}

function weeklyReport(): DocText {
  return build([
    { style: 'Title', text: 'Weekly Progress Report' },
    CENTER('[Your name] · Week of [date]'),
    H1('Summary'),
    P('[Two or three sentences: what moved forward this week.]'),
    H1('Results'),
    H2('[Project or reaction]'),
    P('[What was run, what came out, a scheme or table if it helps.]'),
    { obj: table(['Entry', 'Change', 'Result', 'Notebook'], [44, 200, 120, 84], 3, [['1'], ['2'], ['3']]) },
    H1('Problems'),
    BULLET('[What isn\'t working, and what has been tried.]'),
    H1('Plans for Next Week'),
    NUM('[First thing to do]'),
    NUM('[Second thing to do]'),
    H1('Orders and Instrument Time'),
    P('[Chemicals to order, instruments to book.]'),
  ]);
}

function groupMinutes(): DocText {
  return build([
    { style: 'Title', text: 'Group Meeting Minutes' },
    CENTER('[Date] · [Room] · Notes by [name]'),
    H1('Present'),
    P('[Names]'),
    H1('Announcements'),
    BULLET('[Safety, orders, visitors, deadlines]'),
    H1('Updates'),
    H2('[Speaker]'),
    P('[What was shown, questions asked, suggestions made.]'),
    H1('Action Items'),
    { obj: table(['Who', 'What', 'By when'], [110, 250, 88], 4) },
    H1('Next Meeting'),
    P('[Date, speakers, cleaning duty.]'),
  ]);
}

// ---------------------------------------------------------------- papers and SI

function editorLetter(): DocText {
  return build([
    { style: 'Title', text: 'Cover Letter' },
    LEFT('[Your name]'),
    LEFT('[Department, university, address]'),
    LEFT('[Email] · [Date]'),
    LEFT('Dear Dr. [Editor\'s name],'),
    P('Please consider our manuscript, "[Title]," for publication as a [Communication / Article] in [Journal].'),
    P('[The problem, in a sentence. What we found, in a sentence or two. Why it matters to the journal\'s readers.]'),
    P('[What is new compared with the closest work already published, with references.]'),
    P('This manuscript has not been published and is not under consideration elsewhere. All authors have approved the submission. [Suggested reviewers, or those to exclude, if the journal asks.]'),
    LEFT('Sincerely,'),
    LEFT('[Your name], on behalf of all authors'),
  ]);
}

function reviewerResponse(): DocText {
  return build([
    { style: 'Title', text: 'Response to Reviewers' },
    CENTER('Manuscript [ID]: "[Title]"'),
    P('We thank the reviewers for their careful reading and helpful comments. Each comment is quoted below in italics, followed by our response and the changes made. Page and line numbers refer to the revised manuscript.'),
    H1('Reviewer 1'),
    H2('Comment 1.1'),
    { text: '[The reviewer\'s comment, quoted.]', italic: true },
    P('Response: [Our answer.] Change: [What was changed, with page and line.]'),
    H2('Comment 1.2'),
    { text: '[The reviewer\'s comment, quoted.]', italic: true },
    P('Response: [Our answer.] Change: [What was changed, with page and line.]'),
    H1('Reviewer 2'),
    H2('Comment 2.1'),
    { text: '[The reviewer\'s comment, quoted.]', italic: true },
    P('Response: [Our answer.] Change: [What was changed, with page and line.]'),
    H1('Other Changes'),
    P('[Changes not asked for: corrected typos, an updated reference, new data.]'),
  ]);
}

// ---------------------------------------------------------------- theses

function thesisFront(): DocText {
  return build([
    { style: 'Title', text: '[Thesis Title]' },
    CENTER('by'),
    CENTER('[Your full name]', { bold: true }),
    CENTER('A dissertation submitted to the Graduate Faculty of [University] in partial fulfillment of the requirements for the Degree of Doctor of Philosophy'),
    CENTER('[City, State] · [Month Year]'),
    CENTER('Approved by: [Advisor], Chair; [Committee members]', { italic: true }),
    H1('Abstract'),
    P('[One page: the problem, the approach, the main results, and why they matter.]'),
    H1('Acknowledgments'),
    P('[Advisor, committee, group, collaborators, funding, family.]'),
    { text: 'Table of Contents', bold: true, para: { keepNext: true } },
    { obj: { kind: 'toc', levels: 2 } },
    H1('List of Abbreviations'),
    { obj: table(['Abbreviation', 'Meaning'], [110, 338], 4, [['Ac', 'acetyl'], ['dr', 'diastereomeric ratio'], ['ee', 'enantiomeric excess']]) },
  ], (t) => {
    t.page = { ...t.page, left: 1.5 * INCH };
    t.styles = { ...t.styles, Normal: { ...t.styles.Normal, line: 1.5 } };
  });
}

function prospectus(): DocText {
  return build([
    { style: 'Title', text: 'Research Prospectus: [Title]' },
    CENTER('[Your name] · Candidacy exam, [date] · Advisor: [name]'),
    H1('Summary'),
    P('[Half a page: the goal, the approach, and what will be learned.]'),
    H1('Background and Significance'),
    P('[What is known, what isn\'t, and why it matters. Key references.]'),
    H1('Results to Date'),
    P('[Your own work so far: schemes, tables, key yields and selectivities.]'),
    H1('Proposed Research'),
    H2('Aim 1: [Title]'),
    P('[Hypothesis, the experiments, what success looks like, and what you\'ll do if it fails.]'),
    H2('Aim 2: [Title]'),
    P('[…]'),
    H1('Timeline'),
    { obj: table(['Period', 'Work', 'Milestone'], [90, 238, 120], 4) },
    H1('References'),
    P('[References cited.]'),
  ]);
}

// ---------------------------------------------------------------- grants and fellowships

function researchProposal(): DocText {
  return build([
    { style: 'Title', text: '[Proposal Title]' },
    CENTER('[Principal investigator] · [Institution] · [Funding program]'),
    H1('Project Summary'),
    P('[Overview, intellectual merit and broader impacts, as the program asks, in one page.]'),
    H1('Introduction and Objectives'),
    P('[The problem and the objectives of this proposal.]'),
    H1('Background'),
    P('[The state of the field and the gap this work fills.]'),
    H1('Preliminary Results'),
    P('[Your data that show the approach can work.]'),
    H1('Research Plan'),
    H2('Objective 1: [Title]'),
    P('[Approach, expected outcomes, potential problems and alternatives.]'),
    H2('Objective 2: [Title]'),
    P('[…]'),
    H1('Broader Impacts'),
    P('[Training, outreach, and benefits beyond the lab.]'),
    H1('Timeline and Personnel'),
    { obj: table(['Year', 'Objective', 'Who'], [60, 268, 120], 3, [['1'], ['2'], ['3']]) },
    H1('References Cited'),
    P('[References cited.]'),
  ]);
}

function specificAims(): DocText {
  return build([
    { style: 'Title', text: 'Specific Aims' },
    P('[Opening: the big problem and why it matters, in two or three sentences.]'),
    P('[The gap: what is missing, and why it holds the field back.]'),
    P('[Your solution and the long-term goal. The objective of this proposal and the central hypothesis, and what it rests on.]'),
    { text: 'Aim 1: [Title].', bold: true, para: { align: 'left' } },
    P('[The hypothesis and how it will be tested, in two or three sentences.]'),
    { text: 'Aim 2: [Title].', bold: true, para: { align: 'left' } },
    P('[The hypothesis and how it will be tested.]'),
    { text: 'Aim 3: [Title].', bold: true, para: { align: 'left' } },
    P('[The hypothesis and how it will be tested.]'),
    P('[Expected outcomes and their impact: what will be possible when this is done.]'),
  ], (t) => {
    // one page, with half-inch margins, as most programs allow
    t.page = { ...t.page, left: 0.5 * INCH, right: 0.5 * INCH, top: 0.5 * INCH, bottom: 0.5 * INCH };
  });
}

function personalStatement(): DocText {
  return build([
    { style: 'Title', text: 'Personal Statement' },
    CENTER('[Your name] · [Fellowship program]'),
    H1('Why Chemistry'),
    P('[The moment or experience that drew you in, briefly and specifically.]'),
    H1('Research Experience'),
    P('[Each project: the question, what you did yourself, what you found, and what you learned.]'),
    H1('Leadership, Mentoring and Outreach'),
    P('[What you have done for others, with numbers where you can.]'),
    H1('Goals'),
    P('[Where this fellowship takes you, and what you will do with it.]'),
  ]);
}

function researchStatement(): DocText {
  return build([
    { style: 'Title', text: 'Research Statement' },
    CENTER('[Your name] · [Position applied for]'),
    H1('Overview'),
    P('[Your research program in one paragraph: the theme that joins its parts.]'),
    H1('Past and Current Work'),
    P('[Your key results, with the questions they answered.]'),
    H1('Proposed Research'),
    H2('Project 1: [Title]'),
    P('[Aim, approach, the first experiments, and why your lab is the one to do it.]'),
    H2('Project 2: [Title]'),
    P('[…]'),
    H1('Funding and Collaborations'),
    P('[Programs that fit each project, and colleagues you would work with.]'),
  ]);
}

// ---------------------------------------------------------------- safety

function sop(): DocText {
  return build([
    { style: 'Title', text: 'Standard Operating Procedure: [Process or Chemical]' },
    CENTER('[Lab] · Written by [name] · Approved by [PI] · [Date] · Review by [date]'),
    H1('Scope'),
    P('[Which process, chemicals and scale this covers.]'),
    H1('Hazards'),
    { obj: table(['Chemical', 'GHS hazards', 'Exposure limits', 'Incompatible with'], [110, 130, 96, 112], 3) },
    H1('Controls and Protective Equipment'),
    BULLET('[Fume hood, glove box, blast shield]'),
    BULLET('[Gloves (material), eye protection, lab coat]'),
    H1('Procedure'),
    NUM('[Step, with the hazard and its control where it arises]'),
    NUM('[Step]'),
    H1('Waste'),
    P('[How each waste stream is quenched, labeled and stored.]'),
    H1('Emergencies'),
    P('[Spills, fire, exposure: what to do, and whom to call.]'),
    H1('Training'),
    { obj: table(['Name', 'Trained by', 'Date', 'Signature'], [130, 130, 80, 108], 3) },
  ]);
}

function riskAssessment(): DocText {
  return build([
    { style: 'Title', text: 'Hazard and Risk Assessment' },
    CENTER('[Experiment] · [Your name] · [Date] · Scale: [mmol / g]'),
    H1('Reaction'),
    P('[Scheme, conditions, and anything unusual: pressure, exotherm, gas evolved.]'),
    H1('Hazards and Controls'),
    { obj: table(['Substance or step', 'Hazard', 'Likelihood', 'Severity', 'Control'], [110, 110, 62, 58, 108], 4) },
    H1('Scale-up'),
    P('[What changes at larger scale: heat removal, addition rate, gas venting.]'),
    H1('Emergency Plan'),
    P('[What could go wrong, and the response.]'),
    H1('Approval'),
    P('Assessed by: [name]   Reviewed by: [name]   Date: [date]'),
  ]);
}

function quenchProcedure(): DocText {
  return build([
    { style: 'Title', text: 'Waste and Quench Procedure: [Reagent]' },
    CENTER('[Lab] · [Date]'),
    H1('What It Covers'),
    P('[The reagent, residues or waste stream, and the largest amount this covers.]'),
    H1('Hazards'),
    P('[What reacts, what gas or heat is given off.]'),
    H1('Quench'),
    NUM('[Dilute with (solvent) under inert gas; cool to (temperature).]'),
    NUM('[Add (quenching agent) slowly, watching the temperature and gas evolution.]'),
    NUM('[Test that the quench is complete: how.]'),
    H1('Disposal'),
    P('[Waste container, label, and pickup.]'),
  ]);
}

// ---------------------------------------------------------------- teaching

function labHandout(): DocText {
  return build([
    { style: 'Title', text: 'Experiment [N]: [Title]' },
    CENTER('[Course] · [Term]'),
    H1('Objectives'),
    BULLET('[A technique to learn]'),
    BULLET('[A concept to see in practice]'),
    H1('Background'),
    P('[The chemistry, with the scheme and the mechanism students should know.]'),
    H1('Safety'),
    P('[Hazards of each chemical, and the protective equipment.]'),
    H1('Procedure'),
    NUM('[Step]'),
    NUM('[Step]'),
    H1('Data'),
    { obj: table(['Measurement', 'Value', 'Units'], [200, 140, 108], 4) },
    H1('Questions'),
    NUM('[Question]'),
    NUM('[Question]'),
  ]);
}

function problemSet(): DocText {
  return build([
    { style: 'Title', text: 'Problem Set [N]: [Topic]' },
    CENTER('[Course] · Due [date]'),
    P('Show your work: draw curved arrows for every mechanism step, and explain selectivity in a sentence.'),
    H1('Problem 1'),
    P('[Draw the starting material and conditions. Ask for the product, with stereochemistry.]'),
    H1('Problem 2'),
    P('[Give the product. Ask for a mechanism.]'),
    H1('Problem 3'),
    P('[A short synthesis: target and allowed starting materials.]'),
    H1('Problem 4'),
    P('[Spectra to interpret: ¹H NMR, ¹³C NMR, IR, and a formula.]'),
  ]);
}

function exam(): DocText {
  return build([
    { style: 'Title', text: '[Course] Exam [N]' },
    CENTER('[Date] · [Time allowed] · [Total] points'),
    LEFT('Name: ____________________   ID: ____________'),
    P('[Instructions: what may be used, and how answers are marked.]'),
    { obj: table(['Question', 'Points', 'Score'], [150, 150, 148], 5, [['1', '[10]'], ['2', '[15]'], ['3', '[15]'], ['4', '[20]'], ['Total', '[60]']]) },
    H1('Question 1 ([10] points)'),
    P('[Question.]'),
    H1('Question 2 ([15] points)'),
    P('[Question.]'),
    H1('Question 3 ([15] points)'),
    P('[Question.]'),
    H1('Question 4 ([20] points)'),
    P('[Question.]'),
    H1('Answer Key'),
    P('[Answers and how points are given, one per question. Delete this section before printing the exam.]'),
  ]);
}

// ---------------------------------------------------------------- career

function academicCv(): DocText {
  return build([
    { style: 'Title', text: '[Your Name]' },
    CENTER('[Department, university] · [Email] · [Phone] · ORCID [id]'),
    H1('Education'),
    P('[Degree], [Field], [University], [Year]. Advisor: [name]. Thesis: "[title]"'),
    H1('Research Experience'),
    P('[Position], [Lab, institution], [years]. [One line on the work.]'),
    H1('Publications'),
    NUM('[Authors]. [Title]. [Journal] [Year], [Volume], [Pages]. DOI: [doi]'),
    H1('Presentations'),
    BULLET('[Title]. [Meeting], [Place], [Date]. (Oral / Poster)'),
    H1('Awards and Fellowships'),
    BULLET('[Award], [Year]'),
    H1('Teaching and Mentoring'),
    BULLET('[Course or students], [Years]'),
    H1('Skills'),
    P('[Techniques and instruments: air-free synthesis, HPLC, X-ray, computation.]'),
    H1('References'),
    P('[Name, title, institution, email], for each referee.'),
  ]);
}

function jobLetter(): DocText {
  return build([
    { style: 'Title', text: '[Your Name]' },
    CENTER('[Address] · [Email] · [Phone]'),
    LEFT('[Date]'),
    LEFT('[Hiring committee or name]'),
    LEFT('[Department, organization, address]'),
    LEFT('Dear [Name or Members of the Search Committee],'),
    P('I am writing to apply for the [position] at [organization], advertised [where].'),
    P('[Who you are and the one thing you bring that fits this position best.]'),
    P('[Your most relevant work, with a result or two that shows what you can do.]'),
    P('[Why this organization, specifically, and what you would do there.]'),
    P('Thank you for your consideration. I would welcome the chance to discuss the position.'),
    LEFT('Sincerely,'),
    LEFT('[Your name]'),
  ]);
}

export const DOC_TEMPLATES: DocTemplate[] = [
  { id: 'lab-report', category: 'lab', name: 'Lab report', blurb: 'Aim, reaction scheme, reagent table, procedure, observations, results and safety.', make: labReport },
  { id: 'notebook-entry', category: 'lab', name: 'Notebook entry', blurb: 'One experiment: scheme, reagent table, time-stamped procedure, work-up, result and what to change.', make: notebookEntry },
  { id: 'weekly-report', category: 'lab', name: 'Weekly progress report', blurb: 'Summary, results with a small table, problems, plans, and orders and instrument time.', make: weeklyReport },
  { id: 'group-minutes', category: 'lab', name: 'Group meeting minutes', blurb: 'Who came, announcements, each update, and a table of action items.', make: groupMinutes },
  { id: 'si', category: 'papers', name: 'Supporting Information', blurb: 'Title block, contents, general information, procedures with a characterization line to fill in, and spectra.', make: supportingInformation },
  { id: 'editor-letter', category: 'papers', name: 'Cover letter to the editor', blurb: 'What the paper shows, why it suits the journal, and the statements editors ask for.', make: editorLetter },
  { id: 'reviewer-response', category: 'papers', name: 'Response to reviewers', blurb: 'Each comment quoted in italics, with the response and the change made, reviewer by reviewer.', make: reviewerResponse },
  { id: 'thesis-chapter', category: 'theses', name: 'Thesis chapter', blurb: 'Numbered sections from introduction to experimental, with a wide binding margin and 1.5 line spacing.', make: thesisChapter },
  { id: 'thesis-front', category: 'theses', name: 'Thesis front matter', blurb: 'Title page, abstract, acknowledgments, contents and abbreviations, with a binding margin.', make: thesisFront },
  { id: 'prospectus', category: 'theses', name: 'Prospectus or candidacy proposal', blurb: 'Summary, background, results to date, aims, timeline and references.', make: prospectus },
  { id: 'research-proposal', category: 'grants', name: 'Research proposal', blurb: 'Summary, objectives, background, preliminary results, research plan, broader impacts and timeline.', make: researchProposal },
  { id: 'specific-aims', category: 'grants', name: 'Specific aims page', blurb: 'One page with half-inch margins: the gap, the hypothesis, three aims and the payoff.', make: specificAims },
  { id: 'personal-statement', category: 'grants', name: 'Fellowship personal statement', blurb: 'Why chemistry, research experience, leadership and outreach, and goals.', make: personalStatement },
  { id: 'research-statement', category: 'grants', name: 'Research statement', blurb: 'For faculty applications: overview, past work, proposed projects, funding and collaborators.', make: researchStatement },
  { id: 'sop', category: 'safety', name: 'Standard operating procedure (SOP)', blurb: 'Scope, hazards table, controls, numbered procedure, waste, emergencies and a training record.', make: sop },
  { id: 'risk-assessment', category: 'safety', name: 'Hazard and risk assessment', blurb: 'Hazards with likelihood, severity and control, scale-up concerns, and sign-off.', make: riskAssessment },
  { id: 'quench-procedure', category: 'safety', name: 'Waste and quench procedure', blurb: 'For a reactive reagent: hazards, quench steps, the check that it is done, and disposal.', make: quenchProcedure },
  { id: 'lab-handout', category: 'teaching', name: 'Lab handout', blurb: 'Objectives, background, safety, procedure, a data table and questions.', make: labHandout },
  { id: 'problem-set', category: 'teaching', name: 'Problem set', blurb: 'Products, mechanisms, a short synthesis and spectra, one problem per heading.', make: problemSet },
  { id: 'exam', category: 'teaching', name: 'Exam with answer key', blurb: 'Name line, points table, questions, and an answer key to delete before printing.', make: exam },
  { id: 'academic-cv', category: 'career', name: 'Academic CV', blurb: 'Education, research, numbered publications, talks, awards, teaching, skills and references.', make: academicCv },
  { id: 'job-letter', category: 'career', name: 'Cover letter', blurb: 'For a job application: who you are, your best work, and why this place.', make: jobLetter },
];
