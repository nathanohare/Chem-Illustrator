// Review > Compare for slides: a box beside the deck listing each difference from the other
// version (slides inserted, deleted or changed there), with the two versions side by side in
// small pictures. Accept takes the other version's slide into this deck (one undo step each);
// Reject leaves this deck as it is. Accept All and Reject All do the rest; End Review closes it.

import { FloatBox } from './float-box';
import { paintSlide } from '../deck/slide-view';
import { onImageReady } from '../render/images';
import { compareDecks, type SlideChange, type SlideView } from '../deck/compare';
import type { Deck, Slide } from '../deck/deck';

export interface SlideCompareHost {
  /** The deck showing now (Accept works only on the deck being compared). */
  deck(): Deck | null;
  flash(msg: string, ms?: number): void;
  /** Called after a change is accepted (the slide list and editor redraw). */
  changed(): void;
}

/** A deck's slides as compared. */
export function viewsOf(d: Deck): SlideView[] {
  return d.slides.map((s, i) => ({ layout: s.layout, contents: d.docOf(i).contents(), notes: s.notes }));
}

type State = 'open' | 'accepted' | 'rejected';

interface Item {
  change: SlideChange;
  state: State;
  /** This deck's slide it is about (changed, deleted), or the slide it goes in after (inserted; null: at the start). */
  slide: Slide | null;
  /** Accepted: the slide it put in (inserted, changed) or took out (deleted), to see whether Undo took it back. */
  made?: Slide;
}

const W = 132;

export class SlideComparePane {
  private box: FloatBox;
  private summary: HTMLParagraphElement;
  private list: HTMLDivElement;
  private mine: Deck | null = null;
  private theirs: Deck | null = null;
  private items: Item[] = [];
  /** This deck's slides as they were when the review began (to find where an inserted slide goes once slides around it have gone). */
  private original: Slide[] = [];
  /** Slides put in by Accept in place of others (old → new). */
  private replaced = new Map<Slide, Slide>();
  /** The last slide put in after each place (so slides inserted after the same one keep their order). */
  private placed = new Map<Slide | null, Slide>();

  constructor(private host: SlideCompareHost) {
    // pinned, it stands down the right side of the window, as PowerPoint's Revisions pane
    this.box = new FloatBox('Compare', () => this.box.dock(!this.box.docked));
    this.box.el.classList.add('sc-pane');
    this.summary = document.createElement('p');
    this.summary.className = 'sc-summary';
    this.summary.setAttribute('role', 'status');
    const bar = document.createElement('div');
    bar.className = 'sc-bar';
    const btn = (label: string, title: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', run);
      return b;
    };
    bar.append(
      btn('Accept All', 'Take every remaining change from the other version', () => this.all(true)),
      btn('Reject All', 'Keep this deck as it is for every remaining change', () => this.all(false)),
      btn('End Review', 'Close the comparison (changes not accepted are left out)', () => this.close()),
    );
    this.list = document.createElement('div');
    this.list.className = 'sc-list';
    this.box.body.append(this.summary, bar, this.list);
  }

  get open(): boolean {
    return this.box.open;
  }

  close(): void {
    this.box.close();
    this.mine = this.theirs = null;
    this.items = [];
    this.unwatch?.();
    this.unwatch = null;
  }

  private unwatch: (() => void) | null = null;
  private thumbs: { cv: HTMLCanvasElement; d: Deck; i: number }[] = [];
  private painting = 0;
  private seen = '';

  /**
   * The deck changed (an edit, Undo or Redo): a change accepted and then undone is open again,
   * and one redone accepted again.
   */
  deckChanged(d: Deck): void {
    if (!this.open || d !== this.mine) return;
    const key = `${d.slides.map((s) => s.id).join(',')}|${this.items.map((it) => this.stateOf(it)).join('')}`;
    if (key !== this.seen) this.render();
  }

  /** Where a change stands now: an accepted one whose slide Undo took back (or put back) is open again. */
  private stateOf(it: Item): State {
    if (it.state !== 'accepted' || !it.made || !this.mine) return it.state;
    const there = this.mine.slides.includes(it.made);
    return (it.change.kind === 'deleted' ? !there : there) ? 'accepted' : 'open';
  }

