// Dragging a row up or down a list by its grip (Settings ▸ Analysis, the Analysis panel's
// customize mode): the pointer is followed with a line where the row would go, and letting go
// moves it there. Pointer events rather than the browser's drag and drop, which the desktop app
// takes for dropping files.

/**
 * Start dragging `row`, one of `rows()` (in order down the page), from a press on its grip. On
 * letting go, `drop(from, to)` gets its old place and the place it goes (both in that list, `to`
 * counted before the row is taken out); a press that doesn't move does nothing.
 */
export function dragRow(e: PointerEvent, row: HTMLElement, rows: () => HTMLElement[], drop: (from: number, to: number) => void): void {
  if (e.button !== 0) return;
  e.preventDefault();
  const grip = e.currentTarget as HTMLElement | null;
  grip?.setPointerCapture?.(e.pointerId);
  const all = rows();
  const from = all.indexOf(row);
  if (from < 0) return;
  const y0 = e.clientY;
  let moved = false;
  let to = from;
  const mark = (at: number) => {
    for (const r of all) r.classList.remove('row-drop-before', 'row-drop-after');
    if (at === from || at === from + 1) return;
    if (at < all.length) all[at].classList.add('row-drop-before');
    else all[all.length - 1].classList.add('row-drop-after');
  };
  const move = (ev: PointerEvent) => {
    if (!moved && Math.abs(ev.clientY - y0) < 4) return;
    moved = true;
    row.classList.add('row-dragging');
    to = all.length;
    for (let i = 0; i < all.length; i++) {
      const b = all[i].getBoundingClientRect();
      if (ev.clientY < b.top + b.height / 2) { to = i; break; }
    }
    mark(to);
  };
  const up = () => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', up, true);
    row.classList.remove('row-dragging');
    mark(from);
    if (moved && to !== from && to !== from + 1) drop(from, to);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
}

/** `list` with the item at `from` moved to before place `to` (as dragRow gives them). */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const out = list.slice();
  const [x] = out.splice(from, 1);
  out.splice(to > from ? to - 1 : to, 0, x);
  return out;
}
