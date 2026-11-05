// Settings ▸ Newman Projections: how the largest, middle and smallest group on each atom are
// written (colour, bold, italic, and whether the bond takes the colour), the circle and bonds,
// the viewing mark, where energies come from, and the defaults for torsion energy charts, with a
// preview that redraws as anything changes.

import { previewSlot, showDialog } from './dialog-host';
import { DEFAULT_NEWMAN_PREFS, type EyeStyle, type NewmanLook, type NewmanPrefs, type RankLook } from '../design/newman-prefs';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] => Object.assign(document.createElement(tag), props);

/** Ready-made colourings for the three ranks. */
const PRESETS: Record<string, RankLook[]> = {
  red: [{ color: '#e00000', bold: false, italic: false, bond: false }, { color: '#000000', bold: false, italic: false, bond: false }, { color: '#000000', bold: false, italic: false, bond: false }],
  rbb: [{ color: '#e00000', bold: false, italic: false, bond: false }, { color: '#1a56db', bold: false, italic: false, bond: false }, { color: '#000000', bold: false, italic: false, bond: false }],
  black: [0, 1, 2].map(() => ({ color: '#000000', bold: false, italic: false, bond: false })),
};

/**
 * Open the page. `preview` draws a sample projection in a look; `apply` keeps the settings
 * (and, when asked, gives the projections already drawn the new look).
 */
