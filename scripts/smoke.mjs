// The browser smoke test run on every pull request (`npm run smoke`, after `npm run build`): starts
// the built app in Chromium and goes through what everyone does first. It fails on any error the
// page reports, on a step that doesn't do what it should, and on a menu too tall for a laptop's
// window (each menu must fit in one column at 1280 × 720, and every top menu and right-click menu
// must fit a 1389 × 700 window without scrolling).
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

  step('every ribbon, on every tab, is the Spreadsheet\'s height');
  await page.evaluate(() => window.__app.ws.newDesign({ w: 720, h: 540 }));
  await page.waitForTimeout(400);
  const heights = await page.evaluate(async () => {
    const ws = window.__app.ws, out = [];
    const frame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    for (const tab of [...ws.tabs]) {
      ws.activate(tab);
      await frame();
      const r = [...document.querySelectorAll('.ribbon')].find((x) => x.offsetParent);
      if (!r) continue;
      const tabs = [...r.querySelectorAll(':scope > .rb-tabs [role="tab"]')];
      // (an object's own tabs too, hidden until one is selected)
      for (const t of tabs) {
        const was = t.hidden;
        t.hidden = false;
        t.click();
        await frame();
        out.push({ mode: tab.mode, tab: t.textContent.trim(), h: r.offsetHeight });
        t.hidden = was;
      }
      tabs.find((t) => !t.hidden)?.click();
    }
    return out;
  });
  const sheetH = heights.find((x) => x.mode === 'sheet')?.h;
  console.log(`  ${heights.length} tabs in ${new Set(heights.map((x) => x.mode)).size} modes, ${sheetH} px`);
  if (new Set(heights.map((x) => x.mode)).size < 5) fail('not every mode\'s ribbon was checked');
  for (const x of heights) if (x.h !== sheetH) fail(`the ${x.mode} ribbon's ${x.tab} tab is ${x.h} px tall, not the Spreadsheet's ${sheetH} px`);
  await page.evaluate(() => window.__app.ws.activate(window.__app.ws.tabs.find((t) => t.mode === 'drawing')));
  await page.waitForTimeout(200);

  step('the Drawing Tools toolbox is two columns wide in every mode, scrolling when the window is too short');
  const columns = await page.evaluate(async () => {
    const ws = window.__app.ws, out = [];
    const frame = () => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    for (const tab of [...ws.tabs]) {
      ws.activate(tab);
      await frame();
      if (tab.mode === 'sheet' || tab.mode === 'document') continue;
      const box = document.querySelector('.toolbox[data-id="main"]'), body = box?.querySelector('.tb-body');
      const cells = box?.querySelector('.tb-cells');
      if (!cells || !box.offsetParent) { out.push({ mode: tab.mode, cols: 0 }); continue; }
      const b = box.getBoundingClientRect();
      out.push({ mode: tab.mode, cols: getComputedStyle(cells).gridTemplateColumns.split(' ').length, bottom: b.bottom, h: innerHeight, page: document.documentElement.scrollHeight, scrolls: body.scrollHeight > body.clientHeight });
    }
    ws.activate(ws.tabs.find((t) => t.mode === 'drawing'));
    return out;
  });
  for (const x of columns) {
    if (x.cols !== 2) fail(`the Drawing Tools toolbox in a ${x.mode} tab is ${x.cols} columns wide, not two`);
    else if (x.bottom > x.h || x.page > x.h) fail(`the Drawing Tools toolbox in a ${x.mode} tab runs past the window's foot (${Math.round(x.bottom)} px of ${x.h})`);
  }
  if (!columns.some((x) => x.scrolls)) fail('at 1280 × 720 the Drawing Tools toolbox should scroll inside itself');
  await page.waitForTimeout(200);

  step('the Drawing Tools toolbox keeps its docked width when it floats');
  const widths = await page.evaluate(async () => {
    const tb = window.__app.toolboxes;
    const w = () => document.querySelector('.toolbox[data-id="main"] .tb-cells').getBoundingClientRect().width;
    const box = () => document.querySelector('.toolbox[data-id="main"]').getBoundingClientRect().width;
    // (its scroll bar's room, while it scrolls)
    const bar = () => { const b = document.querySelector('.toolbox[data-id="main"] > .tb-body'); return b.offsetWidth - b.clientWidth; };
    tb.setLocked(false);
    tb.put('main', { dock: 'float', x: 300, y: 120 });
    await new Promise((ok) => requestAnimationFrame(ok));
    const got = { cells: w(), box: box(), bar: bar(), bottom: document.querySelector('.toolbox[data-id="main"]').getBoundingClientRect().bottom };
    tb.reset();
    return got;
  });
  if (widths.box > widths.cells + widths.bar + 20) fail(`the floating Drawing Tools toolbox is ${Math.round(widths.box)} px wide for ${Math.round(widths.cells)} px of buttons and a ${widths.bar} px scroll bar`);
  if (widths.cells > 100) fail(`the floating Drawing Tools toolbox has ${Math.round(widths.cells)} px of buttons across: more than two columns`);
  if (widths.bottom > 720) fail('the floating Drawing Tools toolbox runs past the window\'s foot');

  step('typing on the Canvas, the Home tab\'s Font and Paragraph groups stand in for the bar above the text');
  await page.evaluate(() => window.__app.editor.setTool('text'));
  const ov = await page.locator('#overlay').boundingBox();
  await page.mouse.click(ov.x + ov.width / 2, ov.y + 120);
  await page.keyboard.type('CH2Cl2');
  const typing = await page.evaluate(() => ({
    open: !!window.__app.editor.typingCaption,
    bar: document.querySelector('.caption-bar')?.hidden,
    buttons: document.querySelectorAll('#canvas-ribbon [data-cr-panel="home"] .cr-font .cb-btn').length,
  }));
  await page.keyboard.press('Escape');
  if (!typing.open) fail('clicking with the Text tool opened no text to type in');
  else if (typing.bar !== true) fail('the bar above the text shows while the Canvas Home tab has the same buttons');
  if (typing.buttons < 18) fail(`the Canvas Home tab's Font and Paragraph groups have ${typing.buttons} buttons, not all of the typing bar's`);

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

  step('every menu fits a 1389 × 700 window without scrolling: the top menus and the right-click menus');
  await page.setViewportSize({ width: 1389, height: 700 });
  await page.waitForTimeout(300);
  /** The menu open now (the right-click menu, else the top menu showing): too tall if it scrolls or runs off the window. */
  const tooTall = (what) => page.evaluate((what) => {
    const m = document.querySelector('.context-menu, .menu.popup-menu, .text-menu')
      ?? [...document.querySelectorAll('header > .menu-wrap > .menu')].find((x) => !x.hidden);
    if (!m) return `the ${what} menu did not open`;
    const r = m.getBoundingClientRect();
    if (m.scrollHeight > m.clientHeight + 1 || r.bottom > innerHeight + 0.5) return `the ${what} menu is too tall for a 1389 × 700 window (${Math.round(m.scrollHeight)} px of items in ${Math.round(Math.min(m.clientHeight, innerHeight - r.top))} px)`;
    return null;
  }, what);
  const close = async () => { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(100); };
  const showTab = async (mode) => {
    await page.evaluate((mode) => window.__app.ws.activate(window.__app.ws.tabs.find((t) => t.mode === mode)), mode);
    await page.waitForTimeout(400);
  };
  for (const mode of ['drawing', 'sheet', 'document', 'slides', 'design']) {
    await showTab(mode);
    for (const btn of await page.$$('header > .menu-wrap > button')) {
      if (!(await btn.isVisible())) continue;
      const name = (await btn.innerText()).trim();
      await btn.click();
      await page.waitForTimeout(100);
      const bad = await tooTall(`${mode} ${name}`);
      if (bad) fail(bad);
      await close();
    }
  }
  /** Right-click at (x, y) in the window and check the menu that opens. */
  const rightClick = async (what, x, y) => {
    await page.mouse.click(x, y, { button: 'right' });
    await page.waitForTimeout(250);
    const bad = await tooTall(what);
    if (bad) fail(bad);
    await close();
  };
  // the Canvas: empty space, an atom, and a whole structure picked
  await page.evaluate(() => window.__app.command('new'));
  await page.waitForTimeout(400);
  const cv = await page.locator('#overlay').boundingBox();
  await rightClick('Canvas empty-space right-click', cv.x + cv.width / 2, cv.y + cv.height / 2);
  await page.click('[data-tool="ring-benzene"]');
  await page.mouse.click(cv.x + cv.width / 2, cv.y + cv.height / 2);
  await page.evaluate(() => window.__app.editor.setTool('select'));
  const ringAtom = await page.evaluate(() => { const d = window.__app.editor.doc; return window.__app.renderer.toScreen(d.atoms.get([...d.atoms.keys()][0])); });
  await page.mouse.click(cv.x + 20, cv.y + cv.height - 20);
  await rightClick('Canvas atom right-click', cv.x + ringAtom.x, cv.y + ringAtom.y);
  await page.evaluate(() => window.__app.command('select-all'));
  await rightClick('Canvas selected-structure right-click', cv.x + ringAtom.x, cv.y + ringAtom.y);
  /** The middle of the biggest canvas showing (the sheet's grid, the document's page, the slide). */
  const middle = () => page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].filter((x) => x.offsetParent).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    const r = c.getBoundingClientRect();
    return { x: r.x + Math.min(200, r.width / 2), y: r.y + Math.min(140, r.height / 2) };
  });
  await showTab('sheet');
  const cell = await middle();
  await page.mouse.click(cell.x, cell.y);
  await rightClick('Spreadsheet cell right-click', cell.x, cell.y);
  await showTab('document');
  const text = await middle();
  await page.mouse.click(text.x, text.y);
  await page.keyboard.type('Aldol condensation');
  await rightClick('Document text right-click', text.x, text.y);
  await showTab('slides');
  const slide = await page.locator('#overlay').boundingBox();
  await rightClick('Presentation slide right-click', slide.x + slide.width / 2, slide.y + slide.height / 2);
  await showTab('design');
  const page2 = await page.locator('#overlay').boundingBox();
  await rightClick('Design page right-click', page2.x + page2.width / 2, page2.y + page2.height / 2);

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
