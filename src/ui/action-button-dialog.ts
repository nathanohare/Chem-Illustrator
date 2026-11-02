// Insert ▸ Action Button…: pick a ready-made button from a gallery and what it does in the slide
// show from the drop-down under it (each button starts with the action it usually has), or put a
// whole navigation set (back, home, next) on the slide at once.

import { GEOS, ACTION_LINKS, type GeoStep } from '../design/geo';
import { SHOW_JUMPS, SHOW_TOOLS } from '../links';

export interface ActionChoice {
  /** The button (a library shape id), or the navigation set. */
  geo: string | 'set';
  /** What a click does: a show jump (#next…), a slide (#slide=id), a web page or file, or nothing (''). */
  link: string;
}

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
    const defs = GEOS.filter((g) => g.group === 'Action buttons');
    const tiles: HTMLButtonElement[] = [];
    const pick = (id: string) => {
      picked = id;
      for (const t of tiles) t.setAttribute('aria-checked', String(t.dataset.geo === id));
      if (id === 'set') action.value = '';
      action.disabled = id === 'set';
      if (id !== 'set') action.value = ACTION_LINKS[id] ?? (id === 'actDoc' ? 'url' : id === 'actJump' ? 'slide' : id === 'actZoom' && regions.length ? 'key' : '');
      showFields();
    };
    const tile = (id: string, title: string, svg: string) => {
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
    const S = 30;
    const icon = (steps: { body: GeoStep[]; lines?: GeoStep[] }, x = 0) =>
      `<path d="${pathD(steps.body)}" transform="translate(${x} 0)" fill="#dae3f3" stroke="#2f5597" stroke-width="1"/>${steps.lines ? `<path d="${pathD(steps.lines)}" transform="translate(${x} 0)" fill="#2f5597" stroke="none"/>` : ''}`;
    for (const g of defs) tile(g.id, g.name, `<svg viewBox="-1 -1 ${S + 2} ${S + 2}" width="${S + 2}" height="${S + 2}" aria-hidden="true">${icon(g.draw(S, S))}</svg>`);
    // the navigation set: back, home and next together
    const SET = actionSet(regions.length > 0);
    const set = SET.map((id, i) => icon(defs.find((g) => g.id === id)!.draw(20, 20), i * 22)).join('');
    tile('set', `Navigation set: Back, Home, Next and the slide picker${SET.length > 4 ? ', and Look around freely' : ''} together`, `<svg viewBox="-1 -6 ${SET.length * 22} 32" width="${SET.length * 22}" height="32" aria-hidden="true">${set}</svg>`);
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
      finish({ geo: picked, link });
    });
    d.showModal();
    tiles.find((t) => t.dataset.geo === picked)?.focus();
  });
}
