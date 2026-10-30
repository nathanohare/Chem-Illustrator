// A canvas slide as ordinary slides, one for each keyframe, for PowerPoint and PDF: what is in the
// keyframe's window, moved (and for a zoomed keyframe scaled) to fill the slide. The moves become
// transitions (Morph glides like a pan; a fly-over goes through a zoomed-out slide that moves on
// by itself), each slide carries the animations played while the show is at its keyframe, and its
// background is the canvas's, cut to the window.
//
// Saved, the slides carry what puts the canvas back together when the file is opened here again:
// the first one the whole canvas, every one which canvas and keyframe it is and a print of what it
// held, so slides changed in PowerPoint since can be told apart (Reader: collapseCanvases).

import { Doc, type Contents } from '../model';
import { plainText } from '../richtext';
import type { Selection } from '../editor/editor';
import { units, POINTS } from '../editor/arrange';
import type { Rect } from '../geom';
import { frameFields, layoutFrames, slideBackground, slideColours, textStyles, hasLayout, type LayoutId, type Master, type SlideSize } from './deck';
import { backgroundColour, type Background } from './background';
import {
  buildSteps, keepsShowing, mainAnims, partOf, partStates, slideParts,
  type Anim, type Part, type Transition,
} from './animation';
import { compoundId, isCamera, keyRect, timedCamera, viewBetween, type CanvasData } from './canvas';

export { compoundId };
import { canvasBackgroundPicture, hasLook } from './canvas-look';

/** One slide of a deck being saved (DeckData's), as far as a canvas slide's split needs it. */
export interface SplitSlide {
  id?: number;
  layout: LayoutId;
  doc: Doc;
  notes: string;
  transition?: Transition;
  anims?: Anim[];
  comments?: unknown[];
  background?: Background;
  hideGraphics?: boolean;
  hidden?: boolean;
  hf?: unknown;
  canvas?: CanvasData;
  /** A keyframe's slide from a canvas slide (see CanvasPart). */
  part?: CanvasPart;
}

/**
 * Which canvas slide and keyframe a slide was made from: `uid` names the canvas within the file,
 * `index` counts its slides from 0 (of `count`), `via` marks the slide a fly-over passes through.
 * The first carries `keep`, the canvas slide itself, so it comes back whole.
 */
export interface CanvasPart { uid: string; index: number; count: number; via?: boolean; keep?: CanvasKeep }

/** A canvas slide as kept in its first slide's tag: everything that isn't saved as the slide itself. */
export interface CanvasKeep {
  layout: LayoutId;
  contents: Contents;
  notes: string;
  anims?: Anim[];
  transition?: Transition;
  background?: Background;
  hideGraphics?: boolean;
  hidden?: boolean;
  canvas: CanvasData;
}

const intersects = (a: Rect, b: Rect) => a.x1 <= b.x2 && a.x2 >= b.x1 && a.y1 <= b.y2 && a.y2 >= b.y1;

/**
 * What a slide made from a keyframe holds: the canvas's drawing without `drop` (parts not showing
 * at that keyframe), without what lies wholly outside the window `view`, moved and scaled so the
 * window fills a slide of `size` (structures, arrows, shapes and text alike).
 */
export function keyframeDoc(src: Doc, view: Rect, size: SlideSize, drop: Part[] = []): Doc {
  const d = new Doc();
  d.style = { ...src.style };
  d.textStyles = src.textStyles;
  d.background = src.background;
  d.restoreContents(src.contents());
  d.bulk(() => cutToView(d, view, size, drop));
  return d;
}

