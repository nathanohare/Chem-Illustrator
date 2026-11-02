// The Newman Projection window (right-click a single bond ▸ Newman Projection…, or the Newman
// tool): which end to look from, Newman or sawhorse, the most stable conformers from a conformer
// search (or the conformation the wedges draw), a Turn dial, and a preview that redraws as
// anything changes. Tab and Shift+Tab in the preview step through the conformers.

import { commonName, norm180, type NewmanConformer } from '../chem/newman';
import { chartTab, type ChartChoice, type ChartHost } from './newman-chart-tab';

/** What the window settles on; the caller makes the projection from it. */
export interface NewmanChoice {
  /** Look from the other end of the bond than the one picked. */
  reversed: boolean;
  kind: 'newman' | 'sawhorse';
  /** The most stable conformers (a search) or the one the drawing's wedges give. */
  source: 'stable' | 'drawn';
  /** Which picture down the bond, 0 the most stable. */
  index: number;
  /** Degrees the back atom is turned from that conformer. */
  turn: number;
  method: 'mmff' | 'xtb';
  mark: boolean;
  linked: boolean;
}

export interface NewmanHost {
  /** How each end is named at first: [the end picked, the other end]. */
  ends: [string, string];
  /** Better names once known (each end's group, as written from the other end). */
  names?: Promise<[string, string]>;
  /** The conformers seen down the bond, lowest first (`progress` tells how a search is going). Rejects with a readable reason. */
  list(reversed: boolean, method: 'mmff' | 'xtb', progress: (text: string) => void): Promise<NewmanConformer[]>;
  /** The conformation the wedges and bold bonds draw, or why there is none. */
  drawn(reversed: boolean): Promise<NewmanConformer | string>;
  /** Draw the projection the choice makes on the preview canvas. */
  paint(choice: NewmanChoice, conf: NewmanConformer, canvas: HTMLCanvasElement): void;
  /** xTB can be used (the desktop app, which runs the person's xtb). */
  xtb: boolean;
  /** Stop a search under way. */
  stop(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), props);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A conformer's line in the list: the torsion between the biggest groups and its everyday name. */
export function torsionText(c: NewmanConformer): string {
  const phi = Math.round(norm180(c.view.dihedral));
  const name = commonName(phi);
  return `${phi}°${name ? ' ' + name : ''}`;
}

/** The Energy Chart tab, when the window offers one. */
export interface ChartOffer<S> {
  host: ChartHost<S>;
  start: Omit<ChartChoice, 'a' | 'd'>;
  /** Open on the chart tab. */
  first?: boolean;
}

export type NewmanResult<S> = { choice: NewmanChoice; conf: NewmanConformer } | { choice: NewmanChoice; chart: ChartChoice; scan: S };

