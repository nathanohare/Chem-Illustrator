// Builds src/kb/aqsol-data.json, the Solubility table, from AqSolDB: measured aqueous solubility of
// 9,982 compounds curated from nine public datasets (Sorkun, Khetan & Er, Sci. Data 2019, 6, 143;
// https://doi.org/10.1038/s41597-019-0151-1). The dataset is CC0 1.0 on Harvard Dataverse
// (https://doi.org/10.7910/DVN/OVHAW8); this reads the same file from the authors' GitHub.
//
//   node scripts/kb/build-aqsol.mjs [path/to/data_curated.csv]

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_ = 'https://raw.githubusercontent.com/mcsorkun/AqSolDB/master/results/data_curated.csv';

/** One CSV line into its fields (quoted fields may hold commas). */
function fields(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

const text = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await (await fetch(URL_)).text();
const [head, ...lines] = text.replace(/\r/g, '').split('\n').filter(Boolean);
const col = Object.fromEntries(fields(head).map((h, i) => [h, i]));
// RDKit's own SMILES (the app's search compares these), made here once rather than in the window
const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
const canon = (smi) => {
  const mol = RDKit.get_mol(smi);
  try { return mol && mol.is_valid() ? mol.get_smiles() : smi; } finally { mol?.delete(); }
};
const rows = lines.map(fields).map((f) => [
  f[col.Name],
  canon(f[col.SMILES]),
  Math.round(Number(f[col.Solubility]) * 100) / 100,
  Math.round(Number(f[col.MolWt]) * 10) / 10,
  Number(f[col.Group].slice(1)),
]).filter((r) => r[0] && Number.isFinite(r[2]));
const file = join(root, 'src', 'kb', 'aqsol-data.json');
writeFileSync(file, JSON.stringify({
  note: 'AqSolDB (Sorkun, Khetan & Er, Sci. Data 2019, 6, 143), CC0 1.0. Each row: name, SMILES (RDKit canonical), log S (mol/L, about 25 °C), MW, reliability group 1-5.',
  rows,
}).replace(/\],\[/g, '],\n[') + '\n');
console.log(`Wrote ${rows.length} compounds to ${file}`);
