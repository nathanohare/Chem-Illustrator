// Records the short animations (GIFs) in docs/images/ for the README.
// Start the program first (npm run dev), then: node scripts/animations.mjs [address] [name …]
// Needs Playwright with Chromium (as scripts/screenshots.mjs does) and ffmpeg. Give names
// (smart-arrows, frames, catalytic-cycle, id-labels, spelling, name-to-structure, dark-mode,
// metal-complex, mechanism, navigation, slide-highlights, canvas-slides, reagent-table,
// reaction-animation) to
// record only those.

import { open, pointer, glide, look, addSmiles, record, canvasBox, screenOf, helperSpot, tool, drag, keys, newestAtom, atomAt, wordSpot, select, paletteTool, paletteItem, inputBadge, drawScheme, fitOnSlide } from './shot-lib.mjs';

const args = process.argv.slice(2);
const url = args[0]?.startsWith('http') ? args.shift() : 'http://localhost:5173/';
const want = (name) => !args.length || args.includes(name);

/** Click a menu command: the menu's button, then the command in it, with the mouse going there. */
async function menu(page, button, cmd) {
  const b = await page.locator(`#btn-${button}`).boundingBox();
  await glide(page, b.x + b.width / 2, b.y + b.height / 2, 20);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(350);
  const item = page.locator(`#${button}-menu [data-cmd="${cmd}"]`);
  // a command in a submenu: rest on the submenu's name first, so it opens
  const sub = page.locator(`#${button}-menu .submenu`, { has: item });
  if (await sub.count()) {
    const h = await sub.locator('.has-sub').first().boundingBox();
    await glide(page, h.x + 40, h.y + h.height / 2, 12);
    await page.mouse.click(h.x + 40, h.y + h.height / 2);
    await page.waitForTimeout(350);
  }
  const i = await item.boundingBox();
  if (!i) { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.evaluate((c) => window.__app.command(c), cmd); return; }
  await glide(page, i.x + 40, i.y + i.height / 2, 12);
  await page.waitForTimeout(250);
  await page.mouse.click(i.x + 40, i.y + i.height / 2);
}

/** Click a button in the open window. */
async function press(page, text) {
  const b = await page.locator('dialog[open] button', { hasText: text }).first().boundingBox();
  await glide(page, b.x + b.width / 2, b.y + b.height / 2, 15);
  await page.waitForTimeout(200);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

/** Roomier scheme spacing than the defaults, as Scheme > Scheme Settings would set it. */
const roomy = (page, p = { structGap: 17, lead: 8, headGap: 13 }) => page.evaluate(async (p) => { (await import('/src/chem/scheme-layout.ts')).setSchemePrefs(p); }, p);

// ---------------------------------------------------------------- reagents typed onto an arrow
if (want('smart-arrows')) {
  const { browser, page } = await open(url);
  await roomy(page);
  await addSmiles(page, 'O=Cc1ccc(Br)cc1', 150, 250);
  await addSmiles(page, 'O=Cc1ccc(-c2ccccc2)cc1', 300, 250);
  await page.evaluate(() => window.__app.command('fold-side'));
  await page.waitForTimeout(300);
  await look(page, 3.6, 265, 250);
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.55, c.y + c.height * 0.85);
  const clip = { x: c.x + c.width / 2 - 580, y: c.y + c.height / 2 - 220, width: 1160, height: 440 };
  await record(page, 'smart-arrows', async () => {
    await tool(page, 'arrow');
    await page.waitForTimeout(300);
    const t = await screenOf(page, { x: 182, y: 250 }), h = await screenOf(page, { x: 248, y: 250 });
    await glide(page, t.x, t.y, 25);
    await drag(page, t, h, 25);
    await page.waitForTimeout(500);
    const id = await page.evaluate(() => [...window.__app.doc.arrows.keys()].at(-1));
    // the "+" box above the new arrow: click it and type
    let s = await helperSpot(page, id, 'above');
    await glide(page, s.x, s.y, 15); await page.waitForTimeout(250);
    await page.mouse.click(s.x, s.y); await page.waitForTimeout(250);
    await page.keyboard.type('PhB(OH)2, Pd(PPh3)4', { delay: 70 });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    // and below it: the box shows again when the mouse comes near
    s = await helperSpot(page, id, 'below');
    await glide(page, s.x, s.y, 20); await page.waitForTimeout(600);
    await page.mouse.click(s.x, s.y); await page.waitForTimeout(250);
    await page.keyboard.type('K2CO3, dioxane/H2O, 90 °C', { delay: 70 });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await glide(page, c.x + c.width * 0.55, c.y + c.height * 0.85, 20);
  }, { clip, width: 960, hold: 2500 });
  await browser.close();
}