export function askNewman<S = never>(start: NewmanChoice, host: NewmanHost, editing: boolean, offer?: ChartOffer<S>): Promise<NewmanResult<S> | null> {
  return new Promise((resolve) => {
    const choice: NewmanChoice = { ...start };
    let confs: NewmanConformer[] = [];
    let drawnConf: NewmanConformer | null = null;
    let busy = 0;
    const d = el('dialog', { className: 'ask newman-dialog' });
    d.setAttribute('aria-label', 'Newman projection');
    const form = el('form', { method: 'dialog' });
    form.innerHTML = `<h2>${editing ? 'Edit Newman Projection' : 'Newman Projection'}</h2>
      ${offer ? '<div class="np-tabs" role="tablist"><button type="button" role="tab" data-tab="proj">Projection</button><button type="button" role="tab" data-tab="chart">Energy Chart</button></div>' : ''}
      <label class="ask-row np-end"><span>Looking from</span><select name="end"></select><button type="button" data-act="swap" title="Look from the other end">⇄</button></label>
      <div class="np-page" data-page="proj">
      <div class="np-grid">
        <div class="np-left">
          <canvas class="np-preview" tabindex="0" role="img" aria-label="Preview. Tab and Shift+Tab step through the conformers"></canvas>
          <label class="ask-row np-turn"><span>Turn</span><input name="turn" type="range" min="-180" max="180" step="5" aria-label="Turn the back atom" /><output class="muted"></output></label>
          <p class="muted small np-tip">Tab in the preview: next conformer · Shift+Tab: previous</p>
        </div>
        <div class="np-right">
          <div class="ask-row"><span>Draw as</span><span class="np-radios"><label><input type="radio" name="kind" value="newman" /> Newman</label><label><input type="radio" name="kind" value="sawhorse" /> Sawhorse</label></span></div>
          <label class="ask-row"><span>Conformation</span><select name="source"><option value="stable">Most stable (conformer search)</option><option value="drawn">As drawn (wedges)</option></select></label>
          <label class="ask-row"><span>Energies</span><select name="method"><option value="mmff">MMFF94s+ (fast)</option><option value="xtb">GFN2-xTB (your xtb)</option></select></label>
          <div class="np-list" role="listbox" aria-label="Conformers"><table><thead><tr><th>#</th><th>Torsion</th><th class="num">kcal/mol</th><th class="num">Share</th></tr></thead><tbody></tbody></table></div>
          <p class="muted small np-status" aria-live="polite"></p>
        </div>
      </div>
      <label class="ask-row ask-check"><input name="mark" type="checkbox" /><span>Mark the viewing direction on the structure (eye and dotted arrow)</span></label>
      <label class="ask-row ask-check"><input name="linked" type="checkbox" /><span>Keep linked: draw it again when the structure changes</span></label>
      <p class="muted small">Groups are coloured by size on each atom (largest, middle, smallest by A-value): change this in Settings ▸ Newman Projections.</p>
      </div>
      ${offer ? '<div class="np-page" data-page="chart" hidden></div>' : ''}
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">${editing ? 'Redraw' : 'Insert'}</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const canvas = $<HTMLCanvasElement>('.np-preview');
    const turn = $<HTMLInputElement>('input[name=turn]');
    const turnOut = $<HTMLOutputElement>('.np-turn output');
    const endSel = $<HTMLSelectElement>('select[name=end]');
    const sourceSel = $<HTMLSelectElement>('select[name=source]');
    const methodSel = $<HTMLSelectElement>('select[name=method]');
    const body = $<HTMLTableElement>('.np-list table').tBodies[0];
    const status = $<HTMLParagraphElement>('.np-status');
    const submit = $<HTMLButtonElement>('button[type=submit]');
    endSel.innerHTML = host.ends.map((e, i) => `<option value="${i}">${esc(e)}</option>`).join('');
    host.names?.then((n) => n.forEach((t, i) => { endSel.options[i].textContent = t; }), () => {});
    if (!host.xtb) {
      const o = methodSel.options[1];
      o.disabled = true;
      o.textContent = 'GFN2-xTB (desktop app with xtb installed)';
    }

    const current = (): NewmanConformer | null => (choice.source === 'drawn' ? drawnConf : confs[choice.index] ?? null);
    let tab: 'proj' | 'chart' = offer?.first ? 'chart' : 'proj';
    const chart = offer ? chartTab(form.querySelector<HTMLElement>('[data-page=chart]')!, offer.host, offer.start, () => choice.reversed, host.xtb, () => { if (tab === 'chart') paint(); }) : null;
    const paint = () => {
      if (tab === 'chart') { submit.disabled = !chart?.result(); return; }
      const c = current();
      submit.disabled = !c || busy > 0;
      const ctx = canvas.getContext('2d');
      if (!c) { if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
      try { host.paint(choice, c, canvas); } catch { /* drawn on the next change */ }
    };
    const fillList = () => {
      body.innerHTML = '';
      const rows = choice.source === 'drawn' ? (drawnConf ? [drawnConf] : []) : confs;
      rows.forEach((c, i) => {
        const tr = body.insertRow();
        tr.setAttribute('role', 'option');
        const on = choice.source === 'drawn' || i === choice.index;
        tr.setAttribute('aria-selected', String(on));
        tr.className = on ? 'on' : '';
        tr.innerHTML = `<td>${choice.source === 'drawn' ? '–' : i + 1}</td><td>${esc(torsionText(c))}</td><td class="num">${c.energy === null ? '–' : c.energy.toFixed(2)}</td><td class="num">${c.population === undefined ? '–' : Math.round(c.population * 100) + '%'}</td>`;
        if (choice.source !== 'drawn') tr.addEventListener('click', () => { pick(i); canvas.focus(); });
      });
    };
    const pick = (i: number) => {
      choice.index = Math.max(0, Math.min(confs.length - 1, i));
      fillList();
      body.rows[choice.index]?.scrollIntoView({ block: 'nearest' });
      paint();
    };
    const load = async () => {
      const ask = ++busy;
      paint();
      status.textContent = choice.source === 'drawn' ? 'Building the shape the wedges draw…' : 'Searching conformers…';
      try {
        if (choice.source === 'drawn') {
          const got = await host.drawn(choice.reversed);
          if (ask !== busy) return;
          drawnConf = typeof got === 'string' ? null : got;
          status.textContent = typeof got === 'string' ? got : '';
        } else {
          const got = await host.list(choice.reversed, choice.method, (t) => { if (ask === busy) status.textContent = t; });
          if (ask !== busy) return;
          confs = got;
          if (choice.index >= confs.length) choice.index = 0;
          status.textContent = confs.length ? `${confs.length} conformer${confs.length === 1 ? '' : 's'} looking down this bond, most stable first (${choice.method === 'xtb' ? 'GFN2-xTB' : 'MMFF94s+'}).` : 'No conformers were found.';
        }
      } catch (e) {
        if (ask !== busy) return;
        const msg = (e as Error)?.message ?? String(e);
        status.textContent = msg === 'stopped' ? '' : msg;
        if (choice.source !== 'drawn' && choice.method === 'xtb') { choice.method = 'mmff'; methodSel.value = 'mmff'; }
      } finally {
        if (ask === busy) busy = 0;
      }
      fillList();
      paint();
    };

    endSel.value = choice.reversed ? '1' : '0';
    form.querySelector<HTMLInputElement>(`input[name=kind][value=${choice.kind}]`)!.checked = true;
    sourceSel.value = choice.source;
    methodSel.value = choice.method === 'xtb' && host.xtb ? 'xtb' : 'mmff';
    choice.method = methodSel.value as 'mmff' | 'xtb';
    methodSel.disabled = choice.source === 'drawn';
    turn.value = String(choice.turn);
    turnOut.textContent = `${choice.turn}°`;
    $<HTMLInputElement>('input[name=mark]').checked = choice.mark;
    $<HTMLInputElement>('input[name=linked]').checked = choice.linked;

    turn.addEventListener('input', () => { choice.turn = Number(turn.value) || 0; turnOut.textContent = `${choice.turn}°`; paint(); });
    turn.addEventListener('dblclick', () => { choice.turn = 0; turn.value = '0'; turnOut.textContent = '0°'; paint(); });
    for (const r of form.querySelectorAll<HTMLInputElement>('input[name=kind]')) r.addEventListener('change', () => { choice.kind = r.value as NewmanChoice['kind']; paint(); });
    endSel.addEventListener('change', () => { choice.reversed = endSel.value === '1'; choice.index = 0; void load(); chartStale = true; if (tab === 'chart') { chartStale = false; chart?.open(true); } });
    $<HTMLButtonElement>('[data-act=swap]').addEventListener('click', () => { endSel.value = endSel.value === '1' ? '0' : '1'; endSel.dispatchEvent(new Event('change')); });
    sourceSel.addEventListener('change', () => { choice.source = sourceSel.value as NewmanChoice['source']; methodSel.disabled = choice.source === 'drawn'; void load(); });
    methodSel.addEventListener('change', () => { choice.method = methodSel.value as NewmanChoice['method']; choice.index = 0; void load(); });
    $<HTMLInputElement>('input[name=mark]').addEventListener('change', (e) => { choice.mark = (e.target as HTMLInputElement).checked; });
    $<HTMLInputElement>('input[name=linked]').addEventListener('change', (e) => { choice.linked = (e.target as HTMLInputElement).checked; });
    // Tab steps through the conformers while the preview has focus; past either end it moves on as usual
    canvas.addEventListener('keydown', (e) => {
      if (choice.source === 'drawn' || !confs.length) return;
      const step = e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = choice.index + step;
      if (next < 0 || next >= confs.length) return;
      e.preventDefault();
      pick(next);
    });

    // the tabs: the chart's scan starts the first time its tab is shown
    let chartStale = false;
    const show = (t: 'proj' | 'chart') => {
      tab = t;
      for (const b of form.querySelectorAll<HTMLButtonElement>('[data-tab]')) { b.setAttribute('aria-selected', String(b.dataset.tab === t)); b.tabIndex = b.dataset.tab === t ? 0 : -1; }
      for (const p of form.querySelectorAll<HTMLElement>('[data-page]')) p.hidden = p.dataset.page !== t;
      submit.textContent = t === 'chart' ? (editing ? 'Redraw Chart' : 'Insert Chart') : editing ? 'Redraw' : 'Insert';
      if (t === 'chart') { chart?.open(chartStale); chartStale = false; }
      paint();
    };
    for (const b of form.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      b.addEventListener('click', () => show(b.dataset.tab as 'proj' | 'chart'));
      b.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const t = tab === 'proj' ? 'chart' : 'proj'; show(t); form.querySelector<HTMLButtonElement>(`[data-tab=${t}]`)!.focus(); } });
    }

    d.append(form);
    document.body.append(d);
    const finish = (v: NewmanResult<S> | null) => { busy = -1; chart?.stop(); if (!v) host.stop(); d.remove(); resolve(v); };
    $<HTMLButtonElement>('[data-act=cancel]').addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (tab === 'chart') {
        const r = chart?.result();
        if (!r) return;
        d.close();
        finish({ choice: { ...choice }, ...r });
        return;
      }
      const c = current();
      if (!c) return;
      d.close();
      finish({ choice: { ...choice }, conf: c });
    });
    d.showModal();
    if (offer) show(tab);
    if (tab === 'proj') canvas.focus(); else form.querySelector<HTMLButtonElement>('[data-tab=chart]')!.focus();
    void load();
  });
}
