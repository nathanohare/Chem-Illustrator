// Insert ▸ TLC Plate… and Insert ▸ Gel… (and their Edit windows). A TLC plate has a row for each
// spot under its lane's name: its Rf, and a Description menu for how it looks (intensity, size,
// streak, color). A gel has a row for each lane with its bands typed as a short list. Then the
// stain or dye and what is written on it, with a preview that redraws as you go.

import { addInfo, foldIntoInfo } from './info-tip';
import { GEL_LOOKS, LADDERS, LOCK_SPOTS_INFO, SPOT_COLORS, TLC_LOOKS, newPlate, spotColorHex, spotRows, spotSummary, spotText, type PlateData, type PlateKind, type PlateLane, type SpotRow } from '../design/plates';

/** How the last plate and gel looked, so a new one starts the same way. */
const lastLook: Record<PlateKind, Partial<PlateData>> = { tlc: {}, gel: {}, mo: {}, crystal: {} };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), props);

export function askPlate(kind: PlateKind, editing: PlateData | null, L: number, preview?: (d: PlateData, canvas: HTMLCanvasElement) => void): Promise<PlateData | null> {
  return new Promise((resolve) => {
    const tlc = kind === 'tlc';
    const start: PlateData = editing ?? { ...newPlate(kind, L), ...lastLook[kind] };
    let lanes: PlateLane[] = start.lanes.map((l) => ({ ...l }));
    const d = el('dialog', { className: 'ask plate-dialog' });
    d.setAttribute('aria-label', tlc ? 'TLC plate' : 'Gel');
    const form = el('form', { method: 'dialog' });
    const title = editing ? (tlc ? 'Edit TLC Plate' : 'Edit Gel') : tlc ? 'TLC Plate' : 'Gel';
    const looks = (tlc ? TLC_LOOKS : GEL_LOOKS).map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
    form.innerHTML = `<h2>${title}</h2>
      <canvas class="plate-preview" aria-label="Preview" role="img"></canvas>
      <div class="plate-table-wrap"><table class="plate-table${tlc ? ' plate-spots' : ''}"><thead><tr><th>Lane</th>${tlc ? '<th class="plate-rf">Rf</th><th>Description</th>' : '<th>Bands (size)</th><th title="A size marker: its sizes are written beside the gel">Marker</th>'}<th></th></tr></thead><tbody></tbody></table></div>
      <p class="plate-rows"><button type="button" data-act="lane">+ Lane</button>${tlc ? ' <button type="button" data-act="co" title="A lane with every spot of the lanes either side of it, as a co-spot shows">+ Co-spot lane</button>' : ` <label class="plate-ladder">Marker <select name="ladder"><option value="">Add a marker lane…</option>${LADDERS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></label>`}</p>
      <p class="muted small plate-help">${tlc
        ? 'Each spot\'s Rf, from 0 (the start line) to 1 (the solvent front). + Spot adds one to the lane. On the canvas, drag a spot up or down to change its Rf.'
        : 'Type each band\'s size, with commas between: 3, 1.2 faint. Bands run by size on a log scale. After a number: faint or strong, big or small, or a color.'}</p>
      <label class="ask-row"><span>${tlc ? 'Stain' : 'Dye'}</span><select name="look">${looks}</select></label>
      ${tlc ? '' : '<label class="ask-row"><span>Sizes in</span><select name="unit"><option value="bp">bp</option><option value="kb">kb</option><option value="kDa">kDa</option></select></label>'}
      <label class="ask-row"><span>${tlc ? 'Eluent' : 'Caption'}</span><input name="note" placeholder="${tlc ? '20% EtOAc/hexanes' : 'optional'}" /></label>
      <label class="ask-row"><span>Size</span><span class="energy-pair"><input name="w" type="number" min="20" step="any" aria-label="Width" /> × <input name="h" type="number" min="20" step="any" aria-label="Height" /> pt</span></label>
      ${tlc ? '<label class="ask-row ask-check"><input name="rf" type="checkbox" /><span>Write the Rf values</span></label><label class="ask-row ask-check"><input name="lines" type="checkbox" /><span>Start and solvent-front lines</span></label>' : '<label class="ask-row ask-check"><input name="sizes" type="checkbox" /><span>Write the marker sizes</span></label>'}
      <label class="ask-row ask-check"><input name="labels" type="checkbox" /><span>Lane names</span></label>
      ${tlc ? '<label class="ask-row ask-check"><input name="locked" type="checkbox" /><span class="plate-lock">Lock spots</span></label>' : ''}
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Insert'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    foldIntoInfo($('.plate-help'), form.querySelectorAll('.plate-table th')[1]);
    if (tlc) addInfo($('.plate-lock'), LOCK_SPOTS_INFO);
    const body = $<HTMLTableElement>('.plate-table').tBodies[0];

    // a TLC plate's lanes as rows of spots (kept as they change; `lanes` is made from them)
    let tl = lanes.map((l) => ({ label: l.label, spots: spotRows(l.marks) }));
    const read = () => {
      if (tlc) { lanes = tl.map((l) => ({ label: l.label, marks: spotText(l.spots) })); return; }
      lanes = [...body.rows].map((tr) => ({
        label: tr.querySelector<HTMLInputElement>('input[data-k=label]')!.value,
        marks: tr.querySelector<HTMLInputElement>('input[data-k=marks]')!.value,
        ...(tr.querySelector<HTMLInputElement>('input[data-k=ladder]')?.checked ? { ladder: true } : {}),
      }));
    };
    const draw = () => {
      body.innerHTML = '';
      if (tlc) { drawSpots(); return; }
      lanes.forEach((l, i) => {
        const tr = body.insertRow();
        const name = el('input', { value: l.label, className: 'plate-name' });
        name.dataset.k = 'label';
        name.setAttribute('aria-label', `Lane ${i + 1} name`);
        const marks = el('input', { value: l.marks, inputMode: 'decimal' });
        marks.dataset.k = 'marks';
        marks.setAttribute('aria-label', `Lane ${i + 1} ${tlc ? 'spots' : 'bands'}`);
        tr.insertCell().append(name);
        tr.insertCell().append(marks);
        if (!tlc) {
          const lad = el('input', { type: 'checkbox', checked: !!l.ladder });
          lad.dataset.k = 'ladder';
          lad.setAttribute('aria-label', `Lane ${i + 1} is a size marker`);
          tr.insertCell().append(lad);
        }
        const del = el('button', { type: 'button', textContent: '×', title: 'Take out this lane' });
        del.addEventListener('click', () => { read(); if (lanes.length > 1) lanes.splice(i, 1); draw(); redraw(); });
        tr.insertCell().append(del);
      });
    };
    let menu: HTMLElement | null = null;
    const closeMenu = () => { menu?.remove(); menu = null; body.querySelector('.plate-desc[aria-expanded=true]')?.setAttribute('aria-expanded', 'false'); };
    /** A spot's Description menu: intensity, size, shape and color, each a row of choices. */
    const openMenu = (btn: HTMLButtonElement, spot: SpotRow) => {
      closeMenu();
      const m = el('div', { className: 'plate-menu' });
      m.setAttribute('role', 'group');
      m.setAttribute('aria-label', 'Spot description');
      const show = () => { btn.firstChild!.textContent = spotSummary(spot); redraw(); };
      const seg = <T extends string | boolean>(name: string, choices: [T, string][], get: () => T, set: (v: T) => void) => {
        const row = el('div', { className: 'plate-menu-row' });
        const bar = el('span', { className: 'plate-seg' });
        for (const [v, text] of choices) {
          const b = el('button', { type: 'button', textContent: text });
          b.setAttribute('aria-pressed', String(get() === v));
          b.addEventListener('click', () => { set(v); for (const x of bar.children) x.setAttribute('aria-pressed', String(x === b)); show(); });
          bar.append(b);
        }
        row.append(el('span', { className: 'plate-menu-head', textContent: name }), bar);
        m.append(row);
      };
      seg('Intensity', [['faint', 'Faint'], ['', 'Normal'], ['strong', 'Strong']], () => spot.strength, (v) => { spot.strength = v; });
      seg('Size', [['small', 'Small'], ['', 'Normal'], ['large', 'Large']], () => spot.size, (v) => { spot.size = v; });
      seg('Shape', [[false, 'Spot'], [true, 'Streak']], () => spot.streak, (v) => { spot.streak = v; });
      const row = el('div', { className: 'plate-menu-row' });
      const sw = el('span', { className: 'plate-swatches' });
      for (const c of ['', ...SPOT_COLORS]) {
        const b = el('button', { type: 'button', className: c ? '' : 'stain', title: c ? c[0].toUpperCase() + c.slice(1) : 'Stain color' });
        b.setAttribute('aria-label', b.title);
        if (c) b.style.background = spotColorHex(c) ?? c;
        b.setAttribute('aria-pressed', String(spot.color === c));
        b.addEventListener('click', () => { spot.color = c; for (const x of sw.children) x.setAttribute('aria-pressed', String(x === b)); show(); });
        sw.append(b);
      }
      row.append(el('span', { className: 'plate-menu-head', textContent: 'Color' }), sw);
      m.append(row);
      m.addEventListener('focusout', (e) => { const to = e.relatedTarget as Node | null; if (to && !m.contains(to) && to !== btn) closeMenu(); });
      m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); btn.focus(); } });
      d.append(m);
      // (fixed, so the table's scrolling doesn't clip it; below the button, or above if there's no
      // room, and inside the window's right edge)
      const r = btn.getBoundingClientRect(), h = m.offsetHeight, w = m.offsetWidth;
      const right = Math.min(innerWidth, d.getBoundingClientRect().right) - 4;
      m.style.left = `${Math.max(4, Math.min(r.left, right - w))}px`;
      m.style.top = `${r.bottom + 2 + h > innerHeight - 4 ? Math.max(4, r.top - 2 - h) : r.bottom + 2}px`;
      btn.setAttribute('aria-expanded', 'true');
      menu = m;
      (m.querySelector('[aria-pressed=true]') as HTMLElement | null)?.focus();
    };
    d.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target as Node) && !(e.target as Element).closest?.('.plate-desc')) closeMenu(); });
    const xButton = (title: string, act: () => void) => {
      const b = el('button', { type: 'button', textContent: '×', title, className: 'plate-x' });
      b.setAttribute('aria-label', title);
      b.addEventListener('click', () => { closeMenu(); act(); draw(); redraw(); });
      return b;
    };
    /** A TLC plate's table: for each lane, its name (beside all its spots) and a row for each spot. */
    const drawSpots = () => {
      tl.forEach((lane, li) => {
        const n = lane.spots.length;
        const first = body.insertRow();
        first.className = 'plate-lane-start';
        const nameCell = first.insertCell();
        nameCell.rowSpan = n + 1;
        nameCell.className = 'plate-lane';
        const name = el('input', { value: lane.label, className: 'plate-name' });
        name.setAttribute('aria-label', `Lane ${li + 1} name`);
        name.addEventListener('input', () => { lane.label = name.value; });
        const box = el('span', { className: 'plate-lane-box' });
        box.append(name, xButton('Delete lane', () => { if (tl.length > 1) tl.splice(li, 1); }));
        nameCell.append(box);
        lane.spots.forEach((spot, si) => {
          const tr = si === 0 ? first : body.insertRow();
          const rf = el('input', { value: spot.rf, inputMode: 'decimal', className: 'plate-rf-in' });
          rf.dataset.k = 'rf';
          rf.setAttribute('aria-label', `Lane ${li + 1} spot ${si + 1} Rf`);
          rf.addEventListener('input', () => { spot.rf = rf.value; });
          const desc = el('button', { type: 'button', className: 'plate-desc' });
          desc.append(el('span', { textContent: spotSummary(spot) }), el('span', { className: 'plate-caret', textContent: '▾' }));
          desc.setAttribute('aria-haspopup', 'true');
          desc.setAttribute('aria-label', `Lane ${li + 1} spot ${si + 1} description`);
          desc.addEventListener('click', () => { if (menu && desc.getAttribute('aria-expanded') === 'true') { closeMenu(); desc.setAttribute('aria-expanded', 'false'); } else openMenu(desc, spot); });
          tr.insertCell().append(rf);
          tr.insertCell().append(desc);
          tr.insertCell().append(xButton('Delete spot', () => { lane.spots.splice(si, 1); }));
        });
        const addRow = n ? body.insertRow() : first;
        addRow.classList.add('plate-add-row');
        const cell = addRow.insertCell();
        cell.colSpan = 3;
        const add = el('button', { type: 'button', className: 'plate-add', textContent: '+ Spot' });
        add.addEventListener('click', () => {
          lane.spots.push({ rf: '', strength: '', size: '', streak: false, color: '' });
          closeMenu();
          draw();
          const rows = [...body.querySelectorAll<HTMLInputElement>(`input[aria-label^="Lane ${li + 1} spot"]`)];
          rows[rows.length - 1]?.focus();
        });
        cell.append(add);
      });
    };
    draw();
    $<HTMLSelectElement>('select[name=look]').value = start.look;
    if (!tlc) $<HTMLSelectElement>('select[name=unit]').value = start.unit;
    $<HTMLInputElement>('input[name=note]').value = start.note;
    $<HTMLInputElement>('input[name=w]').value = String(Math.round(start.w));
    $<HTMLInputElement>('input[name=h]').value = String(Math.round(start.h));
    $<HTMLInputElement>('input[name=labels]').checked = start.labels;
    if (tlc) { $<HTMLInputElement>('input[name=rf]').checked = start.rf; $<HTMLInputElement>('input[name=lines]').checked = start.lines; $<HTMLInputElement>('input[name=locked]').checked = !!start.locked; }
    else $<HTMLInputElement>('input[name=sizes]').checked = start.sizes;

    form.querySelector('[data-act=lane]')!.addEventListener('click', () => {
      read();
      lanes.push({ label: String(lanes.length + 1), marks: '' });
      if (tl.length < lanes.length) tl.push({ label: String(tl.length + 1), spots: [] });
      draw();
      const names = body.querySelectorAll<HTMLInputElement>(tlc ? 'input.plate-name' : 'tr:last-child input');
      names[names.length - 1]?.select();
    });
    form.querySelector('[data-act=co]')?.addEventListener('click', () => {
      // the co-spot of the last two lanes: every spot of both, once
      read();
      const a = lanes[lanes.length - 2]?.marks ?? '', b = lanes[lanes.length - 1]?.marks ?? '';
      const seen = new Set<string>();
      const marks = [...a.split(','), ...b.split(',')].map((x) => x.trim()).filter((x) => x && !seen.has(x.split(/\s+/)[0]) && seen.add(x.split(/\s+/)[0]));
      lanes.splice(Math.max(0, lanes.length - 1), 0, { label: 'co', marks: marks.join(', ') });
      tl = lanes.map((l) => ({ label: l.label, spots: spotRows(l.marks) }));
      draw();
    });
    const ladderSel = form.querySelector<HTMLSelectElement>('select[name=ladder]');
    ladderSel?.addEventListener('change', () => {
      const lad = LADDERS.find((x) => x.id === ladderSel.value);
      ladderSel.value = '';
      if (!lad) return;
      read();
      lanes.unshift({ label: 'M', marks: lad.sizes.join(', '), ladder: true });
      $<HTMLSelectElement>('select[name=unit]').value = lad.unit;
      draw();
    });

    d.append(form);
    document.body.append(d);
    const finish = (v: PlateData | null) => { closeMenu(); d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    const gather = (): PlateData => {
      read();
      return {
        kind,
        lanes: lanes.map((l) => ({ ...l, label: l.label.trim(), marks: l.marks.trim() })),
        look: $<HTMLSelectElement>('select[name=look]').value,
        w: Math.max(20, Number($<HTMLInputElement>('input[name=w]').value) || start.w),
        h: Math.max(20, Number($<HTMLInputElement>('input[name=h]').value) || start.h),
        rf: tlc ? $<HTMLInputElement>('input[name=rf]').checked : start.rf,
        lines: tlc ? $<HTMLInputElement>('input[name=lines]').checked : start.lines,
        labels: $<HTMLInputElement>('input[name=labels]').checked,
        ...(tlc && $<HTMLInputElement>('input[name=locked]').checked ? { locked: true } : {}),
        note: $<HTMLInputElement>('input[name=note]').value,
        unit: tlc ? start.unit : ($<HTMLSelectElement>('select[name=unit]').value as PlateData['unit']),
        sizes: tlc ? start.sizes : $<HTMLInputElement>('input[name=sizes]').checked,
        ...(editing?.margins ? { margins: editing.margins } : {}),
      };
    };
    const canvas = $<HTMLCanvasElement>('.plate-preview');
    canvas.hidden = !preview;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const redraw = () => {
      if (!preview) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; try { preview(gather(), canvas); } catch { /* half-typed */ } }, 120);
    };
    form.addEventListener('input', redraw);
    form.addEventListener('change', redraw);
    form.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) redraw(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const out = gather();
      const { look, rf, lines, labels, unit, sizes, w, h, locked } = out;
      lastLook[kind] = { look, rf, lines, labels, unit, sizes, w, h, locked };
      d.close();
      finish(out);
    });
    d.showModal();
    redraw();
    body.querySelector<HTMLInputElement>(tlc ? 'input[data-k=rf]' : 'input[data-k=marks]')?.focus();
  });
}
