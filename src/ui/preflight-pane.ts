// File > Check Figure for Journal: a box beside the drawing that checks it against a journal's
// published author guidelines (see preflight.ts) and lists what to fix before it is exported:
// errors first, then warnings and tips, then what already passes. Each finding can select what it
// is about; most can be put right from the list (make it fit the column, enlarge small text,
// thicken thin lines, change fonts), and the whole drawing can take the journal's drawing style.
// Export for the journal opens Export Picture (or PDF) with the resolution the journal asks for.

import { FloatBox } from './float-box';
import { JOURNALS, journalById, preflight, preflightSummary, type PreflightIssue, type PreflightResult, type PrintSize } from '../preflight';
import type { Item } from '../render/vector';
import type { Rect } from '../geom';

export interface PreflightFigure {
  items: Item[];
  /** The figure's extent, in its own points. */
  box: Rect;
  /** A design page (its size is the page's, so it is not made to fit by scaling). */
  page?: boolean;
}

export interface PreflightHost {
  /** What the figure showing draws; null when there is nothing to check here. */
  figure(): PreflightFigure | null;
  /** Select (and show) what lies in these places. */
  select(where: Rect[]): void;
  /** Put a finding right; true when something changed. */
  fix(issue: PreflightIssue, result: PreflightResult): boolean;
  /** The journal's drawing style, by name, when there is one. */
  styleFor(journalId: string): string | undefined;
  /** Change the drawing to that style. */
  useStyle(name: string): void;
  /** Export the figure for the journal (its format and resolution). */
  exportFor(result: PreflightResult): void;
  /** Open the journal's guidelines in the browser. */
  open(url: string): void;
}

const LEVEL_NAMES = { error: 'To fix', warning: 'To look at', tip: 'Tips', ok: 'Passed' } as const;
const FIX_NAMES = { fit: 'Make It Fit', text: 'Enlarge Text', lines: 'Thicken Lines', fonts: 'Use Arial', style: 'Use Drawing Style' } as const;
const FIX_TIPS = {
  fit: 'Scale the whole drawing so it fits the width (and height) at its printed size',
  text: 'Make the text that is too small just big enough, keeping each label\'s sub- and superscripts in proportion',
  lines: 'Make the lines that are too thin just thick enough (the drawing\'s bonds and its arrows and shapes)',
  fonts: 'Change the text in other fonts to Arial',
  style: '',
} as const;

const KEY = 'chem-illustrator.preflight';

interface Choice { journal: string; size: string; how: PrintSize }

function loadChoice(): Choice {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Choice> | null;
    const j = journalById(raw?.journal ?? '') ?? JOURNALS[0];
    const size = j.sizes.some((s) => s.id === raw?.size) ? raw!.size! : j.sizes[0].id;
    return { journal: j.id, size, how: raw?.how === 'fill' ? 'fill' : 'drawn' };
  } catch {
    return { journal: JOURNALS[0].id, size: JOURNALS[0].sizes[0].id, how: 'drawn' };
  }
}

function saveChoice(c: Choice): void {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* kept for this session only */ }
}

export class PreflightPane {
  private box: FloatBox;
  private journalSel: HTMLSelectElement;
  private sizeSel: HTMLSelectElement;
  private howSel: HTMLSelectElement;
  private summary: HTMLParagraphElement;
  private list: HTMLDivElement;
  private foot: HTMLDivElement;
  private choice = loadChoice();
  /** The last check, for Export Picture's resolution. */
  last: PreflightResult | null = null;

  constructor(private host: PreflightHost) {
    this.box = new FloatBox('Check Figure for Journal', () => {});
    this.box.el.classList.add('a11y-pane', 'preflight-pane');
    (this.box.el.querySelector('.fb-pin') as HTMLElement | null)?.setAttribute('hidden', '');
    const form = document.createElement('div');
    form.className = 'pf-form';
    const row = (label: string, el: HTMLElement, help: string) => {
      const l = document.createElement('label');
      l.className = 'pf-row';
      l.title = help;
      const s = document.createElement('span');
      s.textContent = label;
      l.append(s, el);
      form.append(l);
    };
    this.journalSel = document.createElement('select');
    for (const j of JOURNALS) this.journalSel.append(new Option(j.name, j.id));
    this.journalSel.value = this.choice.journal;
    this.sizeSel = document.createElement('select');
    this.howSel = document.createElement('select');
    this.howSel.append(new Option('As drawn (shrunk only if too big)', 'drawn'), new Option('Made to fill the width', 'fill'));
    this.howSel.value = this.choice.how;
    row('Journal', this.journalSel, 'Whose author guidelines to check against');
    row('Size', this.sizeSel, 'The width it will be printed at');
    row('Printed', this.howSel, 'As drawn: the figure prints at the size it is drawn, unless it is too big, when the journal shrinks it (text and lines too). Made to fill the width: for a figure drawn bigger or smaller than it prints');
    this.fillSizes();
    this.journalSel.addEventListener('change', () => { this.choice.journal = this.journalSel.value; this.fillSizes(); this.changed(); });
    this.sizeSel.addEventListener('change', () => { this.choice.size = this.sizeSel.value; this.changed(); });
    this.howSel.addEventListener('change', () => { this.choice.how = this.howSel.value === 'fill' ? 'fill' : 'drawn'; this.changed(); });

    const top = document.createElement('div');
    top.className = 'a11y-top';
    this.summary = document.createElement('p');
    this.summary.className = 'a11y-summary';
    this.summary.setAttribute('role', 'status');
    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Check Again';
    again.title = 'Check the figure again after changes';
    again.addEventListener('click', () => this.refresh());
    top.append(this.summary, again);
    this.list = document.createElement('div');
    this.list.className = 'a11y-list';
    this.foot = document.createElement('div');
    this.foot.className = 'pf-foot';
    this.box.body.append(form, top, this.list, this.foot);
  }

