// The Guides toolbox (View > Toolboxes > Guides): add crosshairs, lines across or up and down, or
// a grid; set the ruler ticks on them; choose what a grabbed atom or bond snaps to. It takes the
// place of the red smart guides, which it can still turn on. The Select tool drags a guide; one
// dropped outside the drawing goes.

import { DEFAULT_GUIDES, GUIDE_SNAPS, type CanvasGuides, type Guide, type GuideKind, type GuideSnap } from '../editor/guides';

export interface GuidesToolboxHooks {
  get(): CanvasGuides | null;
  set(g: CanvasGuides | null): void;
  /** The middle of the window, in points (where a new guide goes). */
  centre(): { x: number; y: number };
  /** The rulers' units. */
  units(): 'in' | 'cm';
  /** The smart guides (things line up with each other as they move). */
  smart(): boolean;
  setSmart(on: boolean): void;
}

const SNAP_LABEL: Record<GuideSnap, [string, string]> = {
  major: ['Major', 'Snap to the major ticks only'],
  minor: ['Minor', 'Snap to the minor ticks between the major ones'],
  both: ['Both', 'Snap to every tick'],
  none: ['None', 'No snapping: the guides only show'],
};

const svg = (body: string) => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${body}</svg>`;
const ADD: { kind: GuideKind | 'grid'; icon: string; title: string }[] = [
  { kind: 'cross', icon: svg('<path d="M8 1v14M1 8h14"/><circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/>'), title: 'Add a crosshair in the middle of the window' },
  { kind: 'h', icon: svg('<path d="M1 8h14M4 6.5v3M8 6v4M12 6.5v3"/>'), title: 'Add a guide across' },
  { kind: 'v', icon: svg('<path d="M8 1v14M6.5 4h3M6 8h4M6.5 12h3"/>'), title: 'Add a guide up and down' },
  { kind: 'grid', icon: svg('<path d="M1 5h14M1 11h14M5 1v14M11 1v14"/>'), title: 'Grid guides: lines every major tick across the whole drawing' },
];

/** A length in points as the rulers write it, and back. */
const toUnits = (pt: number, u: 'in' | 'cm') => Math.round((u === 'in' ? pt / 72 : (pt / 72) * 2.54) * 1000) / 1000;
const fromUnits = (v: number, u: 'in' | 'cm') => (u === 'in' ? v * 72 : (v / 2.54) * 72);

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
  button(add, 'clear', svg('<path d="M3 3l10 10M13 3L3 13"/>'), 'Take every guide away', () => change({ list: [], grid: false }));
  body.append(add);

  // the ticks
  const ticks = d.createElement('div');
  ticks.className = 'gt-row gt-ticks';
  const unit = d.createElement('span');
  const field = (label: string, key: 'major' | 'minor') => {
    const l = d.createElement('label');
    l.className = 'gt-field';
    const s = d.createElement('span');
    s.textContent = label;
    const input = d.createElement('input');
    input.type = 'number';
    input.min = '0.01';
    input.step = 'any';
    input.className = 'gt-num';
    input.setAttribute('aria-label', `${label} tick spacing`);
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (!(v > 0)) { refresh(); return; }
      const pt = fromUnits(v, h.units());
      const g = now();
      if (key === 'major') change({ major: pt, minor: Math.min(g.minor, pt) });
      else change({ minor: Math.min(pt, g.major) });
    });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    l.append(s, input);
    ticks.append(l);
    return input;
  };
  const major = field('Major', 'major');
  const minor = field('Minor', 'minor');
  unit.className = 'gt-unit';
  ticks.append(unit);
  body.append(ticks);

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

  const smart = d.createElement('label');
  smart.className = 'gt-row gt-check';
  const box = d.createElement('input');
  box.type = 'checkbox';
  box.addEventListener('change', () => h.setSmart(box.checked));
  smart.append(box, d.createTextNode('Line up with other things (smart guides)'));
  smart.title = 'As something moves, its edges and middle snap into line with other structures, text and the page (View > Alignment Guides)';
  body.append(smart);

  const tip = d.createElement('div');
  tip.className = 'gt-tip';
  tip.textContent = 'Drag a guide with the Select tool; drop it off the drawing to take it away.';
  body.append(tip);

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
    if (d.activeElement !== major) major.value = String(toUnits(at.major, u));
    if (d.activeElement !== minor) minor.value = String(toUnits(at.minor, u));
    unit.textContent = u === 'in' ? 'in' : 'cm';
    for (const [k, b] of snapButtons) { const on = at.snap === k; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
    box.checked = h.smart();
  }
  refresh();
  return { refresh };
}
