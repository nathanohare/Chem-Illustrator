// The two small boxes on the Canvas ribbon: Analysis (one line, formula and weight, at the right
// end of the buttons) and Warnings (a count at the right end of the tabs). A click drops the
// side panel's own Analysis or Warnings section down under the box; Analysis can also be popped
// out as a floating window, moved anywhere and pinned at the right. Whatever is borrowed goes
// back to the side panel when it is put away.

import { FloatBox } from './float-box';

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
      if (!this.pop.contains(at) && !this.button.contains(at)) this.close();
    }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.pop.hidden) this.close(); });
    window.addEventListener('resize', () => { if (!this.pop.hidden) this.place(); });
  }

  open(): void {
    this.beforeOpen();
    this.lent.lend(this.pop);
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

  /** Under the box, its right edges lined up, kept in the window. */
  private place(): void {
    const r = this.button.getBoundingClientRect();
    const w = this.pop.offsetWidth;
    this.pop.style.left = `${Math.max(4, Math.min(r.right - w, window.innerWidth - w - 4))}px`;
    this.pop.style.top = `${r.bottom + 3}px`;
    this.pop.style.maxHeight = `${Math.max(160, window.innerHeight - r.bottom - 12)}px`;
  }
}

/** The Analysis box: the formula and weight on one line; its list drops down or pops out. */
export class AnalysisBox extends DropBox {
  private float: FloatBox | null = null;
  private popOut: HTMLButtonElement;

  constructor(section: HTMLElement) {
    super(section, 'cr-analysis', 'Analysis: formula, masses, m/z, elemental analysis, name. Click for all of it');
    // three lines in the Classic ribbon (formula, weight, exact mass); one in the Simplified (formula and weight)
    this.button.innerHTML = `<span class="cr-an-f muted">No structure</span><span class="cr-an-mw"></span><span class="cr-an-ex"></span><span class="cr-chev">${CHEVRON}</span>`;
    this.popOut = document.createElement('button');
    this.popOut.type = 'button';
    this.popOut.className = 'cr-popout';
    this.popOut.innerHTML = `${POP_OUT} Pop Out`;
    this.popOut.title = 'Pop out: a window of its own you can move anywhere, or pin at the right';
    this.popOut.addEventListener('click', () => this.detach());
  }

  protected beforeOpen(): void {
    this.pop.prepend(this.popOut);
  }

  open(): void {
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

  /** Show what was analysed: a formula (HTML, with subscripts), its weight and exact mass, or nothing. */
  set(formulaHtml: string | null, mw: string | null, exact: string | null = null): void {
    const f = this.button.querySelector<HTMLElement>('.cr-an-f')!;
    f.classList.toggle('muted', !formulaHtml);
    f.innerHTML = formulaHtml ?? 'No structure';
    const line = (cls: string, key: string, v: string | null) => {
      const el = this.button.querySelector<HTMLElement>(cls)!;
      el.replaceChildren();
      if (!v) return;
      const k = document.createElement('span');
      k.className = 'cr-an-k';
      k.textContent = key;
      el.append(k, v);
    };
    line('.cr-an-mw', 'MW', mw);
    line('.cr-an-ex', 'Exact', exact);
  }
}

/** The warnings: a count with a triangle at the right end of the tabs; the list drops down. */
export class WarningsBox extends DropBox {
  constructor(section: HTMLElement) {
    super(section, 'cr-warnings', 'Warnings: problems found in the drawing. Click for the list');
    this.set(0);
  }

  set(n: number): void {
    this.button.classList.toggle('has', n > 0);
    this.button.innerHTML = n
      ? `${WARN_ICON}<span>${n} warning${n === 1 ? '' : 's'}</span><span class="cr-chev">${CHEVRON}</span>`
      : `<span class="cr-ok" aria-hidden="true">✓</span><span>No problems</span>`;
    this.button.setAttribute('aria-label', n ? `${n} warning${n === 1 ? '' : 's'}: show the list` : 'No problems found');
  }
}
