// Drawing a structure turned in 3-D for the slide show's Turn in 3-D and its Key Views window:
// copies of a drawing, each with its structures turned to a view (wedges and crossings follow
// the depth, as with the Perspective tools).

import { Doc } from '../model';
import { sheetTurn, type PerspectiveTurn } from '../editor/perspective';
import type { M3 } from '../chem/perspective';
import { isSameView, type View3 } from './turn3d';

export class Turner {
  private turn: PerspectiveTurn;
  /** The middle the structures turn about, and how far their atoms reach from it (points): the room a turn can take. */
  readonly centre: { x: number; y: number };
  readonly reach: number;

  constructor(private base: Doc) {
    this.turn = sheetTurn(base, base.atoms.keys());
    const [cx, cy, cz] = this.turn.centre;
    this.centre = { x: cx, y: cy };
    let r = 0;
    for (const a of base.atoms.values()) r = Math.max(r, Math.hypot(a.x - cx, a.y - cy, (a.depth ?? 0) - cz));
    this.reach = r;
  }

  /** Whether there is anything to turn. */
  get empty(): boolean { return !this.turn.pieces.length; }

  /** A copy of the drawing with its structures turned to `view`. */
  at(view: View3): Doc {
    const d = new Doc();
    d.style = this.base.style;
    d.background = this.base.background;
    d.textStyles = this.base.textStyles;
    d.restoreContents(this.base.contents());
    if (!isSameView(view) && !this.empty) d.edit('Turn in 3-D', () => { this.turn.apply(d, view as M3); });
    return d;
  }
}
