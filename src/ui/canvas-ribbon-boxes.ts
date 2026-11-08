// The two small boxes on the Canvas ribbon: Analysis (the last group of the full-size ribbon:
// the formula over three lines of numbers, its name under it with ⌄ and Pop Out; a one-line chip in
// the Simplified ribbon) and Warnings (a count at the right end of the tabs). A click drops the
// side panel's own Analysis or Warnings section down under the box; Analysis can also be popped
// out as a floating window, moved anywhere and pinned at the right. Whatever is borrowed goes
// back to the side panel when it is put away.

import { FloatBox } from './float-box';
import { problemCount, type FileProblems } from './mode-problems';

const CHEVRON = '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const POP_OUT = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 5.5v7.5h7.5M7 2.5h6.5V9M13.5 2.5L7 9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const WARN_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 2.5L22.5 21h-21z" fill="#f2b01e" stroke="#c98a00" stroke-width="1" stroke-linejoin="round"/><path d="M12 9v6" stroke="#3a2a00" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.25" fill="#3a2a00"/></svg>';

/** A side panel section lent to a drop-down or a floating window, and given back. */
class Borrowed {
  private home: Comment;
  constructor(readonly section: HTMLElement) {
    this.home = document.createComment(`${section.id} goes here`);
  }
  get out(): boolean {
    return this.home.isConnected;
  }
  lend(to: HTMLElement): void {
    if (!this.out) this.section.before(this.home);
    to.append(this.section);
  }
  giveBack(): void {
    if (!this.out) return;
    this.home.replaceWith(this.section);
  }
}

/** A box on the ribbon that drops a side panel section down under itself. */
class DropBox {
  readonly button: HTMLButtonElement;
  readonly pop: HTMLDivElement;
  protected lent: Borrowed;
  /** What counts as the box itself for a click outside the list (which closes it). */
  protected inside: (at: Node) => boolean = (at) => this.button.contains(at);

  constructor(section: HTMLElement, cls: string, title: string) {
    this.lent = new Borrowed(section);
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = `cr-box ${cls}`;
    this.button.title = title;
    this.button.setAttribute('aria-haspopup', 'dialog');
    this.button.setAttribute('aria-expanded', 'false');
    this.pop = document.createElement('div');
    this.pop.className = `cr-pop cr-lent ${cls}-pop`;
    this.pop.hidden = true;
    this.pop.setAttribute('role', 'dialog');
    this.pop.setAttribute('aria-label', title);
    document.body.append(this.pop);
    this.button.addEventListener('click', (e) => { e.stopPropagation(); if (this.pop.hidden) this.open(); else this.close(); });
    document.addEventListener('pointerdown', (e) => {
      if (this.pop.hidden) return;
      const at = e.target as Node;
      if (!this.pop.contains(at) && !this.inside(at)) this.close();
    }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.pop.hidden) this.close(); });
    window.addEventListener('resize', () => { if (!this.pop.hidden) this.place(); });
  }

  open(): void {
    this.beforeOpen();
    if (!this.ownList()) this.lent.lend(this.pop);
    this.pop.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.button.classList.add('open');
    this.place();
  }

  close(): void {
    if (this.pop.hidden) return;
    this.pop.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.button.classList.remove('open');
    this.lent.giveBack();
  }

  protected beforeOpen(): void {}

  /** Whether the list is the box's own (filled in beforeOpen) rather than a side panel section lent to it. */
  protected ownList(): boolean {
    return false;
  }

  /** What the list drops down under. */
  protected anchor(): HTMLElement {
    return this.button;
  }

  /** Under the box, its right edges lined up, kept in the window. */
  private place(): void {
    const r = this.anchor().getBoundingClientRect();
    const w = this.pop.offsetWidth;
    this.pop.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
    this.pop.style.top = `${r.bottom + 3}px`;
    this.pop.style.maxHeight = `${Math.max(160, window.innerHeight - r.bottom - 12)}px`;
  }
}