  /** Compare `mine` (the deck showing) with `theirs` (another version, named `name`) and list the changes. */
  start(mine: Deck, theirs: Deck, name: string, near?: HTMLElement | null): number {
    this.mine = mine;
    this.theirs = theirs;
    this.original = mine.slides.slice();
    this.replaced.clear();
    this.placed.clear();
    const changes = compareDecks(viewsOf(mine), viewsOf(theirs));
    this.items = changes.map((c) => ({
      change: c,
      state: 'open',
      slide: c.kind === 'inserted' ? (mine.slides[c.after] ?? null) : mine.slides[c.mine],
    }));
    this.box.title = `Compare with ${name}`;
    // pictures still loading draw grey at first: the thumbnails again once they are in
    this.unwatch?.();
    this.unwatch = onImageReady(() => {
      if (this.painting) return;
      this.painting = requestAnimationFrame(() => { this.painting = 0; for (const t of this.thumbs) this.paint(t.cv, t.d, t.i); });
    });
    this.render();
    this.box.show(near);
    return changes.length;
  }

  /** Where a slide of the original deck is now (following slides put in its place, unless Undo took them back), or -1. */
  private where(s: Slide): number {
    let at: Slide = s;
    let found = this.mine!.slides.indexOf(at);
    for (let n = 0; this.replaced.has(at) && n < 1000; n++) {
      at = this.replaced.get(at)!;
      const k = this.mine!.slides.indexOf(at);
      if (k >= 0) found = k;
    }
    return found;
  }

  /** The place an inserted slide goes in after: its slide, or the nearest earlier one still in the deck. */
  private after(anchor: Slide | null): number {
    const last = this.placed.get(anchor);
    if (last) {
      const k = this.mine!.slides.indexOf(last);
      if (k >= 0) return k;
    }
    if (!anchor) return -1;
    for (let o = this.original.indexOf(anchor); o >= 0; o--) {
      const k = this.where(this.original[o]);
      if (k >= 0) return k;
    }
    return -1;
  }

  private ready(): boolean {
    if (!this.mine || this.host.deck() !== this.mine) {
      this.host.flash('Go back to the deck being compared to accept changes.');
      return false;
    }
    return true;
  }

  /** Accept one change; false when it could not be made. */
  private accept(it: Item): boolean {
    const mine = this.mine!, theirs = this.theirs!;
    const c = it.change;
    if (c.kind === 'inserted') {
      const after = this.after(it.slide);
      mine.pasteSlides(theirs.copySlides([c.theirs]), false, after);
      it.made = mine.slides[after + 1];
      this.placed.set(it.slide, it.made);
    } else if (c.kind === 'deleted') {
      const i = this.where(it.slide!);
      if (i < 0) return false;
      const gone = mine.slides[i];
      if (!mine.remove([i])) { this.host.flash("The deck's last slide can't be deleted."); return false; }
      it.made = gone;
    } else {
      const i = this.where(it.slide!);
      if (i < 0) return false;
      const old = mine.slides[i];
      if (!mine.replaceSlide(i, theirs.copySlides([c.theirs]))) return false;
      it.made = mine.slides[i];
      this.replaced.set(old, it.made);
    }
    it.state = 'accepted';
    return true;
  }

  private decide(it: Item, yes: boolean): void {
    if (this.stateOf(it) !== 'open') return;
    if (yes) {
      if (!this.ready() || !this.accept(it)) return;
      this.host.changed();
    } else it.state = 'rejected';
    this.render();
  }

  private all(yes: boolean): void {
    if (yes && !this.ready()) return;
    let n = 0;
    for (const it of this.items) {
      if (this.stateOf(it) !== 'open') continue;
      if (!yes) { it.state = 'rejected'; n++; } else if (this.accept(it)) n++;
    }
    if (yes && n) this.host.changed();
    this.host.flash(`${yes ? 'Accepted' : 'Rejected'} ${n} change${n === 1 ? '' : 's'}.`);
    this.render();
  }

