// The Knowledge Base's big pKa table, from two compilations: equilibrium acidities in DMSO measured
// by Bordwell's group and others (as compiled by H. J. Reich), and values in water and water mixtures
// from the literature to 1960 (as compiled by R. Williams). Only the values the compilations credit
// to a paper or book are here (Nate, 2026-11-05), each row with that source, a drawing, the hydrogen
// that comes off and the kind of compound. The values are in src/kb/pka-dmso.json and
// src/kb/pka-water.json and the drawings in src/kb/pka-pics.json, all made from our checked
// transcriptions of the compilations (names, SMILES and drawings our own; build scripts in the
// project's knowledge-base/pka kit). Loaded when the window first opens.

import type { Template, TemplateAtom, TemplateBond } from '../chem/templates';
import type { Cell, KbSource, KbTable } from './tables';
import DMSO from './pka-dmso.json';
import WATER from './pka-water.json';
import PICS from './pka-pics.json';

/** [name, canonical SMILES, pKa as printed, approximate (1), acidic hydrogen, class, papers (indexes into `papers` and `dois`), PubChem CID (0: none)] */
type DmsoRow = [string, string, string, 0 | 1, string, string, number[], number];
const D = DMSO as unknown as { papers: string[]; dois: string[]; rows: DmsoRow[] };
/** [name, canonical SMILES, pKa as shown, acidic hydrogen, class, solvent, notes, papers (indexes into `papers` and `dois`), PubChem CID (0: none)] */
type WaterRow = [string, string, string, string, string, string, string, number[], number];
const W = WATER as unknown as { papers: string[]; dois: string[]; rows: WaterRow[] };

export const REICH_SOURCE: KbSource = {
  label: 'Reich, H. J.; Bordwell, F. G. Equilibrium pKa Table (DMSO Solvent and Reference), ACS Division of Organic Chemistry',
  url: 'https://organicchemistrydata.org/hansreich/resources/pka/',
};
export const WILLIAMS_SOURCE: KbSource = {
  label: 'Williams, R. pKa Data Compiled by R. Williams, ACS Division of Organic Chemistry (updated 2022)',
  url: 'https://organicchemistrydata.org/hansreich/resources/pka/pka_data/pka-compilation-williams.pdf',
};

/** One value (or one compound's set of values) of the table, read from the data files. */
export interface PkaValue {
  name: string;
  smiles: string;
  /** As shown: "26.5", "~20", or a compound's several values "2.34, 9.69". */
  pka: string;
  solvent: string;
  site: string;
  cls: string;
  /** Conditions and readings worth knowing ("At 35 °C", "Conjugate acid"). */
  notes: string;
  papers: string[];
  /** Each paper's DOI, where it has one ('' where not). */
  dois: string[];
  cid: number | null;
  /** Which compilation it comes from. */
  from: 'reich' | 'williams';
}

export const PKA_VALUES: PkaValue[] = [
  ...D.rows.map(([name, smiles, pka, approx, site, cls, papers, cid]): PkaValue => ({
    name, smiles, pka: approx === 1 ? `~${pka}` : pka, solvent: 'DMSO', site, cls, notes: '',
    papers: papers.map((i) => D.papers[i]), dois: papers.map((i) => D.dois[i]), cid: cid || null, from: 'reich',
  })),
  ...W.rows.map(([name, smiles, pka, site, cls, solvent, notes, papers, cid]): PkaValue => ({
    name, smiles, pka, solvent, site, cls, notes,
    papers: papers.map((i) => W.papers[i]), dois: papers.map((i) => W.dois[i]), cid: cid || null, from: 'williams',
  })),
];

/** A compound's drawing (scripts: the pKa build), by its canonical SMILES. */
export function pkaPicture(row: Record<string, Cell>): Template | null {
  const p = (PICS as unknown as Record<string, { atoms: TemplateAtom[]; bonds: TemplateBond[] }>)[String(row.smiles)];
  return p ? { id: `pka-${row.smiles}`, name: String(row.name), group: 'own', atoms: p.atoms, bonds: p.bonds, attach: 0 } : null;
}

