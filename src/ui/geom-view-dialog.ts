// Energy Diagram ▸ Structure ▸ Geometry View… (review of #321): how one species' geometry from
// a Gaussian or ORCA file is drawn by its level. Its look (balls and sticks, sticks,
// space-filling, lines or a 2-D structure), the angle it is seen from (drag it round), which
// hydrogens show, and parts hidden or faded (click atoms). Or take the geometry away, to draw
// your own structure in its place.

import { geomBestRotation, geomSpec, type GeomLook, type GeomView } from '../design/energy';
import { atomPoints, crystalShapes, fittingZoom, paintShapes, shapesBounds, turnView, type XShape } from '../design/xray';
import type { QmAtom } from '../chem/qm-output';
import type { QmBond } from '../chem/qm-bonds';

export type GeomViewChoice = { view: GeomView; all: boolean } | 'remove';

const LOOKS: { id: GeomLook | '2d'; name: string; tip: string }[] = [
  { id: 'ball', name: 'Balls and sticks', tip: 'Atoms as shaded balls joined by sticks' },
  { id: 'stick', name: 'Sticks', tip: 'Sticks only, in the atoms\' colors' },
  { id: 'fill', name: 'Space-filling', tip: 'Each atom as its van der Waals sphere' },
  { id: 'wire', name: 'Lines', tip: 'Thin lines in the atoms\' colors' },
  { id: '2d', name: '2-D', tip: 'A 2-D structure (carbons as corners); hiding atoms works on it too' },
];

/** The window's own size for the figure (points): a species' box on the diagram is about this shape. */
const FIG = { w: 200, h: 160 };

/**
 * Ask how species `name`'s geometry is drawn, starting from `view` (`look`: the diagram's 3-D
 * look, for what the view doesn't set). Null when cancelled.
 */
