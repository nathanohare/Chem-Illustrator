// Chemistry ▸ Orbitals ▸ MO Diagram… (and Edit MO Diagram…): a row for each orbital level with
// its column (left atom, molecule, right atom), name, energy, how many orbitals and electrons,
// and for a molecular orbital the atomic orbitals it is made from. Starts from a preset (H₂, N₂,
// O₂, CO, ethylene π) and previews as you type.

import { MO_PRESETS, type MoColumn, type MoLevel, type MoSpec } from '../design/mo';
import { newPlate, type PlateData } from '../design/plates';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), props);

export function askMo(editing: PlateData | null, L: number, preview?: (d: PlateData, canvas: HTMLCanvasElement) => void): Promise<PlateData | null> {
  return new Promise((resolve) => {
    const base = editing ?? newPlate('mo', L);
    let levels: MoLevel[] = (base.mo?.levels ?? []).map((l) => ({ ...l }));
    const d = el('dialog', { className: 'ask plate-dialog mo-dialog' });
    d.setAttribute('aria-label', 'MO diagram');
    const form = el('form', { method: 'dialog' });
    form.innerHTML = `<h2>${editing ? 'Edit MO Diagram' : 'MO Diagram'}</h2>
      <label class="ask-row"${editing ? ' hidden' : ''}><span>Start from</span><select name="preset">${MO_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
      <canvas class="plate-preview" aria-label="Preview" role="img"></canvas>
      <div class="plate-table-wrap"><table class="plate-table mo-table"><thead><tr><th>Column</th><th>Name</th><th title="Sets the order and spacing only">Energy</th><th title="Degenerate orbitals at this level">Orbitals</th><th>Electrons</th><th title="A molecular orbital: the atomic orbitals it is made from, by name, joined to it by dashed lines">Made from</th><th></th></tr></thead><tbody></tbody></table></div>
      <p class="plate-rows"><button type="button" data-act="row">+ Orbital</button></p>
      <p class="muted small">Electrons go in by Hund's rule: one in each orbital of a level, then pairs. Energies only set the order and spacing. Names take _ and ^ for sub- and superscripts (σ_{2s}, π^*).</p>
      <label class="ask-row"><span>Titles</span><span class="mo-titles"><input name="t0" aria-label="Left title" /><input name="t1" aria-label="Middle title" /><input name="t2" aria-label="Right title" /></span></label>
      <label class="ask-row"><span>Size</span><span class="energy-pair"><input name="w" type="number" min="40" step="any" aria-label="Width" /> × <input name="h" type="number" min="40" step="any" aria-label="Height" /> pt</span></label>
      <label class="ask-row ask-check"><input name="axis" type="checkbox" /><span>Energy arrow up the left side</span></label>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Insert'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const body = $<HTMLTableElement>('.mo-table').tBodies[0];
    const num = (t: string, dflt: number) => { const v = parseFloat(t.replace(/[−–]/g, '-').replace(',', '.')); return Number.isFinite(v) ? v : dflt; };
    const read = () => {
      levels = [...body.rows].map((tr) => {
        const q = (k: string) => tr.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`)!.value;
        const column = q('column') as MoColumn;
        return { column, label: q('label'), e: num(q('e'), 0), n: Math.max(1, Math.min(5, Math.round(num(q('n'), 1)))), electrons: Math.max(0, Math.round(num(q('electrons'), 0))), ...(column === 'middle' && q('from').trim() ? { from: q('from') } : {}) };
      });
    };
    const draw = () => {
      body.innerHTML = '';
      levels.forEach((l, i) => {
        const tr = body.insertRow();
        const col = el('select');
        for (const [v, t] of [['left', 'Left atom'], ['middle', 'Molecule'], ['right', 'Right atom']]) col.add(new Option(t, v, false, v === l.column));
        col.dataset.k = 'column';
        const input = (k: string, value: string, cls = '') => { const x = el('input', { value, className: cls }); x.dataset.k = k; x.setAttribute('aria-label', `${k} ${i + 1}`); return x; };
        tr.insertCell().append(col);
        tr.insertCell().append(input('label', l.label));
        tr.insertCell().append(input('e', String(l.e), 'mo-num'));
        tr.insertCell().append(input('n', String(l.n), 'mo-num'));
        tr.insertCell().append(input('electrons', String(l.electrons), 'mo-num'));
        const from = input('from', l.from ?? '');
        from.disabled = l.column !== 'middle';
        col.addEventListener('change', () => { from.disabled = col.value !== 'middle'; });
        tr.insertCell().append(from);
        const del = el('button', { type: 'button', textContent: '×', title: 'Take out this orbital' });
        del.addEventListener('click', () => { read(); levels.splice(i, 1); draw(); redraw(); });
        tr.insertCell().append(del);
      });
    };
    const loadTitles = (spec: MoSpec) => { spec.titles.forEach((t, i) => { $<HTMLInputElement>(`input[name=t${i}]`).value = t; }); $<HTMLInputElement>('input[name=axis]').checked = spec.axis; };
    draw();
    if (base.mo) loadTitles(base.mo);
    $<HTMLInputElement>('input[name=w]').value = String(Math.round(base.w));
    $<HTMLInputElement>('input[name=h]').value = String(Math.round(base.h));
    const presetSel = $<HTMLSelectElement>('select[name=preset]');
    presetSel.addEventListener('change', () => {
      const p = MO_PRESETS.find((x) => x.id === presetSel.value);
      if (!p) return;
      levels = p.spec.levels.map((l) => ({ ...l }));
      loadTitles(p.spec);
      draw();
    });
    form.querySelector('[data-act=row]')!.addEventListener('click', () => { read(); levels.push({ column: 'middle', label: '', e: 0, n: 1, electrons: 0 }); draw(); });

    d.append(form);
    document.body.append(d);
    const finish = (v: PlateData | null) => { d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    const gather = (): PlateData => {
      read();
      const titles = [0, 1, 2].map((i) => $<HTMLInputElement>(`input[name=t${i}]`).value) as [string, string, string];
      return {
        ...base,
        w: Math.max(40, Number($<HTMLInputElement>('input[name=w]').value) || base.w),
        h: Math.max(40, Number($<HTMLInputElement>('input[name=h]').value) || base.h),
        mo: { levels: levels.map((l) => ({ ...l, label: l.label.trim(), electrons: Math.min(l.electrons, 2 * l.n) })), titles, axis: $<HTMLInputElement>('input[name=axis]').checked },
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
      if (!out.mo?.levels.length) return;
      d.close();
      finish(out);
    });
    d.showModal();
    redraw();
  });
}
