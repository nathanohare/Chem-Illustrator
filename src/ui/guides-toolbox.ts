// The Guides toolbox (View > Toolboxes > Guides): add crosshairs, lines across or up and down, or
// a grid; set the ruler ticks on them; choose what a grabbed atom or bond snaps to. It takes the
// place of the pink smart guides canvases had. The Select tool drags a guide; one dropped outside
// the drawing goes. Each drawing has its own guides.

import { infoIcon } from './toolboxes';
import { DEFAULT_GUIDES, GUIDE_COLOURS, parseGuideLength, showGuideLength, GUIDE_SNAPS, type CanvasGuides, type Guide, type GuideKind, type GuideSnap } from '../editor/guides';

export interface GuidesToolboxHooks {
  get(): CanvasGuides | null;
  set(g: CanvasGuides | null): void;
  /** The middle of the window, in points (where a new guide goes). */
  centre(): { x: number; y: number };
  /** The rulers' units. */
  units(): 'in' | 'cm';
}

const SNAP_LABEL: Record<GuideSnap, [string, string]> = {
  major: ['Major', 'Snap to the major ticks only'],
  minor: ['Minor', 'Snap to the minor ticks between the major ones'],
  both: ['Both', 'Snap to every tick'],
};

const svg = (body: string) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${body}</svg>`;
const ADD: { kind: GuideKind | 'grid'; icon: string; title: string }[] = [
  { kind: 'cross', icon: svg('<path d="M8 1v14M1 8h14"/><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/>'), title: 'Add a crosshair in the middle of the window' },
  { kind: 'h', icon: svg('<path d="M1 8h14M4 6.5v3M8 6v4M12 6.5v3"/>'), title: 'Add a guide across' },
  { kind: 'v', icon: svg('<path d="M8 1v14M6.5 4h3M6 8h4M6.5 12h3"/>'), title: 'Add a guide up and down' },
  { kind: 'grid', icon: svg('<path d="M1 5h14M1 11h14M5 1v14M11 1v14"/>'), title: 'Grid guides: lines every major tick across the whole drawing' },
];


/** How to use the guides: the tip on the toolbox's "i". */
export const GUIDES_INFO = 'Drag a guide with the Select tool to move it; drop it off the drawing to take it away. Hold Alt while dragging anything to move it freely.';

export function buildGuidesToolbox(body: HTMLElement, vertical: boolean, h: GuidesToolboxHooks): { refresh(): void } {
  const d = body.ownerDocument;
  body.classList.add('gt-box');
  body.classList.toggle('gt-vertical', vertical);
  const now = (): CanvasGuides => h.get() ?? { ...DEFAULT_GUIDES, list: [] };
  // (the tick and snap choices are kept even with no guides; a file saves guides only when there are some)
  const change = (patch: Partial<CanvasGuides>) => { h.set({ ...now(), ...patch }); refresh(); };

  const add = d.createElement('div');
  add.className = 'gt-row';
  const buttons = new Map<string, HTMLButtonElement>();
  const button = (parent: HTMLElement, key: string, html: string, title: string, on: () => void) => {
    const b = d.createElement('button');
    b.type = 'button';
    b.className = 'gt-btn';
    b.innerHTML = html;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', on);
    parent.append(b);
    buttons.set(key, b);
    return b;
  };
  for (const a of ADD) {
    button(add, a.kind, a.icon, a.title, () => {
      if (a.kind === 'grid') { change({ grid: !now().grid, shown: true }); return; }
      const c = h.centre();
      const g = now();
      // (a new guide lands on a tick, so what snaps to it lines up with the rest)
      const r = (v: number) => Math.round(v / g.minor) * g.minor;
      const guide: Guide = { kind: a.kind, x: r(c.x), y: r(c.y) };
      change({ list: [...g.list, guide], shown: true });
    });
  }
  button(add, 'shown', svg('<path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z"/><circle cx="8" cy="8" r="2"/>'), 'Show the guides (hidden guides are kept, and don\'t snap)', () => change({ shown: !now().shown }));
  button(add, 'clear', svg('<path d="M3 3l10 10M13 3L3 13"/>'), 'Clear All Guides', () => change({ list: [], grid: false }));
  // the help, as on the title bar's "i", for when a locked docked box hides its title
  add.append(infoIcon(GUIDES_INFO, 'gt-info'));
  body.append(add);

  // the ticks
  const ticks = d.createElement('div');
  ticks.className = 'gt-row gt-ticks';
  const field = (label: string, key: 'major' | 'minor') => {
    const l = d.createElement('label');
    l.className = 'gt-field';
    const s = d.createElement('span');
    s.textContent = label;
    const input = d.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.spellcheck = false;
    input.className = 'gt-num';
    input.setAttribute('aria-label', `${label} tick spacing`);
    input.title = `${label} tick spacing, with its unit: 1" (inches), 2.5 cm, 30 mm or 12 pt`;
    input.addEventListener('change', () => {
      const pt = parseGuideLength(input.value, h.units());
      if (pt === null) { refresh(); return; }
      const g = now();
      if (key === 'major') change({ major: pt, minor: Math.min(g.minor, pt) });
      else change({ minor: Math.min(pt, g.major) });
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); input.dispatchEvent(new Event('change')); }
      if (e.key === 'Escape') { e.preventDefault(); refresh(); }
    });
    l.append(s, input);
    ticks.append(l);
    return input;
  };
  const major = field('Major', 'major');
  const minor = field('Minor', 'minor');
  body.append(ticks);

  // snapping onto the guides and their ticks, on or off
  const snapRow = d.createElement('label');
  snapRow.className = 'gt-row gt-check';
  const box = d.createElement('input');
  box.type = 'checkbox';
  box.addEventListener('change', () => change({ snapOff: box.checked ? undefined : true }));
  snapRow.append(box, d.createTextNode('Toggle object snapping'));
  snapRow.title = 'What you drag snaps onto the guides and their ticks. Hold Alt while dragging to move freely.';
  body.append(snapRow);

  // snapping
  const snap = d.createElement('div');
  snap.className = 'gt-row gt-snap';
  snap.setAttribute('role', 'radiogroup');
  snap.setAttribute('aria-label', 'Snap the atom or bond grabbed to');
  const snapLabel = d.createElement('span');
  snapLabel.className = 'gt-label';
  snapLabel.textContent = 'Snap';
  snap.append(snapLabel);
  const snapButtons = new Map<GuideSnap, HTMLButtonElement>();
  for (const k of GUIDE_SNAPS) {
    const b = d.createElement('button');
    b.type = 'button';
    b.className = 'gt-seg';
    b.textContent = SNAP_LABEL[k][0];
    b.title = `${SNAP_LABEL[k][1]} (Alt while dragging: no snapping)`;
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => change({ snap: k }));
    snap.append(b);
    snapButtons.set(k, b);
  }
  body.append(snap);

  // how they look: a colour and how see-through
  const look = d.createElement('div');
  look.className = 'gt-row gt-look';
  const lookLabel = d.createElement('span');
  lookLabel.className = 'gt-label';
  lookLabel.textContent = 'Look';
  look.append(lookLabel);
  const swatches: [string | undefined, HTMLButtonElement][] = [];
  for (const c of GUIDE_COLOURS) {
    const b = d.createElement('button');
    b.type = 'button';
    b.className = 'gt-swatch';
    b.style.setProperty('--sw', c.value ?? '#1b8fd0');
    b.title = c.name;
    b.setAttribute('aria-label', `Guides in ${c.name.toLowerCase()}`);
    b.addEventListener('click', () => change({ color: c.value }));
    look.append(b);
    swatches.push([c.value, b]);
  }
  const own = d.createElement('input');
  own.type = 'color';
  own.className = 'gt-own';
  own.title = 'Any other color';
  own.setAttribute('aria-label', 'Guides in any other color');
  own.addEventListener('change', () => change({ color: own.value.toLowerCase() }));
  look.append(own);
  body.append(look);
  const fade = d.createElement('label');
  fade.className = 'gt-row gt-fade';
  const fadeLabel = d.createElement('span');
  fadeLabel.className = 'gt-label';
  fadeLabel.textContent = 'Transparency';
  const range = d.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '90';
  range.step = '5';
  range.className = 'gt-range';
  range.setAttribute('aria-label', 'Transparency of the guides');
  const pct = d.createElement('span');
  pct.className = 'gt-unit';
  range.addEventListener('input', () => { pct.textContent = `${range.value}%`; const v = Number(range.value) / 100; h.set({ ...now(), clear: v || undefined }); });
  range.addEventListener('change', () => refresh());
  fade.append(fadeLabel, range, pct);
  body.append(fade);



  function refresh(): void {
    const g = h.get();
    const any = !!g && (g.list.length > 0 || g.grid);
    const shown = g?.shown ?? true;
    const press = (k: string, on: boolean) => { const b = buttons.get(k); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
    press('grid', !!g?.grid);
    press('shown', any && shown);
    buttons.get('shown')!.disabled = !any;
    buttons.get('clear')!.disabled = !any;
    const u = h.units();
    const at = g ?? DEFAULT_GUIDES;
    if (d.activeElement !== major) major.value = showGuideLength(at.major, u);
    if (d.activeElement !== minor) minor.value = showGuideLength(at.minor, u);
    for (const [k, b] of snapButtons) { const on = at.snap === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    box.checked = !at.snapOff;
    for (const b of snapButtons.values()) b.disabled = !!at.snapOff;
    for (const [v, b] of swatches) { const on = (at.color ?? undefined) === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    own.value = at.color ?? '#1b8fd0';
    if (d.activeElement !== range) range.value = String(Math.round((at.clear ?? 0) * 100));
    pct.textContent = `${range.value}%`;
  }
  refresh();
  return { refresh };
}