  get open(): boolean {
    return this.box.open;
  }

  show(near?: HTMLElement | null): void {
    this.refresh();
    this.box.show(near);
  }

  close(): void {
    this.box.close();
  }

  private fillSizes(): void {
    const j = journalById(this.choice.journal) ?? JOURNALS[0];
    this.sizeSel.replaceChildren(...j.sizes.map((s) => new Option(s.name, s.id)));
    if (!j.sizes.some((s) => s.id === this.choice.size)) this.choice.size = j.sizes[0].id;
    this.sizeSel.value = this.choice.size;
  }

  private changed(): void {
    saveChoice(this.choice);
    this.refresh();
  }

  /** Check the figure showing again (when the box is open). */
  refresh(): void {
    const fig = this.host.figure();
    const j = journalById(this.choice.journal) ?? JOURNALS[0];
    this.list.replaceChildren();
    this.foot.replaceChildren();
    if (!fig) {
      this.last = null;
      this.summary.textContent = 'There is nothing to check here. Draw the figure on the Canvas, or open a Design page.';
      return;
    }
    let r: PreflightResult;
    try {
      r = preflight(fig.items, fig.box, j, this.choice.size, this.choice.how);
    } catch (e) {
      this.last = null;
      this.summary.textContent = `Could not check this figure: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    this.last = r;
    this.summary.textContent = preflightSummary(r);
    let level: string | null = null;
    for (const i of r.issues) {
      if (i.level !== level) {
        level = i.level;
        const h = document.createElement('h3');
        h.className = `a11y-level a11y-${i.level}`;
        h.textContent = LEVEL_NAMES[i.level];
        this.list.append(h);
      }
      this.list.append(this.item(i, r, !!fig.page));
    }
    // the journal's own drawing style, export, and where the rules come from
    const btns = document.createElement('div');
    btns.className = 'pf-buttons';
    const style = this.host.styleFor(j.id);
    if (style) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Use Journal Drawing Style';
      b.title = `Redraw every structure in the "${style}" drawing style (bond length, line widths, label font and size), the settings ${j.name.replace(/ \(.*/, '')} publishes for structures drawn at their printed size. One undo takes it back.`;
      b.addEventListener('click', () => { this.host.useStyle(style); this.refresh(); });
      btns.append(b);
    }
    const ex = document.createElement('button');
    ex.type = 'button';
    ex.className = 'primary';
    ex.textContent = 'Export for Journal…';
    ex.title = r.journal.vectorPreferred ? 'Save it as a PDF (shapes, not dots), as the journal asks' : `Save it as a picture at ${r.dpi} dpi, as the journal asks for this kind of figure`;
    ex.addEventListener('click', () => this.host.exportFor(r));
    btns.append(ex);
    const src = document.createElement('p');
    src.className = 'muted small pf-source';
    src.textContent = `Rules from ${j.source}. Journals change their guidelines: check the journal's own page before sending. `;
    const link = document.createElement('a');
    link.href = j.url;
    link.textContent = 'Open the guidelines';
    link.addEventListener('click', (e) => { e.preventDefault(); this.host.open(j.url); });
    src.append(link);
    this.foot.append(btns, src);
  }

  private item(i: PreflightIssue, r: PreflightResult, page: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = `a11y-item pf-item pf-${i.level}`;
    const t = document.createElement('span');
    t.className = 'pf-title';
    t.textContent = i.title;
    row.append(t);
    if (i.where?.length) {
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'a11y-go';
      go.textContent = 'Select';
      go.title = 'Select what this is about on the drawing';
      go.addEventListener('click', () => this.host.select(i.where!));
      row.append(go);
    }
    if (i.fix && !(i.fix === 'fit' && page)) {
      const fix = document.createElement('button');
      fix.type = 'button';
      fix.className = 'a11y-fix';
      fix.textContent = FIX_NAMES[i.fix];
      fix.title = FIX_TIPS[i.fix];
      fix.addEventListener('click', () => { if (this.host.fix(i, r)) this.refresh(); });
      row.append(fix);
    }
    const detail = i.fix === 'fit' && page ? `${i.detail ?? ''} A design page is printed at its page size: change the size in the Page group of the Design tab.`.trim() : i.detail;
    if (detail) {
      const p = document.createElement('span');
      p.className = 'muted small a11y-detail';
      p.textContent = detail;
      row.append(p);
    }
    return row;
  }
}
