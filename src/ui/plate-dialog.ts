// Insert ▸ TLC Plate… and Insert ▸ Gel… (and their Edit windows): a row for each lane with its
// name and its spots or bands typed as a short list, the stain or dye, and what is written on it,
// with a preview that redraws as you type.

import { GEL_LOOKS, LADDERS, TLC_LOOKS, newPlate, type PlateData, type PlateKind, type PlateLane } from '../design/plates';

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
      <div class="plate-table-wrap"><table class="plate-table"><thead><tr><th>Lane</th><th>${tlc ? 'Spots (Rf)' : 'Bands (size)'}</th>${tlc ? '' : '<th title="A size marker: its sizes are written beside the gel">Marker</th>'}<th></th></tr></thead><tbody></tbody></table></div>
      <p class="plate-rows"><button type="button" data-act="lane">+ Lane</button>${tlc ? ' <button type="button" data-act="co" title="A lane with every spot of the lanes either side of it, as a co-spot shows">+ Co-spot lane</button>' : ` <label class="plate-ladder">Marker <select name="ladder"><option value="">Add a marker lane…</option>${LADDERS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('')}</select></label>`}</p>
      <p class="muted small">${tlc
        ? 'Type each spot\'s Rf, with commas between: 0.45, 0.2. After a number: faint or strong, big or small, streak, or a color (blue, pink, yellow…).'
        : 'Type each band\'s size, with commas between: 3, 1.2 faint. Bands run by size on a log scale. After a number: faint or strong, big or small, or a color.'}</p>
      <label class="ask-row"><span>${tlc ? 'Stain' : 'Dye'}</span><select name="look">${looks}</select></label>
      ${tlc ? '' : '<label class="ask-row"><span>Sizes in</span><select name="unit"><option value="bp">bp</option><option value="kb">kb</option><option value="kDa">kDa</option></select></label>'}
      <label class="ask-row"><span>${tlc ? 'Eluent' : 'Caption'}</span><input name="note" placeholder="${tlc ? '20% EtOAc/hexanes' : 'optional'}" /></label>
      <label class="ask-row"><span>Size</span><span class="energy-pair"><input name="w" type="number" min="20" step="any" aria-label="Width" /> × <input name="h" type="number" min="20" step="any" aria-label="Height" /> pt</span></label>
      ${tlc ? '<label class="ask-row ask-check"><input name="rf" type="checkbox" /><span>Write the Rf values</span></label><label class="ask-row ask-check"><input name="lines" type="checkbox" /><span>Start and solvent-front lines</span></label>' : '<label class="ask-row ask-check"><input name="sizes" type="checkbox" /><span>Write the marker sizes</span></label>'}
      <label class="ask-row ask-check"><input name="labels" type="checkbox" /><span>Lane names</span></label>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Insert'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const body = $<HTMLTableElement>('.plate-table').tBodies[0];

    const read = () => {
      lanes = [...body.rows].map((tr) => ({
        label: tr.querySelector<HTMLInputElement>('input[data-k=label]')!.value,
        marks: tr.querySelector<HTMLInputElement>('input[data-k=marks]')!.value,
        ...(tr.querySelector<HTMLInputElement>('input[data-k=ladder]')?.checked ? { ladder: true } : {}),
      }));
    };
    const draw = () => {
      body.innerHTML = '';
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
    draw();
    $<HTMLSelectElement>('select[name=look]').value = start.look;
    if (!tlc) $<HTMLSelectElement>('select[name=unit]').value = start.unit;
    $<HTMLInputElement>('input[name=note]').value = start.note;
    $<HTMLInputElement>('input[name=w]').value = String(Math.round(start.w));
    $<HTMLInputElement>('input[name=h]').value = String(Math.round(start.h));
    $<HTMLInputElement>('input[name=labels]').checked = start.labels;
    if (tlc) { $<HTMLInputElement>('input[name=rf]').checked = start.rf; $<HTMLInputElement>('input[name=lines]').checked = start.lines; }
    else $<HTMLInputElement>('input[name=sizes]').checked = start.sizes;

    form.querySelector('[data-act=lane]')!.addEventListener('click', () => { read(); lanes.push({ label: String(lanes.length + 1), marks: '' }); draw(); body.rows[body.rows.length - 1]?.querySelector('input')?.focus(); });
    form.querySelector('[data-act=co]')?.addEventListener('click', () => {
      // the co-spot of the last two lanes: every spot of both, once
      read();
      const a = lanes[lanes.length - 2]?.marks ?? '', b = lanes[lanes.length - 1]?.marks ?? '';
      const seen = new Set<string>();
      const marks = [...a.split(','), ...b.split(',')].map((x) => x.trim()).filter((x) => x && !seen.has(x.split(/\s+/)[0]) && seen.add(x.split(/\s+/)[0]));
      lanes.splice(Math.max(0, lanes.length - 1), 0, { label: 'co', marks: marks.join(', ') });
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
    const finish = (v: PlateData | null) => { d.remove(); resolve(v); };
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
      const { look, rf, lines, labels, unit, sizes, w, h } = out;
      lastLook[kind] = { look, rf, lines, labels, unit, sizes, w, h };
      d.close();
      finish(out);
    });
    d.showModal();
    redraw();
    body.querySelector<HTMLInputElement>('input[data-k=marks]')?.focus();
  });
}
