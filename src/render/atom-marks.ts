// Small marks on atoms that aren't part of the label: the atom number shown with the ' key,
// and the numbered diamond of a point of attachment (the . key).
//
// Where ChemDraw 25 puts an atom number was measured on Nate's PC (numbers in type 0.75 times the
// label size, LS): beside an unlabelled atom the number's near edge is 0.19 LS (left) or 0.24 LS
// (right) from the atom with its baseline about level with it, or centred 0.31 LS above or below;
// beside a label it sits at a corner of the label like a superscript or subscript, or centred
// under it. ChemDraw picks the side that is most open between the bonds (above the atom, then
// to the left, when sides are equally open) and avoids labels already there; see
// StereoPlacer.number.

import type { Atom } from '../model';
import type { Rect } from '../geom';

const CAP = 0.716; // Arial cap height / font size

export interface NumberPlace { x: number; y: number; size: number }

/** One place an atom's number can go: its direction from the atom in degrees (anticlockwise from the right). */
export interface NumberSlot { dir: number; p: NumberPlace }

/** The size of an atom number for a label size. */
export const numberSize = (labelSize: number) => 0.75 * labelSize;

/**
 * The six places an atom's number can go (the start of its baseline), around the atom or around
 * `labelBox`, the box round its label when it has one. `w` is the number's width.
 */
export function numberSlots(a: Atom, labelSize: number, w: number, labelBox?: Rect | null): NumberSlot[] {
  const L = labelSize, size = numberSize(L), cap = CAP * size;
  const at = (dir: number, x: number, y: number): NumberSlot => ({ dir, p: { x, y, size } });
  if (labelBox) {
    const b = labelBox, cx = (b.x1 + b.x2) / 2;
    // (the box is the label's capitals, from cap height to the lowest baseline)
    return [
      at(90, cx - w / 2, b.y1 - 0.38 * L),
      at(150, b.x1 - 0.1 * L - w, b.y1 + 0.1 * L),
      at(210, b.x1 - 0.063 * L - w, b.y2 + 0.27 * L),
      at(270, cx - w / 2, b.y2 + 0.92 * L),
      at(330, b.x2 + 0.063 * L, b.y2 + 0.27 * L),
      at(30, b.x2 + 0.1 * L, b.y1 + 0.1 * L),
    ];
  }
  return [
    at(90, a.x - w / 2, a.y - 0.31 * L),
    at(150, a.x - 0.19 * L - w, a.y),
    at(210, a.x - 0.19 * L - w, a.y + 0.05 * L + cap),
    at(270, a.x - w / 2, a.y + 0.31 * L + cap),
    at(330, a.x + 0.24 * L, a.y + 0.05 * L + cap),
    at(30, a.x + 0.24 * L, a.y - 0.06 * L),
  ];
}

/** Atom-map colours (Chemistry ▸ Map Atoms), one for each number in turn. */
export const MAP_COLOURS = ['#ffd27a', '#9fd3ff', '#b8e6a0', '#f7a8c4', '#c9b6f2', '#ffb48a', '#8fe0d4', '#e6e08a', '#a8b8ff', '#f2b6e6', '#c4e3b0', '#ffc2a8'];
export const mapColour = (n: number): string => MAP_COLOURS[(n - 1) % MAP_COLOURS.length];
/** ChemDraw's grey for a map number and its box. */
export const MAP_GREY = '#808080';

/** Whether an atom's number is its atom-map number (Chemistry ▸ Map Atoms), drawn in a box. */
export const isMapNumber = (a: Atom): boolean => !!a.mapNo && a.atomNumber === String(a.mapNo);

/** The space between a map number and its box. */
export const mapPad = (size: number): number => 0.3 * size;

/** The rounded box round a map number whose text starts at `p` and is `w` wide. */
export function mapBox(p: NumberPlace, w: number): Rect {
  const b = numberBox(p, w), pad = mapPad(p.size);
  return { x1: b.x1 - pad, y1: b.y1 - pad, x2: b.x2 + pad, y2: b.y2 + pad };
}

/** The box a number covers, from where its text starts (digits reach cap height and no lower). */
export function numberBox(p: NumberPlace, w: number): Rect {
  return { x1: p.x, y1: p.y - CAP * p.size, x2: p.x + w, y2: p.y };
}

/** The black diamond of a numbered point of attachment: its half-width, from the label size. */
export function attachDiamondSize(labelSize: number): number {
  return 0.6 * labelSize;
}

/** Whether an attachment point is drawn as a numbered diamond (rather than a wavy line). */
export function hasAttachDiamond(a: Atom): boolean {
  return !!a.attach && a.attachNum !== undefined && (a.attach === 'Unspecified' || a.attach === 'Diamond');
}