// ---------------------------------------------------------------- a frame that follows its structure
if (want('frames')) {
  const { browser, page } = await open(url);
  const ids = await addSmiles(page, 'OC(=O)c1ccccc1', 300, 250);
  await select(page, { atoms: ids });
  await page.evaluate(() => { window.__app.command('add-frame'); window.__app.editor.clearSelection(); });
  await look(page, 5.5, 305, 262);
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.8, c.y + c.height * 0.85);
  const clip = { x: c.x + c.width / 2 - 380, y: c.y + c.height / 2 - 330, width: 760, height: 660 };
  await record(page, 'frames', async () => {
    // point at the ring's far carbon and press 1 for a bond, twice, then o for an O
    const para = await atomAt(page, ids[6]);
    await glide(page, para.x, para.y, 25);
    await page.waitForTimeout(400);
    await keys(page, ['1'], 700);
    let n = await newestAtom(page); await glide(page, n.x, n.y, 12); await page.waitForTimeout(200);
    await keys(page, ['1'], 700);
    n = await newestAtom(page); await glide(page, n.x, n.y, 12); await page.waitForTimeout(200);
    await keys(page, ['o'], 900);
    // move the structure: the frame comes along
    await tool(page, 'select');
    await page.waitForTimeout(400);
    const ring = await atomAt(page, ids[4]);
    await page.mouse.move(ring.x, ring.y, { steps: 25 });
    await page.mouse.dblclick(ring.x, ring.y);
    await page.waitForTimeout(400);
    await drag(page, ring, { x: ring.x + 110, y: ring.y + 30 }, 30);
    await page.waitForTimeout(300);
    await glide(page, c.x + c.width / 2 - 330, c.y + c.height / 2 + 270, 15);
    await page.mouse.click(c.x + c.width / 2 - 330, c.y + c.height / 2 + 270);
  }, { clip, width: 640, hold: 2200 });
  await browser.close();
}

// ---------------------------------------------------------------- a scheme turned into a catalytic cycle
if (want('catalytic-cycle')) {
  const { browser, page } = await open(url, { width: 1180, height: 760 });
  await roomy(page, { structGap: 14, lead: 8, headGap: 12 });
  const sm = ['[Pd]', 'Br[Pd]c1ccccc1', 'O[Pd]c1ccccc1', 'COc1ccc(cc1)[Pd]c1ccccc1'];
  const xs = [100, 230, 380, 560];
  for (let i = 0; i < sm.length; i++) await addSmiles(page, sm[i], xs[i], 250);
  await page.evaluate(() => {
    const a = window.__app, doc = a.doc, e = a.editor;
    doc.edit('Ligands', () => { for (const t of doc.atoms.values()) if (t.z === 46) doc.updateAtom(t.id, { label: 'PdL2' }); });
    const ar = (x1, x2) => doc.addArrow({ tail: { x: x1, y: 250 }, head: { x: x2, y: 250 }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 10, headWidth: 3 });
    doc.edit('Arrows', () => { ar(130, 180); ar(280, 330); ar(430, 490); });
    doc.edit('Title', () => doc.addCaption({ x: 330, y: 330, runs: [{ text: 'Suzuki–Miyaura\ncatalytic cycle', bold: true }], justify: 'center' }));
    a.command('clean-up-reaction');
    const ids = [...doc.arrows.keys()];
    e.setArrowSideText(ids[0], 'above', 'PhBr'); e.setArrowSideText(ids[0], 'below', 'oxidative\naddition');
    e.setArrowSideText(ids[1], 'above', 'NaOH'); e.setArrowSideText(ids[1], 'below', 'ligand\nexchange');
    e.setArrowSideText(ids[2], 'above', 'ArB(OH)2'); e.setArrowSideText(ids[2], 'below', 'trans-\nmetalation');
    a.command('clean-up-reaction');
    e.clearSelection();
  });
  await page.evaluate(() => window.__app.command('fold-side'));
  await page.waitForTimeout(300);
  // room for the cycle, which is taller than the row it starts as
  await look(page, 1.6, 335, 300);
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.9);
  await record(page, 'catalytic-cycle', async () => {
    await menu(page, 'chemistry', 'arrange-scheme');
    await page.waitForTimeout(500);
    // the window to one side, so the scheme shows as each layout is tried
    await page.evaluate(() => { const d = document.querySelector('dialog.arrange-dialog'); d.style.margin = '0'; d.style.left = 'auto'; d.style.right = '12px'; d.style.top = '70px'; });
    await page.waitForTimeout(300);
    const tile = async (name) => {
      const b = await page.locator('dialog[open] .arrange-tile', { hasText: name }).boundingBox();
      await glide(page, b.x + b.width / 2, b.y + b.height / 2, 15); await page.waitForTimeout(200);
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
      await page.waitForTimeout(1300);
    };
    await tile('Catalytic cycle');
    await press(page, 'Done');
    await page.waitForTimeout(400);
    await glide(page, c.x + c.width * 0.5, c.y + c.height * 0.95, 15);
    await page.evaluate(() => window.__app.editor.clearSelection());
  }, { width: 1000, hold: 3000 });
  await browser.close();
}

