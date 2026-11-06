// Chemistry ▸ Orbitals ▸ MO Diagram… (and Edit MO Diagram…): the orbitals in three groups laid out
// as the diagram is (the left atom's, the molecule's and the right atom's), each row a level with
// its name, energy, how many orbitals and electrons, and for a molecular orbital the atomic
// orbitals it is made from (a list of the ones the sides have). Autofill loads a teaching example
// (H₂, N₂, O₂, CO, HF…) and each atom's group fills from an atom; names and titles are rich text,
// with a bar for subscripts, superscripts, σ, π and the other symbols an MO diagram uses. Previews
// as you type.

import { foldIntoInfo } from './info-tip';
import { atomLevels, electronLook, fitWidth, MO_ATOMS, setElectrons, MO_PRESETS, moPlain, parseMarkup, toMarkup, toRich, type MoColumn, type MoLevel, type MoSpec } from '../design/mo';
import { ORBITAL_LOOK_NAMES, type OrbitalLook } from '../chem/orbitals';
import { RichField } from './rich-field';
import { newPlate, type PlateData } from '../design/plates';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), props);

/** The symbols an MO diagram uses, behind the Ω button (σ, π and * have their own buttons). */
const MO_SYMBOLS: [string, string][] = [
  ['δ', 'delta'], ['φ', 'phi'], ['ψ', 'psi'], ['χ', 'chi'], ['Φ', 'capital phi'], ['Ψ', 'capital psi'], ['α', 'alpha'], ['β', 'beta'], ['ε', 'epsilon'], ['Δ', 'Delta (splitting)'],
  ['′', 'prime'], ['″', 'double prime'], ['±', 'plus or minus'], ['−', 'minus'], ['+', 'plus'], ['·', 'middle dot'], ['↑', 'spin up'], ['↓', 'spin down'], ['–', 'en dash'], ['ℓ', 'script l'],
];

const COLUMNS: { col: MoColumn; name: string }[] = [{ col: 'left', name: 'Left atom' }, { col: 'middle', name: 'Molecule' }, { col: 'right', name: 'Right atom' }];

