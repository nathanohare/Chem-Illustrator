// Chemistry ▸ Orbitals ▸ MO Diagram… (and Edit MO Diagram…): a row for each orbital level with
// its column (left atom, molecule, right atom), name, energy, how many orbitals and electrons,
// and for a molecular orbital the atomic orbitals it is made from. Starts from a preset (H₂, N₂,
// O₂, CO, ethylene π) and previews as you type. Names and titles are rich text: the bar above
// the table makes subscripts and superscripts and puts in σ, π or any other symbol.

import { foldIntoInfo } from './info-tip';
import { MO_PRESETS, parseMarkup, toMarkup, toRich, type MoColumn, type MoLevel, type MoSpec } from '../design/mo';
import { ORBITAL_LOOK_NAMES, type OrbitalLook } from '../chem/orbitals';
import { RichField } from './rich-field';
import { SYMBOLS } from './symbol-list';
import { newPlate, type PlateData } from '../design/plates';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), props);

export function askMo(editing: PlateData | null, L: number, fontSize: number, preview?: (d: PlateData, canvas: HTMLCanvasElement) => void): Promise<PlateData | null> {
  return new Promise((resolve) => {
    const base = editing ?? newPlate('mo', L);
    const start = base.mo ? toRich(base.mo) : null;
    let levels: MoLevel[] = (start?.levels ?? []).map((l) => ({ ...l }));
    const d = el('dialog', { className: 'ask plate-dialog mo-dialog' });
    d.setAttribute('aria-label', 'MO diagram');
    const form = el('form', { method: 'dialog' });
    form.innerHTML = `<h2>${editing ? 'Edit MO Diagram' : 'MO Diagram'}</h2>
      <label class="ask-row"${editing ? ' hidden' : ''}><span>Start from</span><select name="preset">${MO_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
      <canvas class="plate-preview" aria-label="Preview" role="img"></canvas>
      <div class="mo-bar" role="toolbar" aria-label="Text formatting">
        <button type="button" class="mo-fmt" data-fmt="sub" title="Subscript (Ctrl+=)" aria-label="Subscript">X<sub>2</sub></button><button type="button" class="mo-fmt" data-fmt="sup" title="Superscript (Ctrl+Shift+=)" aria-label="Superscript">X<sup>2</sup></button><span class="mo-bar-gap"></span><button type="button" class="mo-fmt" data-sym="σ" title="Insert σ (sigma)">σ</button><button type="button" class="mo-fmt" data-sym="π" title="Insert π (pi)">π</button><button type="button" class="mo-fmt" data-sym="*" title="Insert * (antibonding)">*</button><button type="button" class="mo-fmt mo-more" title="Symbol… (Greek letters, arrows, charges and more)" aria-label="Symbol" aria-expanded="false">Ω ▾</button>
      </div>
      <div class="mo-symbols" role="group" aria-label="Symbols" hidden></div>
      <div class="plate-table-wrap"><table class="plate-table mo-table"><thead><tr><th>Column</th><th>Name</th><th title="Sets the order and spacing only">Energy</th><th title="Degenerate orbitals at this level">Orbitals</th><th>Electrons</th><th title="A molecular orbital: the atomic orbitals it is made from, by name, joined to it by dashed lines">Made from</th><th></th></tr></thead><tbody></tbody></table></div>
      <p class="plate-rows"><button type="button" data-act="row">+ Orbital</button></p>
      <p class="muted small mo-help">Electrons fill by Hund's rule (one per orbital, then pairs). Energies set only order and spacing. Type "Made from" as the atomic orbitals' names, without formatting (2s, 2p).</p>
      <div class="ask-row"><span>Titles</span><span class="mo-titles"></span></div>
      <div class="ask-row"><span>Size</span><span class="mo-sizes"><span class="energy-pair"><input name="w" type="number" min="40" step="any" aria-label="Width" /> × <input name="h" type="number" min="40" step="any" aria-label="Height" /> pt</span><label class="mo-arrow-size">Electron arrows <input name="arrow" type="number" min="3" max="48" step="0.5" aria-label="Electron arrow size" class="mo-num" /> pt</label></span></div>
      <label class="ask-row ask-check"><input name="axis" type="checkbox" /><span>Energy arrow up the left side</span></label>
      <div class="ask-row ask-check mo-pics-row"><label><input name="pictures" type="checkbox" /><span>Orbital mixing pictures</span></label><select name="look" aria-label="Picture look">${ORBITAL_LOOK_NAMES.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}</select></div>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Insert'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    foldIntoInfo($('.mo-help'), $('h2'));
    const body = $<HTMLTableElement>('.mo-table').tBodies[0];
    // the rich-text fields: each row's name and the three titles; the bar works on the one being typed in
    let active: RichField | null = null;
    const names: RichField[] = [];
    const bar = $<HTMLElement>('.mo-bar'), grid = $<HTMLElement>('.mo-symbols');
    const showState = () => {
      const r = active && document.activeElement === active.el ? active : null;
      for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-fmt], [data-sym]')) b.disabled = !r;
      for (const b of grid.querySelectorAll<HTMLButtonElement>('button')) b.disabled = !r;
      bar.querySelector('[data-fmt=sub]')!.setAttribute('aria-pressed', String(!!r?.state('sub')));
      bar.querySelector('[data-fmt=sup]')!.setAttribute('aria-pressed', String(!!r?.state('sup')));
    };
    const rich = (markup: string, label: string, placeholder = '') => {
      const f: RichField = new RichField(parseMarkup(markup), { label, placeholder, chem: () => false, done: () => redraw(), onState: (x) => { if (x === active) showState(); } });
      f.el.classList.add('mo-rich');
      f.el.addEventListener('focus', () => { active = f; showState(); });
      f.el.addEventListener('blur', () => setTimeout(showState));
      return f;
    };
    const markupOf = (f: RichField) => toMarkup(f.parts()).trim();
    bar.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    grid.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    const typing = () => (active && document.activeElement === active.el ? active : null);
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-fmt]')) b.addEventListener('click', () => { typing()?.toggle(b.dataset.fmt as 'sub' | 'sup'); showState(); });
    const insertSym = (c: string) => { const r = typing(); if (r) { r.insert(c); redraw(); } };
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-sym]')) b.addEventListener('click', () => insertSym(b.dataset.sym!));
    for (const [c, name] of SYMBOLS) {
      const b = el('button', { type: 'button', className: 'mo-fmt', textContent: c, title: `Insert ${c} (${name})` });
      b.addEventListener('click', () => insertSym(c));
      grid.append(b);
    }
    const more = bar.querySelector<HTMLButtonElement>('.mo-more')!;
    more.addEventListener('click', () => { grid.hidden = !grid.hidden; more.setAttribute('aria-expanded', String(!grid.hidden)); more.setAttribute('aria-pressed', String(!grid.hidden)); });
    const titleFields = ['Left title', 'Middle title', 'Right title'].map((t, i) => rich(start?.titles[i] ?? '', t));
    $('.mo-titles').append(...titleFields.map((f) => f.el));
    const num = (t: string, dflt: number) => { const v = parseFloat(t.replace(/[−–]/g, '-').replace(',', '.')); return Number.isFinite(v) ? v : dflt; };
    const read = () => {
      levels = [...body.rows].map((tr, i) => {
        const q = (k: string) => tr.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`)!.value;
        const column = q('column') as MoColumn;
        return { column, label: names[i] ? markupOf(names[i]) : '', e: num(q('e'), 0), n: Math.max(1, Math.min(5, Math.round(num(q('n'), 1)))), electrons: Math.max(0, Math.round(num(q('electrons'), 0))), ...(column === 'middle' && q('from').trim() ? { from: q('from') } : {}) };
      });
    };
    const draw = () => {
      body.innerHTML = '';
      names.length = 0;
      active = null;
      levels.forEach((l, i) => {
        const tr = body.insertRow();
        const col = el('select');
        for (const [v, t] of [['left', 'Left atom'], ['middle', 'Molecule'], ['right', 'Right atom']]) col.add(new Option(t, v, false, v === l.column));
        col.dataset.k = 'column';
        const input = (k: string, value: string, cls = '') => { const x = el('input', { value, className: cls }); x.dataset.k = k; x.setAttribute('aria-label', `${k} ${i + 1}`); return x; };
        tr.insertCell().append(col);
        const name = rich(l.label, `Name ${i + 1}`);
        names.push(name);
        tr.insertCell().append(name.el);
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
      showState();
    };
    const loadTitles = (spec: MoSpec) => {
      const r = toRich(spec);
      r.titles.forEach((t, i) => { titleFields[i].setParts(parseMarkup(t)); });
      $<HTMLInputElement>('input[name=axis]').checked = spec.axis;
    };
    draw();
    if (start) loadTitles(start);
    $<HTMLInputElement>('input[name=arrow]').value = String(start?.arrowSize ?? Math.round(fontSize * 0.9 * 10) / 10);
    $<HTMLInputElement>('input[name=pictures]').checked = !!start?.pictures;
    $<HTMLSelectElement>('select[name=look]').value = start?.pictureLook ?? 'shaded';
    $<HTMLInputElement>('input[name=w]').value = String(Math.round(base.w));
    $<HTMLInputElement>('input[name=h]').value = String(Math.round(base.h));
    const presetSel = $<HTMLSelectElement>('select[name=preset]');
    presetSel.addEventListener('change', () => {
      const p = MO_PRESETS.find((x) => x.id === presetSel.value);
      if (!p) return;
      levels = toRich(p.spec).levels.map((l) => ({ ...l }));
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
      const titles = titleFields.map(markupOf) as [string, string, string];
      const arrow = Number($<HTMLInputElement>('input[name=arrow]').value);
      return {
        ...base,
        w: Math.max(40, Number($<HTMLInputElement>('input[name=w]').value) || base.w),
        h: Math.max(40, Number($<HTMLInputElement>('input[name=h]').value) || base.h),
        mo: {
          levels: levels.map((l) => ({ ...l, electrons: Math.min(l.electrons, 2 * l.n) })), titles, axis: $<HTMLInputElement>('input[name=axis]').checked, rich: true,
          ...(arrow > 0 ? { arrowSize: Math.min(48, Math.max(3, arrow)) } : {}),
          ...($<HTMLInputElement>('input[name=pictures]').checked ? { pictures: true } : {}),
          pictureLook: $<HTMLSelectElement>('select[name=look]').value as OrbitalLook,
        },
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
