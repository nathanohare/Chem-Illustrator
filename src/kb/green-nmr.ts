// Green Solvents in NMR: where 47 green solvents, acids and bases, and four products they form, show up
// as trace impurities in eight deuterated solvents, 1H and 13C. The values are Tables 1-3 of
// Cseri, Kumar, Palchuk and Szekely, ACS Sustainable Chem. Eng. 2023, 11, 5696 (CC BY 4.0),
// retyped in green-nmr.txt. The window loads it only when it opens.

import text from './green-nmr.txt?raw';
import type { Cell, KbTable } from './tables';

const H_SOLVENTS = [
  ['Acetone-d6', 'CD3CN', 'CDCl3', 'DMSO-d6'],
  ['CD3OD', 'THF-d8', 'Toluene-d8', 'D2O'],
];
const C_SOLVENTS = ['Acetone-d6', 'CD3CN', 'CDCl3', 'DMSO-d6', 'CD3OD', 'THF-d8', 'Toluene-d8', 'D2O'];

/** Each compound's structure (left out for mixtures and polymers), in RDKit's canonical form. */
export const GREEN_SMILES: Record<string, string> = {
  '1,3-Dimethyl-2-imidazolidinone': 'CN1CCN(C)C1=O',
  '1,3-Propylene sulfite': 'O=S1OCCCO1',
  '1-(3-Aminopropyl)-2-azepanone (from DBU in D2O)': 'NCCCN1CCCCCC1=O',
  '1-(3-Aminopropyl)-2-pyrrolidone (from DBN in D2O)': 'NCCCN1CCCC1=O',
  '1-Butyl-2-pyrrolidone (Tamisolve NxG)': 'CCCCN1CCCC1=O',
  '2,4,6-Collidine': 'Cc1cc(C)nc(C)c1',
  '2,5-Dimethyltetrahydrofuran': 'CC1CCC(C)O1',
  'Benzoic acid': 'O=C(O)c1ccccc1',
  'Choline L-lactate': 'C[C@H](O)C(=O)[O-].C[N+](C)(C)CCO',
  'Citric acid': 'O=C(O)CC(O)(CC(=O)O)C(=O)O',
  'Cyclohexanone': 'O=C1CCCCC1',
  'Cyclohexanone dimethyl ketal (from cyclohexanone in CD3OD)': 'COC1(OC)CCCCC1',
  'Cyrene': 'O=C1CC[C@H]2CO[C@@H]1O2',
  'Cyrene methyl hemiketal (from Cyrene in CD3OD)': 'COC1(O)CC[C@H]2CO[C@@H]1O2',
  'Diazabicyclononene (DBN)': 'C1CN=C2CCCN2C1',
  'Diazabicycloundecene (DBU)': 'C1CCC2=NCCCN2CC1',
  'Diisopropylethylamine': 'CCN(C(C)C)C(C)C',
  'Dimethyl 2-methylglutarate (IRIS major component)': 'COC(=O)CCC(C)C(=O)OC',
  'Dimethyl ethylsuccinate (IRIS minor component)': 'CCC(CC(=O)OC)C(=O)OC',
  'Dimethyl isosorbide': 'CO[C@H]1CO[C@H]2[C@@H]1OC[C@H]2OC',
  'Dimethylpropyleneurea': 'CN1CCCN(C)C1=O',
  'Eucalyptol': 'CC12CCC(CC1)C(C)(C)O2',
  'Glycerol': 'OCC(O)CO',
  'Glycerol carbonate': 'O=C1OCC(CO)O1',
  'L-Lactic acid': 'C[C@H](O)C(=O)O',
  'Limonene': 'C=C(C)[C@H]1CC=C(C)CC1',
  'MTEOA MeOSO3': 'COS(=O)(=O)[O-].C[N+](CCO)(CCO)CCO',
  'Methyl 4-(dimethylamino)-2-ethyl-4-oxobutanoate (PolarClean minor component)': 'CCC(CC(=O)N(C)C)C(=O)OC',
  "N,N,N',N'-Tetramethylguanidine": 'CN(C)C(=N)N(C)C',
  'N,N-Dimethyllactamide (Agnique AMD 3L)': 'C[C@H](O)C(=O)N(C)C',
  'N-Methylmorpholine': 'CN1CCOCC1',
  'Pinacolone': 'CC(=O)C(C)(C)C',
  'PolarClean (methyl 5-(dimethylamino)-2-methyl-5-oxopentanoate)': 'COC(=O)C(C)CCC(=O)N(C)C',
  'Propane-1,2-diol': 'CC(O)CO',
  'Propionic acid': 'CCC(=O)O',
  'Propylene carbonate': 'CC1COC(=O)O1',
  'Triacetin': 'CC(=O)OCC(COC(C)=O)OC(C)=O',
  'bmim OAc': 'CC(=O)[O-].CCCCn1cc[n+](C)c1',
  'cis-1,2-Propylene sulfite': 'CC1COS(=O)O1',
  'emim OAc': 'CC(=O)[O-].CCn1cc[n+](C)c1',
  'p-Toluenesulfonic acid': 'Cc1ccc(S(=O)(=O)O)cc1',
  'tert-Amyl alcohol': 'CCC(C)(C)O',
  'trans-1,2-Propylene sulfite': 'CC1COS(=O)O1',
  'α-Pinene': 'CC1=CC[C@@H]2C[C@H]1C2(C)C',
  'γ-Valerolactone': 'CC1CCC(=O)O1',
};

