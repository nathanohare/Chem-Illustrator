// Insert ▸ Lab Figures ▸ Crystal Structure (CIF)… and its Edit window: a CIF file's structure drawn
// as ORTEP thermal ellipsoids or ball-and-stick, turned with the mouse, with the crystal data
// table. The viewer of Chem SI Assistant (si_assistant/ui/xray_viewer.py, same author), rebuilt for
// the web: drag to turn, Shift+drag to turn in the page, the wheel to magnify, drag a label to move
// it. Place on Page draws it as ovals, lines and text in a frame; double-click it to come back here.

import { readCif, type CifBlock } from '../chem/cif';
import { CrystalError, crystalTable, grow, marksHtml, marksPlain, structureFromCif, type M3 } from '../chem/crystal';
import { axisRotation, bestRotation, crystalShapes, defaultView, fittingZoom, paintShapes, shapesBounds, specAtoms, turnView, type CrystalSpec, type XShape, type XView } from '../design/xray';
import { newPlate, type PlateData } from '../design/plates';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), props);

/** How the last structure was drawn (its style, not its turn), so the next starts the same way. */
let lastLook: Partial<XView> = {};

export interface CrystalOptions {
  /** Ask for a CIF file: its name and text, or null when cancelled. */
  pickFile(): Promise<{ name: string; text: string } | null>;
  /** Put text on the clipboard (the crystal data table): plain text and HTML. */
  copy(text: string, html: string): Promise<void>;
  /** A file to open straight away (a CIF dropped or opened with File ▸ Open). */
  file?: { name: string; text: string };
}

/** The figure for one data block of a CIF file, seen from its best direction. */
export function crystalFromBlock(block: CifBlock): CrystalSpec {
  const s = structureFromCif(block);
  const g = grow(s);
  const atoms = specAtoms(g.atoms);
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  const view: XView = { ...defaultView(), ...lastLook, labelOffsets: {}, hiddenMolecules: [], hiddenParts: [] };
  view.rotation = bestRotation(atoms.filter((a) => a.el !== 'H' && a.el !== 'D').map((a) => a.xyz));
  return {
    name: block.name, atoms, bonds: g.bonds, view,
    table: crystalTable(block).map(([, label, value]) => [label, value]),
    axes: s.orth.map((row) => row.map(r)) as M3,
    ...(g.complete ? {} : { partial: true }),
  };
}

/** A new figure's size: about 20 bond lengths across, as tall as the structure needs. */
function sizeFor(c: CrystalSpec, L: number): { w: number; h: number } {
  const b = shapesBounds(crystalShapes(c, { ...c.view, zoom: 1, labels: false }));
  const w = Math.round(20 * L);
  const h = Math.round(Math.max(6 * L, Math.min(24 * L, (w * (b[3] - b[1])) / Math.max(1, b[2] - b[0]) + 2 * c.view.labelSize)));
  return { w, h };
}

