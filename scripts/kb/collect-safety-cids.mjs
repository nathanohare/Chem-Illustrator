// Makes safety-cids.txt, the compounds for the big Reagent Safety table: every PubChem compound
// that an open source (HSDB, NIOSH, NOAA CAMEO, OSHA, DOE PAC, EU Annex VI) files a toxicity value,
// IDLH, reactivity alert, flash point, incompatibility, exposure route or harmonised classification
// under. PubChem's annotation lists give these a thousand at a time. Lines already in the file are
// kept (compounds added by hand, or from a lab's inventory), so the list only grows.
//
//   node scripts/kb/collect-safety-cids.mjs     then   node scripts/kb/build-safety.mjs --extra

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const cache = join(process.env.KB_CACHE || join(tmpdir(), 'kb-pubchem-cache'), 'headings');
const H = ['Non-Human Toxicity Values','Immediately Dangerous to Life or Health (IDLH)','Reactivity Alerts','Flash Point','Hazardous Reactivities and Incompatibilities','GHS Classification','Exposure Routes'];
const OPEN = new Set(['Hazardous Substances Data Bank (HSDB)','The National Institute for Occupational Safety and Health (NIOSH)','CAMEO Chemicals','Occupational Safety and Health Administration (OSHA)','PAC Chemical Database, U.S. Department of Energy','Regulation (EC) No 1272/2008 of the European Parliament and of the Council']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(cache, { recursive: true });
async function get(h, p) {
  const f = join(cache, `${h.replace(/\W+/g, '_')}-${p}.json`);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  for (let i = 0; i < 5; i++) {
    await sleep(400);
    const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/annotations/heading/JSON?heading=${encodeURIComponent(h)}&heading_type=Compound&page=${p}`).catch(() => null);
    if (r?.ok) { const j = await r.json(); const slim = { pages: j.Annotations.TotalPages, a: j.Annotations.Annotation.map((x) => [x.SourceName, x.LinkedRecords?.CID ?? []]) }; writeFileSync(f, JSON.stringify(slim)); return slim; }
    await sleep(3000 * (i + 1));
  }
  throw new Error(h + p);
}
const by = {}; const all = new Set();
for (const h of H) {
  let p = 1, pages = 1; by[h] = new Set();
  do { const j = await get(h, p); pages = j.pages; for (const [s, cids] of j.a) if (OPEN.has(s) && cids.length === 1) { by[h].add(cids[0]); all.add(cids[0]); } console.log(h, p, '/', pages, by[h].size); p++; } while (p <= pages);
}
const file = join(here, 'safety-cids.txt');
const kept = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => /^\d+$/.test(l.trim())).map(Number) : [];
const cids = [...new Set([...kept, ...all])].sort((a, b) => a - b);
// the comment lines at the top are kept too (they say where hand-added compounds came from)
const head = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((l) => l.startsWith('#')) : [];
if (!head.length) head.push('# PubChem CIDs for the big Reagent Safety table (scripts/kb/collect-safety-cids.mjs).', '# Compounds without open hazard data are dropped when the table is built.');
writeFileSync(file, `${head.join('\n')}\n${cids.join('\n')}\n`);
console.log(`${cids.length} compounds (${all.size} from PubChem's lists) in ${file}`);