export function askMo(editing: PlateData | null, style: { bondLength: number; captionSize: number; lineWidth: number }, preview?: (d: PlateData, canvas: HTMLCanvasElement) => void, roomAt?: (d: PlateData, w: number) => number | undefined): Promise<PlateData | null> {
  return new Promise((resolve) => {
    const base = editing ?? newPlate('mo', style.bondLength);
    const start = base.mo ? toRich(base.mo) : null;
    const d = el('dialog', { className: 'ask plate-dialog mo-dialog' });
    d.setAttribute('aria-label', 'MO diagram');
    const form = el('form', { method: 'dialog' });
    const looks = ORBITAL_LOOK_NAMES.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
    form.innerHTML = `<h2>${editing ? 'Edit MO Diagram' : 'MO Diagram'}</h2>
      <label class="ask-row"><span>Autofill</span><select name="preset">${editing ? '<option value="">Choose an example…</option>' : ''}${MO_PRESETS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
      <canvas class="plate-preview" aria-label="Preview" role="img"></canvas>
      <div class="mo-bar" role="toolbar" aria-label="Text formatting">
        <button type="button" class="mo-fmt" data-fmt="sub" title="Subscript (Ctrl+=)" aria-label="Subscript">X<sub>2</sub></button><button type="button" class="mo-fmt" data-fmt="sup" title="Superscript (Ctrl+Shift+=)" aria-label="Superscript">X<sup>2</sup></button><span class="mo-bar-gap"></span><button type="button" class="mo-fmt" data-sym="σ" title="Insert σ (sigma)">σ</button><button type="button" class="mo-fmt" data-sym="π" title="Insert π (pi)">π</button><button type="button" class="mo-fmt" data-sym="*" title="Insert * (antibonding)">*</button><span class="mo-more-wrap"><button type="button" class="mo-fmt mo-more" title="Symbol… (other letters and signs used on MO diagrams)" aria-label="Symbol" aria-haspopup="true" aria-expanded="false">Ω ▾</button><div class="mo-symbols" role="group" aria-label="Symbols" hidden></div></span>
      </div>
      <div class="mo-groups">${COLUMNS.map(({ col, name }) => `
        <section class="mo-group" data-col="${col}">
          <div class="mo-group-head"><span class="mo-group-name">${name}</span><span class="mo-title" data-col="${col}"></span>${col === 'middle' ? '' : `<select class="mo-atom" aria-label="Fill ${name.toLowerCase()} from an atom"><option value="">Atom…</option>${MO_ATOMS.map((a) => `<option value="${a.id}">${a.name}</option>`).join('')}</select>`}</div>
          <div class="mo-table-wrap"><table class="plate-table mo-table"><thead><tr><th>Name</th><th title="Sets the order and spacing only">Energy</th><th title="Degenerate orbitals at this level">Orbitals</th><th>Electrons</th>${col === 'middle' ? '<th title="The atomic orbitals it is made from, joined to it by dashed lines">Made from</th>' : ''}<th></th></tr></thead><tbody></tbody></table></div>
          <button type="button" class="mo-add" data-col="${col}">+ Orbital</button>
        </section>`).join('')}
      </div>
      <p class="muted small mo-help">Electrons fill by Hund's rule (one per orbital, then pairs). Energies set only the order and spacing, so any order can be typed, as when s–p mixing puts π below σ2p. Atom fills use approximate orbital potential energies in eV.</p>
      <div class="ask-row"><span>Size</span><span class="mo-inline"><span class="energy-pair"><input name="w" type="number" min="40" step="any" aria-label="Width" /> × <input name="h" type="number" min="40" step="any" aria-label="Height" /> pt</span><button type="button" data-act="fit" title="Fit Width: make the diagram just wide enough to leave a gap between the molecule's orbitals (with their names and pictures) and each atom's">Fit Width</button></span></div>
      <div class="ask-row"><span>Electron arrows</span><span class="mo-inline"><label>Height <input name="arrow" type="number" min="2" max="48" step="any" class="mo-num" /> pt</label><label>Line width <input name="arrowW" type="number" min="0.1" max="6" step="any" class="mo-num" /> pt</label><label>Gap above line <input name="arrowGap" type="number" min="0" max="24" step="any" class="mo-num" /> pt</label></span></div>
      <div class="ask-row"><span>Dashed lines</span><span class="mo-inline"><label>Color <input name="lineColor" type="color" value="#000000" /></label><label>Transparency <input name="lineClear" type="number" min="0" max="90" step="5" class="mo-num" /> %</label></span></div>
      <div class="ask-row"><span>Names</span><span class="mo-inline"><label class="mo-check"><input name="labelBack" type="checkbox" /> White background</label><label class="mo-check"><input name="labelClear" type="checkbox" /> Move clear of the dashed lines</label></span></div>
      <div class="ask-row"><span>Show</span><span class="mo-inline"><label class="mo-check"><input name="axis" type="checkbox" /> Energy arrow</label><label class="mo-check"><input name="pictures" type="checkbox" /> Orbital mixing pictures</label><select name="look" aria-label="Picture look">${looks}</select><label>Size <input name="picSize" type="number" min="20" max="400" step="any" class="mo-num" /> %</label></span></div>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Insert'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    foldIntoInfo($('.mo-help'), $('h2'));
    const num = (t: string, dflt: number) => { const v = parseFloat(t.replace(/[−–]/g, '-').replace(',', '.')); return Number.isFinite(v) ? v : dflt; };

    // ---- rich text: each row's name and the three titles; the bar works on the one being typed in
    let active: RichField | null = null;
    const bar = $<HTMLElement>('.mo-bar'), grid = $<HTMLElement>('.mo-symbols'), more = $<HTMLButtonElement>('.mo-more');
    const typing = () => (active && document.activeElement === active.el ? active : null);
    const showState = () => {
      const r = typing();
      for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-fmt], [data-sym], .mo-symbols button')) b.disabled = !r;
      bar.querySelector('[data-fmt=sub]')!.setAttribute('aria-pressed', String(!!r?.state('sub')));
      bar.querySelector('[data-fmt=sup]')!.setAttribute('aria-pressed', String(!!r?.state('sup')));
    };
    const rich = (markup: string, label: string, placeholder = '', onDone?: () => void) => {
      const f: RichField = new RichField(parseMarkup(markup), { label, placeholder, chem: () => false, done: () => { onDone?.(); redraw(); }, onState: (x) => { if (x === active) showState(); } });
      f.el.classList.add('mo-rich');
      f.el.addEventListener('focus', () => { active = f; showState(); });
      f.el.addEventListener('blur', () => setTimeout(showState));
      return f;
    };
    const markupOf = (f: RichField) => toMarkup(f.parts()).trim();
    // pressing a button keeps the caret where it is
    bar.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('button')) e.preventDefault(); });
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-fmt]')) b.addEventListener('click', () => { typing()?.toggle(b.dataset.fmt as 'sub' | 'sup'); showState(); });
    const insertSym = (c: string) => { const r = typing(); if (r) { r.insert(c); redraw(); } };
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-sym]')) b.addEventListener('click', () => insertSym(b.dataset.sym!));
    for (const [c, name] of MO_SYMBOLS) {
      const b = el('button', { type: 'button', className: 'mo-fmt', textContent: c, title: `Insert ${c} (${name})` });
      b.addEventListener('click', () => insertSym(c));
      grid.append(b);
    }
    const popup = (open: boolean) => { grid.hidden = !open; more.setAttribute('aria-expanded', String(open)); more.setAttribute('aria-pressed', String(open)); };
    more.addEventListener('click', () => popup(grid.hidden));
    d.addEventListener('pointerdown', (e) => { if (!grid.hidden && !(e.target as HTMLElement).closest('.mo-more-wrap')) popup(false); });
    const titles = new Map<MoColumn, RichField>(COLUMNS.map(({ col, name }, i) => [col, rich(start?.titles[i] ?? '', `${name} title`, 'Title')]));
    for (const [col, f] of titles) form.querySelector(`.mo-title[data-col=${col}]`)!.append(f.el);

    // ---- the three groups of rows
    let levels: MoLevel[] = (start?.levels ?? []).map((l) => ({ ...l }));
    const bodies = new Map<MoColumn, HTMLTableSectionElement>(COLUMNS.map(({ col }) => [col, form.querySelector<HTMLTableElement>(`.mo-group[data-col=${col}] table`)!.tBodies[0]]));
    const names = new Map<HTMLTableRowElement, RichField>();
    /** The "Made from" choices: a name both sides have, a pair of different names, or one side's alone. */
    const fromChoices = (): { value: string; text: string }[] => {
      const side = (c: MoColumn) => [...new Set(levels.filter((l) => l.column === c).map((l) => moPlain(l.label)).filter(Boolean))];
      const ls = side('left'), rs = side('right');
      const out = [{ value: '', text: '—' }];
      for (const n of ls) if (rs.includes(n)) out.push({ value: `both|${n}`, text: n });
      for (const a of ls) for (const b of rs) if (a !== b) out.push({ value: `pair|${a}|${b}`, text: `${a} + ${b}` });
      for (const n of ls) out.push({ value: `left|${n}`, text: `${n} (left only)` });
      for (const n of rs) out.push({ value: `right|${n}`, text: `${n} (right only)` });
      return out;
    };
    const fromValue = (l: MoLevel): string => {
      const parts = (l.from ?? '').split(',').map((x) => moPlain(x)).filter(Boolean);
      if (!parts.length) return '';
      if (l.fromSide) return `${l.fromSide}|${parts[0]}`;
      return parts.length === 1 ? `both|${parts[0]}` : `pair|${parts[0]}|${parts[1]}`;
    };
    const fromOf = (v: string): Pick<MoLevel, 'from' | 'fromSide'> => {
      const [kind, a, b] = v.split('|');
      if (!kind || !a) return {};
      if (kind === 'pair') return { from: `${a}, ${b}` };
      return kind === 'both' ? { from: a } : { from: a, fromSide: kind as 'left' | 'right' };
    };
    const read = () => {
      levels = COLUMNS.flatMap(({ col }) => [...bodies.get(col)!.rows].map((tr): MoLevel => {
        const q = (k: string) => tr.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-k=${k}]`)?.value ?? '';
        return {
          column: col, label: markupOf(names.get(tr)!), e: num(q('e'), 0), n: Math.max(1, Math.min(5, Math.round(num(q('n'), 1)))),
          electrons: Math.max(0, Math.round(num(q('electrons'), 0))), ...(col === 'middle' ? fromOf(q('from')) : {}),
        };
      }));
    };
    /** Put the "Made from" choices in each molecular orbital's list (after an atomic orbital's name changes). */
    const refreshFrom = () => {
      read();
      const choices = fromChoices();
      [...bodies.get('middle')!.rows].forEach((tr, i) => {
        const sel = tr.querySelector<HTMLSelectElement>('[data-k=from]')!;
        const l = levels.filter((x) => x.column === 'middle')[i];
        const want = fromValue(l);
        sel.innerHTML = '';
        for (const c of choices) sel.add(new Option(c.text, c.value));
        // a name no longer on a side is kept, so nothing is lost while typing
        if (want && !choices.some((c) => c.value === want)) sel.add(new Option(`${(l.from ?? '').replace(',', ' +')} (not found)`, want));
        sel.value = want;
      });
    };
    const draw = () => {
      names.clear();
      active = null;
      const choices = fromChoices();
      for (const { col } of COLUMNS) {
        const body = bodies.get(col)!;
        body.innerHTML = '';
        levels.filter((l) => l.column === col).forEach((l, i) => {
          const tr = body.insertRow();
          const input = (k: string, value: string, label: string) => { const x = el('input', { value, className: 'mo-num' }); x.dataset.k = k; x.setAttribute('aria-label', `${label} ${i + 1}`); return x; };
          const name = rich(l.label, `Name ${i + 1}`, '', col === 'middle' ? undefined : refreshFrom);
          names.set(tr, name);
          tr.insertCell().append(name.el);
          tr.insertCell().append(input('e', String(l.e), 'Energy'));
          tr.insertCell().append(input('n', String(l.n), 'Orbitals'));
          tr.insertCell().append(input('electrons', String(l.electrons), 'Electrons'));
          if (col === 'middle') {
            const sel = el('select');
            sel.dataset.k = 'from';
            sel.setAttribute('aria-label', `Made from ${i + 1}`);
            for (const c of choices) sel.add(new Option(c.text, c.value));
            const want = fromValue(l);
            if (want && !choices.some((c) => c.value === want)) sel.add(new Option(`${(l.from ?? '').replace(',', ' +')} (not found)`, want));
            sel.value = want;
            tr.insertCell().append(sel);
          }
          const del = el('button', { type: 'button', textContent: '×', title: 'Delete this orbital', className: 'mo-del' });
          del.addEventListener('click', () => { read(); levels.splice(levels.indexOf(levels.filter((x) => x.column === col)[i]), 1); draw(); redraw(); });
          tr.insertCell().append(del);
        });
      }
      showState();
    };
    const load = (spec: MoSpec) => {
      const r = toRich(spec);
      levels = r.levels.map((l) => ({ ...l }));
      COLUMNS.forEach(({ col }, i) => titles.get(col)!.setParts(parseMarkup(r.titles[i] ?? '')));
      $<HTMLInputElement>('input[name=axis]').checked = r.axis;
      draw();
    };
    if (start) load(start);
    else draw();
    const set = (q: string, v: string) => { $<HTMLInputElement>(q).value = v; };
    set('input[name=w]', String(Math.round(base.w)));
    set('input[name=h]', String(Math.round(base.h)));
    // the electrons: what they draw as at this size; typing in one fixes all three, and from then
    // on they grow and shrink with the diagram from the size it had then
    let electronsSet = false;
    const r1 = (x: number) => String(Math.round(x * 10) / 10);
    const showElectrons = () => {
      if (electronsSet) return;
      const now = electronLook(start ?? { levels: [], titles: ['', '', ''], axis: false }, style, Number($<HTMLInputElement>('input[name=w]').value) || base.w, Number($<HTMLInputElement>('input[name=h]').value) || base.h);
      set('input[name=arrow]', r1(now.tall));
      set('input[name=arrowW]', r1(now.thick));
      set('input[name=arrowGap]', r1(now.lift));
    };
    showElectrons();
    for (const k of ['arrow', 'arrowW', 'arrowGap']) $(`input[name=${k}]`).addEventListener('input', () => { electronsSet = true; });
    for (const k of ['w', 'h']) $(`input[name=${k}]`).addEventListener('input', showElectrons);
    set('input[name=lineColor]', start?.lineColor ?? '#000000');
    set('input[name=lineClear]', String(Math.round((start?.lineTransparency ?? 0) * 100)));
    $<HTMLInputElement>('input[name=labelBack]').checked = !!start?.labelBack;
    set('input[name=picSize]', String(Math.round((start?.pictureSize ?? 1) * 100)));
    $<HTMLInputElement>('input[name=labelClear]').checked = !!start?.labelClear;
    $<HTMLInputElement>('input[name=pictures]').checked = !!start?.pictures;
    set('select[name=look]', start?.pictureLook ?? 'shaded');

    const presetSel = $<HTMLSelectElement>('select[name=preset]');
    presetSel.addEventListener('change', () => {
      const p = MO_PRESETS.find((x) => x.id === presetSel.value);
      if (p) load(p.spec);
    });
    for (const sel of form.querySelectorAll<HTMLSelectElement>('.mo-atom')) {
      sel.addEventListener('change', () => {
        const a = MO_ATOMS.find((x) => x.id === sel.value);
        const col = sel.closest<HTMLElement>('.mo-group')!.dataset.col as 'left' | 'right';
        sel.value = '';
        if (!a) return;
        read();
        levels = [...levels.filter((l) => l.column !== col), ...atomLevels(a, col)];
        titles.get(col)!.setParts([{ text: a.symbol }]);
        draw();
        redraw();
      });
    }
    const fit = $<HTMLButtonElement>('[data-act=fit]');
    fit.hidden = !roomAt;
    fit.addEventListener('click', () => {
      if (!roomAt) return;
      const d = gather();
      // the gap the C–F example has at its usual size, about 1.7 bond lengths, between the molecule's column and each atom's levels
      const w = fitWidth((x) => roomAt(d, x), d.w, 1.7 * style.bondLength);
      set('input[name=w]', String(w));
      showElectrons();
      redraw();
    });
    for (const b of form.querySelectorAll<HTMLButtonElement>('.mo-add')) {
      b.addEventListener('click', () => { read(); levels.push({ column: b.dataset.col as MoColumn, label: '', e: 0, n: 1, electrons: 0 }); draw(); });
    }

    d.append(form);
    document.body.append(d);
    const finish = (v: PlateData | null) => { d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', (e) => { if (!grid.hidden) { e.preventDefault(); popup(false); return; } finish(null); });
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    const gather = (): PlateData => {
      read();
      const n = (q: string) => { const v = $<HTMLInputElement>(q).value.trim(); const x = Number(v); return v !== '' && Number.isFinite(x) ? x : undefined; };
      const arrow = n('input[name=arrow]'), arrowW = n('input[name=arrowW]'), arrowGap = n('input[name=arrowGap]');
      const clear = Math.max(0, Math.min(90, n('input[name=lineClear]') ?? 0)) / 100;
      const color = $<HTMLInputElement>('input[name=lineColor]').value.toLowerCase();
      const back = $<HTMLInputElement>('input[name=labelBack]').checked;
      const picSize = Math.max(20, Math.min(400, n('input[name=picSize]') ?? 100)) / 100;
      const w = Math.max(40, n('input[name=w]') ?? base.w), h = Math.max(40, n('input[name=h]') ?? base.h);
      /** The electron settings: kept as they were unless typed in here (then fixed at this size). */
      const electrons = (): Pick<MoSpec, 'arrowSize' | 'arrowWidth' | 'arrowGap' | 'arrowAt'> => {
        if (!electronsSet) return start ? { arrowSize: start.arrowSize, arrowWidth: start.arrowWidth, arrowGap: start.arrowGap, arrowAt: start.arrowAt } : {};
        const now = electronLook(start ?? { levels: [], titles: ['', '', ''], axis: false }, style, w, h);
        const fixed = setElectrons({ levels: [], titles: ['', '', ''], axis: false }, {
          tall: arrow && arrow > 0 ? Math.min(48, Math.max(2, arrow)) : now.tall,
          thick: arrowW && arrowW > 0 ? Math.min(6, arrowW) : now.thick,
          lift: arrowGap !== undefined && arrowGap >= 0 ? Math.min(24, arrowGap) : now.lift,
        }, w, h);
        return { arrowSize: fixed.arrowSize, arrowWidth: fixed.arrowWidth, arrowGap: fixed.arrowGap, arrowAt: fixed.arrowAt };
      };
      return {
        ...base,
        w, h,
        mo: {
          levels: levels.map((l) => ({ ...l, electrons: Math.min(l.electrons, 2 * l.n) })),
          titles: COLUMNS.map(({ col }) => markupOf(titles.get(col)!)) as [string, string, string],
          axis: $<HTMLInputElement>('input[name=axis]').checked, rich: true,
          ...electrons(),
          ...(color && color !== '#000000' ? { lineColor: color } : {}),
          ...(clear ? { lineTransparency: clear } : {}),
          ...(back ? { labelBack: 'white' as const } : {}),
          ...(picSize !== 1 ? { pictureSize: picSize } : {}),
          ...($<HTMLInputElement>('input[name=labelClear]').checked ? { labelClear: true } : {}),
          ...($<HTMLInputElement>('input[name=pictures]').checked ? { pictures: true } : {}),
          pictureLook: $<HTMLSelectElement>('select[name=look]').value as OrbitalLook,
        },
      };
    };
    const canvas = $<HTMLCanvasElement>('.plate-preview');
    canvas.hidden = !preview;
    let timer: ReturnType<typeof setTimeout> | null = null;
    function redraw(): void {
      if (!preview) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; try { preview(gather(), canvas); } catch { /* half-typed */ } }, 120);
    }
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