// ---------------------------------------------------------------- compound numbers that stay with their structures
if (want('id-labels')) {
  const { browser, page } = await open(url);
  await roomy(page);
  const a1 = await addSmiles(page, 'O=Cc1ccc(Br)cc1', 140, 250);
  const a2 = await addSmiles(page, 'O=Cc1ccc(-c2ccccc2)cc1', 330, 250);
  const a3 = await addSmiles(page, 'OB(O)c1ccccc1', 230, 330);
  await page.evaluate(() => {
    const a = window.__app;
    a.editor.numberCompounds({ start: 1, style: 'numbers', prefix: '', suffix: '', bold: true });
    a.editor.clearSelection();
  });
  await page.evaluate(() => window.__app.command('fold-side'));
  await page.waitForTimeout(300);
  await look(page, 3.0, 232, 280);
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.92);
  const clip = { x: c.x + c.width / 2 - 460, y: c.y + c.height / 2 - 320, width: 920, height: 640 };
  await record(page, 'id-labels', async () => {
    await tool(page, 'select');
    await page.waitForTimeout(300);
    // drag the boronic acid up between the others: its number comes along
    const b = await atomAt(page, a3[3]);
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.mouse.dblclick(b.x, b.y);
    await page.waitForTimeout(300);
    await drag(page, b, { x: b.x + 10, y: b.y - 230 }, 30);
    await page.waitForTimeout(600);
    // grow the product with a hotkey: its number moves out of the way
    await tool(page, 'bond-single');
    const low = await page.evaluate((ids) => {
      // the lowest ring CH of the product: a bond grown there points down, at the number
      const doc = window.__app.doc, deg = (id) => [...doc.bonds.values()].filter((b) => b.a1 === id || b.a2 === id).length;
      return ids.filter((id) => deg(id) === 2 && doc.atoms.get(id).z === 6).sort((p, q) => doc.atoms.get(q).y - doc.atoms.get(p).y)[0];
    }, a2);
    const p = await atomAt(page, low);
    await glide(page, p.x, p.y, 20);
    await page.waitForTimeout(300);
    await keys(page, ['1'], 700);
    const n = await newestAtom(page); await glide(page, n.x, n.y, 12); await page.waitForTimeout(200);
    await keys(page, ['o'], 1000);
    // flip the starting material over: the number stays underneath
    await tool(page, 'select');
    const s = await atomAt(page, a1[4]);
    await glide(page, s.x, s.y, 20);
    await page.mouse.dblclick(s.x, s.y);
    await page.waitForTimeout(400);
    await page.evaluate(() => window.__app.command('flip-v'));
    await page.waitForTimeout(800);
    await page.evaluate(() => window.__app.command('rotate-cw'));
    await page.waitForTimeout(800);
    await glide(page, c.x + 60, c.y + c.height - 60, 15);
    await page.mouse.click(c.x + 60, c.y + c.height - 60);
  }, { clip, width: 860, hold: 2200 });
  await browser.close();
}

// ---------------------------------------------------------------- spelling and chemistry checks
if (want('spelling')) {
  const { browser, page } = await open(url);
  const id = await page.evaluate(() => {
    const a = window.__app, doc = a.doc; let id;
    doc.edit('Text', () => { id = doc.addCaption({ x: 200, y: 200, runs: [{ text: 'The crude solid was recrystalized from\nCH2Cl2/hexanes (5mL) at 10-15 °C;\n1H NMR in CDCl3 matched the litterature.' }], justify: 'left' }).id; });
    a.editor.changed(); return id;
  });
  await page.evaluate(() => window.__app.command('fold-side'));
  await look(page, 3.2, 248, 205);
  await pointer(page);
  const c = await canvasBox(page);
  await tool(page, 'text', false);
  await page.waitForTimeout(500);
  await page.mouse.move(c.x + c.width * 0.7, c.y + c.height * 0.8);
  const clip = { x: c.x + c.width / 2 - 450, y: c.y + c.height / 2 - 190, width: 900, height: 380 };
  // right-click a marked word and pick the first fix or suggestion
  const fix = async (line, before, word) => {
    const s = await wordSpot(page, id, line, before, word);
    await glide(page, s.x, s.y, 18); await page.waitForTimeout(250);
    await page.mouse.click(s.x, s.y, { button: 'right' }); await page.waitForTimeout(900);
    const b = await page.locator('.text-menu button').first().boundingBox();
    const x = b.x + Math.min(60, b.width / 2), y = b.y + b.height / 2;
    await glide(page, x, y, 12); await page.waitForTimeout(400);
    await page.mouse.click(x, y); await page.waitForTimeout(700);
  };
  await record(page, 'spelling', async () => {
    const s = await wordSpot(page, id, 0, 'The crude ', 'solid');
    await glide(page, s.x, s.y, 20);
    await page.mouse.click(s.x, s.y); await page.waitForTimeout(1500);
    await fix(1, '', 'CH2Cl2');
    await fix(1, 'CH₂Cl₂/hexanes (', '5mL');
    await fix(1, 'CH₂Cl₂/hexanes (5 mL) at ', '10-15');
    await fix(0, 'The crude solid was ', 'recrystalized');
    await fix(2, '1H NMR in CDCl3 matched the ', 'litterature');
    await fix(2, '', '1H');
    await fix(2, '1H NMR in ', 'CDCl3');
    await page.keyboard.press('Escape');
    await glide(page, c.x + c.width * 0.7, c.y + c.height * 0.8, 15);
  }, { clip, width: 900, hold: 2500 });
  await browser.close();
}