/** What the Analysis box shows of the first structure analysed. */
export interface AnalysisLine {
  /** The formula, as HTML with subscripts. */
  formula: string;
  mw: string;
  exact?: string | null;
  /** The ion's label as HTML ("[M+H]<sup>+</sup>") and its m/z, when one can be made. */
  ion?: { label: string; mz: string } | null;
}

/**
 * The Analysis box. In the full-size (Classic) ribbon it is a group of its own: the formula over
 * Mol. wt., Exact mass and m/z, with "Analysis", ⌄ and Pop Out under it where the other groups
 * have their names. In the Simplified ribbon it is a one-line chip (formula and weight). Either
 * way a click drops the side panel's full list down under it, or pops it out.
 */
export class AnalysisBox extends DropBox {
  /** The group put on the ribbon: the box, and under it the name with its two buttons. */
  readonly el: HTMLDivElement;
  private float: FloatBox | null = null;
  private popOut: HTMLButtonElement;

  constructor(section: HTMLElement) {
    super(section, 'cr-analysis', 'Analysis: formula, masses, m/z, elemental analysis, name. Click for all of it');
    this.button.innerHTML = `<span class="cr-an-f muted">No structure</span><span class="cr-an-row cr-an-mw"></span><span class="cr-an-row cr-an-ex"></span><span class="cr-an-row cr-an-mz"></span><span class="cr-chev">${CHEVRON}</span>`;
    this.popOut = document.createElement('button');
    this.popOut.type = 'button';
    this.popOut.className = 'cr-popout';
    this.popOut.innerHTML = `${POP_OUT} Pop Out`;
    this.popOut.title = 'Pop out: a window of its own you can move anywhere, or pin at the right';
    this.popOut.addEventListener('click', () => this.detach());

    this.el = document.createElement('div');
    this.el.className = 'cr-an-group';
    const name = document.createElement('div');
    name.className = 'rb-label cr-an-label';
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'cr-an-more';
    more.innerHTML = CHEVRON;
    more.title = 'Show all of the analysis: elemental analysis, properties, isotope pattern, name and look-ups';
    more.setAttribute('aria-label', 'Show all of the analysis');
    more.addEventListener('click', (e) => { e.stopPropagation(); if (this.pop.hidden) this.open(); else this.close(); });
    const pop = document.createElement('button');
    pop.type = 'button';
    pop.className = 'cr-an-pop';
    pop.innerHTML = POP_OUT;
    pop.title = this.popOut.title;
    pop.setAttribute('aria-label', 'Pop out the analysis');
    pop.addEventListener('click', (e) => { e.stopPropagation(); this.detach(); });
    name.append('Analysis', more, pop);
    this.el.append(this.button, name);
    // the ⌄ under the box counts as the box: clicking it again closes the list rather than reopening it
    this.inside = (at) => this.el.contains(at);
  }

  protected override beforeOpen(): void {
    this.pop.prepend(this.popOut);
  }

  /** Under the whole group (its name too) when the name shows, so the list doesn't cover the ⌄. */
  protected override anchor(): HTMLElement {
    return this.el.querySelector<HTMLElement>('.cr-an-label')?.offsetParent ? this.el : this.button;
  }

  override open(): void {
    // (popped out already: the box brings the window forward instead)
    if (this.float?.open) { this.float.show(); return; }
    super.open();
  }

  /** Take the list off the ribbon into a floating window. */
  detach(): void {
    this.close();
    if (!this.float) {
      const f = new FloatBox('Analysis', () => f.dock(!f.docked));
      f.el.classList.add('cr-analysis-float');
      f.body.classList.add('cr-lent');
      this.float = f;
      // closing the window gives the section back to the side panel
      new MutationObserver(() => { if (f.el.hidden) this.lent.giveBack(); }).observe(f.el, { attributes: true, attributeFilter: ['hidden'] });
    }
    this.lent.lend(this.float.body);
    this.float.show(this.button);
  }

