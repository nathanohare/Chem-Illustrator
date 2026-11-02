// Insert ▸ Action Button…: pick a ready-made button from a gallery and what it does in the slide
// show from the drop-down under it (each button starts with the action it usually has), or put a
// whole navigation set (back, home, next) on the slide at once.

import { GEOS, ACTION_LINKS, type GeoStep } from '../design/geo';
import { SHOW_JUMPS, SHOW_TOOLS } from '../links';

export interface ActionChoice {
  /** The button (a library shape id), or the navigation set. */
  geo: string | 'set';
  /** How the buttons look (one of ACTION_LOOKS). */
  look: string;
  /** What a click does: a show jump (#next…), a slide (#slide=id), a web page or file, or nothing (''). */
  link: string;
}

/**
 * The looks a button can have: PowerPoint's own blue, and quieter ones that keep out of the way
 * of the slide (Nate: "some smaller/more subdued ones"). `size` is a single button's side in
 * points (the navigation set's are three quarters of it).
 */
export interface ActionLook { id: string; name: string; fill: string | null; line: string; width: number; size: number }
export const ACTION_LOOKS: ActionLook[] = [
  { id: 'office', name: 'Standard', fill: '#dae3f3', line: '#2f5597', width: 1, size: 40 },
  { id: 'subtle', name: 'Subtle gray', fill: '#f2f2f2', line: '#a6a6a6', width: 0.75, size: 30 },
  { id: 'outline', name: 'Small outline', fill: null, line: '#8c8c8c', width: 0.75, size: 22 },
  { id: 'dark', name: 'Dark', fill: '#3a3f47', line: '#ffffff', width: 1, size: 32 },
];
export const actionLook = (id: string): ActionLook => ACTION_LOOKS.find((l) => l.id === id) ?? ACTION_LOOKS[0];

/** The look last picked (the next window starts there). */
let lastLook = 'office';

/** A shape's outline and glyph as SVG path data, drawn w × h. */
function pathD(steps: GeoStep[]): string {
  return steps.map((s) => s.join(' ')).join(' ');
}

/** The buttons the navigation set puts on a slide, left to right (a Canvas slide adds Look around freely). */
export function actionSet(canvas: boolean): string[] {
  return ['actBack', 'actHome', 'actNext', 'actGrid', ...(canvas ? ['actLook'] : [])];
}

/** The slides a button can go to: `#slide=<id>` and a name for each. */
export interface SlideChoice { link: string; label: string }

/**
 * `regions`: the keyframes of the Canvas slide showing (`#key=<id>` and a name for each), for
 * "Zoom to a region"; none on other slides.
 */