export function askGeomView(name: string, atoms: QmAtom[], bonds: QmBond[], view: GeomView, look: GeomLook): Promise<GeomViewChoice | null> {
  return new Promise((resolve) => {
    let v: GeomView = { ...view, hidden: [...(view.hidden ?? [])], faded: [...(view.faded ?? [])] };
    const ts = bonds.some((b) => b.partial);
    const d = document.createElement('dialog');
    d.className = 'ask geom-view-dialog';
    d.setAttribute('aria-label', 'Geometry view');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = `<h2>Geometry View: <span class="gv-name"></span></h2>
      <div class="gv-looks" role="radiogroup" aria-label="Look"></div>
      <div class="gv-body">
        <canvas class="gv-canvas" tabindex="0" aria-label="The geometry: drag to turn it, Shift+drag to turn it in the page, click an atom to fade or hide it"></canvas>
        <div class="gv-side">
          <div class="gv-label">Click an atom to</div>
          <div class="gv-pick" role="radiogroup" aria-label="Click an atom to"></div>
          <label class="gv-check"><input type="checkbox" name="whole" /> its whole molecule</label>
          <button type="button" data-act="spectators" ${ts ? '' : 'disabled'} title="${ts ? 'Fade everything but the atoms of the bonds being made or broken and those bonded to them' : 'For a transition state (a bond being made or broken)'}">Fade all but the reacting atoms</button>
          <button type="button" data-act="showall" title="Show every atom again, none faded">Show all</button>
          <label class="gv-row"><span>Hydrogens</span><select name="hyd">
            <option value="all">All</option><option value="moving">Only on bonds being made or broken</option><option value="none">None</option>
          </select></label>
          <label class="gv-row"><span>Faded parts</span><input type="range" name="fade" min="20" max="90" step="5" /><output class="gv-fade"></output></label>
          <div class="gv-label">Turn</div>
          <div class="gv-turn">
            <button type="button" data-turn="best" title="Back to the side that spreads it out most">Best side</button>
            <button type="button" data-turn="cw" title="Rotate 90° clockwise in the page">↻ 90°</button>
            <button type="button" data-turn="flip" title="Flip it (180° about the vertical axis)">⇄ Flip</button>
          </div>
        </div>
      </div>
      <p class="muted small gv-note"></p>
      <label class="gv-check"><input type="checkbox" name="all" /> Use this look and these hydrogens for every species</label>
      <p class="ask-buttons"><button type="button" data-act="remove" class="gv-remove" title="Take the file's geometry away from this species (draw your own in the Structure column)">Remove Geometry</button><span class="gv-gap"></span><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">Apply</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    $('.gv-name').textContent = name;
    const canvas = $<HTMLCanvasElement>('.gv-canvas');
    const hyd = $<HTMLSelectElement>('select[name=hyd]');
    const fade = $<HTMLInputElement>('input[name=fade]');
    const whole = $<HTMLInputElement>('input[name=whole]');
    hyd.value = v.hydrogens ?? 'all';
    fade.value = String(Math.round((v.fade ?? 0.6) * 100));

    // the look, as chips
    const styleOf = (): GeomLook | '2d' => v.style ?? look;
    const looks = $<HTMLDivElement>('.gv-looks');
    for (const l of LOOKS) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: l.name, title: l.tip, className: 'gv-look' });
      b.setAttribute('role', 'radio');
      b.dataset.look = l.id;
      b.addEventListener('click', () => { v.style = l.id; draw(); });
      looks.append(b);
    }
    // what a click on an atom does
    let pick: 'fade' | 'hide' | 'show' = 'fade';
    const picks = $<HTMLDivElement>('.gv-pick');
    for (const [id, label] of [['fade', 'Fade'], ['hide', 'Hide'], ['show', 'Show']] as const) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className: 'gv-pk' });
      b.setAttribute('role', 'radio');
      b.dataset.pick = id;
      b.addEventListener('click', () => { pick = id; draw(); });
      picks.append(b);
    }

    // ---- the preview: hidden atoms show as ghosts here, so they can be clicked back
    let shown: XShape[] = [], ghosts = new Set<number>(), points = new Map<number, [number, number]>();
    let k = 1, shiftX = 0, shiftY = 0;
    const rotation = () => v.rot ?? geomBestRotation(atoms);
    const draw = () => {
      for (const b of looks.children) b.setAttribute('aria-checked', String((b as HTMLElement).dataset.look === styleOf()));
      for (const b of picks.children) b.setAttribute('aria-checked', String((b as HTMLElement).dataset.pick === pick));
      $('.gv-fade').textContent = `${fade.value}%`;
      const flat = styleOf() === '2d';
      $('.gv-note').textContent = flat
        ? 'Drawn as a 2-D structure by its level (shown here in lines). Hiding atoms works on it; fading and turning are for the 3-D looks.'
        : 'Drag to rotate it (Shift+drag rotates in the page plane; arrow keys also rotate). The box shows the space available at its level.';
      ghosts = new Set(v.hidden);
      const pv: GeomView = { ...v, style: flat ? 'wire' : v.style ?? look, rot: rotation(), hidden: [], faded: [...new Set([...(v.faded ?? []), ...ghosts])] };
      const spec = geomSpec(atoms, bonds, pv, look);
      const view = { ...spec.view, zoom: fittingZoom(spec, spec.view, FIG.w, FIG.h) };
      shown = crystalShapes(spec, view);
      points = atomPoints(spec, view);
      const dpr = window.devicePixelRatio || 1;
      const cw = canvas.clientWidth || 320, ch = canvas.clientHeight || 240;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      k = Math.min((cw - 16) / FIG.w, (ch - 16) / FIG.h);
      const b = shapesBounds(shown);
      shiftX = (b[0] + b[2]) / 2;
      shiftY = (b[1] + b[3]) / 2;
      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(k, k);
      ctx.strokeStyle = '#d8dde6';
      ctx.lineWidth = 1 / k;
      ctx.setLineDash([4 / k, 4 / k]);
      ctx.strokeRect(-FIG.w / 2, -FIG.h / 2, FIG.w, FIG.h);
      ctx.setLineDash([]);
      ctx.translate(-shiftX, -shiftY);
      // the bonds being made or broken, dashed (on the page they are drawn the same way)
      ctx.setLineDash([3, 2.5]);
      ctx.lineWidth = 1.1;
      for (const b of bonds) {
        if (!b.partial) continue;
        const p = points.get(b.i), q = points.get(b.j);
        if (!p || !q) continue;
        ctx.strokeStyle = ghosts.has(b.i) || ghosts.has(b.j) ? '#e4e4e4' : (v.faded ?? []).includes(b.i) || (v.faded ?? []).includes(b.j) ? '#a0a0a0' : '#000000';
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const ghost = (s: XShape) => (s.atom !== undefined && ghosts.has(s.atom)) || (!!s.atoms && (ghosts.has(s.atoms[0]) || ghosts.has(s.atoms[1])));
      ctx.globalAlpha = 0.22;
      paintShapes(ctx, shown.filter(ghost));
      ctx.globalAlpha = 1;
      paintShapes(ctx, shown.filter((s) => !ghost(s)));
      ctx.restore();
    };

    /** The atom under the pointer (within a few pixels of its centre), or null. */
    const atomAt = (e: MouseEvent): number | null => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) / k + shiftX, y = (e.clientY - r.top - r.height / 2) / k + shiftY;
      let best: number | null = null, bd = Infinity;
      for (const [i, p] of points) { const dd = Math.hypot(p[0] - x, p[1] - y); if (dd < bd) { bd = dd; best = i; } }
      return bd <= Math.max(6, 10 / k) ? best : null;
    };
    /** Atom `i`, or its whole molecule (everything bonded to it, step by step). */
    const group = (i: number): number[] => {
      if (!whole.checked) return [i];
      const nb = new Map<number, number[]>();
      for (const b of bonds) { if (b.partial) continue; nb.set(b.i, [...(nb.get(b.i) ?? []), b.j]); nb.set(b.j, [...(nb.get(b.j) ?? []), b.i]); }
      const seen = new Set([i]), todo = [i];
      while (todo.length) for (const n of nb.get(todo.pop()!) ?? []) if (!seen.has(n)) { seen.add(n); todo.push(n); }
      return [...seen];
    };
    const apply = (i: number) => {
      const g = group(i);
      const hidden = new Set(v.hidden), faded = new Set(v.faded);
      // a click on what is already so undoes it
      const undo = pick === 'fade' ? faded.has(i) && !hidden.has(i) : pick === 'hide' ? hidden.has(i) : false;
      for (const a of g) {
        if (pick === 'show' || undo) { hidden.delete(a); faded.delete(a); }
        else if (pick === 'fade') { faded.add(a); hidden.delete(a); }
        else { hidden.add(a); faded.delete(a); }
      }
      v = { ...v, hidden: [...hidden], faded: [...faded] };
      draw();
    };

    let drag: { x: number; y: number; moved: boolean; plane: boolean } | null = null;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture?.(e.pointerId); drag = { x: e.clientX, y: e.clientY, moved: false, plane: e.shiftKey || e.button === 2 }; });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) { canvas.style.cursor = atomAt(e) !== null ? 'pointer' : 'grab'; return; }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (styleOf() === '2d') return;
      v.rot = drag.plane ? turnView(rotation(), 0, 0, -dx * 0.5) : turnView(rotation(), dy * 0.5, dx * 0.5);
      draw();
    });
    canvas.addEventListener('pointerup', (e) => {
      const was = drag;
      drag = null;
      if (was && !was.moved) { const i = atomAt(e); if (i !== null) apply(i); }
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 15 : 5;
      const turn = ({ ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [-step, 0], ArrowDown: [step, 0] } as Record<string, number[]>)[e.key];
      if (!turn || styleOf() === '2d') return;
      e.preventDefault();
      v.rot = turnView(rotation(), turn[0], turn[1]);
      draw();
    });
    for (const b of form.querySelectorAll<HTMLButtonElement>('[data-turn]')) {
      b.addEventListener('click', () => {
        const t = b.dataset.turn;
        if (t === 'best') delete v.rot;
        else v.rot = t === 'cw' ? turnView(rotation(), 0, 0, 90) : turnView(rotation(), 0, 180);
        draw();
      });
    }
    $('[data-act=spectators]').addEventListener('click', () => {
      // the reacting atoms: those of the bonds being made or broken, and what is bonded to them
      const core = new Set(bonds.filter((b) => b.partial).flatMap((b) => [b.i, b.j]));
      const near = new Set(core);
      for (const b of bonds) if (!b.partial && (core.has(b.i) || core.has(b.j))) { near.add(b.i); near.add(b.j); }
      v = { ...v, faded: atoms.map((_, i) => i).filter((i) => !near.has(i) && !(v.hidden ?? []).includes(i)) };
      draw();
    });
    $('[data-act=showall]').addEventListener('click', () => { v = { ...v, hidden: [], faded: [] }; draw(); });
    hyd.addEventListener('change', () => { v.hydrogens = hyd.value as GeomView['hydrogens']; draw(); });
    fade.addEventListener('input', () => { v.fade = Number(fade.value) / 100; draw(); });

    d.append(form);
    document.body.append(d);
    const finish = (x: GeomViewChoice | null) => { d.remove(); resolve(x); };
    $('[data-act=cancel]').addEventListener('click', () => { d.close(); finish(null); });
    $('[data-act=remove]').addEventListener('click', () => { d.close(); finish('remove'); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      d.close();
      finish({ view: cleanView(v), all: $<HTMLInputElement>('input[name=all]').checked });
    });
    d.showModal();
    requestAnimationFrame(draw);
    draw();
  });
}

/** A view without what says nothing (empty lists, the defaults). */
export function cleanView(v: GeomView): GeomView {
  const out: GeomView = {};
  if (v.style) out.style = v.style;
  if (v.rot) out.rot = v.rot.map((r) => r.map((x) => Math.round(x * 1e5) / 1e5)) as GeomView['rot'];
  if (v.hydrogens && v.hydrogens !== 'all') out.hydrogens = v.hydrogens;
  if (v.hidden?.length) out.hidden = [...new Set(v.hidden)].sort((a, b) => a - b);
  if (v.faded?.length) out.faded = [...new Set(v.faded)].sort((a, b) => a - b);
  if (v.fade !== undefined && Math.abs(v.fade - 0.6) > 1e-9) out.fade = v.fade;
  return out;
}