/** keyframeDoc's changes, inside one bulk change of the copy. */
function cutToView(d: Doc, view: Rect, size: SlideSize, drop: Part[]): void {
  // parts not showing at this keyframe: highlights come off their structures, the rest goes
  for (const p of drop) {
    if (p.kind === 'highlight') {
      for (const id of p.sel.atoms) if (d.atoms.has(id)) d.updateAtom(id, { highlight: undefined, hl: undefined });
      for (const id of p.sel.bonds) if (d.bonds.has(id)) d.updateBond(id, { highlight: undefined, hl: undefined });
      continue;
    }
    // (a paragraph of a text box stays with its text box)
    if (p.para !== undefined) continue;
    for (const id of p.sel.shapes) if (d.shapes.has(id)) d.removeShape(id);
    for (const id of p.sel.arrows) if (d.arrows.has(id)) d.removeArrow(id);
    for (const id of p.sel.captions) if (d.captions.has(id)) d.removeCaption(id);
    for (const id of p.sel.atoms) if (d.atoms.has(id)) d.removeAtom(id);
  }
  // what lies wholly outside the window (a structure partly in it stays whole)
  const all: Selection = { atoms: new Set(d.atoms.keys()), bonds: new Set(d.bonds.keys()), captions: new Set(d.captions.keys()), arrows: new Set(d.arrows.keys()), shapes: new Set(d.shapes.keys()) };
  for (const u of units(d, all, POINTS)) {
    if (intersects(u.box, view)) continue;
    for (const id of u.shapes) if (d.shapes.has(id)) d.removeShape(id);
    for (const id of u.arrows) if (d.arrows.has(id)) d.removeArrow(id);
    for (const id of u.captions) if (d.captions.has(id)) d.removeCaption(id);
    for (const id of u.atoms) if (d.atoms.has(id)) d.removeAtom(id);
  }
  // the window to the slide: moved, and scaled about its corner
  const k = size.w / Math.max(1e-6, view.x2 - view.x1);
  const at = (x: number, y: number) => ({ x: (x - view.x1) * k, y: (y - view.y1) * k });
  const scaled = Math.abs(k - 1) > 1e-9;
  if (scaled) {
    const s = d.style;
    d.style = { ...s, bondLength: s.bondLength * k, lineWidth: s.lineWidth * k, boldWidth: s.boldWidth * k, marginWidth: s.marginWidth * k, hashSpacing: s.hashSpacing * k, labelSize: s.labelSize * k, captionSize: s.captionSize * k };
  }
  for (const a of [...d.atoms.values()]) d.updateAtom(a.id, at(a.x, a.y));
  for (const c of [...d.captions.values()]) {
    const base = c.ph ? d.textStyles?.[c.ph]?.size : undefined;
    d.updateCaption(c.id, {
      ...at(c.x, c.y),
      ...(scaled ? {
        ...(c.wrap !== undefined ? { wrap: c.wrap * k } : {}), ...(c.boxH !== undefined ? { boxH: c.boxH * k } : {}), ...(c.width !== undefined ? { width: c.width * k } : {}),
        // text as big as the window shows it (text without a size of its own follows the style's)
        runs: c.runs.map((r) => (r.size !== undefined ? { ...r, size: r.size * k } : base !== undefined ? { ...r, size: base * k } : r)),
      } : {}),
    });
  }
  for (const r of [...d.arrows.values()]) {
    d.updateArrow(r.id, {
      tail: at(r.tail.x, r.tail.y), head: at(r.head.x, r.head.y),
      ...(scaled ? { headLength: r.headLength * k, headWidth: r.headWidth * k, ...(r.lineWidth !== undefined ? { lineWidth: r.lineWidth * k } : {}) } : {}),
    });
  }
  for (const s of [...d.shapes.values()]) {
    const p1 = at(s.x1, s.y1), p2 = at(s.x2, s.y2);
    d.updateShape(s.id, {
      x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
      ...(s.poly ? { poly: s.poly.map((q) => at(q.x, q.y)) } : {}),
      ...(scaled && s.lineWidth !== undefined ? { lineWidth: s.lineWidth * k } : {}),
      ...(scaled && s.text ? { text: { ...s.text, runs: s.text.runs.map((r) => (r.size !== undefined ? { ...r, size: r.size * k } : r)) } } : {}),
    });
  }
}

/** A stop of the show on a canvas slide: at keyframe `key`, got to by `move` (none for the first), playing `anims` there. */
export interface Stop { key: number; move?: Anim; anims: Anim[] }

/**
 * A canvas slide's animations cut at its keyframe moves: a stop for the start and one for each
 * move (a keyframe is stopped at twice when the show comes back to it from a detour), each with
 * the animations played there and the move there timed as the show plays it.
 */
