// Check each ligand's structure against PubChem: looks the ligand up by name (or the name or
// CID in its `pc` option), and compares the InChIKey's first block (the skeleton, leaving out
// stereo and charge) with the one RDKit makes from our SMILES. What PubChem said is kept in
// scripts/ligands/pubchem.json, so the library builds without the network; run this again
// after changing ligand-data.mjs (node scripts/ligands/check-pubchem.mjs [--refresh]).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FAMILIES } from './ligand-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const RDKit = await require('@rdkit/rdkit')();
const file = path.join(here, 'pubchem.json');
const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const refresh = process.argv.includes('--refresh');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url);
    if (r.status === 404) return null;
    if (r.ok) return r.json();
    await sleep(1000 * 2 ** i);
  }
  return null;
}

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound';
async function lookup(q) {
  const by = /^\d+$/.test(String(q)) ? `cid/${q}` : `name/${encodeURIComponent(q)}`;
  const j = await get(`${PUG}/${by}/property/InChIKey,IUPACName,Title/JSON`);
  await sleep(250);
  const p = j?.PropertyTable?.Properties?.[0];
  return p ? { cid: p.CID, inchikey: p.InChIKey, title: p.Title ?? p.IUPACName ?? '' } : null;
}
async function bySmiles(smi) {
  const j = await get(`${PUG}/smiles/${encodeURIComponent(smi)}/property/InChIKey,Title/JSON`);
  await sleep(250);
  const p = j?.PropertyTable?.Properties?.[0];
  return p?.CID ? { cid: p.CID, inchikey: p.InChIKey, title: p.Title ?? '' } : null;
}

/**
 * InChIKey of our SMILES (atom numbers taken off). PubChem keeps free carbenes (IAd, IMes) as
 * CH2, so a carbene donor is written that way to compare.
 */
function ourKey(smiles) {
  const m = RDKit.get_mol(smiles.replace(/\[C:(\d+)\]/g, '[CH2:$1]').replace(/:\d+\]/g, ']'));
  if (!m) return null;
  const k = RDKit.get_inchikey_for_inchi(m.get_inchi());
  const can = m.get_smiles();
  m.delete();
  return { key: k, smiles: can };
}

let bad = 0, n = 0;
for (const fam of FAMILIES) {
  for (const [id, , name, smiles, opts = {}] of fam.items) {
    n++;
    const ours = ourKey(smiles);
    if (!ours) { console.log(`✗ ${id}: RDKit cannot read ${smiles}`); bad++; continue; }
    let rec = cache[id];
    const q = opts.pc ?? name;
    if (!rec || refresh || rec.q !== q || rec.ours !== ours.key) {
      const named = q === 'none' ? null : await lookup(q);
      const match = (r) => !!r && r.inchikey.slice(0, 14) === ours.key.slice(0, 14);
      // the structure itself in PubChem, when the name finds something else (or nothing)
      const found = match(named) ? null : await bySmiles(ours.smiles);
      rec = { q, ours: ours.key };
      if (match(named)) Object.assign(rec, { cid: named.cid, inchikey: named.inchikey, title: named.title, how: 'name' });
      else if (match(found)) Object.assign(rec, { cid: found.cid, inchikey: found.inchikey, title: found.title, how: 'structure' }, named ? { named: { cid: named.cid, inchikey: named.inchikey, title: named.title } } : {});
      else if (named) rec.named = { cid: named.cid, inchikey: named.inchikey, title: named.title };
      cache[id] = rec;
    }
    // the record to cite: the structure's own, except that for a carbene (compared as its CH2
    // skeleton) only a record named as the ylidene; for one written another way, its name's
    const carbene = /\[C:\d+\]/.test(smiles);
    const ylidene = (r) => !!r && /ylidene|ium-\d*-?ide/i.test(r.title ?? '');
    rec.cite = carbene ? (ylidene(rec) ? rec.cid : ylidene(rec.named) ? rec.named.cid : undefined)
      : rec.cid ?? (opts.check ? rec.named?.cid : undefined);
    if (rec.cite === undefined) delete rec.cite;
    const nm = rec.named ? `name "${q}" finds CID ${rec.named.cid} "${rec.named.title}" ${rec.named.inchikey}` : `name "${q}" not found`;
    if (rec.how === 'name') continue;
    // the structure itself is in PubChem (its name there is shown to be read over)
    if (rec.how === 'structure') { console.log(`~ ${id} (${name}): structure is CID ${rec.cid} "${rec.title}"; ${nm}`); continue; }
    if (opts.check) { console.log(`· ${id}: ${rec.cid ? `structure is CID ${rec.cid} "${rec.title}"` : 'structure not in PubChem'}; ${nm} (${opts.check})`); continue; }
    bad++;
    console.log(`✗ ${id} (${name}): ours ${ours.key} ${ours.smiles}; ${rec.cid ? `structure is CID ${rec.cid} "${rec.title}"` : 'structure not in PubChem'}; ${nm}`);
  }
  fs.writeFileSync(file, JSON.stringify(cache, null, 1) + '\n');
}
console.log(`${n} ligands, ${bad} to look at`);
