// nmrdb.org predictions (the Zakodium service that nmrdb.org and nmr-processing call) for every line
// "SMILES ID" of a .smi file (head_to_head.py sample writes one); appends raw signals to OUT and skips
// ids already there, so it can be stopped and rerun. head_to_head.py score reads OUT as it is.
// Run from the repo root (uses the app's openchemlib): node scripts/nmr/nmrdb_predict.mjs IN.smi OUT.jsonl
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import * as OCL from 'openchemlib';
const Molecule = OCL.Molecule ?? OCL.default.Molecule;
const [inp, out] = process.argv.slice(2);
const done = new Set(existsSync(out) ? readFileSync(out, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).id) : []);
const lines = readFileSync(inp, 'utf8').trim().split(/\r?\n/);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The service is shared and rate limited: keep to one request every PACE ms (default 8 s) and wait
// as long as a 429 answer asks. START_DELAY (s) waits out a limit left from an earlier run.
const PACE = Number(process.env.PACE ?? 8000);
await sleep(Number(process.env.START_DELAY ?? 0) * 1000);
let n = 0;
for (const l of lines) {
  const k = l.lastIndexOf(' ');
  const smi = l.slice(0, k), id = l.slice(k + 1).trim();
  if (done.has(id)) continue;
  const rec = { id };
  let limited = 0;
  try {
    const m = Molecule.fromSmiles(smi);
    const plain = m.toMolfileV3();
    m.addImplicitHydrogens();
    const withH = m.toMolfileV3();
    for (const nuc of ['carbon', 'proton']) {
      for (let attempt = 0; attempt < 3; attempt++) {
        // as nmr-processing sends it (explicit H); a second try without them
        const molfile = attempt === 1 ? plain : withH;
        await sleep(PACE);
        const r = await fetch(`https://nmr-prediction.service.zakodium.com/v1/predict/${nuc}`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ molfile }) });
        if (r.status === 200) { delete rec[nuc + 'Error']; const { data } = await r.json(); rec[nuc] = (data.signals ?? []).map((s) => ({ delta: s.delta, nbAtoms: s.nbAtoms, atoms: s.atoms })); break; }
        rec[nuc + 'Error'] = `${r.status} ${(await r.text()).slice(0, 200)}`;
        if (r.status === 429) {
          // rate limited: wait as long as the service asks, and do not count it as an attempt
          const wait = Number(r.headers.get('retry-after')) || 60;
          console.log(`${new Date().toISOString()} 429 at ${id}, waiting ${wait} s`);
          await sleep((wait + 1) * 1000);
          if (++limited < 30) attempt--;
          continue;
        }
        if (r.status !== 500) await sleep(2000 * (attempt + 1));
      }
    }
  } catch (e) { rec.error = String(e); }
  appendFileSync(out, JSON.stringify(rec) + '\n');
  if (++n % 25 === 0) console.log(`${new Date().toISOString()} ${n} done`);
}
console.log('finished', n);
