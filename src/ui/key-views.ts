// Turn in 3-D ▸ Key Views…: the views a structure turns to in the slide show, one per click.
// Drag the picture to turn the structure (Shift+drag turns it in the page, the arrow keys by
// 15°), Add Key View keeps the view, and Play shows the turns as the show will. A flat drawing
// turns as a sheet; "Its real 3-D shape" builds the structure's shape first (as 3-D Perspective
// does), so it turns as the molecule does.

import type { Doc } from '../model';
import { drawDrawing } from '../deck/slide-view';
import { Turner } from '../deck/turn-render';
import { SAME_VIEW, axisView, roundView, viewAngle, viewBetween, viewTimes, type View3 } from '../deck/turn3d';

export interface KeyViewsOptions {
  /** The structure alone, as drawn on the slide. */
  base: Doc;
  views: View3[];
  /** Seconds each turn takes. */
  dur: number;
  /**
   * The structure in its real 3-D shape (built as 3-D Perspective builds it), when it is flat:
   * a drawing of it, and why not when it can't be. Absent: not offered.
   */
  real?: () => Promise<{ doc: Doc } | { note: string }>;
}

export interface KeyViewsResult { views: View3[]; dur: number; real: boolean }

/** Draw `turner`'s structure turned to `view`, fitted to the canvas (the same size at every angle). */
function paint(canvas: HTMLCanvasElement, turner: Turner, view: View3, L: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = Math.min(w, h) / 2 / (turner.reach + 0.8 * L);
  ctx.setTransform(k * dpr, 0, 0, k * dpr, (w / 2 - turner.centre.x * k) * dpr, (h / 2 - turner.centre.y * k) * dpr);
  drawDrawing(ctx, turner.at(view));
}

