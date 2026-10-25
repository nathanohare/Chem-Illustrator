// App Store / TestFlight pictures of the iPad app: the program in Touch Mode at an iPad Pro 13"
// size (1376 × 1032 points, 2× = 2752 × 2064 pixels). Start the program first (npm run dev), then:
// node scripts/store-shots.mjs [address] [folder]

import { open, drawScheme, fitOnSlide } from './shot-lib.mjs';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const dir = (process.argv[3] ?? 'store-shots') + '/';
mkdirSync(dir, { recursive: true });

const { browser, page, problems } = await open(url, { width: 1376, height: 1032, scale: 2 });
const snap = async (name) => {
  await page.mouse.move(2, 1030);
  await page.evaluate(() => document.querySelector('#flash')?.classList.remove('show'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${dir}${name}.png` });
  console.log(dir + name + '.png');
};
await page.evaluate(() => window.__app.command('touch-mode-on'));
await page.waitForTimeout(400);

// 1. the drawing, with the atom keypad, the product picked
await drawScheme(page, { select: true });
await page.waitForTimeout(800);
await snap('1-drawing');

// 2. a dark page
await page.evaluate(() => { window.__app.editor.clearSelection(); window.__app.command('dark-page'); });
await snap('2-dark');
await page.evaluate(() => window.__app.command('dark-page'));

// 3. slides
await page.evaluate(async () => {
  const a = window.__app; a.ws.newSlides();
  const t = await import('/src/deck/templates.ts');
  const d = a.ws.active.deck; d.setMaster(t.applyTemplate(d.master, t.SLIDE_TEMPLATES.find((x) => x.id === 'harbor')));
  a.command('new-slide');
});
await page.waitForTimeout(800);
const phs = async () => page.evaluate(() => { const a = window.__app; return [...a.doc.captions.values()].filter(c => c.ph).map(c => { const b = a.renderer.captionBox(c); const s = a.renderer.toScreen({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 }); const r = document.querySelector('#overlay').getBoundingClientRect(); return [s.x + r.left, s.y + r.top]; }); });
let p = await phs();
await page.mouse.click(...p[0]); await page.keyboard.type('Route to the enoate'); await page.keyboard.press('Escape');
await page.mouse.click(...p[1]); await page.keyboard.type('Suzuki coupling, then Horner-Wadsworth-Emmons olefination'); await page.keyboard.press('Escape');
await page.evaluate(() => window.__app.command('fold-side'));
await page.waitForTimeout(400);
await drawScheme(page, { xs: [150, 420, 740], y: 360, fit: false });
await fitOnSlide(page);
await page.evaluate(() => window.__app.editor.clearSelection());
await snap('3-slides');
await page.evaluate(() => window.__app.command('fold-side'));

// 4. a document with a structure in the text
await page.evaluate(() => window.__app.ws.newDocument()); await page.waitForTimeout(800);
await page.mouse.click(680, 380); await page.waitForTimeout(200);
await page.keyboard.press('Control+Alt+1');
await page.keyboard.type('Ethyl (E)-3-([1,1\'-biphenyl]-4-yl)acrylate'); await page.keyboard.press('Enter');
await page.keyboard.type('Sodium hydride (60% in oil, 0.48 g, 12.0 mmol) was suspended in THF (30 mL) at 0 °C, and triethyl phosphonoacetate (2.4 mL, 12.0 mmol) was added dropwise. After 20 min, a solution of 4-phenylbenzaldehyde (1.82 g, 10.0 mmol) in THF (10 mL) was added. The mixture was stirred for 2 h, quenched with saturated aqueous NH4Cl and extracted with EtOAc. Chromatography gave the enoate as a white solid (2.22 g, 88%, E/Z > 20:1).');
await page.keyboard.press('Enter');
await page.keyboard.press('Control+e');
await page.evaluate(async () => { const dm = window.__app.docMode; const r = await dm.host.toStructure('CCOC(=O)/C=C/c1ccc(-c2ccccc2)cc1', dm.file.t.drawingStyle); dm.insertDrawing(r.contents); });
await page.waitForTimeout(800);
await page.keyboard.press('Enter');
await page.keyboard.press('Control+l');
await page.keyboard.type('1H NMR (400 MHz, CDCl3): δ 7.73 (d, J = 16.0 Hz, 1H), 7.64–7.58 (m, 6H), 7.46 (t, J = 7.5 Hz, 2H), 7.38 (t, J = 7.3 Hz, 1H), 6.49 (d, J = 16.0 Hz, 1H), 4.28 (q, J = 7.1 Hz, 2H), 1.35 (t, J = 7.1 Hz, 3H).');
await page.waitForTimeout(600);
await snap('4-document');

// 5. a sheet of products with structures, formula, MW and a chart
await page.evaluate(() => window.__app.ws.newSheet());
await page.waitForTimeout(800);
const rows = [['Entry', 'Product', 'Yield (%)', 'ee (%)'], ['1', 'CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O', '78', '92'], ['2', 'COc1ccc2cc(ccc2c1)[C@H](C)C(=O)O', '85', '96'], ['3', 'C[C@H](C(=O)O)c1ccc(c(F)c1)-c1ccccc1', '64', '88'], ['4', 'C[C@H](C(=O)O)c1cccc(c1)C(=O)c1ccccc1', '71', '90']];
await page.evaluate(async (rows) => {
  const sm = window.__app.sheetMode, v = sm.view;
  for (let r = 1; r < rows.length; r++) { v.select({ r1: r, c1: 1, r2: r, c2: 1 }); await sm.structureFromText(rows[r][1]); }
}, rows);
for (let r = 0; r < rows.length; r++) {
  await page.evaluate(([r]) => window.__app.sheetMode.view.select({ r1: r, c1: 0, r2: r, c2: 0 }), [r]);
  for (let c = 0; c < rows[r].length; c++) {
    if (r > 0 && c === 1) { await page.keyboard.press('Tab'); continue; }
    await page.keyboard.type(rows[r][c]); await page.keyboard.press('Tab');
  }
}
await page.waitForTimeout(500);
await page.evaluate(async () => { const sm = window.__app.sheetMode; sm.view.select({ r1: 1, c1: 1, r2: 1, c2: 1 }); await sm.propertyColumns({ col: 1, props: [{ name: 'FORMULA' }, { name: 'MW' }] }); });
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const sm = window.__app.sheetMode, v = sm.view;
  sm.edit('Sizes', (sh) => { sh.setColWidth(1, 150); sh.setColWidth(4, 110); for (let r = 1; r <= 4; r++) sh.setRowHeight(r, 92); });
  v.select({ r1: 0, c1: 0, r2: 4, c2: 5 });
  sm.run('insert-table');
});
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
await page.evaluate(() => {
  const sm = window.__app.sheetMode;
  sm.view.select({ r1: 0, c1: 2, r2: 4, c2: 3 });
  sm.run('chart-column');
  sm.edit('Chart', (sh) => sh.setCharts(sh.charts.map((c) => ({ ...c, title: 'Yield and ee by entry', palette: 'safe', at: { row: 6, col: 0, dx: 16, dy: 4 }, w: 520, h: 300 }))));
  sm.view.select({ r1: 2, c1: 1, r2: 2, c2: 1 });
});
await page.waitForTimeout(4000);
await snap('5-sheet');

if (problems.length) console.log('page errors:', problems);
await browser.close();
