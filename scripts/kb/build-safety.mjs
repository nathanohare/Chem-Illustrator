// Builds src/kb/safety-data.json: hazard numbers and physical constants for the compounds listed in
// safety-compounds.txt, from PubChem's records of US government and EU sources whose terms allow
// reuse (HSDB, NIOSH, NOAA CAMEO, OSHA, DOE PAC, EU Regulation 1272/2008). Sources without a reuse
// licence (Haz-Map, ILO cards, supplier notifications to ECHA, NITE) are skipped. Every value keeps
// the name of the source it came from.
//
//   node scripts/kb/build-safety.mjs            fetch what isn't cached, then build
//   node scripts/kb/build-safety.mjs --extra    build src/kb/safety-extra.json, the big table
//   KB_CACHE=/some/dir node scripts/kb/build-safety.mjs
//
// The big table (--extra) covers the PubChem compounds in safety-cids.txt (made by
// collect-safety-cids.mjs) that an open source gives hazard data for. Its rows are keyed by PubChem
// CID and carry no CAS numbers: CAS's terms require a licence to publish them in bulk.
//
// PubChem asks for no more than 5 requests a second; this makes about 2 a second.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { casOf, compactRecord, hasHazardData, safetyRecordFrom } from '../../src/kb/pubchem-safety.ts';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const root = join(here, '..', '..');
const cache = process.env.KB_CACHE || join(tmpdir(), 'kb-pubchem-cache');
mkdirSync(cache, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, file) {
  const path = join(cache, file);
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8'));
  for (let i = 0; i < 4; i++) {
    await sleep(450);
    const r = await fetch(url).catch(() => null);
    if (r?.ok) { const j = await r.json(); writeFileSync(path, JSON.stringify(j)); return j; }
    if (r && r.status === 404) { writeFileSync(path, 'null'); return null; }
    await sleep(2000 * (i + 1));
  }
  throw new Error(`PubChem didn't answer: ${url}`);
}

function readList() {
  return readFileSync(join(here, 'safety-compounds.txt'), 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const [name, ask, cas] = l.split('|').map((s) => s.trim()); return { name, ask: ask || name, cas: cas || null }; });
}

async function main() {
  const list = readList();
  const out = [];
  for (const [n, c] of list.entries()) {
    let cid = null;
    if (/^CID:\d+$/.test(c.ask)) cid = Number(c.ask.slice(4));
    else {
      const j = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(c.ask)}/cids/JSON`, `cid-${c.ask.replace(/[^a-z0-9]+/gi, '_')}.json`);
      cid = j?.IdentifierList?.CID?.[0] ?? null;
    }
    if (!cid) { console.warn(`! ${c.name}: not found on PubChem`); continue; }
    const props = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/MolecularFormula,MolecularWeight,SMILES/JSON`, `prop-${cid}.json`);
    const p = props?.PropertyTable?.Properties?.[0] ?? {};
    // PubChem's computed XLogP3 (public domain): the fallback for log Kow in the skin estimate
    const xl = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/XLogP/JSON`, `xlogp-${cid}.json`);
    const xlogp = xl?.PropertyTable?.Properties?.[0]?.XLogP;
    const view = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON`, `view-${cid}.json`);
    const rec = view?.Record ?? {};
    out.push(safetyRecordFrom({ name: c.name, cid, cas: c.cas ?? casOf(rec), formula: p.MolecularFormula, mw: p.MolecularWeight, smiles: p.SMILES, xlogp, view: rec }));
    process.stdout.write(`\r${n + 1}/${list.length} ${c.name.padEnd(50)}`);
  }
  process.stdout.write('\n');
  const file = join(root, 'src', 'kb', 'safety-data.json');
  writeFileSync(file, JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    note: 'Built by scripts/kb/build-safety.mjs from PubChem records of HSDB, NIOSH, NOAA CAMEO, OSHA, DOE PAC and EU Regulation 1272/2008 Annex VI. US government data is public domain; EU legislation may be reused with acknowledgement.',
    compounds: out,
  }, null, 0).replace(/\},\{"name"/g, '},\n{"name"') + '\n');
  console.log(`Wrote ${out.length} compounds to ${file}`);
}

