// Settings ▸ Analysis: everything the Analysis panel, the ribbon's Analysis box and attached
// descriptors show, on one page. The panel's own gear changes the same settings in place for quick
// changes (showing, hiding and moving rows); this page has the rest: decimal places, units, lab
// calculations, the ribbon box's lines, and how Attach Descriptors writes each line.

import type { FragmentResult } from '../worker/chem-worker';
import { showDialog, previewSlot } from './dialog-host';
import { addInfo } from './info-tip';
import { ask } from './ask';
import { dragRow, moved } from './row-drag';
import { CALC_UNITS, calcName, newCalc, type LabCalc, type CalcUnit } from '../chem/bench';
import {
  DESC_NAMES, ROW_NAMES, SECTION_ROWS, BENCH_ROWS, calcOf, nextCalcId, parseAnalysisPrefs,
  type AnalysisPrefs, type RowKey, type DescKey, type TempUnit, type PressureUnit,
} from '../chem/analysis-prefs';
import { calcParts, descriptorRuns, formulaHtml, type Bench } from './analysis-panel';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const GRIP = '<svg viewBox="0 0 10 14" width="8" height="12" aria-hidden="true" fill="currentColor"><circle cx="3" cy="3" r="1.1"/><circle cx="7" cy="3" r="1.1"/><circle cx="3" cy="7" r="1.1"/><circle cx="7" cy="7" r="1.1"/><circle cx="3" cy="11" r="1.1"/><circle cx="7" cy="11" r="1.1"/></svg>';

export interface AnalysisSettingsHost {
  prefs(): AnalysisPrefs;
  /** Use and keep these settings. */
  apply(p: AnalysisPrefs): void;
  /** The structure last analysed (for the previews), if any. */
  sample(): FragmentResult | null;
  bench(r: FragmentResult): Bench;
  /** The ion picked in the panel. */
  adduct(): string;
}

/** Where the page opens: at its panel rows, or at attached descriptors (the gear by Attach descriptors). */
let openAt: 'rows' | 'descriptors' = 'rows';
export function analysisSettingsAt(at: 'rows' | 'descriptors'): void {
  openAt = at;
}

/** A row's name: its own, or its calculation's. */
const nameOf = (p: AnalysisPrefs, key: string) => ROW_NAMES[key] ?? DESC_NAMES[key] ?? (calcOf(p, key) ? calcName(calcOf(p, key)!) : key);

/** The lines a row can put in the ribbon box (not the name or the sections). */
const ribbonChoices = (p: AnalysisPrefs) => p.rows.map((r) => r.key).filter((k) => k !== 'name' && k !== 'stereo' && k !== 'cas' && !SECTION_ROWS.includes(k));

