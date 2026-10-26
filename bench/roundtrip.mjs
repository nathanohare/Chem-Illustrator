// Real files through a save and reopen: `npm run roundtrip -- <folder>` (after `npm run build`).
// Opens each drawing in the folder (.cdxml, .cdx, .mol, .sdf) in the built app, saves it as CDXML,
// opens that again, and reports anything that changed: the number of atoms, bonds, text and arrows,
// and the structures themselves (as SMILES). The folder stays on the computer it is on; nothing is
// copied into the project, so private files (such as a lab's ChemDraw files) can be checked.
// Set CHROMIUM_PATH if Playwright's own Chromium is missing.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './browser.mjs';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.log('Usage: npm run roundtrip -- <folder of drawings>');
  process.exit(2);
}
const KINDS = ['.cdxml', '.cdx', '.mol', '.sdf'];
const files = fs.readdirSync(dir).filter((f) => KINDS.includes(path.extname(f).toLowerCase())).sort();
if (!files.length) { console.log(`No ${KINDS.join(', ')} files in ${dir}.`); process.exit(2); }

const PORT = 4181;
const URL = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
let changed = 0;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) break; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', (d) => d.dismiss());
  await page.goto(URL);
  await page.waitForFunction(() => window.__app?.chem?.ready, null, { timeout: 30000 });

  // what a drawing holds, to compare before and after
  const snapshot = () => page.evaluate(async () => {
    const d = window.__app.doc;
    let smiles = '';
    try { smiles = d.atoms.size ? (await window.__app.smiles(true)).split('.').sort().join('.') : ''; } catch { smiles = '(no SMILES)'; }
    return { atoms: d.atoms.size, bonds: d.bonds.size, text: d.captions.size, arrows: d.arrows.size, smiles };
  });

  console.log(`${'file'.padEnd(40)} result`);
  for (const f of files) {
    const bytes = [...fs.readFileSync(path.join(dir, f))];
    let line;
    try {
      const opened = await page.evaluate(async ([b, name]) => window.__app.ws.openBytes(new Uint8Array(b), name), [bytes, f]);
      if (opened === false) { line = 'did not open'; changed++; }
      else {
        const before = await snapshot();
        await page.evaluate(() => window.__app.openText(window.__app.cdxml('round.cdxml'), 'round.cdxml'));
        const after = await snapshot();
        const diffs = ['atoms', 'bonds', 'text', 'arrows'].filter((k) => before[k] !== after[k]).map((k) => `${k} ${before[k]} → ${after[k]}`);
        if (before.smiles !== after.smiles) diffs.push('structures differ');
        if (diffs.length) changed++;
        line = diffs.length ? 'CHANGED: ' + diffs.join(', ') : `same (${before.atoms} atoms, ${before.text} text, ${before.arrows} arrows)`;
      }
    } catch (e) {
      line = 'ERROR: ' + String(e.message ?? e).split('\n')[0];
      changed++;
    }
    console.log(`${f.slice(0, 39).padEnd(40)} ${line}`);
    await page.evaluate(() => window.__app.command('close')).catch(() => {});
  }
} finally {
  await browser?.close();
  server.kill();
}
console.log(`\n${files.length - changed} of ${files.length} files came back the same.`);
process.exit(changed ? 1 : 0);
