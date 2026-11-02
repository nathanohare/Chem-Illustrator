// The slide show (F5): slides full screen, one after another, as in PowerPoint, with their
// transitions and animations. Next (the next animation, else the next slide): click, →, ↓, Space,
// Enter, Page Down or N. Back: ←, ↑, Backspace, Page Up or P.
// Home and End go to the first and last slide; a number then Enter goes to that slide.
// B (or .) makes the screen black and W (or ,) white until a key is pressed. Esc ends the show.
// On a canvas slide, drag to look round the canvas and scroll (or + and −) to zoom; Esc, a click or
// Next glides back to where the show was. G shows every slide to pick from, M the canvas's map;
// the controls in the top right corner do the same.
// The laser pointer, pen and highlighter are on the bar at the bottom left (show-ink.ts); links,
// action buttons, zooms, videos and sounds take clicks on them (show-actions.ts).
//
// Set Up Show decides the rest: which slides play and in what order (a range, a custom show),
// going round again (loop, kiosk), timings, narration and animations. A show browsed by one
// person (and Reading View) plays in the window with Back and Next below it, not full screen.
// Rehearse Timings and Record play the show with a bar at the top that times each slide (and
// records the microphone); at the end the times (and recordings) can be kept on the slides.

import { isTauri } from '@tauri-apps/api/core';
import type { Deck } from '../deck/deck';
import { Player } from '../deck/playback';
import { onImageReady } from '../render/images';
import { followLink } from './links-ui';
import { ShowActions } from './show-actions';
import { ShowInk, type Stroke } from './show-ink';
import { ask } from './ask';
import { clockText } from '../deck/show-link';
import { Recorder } from '../deck/narration';
import { paintSlide } from '../deck/slide-view';

const NOTES_KEY = 'chem-illustrator.rehearse-notes';

/** Whether the notes show under the slide in a rehearsal (on unless turned off). */
function notesWanted(): boolean {
  try { return localStorage.getItem(NOTES_KEY) !== 'off'; } catch { return true; }
}

function rememberNotes(on: boolean): void {
  try { localStorage.setItem(NOTES_KEY, on ? 'on' : 'off'); } catch { /* for this show only */ }
}

/** Each slide's time in a rehearsal, in slide order, for the window that asks to keep them. */
export function rehearsalLines(times: Map<number, number>, recordings: Map<number, unknown>, count: number): [string, string][] {
  return [...times.entries()].filter(([i]) => i >= 0 && (count === 0 || i < count)).sort((a, b) => a[0] - b[0])
    .map(([i, t]) => [`Slide ${i + 1}`, `${clockText(t)}${recordings.has(i) ? '  🎙' : ''}`]);
}

/** How a show runs (from Set Up Show, or Rehearse Timings, Record and Reading View). */
export interface ShowOptions {
  /** The slides it plays, in order (null: every slide not hidden). */
  order?: number[] | null;
  noAnimation?: boolean;
  noNarration?: boolean;
  /** Only clicks go on (the slides' times are not used). */
  manual?: boolean;
  /** Back to the first slide after the last, until Esc. */
  loop?: boolean;
  /** At a kiosk: full screen, going on by itself, round again; clicks only follow links and buttons. */
  kiosk?: boolean;
  /** In the window, with Back and Next below (a show browsed by one person, Reading View). */
  windowed?: boolean;
  /** Time each slide (Rehearse Timings), and with `record` record the microphone for each too. */
  rehearse?: boolean;
  record?: boolean;
}

/** What a rehearsal (or recording) came to: each slide's time, and its narration if recorded. */
export interface Rehearsal { times: Map<number, number>; recordings: Map<number, Blob>; total: number }

export class Presenter {
  private root: HTMLDivElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private deck: Deck | null = null;
  private player: Player | null = null;
  /** Black or white screen, or the end-of-show screen. */
  private blank: 'black' | 'white' | 'end' | null = null;
  private typed = '';
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  private resizeHandler = () => { this.size(); this.paint(); };
  private wasFullscreen = false;
  private hideCursorTimer = 0;