/** Settings ▸ Analysis. Resolves once the page is saved or closed. */
export function analysisSettingsPage(host: AnalysisSettingsHost): Promise<void> {
  // the page works on a copy, kept when it is saved
  const w = structuredClone(host.prefs());
  const d = document.createElement('dialog');
  d.className = 'ask analysis-settings';
  d.setAttribute('aria-label', 'Analysis settings');
  const form = document.createElement('form');
  form.method = 'dialog';
  form.className = 'ask-form';
  d.append(form);

  /** Changes that aren't in a box (order, calculations): a hidden box changes too, so the page knows it has changes. */
  const marker = document.createElement('input');
  marker.type = 'hidden';
  marker.value = '0';
  const touched = () => { marker.value = String(Number(marker.value) + 1); form.dispatchEvent(new Event('input', { bubbles: true })); };

  const draw = () => {
    const at = d.querySelector('.as-cols')?.scrollTop ?? 0;
    form.innerHTML = `<h2>Analysis</h2>
      <div class="as-cols">
        <div class="as-col">
          <h3 data-info="Drag rows by their grips to reorder them; untick to hide. The panel's gear does the same in place. Bench values are measured (PubChem) once a structure has been looked up, and estimated (marked est.) before that.">Panel rows</h3>
          <div class="as-list" data-list="rows">${w.rows.map((r) => rowItem(r.key, r.on)).join('')}</div>
          <div class="as-btns"><button type="button" data-a="add-calc">Add Lab Calculation…</button><button type="button" data-a="reset-rows">Reset</button></div>
          <div class="as-row"><span>Temperatures in</span>${select('temp', w.units.temp, ['°C', '°F', 'K'])}</div>
          <div class="as-row"><span>Vapor pressure in</span>${select('pressure', w.units.pressure, ['kPa', 'mmHg', 'Pa', 'bar'])}</div>
          <label class="as-row as-check"><input type="checkbox" data-k="autoName"${w.autoName ? ' checked' : ''}> Name structures by themselves <span class="info-slot" data-info="The offline namer starts a few seconds after the first structure is analysed (about 14 MB, once a session). Off: no name is worked out."></span></label>
          <label class="as-row as-check"><input type="checkbox" data-k="autoPubchem"${w.autoPubchem ? ' checked' : ''}> Look up measured values on PubChem by themselves <span class="info-slot" data-info="Sends each structure analysed (as SMILES) to PubChem, the free NIH database, for its measured density, boiling and melting points, vapor pressure, flash point and refractive index. Off: only when you click Look up on PubChem."></span></label>
        </div>
        <div class="as-col">
          <h3 data-info="What the Analysis box on the Canvas ribbon shows under the formula: three lines in the full-size ribbon, one value in the Simplified ribbon. Any panel row can go here, lab calculations too.">Ribbon box</h3>
          ${[0, 1, 2].map((n) => `<div class="as-row"><span>${n ? `Line ${n + 1}` : 'Full-size ribbon, line 1'}</span>${ribbonSelect(`line${n}`, w.ribbon.lines[n])}</div>`).join('')}
          <div class="as-row"><span>Simplified ribbon</span>${ribbonSelect('simple', w.ribbon.simple)}</div>
          <h3 data-info="What Attach Descriptors puts under a structure, in this order, and the words before each value. Descriptors already in a drawing keep what they show; the Style panel changes one structure's.">Attached descriptors</h3>
          <div class="as-list" data-list="desc">${w.descriptors.map((x) => descItem(x)).join('')}</div>
        </div>
      </div>
      <p class="ask-buttons"><button type="button" data-a="cancel">Cancel</button><button type="submit" class="primary">Save</button></p>`;
    form.append(marker);
    for (const h of form.querySelectorAll<HTMLElement>('[data-info]')) {
      const text = h.dataset.info!;
      h.removeAttribute('data-info');
      if (h.classList.contains('info-slot')) { addInfo(h, text); h.classList.remove('has-info'); } else addInfo(h, text);
    }
    const cols = d.querySelector<HTMLElement>('.as-cols');
    if (cols) cols.scrollTop = at;
    preview();
  };

  const select = (k: string, v: string, opts: string[]) => `<select data-k="${k}">${opts.map((o) => `<option${o === v ? ' selected' : ''}>${o}</option>`).join('')}</select>`;
  const ribbonSelect = (k: string, v: string) => `<select data-k="${k}"><option value=""${v ? '' : ' selected'}>(empty)</option>${ribbonChoices(w).map((o) => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(nameOf(w, o))}</option>`).join('')}</select>`;
  const dpBox = (k: string, v: number) => `<input type="number" min="0" max="8" step="1" data-dp="${k}" value="${v}" title="Decimal places" aria-label="Decimal places"><span class="muted">dp</span>`;

  function rowItem(key: RowKey, on: boolean): string {
    const calc = calcOf(w, key);
    const dp = key === 'exact' || key === 'mw' || key === 'mz' || key === 'ea' ? dpBox(key, w.dp[key]) : '';
    const tag = calc ? '<span class="as-tag calc">calculation</span>' : BENCH_ROWS.includes(key) ? '<span class="as-tag">bench</span>' : '';
    const tools = calc ? `<button type="button" data-a="edit-calc" data-id="${esc(calc.id)}">Edit…</button><button type="button" data-a="del-calc" data-id="${esc(calc.id)}" title="Delete this calculation">Delete</button>` : '';
    const fixed = key === 'name';
    return `<div class="as-item" data-key="${esc(key)}"><span class="as-grip"${fixed ? ' hidden' : ' data-grip'} title="Drag to move">${GRIP}</span><input type="checkbox" data-on="${esc(key)}"${on ? ' checked' : ''} aria-label="Show ${esc(nameOf(w, key))}"><span class="as-name">${esc(nameOf(w, key))}${fixed ? ' <span class="muted">(after the formula)</span>' : ''}${tag}</span><span class="as-f">${dp}${tools}</span></div>`;
  }

  function descItem(x: AnalysisPrefs['descriptors'][number]): string {
    const plain = x.key === 'formula' || x.key === 'hrms';
    return `<div class="as-item" data-key="${esc(x.key)}"><span class="as-grip" data-grip title="Drag to move">${GRIP}</span><input type="checkbox" data-don="${esc(x.key)}"${x.on ? ' checked' : ''} aria-label="Show ${esc(nameOf(w, x.key))}"><span class="as-name">${esc(nameOf(w, x.key))}${x.key.startsWith('calc:') ? '<span class="as-tag calc">calculation</span>' : ''}</span><span class="as-f">${plain ? '' : `<input type="text" data-label="${esc(x.key)}" value="${esc(x.label)}" placeholder="${x.key.startsWith('calc:') ? esc(nameOf(w, x.key)) + ':' : ''}" title="Words before the value" aria-label="Words before the value">`}${x.dp === null || x.key.startsWith('calc:') ? '' : dpBox('d:' + x.key, x.dp)}</span></div>`;
  }

  /** Read the boxes into the working copy. */
  const read = () => {
    for (const c of form.querySelectorAll<HTMLInputElement>('input[data-on]')) { const r = w.rows.find((x) => x.key === c.dataset.on); if (r) r.on = c.checked; }
    for (const c of form.querySelectorAll<HTMLInputElement>('input[data-don]')) { const r = w.descriptors.find((x) => x.key === c.dataset.don); if (r) r.on = c.checked; }
    for (const c of form.querySelectorAll<HTMLInputElement>('input[data-label]')) { const r = w.descriptors.find((x) => x.key === c.dataset.label); if (r) r.label = c.value; }
    for (const c of form.querySelectorAll<HTMLInputElement>('input[data-dp]')) {
      const v = Math.max(0, Math.min(8, Math.round(Number(c.value) || 0)));
      const k = c.dataset.dp!;
      if (k.startsWith('d:')) { const r = w.descriptors.find((x) => x.key === k.slice(2)); if (r) r.dp = v; } else w.dp[k as keyof AnalysisPrefs['dp']] = v;
    }
    const val = (k: string) => form.querySelector<HTMLSelectElement>(`select[data-k="${k}"]`)?.value ?? '';
    w.units.temp = val('temp') as TempUnit;
    w.units.pressure = val('pressure') as PressureUnit;
    w.ribbon.lines = [val('line0'), val('line1'), val('line2')] as AnalysisPrefs['ribbon']['lines'];
    w.ribbon.simple = val('simple') as RowKey | '';
    w.autoName = !!form.querySelector<HTMLInputElement>('input[data-k="autoName"]')?.checked;
    w.autoPubchem = !!form.querySelector<HTMLInputElement>('input[data-k="autoPubchem"]')?.checked;
  };

  /** The attached descriptors as they would read under the structure last analysed. */
  const preview = () => {
    const slot = previewSlot('Attached descriptors');
    const r = host.sample();
    const html = r ? descriptorRuns(r, w.descriptors.filter((x) => x.on).map((x) => x.key), host.adduct(), w, host.bench(r)).map((run) => {
      let t = esc(run.text).replace(/\n/g, '<br>');
      if (run.formula) t = formulaHtml(run.text);
      if (run.sup) t = `<sup>${t}</sup>`;
      if (run.italic) t = `<i>${t}</i>`;
      return t;
    }).join('') : '<span class="muted">Select a structure to see its descriptors here.</span>';
    const body = `<div class="as-paper"><div class="as-cap">${html || '<span class="muted">(nothing ticked)</span>'}</div></div>`;
    if (slot) slot.innerHTML = body;
    else {
      let own = form.querySelector<HTMLElement>('.as-own-preview');
      if (!own) { own = document.createElement('div'); own.className = 'as-own-preview'; form.querySelector('.as-cols')?.after(own); }
      own.innerHTML = `<h3>Attached descriptors preview</h3>${body}`;
    }
  };

  form.addEventListener('input', () => { read(); preview(); });
  form.addEventListener('change', () => { read(); preview(); });
  form.addEventListener('pointerdown', (e) => {
    const grip = (e.target as HTMLElement).closest<HTMLElement>('[data-grip]');
    const item = grip?.closest<HTMLElement>('.as-item');
    const list = item?.closest<HTMLElement>('[data-list]');
    if (!grip || !item || !list) return;
    const items = () => [...list.querySelectorAll<HTMLElement>('.as-item')];
    dragRow(e as PointerEvent, item, items, (from, to) => {
      read();
      if (list.dataset.list === 'rows') w.rows = moved(w.rows, from, to);
      else w.descriptors = moved(w.descriptors, from, to);
      touched();
      draw();
    });
  });

  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; d.close(); d.remove(); resolve(); };
    form.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'cancel') { finish(); return; }
      read();
      if (a === 'reset-rows') { w.rows = parseAnalysisPrefs({ calcs: w.calcs }).rows; touched(); draw(); return; }
      if (a === 'del-calc') {
        const key = `calc:${b.dataset.id}`;
        w.calcs = w.calcs.filter((c) => c.id !== b.dataset.id);
        w.rows = w.rows.filter((r) => r.key !== key);
        w.descriptors = w.descriptors.filter((r) => r.key !== key);
        w.ribbon.lines = w.ribbon.lines.map((x) => (x === key ? '' : x)) as AnalysisPrefs['ribbon']['lines'];
        if (w.ribbon.simple === key) w.ribbon.simple = '';
        touched(); draw();
        return;
      }
      if (a === 'add-calc' || a === 'edit-calc') {
        const was = a === 'edit-calc' ? calcOf(w, `calc:${b.dataset.id}`) : undefined;
        const got = await askLabCalc(was ?? newCalc(nextCalcId(w)), host.sample(), host.bench, w);
        if (!got) return;
        placeCalc(w, got);
        touched(); draw();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      read();
      host.apply(w);
      finish();
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
    draw();
    showDialog(d);
    if (openAt === 'descriptors') requestAnimationFrame(() => form.querySelector('[data-list="desc"]')?.scrollIntoView({ block: 'center' }));
    openAt = 'rows';
  });
}

/** What the lab calculation window gives back: the calculation, and where it shows. */
export interface CalcChoice { calc: LabCalc; panel: boolean; ribbon: boolean; descriptors: boolean }

/** Put a calculation (new or changed) into the settings, showing where it was asked to. */
export function placeCalc(p: AnalysisPrefs, got: CalcChoice): void {
  const at = p.calcs.findIndex((c) => c.id === got.calc.id);
  if (at >= 0) p.calcs[at] = got.calc; else p.calcs.push(got.calc);
  const key = `calc:${got.calc.id}` as RowKey;
  const row = p.rows.find((x) => x.key === key);
  if (row) row.on = got.panel;
  else {
    const before = p.rows.findIndex((x) => SECTION_ROWS.includes(x.key));
    p.rows.splice(before < 0 ? p.rows.length : before, 0, { key, on: got.panel });
  }
  const desc = p.descriptors.find((x) => x.key === key);
  if (desc) desc.on = got.descriptors;
  else p.descriptors.push({ key: key as DescKey, on: got.descriptors, label: '', dp: null });
  if (got.ribbon && !p.ribbon.lines.includes(key)) {
    const free = p.ribbon.lines.indexOf('');
    p.ribbon.lines[free >= 0 ? free : 2] = key;
  }
  if (!got.ribbon) p.ribbon.lines = p.ribbon.lines.map((x) => (x === key ? '' : x)) as AnalysisPrefs['ribbon']['lines'];
}

/** Add Lab Calculation… or Edit…: an amount of what is selected, and what to show for it. */
export async function askLabCalc(c: LabCalc, sample: FragmentResult | null, bench: (r: FragmentResult) => Bench, p: AnalysisPrefs): Promise<CalcChoice | null> {
  const key = `calc:${c.id}`;
  const isNew = !p.calcs.some((x) => x.id === c.id);
  const inPanel = isNew || p.rows.some((r) => r.key === key && r.on);
  const inRibbon = p.ribbon.lines.includes(key as RowKey);
  const inDesc = p.descriptors.some((r) => r.key === key && r.on);
  const from = (v: Record<string, string>): LabCalc => ({
    id: c.id,
    name: v.name.trim(),
    amount: Math.max(0, Number(v.amount) || 0),
    unit: v.unit as CalcUnit,
    scale: Math.max(0, Number(v.scale) || 0) || 1,
    mass: v.mass === 'true',
    volume: v.volume === 'true',
    mmol: v.mmol === 'true',
    solution: v.solution.trim() && Number(v.solution) > 0 ? Number(v.solution) : null,
    sig: Math.max(1, Math.min(6, Math.round(Number(v.sig) || 3))),
  });
  const got = await ask(isNew ? 'Add Lab Calculation' : 'Lab Calculation', [
    { name: 'name', label: 'Name', value: c.name, type: 'text', placeholder: calcName(c), help: 'Shown at the start of its row. Blank: the amount, such as 0.5 mmol.' },
    { name: 'amount', label: 'Amount', value: String(c.amount), type: 'number', beside: { name: 'unit', value: c.unit, label: 'Unit', options: CALC_UNITS } },
    { name: 'scale', label: 'Reaction scale (for equiv)', value: String(c.scale), type: 'number', unit: 'mmol' },
    { name: 'mass', label: 'Show the mass', value: String(c.mass), type: 'checkbox' },
    { name: 'volume', label: 'Show the volume, neat', value: String(c.volume), type: 'checkbox', help: 'From the density: PubChem\'s measured value once looked up, else estimated (Girolami). Not shown for a solid.' },
    { name: 'mmol', label: 'Show the amount in mmol', value: String(c.mmol), type: 'checkbox', help: 'When the amount is a mass or volume, or in equiv.' },
    { name: 'solution', label: 'Volume of a solution', value: c.solution === null ? '' : String(c.solution), type: 'number', unit: 'M', placeholder: 'none' },
    { name: 'sig', label: 'Significant figures', value: String(c.sig), options: ['2', '3', '4', '5'].map((x) => ({ value: x, label: x })) },
    { name: 'h', label: 'Show in', value: '', type: 'heading' },
    { name: 'panel', label: 'Analysis panel', value: String(inPanel), type: 'checkbox' },
    { name: 'ribbon', label: 'Ribbon box', value: String(inRibbon), type: 'checkbox' },
    { name: 'descriptors', label: 'Attached descriptors', value: String(inDesc), type: 'checkbox' },
  ], {
    ok: 'Save',
    preview: {
      title: 'Preview', below: true,
      draw: (v) => {
        const el = document.createElement('p');
        el.className = 'as-calc-preview';
        if (!sample) { el.className += ' muted'; el.textContent = 'Select a structure to see the result here.'; return el; }
        const calc = from(v);
        const parts = calcParts(calc, sample, bench(sample));
        el.innerHTML = `<span class="muted">${formulaHtml(sample.formula)}:</span> <b>${esc(calcName(calc))}</b> ${parts.length ? esc(parts.join(' · ')) : '<span class="muted">— (needs a density for a volume)</span>'}`;
        return el;
      },
    },
  });
  if (!got) return null;
  return { calc: from(got), panel: got.panel === 'true', ribbon: got.ribbon === 'true', descriptors: got.descriptors === 'true' };
}