// ---------------------------------------------------------------- Name to Structure
if (want('name-to-structure')) {
  const { browser, page } = await open(url, { width: 1180, height: 760 });
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.7);
  await record(page, 'name-to-structure', async () => {
    await menu(page, 'insert', 'name-to-structure');
    await page.waitForTimeout(500);
    await page.keyboard.type('(2S)-2-[4-(2-methylpropyl)phenyl]propanoic acid', { delay: 45 });
    await page.waitForTimeout(400);
    await press(page, 'Insert');
    await page.waitForFunction(() => window.__app.doc.atoms.size > 0, null, { timeout: 60000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => { const a = window.__app; a.editor.fit(); });
    await page.waitForTimeout(400);
    // select it: the side panel works out its formula, masses and stereo
    await tool(page, 'select');
    const ids = await page.evaluate(() => [...window.__app.doc.atoms.keys()]);
    const p = await atomAt(page, ids[4]);
    await glide(page, p.x, p.y, 20);
    await page.mouse.dblclick(p.x, p.y);
    await page.waitForTimeout(1200);
  }, { width: 1000, hold: 2500 });
  await browser.close();
}

// ---------------------------------------------------------------- the dark page and its colours
if (want('dark-mode')) {
  const { browser, page } = await open(url, { width: 1180, height: 760 });
  await drawScheme(page);
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.8);
  await record(page, 'dark-mode', async () => {
    const b = await page.locator('.quick-bar [data-qa="dark-page"]').boundingBox();
    await glide(page, b.x + b.width / 2, b.y + b.height / 2, 25); await page.waitForTimeout(300);
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(1200);
    for (const name of ['Slate', 'Warm dark']) {
      await menu(page, 'view', 'dark-colours');
      await page.waitForTimeout(500);
      const s = await page.locator('dialog[open] select').first().boundingBox();
      await glide(page, s.x + s.width / 2, s.y + s.height / 2, 12);
      await page.locator('dialog[open] select').first().selectOption(name);
      await page.waitForTimeout(500);
      await press(page, 'Use');
      await page.waitForTimeout(1300);
    }
    await glide(page, c.x + c.width * 0.5, c.y + c.height * 0.8, 15);
  }, { width: 1000, hold: 2000 });
  await browser.close();
}

// ---------------------------------------------------------------- a metal complex from a template
if (want('metal-complex')) {
  const { browser, page } = await open(url, { width: 1180, height: 900 });
  await look(page, 5, 180, 128);
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.85);
  await record(page, 'metal-complex', async () => {
    // (η⁶-arene)ML₃ from the Metallocenes palette, placed with a click
    await paletteTool(page, 'tpl-ferrocene', '(η⁶-Arene)ML₃');
    const at = await screenOf(page, { x: 180, y: 133 });
    await glide(page, at.x, at.y, 25); await page.waitForTimeout(300);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(700);
    // M becomes Cr and each L a CO, typed with the text tool
    await tool(page, 'text');
    await page.waitForTimeout(300);
    const atoms = await page.evaluate(() => [...window.__app.doc.atoms.values()].filter((a) => a.label === 'M' || a.label === 'L').map((a) => ({ id: a.id, label: a.label })));
    for (const a of atoms) {
      const o = await atomAt(page, a.id);
      await glide(page, o.x, o.y, 12); await page.waitForTimeout(150);
      await page.mouse.click(o.x, o.y); await page.waitForTimeout(200);
      await page.keyboard.press('Control+a');
      await page.keyboard.type(a.label === 'M' ? 'Cr' : 'CO', { delay: 90 });
      await page.keyboard.press('Enter'); await page.waitForTimeout(350);
    }
    // the benzene ring moved on its own: the η⁶ bond keeps to its middle
    await tool(page, 'select');
    await page.waitForTimeout(300);
    const members = await page.evaluate(() => [...window.__app.doc.atoms.values()].find((a) => a.multi)?.multi ?? []);
    const pts = await Promise.all(members.map((id) => atomAt(page, id)));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    await drag(page, { x: Math.min(...xs) - 30, y: Math.min(...ys) - 30 }, { x: Math.max(...xs) + 30, y: Math.max(...ys) + 8 }, 20);
    await page.waitForTimeout(400);
    const top = pts.reduce((p, q) => (q.y < p.y ? q : p));
    const ring = { x: top.x, y: top.y };
    await drag(page, ring, { x: ring.x + 70, y: ring.y - 25 }, 30);
    await page.waitForTimeout(700);
    await drag(page, { x: ring.x + 70, y: ring.y - 25 }, ring, 30);
    await page.waitForTimeout(300);
    await glide(page, c.x + c.width * 0.4, c.y + c.height * 0.9, 15);
    await page.mouse.click(c.x + c.width * 0.4, c.y + c.height * 0.9);
  }, { clip: { x: 0, y: 0, width: 1180, height: 820 }, width: 1000, hold: 2500 });
  await browser.close();
}

