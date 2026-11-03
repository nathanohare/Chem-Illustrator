// Drawing a document's structure in place on its page (the reverse of Presentation's click-through
// structures): the drawing tools work in a clear layer over the pages, the page under it shows
// the structure as it is drawn, and everything else on the page stays as it is until Done.
// The pages and the drawing tools keep the same zoom and scrolling, whichever of them moves.

import type { Rect } from '../geom';
import type { Contents } from '../model';

/** The drawing's view on screen: pixels per drawing point, and where its point (0, 0) is. */
export interface PlaceView { scale: number; ox: number; oy: number }

export interface InPlace {
  /** What it is (shown on the bar over the page). */
  title: string;
  /** Where the pages are on screen, in client pixels: the drawing layer covers them (not their scroll bars). */
  rect(): { left: number; top: number; width: number; height: number } | null;
  /** The drawing's view in pixels from the top left of `rect` (null once it can't be found). */
  view(): PlaceView | null;
  /** The drawing tools zoomed or scrolled to `v`: the pages follow (as near as they can go). */
  follow(v: PlaceView): void;
  /** Called when the pages scroll or zoom by themselves (scroll bars, the zoom slider): set by the drawing side. */
  moved: () => void;
  /** Show the drawing as it is now (`paint` draws it in the drawing's points); null puts the page back as it was. */
  show(paint: ((ctx: CanvasRenderingContext2D) => void) | null): void;
  /** Where clicks draw, in drawing points (`drawn` is what is drawn now): a click outside it is Done. */
  area(drawn: Rect | null): Rect;
  /** Before Done: false keeps drawing (the structure outgrew its figure and the user went back to it). */
  beforeDone?(c: Contents): Promise<boolean>;
  /** Saving, switching tabs or closing while drawing: what beforeDone would ask, done without asking (a figure grows round its structures). */
  fitNow?(c: Contents): void;
}

/** How far round a structure clicks still draw (when it isn't in a figure), in drawing points. */
export const PLACE_MARGIN = 36;

/** Two views the same to within a pixel's rounding. */
export function sameView(a: PlaceView, b: PlaceView): boolean {
  return Math.abs(a.scale - b.scale) <= 1e-4 * b.scale && Math.abs(a.ox - b.ox) < 0.75 && Math.abs(a.oy - b.oy) < 0.75;
}

/**
 * What Esc does in the structure editor (a cell's, a document's in place, or the pop-out one):
 * first it lets go of whatever the drawing tools hold (a selection, the highlight on the atom last
 * drawn, text being typed, a drag); then it cancels, asking first when something was drawn, so a
 * second Esc pressed out of habit never throws the drawing away.
 */
export function escapeAction(o: { toolsBusy: boolean; changed: boolean }): 'tools' | 'cancel' | 'ask' {
  if (o.toolsBusy) return 'tools';
  return o.changed ? 'ask' : 'cancel';
}