  /** Show what was analysed (the first structure), or nothing. */
  set(line: AnalysisLine | null): void {
    const f = this.button.querySelector<HTMLElement>('.cr-an-f')!;
    f.classList.toggle('muted', !line);
    f.innerHTML = line?.formula ?? 'No structure';
    const row = (cls: string, key: string, short: string, v: string | null | undefined) => {
      const el = this.button.querySelector<HTMLElement>(cls)!;
      el.replaceChildren();
      if (!v) return;
      const k = document.createElement('span');
      k.className = 'cr-an-k';
      k.innerHTML = key;
      k.dataset.short = short;
      const n = document.createElement('span');
      n.className = 'cr-an-v';
      n.textContent = v;
      el.append(k, n);
    };
    row('.cr-an-mw', 'Mol. wt.', 'MW', line?.mw);
    row('.cr-an-ex', 'Exact mass', 'Exact', line?.exact);
    row('.cr-an-mz', line?.ion ? `m/z ${line.ion.label}` : '', 'm/z', line?.ion?.mz);
  }
}

/** The warnings: a count with a triangle at the right end of the tabs; the list drops down. */
export class WarningsBox extends DropBox {
  /** Outside the Canvas: what the checks found in the file's structures (null on the Canvas). */
  private file: FileProblems | null = null;
  private onCanvas = 0;
  private canvasAny = true;
  /** Under the list outside the Canvas: how to see each problem marked. */
  private hint = '';

  constructor(section: HTMLElement) {
    super(section, 'cr-warnings', 'Warnings: problems found in the drawing. Click for the list');
    this.set(0);
  }

  /** On the Canvas: how many problems the drawing has (the list is the side panel's Warnings), and whether it has anything to check. */
  set(n: number, any = true): void {
    this.onCanvas = n;
    this.canvasAny = any;
    if (this.file) return;
    const none = !any && !n;
    if (none) this.close();
    this.button.disabled = none;
    this.button.classList.toggle('none', none);
    this.button.title = none ? 'Warnings: there are no structures in this drawing to check' : 'Warnings: problems found in the drawing. Click for the list';
    this.show(n);
  }

  /** In the other modes: what the checks found in the file's structures; null back on the Canvas. */
  setFile(p: FileProblems | null, hint = ''): void {
    this.hint = hint;
    // (the list open from the other kind is put away first: the Canvas's is the side panel's, lent)
    if (!!p !== !!this.file) this.close();
    this.file = p;
    if (!p) { this.set(this.onCanvas, this.canvasAny); return; }
    const none = !p.structures;
    if (none) this.close();
    this.button.disabled = none;
    this.button.classList.toggle('none', none);
    this.button.title = none ? 'Warnings: there are no structures in this file to check' : 'Warnings: problems found in the structures in this file. Click for the list';
    this.show(problemCount(p));
    if (!this.pop.hidden) this.fill();
  }

  private show(n: number): void {
    this.button.classList.toggle('has', n > 0);
    this.button.innerHTML = n
      ? `${WARN_ICON}<span>${n} warning${n === 1 ? '' : 's'}</span><span class="cr-chev" aria-hidden="true">▾</span>`
      : `<span class="cr-ok" aria-hidden="true">✓</span><span>No problems</span>`;
    this.button.setAttribute('aria-label', n ? `${n} warning${n === 1 ? '' : 's'}: show the list` : this.button.disabled ? 'No structures to check' : 'No problems found');
  }

  protected override ownList(): boolean {
    return !!this.file;
  }

  protected override beforeOpen(): void {
    if (this.file) this.fill();
    else this.pop.querySelector(':scope > .cr-file-warnings')?.remove();
  }

  /** The list outside the Canvas: each problem with where it is. */
  private fill(): void {
    const p = this.file!;
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const rows = p.problems.map((x) => `<li><span class="w-where">${esc(x.where)}</span><span>${x.count > 1 ? `<b class="w-count">${x.count}×</b> ` : ''}${esc(x.text)}</span></li>`).join('');
    this.pop.innerHTML = `<section class="cr-file-warnings"><h2>Warnings</h2>${rows ? `<ul class="warn-list">${rows}</ul>` : '<p class="muted">No problems found.</p>'}`
      + (this.hint ? `<p class="muted small">${esc(this.hint)}</p>` : '') + '</section>';
  }
}
