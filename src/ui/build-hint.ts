// Auto-Animate Steps, offered: selecting a scheme of two steps or more (or a Smart Scheme) on a
// slide shows a small "Build step by step" button at the corner of the selection, when the scheme
// is not animated yet. A click opens Auto-Animate Steps; × hides it for that scheme.

import type { Doc } from '../model';
import type { Rect } from '../geom';
import type { Measure, Selection } from '../editor/arrange';
import type { Anim } from '../deck/animation';
import { partHolds, slideParts } from '../deck/animation';
import { stepPieces } from '../deck/auto-steps';

type Scope = Omit<Selection, 'bonds'>;

export interface BuildHintHooks {
  /** A slide is being edited (the hint shows only then). */
  onSlide(): boolean;
  doc(): Doc;
  measure(): Measure;
  /** What the build would take in: the selected Smart Scheme's members, else the selection (null: nothing selected). */
  scope(): { scope: Scope; smart: boolean } | null;
  /** The slide's animations now. */
  anims(): Anim[];
  /** Where a box on the page is on the screen (CSS pixels, the window's coordinates). */
  screenRect(r: Rect): Rect;
  /** Where the drawing shows on the screen. */
  area(): Rect;
  run(): void;
}

/** The step count a selection would build in, when it is worth offering (two steps, or a Smart Scheme), and the scheme's box. */
export function buildOffer(doc: Doc, m: Measure, scope: Scope, smart: boolean, anims: Anim[]): { steps: number; box: Rect; key: string } | null {
  if (!scope.arrows.size && !smart) return null;
  const pieces = stepPieces(doc, m, scope);
  if (!pieces) return null;
  const steps = Math.max(...pieces.map((p) => p.step));
  if (steps < (smart ? 1 : 2)) return null;
  // already built (some of its arrows animated): nothing to offer
  const arrows = pieces.filter((p) => p.kind === 'arrow').flatMap((p) => [...p.sel.arrows]);
  if (anims.length) {
    const parts = slideParts(doc);
    const animated = new Set(anims.map((a) => parts.find((p) => partHolds(p, a.target))).filter(Boolean));
    if ([...animated].some((part) => arrows.some((id) => partHolds(part!, { kind: 'arrow', id })))) return null;
  }
  const box = pieces.reduce<Rect>((b, p) => ({ x1: Math.min(b.x1, p.box.x1), y1: Math.min(b.y1, p.box.y1), x2: Math.max(b.x2, p.box.x2), y2: Math.max(b.y2, p.box.y2) }),
    { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
  return { steps, box, key: arrows.sort((a, b) => a - b).join(',') };
}

export class BuildHint {
  private el: HTMLDivElement;
  private dismissed = new Set<string>();
  private last = '';
  private offer: ReturnType<typeof buildOffer> = null;

  constructor(private hooks: BuildHintHooks) {
    const el = (this.el = document.createElement('div'));
    el.className = 'build-hint';
    el.hidden = true;
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Suggested build');
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'bh-go';
    go.addEventListener('click', () => { el.hidden = true; this.hooks.run(); });
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'bh-x';
    x.textContent = '×';
    x.title = 'Not for this scheme';
    x.setAttribute('aria-label', 'Hide the suggestion for this scheme');
    x.addEventListener('click', () => { if (this.offer) this.dismissed.add(this.offer.key); el.hidden = true; });
    el.append(go, x);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.body.append(el);
  }

  /** The selection or the slide changed: offer the build, or not. */
  refresh(): void {
    const h = this.hooks;
    const s = h.onSlide() ? h.scope() : null;
    if (!s) { this.hide(); return; }
    const doc = h.doc();
    const key = `${doc.version}|${[...s.scope.arrows].join(',')}|${[...s.scope.shapes].join(',')}|${s.smart}|${h.anims().length}`;
    if (key !== this.last) {
      this.last = key;
      this.offer = buildOffer(doc, h.measure(), s.scope, s.smart, h.anims());
    }
    const o = this.offer;
    if (!o || this.dismissed.has(o.key)) { this.hide(); return; }
    const go = this.el.querySelector<HTMLButtonElement>('.bh-go')!;
    go.textContent = `▶ Animate ${o.steps} step${o.steps > 1 ? 's' : ''}, one per click`;
    go.title = 'Auto-Animate Steps: each click brings the next arrow with its conditions, then what it makes';
    this.el.hidden = false;
    this.place();
  }

  /** Keep it at the scheme's top right corner, inside the drawing's area. */
  place(): void {
    const o = this.offer;
    if (!o || this.el.hidden) return;
    const r = this.hooks.screenRect(o.box), a = this.hooks.area();
    const w = this.el.offsetWidth, hgt = this.el.offsetHeight;
    const x = Math.max(a.x1 + 4, Math.min(r.x2 - w, a.x2 - w - 4));
    let y = r.y1 - hgt - 6;
    if (y < a.y1 + 4) y = Math.min(r.y2 + 6, a.y2 - hgt - 4);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  private hide(): void {
    this.el.hidden = true;
  }
}