export function animStops(anims: Anim[], c: CanvasData, size: SlideSize): Stop[] {
  const stops: Stop[] = [{ key: 0, anims: [] }];
  for (const a of timedCamera(anims, c.keys, size)) {
    if (!isCamera(a)) { stops[stops.length - 1].anims.push(a); continue; }
    const j = c.keys.findIndex((k) => k.id === a.target.id);
    if (j >= 0) stops.push({ key: j, move: a, anims: [] });
  }
  return stops;
}

/**
 * Where each compound ID on a canvas is first shown: the first of `views` (in the show's order)
 * with a text of that ID in it.
 */
export function compoundHomes(doc: Doc, views: Rect[]): Map<string, number> {
  const out = new Map<string, number>();
  const ids = [...doc.captions.values()].map((c) => ({ c, id: compoundId(plainText(c.runs)) })).filter((x) => x.id);
  views.forEach((v, j) => {
    for (const { c, id } of ids) if (!out.has(id!) && c.x >= v.x1 && c.x <= v.x2 && c.y >= v.y1 && c.y <= v.y2) out.set(id!, j);
  });
  return out;
}

/**
 * The parts not to put on keyframe j's slide: those not showing when the show gets there that
 * its own animations don't bring in (those not in yet, and those gone).
 */
export function hiddenAt(parts: Part[], segs: Anim[][], j: number): Part[] {
  const before = segs.slice(0, j).flat();
  const mine = new Set(segs[j].map((a) => partOf(parts, a.target)).filter((p): p is Part => !!p));
  const states = partStates(parts, before, buildSteps(mainAnims(before)).length, -1);
  // when each part first comes in or does anything, from here on
  const firstLater = new Map<Part, Anim>();
  for (const a of segs.slice(j).flat()) {
    const p = partOf(parts, a.target);
    if (p && !firstLater.has(p)) firstLater.set(p, a);
  }
  return parts.filter((p) => {
    if (mine.has(p)) return false;
    const st = states.get(p);
    // played before: showing or not as it was left
    if (before.some((a) => partOf(parts, a.target) === p)) return !(st?.visible ?? true);
    // first animated later: not in yet when that is an entrance
    const f = firstLater.get(p);
    return !!f && !keepsShowing(f.effect) && !f.exit;
  });
}

/** A keyframe's slide: its layout (Title Only when it has a title) and its drawing, with the title in the title's place. */
function keyframeSlide(src: Doc, view: Rect, title: string | undefined, master: Master, size: SlideSize, drop: Part[]): { layout: LayoutId; doc: Doc } {
  const doc = keyframeDoc(src, view, size, drop);
  if (!title || !hasLayout(master, 'title-only')) return { layout: 'blank', doc };
  const styles = textStyles(master, 'title-only');
  doc.textStyles = styles;
  const f = layoutFrames('title-only', size, master).find((x) => x.ph === 'title');
  if (f) doc.bulk(() => doc.addCaption({ ...frameFields(f, styles), runs: [{ text: title }] }));
  return { layout: 'title-only', doc };
}

/** The background of a keyframe's slide: the canvas's, cut to its window, as a picture (or the slide's own when it is plain). */
function keyBackground(s: SplitSlide, c: CanvasData, view: Rect, master: Master, size: SlideSize): Background | undefined {
  if (!hasLook(c)) return s.background;
  const base = backgroundColour(slideBackground(master, s.layout, s.background));
  const pic = canvasBackgroundPicture(c, size, view, base, slideColours(master, s.layout).textColor);
  return pic ? { kind: 'picture', src: pic.src, px: pic.px, fit: 'stretch' } : s.background;
}

let uids = 0;

/** Moving on by itself at once (as near as a slide's timing goes: none at all reads as not moving on by itself). */
const AT_ONCE = 0.01;

/**
 * A canvas slide as a slide for each keyframe (and one for each fly-over to pass through), as
 * PowerPoint and PDF pages show it; any other slide as it is.
 */