export function newmanSettings(now: NewmanPrefs, preview: (look: NewmanLook, kind: NewmanPrefs['kind'], canvas: HTMLCanvasElement) => void, apply: (p: NewmanPrefs, restyle: boolean) => void, count: number): Promise<void> {
  return new Promise((resolve) => {
    const p: NewmanPrefs = structuredClone(now);
    const d = el('dialog', { className: 'ask newman-settings' });
    d.setAttribute('aria-label', 'Newman projection settings');
    const form = el('form', { method: 'dialog' });
    const rankRow = (i: number, name: string) => `<tr><th scope="row">${name}</th>
      <td><input type="color" data-r="${i}" data-k="color" aria-label="${name} color" /></td>
      <td><input type="checkbox" data-r="${i}" data-k="bold" aria-label="${name} bold" /></td>
      <td><input type="checkbox" data-r="${i}" data-k="italic" aria-label="${name} italic" /></td>
      <td><input type="checkbox" data-r="${i}" data-k="bond" aria-label="${name}: color its bond too" /></td></tr>`;
    form.innerHTML = `<h2>Newman Projections</h2>
      <div class="ns-grid">
        <div>
          <h3 data-info="The groups on each atom are ranked by size (their A-value, the cyclohexane axial–equatorial free energy difference), largest to smallest. Groups the same size share a rank; ring bonds are not ranked.">Group colors</h3>
          <table class="ns-ranks"><thead><tr><th></th><th>Color</th><th>Bold</th><th>Italic</th><th>Color its bond</th></tr></thead>
            <tbody>${rankRow(0, 'Largest')}${rankRow(1, 'Middle')}${rankRow(2, 'Smallest')}</tbody></table>
          <p class="ns-presets"><button type="button" data-preset="red">Largest red</button> <button type="button" data-preset="rbb">Red, blue, black</button> <button type="button" data-preset="black">All black</button></p>
        </div>
        <div class="ns-at"><canvas class="ns-preview" role="img" aria-label="Preview"></canvas></div>
      </div>
      <h3>Look</h3>
      <label class="ask-row"><span>Draw as</span><select name="kind"><option value="newman">Newman</option><option value="sawhorse">Sawhorse</option></select></label>
      <label class="ask-row"><span>Circle size</span><input name="radius" type="number" step="0.02" min="0.2" max="2" /><span class="muted">× bond length</span></label>
      <label class="ask-row"><span>Bonds reach</span><input name="reach" type="number" step="0.02" min="0.1" max="3" /><span class="muted">× the circle's radius past it</span></label>
      <label class="ask-row"><span>Eclipsed groups</span><input name="offset" type="number" step="1" min="-45" max="45" /><span class="muted">° turned so both show (0: on top)</span></label>
      <label class="ask-row ask-check"><input name="dot" type="checkbox" /><span>Dot on the front atom</span></label>
      <label class="ask-row"><span>Ring arc</span><select name="arcLine"><option value="dashed">Dashed</option><option value="solid">Solid</option></select><input name="arcColor" type="color" aria-label="Ring arc color" /></label>
      <label class="ask-row ask-check"><input name="arcBonds" type="checkbox" /><span>Ring bonds take the arc's color too</span></label>
      <label class="ask-row ask-check"><input name="mark" type="checkbox" /><span>Mark the viewing direction on the structure (eye and dotted arrow)</span></label>
      <label class="ask-row"><span>Eye</span><select name="eye"><option value="pupil">With a pupil</option><option value="plain">Plain</option><option value="inner">Inner curve</option><option value="almond">Almond, with a pupil</option><option value="lashes">Lashes</option></select></label>
      <label class="ask-row"><span>Mark color</span><input name="markColor" type="color" /></label>
      <label class="ask-row"><span>Energies from</span><select name="method"><option value="mmff">MMFF94s+ (fast)</option><option value="xtb">GFN2-xTB when installed (desktop app)</option></select></label>
      <h3>Torsion energy charts</h3>
      <label class="ask-row"><span>Units</span><select name="unit"><option value="kcal/mol">kcal/mol</option><option value="kJ/mol">kJ/mol</option></select></label>
      <label class="ask-row"><span>Projections</span><select name="insets"><option value="all">At every minimum and maximum</option><option value="minima">At the minima</option><option value="none">None</option></select></label>
      <label class="ask-row"><span>Names</span><select name="names"><option value="textbook">Textbook (gauche, eclipsed, anti)</option><option value="klyne">Klyne–Prelog (synclinal…)</option><option value="none">None</option></select></label>
      <label class="ask-row ask-check"><input name="barriers" type="checkbox" /><span>Barrier heights (dotted arrows)</span></label>
      <label class="ask-row"><span>Barrier color</span><input name="barrierColor" type="color" /></label>
      ${count ? `<label class="ask-row ask-check"><input name="restyle" type="checkbox" /><span>Give the ${count === 1 ? 'projection' : `${count} projections`} in this drawing the new look too</span></label>` : ''}
      <p class="ask-buttons"><button type="button" data-act="reset">Reset</button> <button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">Apply</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const canvas = $<HTMLCanvasElement>('.ns-preview');

    const show = () => {
      for (const inp of form.querySelectorAll<HTMLInputElement>('[data-r]')) {
        const r = p.look.ranks[Number(inp.dataset.r)], k = inp.dataset.k as keyof RankLook;
        if (k === 'color') inp.value = r.color; else inp.checked = r[k] as boolean;
      }
      $<HTMLSelectElement>('select[name=kind]').value = p.kind;
      $<HTMLInputElement>('input[name=radius]').value = String(p.look.radius);
      $<HTMLInputElement>('input[name=reach]').value = String(p.look.reach);
      $<HTMLInputElement>('input[name=offset]').value = String(p.look.offset);
      $<HTMLInputElement>('input[name=dot]').checked = p.look.dot;
      const arc = p.look.arc ?? DEFAULT_NEWMAN_PREFS.look.arc!;
      $<HTMLSelectElement>('select[name=arcLine]').value = arc.line;
      $<HTMLInputElement>('input[name=arcColor]').value = arc.color;
      $<HTMLInputElement>('input[name=arcBonds]').checked = arc.bonds;
      $<HTMLSelectElement>('select[name=eye]').value = p.look.eye ?? 'plain';
      $<HTMLInputElement>('input[name=mark]').checked = p.mark;
      $<HTMLInputElement>('input[name=markColor]').value = p.markColor;
      $<HTMLSelectElement>('select[name=method]').value = p.method;
      $<HTMLSelectElement>('select[name=unit]').value = p.chart.unit;
      $<HTMLSelectElement>('select[name=insets]').value = p.chart.insets;
      $<HTMLSelectElement>('select[name=names]').value = p.chart.names;
      $<HTMLInputElement>('input[name=barriers]').checked = p.chart.barriers;
      $<HTMLInputElement>('input[name=barrierColor]').value = p.chart.barrierColor;
    };
    const read = () => {
      for (const inp of form.querySelectorAll<HTMLInputElement>('[data-r]')) {
        const r = p.look.ranks[Number(inp.dataset.r)], k = inp.dataset.k as keyof RankLook;
        if (k === 'color') r.color = inp.value; else (r[k] as boolean) = inp.checked;
      }
      const n = (name: string, lo: number, hi: number, d: number) => { const v = Number($<HTMLInputElement>(`input[name=${name}]`).value); return isFinite(v) && $<HTMLInputElement>(`input[name=${name}]`).value !== '' ? Math.max(lo, Math.min(hi, v)) : d; };
      p.kind = $<HTMLSelectElement>('select[name=kind]').value === 'sawhorse' ? 'sawhorse' : 'newman';
      p.look.radius = n('radius', 0.2, 2, p.look.radius);
      p.look.reach = n('reach', 0.1, 3, p.look.reach);
      p.look.offset = n('offset', -45, 45, p.look.offset);
      p.look.dot = $<HTMLInputElement>('input[name=dot]').checked;
      p.look.arc = { line: $<HTMLSelectElement>('select[name=arcLine]').value === 'solid' ? 'solid' : 'dashed', color: $<HTMLInputElement>('input[name=arcColor]').value, bonds: $<HTMLInputElement>('input[name=arcBonds]').checked };
      p.look.eye = $<HTMLSelectElement>('select[name=eye]').value as EyeStyle;
      p.mark = $<HTMLInputElement>('input[name=mark]').checked;
      p.markColor = $<HTMLInputElement>('input[name=markColor]').value;
      p.method = $<HTMLSelectElement>('select[name=method]').value === 'xtb' ? 'xtb' : 'mmff';
      p.chart.unit = $<HTMLSelectElement>('select[name=unit]').value === 'kJ/mol' ? 'kJ/mol' : 'kcal/mol';
      p.chart.insets = $<HTMLSelectElement>('select[name=insets]').value as NewmanPrefs['chart']['insets'];
      p.chart.names = $<HTMLSelectElement>('select[name=names]').value as NewmanPrefs['chart']['names'];
      p.chart.barriers = $<HTMLInputElement>('input[name=barriers]').checked;
      p.chart.barrierColor = $<HTMLInputElement>('input[name=barrierColor]').value;
    };
    const redraw = () => { try { preview(p.look, p.kind, canvas); } catch { /* half-typed */ } };
    form.addEventListener('input', () => { read(); redraw(); });
    form.addEventListener('change', () => { read(); redraw(); });
    for (const b of form.querySelectorAll<HTMLButtonElement>('[data-preset]')) b.addEventListener('click', () => { p.look.ranks = structuredClone(PRESETS[b.dataset.preset!]) as NewmanLook['ranks']; show(); redraw(); });
    $<HTMLButtonElement>('[data-act=reset]').addEventListener('click', () => { Object.assign(p, structuredClone(DEFAULT_NEWMAN_PREFS)); show(); redraw(); });

    d.append(form);
    const finish = () => { d.remove(); resolve(); };
    $<HTMLButtonElement>('[data-act=cancel]').addEventListener('click', () => { d.close(); finish(); });
    d.addEventListener('cancel', () => finish());
    d.addEventListener('close', () => { if (d.isConnected) finish(); });
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      read();
      const restyle = !!form.querySelector<HTMLInputElement>('input[name=restyle]')?.checked;
      d.close();
      apply(p, restyle);
      finish();
    });
    show();
    showDialog(d);
    // in the Settings window, the preview goes in its pane on the right
    const slot = previewSlot('Preview');
    if (slot) { slot.append(canvas); form.querySelector('.ns-grid')!.classList.add('ns-one'); form.querySelector('.ns-at')!.remove(); }
    redraw();
  });
}