const PKA_INFO = 'How strong an acid the compound is: −log Ka for losing the hydrogen named under Acidic H, in the solvent named (DMSO at 25 °C; water and water mixtures at about 25 °C unless a note gives another temperature). Lower is more acidic. Compare values in the same solvent: DMSO values run higher than water\'s for neutral acids, which DMSO solvates less well (acetic acid: 12.6 in DMSO, 4.76 in water), and lie close to water\'s for protonated amines. Several values in a row are the compound\'s successive pKa values, lowest first, unless a note says they are two measurements of one step. A ~ marks an approximate value (estimated or extrapolated).';
const SITE_INFO = 'The hydrogen that comes off: C–H for a carbon acid (the pKa of making the carbanion or ylide), N–H, O–H, S–H and so on. For amines and other bases it is the N–H of the protonated base, the pKa of its conjugate acid. Two hydrogens ("N–H, O–H"): the row\'s values belong to different groups, such as an amino acid\'s CO2H and NH3+. "N–H or O–H": the source doesn\'t say which (hydroxylamines, hydroxamic acids).';
const NOTES_INFO = 'Conditions and readings worth knowing: a temperature other than 25 °C, "Thermodynamic" (corrected to zero ionic strength), "Conjugate acid" (the value is for the protonated compound), which group a value belongs to, and how the compilation printed a name or value where we write it differently.';

/** Each paper's DOI, by its citation as the Original source column shows it. */
const DOI_OF = new Map<string, string>(PKA_VALUES.flatMap((v) => v.papers.map((p, i): [string, string] => [p, v.dois[i]])).filter(([, d]) => d));

/** "Hall, J. Am. Chem. Soc. 1957, 79, 5441" → "Hall 1957". */
function shortCite(cite: string): string {
  const year = /\b(1[89]\d\d|20\d\d)\b/.exec(cite)?.[1] ?? '';
  const who = cite.split(/,| and | et al\./)[0].trim();
  return year ? `${who} ${year}` : who;
}

function rowOf(v: PkaValue): Record<string, Cell> {
  return {
    name: v.name, smiles: v.smiles, pka: v.pka, solvent: v.solvent, site: v.site, cls: v.cls, notes: v.notes || null,
    refs: v.papers.join('; '), cid: v.cid,
  };
}

const firstNumber = (s: Cell) => Number(/-?\d+(?:\.\d+)?/.exec(String(s))?.[0] ?? NaN);

const COUNT_DMSO = D.rows.length, COUNT_WATER = W.rows.length;

export const PKA_VALUES_TABLE: KbTable = {
  id: 'pka',
  title: 'pKa Values',
  about: `${(COUNT_DMSO + COUNT_WATER).toLocaleString('en-US')} pKa values: ${COUNT_DMSO} in DMSO, most measured by F. G. Bordwell's group (carbon acids, amides, amines, azoles, alcohols, phenols, thiols…), and ${COUNT_WATER.toLocaleString('en-US')} in water and water mixtures from the literature (carboxylic acids, phenols, amines, anilines, heterocycles, amino acids and peptides, nucleosides, phosphates, thiols, inorganic acids…), the most acidic first. Search by name, or type a SMILES to find the compound and everything containing it. Filter by solvent, by the hydrogen that comes off or by the kind of compound. Each row names the paper the value comes from (values the compilations list without one are left out).`,
  columns: [
    { key: 'pic', label: 'Structure', picture: true },
    { key: 'name', label: 'Compound' },
    { key: 'pka', label: 'pKa', numeric: true, info: PKA_INFO },
    { key: 'solvent', label: 'Solvent', filter: true, narrow: true },
    { key: 'site', label: 'Acidic H', filter: true, narrow: true, info: SITE_INFO },
    { key: 'cls', label: 'Class', filter: true, hidden: true },
    { key: 'notes', label: 'Notes', prose: true, info: NOTES_INFO },
    { key: 'refs', label: 'Original source', prose: true, info: 'The paper or book each value comes from, as the compilation cites it. The links at the end of a row open the papers that have a DOI.' },
    { key: 'smiles', label: 'SMILES', hidden: true },
  ],
  picture: pkaPicture,
  pictureSize: 56,
  fit: true,
  structure: pkaPicture,
  canonicalSmiles: true,
  rows: PKA_VALUES.map(rowOf).sort((a, b) => firstNumber(a.pka) - firstNumber(b.pka)),
  sources: [REICH_SOURCE, WILLIAMS_SOURCE, { label: 'Original papers for each value: the Original source column' }, { label: 'Names, SMILES, drawings, acidic hydrogens, classes and order by Chem Illustrator' }],
  links: (row) => {
    const out: KbSource[] = row.cid ? [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/compound/${row.cid}` }] : [];
    for (const cite of String(row.refs ?? '').split('; ')) {
      const doi = DOI_OF.get(cite);
      if (doi) out.push({ label: shortCite(cite), url: `https://doi.org/${doi}` });
    }
    return out;
  },
};