export function splitCanvas<S extends SplitSlide>(s: S, master: Master, size: SlideSize, n = 0): S[] {
  const c = s.canvas;
  if (!c?.keys.length) return [s];
  const uidNo = ++uids;
  const uid = `${s.id ?? n}.${Date.now().toString(36)}${uidNo.toString(36)}`;
  const parts = slideParts(s.doc);
  const stops = animStops(s.anims ?? [], c, size);
  const segs = stops.map((x) => x.anims);
  // compound numbers link back to the slide where the compound was first shown
  const homes = c.show?.noLinks ? new Map<string, number>() : compoundHomes(s.doc, stops.map((x) => keyRect(c.keys[x.key], size)));
  const out: S[] = [];
  const at: number[] = [];
  const { advanceAfter: _, ...enter } = s.transition ?? { kind: 'none' as const, dur: 0 };
  const base = (view: Rect, drop: Part[], title: string | undefined): Pick<SplitSlide, 'layout' | 'doc' | 'background'> => ({
    ...keyframeSlide(s.doc, view, title, master, size, drop),
    background: keyBackground(s, c, view, master, size),
  });
  stops.forEach((stop, j) => {
    const k = c.keys[stop.key];
    const drop = hiddenAt(parts, segs, j);
    const move = stop.move;
    const prev = j ? c.keys[stops[j - 1].key] : undefined;
    // a fly-over: through a zoomed-out slide that moves on by itself
    if (move && prev && move.move === 'fly') {
      const view = viewBetween(prev, k, 0.5, 'fly', size);
      out.push({
        ...s, id: undefined, notes: '', anims: [], comments: undefined, canvas: undefined,
        ...base(view, hiddenAt(parts, segs, j - 1), prev.title === k.title ? k.title : undefined),
        transition: { kind: 'morph', dur: Math.max(0.1, move.dur / 2), advanceAfter: AT_ONCE },
        part: { uid, index: 0, count: 0, via: true },
      });
    }
    const trans: Transition | undefined = !move ? (enter.kind !== 'none' ? enter : undefined)
      : move.move === 'cut' ? undefined
        : move.move === 'fade' ? { kind: 'fade', dur: Math.max(0.1, move.dur) }
          : { kind: 'morph', dur: Math.max(0.1, move.move === 'fly' ? move.dur / 2 : move.dur) };
    // a move that starts by itself: the slide before moves on by itself
    if (move && move.start !== 'click' && out.length) {
      const last = out[out.length - 1];
      last.transition = { ...(last.transition ?? { kind: 'none', dur: 0 }), advanceAfter: Math.max(AT_ONCE, move.delay) };
    }
    at.push(out.length);
    out.push({
      ...s,
      ...(j ? { id: undefined, notes: '', comments: undefined } : {}),
      ...base(keyRect(k, size), drop, k.title),
      anims: stop.anims,
      transition: trans,
      canvas: undefined,
      part: { uid, index: 0, count: 0 },
    });
  });
  // the canvas slide's own timing moves on from its last keyframe
  if (s.transition?.advanceAfter !== undefined) {
    const last = out[out.length - 1];
    last.transition = { ...(last.transition ?? { kind: 'none', dur: 0 }), advanceAfter: s.transition.advanceAfter };
  }
  out.forEach((x, i) => { x.part = { ...x.part!, index: i, count: out.length }; });
  // links to the stops' slides: by the canvas slide's id for the first, by ids of their own for the rest
  const idOf = (j: number) => (j === 0 && s.id !== undefined ? s.id : PART_IDS + uidNo * 1000 + j);
  if (homes.size) {
    stops.forEach((_, j) => {
      const x = out[at[j]];
      if (j || s.id === undefined) x.id = idOf(j);
      x.doc.bulk(() => {
        for (const cap of [...x.doc.captions.values()]) {
          const id = compoundId(plainText(cap.runs));
          const home = id ? homes.get(id) : undefined;
          if (home !== undefined && home < j) x.doc.updateCaption(cap.id, { runs: cap.runs.map((r) => ({ ...r, link: `#slide=${idOf(home)}` })) });
        }
      });
    });
  }
  // the first carries the canvas slide itself, to come back whole
  out[0].part!.keep = {
    layout: s.layout, contents: s.doc.contents(), notes: s.notes, canvas: c,
    ...(s.anims?.length ? { anims: s.anims } : {}), ...(s.transition ? { transition: s.transition } : {}), ...(s.background ? { background: s.background } : {}),
    ...(s.hideGraphics ? { hideGraphics: true } : {}), ...(s.hidden ? { hidden: true } : {}),
  };
  return out;
}

