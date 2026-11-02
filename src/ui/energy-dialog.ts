// Insert ▸ Energy Diagram… (and Edit Energy Diagram…): a table with a row for each species
// along the reaction coordinate and a pair of columns (name, energy) for each pathway, then how
// the diagram looks. Names take _ and ^ for sub- and superscripts (TS1^‡ or just TS1‡).

import { bracketText, largestBarrier, ENERGY_DEFAULTS, ENERGY_PRESETS, PATH_COLOURS, type EnergyBracket, type EnergyDash, type EnergyData, type EnergyPath, type EnergyPoint } from '../design/energy';
import { HARTREE, pickEnergy, readQmOutput, speciesName, type QmAtom, type QmResult } from '../chem/qm-output';
import { qmBonds, skeletonMolfile } from '../chem/qm-bonds';
import type { Contents } from '../model';
import { popupMenu } from './popup-menu';

/** How the last diagram looked, so a new one starts the same way. */
let lastLook: Pick<EnergyData, 'style' | 'values' | 'digits' | 'axis' | 'barrier' | 'overall' | 'quantity' | 'unit'> = { ...ENERGY_DEFAULTS, quantity: 'ΔG', unit: 'kcal/mol' };

/** A cell of the table: what is typed, and what came from a Gaussian or ORCA file. */
interface Cell { label: string; g: string; eh?: number; geom?: QmAtom[]; ehs?: EnergyPoint['ehs']; flat?: EnergyPoint['flat']; drawn?: Contents }

/** Drawing a species' structure from the window: in the drawing area, from the clipboard, from a name or SMILES, and a small picture of one. */
export interface EnergyStructureHooks {
  /** Draw or edit it in the drawing area (the window waits); null when cancelled. */
  edit(contents: Contents | null, title: string): Promise<Contents | null>;
  /** The structure on the clipboard, or a reason there is none. */
  paste(): Promise<Contents | { error: string }>;
  /** A structure from a name, SMILES or CAS number, or a reason it could not be read. */
  fromText(text: string): Promise<Contents | { error: string }>;
  /** Paint a small picture of it. */
  thumb(contents: Contents, canvas: HTMLCanvasElement): void;
}

/** Which of a file's energies an axis quantity uses: free energy for ΔG, enthalpy for ΔH, else the electronic energy. */
export function energyKind(quantity: string): 'G' | 'H' | 'E' {
  return /^ΔG/.test(quantity) ? 'G' : /^ΔH/.test(quantity) ? 'H' : 'E';
}

const dashOf = (v: string): { dash?: EnergyDash } => (v === 'solid' || v === 'dashed' || v === 'dotted' ? { dash: v } : {});

/** The 2-D layout of a geometry's drawn atoms, by the chemistry engine (null: it could not). */
export type LayoutFn = (molblock: string) => Promise<[number, number][] | null>;

/** A geometry's 2-D layout, one entry per atom (null where an atom is left out of the drawing). */
export async function flatFor(geom: QmAtom[], label: string, layout: LayoutFn): Promise<([number, number] | null)[] | null> {
  const bonds = qmBonds(geom, /‡/.test(label));
  const { molblock, index } = skeletonMolfile(geom, bonds);
  const xy = await layout(molblock).catch(() => null);
  if (!xy || xy.length !== index.length) return null;
  const out: ([number, number] | null)[] = geom.map(() => null);
  index.forEach((k, n) => { out[k] = [Math.round(xy[n][0] * 1000) / 1000, Math.round(xy[n][1] * 1000) / 1000]; });
  return out;
}