/** What happens to a compound in one solvent (the paper's footnotes, in our words). */
const NOTES: Record<string, Record<string, string>> = {
  'Cyclohexanone': { CD3OD: 'Partly turns into its dimethyl ketal in CD3OD: see Cyclohexanone dimethyl ketal.' },
  'Cyrene': {
    CD3OD: 'Partly turns into its methyl hemiketal in CD3OD: see Cyrene methyl hemiketal.',
    D2O: 'In D2O these are the peaks of the hydrate (geminal diol).',
  },
  'Diazabicyclononene (DBN)': {
    CD3OD: 'The CH2 next to C=N exchanges to CD2 in CD3OD.',
    D2O: 'Hydrolyses in D2O: see 1-(3-Aminopropyl)-2-pyrrolidone.',
  },
  'Diazabicycloundecene (DBU)': {
    CD3OD: 'The CH2 next to C=N exchanges to CD2 in CD3OD.',
    D2O: 'Hydrolyses in D2O: see 1-(3-Aminopropyl)-2-azepanone.',
  },
  'Priamine 1071': { 'Acetone-d6': 'Forms an imine with acetone-d6.' },
};

/** A 13C cell's own coupling: "(t; 2.6)" is a 14N-13C triplet, "(quint.; 20.7)" a 2H-13C one. */
function carbonCell(v: string): { shift: string; mult: string | null; j: string | null } {
  const m = /^(.*?)\s*\(([^;)]+)(?:;\s*([\d.]+))?\)\s*$/.exec(v);
  const shift = (m ? m[1] : v).replace('/', ', ');
  if (!m) return { shift, mult: null, j: null };
  const mult = m[2].trim();
  return { shift, mult, j: m[3] ? `${m[3]} (${mult.startsWith('quint') ? '2H' : '14N'}-13C)` : null };
}

const missing = (v: string | undefined) => !v || v === 'N/A' || v === 'n.d.';

/** The table's rows from the transcription: one a signal in one solvent. */
export function greenNmrRows(src = text): Record<string, Cell>[] {
  const rows: Record<string, Cell>[] = [];
  /** compound, solvent and nucleus that showed at least one peak, and those listed at all */
  const seen = new Set<string>();
  const listed = new Map<string, { name: string; solvent: string; nucleus: string }>();
  let table = 0;
  for (const line of src.split('\n')) {
    const head = /^# Table (\d)/.exec(line);
    if (head) { table = Number(head[1]); continue; }
    if (!line.trim() || line.startsWith('#') || !table) continue;
    const p = line.split('|').map((s) => s.trim());
    const name = p[0];
    const add = (solvent: string, nucleus: string, row: Record<string, Cell>) => {
      const key = `${name}|${solvent}|${nucleus}`;
      listed.set(key, { name, solvent, nucleus });
      if (row.h === null && row.c === null) return;
      seen.add(key);
      rows.push({ name, solvent, nucleus, atom: p[1], ...row, note: NOTES[name]?.[solvent] ?? null, smiles: GREEN_SMILES[name] ?? null });
    };
    if (table < 3) {
      H_SOLVENTS[table - 1].forEach((solvent, k) => {
        const [d, m, j] = p.slice(3 + 3 * k, 6 + 3 * k);
        add(solvent, '1H', { nh: p[2] || null, h: missing(d) ? null : d, c: null, mult: missing(m) ? null : m, j: j || null });
      });
    } else {
      C_SOLVENTS.forEach((solvent, k) => {
        const v = p[2 + k];
        const cell = missing(v) ? null : carbonCell(v);
        add(solvent, '13C', { nh: null, h: null, c: cell?.shift ?? null, mult: cell?.mult ?? null, j: cell?.j ?? null });
      });
    }
  }
  // a compound with no peak at all in a solvent did not dissolve (reaction products: not made there)
  for (const [key, l] of listed) {
    if (seen.has(key) || l.name.includes('(from ')) continue;
    rows.push({ name: l.name, solvent: l.solvent, nucleus: l.nucleus, atom: null, nh: null, h: null, c: null, mult: null, j: null, note: 'Not soluble enough to see.', smiles: GREEN_SMILES[l.name] ?? null });
  }
  return rows;
}

export const GREEN_NMR_TABLE: KbTable = {
  id: 'green-nmr',
  title: 'Green Solvents in NMR',
  about: 'Where green solvents, acids and bases (Cyrene, GVL, 2,5-dimethyl-THF, DBU, ionic liquids…) appear as trace impurities in eight NMR solvents, ¹H and ¹³C. Pick a solvent and type a shift (2.27) to find what it could be. Atom labels follow the paper\'s numbering.',
  columns: [
    { key: 'name', label: 'Compound' },
    { key: 'solvent', label: 'Solvent', filter: true, narrow: true },
    { key: 'nucleus', label: 'Nucleus', filter: true, narrow: true },
    { key: 'atom', label: 'Atom', narrow: true },
    { key: 'nh', label: 'nH', narrow: true },
    { key: 'h', label: '1H (ppm)', shift: '1H' },
    { key: 'c', label: '13C (ppm)', shift: '13C' },
    { key: 'mult', label: 'Mult.', narrow: true },
    { key: 'j', label: 'J (Hz)' },
    { key: 'note', label: 'Note', prose: true },
    { key: 'smiles', label: 'SMILES', hidden: true },
  ],
  rows: greenNmrRows(),
  sources: [
    { label: 'Cseri, L.; Kumar, S.; Palchuk, P.; Szekely, G. ACS Sustainable Chem. Eng. 2023, 11, 5696 (Tables 1-3, CC BY 4.0; retyped, footnotes reworded)', url: 'https://doi.org/10.1021/acssuschemeng.3c00244' },
    { label: 'Licence: CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  ],
  canonicalSmiles: true,
  links: (row) => [{ label: 'PubChem', url: `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(String(row.name).replace(/\s*\(.*\)$/, ''))}` }],
};