  private actions: ShowActions | null = null;
  private ink: ShowInk | null = null;
  /** The controls in the bottom right corner (zoom, back, map, slides), and the grid of slides. */
  private corner: { el: HTMLDivElement; zoom: HTMLElement[]; back: HTMLButtonElement; map: HTMLButtonElement } | null = null;
  private grid: HTMLDivElement | null = null;
  /** A drag looking round a canvas slide: where the pointer was, and whether it has moved yet. */
  private drag: { x: number; y: number; moved: boolean } | null = null;
  /** The click that ends a drag is not a click on the slide. */
  private dragged = false;

  /** Called when the show ends (with the slide it ended on, to edit next). */
  onEnd: (index: number) => void = () => {};
  /** Called with the ink drawn in the show, by slide, when the presenter keeps it. */
  onKeepInk: (ink: Map<number, Stroke[]>) => void = () => {};
  /** Called at the end of a rehearsal or recording with the times (and recordings) to keep. */
  onRehearsed: (r: Rehearsal) => void = () => {};

  private opts: ShowOptions = {};
  /** Rehearse Timings and Record: the bar at the top, when each slide started, the times so far. */
  private rehearse: {
    bar: HTMLDivElement; slide: HTMLSpanElement; total: HTMLSpanElement; pause: HTMLButtonElement;
    i: number; t0: number; paused: number | null; before: number; times: Map<number, number>; recordings: Map<number, Blob>;
    rec: Recorder | null; tick: number; pending: Promise<void>[];
    /** Your notes for the slide showing, under the slide (Record's teleprompter); null when turned off. */
    notes: HTMLDivElement; notesBtn: HTMLButtonElement;
    /** The 3, 2, 1 before recording starts: the clock waits for it. */
    countdown: number;
  } | null = null;

  constructor() {
    onImageReady(() => { if (this.root) this.player?.refresh(); });
  }

  get running(): boolean {
    return this.root !== null;
  }

