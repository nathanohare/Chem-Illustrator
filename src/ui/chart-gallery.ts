// Insert > All Charts: every kind of chart in a pane, as the Styles pane shows the styles, each
// drawn from the cells selected (or from example numbers when nothing chartable is selected),
// so the right one can be picked by looking. Click one to insert it; the pane stays open to
// try another, and redraws when the selection changes.

import { FloatBox } from './float-box';
import type { SheetView } from './sheet-view';
import type { Sheet } from '../sheet/workbook';
import { CHART_NAMES, chartData, chartFromRange, type ChartKind } from '../sheet/chart';
import { newChartBox, boxData } from '../sheet/chart-box';
import { chartCanvas } from '../render/chart-draw';
import { currentRegion } from './sheet-chart-ui';
import type { Range } from '../sheet/refs';

/** The kinds in groups, as Excel's Insert Chart window has them. */
const GROUPS: [string, ChartKind[]][] = [
  ['Common', ['scatter', 'line', 'column', 'bar']],
  ['Parts of a whole', ['pie', 'area', 'treemap']],
  ['Spread of values', ['histogram', 'box']],
  ['Several measures', ['combo', 'bubble', 'radar']],
  ['Flows and breakdowns', ['sankey', 'decomp']],
];

const W = 300, H = 186;

export class ChartGallery {
  private box: FloatBox;
  private list: HTMLDivElement;
  private note: HTMLParagraphElement;

  constructor(private view: () => SheetView, private insert: (k: ChartKind) => void) {
    this.box = new FloatBox('Charts', () => {});
    this.box.el.classList.add('chart-gallery');
    this.box.el.querySelector<HTMLElement>('.fb-pin')?.setAttribute('hidden', '');
    this.note = document.createElement('p');
    this.note.className = 'cg-note muted';
    this.list = document.createElement('div');
    this.list.className = 'cg-list';
    this.box.body.append(this.note, this.list);
  }

  get open(): boolean { return this.box.open; }

  toggle(near?: HTMLElement | null): void {
    if (this.box.open) { this.box.close(); return; }
    this.box.show(near);
    this.drawnFor = '\0';
    this.refresh();
  }

  /** The cells a chart would be made from, as Insert takes them (null: nothing to chart). */
  private source(): { sheet: Sheet; range: Range } | null {
    const v = this.view();
    const s = v.sheet;
    if (!s || s.dashboard) return null;
    let R = v.sel.range;
    if (R.r1 === R.r2 && R.c1 === R.c2) {
      if (s.value(R.r1, R.c1) === null) return null;
      const t = s.tableAt(R.r1, R.c1);
      R = t ? t.range : currentRegion(s, R.r1, R.c1);
    } else R = s.clip(R) ?? R;
    return R.r1 === R.r2 && R.c1 === R.c2 ? null : { sheet: s, range: R };
  }

  private drawnFor = '';

  /** Draw every kind again (from the selection as it is now); `ifMoved`: only when the selection has changed. */
  refresh(ifMoved = false): void {
    if (!this.box.open) return;
    const src = this.source();
    const key = src ? `${src.sheet.name}!${src.range.r1},${src.range.c1}:${src.range.r2},${src.range.c2}` : '';
    if (ifMoved && key === this.drawnFor) return;
    this.drawnFor = key;
    const v = this.view();
    this.note.textContent = src ? 'Each chart is drawn from the cells selected. Click one to insert it.' : 'Select the numbers to chart (with their header row) to see them here. These use example numbers.';
    this.list.replaceChildren();
    for (const [name, kinds] of GROUPS) {
      const h = document.createElement('h3');
      h.textContent = name;
      const row = document.createElement('div');
      row.className = 'cg-row';
      for (const k of kinds) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cg-item';
        b.title = `Insert a ${CHART_NAMES[k].toLowerCase()} chart`;
        let pic: HTMLCanvasElement | null = null;
        try {
          if (src && v.wb) {
            const c = { ...chartFromRange(src.sheet, src.range, k), w: W, h: H };
            pic = chartCanvas(c, chartData(v.wb, src.sheet, c), 1);
          }
        } catch { pic = null; }
        if (!pic) {
          const ex = newChartBox(k, W * 0.75, H * 0.75);
          pic = chartCanvas({ ...ex.chart, w: W, h: H }, boxData(ex), 1);
        }
        pic.className = 'cg-pic';
        const label = document.createElement('span');
        label.textContent = CHART_NAMES[k];
        b.append(pic, label);
        b.addEventListener('click', () => { this.insert(k); });
        row.append(b);
      }
      this.list.append(h, row);
    }
  }
}