/** Ask for a diagram: a new one (from a preset), or `editing` with its numbers to change. */
export function askEnergy(editing: EnergyData | null, size: { w: number; h: number }, preview?: (d: EnergyData, canvas: HTMLCanvasElement) => void, layout?: LayoutFn, structure?: EnergyStructureHooks): Promise<EnergyData | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask energy-dialog';
    d.setAttribute('aria-label', 'Energy diagram');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = `<h2>${editing ? 'Edit Energy Diagram' : 'Energy Diagram'}</h2>
      <label class="ask-row"${editing ? ' hidden' : ''}><span>Start from</span><select name="preset"></select></label>
      <p class="muted energy-blurb"${editing ? ' hidden' : ''}></p>
      <canvas class="energy-preview" aria-label="Preview of the diagram" role="img"></canvas>
      <div class="energy-table-wrap"><table class="energy-table"><thead></thead><tbody></tbody></table></div>
      <p class="energy-rows"><button type="button" data-act="row" title="Another species along the reaction coordinate">+ Species</button>
        <button type="button" data-act="path" title="Another pathway drawn on the same diagram, in its own colour">+ Pathway</button>
        <button type="button" data-act="ddagger" title="Put a double dagger (‡) at the end of the species name you were last in, for a transition state">‡</button>
        <button type="button" data-act="import" title="Read energies, transition states, the level of theory and geometries from Gaussian or ORCA output files, into the pathway you were last in">Import Gaussian/ORCA…</button>
        <input type="file" name="qm" multiple accept=".log,.out,.txt" hidden /></p>
      <p class="muted small energy-import-note" hidden></p>
      <p class="muted small">Leave an energy empty where a pathway has nothing (so a one-step route can sit beside a two-step one). Name transition states with ‡ (TS1‡): the ‡ button adds one to the name box you were last in.</p>
      <div class="energy-brackets"><span class="energy-brackets-title">Brackets</span><ul class="energy-bracket-list"></ul>
        <button type="button" data-act="bracket" title="A double arrow between any two species, labelled with the change (ΔG‡ up to a transition state, else ΔG)">+ Bracket</button></div>
      <label class="ask-row"><span>Axis</span><span class="energy-pair"><select name="quantity" title="With energies read from files: ΔG uses the free energies, ΔH the enthalpies, E and ΔE the electronic energies"><option>ΔG</option><option>ΔG°</option><option>ΔH</option><option>E</option><option>ΔE</option></select>
        <select name="unit"><option>kcal/mol</option><option>kJ/mol</option><option>eV</option></select></span></label>
      <label class="ask-row"><span>Joined by</span><select name="style"><option value="levels">Levels and dashed lines</option><option value="curve">A smooth curve</option></select></label>
      <label class="ask-row"><span>Decimal places</span><span class="energy-pair"><input name="digits" type="number" min="0" max="3" /></span></label>
      <label class="ask-row"><span>Size</span><span class="energy-pair"><input name="w" type="number" min="60" step="any" aria-label="Width" /> × <input name="h" type="number" min="40" step="any" aria-label="Height" /> pt</span></label>
      <label class="ask-row ask-check"><input name="values" type="checkbox" /><span>Show the energies</span></label>
      <label class="ask-row ask-check"><input name="axis" type="checkbox" /><span>Axis with its title, and "Reaction coordinate" along the bottom</span></label>
      <label class="ask-row ask-check"><input name="barrier" type="checkbox" /><span>Mark the largest barrier on each pathway (ΔG‡)</span></label>
      <label class="ask-row ask-check"><input name="overall" type="checkbox" /><span>Mark the overall change on each pathway (ΔG), first species to last</span></label>
      <label class="ask-row"><span>File geometries</span><select name="structures" title="The geometries read from Gaussian or ORCA files, beside their levels (structures drawn in the Structure column always show)"><option value="">None</option><option value="3d">3-D, balls and sticks</option><option value="2d">2-D structures</option></select></label>
      <label class="ask-row"><span>Place structures</span><select name="place"><option value="above">Above each level</option><option value="auto">Above peaks, below valleys</option><option value="below">Below each level</option></select></label>
      <label class="ask-row ask-check"><input name="distances" type="checkbox" /><span>Bond distances on transition states (the bonds being made and broken, Å)</span></label>
      <label class="ask-row"><span>Level of theory</span><input name="theory" placeholder="e.g. B3LYP-D3(BJ)/def2-TZVP, SMD(THF)" /></label>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Insert'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const table = $<HTMLTableElement>('.energy-table');
    let paths: { name: string; color: string; dash?: EnergyDash }[] = [];
    let brackets: EnergyBracket[] = editing?.brackets ? editing.brackets.map((b) => ({ ...b })) : [];
    let rows: Cell[][] = [];

    /** Read what is typed back into paths and rows (before the table is redrawn). */
    const read = () => {
      paths = paths.map((p, j) => ({
        name: table.querySelector<HTMLInputElement>(`thead input[data-p="${j}"]`)?.value ?? p.name,
        color: table.querySelector<HTMLInputElement>(`thead input[data-c="${j}"]`)?.value ?? p.color,
        ...dashOf(table.querySelector<HTMLSelectElement>(`thead select[data-d="${j}"]`)?.value ?? p.dash ?? ''),
      }));
      rows = [...table.tBodies[0].rows].map((tr, i) => paths.map((_, j) => {
        const gi = tr.querySelector<HTMLInputElement>(`input[data-g="${j}"]`);
        const was = rows[i]?.[j];
        const cell: Cell = { label: tr.querySelector<HTMLInputElement>(`input[data-l="${j}"]`)?.value ?? '', g: gi?.value ?? '' };
        if (was?.geom) cell.geom = was.geom;
        if (was?.ehs) cell.ehs = was.ehs;
        if (was?.flat) cell.flat = was.flat;
        if (was?.drawn) cell.drawn = was.drawn;
        // an energy typed over is the one wanted, not the file's
        if (was?.eh !== undefined && gi && gi.value === gi.dataset.v) cell.eh = was.eh;
        return cell;
      }));
    };
    /** A species' Structure cell: a picture of its structure (or + Draw), with a menu to draw, paste, name, use the file's or remove it. */
    const structureCell = (i: number, j: number): HTMLButtonElement => {
      const c = rows[i]?.[j];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'energy-structure';
      const who = c?.label || `species ${i + 1}`;
      if (c?.drawn?.atoms.length) {
        const pic = document.createElement('canvas');
        pic.width = 72; pic.height = 36;
        b.append(pic);
        requestAnimationFrame(() => structure!.thumb(c.drawn!, pic));
        b.title = `The structure drawn for ${who}: click to edit, paste over or remove it`;
        b.setAttribute('aria-label', `Structure for ${who}`);
      } else if (c?.geom?.length) {
        b.textContent = 'from file';
        b.classList.add('es-file');
        b.title = `${who} has the geometry read from its file: click to draw a structure in its place`;
      } else {
        b.textContent = '+ Draw';
        b.classList.add('es-empty');
        b.title = `Draw a structure for ${who}, shown by its level`;
      }
      const set = (drawn: Contents | null) => {
        read();
        const cell = rows[i]?.[j];
        if (!cell) return;
        if (drawn && drawn.atoms.length) cell.drawn = drawn; else delete cell.drawn;
        draw();
        redraw();
      };
      const note = (text: string) => { const n = $<HTMLParagraphElement>('.energy-import-note'); n.hidden = false; n.textContent = text; };
      const editIt = async () => {
        read();
        d.close();
        const got = await structure!.edit(rows[i]?.[j]?.drawn ?? null, `Structure for ${who} (Energy Diagram)`);
        d.showModal();
        if (got) set(got);
      };
      b.addEventListener('click', () => {
        const has = !!rows[i]?.[j]?.drawn;
        if (!has && !rows[i]?.[j]?.geom) { void editIt(); return; }
        const r = b.getBoundingClientRect();
        popupMenu(r.left, r.bottom + 2, [
          [has ? 'Edit Structure…' : 'Draw Structure…', () => void editIt()],
          ['Paste Structure', async () => { const got = await structure!.paste(); if ('error' in got) note(got.error); else set(got); }],
          ['From Name or SMILES…', async () => {
            const text = prompt(`A name, SMILES or CAS number for ${who}`)?.trim();
            if (!text) return;
            const got = await structure!.fromText(text);
            if ('error' in got) note(got.error); else set(got);
          }],
          ...(rows[i]?.[j]?.geom ? [['Use the File\'s Geometry', () => set(null), has] as [string, () => void, boolean]] : []),
          null,
          ['Remove Structure', () => { read(); const cell = rows[i]?.[j]; if (cell) { delete cell.drawn; delete cell.geom; delete cell.flat; } draw(); redraw(); }, has || !!rows[i]?.[j]?.geom],
        ]);
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); b.click(); });
      return b;
    };
    const draw = () => {
      const head = table.tHead!;
      head.innerHTML = '';
      const tr1 = head.insertRow(), tr2 = head.insertRow();
      tr1.append(document.createElement('th'));
      tr2.append(document.createElement('th'));
      paths.forEach((p, j) => {
        const th = document.createElement('th');
        th.colSpan = structure ? 3 : 2;
        const name = Object.assign(document.createElement('input'), { value: p.name, placeholder: paths.length > 1 ? `pathway ${j + 1}` : 'pathway (optional)' });
        name.dataset.p = String(j);
        name.setAttribute('aria-label', `Pathway ${j + 1} name`);
        const col = Object.assign(document.createElement('input'), { type: 'color', value: p.color });
        col.dataset.c = String(j);
        col.setAttribute('aria-label', `Pathway ${j + 1} colour`);
        const dash = document.createElement('select');
        dash.dataset.d = String(j);
        dash.setAttribute('aria-label', `Pathway ${j + 1} line style`);
        dash.title = 'How its species are joined';
        for (const [v, t] of [['', 'Usual lines'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]) dash.append(new Option(t, v));
        dash.value = p.dash ?? '';
        th.append(name, col, dash);
        if (paths.length > 1) {
          const del = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: 'Take out this pathway' });
          del.addEventListener('click', () => {
            read(); paths.splice(j, 1); for (const r of rows) r.splice(j, 1);
            brackets = brackets.filter((b) => b.path !== j).map((b) => (b.path > j ? { ...b, path: b.path - 1 } : b));
            draw();
          });
          th.append(del);
        }
        tr1.append(th);
        for (const t of structure ? ['Species', 'Energy', 'Structure'] : ['Species', 'Energy']) tr2.append(Object.assign(document.createElement('th'), { textContent: t }));
      });
      const body = table.tBodies[0];
      body.innerHTML = '';
      rows.forEach((r, i) => {
        const tr = body.insertRow();
        // dragged by its handle to another place along the reaction coordinate
        const grip = Object.assign(document.createElement('span'), { textContent: '⋮⋮', title: 'Drag to move this species along the reaction coordinate', className: 'energy-grip' });
        tr.insertCell().append(grip);
        grip.draggable = true;
        grip.addEventListener('dragstart', (e) => { dragFrom = i; e.dataTransfer?.setData('text/plain', String(i)); });
        tr.addEventListener('dragover', (e) => { if (dragFrom !== null) e.preventDefault(); });
        tr.addEventListener('drop', (e) => {
          e.preventDefault();
          if (dragFrom === null || dragFrom === i) return;
          read();
          const [moved] = rows.splice(dragFrom, 1);
          rows.splice(i, 0, moved);
          // brackets follow their species
          const was = Array.from({ length: rows.length }, (_, k) => k);
          const [w] = was.splice(dragFrom, 1);
          was.splice(i, 0, w);
          brackets = brackets.map((b) => ({ ...b, from: was.indexOf(b.from), to: was.indexOf(b.to) }));
          dragFrom = null;
          draw();
          redraw();
        });
        paths.forEach((_, j) => {
          const l = Object.assign(document.createElement('input'), { value: r[j]?.label ?? '' });
          l.dataset.l = String(j);
          l.setAttribute('aria-label', `Species ${i + 1}, pathway ${j + 1}`);
          const g = Object.assign(document.createElement('input'), { value: r[j]?.g ?? '', inputMode: 'decimal' });
          g.dataset.g = String(j);
          g.dataset.v = g.value;
          g.className = 'energy-num';
          if (r[j]?.eh !== undefined) g.title = `${r[j].eh!.toFixed(6)} hartree, from the file`;
          g.setAttribute('aria-label', `Energy ${i + 1}, pathway ${j + 1}`);
          tr.insertCell().append(l);
          tr.insertCell().append(g);
          if (structure) tr.insertCell().append(structureCell(i, j));
        });
        const del = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: 'Take out this species' });
        del.addEventListener('click', () => {
          read();
          if (rows.length <= 2) return;
          rows.splice(i, 1);
          brackets = brackets.filter((b) => b.from !== i && b.to !== i).map((b) => ({ ...b, from: b.from > i ? b.from - 1 : b.from, to: b.to > i ? b.to - 1 : b.to }));
          draw();
        });
        tr.insertCell().append(del);
      });
      drawBrackets();
    };
    /** The brackets' rows: pathway, from, to, what it will say. */
    const bracketList = $<HTMLUListElement>('.energy-bracket-list');
    const drawBrackets = () => {
      bracketList.innerHTML = '';
      const name = (k: number, j: number) => rows[k]?.[j]?.label || rows[k]?.find((c) => c.label)?.label || `species ${k + 1}`;
      brackets.forEach((b, n) => {
        const li = document.createElement('li');
        const pick = (what: string, value: number, count: number, text: (k: number) => string, set: (v: number) => void) => {
          const sel = document.createElement('select');
          sel.setAttribute('aria-label', `Bracket ${n + 1} ${what}`);
          for (let k = 0; k < count; k++) sel.append(new Option(text(k), String(k)));
          sel.value = String(value);
          sel.addEventListener('change', () => { read(); set(Number(sel.value)); drawBrackets(); });
          return sel;
        };
        if (paths.length > 1) li.append(pick('pathway', b.path, paths.length, (j) => paths[j].name || `pathway ${j + 1}`, (v) => { b.path = v; }));
        li.append(pick('from', b.from, rows.length, (k) => name(k, b.path), (v) => { b.from = v; }), ' to ', pick('to', b.to, rows.length, (k) => name(k, b.path), (v) => { b.to = v; }));
        const out = document.createElement('output');
        out.className = 'muted';
        const g = (k: number) => { const v = parseFloat((rows[k]?.[b.path]?.g ?? '').replace(/[−–]/g, '-')); return isFinite(v) ? v : null; };
        const a = g(b.from), z = g(b.to);
        out.textContent = a === null || z === null || b.from === b.to ? 'pick two species with energies'
          : bracketText({ quantity: $<HTMLSelectElement>('select[name=quantity]').value }, { label: name(b.from, b.path), g: a }, { label: name(b.to, b.path), g: z }, (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(Number($<HTMLInputElement>('input[name=digits]').value) || 0)).replace('^‡', '‡');
        const del = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', title: 'Take out this bracket' });
        del.setAttribute('aria-label', `Take out bracket ${n + 1}`);
        del.addEventListener('click', () => { brackets.splice(n, 1); drawBrackets(); redraw(); });
        li.append(' ', out, ' ', del);
        bracketList.append(li);
      });
    };
    let dragFrom: number | null = null;
    const load = (ps: EnergyPath[]) => {
      paths = ps.map((p) => ({ name: p.name, color: p.color, ...(p.dash ? { dash: p.dash } : {}) }));
      const n = Math.max(...ps.map((p) => p.points.length));
      rows = Array.from({ length: n }, (_, i) => ps.map((p): Cell => {
        const q = p.points[i];
        return { label: q?.label ?? '', g: q?.g === null || q === undefined ? '' : String(q.g), ...(q?.eh !== undefined ? { eh: q.eh } : {}), ...(q?.geom ? { geom: q.geom } : {}), ...(q?.ehs ? { ehs: q.ehs } : {}), ...(q?.flat ? { flat: q.flat } : {}), ...(q?.drawn ? { drawn: q.drawn } : {}) };
      }));
      draw();
    };

    const presetSel = $<HTMLSelectElement>('select[name=preset]');
    for (const p of ENERGY_PRESETS) presetSel.append(new Option(p.name, p.id));
    const fillPreset = () => {
      const p = ENERGY_PRESETS.find((x) => x.id === presetSel.value) ?? ENERGY_PRESETS[0];
      $('.energy-blurb').textContent = p.blurb + ' The numbers are only examples: type your own.';
      load(p.data.paths);
    };
    presetSel.addEventListener('change', fillPreset);
    const look = editing ?? { ...lastLook };
    if (editing) load(editing.paths); else fillPreset();
    $<HTMLSelectElement>('select[name=quantity]').value = look.quantity;
    $<HTMLSelectElement>('select[name=unit]').value = look.unit;
    $<HTMLSelectElement>('select[name=style]').value = look.style;
    $<HTMLInputElement>('input[name=digits]').value = String(look.digits);
    $<HTMLInputElement>('input[name=w]').value = String(Math.round(editing?.w ?? size.w));
    $<HTMLInputElement>('input[name=h]').value = String(Math.round(editing?.h ?? size.h));
    $<HTMLInputElement>('input[name=values]').checked = look.values;
    $<HTMLInputElement>('input[name=axis]').checked = look.axis;
    $<HTMLInputElement>('input[name=barrier]').checked = look.barrier;
    $<HTMLInputElement>('input[name=overall]').checked = !!look.overall;
    $<HTMLSelectElement>('select[name=structures]').value = editing?.structures === '2d' ? '2d' : editing?.structures ? '3d' : '';
    $<HTMLInputElement>('input[name=distances]').checked = !!editing?.distances;
    $<HTMLSelectElement>('select[name=place]').value = editing?.place ?? 'above';
    $<HTMLInputElement>('input[name=theory]').value = editing?.theory ?? '';
    form.querySelector('[data-act=row]')!.addEventListener('click', () => { read(); rows.push(paths.map(() => ({ label: '', g: '' }))); draw(); });
    form.querySelector('[data-act=path]')!.addEventListener('click', () => {
      read();
      if (paths.length >= PATH_COLOURS.length) return;
      // a new pathway takes the next colour and a line style of its own
      const dashes: EnergyDash[] = ['dashed', 'dotted', 'solid'];
      paths.push({ name: '', color: PATH_COLOURS.find((c) => !paths.some((p) => p.color === c)) ?? '#000000', ...(paths.length ? { dash: dashes[(paths.length - 1) % dashes.length] } : {}) });
      for (const r of rows) r.push({ label: r[0]?.label ?? '', g: '' });
      draw();
    });

    form.querySelector('[data-act=bracket]')!.addEventListener('click', () => {
      read();
      // a first guess on the pathway last typed in: its largest climb, then first to last, then each step in turn
      const j = Math.min(lastPath(), paths.length - 1);
      const gs = rows.map((r) => { const v = parseFloat((r[j]?.g ?? '').replace(/[−–]/g, '-')); return isFinite(v) ? v : null; });
      const at = gs.map((g, k) => (g === null ? -1 : k)).filter((k) => k >= 0);
      if (at.length < 2) return;
      const big = largestBarrier({ name: '', color: '', points: gs.map((g) => ({ label: '', g })) });
      const guesses: [number, number][] = [...(big ? [[big.from, big.top] as [number, number]] : []), [at[0], at[at.length - 1]], ...at.slice(1).map((k, n): [number, number] => [at[n], k])];
      const [from, to] = guesses.find(([f, t]) => !brackets.some((x) => x.path === j && x.from === f && x.to === t)) ?? guesses[0];
      brackets.push({ path: j, from, to });
      drawBrackets();
      redraw();
    });
    // energies from files follow the axis: free energies for ΔG, enthalpies for ΔH, electronic energies for E
    $<HTMLSelectElement>('select[name=quantity]').addEventListener('change', () => {
      read();
      const kind = energyKind($<HTMLSelectElement>('select[name=quantity]').value);
      const note = $<HTMLParagraphElement>('.energy-import-note');
      const missing = new Set<string>();
      paths.forEach((_, j) => {
        const cells = rows.map((r) => r[j]).filter((c) => c?.ehs);
        if (!cells.length) return;
        if (cells.some((c) => c.ehs![kind] === undefined)) { for (const c of cells) if (c.ehs![kind] === undefined) missing.add(c.label || '?'); return; }
        for (const c of cells) c.eh = c.ehs![kind];
      });
      relative();
      draw();
      if (missing.size) {
        note.hidden = false;
        note.textContent = `${kind === 'G' ? 'No free energy' : kind === 'H' ? 'No enthalpy' : 'No electronic energy'} in the file for ${[...missing].join(', ')} (it needs a frequency job): the energies are unchanged.`;
      }
      redraw();
    });

    d.append(form);
    document.body.append(d);
    const finish = (v: EnergyData | null) => { d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    // a minus sign typed as − or – counts too
    const num = (t: string) => { const v = parseFloat(t.replace(/[−–]/g, '-').replace(',', '.')); return t.trim() && isFinite(v) ? v : null; };
    /** The diagram as the window has it now. */
    const gather = (): EnergyData => {
      read();
      return {
        paths: paths.map((p, j) => ({
          name: p.name.trim(), color: p.color, ...(p.dash ? { dash: p.dash } : {}),
          points: rows.map((r) => ({
            label: r[j].label.trim(), g: num(r[j].g), ...(r[j].eh !== undefined ? { eh: r[j].eh } : {}), ...(r[j].geom ? { geom: r[j].geom } : {}),
            ...(r[j].ehs ? { ehs: r[j].ehs } : {}), ...(r[j].flat ? { flat: r[j].flat } : {}), ...(r[j].drawn ? { drawn: r[j].drawn } : {}),
          })),
        })),
        quantity: $<HTMLSelectElement>('select[name=quantity]').value,
        unit: $<HTMLSelectElement>('select[name=unit]').value,
        style: $<HTMLSelectElement>('select[name=style]').value as EnergyData['style'],
        values: $<HTMLInputElement>('input[name=values]').checked,
        digits: Math.max(0, Math.min(3, Number($<HTMLInputElement>('input[name=digits]').value) || 0)),
        axis: $<HTMLInputElement>('input[name=axis]').checked,
        barrier: $<HTMLInputElement>('input[name=barrier]').checked,
        overall: $<HTMLInputElement>('input[name=overall]').checked,
        structures: ($<HTMLSelectElement>('select[name=structures]').value || false) as EnergyData['structures'],
        distances: $<HTMLInputElement>('input[name=distances]').checked,
        place: $<HTMLSelectElement>('select[name=place]').value as EnergyData['place'],
        brackets: brackets.filter((b) => b.from !== b.to && b.path < paths.length && b.from < rows.length && b.to < rows.length).map((b) => ({ ...b })),
        theory: $<HTMLInputElement>('input[name=theory]').value.trim(),
        w: Math.max(60, Number($<HTMLInputElement>('input[name=w]').value) || size.w),
        h: Math.max(40, Number($<HTMLInputElement>('input[name=h]').value) || size.h),
        ...(editing?.margins ? { margins: editing.margins } : {}),
      };
    };
    // the preview redraws as anything changes (a moment after typing stops)
    const canvas = $<HTMLCanvasElement>('.energy-preview');
    canvas.hidden = !preview;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const redraw = () => {
      if (!preview) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const out = gather();
        if (out.paths.some((p) => p.points.some((q) => q.g !== null))) { try { preview(out, canvas); } catch { /* a half-typed table */ } }
      }, 120);
    };
    form.addEventListener('input', redraw);
    form.addEventListener('change', redraw);
    form.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('button')) redraw(); });
    // ‡ goes on the species name last typed in
    let lastName: HTMLInputElement | null = null;
    table.addEventListener('focusin', (e) => { const t = e.target as HTMLInputElement; if (t.dataset?.l !== undefined) lastName = t; });
    form.querySelector('[data-act=ddagger]')!.addEventListener('click', () => {
      const t = lastName && lastName.isConnected ? lastName : table.querySelector<HTMLInputElement>('input[data-l]');
      if (!t) return;
      if (!t.value.endsWith('‡')) t.value += '‡';
      t.focus();
      redraw();
    });
    // energies from files: relative to the pathway's first file, in the unit chosen
    const lastPath = () => Number(lastName?.isConnected ? lastName.dataset.l : 0) || 0;
    const relative = () => {
      const unit = $<HTMLSelectElement>('select[name=unit]').value;
      const k = HARTREE[unit] ?? HARTREE['kcal/mol'];
      paths.forEach((_, j) => {
        const ref = rows.find((r) => r[j]?.eh !== undefined)?.[j].eh;
        if (ref === undefined) return;
        for (const r of rows) if (r[j]?.eh !== undefined) r[j].g = String(Math.round((r[j].eh! - ref) * k * 100) / 100);
      });
    };
    $<HTMLSelectElement>('select[name=unit]').addEventListener('change', () => { read(); relative(); draw(); });
    const files = $<HTMLInputElement>('input[name=qm]');
    form.querySelector('[data-act=import]')!.addEventListener('click', () => files.click());
    files.addEventListener('change', async () => {
      const list = [...(files.files ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      files.value = '';
      if (!list.length) return;
      const got: QmResult[] = [], skipped: string[] = [];
      for (const f of list) {
        const r = readQmOutput(await f.text(), f.name);
        const e = r && (r.free ?? r.scf);
        if (r && e !== null) got.push(r); else skipped.push(f.name);
      }
      const note = $<HTMLParagraphElement>('.energy-import-note');
      note.hidden = false;
      if (!got.length) { note.textContent = `Nothing read: ${skipped.join(', ')} ${skipped.length > 1 ? 'are not' : 'is not'} Gaussian or ORCA output with an energy.`; return; }
      read();
      const pick = pickEnergy(got);
      const j = Math.min(lastPath(), paths.length - 1);
      const cells = got.map((r): Cell => ({
        label: speciesName(r), g: '', eh: pick.kind === 'free' ? r.free! : r.scf!,
        ehs: { ...(r.free !== null ? { G: r.free } : {}), ...(r.enthalpy !== null ? { H: r.enthalpy } : {}), ...(r.scf !== null ? { E: r.scf } : {}) },
        ...(r.atoms.length ? { geom: r.atoms.map((a) => ({ el: a.el, x: +a.x.toFixed(3), y: +a.y.toFixed(3), z: +a.z.toFixed(3) })) } : {}),
      }));
      // a preset's made-up numbers go; a table being worked on keeps its other pathways
      const fresh = !editing && paths.length === 1;
      if (fresh) rows = cells.map((c) => [c]);
      else {
        while (rows.length < cells.length) rows.push(paths.map(() => ({ label: '', g: '' })));
        rows.forEach((r, i) => { r[j] = cells[i] ?? { label: '', g: '' }; });
      }
      relative();
      draw();
      $<HTMLSelectElement>('select[name=quantity]').value = pick.quantity;
      const theory = got.find((r) => r.theory)?.theory ?? '';
      const t = $<HTMLInputElement>('input[name=theory]');
      if (!t.value.trim() && theory) t.value = theory + (pick.kind === 'free' ? '' : ' (electronic energies)');
      const st = $<HTMLSelectElement>('select[name=structures]');
      if (got.some((r) => r.atoms.length) && !st.value) st.value = '3d';
      if (got.some((r) => r.imaginary === 1 && r.atoms.length)) $<HTMLInputElement>('input[name=distances]').checked = true;
      const ts = got.filter((r) => r.imaginary === 1).length;
      const odd = got.filter((r) => (r.imaginary ?? 0) > 1).map((r) => r.name);
      const theories = new Set(got.map((r) => r.theory).filter(Boolean));
      note.textContent = [
        `Read ${got.length} file${got.length > 1 ? 's' : ''} (${[...new Set(got.map((r) => r.program))].join(', ')}): ${pick.kind === 'free' ? 'free energies' : 'electronic energies (no frequency job in every file)'}, relative to ${got[0].name}.${got.every((r) => r.enthalpy !== null) ? ' Choose ΔH on the axis for the enthalpies.' : ''}`,
        ts ? `${ts} transition state${ts > 1 ? 's' : ''} (one imaginary frequency) marked ‡.` : '',
        odd.length ? `More than one imaginary frequency: ${odd.join(', ')}.` : '',
        theories.size > 1 ? `The files use different levels of theory (${[...theories].join('; ')}).` : '',
        got.some((r) => r.unfinished) ? `Did not finish normally: ${got.filter((r) => r.unfinished).map((r) => r.name).join(', ')}.` : '',
        skipped.length ? `Not read: ${skipped.join(', ')}.` : '',
      ].filter(Boolean).join(' ');
      redraw();
    });
    // 2-D structures: each geometry laid out flat by the chemistry engine (once; kept with the diagram)
    const ensureFlat = async () => {
      if (!layout || $<HTMLSelectElement>('select[name=structures]').value !== '2d') return;
      read();
      const todo = rows.flat().filter((c) => c.geom?.length && !c.flat);
      for (const c of todo) {
        const f = await flatFor(c.geom!, c.label, layout);
        if (f) c.flat = f;
      }
    };
    $<HTMLSelectElement>('select[name=structures]').addEventListener('change', () => { void ensureFlat().then(redraw); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await ensureFlat();
      const out = gather();
      if (!out.paths.some((p) => p.points.some((q) => q.g !== null))) return;
      const { style, values, digits, axis, barrier, overall, quantity, unit } = out;
      lastLook = { style, values, digits, axis, barrier, overall, quantity, unit };
      d.close();
      finish(out);
    });
    d.showModal();
    redraw();
  });
}