/** The big table: every CID in safety-cids.txt with open hazard data, except the compounds above. */
async function extra() {
  const core = new Set(JSON.parse(readFileSync(join(root, 'src', 'kb', 'safety-data.json'), 'utf8')).compounds.map((c) => c.cid));
  const cids = [...new Set(readFileSync(join(here, 'safety-cids.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => /^\d+$/.test(l)).map(Number))].filter((c) => !core.has(c));
  // formula, molar mass, SMILES, XLogP3 and title, a hundred compounds a request
  const props = new Map();
  for (let i = 0; i < cids.length; i += 100) {
    const part = cids.slice(i, i + 100);
    const url = (ids) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${ids.join(',')}/property/Title,MolecularFormula,MolecularWeight,SMILES,XLogP,Charge/JSON`;
    // PubChem refuses a whole batch for one bad CID: then ask for each on its own, skipping any it refuses
    let got = await get(url(part), `props-${part[0]}-${part.length}.json`).catch(() => undefined);
    if (got === undefined) {
      got = { PropertyTable: { Properties: [] } };
      for (const c of part) {
        const one = await get(url([c]), `props-${c}-1.json`).catch(() => null);
        got.PropertyTable.Properties.push(...(one?.PropertyTable?.Properties ?? []));
      }
    }
    for (const p of got?.PropertyTable?.Properties ?? []) props.set(p.CID, p);
  }
  // RDKit's own SMILES (the app's search compares these), made here once rather than in the window
  const RDKit = await createRequire(import.meta.url)('@rdkit/rdkit')();
  const canon = (smi) => {
    const mol = RDKit.get_mol(smi);
    try { return mol && mol.is_valid() ? mol.get_smiles() : smi; } finally { mol?.delete(); }
  };
  const out = [];
  let n = 0;
  for (const cid of cids) {
    n++;
    const p = props.get(cid);
    // single named compounds only: no title, no structure or a polymer is left out
    if (!p?.Title || !p.SMILES || !p.MolecularWeight || /\*/.test(p.SMILES)) continue;
    // one record PubChem won't serve is skipped (and tried again next run), not the whole build
    const view = await get(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON`, `view-${cid}.json`).catch((e) => { console.warn(`\n! ${e.message}`); return null; });
    if (!view?.Record) continue;
    const r = safetyRecordFrom({ name: p.Title, cid, cas: null, formula: p.MolecularFormula, mw: p.MolecularWeight, smiles: canon(p.SMILES), xlogp: p.XLogP, view: view.Record });
    if (hasHazardData(r)) out.push(compactRecord(r));
    if (n % 25 === 0) process.stdout.write(`\r${n}/${cids.length} kept ${out.length}   `);
  }
  process.stdout.write('\n');
  out.sort((a, b) => a.name.localeCompare(b.name));
  // empty fields left out to keep the file small
  const lean = out.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== false && !(Array.isArray(v) && !v.length))));
  const file = join(root, 'src', 'kb', 'safety-extra.json');
  writeFileSync(file, JSON.stringify({
    built: new Date().toISOString().slice(0, 10),
    note: 'Built by scripts/kb/build-safety.mjs --extra from PubChem records of HSDB, NIOSH, NOAA CAMEO, OSHA, DOE PAC and EU Regulation 1272/2008 Annex VI. Keyed by PubChem CID; no CAS numbers.',
    compounds: lean,
  }).replace(/\},\{"name"/g, '},\n{"name"') + '\n');
  console.log(`Wrote ${out.length} compounds to ${file}`);
}

if (process.argv.includes('--extra')) await extra(); else await main();