  /** Go to the slide a change is about (or the one it would go in after). */
  private goTo(it: Item): void {
    if (!this.mine || this.host.deck() !== this.mine || !it.slide) return;
    const c = it.change;
    const i = c.kind === 'inserted' ? this.after(it.slide) : this.where(it.slide);
    if (i >= 0) this.mine.go(i);
  }

  private render(): void {
    if (this.mine) this.seen = `${this.mine.slides.map((s) => s.id).join(',')}|${this.items.map((it) => this.stateOf(it)).join('')}`;
    this.thumbs = [];
    const left = this.items.filter((i) => this.stateOf(i) === 'open').length;
    this.summary.textContent = !this.items.length
      ? 'The two versions are the same: no changes to review.'
      : left
        ? `${left} of ${this.items.length} change${this.items.length === 1 ? '' : 's'} to review.`
        : `All ${this.items.length} change${this.items.length === 1 ? '' : 's'} reviewed.`;
    this.list.replaceChildren(...this.items.map((it) => this.row(it)));
  }

  private thumb(d: Deck, i: number, label: string): HTMLElement {
    const fig = document.createElement('figure');
    fig.className = 'sc-thumb';
    const cap = document.createElement('figcaption');
    cap.textContent = label;
    if (i >= 0 && i < d.slides.length) {
      const cv = document.createElement('canvas');
      this.paint(cv, d, i);
      this.thumbs.push({ cv, d, i });
      fig.append(cv);
    } else {
      const none = document.createElement('div');
      none.className = 'sc-none';
      none.textContent = 'No slide';
      fig.append(none);
    }
    fig.append(cap);
    return fig;
  }

  private paint(cv: HTMLCanvasElement, d: Deck, i: number): void {
    if (i < 0 || i >= d.slides.length) return;
    const h = Math.round((W * d.size.h) / d.size.w);
    cv.style.width = `${W}px`;
    cv.style.height = `${h}px`;
    try {
      paintSlide(cv, W, h, window.devicePixelRatio || 1, d.page(i), d.docOf(i), '#fff');
    } catch { /* a slide that can't be drawn (no canvas in tests) still lists */ }
  }

  private row(it: Item): HTMLElement {
    const c = it.change;
    const row = document.createElement('div');
    const state = this.stateOf(it);
    row.className = `sc-item sc-${state}`;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'sc-head';
    const kind = c.kind === 'inserted' ? 'Inserted slide' : c.kind === 'deleted' ? 'Deleted slide' : 'Changed slide';
    head.textContent = `${kind}${c.title ? `: ${c.title}` : ''}`;
    head.title = 'Go to it';
    head.addEventListener('click', () => this.goTo(it));
    const ul = document.createElement('ul');
    ul.className = 'sc-details';
    for (const d of c.details) {
      const li = document.createElement('li');
      li.textContent = d;
      ul.append(li);
    }
    const thumbs = document.createElement('div');
    thumbs.className = 'sc-thumbs';
    const mineAt = c.kind === 'inserted' ? -1 : state === 'open' && it.slide ? this.where(it.slide) : -1;
    if (state === 'open') thumbs.append(this.thumb(this.mine!, mineAt, 'This deck'));
    thumbs.append(this.thumb(this.theirs!, c.kind === 'deleted' ? -1 : c.theirs, 'Other version'));
    row.append(head, ul, thumbs);
    if (state === 'open') {
      const bar = document.createElement('div');
      bar.className = 'sc-act';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = 'Accept';
      ok.title = c.kind === 'inserted' ? 'Put this slide in' : c.kind === 'deleted' ? 'Delete this slide' : "Use the other version's slide";
      ok.addEventListener('click', () => this.decide(it, true));
      const no = document.createElement('button');
      no.type = 'button';
      no.textContent = 'Reject';
      no.title = 'Keep this deck as it is';
      no.addEventListener('click', () => this.decide(it, false));
      bar.append(ok, no);
      row.append(bar);
    } else {
      const s = document.createElement('p');
      s.className = 'muted small';
      s.textContent = state === 'accepted' ? 'Accepted' : 'Rejected';
      row.append(s);
    }
    return row;
  }
}