export function askActionButton(slides: SlideChoice[], regions: SlideChoice[] = []): Promise<ActionChoice | null> {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'ask action-button-dialog';
    d.setAttribute('aria-label', 'Action button');
    const form = document.createElement('form');
    form.method = 'dialog';
    form.innerHTML = `<h2>Action Button</h2>
      <div class="ab-looks" role="radiogroup" aria-label="Look"></div>
      <div class="ab-gallery" role="radiogroup" aria-label="Button"></div>
      <label class="ask-row"><span>On a click</span><select name="action"></select></label>
      <label class="ask-row" data-for="slide" hidden><span>Slide</span><select name="slide"></select></label>
      <label class="ask-row" data-for="key" hidden><span>Region</span><select name="key"></select></label>
      <label class="ask-row" data-for="url" hidden><span>Web page or file</span><input name="url" placeholder="https://… or a file path" /></label>
      <p class="muted small">The button goes in the slide's bottom right corner; move or resize it as any shape. Right-click ▸ Action… changes what it does later. Saved as PowerPoint's own action button; the slide picker, looking round and regions work in this app's slide show.</p>
      <p class="ask-buttons"><button type="button" data-act="cancel">Cancel</button> <button type="submit" class="primary">Insert</button></p>`;
    const $ = <T extends Element>(q: string) => form.querySelector<T>(q)!;
    const gallery = $<HTMLDivElement>('.ab-gallery');
    const action = $<HTMLSelectElement>('select[name=action]');
    const slideSel = $<HTMLSelectElement>('select[name=slide]');
    const url = $<HTMLInputElement>('input[name=url]');
    const keySel = $<HTMLSelectElement>('select[name=key]');
    for (const r of regions) keySel.append(new Option(r.label, r.link));
    action.append(new Option('Nothing', ''));
    for (const [v, label] of Object.entries(SHOW_JUMPS)) action.append(new Option(label, v));
    for (const [v, label] of Object.entries(SHOW_TOOLS)) action.append(new Option(label, v));
    if (regions.length) action.append(new Option('Zoom to a region of this slide…', 'key'));
    action.append(new Option('A slide…', 'slide'), new Option('A web page or file…', 'url'));
    for (const s of slides) slideSel.append(new Option(s.label, s.link));
    const showFields = () => {
      form.querySelector<HTMLElement>('[data-for=slide]')!.hidden = action.value !== 'slide';
      form.querySelector<HTMLElement>('[data-for=url]')!.hidden = action.value !== 'url';
      form.querySelector<HTMLElement>('[data-for=key]')!.hidden = action.value !== 'key';
    };
    action.addEventListener('change', showFields);

    let picked = 'actNext';
    let look = actionLook(lastLook);
    const defs = GEOS.filter((g) => g.group === 'Action buttons');
    const tiles: HTMLButtonElement[] = [];
    const looks = $<HTMLDivElement>('.ab-looks');
    const pick = (id: string) => {
      picked = id;
      for (const t of tiles) t.setAttribute('aria-checked', String(t.dataset.geo === id));
      if (id === 'set') action.value = '';
      action.disabled = id === 'set';
      if (id !== 'set') action.value = ACTION_LINKS[id] ?? (id === 'actDoc' ? 'url' : id === 'actJump' ? 'slide' : id === 'actZoom' && regions.length ? 'key' : '');
      showFields();
    };
    const tile = (id: string, title: string, svg: string) => {
      const old = tiles.find((t) => t.dataset.geo === id);
      if (old) { old.innerHTML = svg; return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ab-tile';
      b.dataset.geo = id;
      b.setAttribute('role', 'radio');
      b.title = title;
      b.setAttribute('aria-label', title);
      b.innerHTML = svg;
      b.addEventListener('click', () => pick(id));
      b.addEventListener('dblclick', () => form.requestSubmit());
      gallery.append(b);
      tiles.push(b);
    };
    const SET = actionSet(regions.length > 0);
    // the buttons drawn in the look picked (smaller looks are drawn smaller here too)
    const drawTiles = () => {
      const S = Math.round(18 + 12 * Math.min(1, look.size / 40)), T = 30;
      const icon = (steps: { body: GeoStep[]; lines?: GeoStep[] }, x = 0, y = 0) =>
        `<path d="${pathD(steps.body)}" transform="translate(${x} ${y})" fill="${look.fill ?? 'none'}" stroke="${look.line}" stroke-width="1"/>${steps.lines ? `<path d="${pathD(steps.lines)}" transform="translate(${x} ${y})" fill="${look.line}" stroke="none"/>` : ''}`;
      const off = (T - S) / 2;
      for (const g of defs) tile(g.id, g.name, `<svg viewBox="-1 -1 ${T + 2} ${T + 2}" width="${T + 2}" height="${T + 2}" aria-hidden="true">${icon(g.draw(S, S), off, off)}</svg>`);
      // the navigation set: back, home and next together
      const s2 = Math.round(S * 0.66), gap = s2 + 2;
      const set = SET.map((id, i) => icon(defs.find((g) => g.id === id)!.draw(s2, s2), i * gap, (20 - s2) / 2)).join('');
      tile('set', `Navigation set: Back, Home, Next and the slide picker${SET.length > 4 ? ', and Look around freely' : ''} together`, `<svg viewBox="-1 -6 ${SET.length * 22} 32" width="${SET.length * 22}" height="32" aria-hidden="true">${set}</svg>`);
    };
    for (const l of ACTION_LOOKS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ab-look';
      b.setAttribute('role', 'radio');
      b.dataset.look = l.id;
      const sw = 14;
      b.innerHTML = `<svg viewBox="-1 -1 ${sw + 2} ${sw + 2}" width="${sw + 2}" height="${sw + 2}" aria-hidden="true"><rect width="${sw}" height="${sw}" fill="${l.fill ?? 'none'}" stroke="${l.line}"/><path d="M4 3 L11 7 L4 11 Z" fill="${l.line}"/></svg><span>${l.name}</span>`;
      b.title = `${l.name}: ${l.size} pt buttons`;
      b.addEventListener('click', () => { look = l; lastLook = l.id; for (const x of looks.children) x.setAttribute('aria-checked', String((x as HTMLElement).dataset.look === l.id)); drawTiles(); });
      b.setAttribute('aria-checked', String(l.id === look.id));
      looks.append(b);
    }
    drawTiles();
    pick('actNext');

    d.append(form);
    document.body.append(d);
    const finish = (v: ActionChoice | null) => { d.remove(); resolve(v); };
    form.querySelector('[data-act=cancel]')!.addEventListener('click', () => { d.close(); finish(null); });
    d.addEventListener('cancel', () => finish(null));
    d.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const link = action.value === 'slide' ? slideSel.value : action.value === 'url' ? url.value.trim() : action.value === 'key' ? keySel.value : action.value;
      d.close();
      finish({ geo: picked, link, look: look.id });
    });
    d.showModal();
    tiles.find((t) => t.dataset.geo === picked)?.focus();
  });
}
