// The Newman Projection window's Energy Chart tab: a relaxed scan of the bond (MMFF94s+, or
// GFN2-xTB energies at those shapes), drawn as a torsional energy diagram like a textbook figure
// of butane, with which groups the torsion is between, the step, the projections, names, units
// and barrier arrows. Copy Data puts the scan on the clipboard for a spreadsheet.

/** What the chart tab settles on. */
export interface ChartChoice {
  /** The torsion is between front group `a` and back group `d` (3-D model atoms). */
  a: number;
  d: number;
  step: number;
  insets: 'all' | 'minima' | 'none';
  names: 'textbook' | 'klyne' | 'none';
  unit: 'kcal/mol' | 'kJ/mol';
  barriers: boolean;
  /** The boxed sawhorse with the eye above the plot. */
  sawhorse: boolean;
  method: 'mmff' | 'xtb';
}

export interface ChartHost<S> {
  /** The pairs of groups the torsion can be between, the biggest pair first. */
  pairs(reversed: boolean): Promise<{ label: string; a: number; d: number }[]>;
  /** Scan the bond (`progress` tells how far it has got). Rejects with a readable reason. */
  scan(reversed: boolean, c: ChartChoice, progress: (text: string) => void): Promise<S>;
  paint(reversed: boolean, c: ChartChoice, scan: S, canvas: HTMLCanvasElement): void;
  copy(c: ChartChoice, scan: S): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Fill the tab's page and run it; returns what the window needs to show, scan and insert it. */
export function chartTab<S>(page: HTMLElement, host: ChartHost<S>, start: Omit<ChartChoice, 'a' | 'd'>, reversed: () => boolean, xtb: boolean, changed: () => void) {
  page.innerHTML = `<canvas class="np-chart" role="img" aria-label="Torsional energy chart"></canvas>
    <p class="muted small np-chart-status" aria-live="polite"></p>
    <div class="np-chart-grid">
      <label class="ask-row"><span>Torsion between</span><select name="pair"></select></label>
      <label class="ask-row"><span>Step</span><select name="step"><option value="5">5°</option><option value="10">10°</option><option value="15">15°</option><option value="30">30° (quick)</option></select></label>
      <label class="ask-row"><span>Projections</span><select name="insets"><option value="all">At every minimum and maximum</option><option value="minima">At the minima</option><option value="none">None</option></select></label>
      <label class="ask-row"><span>Names</span><select name="names"><option value="textbook">Textbook (gauche, eclipsed, anti…)</option><option value="klyne">Klyne–Prelog (synclinal…)</option><option value="none">None</option></select></label>
      <label class="ask-row"><span>Units</span><select name="unit"><option value="kcal/mol">kcal/mol</option><option value="kJ/mol">kJ/mol</option></select></label>
      <label class="ask-row"><span>Energies</span><select name="cmethod"><option value="mmff">MMFF94s+ (relaxed scan)</option><option value="xtb">GFN2-xTB at those shapes (your xtb)</option></select></label>
      <label class="ask-row ask-check"><input name="barriers" type="checkbox" /><span>Barrier heights (dotted arrows)</span></label>
      <label class="ask-row ask-check"><input name="sawhorse" type="checkbox" /><span>Sawhorse with the eye above the chart</span></label>
    </div>
    <p class="np-chart-copy"><button type="button" data-act="copy" title="Copy each angle and its energy, tab-separated, to paste into a spreadsheet">Copy Data</button></p>`;
  const $ = <T extends Element>(q: string) => page.querySelector<T>(q)!;
  const canvas = $<HTMLCanvasElement>('.np-chart');
  const status = $<HTMLParagraphElement>('.np-chart-status');
  const pairSel = $<HTMLSelectElement>('select[name=pair]');
  const methodSel = $<HTMLSelectElement>('select[name=cmethod]');
  if (!xtb) { methodSel.options[1].disabled = true; methodSel.options[1].textContent = 'GFN2-xTB (desktop app with xtb installed)'; }
  let pairs: { label: string; a: number; d: number }[] = [];
  let scan: S | null = null;
  let asked = 0;
  const c: ChartChoice = { ...start, a: -1, d: -1, method: start.method === 'xtb' && xtb ? 'xtb' : 'mmff' };
  $<HTMLSelectElement>('select[name=step]').value = String(c.step);
  $<HTMLSelectElement>('select[name=insets]').value = c.insets;
  $<HTMLSelectElement>('select[name=names]').value = c.names;
  $<HTMLSelectElement>('select[name=unit]').value = c.unit;
  methodSel.value = c.method;
  $<HTMLInputElement>('input[name=barriers]').checked = c.barriers;
  $<HTMLInputElement>('input[name=sawhorse]').checked = c.sawhorse;

  const paint = () => { if (scan) { try { host.paint(reversed(), c, scan, canvas); } catch { /* next change */ } } };
  const run = async () => {
    const ask = ++asked;
    scan = null;
    changed();
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    status.textContent = 'Scanning the bond…';
    try {
      if (!pairs.length || c.a < 0) {
        pairs = await host.pairs(reversed());
        if (ask !== asked) return;
        pairSel.innerHTML = pairs.map((p, i) => `<option value="${i}">${esc(p.label)}</option>`).join('');
        if (!pairs.length) throw new Error('This bond has no groups to measure a torsion between.');
        c.a = pairs[0].a; c.d = pairs[0].d;
      }
      const got = await host.scan(reversed(), c, (t) => { if (ask === asked) status.textContent = t; });
      if (ask !== asked) return;
      scan = got;
      status.textContent = `A relaxed scan in ${c.step}° steps: the torsion held at each angle and everything else relaxed (${c.method === 'xtb' ? 'MMFF94s+ shapes, GFN2-xTB energies' : 'MMFF94s+'}), fitted with a cosine series.`;
      paint();
    } catch (e) {
      if (ask !== asked) return;
      const msg = (e as Error)?.message ?? String(e);
      status.textContent = msg === 'stopped' ? '' : msg;
    }
    changed();
  };
  pairSel.addEventListener('change', () => { const p = pairs[Number(pairSel.value)]; if (p) { c.a = p.a; c.d = p.d; void run(); } });
  $<HTMLSelectElement>('select[name=step]').addEventListener('change', (e) => { c.step = Number((e.target as HTMLSelectElement).value) || 10; void run(); });
  methodSel.addEventListener('change', () => { c.method = methodSel.value === 'xtb' ? 'xtb' : 'mmff'; void run(); });
  for (const [name, key] of [['insets', 'insets'], ['names', 'names'], ['unit', 'unit']] as const) {
    $<HTMLSelectElement>(`select[name=${name}]`).addEventListener('change', (e) => { (c as unknown as Record<string, string>)[key] = (e.target as HTMLSelectElement).value; paint(); });
  }
  $<HTMLInputElement>('input[name=barriers]').addEventListener('change', (e) => { c.barriers = (e.target as HTMLInputElement).checked; paint(); });
  $<HTMLInputElement>('input[name=sawhorse]').addEventListener('change', (e) => { c.sawhorse = (e.target as HTMLInputElement).checked; paint(); });
  $<HTMLButtonElement>('[data-act=copy]').addEventListener('click', () => { if (scan) host.copy(c, scan); });

  return {
    /** Start (or start again, after the end looked from changed). */
    open(again = false) { if (again) { pairs = []; c.a = -1; } if (again || (!scan && asked === 0)) void run(); else paint(); },
    stop() { asked++; },
    result(): { chart: ChartChoice; scan: S } | null { return scan ? { chart: { ...c }, scan } : null; },
  };
}
