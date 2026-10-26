// The browser smoke test run on every pull request (`npm run smoke`, after `npm run build`): starts
// the built app in Chromium and goes through what everyone does first. It fails on any error the
// page reports, on a step that doesn't do what it should, and on a menu too tall for a laptop's
// window (each menu must fit in one column at 1280 × 720).
import { spawn } from 'node:child_process';
import { launch } from '../bench/browser.mjs';

const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  FAIL ' + msg); };
const step = (msg) => console.log('- ' + msg);

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
const up = async () => {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('the preview server did not start');
};

let browser;
try {
  await up();
  browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('page error: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console error: ' + m.text()); });
  page.on('dialog', (d) => d.dismiss());

  step('start');
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => window.__app?.chem?.ready || window.__app?.chem?.error, null, { timeout: 30000 });
  if (await page.evaluate(() => window.__app.chem.error)) fail('the chemistry engine did not load: ' + await page.evaluate(() => String(window.__app.chem.error)));
  console.log(`  up and chemistry ready in ${Date.now() - t0} ms`);
  await page.locator('#welcome-close').click({ timeout: 2000 }).catch(() => {});

  step('draw a ring and grow a bond with a hotkey');
  const box = await page.locator('#overlay').boundingBox();
  await page.click('[data-tool="ring-benzene"]');
  await page.mouse.click(box.x + 300, box.y + 300);
  const first = await page.evaluate(() => [...window.__app.doc.atoms.keys()][0]);
  const at = await page.evaluate((id) => window.__app.renderer.toScreen(window.__app.doc.atoms.get(id)), first);
  await page.mouse.move(box.x + at.x, box.y + at.y);
  await page.keyboard.press('1');
  const atoms = await page.evaluate(() => window.__app.doc.atoms.size);
  if (atoms !== 7) fail(`benzene plus one bond should have 7 atoms, not ${atoms}`);

  step('paste SMILES twice: the two land apart');
  for (const s of ['CC(=O)Oc1ccccc1C(=O)O', 'CC(=O)Oc1ccccc1C(=O)O']) {
    await page.evaluate((t) => window.__app.pasteChemistry(t), s);
  }
  const apart = await page.evaluate(() => {
    const d = window.__app.doc, frags = d.fragments().map((f) => [...f].map((id) => d.atoms.get(id)));
    const boxes = frags.map((a) => ({ x1: Math.min(...a.map((p) => p.x)), x2: Math.max(...a.map((p) => p.x)), y1: Math.min(...a.map((p) => p.y)), y2: Math.max(...a.map((p) => p.y)) }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const p = boxes[i], q = boxes[j];
      if (p.x1 < q.x2 && q.x1 < p.x2 && p.y1 < q.y2 && q.y1 < p.y2) return false;
    }
    return boxes.length === 3;
  });
  if (!apart) fail('pasted structures overlap (or did not all arrive)');

  step('save as CDXML and open it again');
  const round = await page.evaluate(() => {
    const before = window.__app.doc.atoms.size;
    const text = window.__app.cdxml('smoke.cdxml');
    window.__app.openText(text, 'smoke.cdxml');
    return [before, window.__app.doc.atoms.size];
  });
  if (round[0] !== round[1]) fail(`CDXML round trip changed the atom count: ${round[0]} → ${round[1]}`);

  step('open each kind of tab');
  for (const cmd of ['new-sheet', 'new-document', 'new-slides', 'new']) {
    await page.evaluate((c) => window.__app.command(c), cmd);
    await page.waitForTimeout(400);
  }

  step('every menu fits in one column at 1280 × 720');
  for (const btn of await page.$$('header > .menu-wrap > button')) {
    if (!(await btn.isVisible())) continue;
    const name = (await btn.innerText()).trim();
    await btn.click();
    await page.waitForTimeout(100);
    const cols = await page.evaluate(() => [...document.querySelectorAll('header > .menu-wrap > .menu')].find((m) => !m.hidden)?.classList.contains('cols'));
    if (cols) fail(`the ${name} menu is too tall for the window and breaks into columns`);
    await page.keyboard.press('Escape');
  }

  step('Settings opens with the search box ready and Esc closes it');
  await page.evaluate(() => window.__app.command('preferences'));
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => document.activeElement?.classList.contains('sw-search')))) fail('Settings did not put the cursor in "Find a setting"');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (await page.evaluate(() => !!document.querySelector('dialog.settings-window[open]'))) fail('Esc did not close Settings');

  for (const e of errors) fail(e);
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser?.close();
  server.kill();
}

if (failures.length) {
  console.log(`\n${failures.length} problem${failures.length === 1 ? '' : 's'} found.`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