export function askKeyViews(o: KeyViewsOptions): Promise<KeyViewsResult | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask key-views';
    d.setAttribute('aria-label', 'Key views');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = `<h2>3-D Rotation: Key Views</h2>
      <p class="muted small">Drag to rotate the structure (Shift+drag rotates in the page plane; arrow keys rotate 15°), then click <b>Add Key View</b>. In the slide show, each click rotates to the next view.</p>
      <canvas class="kv-canvas" tabindex="0" role="img" aria-label="The structure: drag to turn it"></canvas>
      <p class="kv-tools"><button type="button" data-act="add" class="primary-soft">+ Add Key View</button>
        <button type="button" data-act="update" disabled title="Replace the selected key view with the current view">Update View</button>
        <button type="button" data-act="home" title="Back to the structure as drawn on the slide">As Drawn</button>
        <button type="button" data-act="play" title="Play the turns from the drawing through each key view, as the show will">▶ Play</button>
        <label class="kv-dur">Each turn <input name="dur" type="number" min="0.2" max="20" step="0.1" /> s</label></p>
      <label class="ask-row ask-check kv-real" hidden><input name="real" type="checkbox" /><span>Its real 3-D shape (built from the structure; the drawing on the slide takes that shape)</span></label>
      <p class="muted small kv-note" hidden></p>
      <div class="kv-strip" role="list" aria-label="Key views, in the order they play"></div>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">Save Views</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const canvas = $<HTMLCanvasElement>('.kv-canvas');
    const strip = $<HTMLDivElement>('.kv-strip');
    const L = o.base.style.bondLength || 14.4;
    let turner = new Turner(o.base);
    let view: View3 = o.views.length ? o.views[o.views.length - 1] : SAME_VIEW;
    const views = o.views.map((v) => [...v]);
    let picked: number | null = null;
    let real = false;
    let playing = 0;
    $<HTMLInputElement>('input[name=dur]').value = String(o.dur);

    const show = () => paint(canvas, turner, view, L);
    const drawStrip = () => {
      strip.innerHTML = '';
      views.forEach((v, i) => {
        const item = document.createElement('div');
        item.className = 'kv-item';
        item.setAttribute('role', 'listitem');
        item.setAttribute('aria-selected', String(picked === i));
        const thumb = document.createElement('canvas');
        thumb.className = 'kv-thumb';
        thumb.title = `Key view ${i + 1}: click to go there`;
        thumb.tabIndex = 0;
        const go = () => { picked = i; glide(view, v); drawStrip(); };
        thumb.addEventListener('click', go);
        thumb.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        const n = Object.assign(document.createElement('span'), { className: 'kv-n', textContent: String(i + 1) });
        const del = Object.assign(document.createElement('button'), { type: 'button', className: 'kv-del', textContent: '×', title: 'Take out this view' });
        del.setAttribute('aria-label', `Take out key view ${i + 1}`);
        del.addEventListener('click', () => { views.splice(i, 1); picked = null; drawStrip(); });
        const left = Object.assign(document.createElement('button'), { type: 'button', className: 'kv-move', textContent: '◀', title: 'Play this view earlier', disabled: i === 0 });
        left.setAttribute('aria-label', `Move key view ${i + 1} earlier`);
        left.addEventListener('click', () => { [views[i - 1], views[i]] = [views[i], views[i - 1]]; picked = i - 1; drawStrip(); });
        item.append(thumb, n, left, del);
        strip.append(item);
        requestAnimationFrame(() => paint(thumb, turner, v, L));
      });
      if (!views.length) strip.append(Object.assign(document.createElement('p'), { className: 'muted small', textContent: 'No key views yet: turn the structure and Add Key View.' }));
      $<HTMLButtonElement>('[data-act=update]').disabled = picked === null;
    };
    /** Turn smoothly from a to b in the preview. */
    const glide = (a: View3, b: View3, secs = Math.min(0.8, 0.2 + viewAngle(a, b) / 360)) => new Promise<void>((done) => {
      const run = ++playing;
      const t0 = performance.now();
      const step = (now: number) => {
        if (run !== playing) { done(); return; }
        const p = Math.min(1, (now - t0) / (secs * 1000));
        view = viewBetween(a, b, p * p * (3 - 2 * p));
        show();
        if (p < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });

    // dragging turns it: across about the page's up-down line, up and down about its across line, Shift in the page
    let drag: { x: number; y: number; shift: boolean } | null = null;
    canvas.addEventListener('pointerdown', (e) => { playing++; drag = { x: e.clientX, y: e.clientY, shift: e.shiftKey }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const turn = drag.shift || e.shiftKey ? axisView('z', dx * 0.6) : viewTimes(axisView('y', dx * 0.6), axisView('x', -dy * 0.6));
      view = viewTimes(turn, view);
      show();
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', (e) => {
      const turn = e.key === 'ArrowLeft' ? axisView('y', -15) : e.key === 'ArrowRight' ? axisView('y', 15) : e.key === 'ArrowUp' ? axisView('x', 15) : e.key === 'ArrowDown' ? axisView('x', -15) : null;
      if (!turn) return;
      e.preventDefault();
      playing++;
      view = viewTimes(e.shiftKey ? axisView('z', e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -15 : 15) : turn, view);
      show();
    });

    form.querySelector('[data-act=add]')!.addEventListener('click', () => {
      views.push(roundView(view));
      picked = views.length - 1;
      drawStrip();
    });
    form.querySelector('[data-act=update]')!.addEventListener('click', () => {
      if (picked === null) return;
      views[picked] = roundView(view);
      drawStrip();
    });
    form.querySelector('[data-act=home]')!.addEventListener('click', () => { picked = null; void glide(view, SAME_VIEW); drawStrip(); });
    form.querySelector('[data-act=play]')!.addEventListener('click', async () => {
      const secs = Math.max(0.2, Number($<HTMLInputElement>('input[name=dur]').value) || o.dur);
      view = SAME_VIEW;
      show();
      const run = ++playing;
      let from = SAME_VIEW;
      for (const v of views) {
        await new Promise((r) => setTimeout(r, 350));
        if (run !== playing) return;
        await glide(from, v, secs);
        from = v;
      }
    });

    // the real shape, offered for a flat drawing
    const realBox = $<HTMLLabelElement>('.kv-real'), note = $<HTMLParagraphElement>('.kv-note');
    const flat = [...o.base.atoms.values()].every((a) => !a.depth);
    if (o.real && flat) {
      realBox.hidden = false;
      const box = $<HTMLInputElement>('input[name=real]');
      box.addEventListener('change', async () => {
        note.hidden = true;
        if (!box.checked) { real = false; turner = new Turner(o.base); show(); drawStrip(); return; }
        box.disabled = true;
        note.hidden = false;
        note.textContent = 'Building its 3-D shape…';
        const got = await o.real!();
        box.disabled = false;
        if ('note' in got) { box.checked = false; note.textContent = got.note; return; }
        note.hidden = true;
        real = true;
        turner = new Turner(got.doc);
        show();
        drawStrip();
      });
    }

    d.append(form);
    document.body.append(d);
    const finish = (v: KeyViewsResult | null) => { playing++; d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      d.close();
      finish({ views, dur: Math.max(0.2, Math.min(20, Number($<HTMLInputElement>('input[name=dur]').value) || o.dur)), real });
    });
    d.showModal();
    requestAnimationFrame(() => { show(); drawStrip(); canvas.focus(); });
  });
}