  async start(deck: Deck, from = 0, opts: ShowOptions = {}): Promise<void> {
    if (this.root) return;
    this.deck = deck;
    this.blank = null;
    this.opts = opts;
    const root = document.createElement('div');
    root.className = 'present';
    root.classList.toggle('windowed', !!opts.windowed);
    root.tabIndex = -1;
    const canvas = document.createElement('canvas');
    root.append(canvas);
    document.body.append(root);
    this.root = root;
    this.canvas = canvas;
    const player = new Player(canvas, deck);
    player.order = opts.order ?? null;
    player.noAnimation = !!opts.noAnimation;
    player.noNarration = !!opts.noNarration;
    // a rehearsal times the slides itself (their old times don't move it on)
    player.useTimings = !opts.manual && !opts.rehearse;
    player.onPastEnd = () => {
      if ((opts.loop || opts.kiosk) && !opts.rehearse) { player.show(player.first, { transition: true }); return; }
      this.blank = 'end';
      this.paint();
    };
    this.player = player;
    const actions = (this.actions = new ShowActions(deck, player, canvas, {
      go: (i) => this.go(i, false), next: () => this.next(), prev: () => this.prev(), end: () => this.stop(), open: (link) => void followLink(link),
    }));
    const ink = (this.ink = new ShowInk(root, canvas, { slide: () => player.i, place: () => player.slidePlace }));
    player.onChange = () => { actions.noteSlide(player.i); ink.paint(); this.slideShown(player.i); this.updateBar(); this.updateCorner(); };
    // a click on a link, action button, zoom, video or sound acts on it, as in PowerPoint's slide show; anywhere else goes on (not at a kiosk)
    root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.show-bar, .rehearse-bar, .rehearse-notes, .show-corner, .show-grid')) return;
      if (this.dragged) { this.dragged = false; return; }
      if (!this.clickThing(e) && !opts.kiosk) this.next();
    });
    // on a canvas slide, a drag looks round the canvas
    root.addEventListener('pointerdown', (e) => {
      this.dragged = false;
      if (opts.kiosk || e.button !== 0 || !this.player?.canLookRound || this.grid) return;
      if ((e.target as HTMLElement).closest('.show-bar, .rehearse-bar, .rehearse-notes, .show-corner, .show-tools')) return;
      if (this.ink && this.ink.tool !== 'arrow' && this.ink.tool !== 'laser') return;
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    root.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || !(e.buttons & 1)) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 5) return;
      if (!d.moved) { d.moved = true; root.classList.add('panning'); }
      d.x = e.clientX;
      d.y = e.clientY;
      this.player?.panBy(dx, dy);
    });
    const endDrag = () => { if (this.drag?.moved) this.dragged = true; this.drag = null; root.classList.remove('panning'); };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
    root.addEventListener('pointermove', (e) => { if (this.canvas) this.canvas.style.cursor = this.thingUnder(e) ? 'pointer' : ''; });
    root.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!opts.kiosk) this.prev(); });
    root.addEventListener('wheel', (e) => {
      if (opts.kiosk || this.grid) return;
      // a canvas slide zooms where the pointer is; any other slide goes on or back
      if (this.player?.canLookRound) {
        e.preventDefault();
        const p = this.point(e);
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.player.zoomAt(Math.exp(-dy * 0.0015), p.x, p.y);
        return;
      }
      if (e.deltaY > 0) this.next(); else if (e.deltaY < 0) this.prev();
    }, { passive: false });
    root.addEventListener('pointermove', () => this.showCursor());
    if (opts.windowed) this.addShowBar(root);
    if (!opts.kiosk) this.addCorner(root);
    if (opts.rehearse) await this.startRehearsal(root, !!opts.record);
    if (this.root !== root) return;
    window.addEventListener('keydown', this.keyHandler, true);
    window.addEventListener('resize', this.resizeHandler);
    root.focus();
    if (!opts.windowed) await this.fullscreen(true);
    // the show may have been ended while the window went full screen
    if (this.root !== root) { void this.fullscreen(false); return; }
    this.size();
    // the first slide comes in with its transition too, as in PowerPoint
    const start = player.order ? (player.order.includes(from) ? from : player.first) : from;
    player.show(Math.max(0, Math.min(deck.slides.length - 1, start)), { transition: true });
    if (this.rehearse?.rec) this.startCountdown();
    this.showCursor();
    // painted again once the fonts it asked for have come (not when none was still to come)
    if (document.fonts && document.fonts.status !== 'loaded') void document.fonts.ready.then(() => { if (this.player === player) player.refresh(); });
  }

  /** Back and Next, and where the show is, below a show in the window (Reading View). */
  private bar: { count: HTMLSpanElement } | null = null;
  private addShowBar(root: HTMLDivElement): void {
    const bar = document.createElement('div');
    bar.className = 'show-bar';
    const btn = (label: string, title: string, f: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); f(); root.focus(); });
      return b;
    };
    const count = document.createElement('span');
    count.className = 'show-count';
    bar.append(btn('◀ Back', 'The slide (or animation) before (←)', () => this.prev()), count, btn('Next ▶', 'The next animation or slide (→, Space or a click)', () => this.next()),
      btn('✕ Close', 'End the show (Esc)', () => this.stop()));
    root.append(bar);
    this.bar = { count };
  }

  private updateBar(): void {
    const p = this.player, d = this.deck;
    if (!this.bar || !p || !d) return;
    const order = p.order ?? d.slides.map((_, i) => i).filter((i) => !d.slides[i].hidden);
    const k = order.indexOf(p.i);
    this.bar.count.textContent = `Slide ${k >= 0 ? k + 1 : p.i + 1} of ${order.length}`;
  }

  /** Rehearse Timings (and Record): the bar at the top with the slide's time and the whole show's. */
  private async startRehearsal(root: HTMLDivElement, record: boolean): Promise<void> {
    let rec: Recorder | null = null;
    if (record) {
      rec = new Recorder();
      if (!(await rec.open())) {
        rec = null;
        await ask('Record', [], { noCancel: true, note: 'The microphone could not be used (there is none, or it was not allowed), so the show will only be timed. Allow the microphone in your system settings to record narration.' });
      }
    }
    const bar = document.createElement('div');
    bar.className = 'rehearse-bar';
    const label = document.createElement('span');
    label.className = 'rh-what';
    label.textContent = rec ? '● Recording' : 'Rehearsal';
    const slide = document.createElement('span');
    slide.className = 'rh-slide';
    slide.title = 'Time on this slide';
    const total = document.createElement('span');
    total.className = 'rh-total';
    total.title = 'Time for the whole show so far';
    const b = (text: string, title: string, f: () => void) => {
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = text;
      x.title = title;
      x.addEventListener('click', (e) => { e.stopPropagation(); f(); root.focus(); });
      return x;
    };
    const next = b('Next ▶', 'Go on to the next animation or slide (→ or a click)', () => this.next());
    const pause = b('❚❚ Pause', 'Stop the clock (and the recording) for now', () => this.pauseRehearsal());
    const repeat = b('↺ Repeat', 'Start this slide\'s time again (and its recording)', () => this.repeatSlide());
    const notesBtn = b('Notes', 'Show your speaker notes for each slide under it while you practise or record (only you see them here)', () => this.toggleNotes());
    bar.append(label, next, pause, slide, repeat, total, notesBtn);
    const notes = document.createElement('div');
    notes.className = 'rehearse-notes';
    notes.setAttribute('aria-live', 'polite');
    root.append(bar, notes);
    this.rehearse = {
      bar, slide, total, pause, i: -1, t0: performance.now(), paused: null, before: 0, times: new Map(), recordings: new Map(), rec, tick: 0, pending: [],
      notes, notesBtn, countdown: 0,
    };
    this.showNotes(notesWanted());
    this.rehearse.tick = window.setInterval(() => this.updateRehearsal(), 250);
  }

  /** Show or hide the notes under the slide (remembered for next time). */
  private toggleNotes(): void {
    const r = this.rehearse;
    if (!r) return;
    const on = r.notes.classList.contains('off');
    this.showNotes(on);
    rememberNotes(on);
  }

  private showNotes(on: boolean): void {
    const r = this.rehearse;
    if (!r) return;
    r.notes.classList.toggle('off', !on);
    r.notesBtn.setAttribute('aria-pressed', String(on));
    r.notesBtn.classList.toggle('on', on);
    this.fillNotes();
  }

  private fillNotes(): void {
    const r = this.rehearse, d = this.deck, p = this.player;
    if (!r || !d || !p) return;
    const text = d.slides[p.i]?.notes.trim() ?? '';
    r.notes.textContent = text;
    r.notes.hidden = !text || r.notes.classList.contains('off');
  }

  /**
   * Record: 3, 2, 1 on the slide before the clock and the microphone start, so the first words
   * aren't cut off. A key or click starts at once.
   */
  private startCountdown(): void {
    const r = this.rehearse;
    if (!r || !this.root) return;
    this.pauseRehearsal();
    // the clock isn't paused by you: Pause waits for the countdown
    r.pause.textContent = '❚❚ Pause';
    r.pause.disabled = true;
    const box = document.createElement('div');
    box.className = 'rehearse-countdown';
    this.root.append(box);
    let n = 3;
    const done = () => {
      if (!this.rehearse || this.rehearse.countdown === 0) return;
      clearInterval(this.rehearse.countdown);
      this.rehearse.countdown = 0;
      box.remove();
      this.rehearse.pause.disabled = false;
      if (this.rehearse.paused !== null) this.pauseRehearsal();
    };
    const tick = () => {
      if (n <= 0) { done(); return; }
      box.textContent = String(n);
      box.title = 'Recording starts at 0 (a click or key starts it now)';
      n--;
    };
    tick();
    r.countdown = window.setInterval(tick, 1000);
    box.addEventListener('click', (e) => { e.stopPropagation(); done(); });
    this.endCountdown = done;
  }

  /** Ends the countdown at once (a key or click while it runs). */
  private endCountdown: (() => void) | null = null;

  private elapsed(): number {
    const r = this.rehearse;
    if (!r) return 0;
    return ((r.paused ?? performance.now()) - r.t0) / 1000;
  }

  private updateRehearsal(): void {
    const r = this.rehearse;
    if (!r) return;
    const t = this.elapsed();
    r.slide.textContent = clockText(t);
    r.total.textContent = clockText(r.before + t);
  }

  /** A slide came on: the one before gets its time (and recording). */
  private slideShown(i: number): void {
    const r = this.rehearse;
    if (!r || i === r.i) return;
    this.closeSlide();
    r.i = i;
    r.t0 = performance.now();
    if (r.paused !== null) r.paused = r.t0;
    if (r.rec) { r.rec.start(); if (r.paused !== null) r.rec.pause(true); }
    this.fillNotes();
  }

  /** Keep the time (and recording) of the slide showing in the rehearsal. */
  private closeSlide(): void {
    const r = this.rehearse;
    if (!r || r.i < 0) return;
    const t = +this.elapsed().toFixed(1);
    r.times.set(r.i, t);
    r.before += t;
    const i = r.i;
    if (r.rec) r.pending.push(r.rec.finish().then((blob) => { if (blob) r.recordings.set(i, blob); }));
    r.i = -1;
  }

  private pauseRehearsal(): void {
    const r = this.rehearse;
    if (!r) return;
    if (r.paused === null) { r.paused = performance.now(); r.pause.textContent = '▶ Resume'; r.rec?.pause(true); }
    else { r.t0 += performance.now() - r.paused; r.paused = null; r.pause.textContent = '❚❚ Pause'; r.rec?.pause(false); }
    this.updateRehearsal();
  }

  private repeatSlide(): void {
    const r = this.rehearse;
    if (!r) return;
    r.t0 = performance.now();
    if (r.paused !== null) r.paused = r.t0;
    if (r.rec) { void r.rec.finish(); r.rec.start(); if (r.paused !== null) r.rec.pause(true); }
    this.updateRehearsal();
  }

  /** The end of a rehearsal: ask whether to keep the new times (and recordings). */
  private async endRehearsal(): Promise<void> {
    const r = this.rehearse;
    if (!r) return;
    this.closeSlide();
    clearInterval(r.tick);
    if (r.countdown) clearInterval(r.countdown);
    this.endCountdown = null;
    await Promise.all(r.pending);
    r.rec?.close();
    this.rehearse = null;
    if (!r.times.size) return;
    const lines = rehearsalLines(r.times, r.recordings, this.deck?.slides.length ?? 0);
    const recorded = r.recordings.size > 0;
    const got = await ask(r.rec ? 'Keep Recording?' : 'Keep Timings?', recorded ? [
      { name: 'narration', label: 'Keep the narration too', type: 'checkbox', value: 'true', help: 'Untick to keep only the times (the slides keep any narration they had)' },
    ] : [], {
      ok: 'Keep',
      note: `This run took ${clockText(r.before)}. Keep each slide's time${recorded ? ' and its narration' : ''}, so the show goes on by itself when it is played? Slides not shown keep what they had. (${recorded ? 'Narration goes on each slide as a sound that plays as it comes in. ' : ''}Set Up Show can turn timings off.)`,
      lines,
    });
    if (got) this.onRehearsed({ times: r.times, recordings: got.narration === 'false' ? new Map() : r.recordings, total: r.before });
  }

  stop(): void {
    if (!this.root) return;
    const rehearsing = !!this.rehearse;
    if (rehearsing) this.closeSlide();
    this.bar = null;
    this.corner = null;
    this.grid = null;
    this.drag = null;
    const ink = this.ink?.any ? this.ink.all() : null;
    this.ink?.remove();
    this.ink = null;
    this.actions = null;
    window.removeEventListener('keydown', this.keyHandler, true);
    window.removeEventListener('resize', this.resizeHandler);
    clearTimeout(this.hideCursorTimer);
    const i = this.player?.i ?? 0;
    this.player?.stop();
    this.player = null;
    this.root.remove();
    this.root = null;
    this.canvas = null;
    if (!this.opts.windowed) void this.fullscreen(false);
    this.onEnd(i);
    const after = rehearsing ? this.endRehearsal() : Promise.resolve();
    if (ink) void after.then(() => askKeepInk()).then((keep) => { if (keep) this.onKeepInk(ink); });
  }

  private async fullscreen(on: boolean): Promise<void> {
    try {
      if (isTauri()) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const w = getCurrentWindow();
        if (on) {
          this.wasFullscreen = await w.isFullscreen();
          if (!this.wasFullscreen) await w.setFullscreen(true);
        } else if (!this.wasFullscreen) await w.setFullscreen(false);
      } else if (on) {
        await this.root?.requestFullscreen?.();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // the show still runs, filling the window
    }
  }

  private showCursor(): void {
    if (!this.root) return;
    this.root.classList.remove('no-cursor');
    clearTimeout(this.hideCursorTimer);
    this.hideCursorTimer = window.setTimeout(() => this.root?.classList.add('no-cursor'), 2500);
  }

  private point(e: MouseEvent): { x: number; y: number } {
    const r = this.canvas!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private thingUnder(e: MouseEvent): boolean {
    if (!this.canvas || this.blank || !this.actions) return false;
    const p = this.point(e);
    return this.actions.clickable(p.x, p.y);
  }

  /** Act on what was clicked, if anything takes a click there. */
  private clickThing(e: MouseEvent): boolean {
    if (!this.canvas || this.blank || !this.actions) return false;
    const p = this.point(e);
    return this.actions.click(p.x, p.y);
  }

  private next(): void {
    if (this.rehearse?.countdown) { this.endCountdown?.(); return; }
    if (this.blank === 'black' || this.blank === 'white') { this.blank = null; this.paint(); return; }
    if (this.blank === 'end') { this.stop(); return; }
    this.player?.next();
  }

  private prev(): void {
    if (this.blank) { this.blank = null; this.paint(); return; }
    this.player?.prev();
  }

  /** Go to a slide; `jump` (a number typed, Home, End) forgets zooms to come back from. */
  private go(i: number, jump = true): void {
    this.blank = null;
    if (jump) this.actions?.forgetReturns();
    this.player?.show(Math.max(0, Math.min(this.deck!.slides.length - 1, i)));
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.root) return;
    // every key belongs to the show while it runs
    e.preventDefault();
    e.stopPropagation();
    if (this.grid) { this.gridKey(e); return; }
    if (this.ink?.key(e)) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { this.typed += k; return; }
    if (k === 'Enter' && this.typed) { this.go(Number(this.typed) - 1); this.typed = ''; return; }
    this.typed = '';
    if (k === 'Escape') { if (!this.player?.lookBack()) this.stop(); }
    // at a kiosk only Esc (and clicks on links and buttons) do anything
    else if (this.opts.kiosk) return;
    else if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown', 'n', 'N'].includes(k)) this.next();
    else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp', 'p', 'P'].includes(k)) this.prev();
    else if (k === 'Home') this.go(this.player!.first);
    else if (k === 'End') this.go(this.player!.last);
    else if (k === 'b' || k === 'B' || k === '.') { this.blank = this.blank === 'black' ? null : 'black'; this.paint(); }
    else if (k === 'w' || k === 'W' || k === ',') { this.blank = this.blank === 'white' ? null : 'white'; this.paint(); }
    else if (k === 'g' || k === 'G') this.openGrid();
    else if (k === 'm' || k === 'M') this.toggleMap();
    else if (k === '+' || k === '=') this.player?.zoomAt(1.25);
    else if (k === '-' || k === '_') this.player?.zoomAt(0.8);
  }

  // ---------------------------------------------------------------- looking round, and every slide

  /** Zoom, back to the show, the canvas's map and every slide, in the top right corner (they fade when the mouse is still). */
  private addCorner(root: HTMLDivElement): void {
    const el = document.createElement('div');
    el.className = 'show-corner';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', 'Show navigation');
    const btn = (label: string, title: string, f: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', (e) => { e.stopPropagation(); f(); root.focus(); });
      el.append(b);
      return b;
    };
    const out = btn('−', 'Zoom out (−)', () => this.player?.zoomAt(0.8));
    const into = btn('+', 'Zoom in (+, or scroll)', () => this.player?.zoomAt(1.25));
    const back = btn('⤺', 'Back to where the show was (Esc)', () => this.player?.lookBack());
    const map = btn('Map', 'The canvas\'s map in the corner (M)', () => this.toggleMap());
    btn('▦', 'Every slide, to pick one (G)', () => this.openGrid());
    root.append(el);
    this.corner = { el, zoom: [out, into, map], back, map };
    this.updateCorner();
  }

  private updateCorner(): void {
    const c = this.corner, p = this.player;
    if (!c || !p) return;
    const canvas = p.canLookRound;
    for (const b of c.zoom) b.hidden = !canvas;
    c.back.hidden = !p.lookingRound;
    c.map.setAttribute('aria-pressed', String(p.mapOn));
  }

  private toggleMap(): void {
    const p = this.player;
    if (!p) return;
    p.mapOn = !p.mapOn;
    p.paint();
    this.updateCorner();
  }

  /** Every slide in the show as a picture to pick, over the show (G); Esc or G again goes back. */
  private openGrid(): void {
    const root = this.root, d = this.deck, p = this.player;
    if (!root || !d || !p || this.grid) return;
    const grid = document.createElement('div');
    grid.className = 'show-grid';
    grid.setAttribute('role', 'dialog');
    grid.setAttribute('aria-label', 'Slides');
    grid.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === grid) this.closeGrid(); });
    const order = p.order ?? d.slides.map((_, i) => i).filter((i) => !d.slides[i].hidden);
    const W = 220, H = Math.round((W * d.size.h) / d.size.w);
    const todo: [HTMLCanvasElement, number][] = [];
    for (const [n, i] of order.entries()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'show-grid-slide';
      if (i === p.i) b.classList.add('now');
      b.setAttribute('aria-label', `Slide ${n + 1}`);
      const c = document.createElement('canvas');
      c.style.width = `${W}px`;
      c.style.height = `${H}px`;
      const num = document.createElement('span');
      num.textContent = String(n + 1);
      b.append(c, num);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.closeGrid(); this.go(i); });
      grid.append(b);
      todo.push([c, i]);
    }
    root.append(grid);
    this.grid = grid;
    grid.querySelector<HTMLButtonElement>('.now')?.focus();
    grid.querySelector('.now')?.scrollIntoView?.({ block: 'center' });
    // the pictures a few at a time, so the grid comes up at once
    const paintSome = () => {
      if (this.grid !== grid) return;
      const t0 = performance.now();
      while (todo.length && performance.now() - t0 < 30) {
        const [c, i] = todo.shift()!;
        try { paintSlide(c, W, H, window.devicePixelRatio || 1, d.page(i), d.docOf(i), '#fff'); } catch { /* left blank */ }
      }
      if (todo.length) setTimeout(paintSome, 0);
    };
    paintSome();
  }

  private closeGrid(): void {
    this.grid?.remove();
    this.grid = null;
    this.root?.focus();
  }

  /** Keys while the grid of slides is up: arrows move between slides, Enter picks, Esc or G goes back. */
  private gridKey(e: KeyboardEvent): void {
    const grid = this.grid!;
    const items = [...grid.querySelectorAll<HTMLButtonElement>('.show-grid-slide')];
    const at = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const cols = Math.max(1, items.filter((b) => b.offsetTop === items[0].offsetTop).length);
    const k = e.key;
    const to = (i: number) => items[Math.max(0, Math.min(items.length - 1, i))]?.focus();
    if (k === 'Escape' || k === 'g' || k === 'G') this.closeGrid();
    else if (k === 'Enter' || k === ' ') items[at]?.click();
    else if (k === 'ArrowRight') to(at + 1);
    else if (k === 'ArrowLeft') to(at - 1);
    else if (k === 'ArrowDown') to(at + cols);
    else if (k === 'ArrowUp') to(at - cols);
    else if (k === 'Home') to(0);
    else if (k === 'End') to(items.length - 1);
  }

  private size(): void {
    const root = this.root;
    if (!root) return;
    // in the window, the bar below takes its room
    const below = this.bar ? 40 : 0;
    const w = root.clientWidth || window.innerWidth, h = (root.clientHeight || window.innerHeight) - below;
    this.player?.resize(w, h, window.devicePixelRatio || 1);
    this.ink?.paint();
  }

  private paint(): void {
    const canvas = this.canvas, root = this.root;
    if (!canvas || !root) return;
    if (!this.blank) { this.player?.paint(); return; }
    const w = root.clientWidth || window.innerWidth, h = root.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.blank === 'white' ? '#fff' : '#000';
    ctx.fillRect(0, 0, w, h);
    if (this.blank === 'end') {
      ctx.fillStyle = '#bbb';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText('End of slide show. Click or press a key to finish.', 24, 36);
    }
  }
}

/** At the end of a show with ink: keep it on the slides, or throw it away (as PowerPoint asks). */
export async function askKeepInk(): Promise<boolean> {
  const got = await ask('Keep Ink?', [], { ok: 'Keep', note: 'Do you want to keep your ink annotations? Kept, they go on the slides as shapes you can move, recolour or delete (and they go to PowerPoint). Cancel discards them.' });
  return !!got;
}
