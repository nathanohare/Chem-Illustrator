import { foldIntoInfo } from './info-tip';
// Format ▸ Align ▸ Arrange in a Grid…: a small window (how many things are picked, in its title row), with
// rows × columns and the spacing between rows and between columns, and a live preview beside it.

export interface GridPick {
  cols: number;
  /** Space between rows and between columns, in points. */
  rowGap: number;
  colGap: number;
}

/**
 * Ask how to set `n` things out in a table. `preview(pick)` draws them set out that way, as SVG
 * markup; it is called again whenever a number changes.
 */
export function askGridLayout(n: number, start: GridPick, preview: (p: GridPick) => string): Promise<GridPick | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask grid-picker';
    d.setAttribute('aria-label', 'Arrange in a grid');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = `<h2>Arrange in a Grid <span class="grid-pick-count muted"></span></h2>
      <div class="grid-pick-body">
        <div class="grid-pick-fields">
          <label class="ask-row"><span>Rows</span><input name="rows" type="number" min="1" step="1" /><span></span></label>
          <label class="ask-row"><span>Columns</span><input name="cols" type="number" min="1" step="1" /><span></span></label>
          <label class="ask-row"><span>Row spacing</span><input name="rowGap" type="number" min="0" step="1" /><span class="muted">pt</span></label>
          <label class="ask-row"><span>Column spacing</span><input name="colGap" type="number" min="0" step="1" /><span class="muted">pt</span></label>
          <p class="muted small grid-pick-help">Placed left to right, then down. Compound numbers move with their structures.</p>
        </div>
        <div class="grid-pick-preview" aria-label="Preview"></div>
      </div>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">Arrange</button></p>`;
    // the count sits in the title row, not on a line of its own
    form.querySelector('.grid-pick-count')!.textContent = `${n} ${n === 1 ? 'item' : 'items'}`;
    foldIntoInfo(form.querySelector('.grid-pick-help'), form.querySelector('h2'));
    const input = (name: string) => form.querySelector<HTMLInputElement>(`input[name=${name}]`)!;
    const rows = input('rows'), cols = input('cols'), rowGap = input('rowGap'), colGap = input('colGap');
    rows.max = cols.max = String(n);
    const round = (v: number) => String(Math.round(v * 10) / 10);
    cols.value = String(start.cols);
    rows.value = String(Math.ceil(n / start.cols));
    rowGap.value = round(start.rowGap);
    colGap.value = round(start.colGap);
    const pick = (): GridPick => {
      const c = Math.max(1, Math.min(n, Math.round(Number(cols.value)) || start.cols));
      const gap = (el: HTMLInputElement, was: number) => { const v = Number(el.value); return el.value.trim() !== '' && isFinite(v) && v >= 0 ? Math.min(500, v) : was; };
      return { cols: c, rowGap: gap(rowGap, start.rowGap), colGap: gap(colGap, start.colGap) };
    };
    const pane = form.querySelector<HTMLDivElement>('.grid-pick-preview')!;
    const draw = () => { pane.innerHTML = preview(pick()); };
    // rows and columns go together: enough rows for every item in that many columns, and back
    cols.addEventListener('input', () => { const c = pick().cols; rows.value = String(Math.ceil(n / c)); draw(); });
    rows.addEventListener('input', () => {
      const r = Math.max(1, Math.min(n, Math.round(Number(rows.value)) || 1));
      cols.value = String(Math.ceil(n / r));
      draw();
    });
    rowGap.addEventListener('input', draw);
    colGap.addEventListener('input', draw);
    d.append(form);
    document.body.append(d);
    draw();
    const finish = (v: GridPick | null) => { d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const got = pick();
      d.close();
      finish(got);
    });
    d.showModal();
    cols.focus();
    cols.select();
  });
}