/** Ids given to a canvas slide's later slides in a file, for links to them (far past any slide's own). */
const PART_IDS = 900_000_000;

/** A deck's slides with each canvas slide split into a slide for each keyframe. */
export function splitCanvases<S extends SplitSlide>(slides: S[], master: Master, size: SlideSize): S[] {
  return slides.some((s) => s.canvas) ? slides.flatMap((s, i) => splitCanvas(s, master, size, i)) : slides;
}

// ---------------------------------------------------------------- telling PowerPoint's changes apart

/**
 * A print of what a slide holds: each shape's name, place and size and its text, in order, from
 * its shape tree. PowerPoint keeps all of these as they were when it saves a slide nobody changed.
 */
export function slidePrint(tree: Element): string {
  const bits: string[] = [];
  const walk = (el: Element) => {
    const n = el.localName;
    if (n === 'cNvPr') bits.push(`n${el.getAttribute('name') ?? ''}`);
    else if ((n === 'off' || n === 'ext') && el.parentElement?.localName === 'xfrm') bits.push(`${n}${el.getAttribute('x') ?? el.getAttribute('cx')},${el.getAttribute('y') ?? el.getAttribute('cy')}`);
    else if (n === 't' && el.namespaceURI?.includes('drawingml')) bits.push(`t${el.textContent ?? ''}`);
    for (const k of Array.from(el.children)) walk(k);
  };
  walk(tree);
  return printOf(bits);
}

/** The print's bits as a short text: how many, and an FNV-1a hash of them in hex. */
function printOf(bits: string[]): string {
  let h = 0x811c9dc5;
  const s = bits.join('\u0001');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${bits.length}.${h.toString(16)}`;
}

const unescape = (t: string) => t.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (_, hex: string, dec: string, name: string) =>
  hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name.toLowerCase()]);

/**
 * slidePrint of a shape tree as written here (well-formed, without a DOCTYPE), read straight from
 * its text: the same print, without parsing it into a document.
 */
export function slidePrintXml(xml: string): string {
  const bits: string[] = [];
  // each open element: its name, its namespaces, and its text so far
  const stack: { name: string; ns: Map<string, string>; text: string }[] = [];
  const attr = (attrs: string, name: string): string | null => {
    const m = new RegExp(`(?:^|\\s)${name.replace(':', '\\:')}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attrs);
    return m ? unescape(m[2] ?? m[3]) : null;
  };
  const tag = /<(\/?)([\w.-]+(?::[\w.-]+)?)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|<\?[^>]*\?>|<!--[\s\S]*?-->|([^<]+)/g;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    const [, close, qname, attrs = '', empty, text] = m;
    if (text !== undefined) { if (stack.length) stack[stack.length - 1].text += unescape(text); continue; }
    if (!qname) continue;
    const top = stack[stack.length - 1];
    if (close) {
      const el = stack.pop();
      if (el?.name === 't' && el.ns.get(qname.includes(':') ? qname.split(':')[0] : '')?.includes('drawingml')) bits.push(`t${el.text}`);
      continue;
    }
    const ns = new Map(top?.ns ?? []);
    for (const d of attrs.matchAll(/xmlns(?::([\w.-]+))?\s*=\s*("([^"]*)"|'([^']*)')/g)) ns.set(d[1] ?? '', unescape(d[3] ?? d[4]));
    const [prefix, local] = qname.includes(':') ? qname.split(':') : ['', qname];
    if (local === 'cNvPr') bits.push(`n${attr(attrs, 'name') ?? ''}`);
    else if ((local === 'off' || local === 'ext') && top?.name === 'xfrm') bits.push(`${local}${attr(attrs, 'x') ?? attr(attrs, 'cx')},${attr(attrs, 'y') ?? attr(attrs, 'cy')}`);
    const el = { name: local, ns, text: '' };
    if (empty) { if (local === 't' && ns.get(prefix)?.includes('drawingml')) bits.push('t'); }
    else stack.push(el);
  }
  return printOf(bits);
}