export function askCrystal(editing: PlateData | null, L: number, opts: CrystalOptions): Promise<PlateData | null> {
  return new Promise((resolve) => {
    let spec: CrystalSpec | null = editing?.crystal ? structuredClone(editing.crystal) : null;
    let size = editing ? { w: editing.w, h: editing.h } : { w: 20 * L, h: 14 * L };
    let blocks: CifBlock[] = [];
    let mag = 1;
    const d = el('dialog', { className: 'ask crystal-dialog' });
    d.setAttribute('aria-label', 'Crystal structure');
    const form = el('form', { method: 'dialog' });
    form.innerHTML = `<h2>${editing ? 'Edit Crystal Structure' : 'Crystal Structure'}</h2>
      <p class="crystal-file"><button type="button" data-act="open">Open CIF…</button> <span class="crystal-name muted">No file open.</span> <select name="block" aria-label="Data block" hidden></select></p>
      <div class="crystal-tabs" role="tablist"><button type="button" role="tab" data-tab="0" aria-selected="true">Structure</button><button type="button" role="tab" data-tab="1" aria-selected="false">Crystal data</button></div>
      <div class="crystal-page" role="tabpanel">
        <div class="crystal-main">
          <canvas class="crystal-canvas" tabindex="0" role="img" aria-label="The structure. Drag to turn it, Shift+drag to turn it in the page, the wheel to magnify, drag a label to move it."></canvas>
          <p class="muted small crystal-status" role="status"></p>
        </div>
        <div class="crystal-side">
          <fieldset><legend>Drawing</legend>
            <label class="ask-check"><input type="radio" name="style" value="ortep" /> <span>Thermal ellipsoids (ORTEP)</span></label>
            <label class="ask-check"><input type="radio" name="style" value="ball" /> <span>Ball-and-stick</span></label>
            <label class="crystal-row"><span>Ellipsoids at</span> <select name="probability"><option value="30">30%</option><option value="50">50%</option><option value="70">70%</option><option value="90">90%</option></select></label>
            <label class="ask-check"><input type="checkbox" name="hydrogens" /> <span>Hydrogen atoms</span></label>
            <label class="ask-check"><input type="checkbox" name="colour" /> <span>Color (else black and white)</span></label>
            <label class="ask-check"><input type="checkbox" name="principal" /> <span>Principal ellipses</span></label>
            <label class="ask-check"><input type="checkbox" name="labels" /> <span>Atom labels</span></label>
            <label class="crystal-row"><span>Label size</span> <input name="labelSize" type="number" min="4" max="30" step="0.5" /> pt</label>
            <label class="crystal-row"><span>Size</span> <input name="w" type="number" min="40" step="any" aria-label="Width" /> × <input name="h" type="number" min="40" step="any" aria-label="Height" /> pt</label>
          </fieldset>
          <fieldset><legend>View</legend>
            <p class="crystal-views"><button type="button" data-view="best" title="Its longest extent across the page, looking along its thinnest direction">Best</button> <button type="button" data-view="0">Along a</button> <button type="button" data-view="1">Along b</button> <button type="button" data-view="2">Along c</button></p>
            <p><button type="button" data-act="labels" title="Labels you dragged go back beside their atoms">Put the labels back</button></p>
          </fieldset>
          <fieldset class="crystal-shown"><legend>Shown</legend><div class="crystal-parts"></div></fieldset>
        </div>
      </div>
      <div class="crystal-page" role="tabpanel" hidden>
        <div class="crystal-table-wrap"><table class="crystal-table"><tbody></tbody></table></div>
        <p><button type="button" data-act="copy-table" title="Copy the table to paste into Word, Excel or a document here">Copy Table</button></p>
      </div>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Place on Page'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const canvas = $<HTMLCanvasElement>('.crystal-canvas');
    const status = $<HTMLElement>('.crystal-status');
    const blockSel = $<HTMLSelectElement>('select[name=block]');
    const place = $<HTMLButtonElement>('button[type=submit]');

    // ---- tabs
    const pages = [...form.querySelectorAll<HTMLElement>('.crystal-page')];
    const tabs = [...form.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    tabs.forEach((t, i) => t.addEventListener('click', () => { pages.forEach((p, k) => (p.hidden = k !== i)); tabs.forEach((b, k) => b.setAttribute('aria-selected', String(k === i))); if (i === 0) draw(); }));

    // ---- the settings boxes
    const input = (n: string) => form.querySelector<HTMLInputElement>(`input[name=${n}]`)!;
    const show = () => {
      const v = spec?.view ?? { ...defaultView(), ...lastLook };
      form.querySelectorAll<HTMLInputElement>('input[name=style]').forEach((r) => (r.checked = r.value === v.style));
      $<HTMLSelectElement>('select[name=probability]').value = String(v.probability);
      for (const k of ['hydrogens', 'colour', 'principal', 'labels'] as const) input(k).checked = v[k];
      input('labelSize').value = String(v.labelSize);
      input('w').value = String(Math.round(size.w));
      input('h').value = String(Math.round(size.h));
      const ortep = v.style === 'ortep';
      $<HTMLSelectElement>('select[name=probability]').disabled = !ortep;
      input('principal').disabled = !ortep;
    };
    const read = () => {
      if (!spec) return;
      const v = spec.view;
      v.style = (form.querySelector<HTMLInputElement>('input[name=style]:checked')?.value as XView['style']) ?? 'ortep';
      v.probability = Number($<HTMLSelectElement>('select[name=probability]').value) as XView['probability'];
      for (const k of ['hydrogens', 'colour', 'principal', 'labels'] as const) v[k] = input(k).checked;
      const ls = parseFloat(input('labelSize').value);
      if (ls > 0) v.labelSize = Math.min(30, ls);
      const w = parseFloat(input('w').value), h = parseFloat(input('h').value);
      if (w >= 40 && h >= 40) size = { w, h };
      const ortep = v.style === 'ortep';
      $<HTMLSelectElement>('select[name=probability]').disabled = !ortep;
      input('principal').disabled = !ortep;
    };

    // ---- molecules and disorder parts shown
    const fillParts = () => {
      const box = $<HTMLElement>('.crystal-parts');
      box.innerHTML = '';
      if (!spec) return;
      const s = spec;
      const mols = [...new Set(s.atoms.map((a) => a.mol))].sort((a, b) => a - b);
      const parts = [...new Set(s.atoms.map((a) => a.part).filter((p): p is string => !!p))].sort();
      const row = (text: string, on: boolean, set: (v: boolean) => void) => {
        const l = el('label', { className: 'ask-check' });
        const c = el('input', { type: 'checkbox', checked: on });
        c.addEventListener('change', () => { set(c.checked); draw(); });
        l.append(c, el('span', { textContent: text }));
        box.append(l);
      };
      if (mols.length > 1) for (const m of mols) {
        row(`Molecule ${m + 1}: ${formulaOf(s.atoms.filter((a) => a.mol === m).map((a) => a.el))}`, !s.view.hiddenMolecules.includes(m), (on) => {
          s.view.hiddenMolecules = on ? s.view.hiddenMolecules.filter((x) => x !== m) : [...s.view.hiddenMolecules, m];
        });
      }
      for (const p of parts) {
        row(`Disorder part ${p}`, !s.view.hiddenParts.includes(p), (on) => {
          s.view.hiddenParts = on ? s.view.hiddenParts.filter((x) => x !== p) : [...s.view.hiddenParts, p];
        });
      }
      $<HTMLElement>('.crystal-shown').hidden = !box.childElementCount;
    };

    const fillTable = () => {
      const body = $<HTMLTableElement>('.crystal-table').tBodies[0];
      body.innerHTML = '';
      for (const [label, value] of spec?.table ?? []) {
        const tr = body.insertRow();
        tr.insertCell().innerHTML = marksHtml(label);
        tr.insertCell().innerHTML = marksHtml(value);
      }
      $<HTMLButtonElement>('[data-act=copy-table]').disabled = !spec?.table?.length;
    };

    // ---- drawing (as it will be on the page: the size above, magnified by the wheel)
    let shown: XShape[] = [];
    let k = 1, ox = 0, oy = 0;
    function draw(): void {
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth || 520, ch = canvas.clientHeight || 360;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      place.disabled = !spec;
      if (!spec) {
        shown = [];
        ctx.fillStyle = '#6b6b6b';
        ctx.font = '13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Open a CIF file to see its structure.', cw / 2, ch / 2);
        ctx.textAlign = 'start';
        return;
      }
      const v = { ...spec.view, zoom: fittingZoom(spec, spec.view, size.w, size.h) };
      shown = crystalShapes(spec, v);
      // the page's box for the figure, fitted to the canvas, then magnified about its middle
      k = Math.min((cw - 16) / size.w, (ch - 16) / size.h) * mag;
      ox = cw / 2;
      oy = ch / 2;
      const b = shapesBounds(shown);
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(k, k);
      ctx.strokeStyle = '#d8dde6';
      ctx.lineWidth = 1 / k;
      ctx.setLineDash([4 / k, 4 / k]);
      ctx.strokeRect(-size.w / 2, -size.h / 2, size.w, size.h);
      ctx.setLineDash([]);
      ctx.translate(-cx, -cy);
      paintShapes(ctx, shown);
      ctx.restore();
      shiftX = cx;
      shiftY = cy;
    }
    let shiftX = 0, shiftY = 0;
    /** A point on the canvas (CSS px) in the drawing's points. */
    const toDrawing = (e: MouseEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left - ox) / k + shiftX, (e.clientY - r.top - oy) / k + shiftY];
    };
    const labelAt = (p: [number, number]): XShape | null => {
      for (const s of shown) {
        if (s.kind !== 'text') continue;
        const w = 0.6 * s.size! * s.text!.length;
        if (p[0] >= s.centre![0] - 2 && p[0] <= s.centre![0] + w + 2 && p[1] >= s.centre![1] - s.size! - 2 && p[1] <= s.centre![1] + 3) return s;
      }
      return null;
    };

    // ---- the mouse: turn, turn in the page, drag a label, magnify
    let drag: { x: number; y: number; label: XShape | null; plane: boolean } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!spec) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, label: labelAt(toDrawing(e)), plane: e.shiftKey || e.button === 2 };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!spec) return;
      if (!drag) { canvas.style.cursor = labelAt(toDrawing(e)) ? 'move' : 'grab'; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.label) {
        const s = drag.label;
        const off = spec.view.labelOffsets[s.key!] ?? [s.centre![0] - s.anchor![0], s.centre![1] - s.anchor![1]];
        spec.view.labelOffsets[s.key!] = [off[0] + dx / k, off[1] + dy / k];
        draw();
        drag.label = shown.find((x) => x.kind === 'text' && x.key === s.key) ?? null;
        return;
      }
      spec.view.rotation = drag.plane ? turnView(spec.view.rotation, 0, 0, -dx * 0.5) : turnView(spec.view.rotation, dy * 0.5, dx * 0.5);
      draw();
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); mag = Math.min(8, Math.max(0.5, mag * Math.exp(-e.deltaY * 0.0015))); draw(); }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
      if (!spec) return;
      const step = e.shiftKey ? 15 : 5;
      const turn = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [-step, 0], ArrowDown: [step, 0] }[e.key];
      if (!turn) return;
      e.preventDefault();
      spec.view.rotation = turnView(spec.view.rotation, turn[0], turn[1]);
      draw();
    });

    // ---- opening a file
    const useBlock = (i: number) => {
      try {
        spec = crystalFromBlock(blocks[i]);
        size = sizeFor(spec, L);
        mag = 1;
        const heavy = spec.atoms.filter((a) => a.el !== 'H' && a.el !== 'D').length;
        const own = spec.atoms.filter((a) => a.own).length;
        const mols = new Set(spec.atoms.map((a) => a.mol)).size;
        status.textContent = `${spec.atoms.length} atoms (${own} in the file, ${heavy} not hydrogen), ${mols} molecule${mols === 1 ? '' : 's'}.` + (spec.partial ? ' Stopped growing at 2000 atoms: a polymer or network.' : '');
      } catch (err) {
        spec = null;
        status.textContent = err instanceof CrystalError ? err.message : 'This structure could not be drawn.';
      }
      show();
      fillParts();
      fillTable();
      draw();
    };
    const openText = (name: string, text: string) => {
      blocks = readCif(text).filter((b) => b.rows('_atom_site_label').length);
      $<HTMLElement>('.crystal-name').textContent = name;
      blockSel.innerHTML = '';
      blocks.forEach((b, i) => blockSel.add(new Option(b.name || `(block ${i + 1})`, String(i))));
      blockSel.hidden = blocks.length < 2;
      if (!blocks.length) {
        spec = null;
        status.textContent = 'This file has no structure: no data block with atoms (_atom_site_ table).';
        show(); fillParts(); fillTable(); draw();
        return;
      }
      useBlock(0);
    };
    blockSel.addEventListener('change', () => useBlock(Number(blockSel.value)));

    const finish = (v: PlateData | null) => { d.remove(); resolve(v); };
    form.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      const act = b.dataset.act, view = b.dataset.view;
      if (act === 'cancel') { d.close(); finish(null); }
      else if (act === 'open') { const f = await opts.pickFile(); if (f) openText(f.name, f.text); }
      else if (act === 'labels' && spec) { spec.view.labelOffsets = {}; draw(); }
      else if (act === 'copy-table' && spec?.table) {
        const rows = spec.table;
        await opts.copy(rows.map(([l, v]) => `${marksPlain(l)}\t${marksPlain(v)}`).join('\n'), `<table>${rows.map(([l, v]) => `<tr><td>${marksHtml(l)}</td><td>${marksHtml(v)}</td></tr>`).join('')}</table>`);
        status.textContent = 'Copied the table: paste it into Word, Excel or a document here.';
      } else if (view !== undefined && spec) {
        if (view === 'best') spec.view.rotation = bestRotation(spec.atoms.filter((a) => a.el !== 'H' && a.el !== 'D').map((a) => a.xyz));
        else if (spec.axes) { const n = Number(view); spec.view.rotation = axisRotation([spec.axes[0][n], spec.axes[1][n], spec.axes[2][n]]); }
        draw();
      }
    });
    form.addEventListener('change', () => { read(); draw(); });
    form.addEventListener('input', (e) => { if ((e.target as HTMLElement).matches('input[type=number]')) { read(); draw(); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!spec) return;
      read();
      const { style, probability, hydrogens, colour, principal, labels, labelSize } = spec.view;
      lastLook = { style, probability, hydrogens, colour, principal, labels, labelSize };
      const base = editing ?? newPlate('crystal', L);
      d.close();
      finish({ ...base, kind: 'crystal', w: size.w, h: size.h, crystal: spec });
    });
    d.addEventListener('cancel', () => finish(null));
    form.append();
    d.append(form);
    document.body.append(d);
    d.showModal();
    show();
    fillParts();
    fillTable();
    if (opts.file) openText(opts.file.name, opts.file.text);
    else {
      if (spec) $<HTMLElement>('.crystal-name').textContent = spec.name || 'Crystal structure';
      draw();
    }
    new ResizeObserver(() => { if (!pages[0].hidden) draw(); }).observe(canvas);
  });
}

/** A molecule's formula for the list of what is shown (Hill order). */
function formulaOf(els: string[]): string {
  const n = new Map<string, number>();
  for (const e of els) n.set(e === 'D' ? 'H' : e, (n.get(e === 'D' ? 'H' : e) ?? 0) + 1);
  const order = [...n.keys()].sort((a, b) => (n.has('C') ? (a === 'C' ? -1 : b === 'C' ? 1 : a === 'H' ? -1 : b === 'H' ? 1 : 0) : 0) || a.localeCompare(b));
  return order.map((e) => e + (n.get(e)! > 1 ? n.get(e) : '')).join('');
}