// ---------------------------------------------------------------- a Diels–Alder arrow-push: curved arrows that snap to bonds and to where new bonds form, and follow the structure
if (want('mechanism')) {
  const { browser, page } = await open(url, { width: 1180, height: 900 });
  // s-cis butadiene (atoms 0–3) and acrolein (4–7), placed by hand (bond length 1.5, y up as molfiles have it)
  const c30 = Math.cos(Math.PI / 6), d = 0.35;
  const v = [0, 1, 2, 3, 4, 5].map((k) => { const t = (-90 - 60 * k) * Math.PI / 180; return [Math.cos(t), Math.sin(t)]; });
  const atoms = [['C', ...v[0]], ['C', ...v[1]], ['C', ...v[2]], ['C', ...v[3]], ['C', v[4][0] + d, v[4][1]], ['C', v[5][0] + d, v[5][1]], ['C', v[4][0] + d + c30, v[4][1] + 0.5], ['O', v[4][0] + d + 2 * c30, v[4][1]]];
  const bonds = [[0, 1, 2], [1, 2, 1], [2, 3, 2], [4, 5, 2], [4, 6, 1], [6, 7, 2]];
  const n = (x, w) => String(x).padStart(w), f = (x) => x.toFixed(4).padStart(10);
  const mol = ['', '  chem-illustrator', '', `${n(atoms.length, 3)}${n(bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atoms.map(([el, x, y]) => `${f(x * 1.5)}${f(-y * 1.5)}${f(0)} ${el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`),
    ...bonds.map(([i, j, o]) => `${n(i + 1, 3)}${n(j + 1, 3)}${n(o, 3)}  0`), 'M  END'].join('\n');
  const ids = await page.evaluate((mol) => { const a = window.__app; let ids; a.doc.edit('Structures', () => { ids = a.addMolfile(a.doc, mol, 200, 150); }); a.editor.changed?.(); return ids; }, mol);
  await page.evaluate(() => window.__app.command('fold-side'));
  await page.waitForTimeout(300);
  // zoom in and centre the two structures in the canvas
  await page.evaluate(() => {
    const a = window.__app, r = a.renderer, b = a.doc.bounds(), box = document.querySelector('#overlay').getBoundingClientRect();
    const mid = { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
    r.view.scale = 8;
    const p = r.toScreen(mid);
    r.view.ox += 1; r.view.oy += 1;
    const q = r.toScreen(mid);
    r.view.ox += (box.width * 0.42 - p.x) / (q.x - p.x) - 1;
    r.view.oy += (box.height * 0.45 - p.y) / (q.y - p.y) - 1;
    a.editor.requestScene();
  });
  await pointer(page);
  const c = await canvasBox(page);
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height * 0.88);
  const mid = async (i, j) => { const p = await atomAt(page, ids[i]), q = await atomAt(page, ids[j]); return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; };
  await record(page, 'mechanism', async () => {
    await page.waitForTimeout(500);
    // curved arrows: each C=C to where a new bond forms, and the last into the middle bond (the new C=C)
    await paletteItem(page, 'arrow', 7);
    await page.waitForTimeout(300);
    for (const [from, to] of [[await mid(2, 3), await mid(3, 4)], [await mid(4, 5), await mid(5, 0)], [await mid(0, 1), await mid(1, 2)]]) {
      await glide(page, from.x, from.y, 14); await page.waitForTimeout(200);
      await drag(page, from, to, 28);
      await page.waitForTimeout(600);
    }
    // the dienophile moved away and back: the arrows stay on their bonds and gaps
    await tool(page, 'select');
    await page.waitForTimeout(300);
    const pts = await Promise.all(ids.slice(4).map((id) => atomAt(page, id)));
    const left = ((await atomAt(page, ids[3])).x + pts[0].x) / 2;
    const ys = pts.map((p) => p.y), xs = pts.map((p) => p.x);
    await drag(page, { x: left, y: Math.min(...ys) - 60 }, { x: Math.max(...xs) + 50, y: Math.max(...ys) + 60 }, 20);
    await page.waitForTimeout(400);
    const grab = pts[2];
    await drag(page, grab, { x: grab.x + 150, y: grab.y + 90 }, 35);
    await page.waitForTimeout(900);
    await drag(page, { x: grab.x + 150, y: grab.y + 90 }, grab, 35);
    await page.waitForTimeout(400);
    await glide(page, c.x + c.width * 0.5, c.y + c.height * 0.9, 15);
    await page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.9);
  }, { clip: { x: 0, y: 0, width: 1180, height: 900 }, width: 900, hold: 2500 });
  await browser.close();
}

// ---------------------------------------------------------------- getting round a big drawing: right/middle-drag pans, Ctrl+wheel zooms at the pointer, Shift+wheel scrolls sideways
if (want('navigation')) {
  const { readFileSync } = await import('node:fs');
  const { browser, page } = await open(url, { width: 1180, height: 820, navigator: true });
  const text = readFileSync(new URL('../tests/morph/siccanin sequence.cdxml', import.meta.url), 'utf8');
  await page.evaluate((t) => window.__app.openText(t, 'siccanin sequence.cdxml'), text);
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__app.command('fold-side'); window.__app.renderer.showWarnings = false; });
  await page.waitForTimeout(300);
  const c = await canvasBox(page);
  // start zoomed in on the left end of the route
  const at = (fx, fy) => ({ x: c.x + c.width * fx, y: c.y + c.height * fy });
  await page.mouse.move(at(0.2, 0.45).x, at(0.2, 0.45).y);
  await page.keyboard.down('Control');
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
  await page.keyboard.up('Control');
  await pointer(page);
  await page.mouse.move(at(0.5, 0.5).x, at(0.5, 0.5).y);
  // let the "Opened …" note fade first
  await page.waitForTimeout(5000);
  const pan = async (button, from, to) => {
    await glide(page, from.x, from.y, 12);
    await page.mouse.down({ button });
    await page.mouse.move(to.x, to.y, { steps: 45 });
    await page.mouse.up({ button });
  };
  const wheel = async (key, dx, dy, n) => {
    await page.keyboard.down(key);
    for (let i = 0; i < n; i++) { await page.mouse.wheel(dx, dy); await page.waitForTimeout(110); }
    await page.keyboard.up(key);
  };
  await record(page, 'navigation', async () => {
    await inputBadge(page, { button: 'right', text: 'pan' });
    await page.waitForTimeout(600);
    await pan('right', at(0.75, 0.5), at(0.3, 0.42));
    await page.waitForTimeout(700);
    await inputBadge(page, { button: 'middle', text: 'pan' });
    await page.waitForTimeout(600);
    await pan('middle', at(0.7, 0.35), at(0.35, 0.6));
    await page.waitForTimeout(700);
    await inputBadge(page, { keys: ['Ctrl'], button: 'wheel', text: 'zoom in and out where the pointer is' });
    await glide(page, at(0.62, 0.5).x, at(0.62, 0.5).y, 15);
    await page.waitForTimeout(400);
    await wheel('Control', 0, 120, 5);
    await page.waitForTimeout(500);
    await glide(page, at(0.3, 0.45).x, at(0.3, 0.45).y, 15);
    await wheel('Control', 0, -120, 5);
    await page.waitForTimeout(700);
    await inputBadge(page, { keys: ['Shift'], button: 'wheel', text: 'scroll sideways' });
    await page.waitForTimeout(500);
    await wheel('Shift', 0, 120, 8);
    await page.waitForTimeout(400);
    await wheel('Shift', 0, -120, 8);
    await page.waitForTimeout(600);
    await inputBadge(page, null);
  }, { clip: { x: 0, y: 0, width: 1180, height: 820 }, width: 820, hold: 1500 });
  await browser.close();
}

// ---------------------------------------------------------------- Slides: highlights that come in one click at a time
if (want('slide-highlights')) {
  const { browser, page } = await open(url, { width: 1280, height: 720 });
  await page.evaluate(async () => {
    const a = window.__app; a.ws.newSlides();
    const t = await import('/src/deck/templates.ts');
    const d = a.ws.active.deck; d.setMaster(t.applyTemplate(d.master, t.SLIDE_TEMPLATES.find((x) => x.id === 'harbor')));
    a.command('new-slide');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const a = window.__app, doc = a.doc;
    const ph = [...doc.captions.values()].filter((c) => c.ph);
    doc.edit('Text', () => { doc.updateCaption(ph[0].id, { runs: [{ text: 'What each step changes' }] }); for (const c of ph.slice(1)) doc.removeCaption(c.id); });
  });
  await page.waitForTimeout(400);
  await drawScheme(page, { xs: [150, 420, 740], y: 330, fit: false });
  await fitOnSlide(page, { width: 0.9, cy: 0.6 });
  await page.evaluate(async () => {
    const a = window.__app, doc = a.doc, e = a.editor;
    const ids = [...doc.atoms.keys()];
    // the C–Br of 1, the new phenyl of 2 and the new C=C of 3 (atoms in SMILES order)
    const groups = [[[ids[5], ids[6]], '#ffd966'], [[...ids.slice(9 + 5, 9 + 12)], '#9dc3e6'], [[ids[23 + 5], ids[23 + 6]], '#a9d18e']];
    for (const [atoms, colour] of groups) {
      const set = new Set(atoms);
      const bonds = new Set([...doc.bonds.values()].filter((b) => set.has(b.a1) && set.has(b.a2)).map((b) => b.id));
      e.selectThese({ atoms: set, bonds, captions: new Set(), arrows: new Set(), shapes: new Set() });
      e.colourSelection(colour, 'highlight');
    }
    e.clearSelection();
    const an = await import('/src/deck/animation.ts');
    const d = a.ws.active.deck;
    d.setAnims(groups.map(([atoms]) => ({ ...an.newAnim({ kind: 'highlight', id: atoms[0] }, 'fade'), dur: 0.7 })));
    a.command('slide-animations');
    a.command('animation-pane');
  });
  await page.waitForTimeout(800);
  await pointer(page);
  const W = 1280, H = 720;
  await page.mouse.move(W * 0.8, H * 0.85);
  await record(page, 'slide-highlights', async () => {
    await page.waitForTimeout(1800);
    await inputBadge(page, { keys: ['F5'], text: 'start the slide show' });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__app.command('present-current'));
    await page.waitForTimeout(1500);
    for (const what of ['the bromide that couples', 'the new phenyl ring', 'the new C=C bond']) {
      await inputBadge(page, { button: 'left', label: 'Click', text: what });
      await page.waitForTimeout(500);
      await page.mouse.click(W * 0.8, H * 0.85);
      await page.waitForTimeout(1700);
    }
    await inputBadge(page, null);
  }, { clip: { x: 0, y: 0, width: W, height: H }, width: 820, hold: 2000 });
  await browser.close();
}

// ---------------------------------------------------------------- Slides: a canvas slide, a route drawn once and shown a step at a time
if (want('canvas-slides')) {
  const { browser, page } = await open(url, { width: 1280, height: 720 });
  await page.evaluate(async () => {
    const a = window.__app; a.ws.newSlides();
    const t = await import('/src/deck/templates.ts');
    const d = a.ws.active.deck; d.setMaster(t.applyTemplate(d.master, t.SLIDE_TEMPLATES.find((x) => x.id === 'harbor')));
    d.addCanvasSlide();
  });
  await page.waitForTimeout(800);
  // a three-step route across the canvas, a slide width and a half apart
  await page.evaluate(async () => {
    const a = window.__app, doc = a.doc, y = 290;
    (await import('/src/chem/scheme-layout.ts')).setSchemePrefs({ structGap: 17, lead: 8, headGap: 13 });
    const xs = [170, 650, 1130, 1610];
    const smiles = ['O=Cc1ccc(Br)cc1', 'O=Cc1ccc(-c2ccccc2)cc1', 'CCOC(=O)/C=C/c1ccc(-c2ccccc2)cc1', 'OC/C=C/c1ccc(-c2ccccc2)cc1'];
    const mols = await Promise.all(smiles.map((s) => a.chem.smilesToMol(s)));
    const ids = [];
    doc.edit('Scheme', () => {
      mols.forEach((m, i) => a.addMolfile(doc, m, xs[i], y));
      for (const i of [0, 1, 2]) {
        const x1 = xs[i] + (xs[i + 1] - xs[i]) * 0.3, x2 = xs[i] + (xs[i + 1] - xs[i]) * 0.6;
        ids.push(doc.addArrow({ tail: { x: x1, y }, head: { x: x2, y }, headStyle: 'full', tailStyle: 'none', headType: 'solid', line: 'solid', noGo: false, equilibrium: false, sweep: 0, headLength: 10, headWidth: 3 }).id);
      }
    });
    a.command('clean-up-reaction');
    const e = a.editor;
    e.setArrowSideText(ids[0], 'above', 'PhB(OH)2, Pd(PPh3)4');
    e.setArrowSideText(ids[0], 'below', 'K2CO3, dioxane/H2O\n90 °C, 92%');
    e.setArrowSideText(ids[1], 'above', '(EtO)2P(O)CH2CO2Et');
    e.setArrowSideText(ids[1], 'below', 'NaH, THF, 0 °C\n88%, E/Z > 20:1');
    e.setArrowSideText(ids[2], 'above', 'DIBAL-H');
    e.setArrowSideText(ids[2], 'below', 'CH2Cl2, −78 °C\n95%');
    a.command('clean-up-reaction');
    e.numberCompounds({ start: 1, style: 'numbers', prefix: '', suffix: '', bold: true });
    e.clearSelection();
    // a keyframe on each step, then the whole route; a soft gradient along it and a mini-map
    const b = doc.bounds(), d = a.ws.active.deck, W = d.size.w, H = d.size.h, cy = (b.y1 + b.y2) / 2;
    const step = (b.x2 - b.x1 - W * 0.9) / 2;
    const titles = ['Suzuki coupling', 'Olefination', 'Reduction'];
    const keys = titles.map((title, i) => ({ id: i + 1, x: b.x1 - W * 0.05 + step * i, y: cy - H / 2 + 20, zoom: 1, title }));
    const zoom = (b.x2 - b.x1) / W * 1.12;
    keys.push({ id: 4, x: (b.x1 + b.x2) / 2 - W * zoom / 2, y: cy - H * zoom / 2 + 20 * zoom, zoom, title: 'The route' });
    d.setCanvas({ keys, look: { route: ['#e8f1fa', '#eaf6ee', '#fbf1e4'] }, show: { minimap: 'show' } });
  });
  await page.waitForTimeout(800);
  await pointer(page);
  const W = 1280, H = 720;
  await page.mouse.move(W * 0.8, H * 0.85);
  await record(page, 'canvas-slides', async () => {
    await page.waitForTimeout(1500);
    await inputBadge(page, { keys: ['F5'], text: 'start the slide show' });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__app.command('present-current'));
    await page.waitForTimeout(1800);
    for (const what of ['glide to the next step', 'glide to the next step', 'fly out to the whole route']) {
      await inputBadge(page, { keys: ['→'], text: what });
      await page.waitForTimeout(500);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(2600);
    }
    await inputBadge(page, null);
  }, { clip: { x: 0, y: 0, width: W, height: H }, width: 820, hold: 2000 });
  await browser.close();
}

// ---------------------------------------------------------------- Sheet: a reagent table that works itself out
if (want('reagent-table')) {
  const { browser, page } = await open(url, { width: 1280, height: 640 });
  await page.evaluate(() => { const a = window.__app; a.ws.newSheet(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const a = window.__app; a.command('reagent-table'); a.command('fold-side'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('#flash')?.classList.remove('show'));
  const k = page.keyboard;
  const go = async (r, c) => { await k.press('Control+Home'); for (let i = 0; i < r; i++) await k.press('ArrowDown'); for (let i = 0; i < c; i++) await k.press('ArrowRight'); };
  const put = async (r, c, text, wait = 350) => { await go(r, c); await k.type(text, { delay: 45 }); await k.press('Enter'); await page.waitForTimeout(wait); };
  // warm the name reader up on a first table, so the recorded one doesn't wait for it
  await put(1, 1, 'benzaldehyde', 3000);
  await page.evaluate(() => window.__app.command('reagent-table'));
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('#flash')?.classList.remove('show'));
  await go(1, 0);
  await record(page, 'reagent-table', async () => {
    await page.waitForTimeout(600);
    await put(1, 0, 'benzaldehyde');
    await put(1, 1, 'benzaldehyde', 1200);
    await put(1, 4, '5');
    await put(1, 6, '1.044', 800);
    await put(2, 0, 'phosphonoacetate');
    await put(2, 1, 'CCOC(=O)CP(=O)(OCC)OCC', 1200);
    await put(2, 3, '1.2');
    await put(2, 6, '1.13', 800);
    await put(3, 0, 'sodium hydride');
    await put(3, 1, 'sodium hydride', 1200);
    await put(3, 3, '1.3', 600);
    await go(5, 0);
  }, { clip: { x: 255, y: 180, width: 1000, height: 270 }, width: 900, hold: 2500 });
  await browser.close();
}

// ---------------------------------------------------------------- Scheme > Animate Reaction, saved by the app itself
if (want('reaction-animation')) {
  const { readFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { out } = await import('./shot-lib.mjs');
  const { browser, page } = await open(url);
  // no system save window here: the app downloads the file instead
  await page.evaluate(() => { window.showSaveFilePicker = undefined; });
  // a test file from cdxmorph's author: a decalone turned in 3-D into its chair, then the ketone taken on to the amine
  const text = readFileSync(new URL('../tests/morph/turns/decalone addition.cdxml', import.meta.url), 'utf8');
  await page.evaluate((t) => window.__app.openText(t, 'decalone addition.cdxml'), text);
  await page.evaluate(() => window.__app.command('animate-reaction'));
  await page.waitForTimeout(3000);
  await page.locator('dialog[open] label', { hasText: 'Play back to the start' }).click();
  await page.waitForTimeout(1500);
  const got = page.waitForEvent('download', { timeout: 120000 });
  await page.locator('dialog[open] button', { hasText: 'Save GIF' }).click();
  const dir = mkdtempSync(join(tmpdir(), 'ci-gif-'));
  const raw = join(dir, 'raw.gif');
  await (await got).saveAs(raw);
  // smaller for the README: 15 frames a second, 600 pixels wide, few colours (it is black line art)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-vf', 'fps=15,scale=600:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=24:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle', '-loop', '0', `${out}reaction-animation.gif`]);
  rmSync(dir, { recursive: true, force: true });
  console.log('docs/images/reaction-animation.gif');
  await browser.close();
}
